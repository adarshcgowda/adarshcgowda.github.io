(function () {
  const { RT, P, C, esc, fmtN, pct, gbp, filterOptions } = APP, $ = (id) => document.getElementById(id), H = APP.readHash();
  const MEASURES = { retention: "Retention: share of the cohort who ordered in that period", revenue: "Cumulative revenue per customer", visits: "Cumulative visits per customer" };
  const st = { g: H.g === "3" ? 3 : 1, m: MEASURES[H.m] ? H.m : "retention", f: ["all", "uk", "other"].includes(H.f) ? H.f : "all", first: H.first === "1" };

  function controls() {
    $("controls").innerHTML = `<label>Cohorts are<select id="g"><option value="1"${st.g === 1 ? " selected" : ""}>Months</option><option value="3"${st.g === 3 ? " selected" : ""}>Three-month blocks</option></select></label>
      <label>Measure<select id="m">${Object.keys(MEASURES).map((k) => `<option value="${k}"${k === st.m ? " selected" : ""}>${MEASURES[k]}</option>`).join("")}</select></label>
      <label>Customers<select id="f">${filterOptions(st.f)}</select></label>
      <label style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" id="first"${st.first ? " checked" : ""}> include the first cohort in averages</label>`;
    ["g", "m", "f"].forEach((id) => $(id).onchange = () => { st.g = +$("g").value; st.m = $("m").value; st.f = $("f").value; render(); });
    $("first").onchange = () => { st.first = $("first").checked; render(); };
  }

  const unit = () => (st.g === 1 ? "month" : "three-month block");
  const fmtCell = { retention: (v) => pct(v), revenue: (v) => "£" + Math.round(v).toLocaleString("en-US"), visits: (v) => v.toFixed(1) };
  const short = { retention: (v) => Math.round(v * 100), revenue: (v) => (v >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.round(v)), visits: (v) => v.toFixed(1) };

  /** Customer-weighted average of a measure at each age over the chosen cohorts. */
  function average(t, measure, from) {
    const mat = t[measure], out = [];
    for (let k = 0; ; k++) {
      let num = 0, den = 0, cohorts = 0;
      t.cohorts.forEach((c, a) => { if (a >= from && mat[a].length > k) { num += mat[a][k] * t.size[a]; den += t.size[a]; cohorts++; } });
      if (cohorts < 3) break;  // ages seen in fewer than three cohorts are too noisy to average
      out.push({ k, v: num / den, n: den, cohorts });
    }
    return out;
  }

  function render() {
    APP.writeHash({ g: st.g, m: st.m, f: st.f, first: st.first ? 1 : "" });
    const t = RT.cohortTable(P, st.g, st.f), from = st.first ? 0 : 1, mat = t[st.m], start = st.m === "retention" ? 1 : 0;
    const rowsShown = t.cohorts.map((c, a) => a).filter((a) => mat[a].length > start);  // the newest cohort has no follow-up yet for retention
    const labels = rowsShown.map((a) => RT.periodLabel(t.cohorts[a], st.g) + (a === 0 ? "*" : "") + " (" + fmtN(t.size[a]) + ")");
    const maxK = Math.max(...mat.map((r) => r.length));
    const cols = []; for (let k = start; k < maxK; k++) cols.push(String(k));
    $("t-title").textContent = MEASURES[st.m];
    $("t-sub").textContent = `Rows are cohorts (customers in brackets); columns are ${unit()}s after the cohort's first ${unit()}. * marks the first cohort: customers already active when the data starts. Darker means higher.`;
    $("heat").innerHTML = C.heat({ rows: labels, cols: cols, values: rowsShown.map((a) => cols.map((c) => (+c < mat[a].length ? mat[a][+c] : null))), width: 1000, cellH: st.g === 1 ? 22 : 34, labelW: 190, fmt: fmtCell[st.m],
      cellText: (v) => short[st.m](v), cellMinW: 34, cellFont: 10, label: MEASURES[st.m] });

    const avg = average(t, st.m, from), kShow = avg.filter((a) => a.k >= start);
    const x = kShow.map((a) => String(a.k)), isRet = st.m === "retention";
    $("avg").innerHTML = C.multiline({ x: x, series: [{ name: "average", color: C.COL.teal, points: kShow.map((a) => a.v) }], fmt: (v) => (isRet ? pct(v) : st.m === "revenue" ? gbp(v) : v.toFixed(1)), yMin: 0, height: 220, legend: false,
      xticks: kShow.map((a, i) => ({ i, label: String(a.k) })).filter((_, i) => i % (st.g === 1 ? 3 : 1) === 0), label: "Average by age" });
    const a1 = avg.find((a) => a.k === 1), a3 = avg.find((a) => a.k === (st.g === 1 ? 3 : 2)), a12 = avg.find((a) => a.k === (st.g === 1 ? 11 : 3));
    let note = "";
    if (isRet && a1) note = `On average ${pct(a1.v)} of a cohort orders again in the next ${unit()}${a3 ? `, ${pct(a3.v)} in ${unit()} ${a3.k}` : ""}${a12 ? ` and ${pct(a12.v)} in ${unit()} ${a12.k}` : ""}. Only ages seen in at least three cohorts are plotted; the last one rests on ${kShow.length ? kShow[kShow.length - 1].cohorts + " cohorts and " + fmtN(kShow[kShow.length - 1].n) + " customers" : "few cohorts"}.`;
    else if (a12) note = `By ${unit()} ${a12.k} a customer has on average ${st.m === "revenue" ? gbp(a12.v) + " of cumulative revenue" : a12.v.toFixed(1) + " cumulative visits"}. ${a12.k >= 1 ? "This is customer-weighted across " + fmtN(a12.n) + " customers." : ""}`;
    $("avg-note").textContent = note;

    // per-cohort trend at fixed ages
    const age1 = 1, age3 = st.g === 1 ? 3 : 2;
    const items = t.cohorts.map((c, a) => ({ c, a, r1: t.retention[a][age1], r3: t.retention[a][age3] })).filter((x) => x.a >= from);
    const s1 = items.filter((x) => x.r1 != null), s3 = items.filter((x) => x.r3 != null);
    $("trend").innerHTML = C.multiline({ x: s1.map((x) => RT.periodLabel(x.c, st.g)), series: [{ name: "Next " + unit(), color: C.COL.teal, points: s1.map((x) => x.r1) }, { name: unit() + " " + age3, color: C.COL.amber, points: s1.map((x) => x.r3 == null ? null : x.r3) }],
      fmt: (v) => pct(v), yMin: 0, height: 220, legend: false, xticks: s1.map((_, i) => ({ i, label: RT.periodLabel(s1[i].c, st.g).replace(/ 20(\d\d)/, " ’$1") })).filter((_, i) => i % (st.g === 1 ? 4 : 2) === 0), label: "Retention at fixed ages by cohort" }) +
      APP.legend([[C.COL.teal, "Ordered again in the next " + unit()], [C.COL.amber, "Ordered in " + unit() + " " + age3]]);
    if (s1.length > 2) {
      const half = Math.floor(s1.length / 2), m = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
      $("trend-note").textContent = `Early cohorts (first half) retain ${pct(m(s1.slice(0, half).map((x) => x.r1)))} in the next ${unit()}, later ones ${pct(m(s1.slice(half).map((x) => x.r1)))}. Cohorts that start in the run-up to winter see very different follow-up months from spring ones, so compare cohorts of the same season where you can.`;
    } else $("trend-note").textContent = "Too few cohorts to compare.";
  }
  controls(); render();
})();
