(function () {
  const { RT, P, C, esc, fmtN, pct, gbp, filterOptions, legend } = APP, $ = (id) => document.getElementById(id), H = APP.readHash(), HZ = 11;
  const st = { f: ["all", "uk", "other"].includes(H.f) ? H.f : "all" };
  $("controls").innerHTML = `<label>Customers<select id="f">${filterOptions(st.f)}</select></label>`;
  $("f").onchange = () => { st.f = $("f").value; render(); };
  const L = (m) => RT.monthLabel(m), money = (v) => "£" + Math.round(v).toLocaleString("en-US");

  function render() {
    APP.writeHash({ f: st.f });
    const fc = RT.ltvForecast(P, st.f, HZ, 3), bt = RT.ltvBacktest(P, st.f), sc = RT.backtestScores(bt);
    // The headline only uses cohorts with six or more months of history, because forecasts from fewer months were far less accurate in the backtest.
    const MIN_MONTHS = 6, ok = fc.rows.filter((r) => r.projected != null && r.k + 1 >= MIN_MONTHS), n = ok.reduce((s, r) => s + r.size, 0);
    const avg = n ? ok.reduce((s, r) => s + r.projected * r.size, 0) / n : null;
    const cl = RT.backtestScores(bt.filter((r) => r.k + 1 >= MIN_MONTHS)).chain_ladder, adj = avg != null && cl.bias != null ? avg / (1 + cl.bias) : null;
    $("headline").innerHTML = avg == null ? "" : `<div class="callout good"><b>Headline.</b> A customer won in the first half of 2011 is projected to spend about <b>${money(avg)}</b> in their first twelve months (customer-weighted across the ${ok.length} cohorts with at least ${MIN_MONTHS} months of history, ${fmtN(n)} customers). Backtested on comparable past forecasts, the method was typically ${cl.mape != null ? "within " + pct(cl.mape) : "unchecked"} of the true figure${cl.bias != null ? (Math.abs(cl.bias) < 0.02 ? ", with little bias" : cl.bias < 0 ? `, tending to under-forecast by ${pct(-cl.bias)}` : `, tending to over-forecast by ${pct(cl.bias)}`) : ""}.${adj != null && Math.abs(cl.bias) >= 0.02 ? ` If that bias repeats, a fairer figure is about <b>${money(adj)}</b>; treat the truth as somewhere between the two.` : ""} Younger cohorts are projected in the table below but with much wider error.</div>`;

    // 1. factors
    const f = fc.factors, cols = f.map((v, j) => ({ label: `${j}→${j + 1}`, value: v == null ? 0 : v - 1 }));
    $("f-note").textContent = `Each bar shows how much a cohort's cumulative revenue per customer grows from one month of age to the next, across all cohorts that have lived that long (a factor of 1.12 shows as 12%). Growth is steepest early and flattens as the cohort's remaining customers become the loyal few. Age 0 is the month of the first order.`;
    $("factors").innerHTML = C.columns(cols.map((c) => ({ label: c.label, value: c.value })), { fmt: (v) => pct(v), height: 190, width: 800, label: "Month-to-month growth in cumulative revenue per customer" });

    // 2. projections
    $("p-note").textContent = `Cohorts that have not yet lived twelve months (months 0 to ${HZ}). Known spending so far is in teal; the projected remainder, using the growth above, is in amber. Cohorts younger than three months are not projected: a single month says too little.`;
    $("proj").innerHTML = C.table(["Cohort", "Customers", "Months observed", "Spent so far (per customer)", "", "Projected first year", "Share still to come"],
      fc.rows.map((r) => {
        const have = r.known, tot = r.projected, w = tot ? Math.min(1, have / tot) : null;
        const bar = tot ? `<div class="bar2" style="width:140px"><span style="width:${(100 * w).toFixed(0)}%;background:#2dd4bf"></span><span style="width:${(100 * (1 - w)).toFixed(0)}%;background:#fbbf24"></span></div>` : "";
        return { cells: [L(r.cohort), fmtN(r.size), r.k + 1, money(have), bar, tot ? money(tot) : '<span class="muted">too early</span>', tot ? pct(1 - w) : ""] };
      }), { left: [0] });

    // 3. backtest
    const lab = { chain_ladder: "Growth pattern (this method)", run_rate: "Straight-line run rate", so_far: "Assume no more spending" };
    $("b-note").textContent = `We rewind to each month from ${L(Math.min(...bt.map((r) => r.origin)))} to ${L(Math.max(...bt.map((r) => r.origin)))}, pretend we only know the data up to then, forecast the first-year value of every cohort that was 3 to 10 months old, and compare with what those cohorts really spent. ${bt.length} forecasts in all.`;
    $("scores").innerHTML = C.table(["Method", "Forecasts", "Typical error (MAPE)", "Bias (+ over, − under)"], Object.keys(lab).map((k) => ({ cls: k === "chain_ladder" ? "pass" : "", cells: [lab[k], sc[k].n, sc[k].mape == null ? "n/a" : pct(sc[k].mape, 1), sc[k].bias == null ? "n/a" : (sc[k].bias >= 0 ? "+" : "−") + pct(Math.abs(sc[k].bias), 1)] })), { left: [0] }) +
      '<p class="small">MAPE is the mean absolute percentage error. The no-growth and run-rate methods are the simple things people actually do; the pattern method should beat them to be worth using.</p>';
    const ageBuckets = [["4 to 5 months", 4, 5], ["6 to 8 months", 6, 8], ["9 to 11 months", 9, 11]];
    $("age").innerHTML = C.table(["Months of data when forecast", "Forecasts", "Growth pattern", "Run rate", "No more spending"], ageBuckets.map(([t, lo, hi]) => {
      const rr = bt.filter((r) => r.k + 1 >= lo && r.k + 1 <= hi), s2 = RT.backtestScores(rr), m = (k) => (s2[k].mape == null ? "n/a" : pct(s2[k].mape, 0));
      return { cells: [t, rr.length, m("chain_ladder"), m("run_rate"), m("so_far")] };
    }), { left: [0] }) + '<p class="small">The younger the cohort when forecast, the larger the error: forecasts made after only a few months deserve the widest range.</p>';
    const by = {};
    bt.forEach((r) => (by[r.origin] = (by[r.origin] || []).concat(r)));
    $("origins").innerHTML = C.table(["Forecast made at end of", "Cohorts checked", "Growth pattern", "Run rate", "No more spending"], Object.keys(by).map(Number).sort((a, b) => a - b).map((o) => {
      const s = RT.backtestScores(by[o]), m = (k) => (s[k].mape == null ? "n/a" : pct(s[k].mape, 0));
      return { cells: [L(o), by[o].length, m("chain_ladder"), m("run_rate"), m("so_far")] };
    }), { left: [0] }) + '<p class="small">Error (MAPE) at each forecast date. Early dates learn the late months of a cohort\'s life from very few older cohorts, so they are less reliable.</p>';
    $("rows").innerHTML = C.table(["Forecast at", "Cohort", "Age (months)", "Actual first year", "Growth pattern", "Run rate", "No more spending"], bt.map((r) => ({ cells: [L(r.origin), L(r.cohort), r.k + 1, money(r.actual), r.chain_ladder == null ? "n/a" : money(r.chain_ladder), money(r.run_rate), money(r.so_far)] })), { left: [0, 1] });
  }
  render();
})();
