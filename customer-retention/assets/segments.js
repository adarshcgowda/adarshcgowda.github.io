(function () {
  const { RT, P, C, esc, fmtN, pct, gbp, gbp2, SEG_COLOR, SEG_NOTE, filterOptions, asOfOptions, legend } = APP, $ = (id) => document.getElementById(id), H = APP.readHash();
  const ends = APP.monthEnds(), HS = [30, 60, 90, 180];
  const st = { asof: ends.includes(H.asof) ? H.asof : "2011-03-31", h: HS.includes(+H.h) ? +H.h : 90, f: ["all", "uk", "other"].includes(H.f) ? H.f : "all", from: H.from };

  function controls() {
    $("controls").innerHTML = `<label>Snapshot at<select id="asof">${asOfOptions(st.asof)}</select></label>
      <label>Look ahead<select id="h">${HS.map((n) => `<option value="${n}"${n === st.h ? " selected" : ""}>${n} days</option>`).join("")}</select></label>
      <label>Customers<select id="f">${filterOptions(st.f)}</select></label>`;
    ["asof", "h", "f"].forEach((id) => $(id).onchange = () => { st.asof = $("asof").value; st.h = +$("h").value; st.f = $("f").value; st.from = null; render(); });
  }
  const addMonths = (iso, k) => { const i = ends.indexOf(iso) - k; return ends[Math.max(0, i)]; };

  function render() {
    const asof = RT.dayOfIso(st.asof);
    APP.writeHash({ asof: st.asof, h: st.h, f: st.f, from: st.from });
    const s = RT.segmentSummary(P, asof, st.h, st.f), SEG = RT.SEGMENTS, a = s.segments;
    const totRev = SEG.reduce((x, g) => x + a[g].revenue, 0), totAct = SEG.reduce((x, g) => x + a[g].active, 0), totFut = SEG.reduce((x, g) => x + a[g].future_revenue, 0);
    const date = RT.monthLabel(RT.monthOfDay(asof));
    $("kpis").innerHTML = [[fmtN(s.total), "customers scored (ordered by end of " + date + ")", ""], s.forward ? [pct(totAct / s.total), `ordered again in the next ${st.h} days`, "warn"] : ["n/a", "look-ahead not fully observed", "bad"],
      s.forward ? [gbp(totFut / 100), `revenue in the next ${st.h} days`, ""] : ["n/a", "", ""]].map(([v, l, c]) => `<div class="kpi ${c}"><b>${v}</b><span>${l}</span></div>`).join("");

    const rows = SEG.map((g) => ({ g, ...a[g] })), base = s.forward ? totAct / s.total : null;
    $("table").innerHTML = C.table(["Segment", "What it means", "Customers", "Revenue so far", s.forward ? `Ordered in next ${st.h} days` : "Next-period activity", s.forward ? "Next-period revenue per customer" : "", s.forward ? "Lift" : ""].filter((h, i) => s.forward || i < 4),
      rows.map((r) => {
        const cells = [`<b style="color:${SEG_COLOR[r.g]}">&#9632;</b> <b>${r.g}</b>`, esc(SEG_NOTE[r.g]), `${fmtN(r.customers)} (${pct(r.customers / s.total)})`, `${gbp(r.revenue / 100)} (${pct(r.revenue / totRev)})`];
        if (s.forward) cells.push(r.customers ? pct(r.active / r.customers) : "n/a", r.customers ? gbp2(r.future_revenue / 100 / r.customers) : "n/a", r.customers ? (r.active / r.customers / base).toFixed(1) + "×" : "n/a");
        return { cells };
      }), { left: [0, 1] });
    if (s.forward) {
      const ch = a.Champions, lo = a.Lost, ar = a["At risk"];
      const chp = ch.customers ? ch.active / ch.customers : null, lop = lo.customers ? lo.active / lo.customers : null, ratio = chp != null && lop ? chp / lop : 1;
      $("verdict").innerHTML = chp != null && lop != null ? `<div class="callout ${ratio >= 1.5 ? "good" : ""}"><b>Do the segments predict?</b> ${ratio >= 2 ? "Yes, strongly" : ratio >= 1.2 ? "Somewhat" : "Not here"}: ${pct(chp)} of Champions ordered again within ${st.h} days, against ${pct(lop)} of Lost customers (${lop ? (chp / lop).toFixed(0) + "×" : "far"} as many). The scores were calculated using only orders up to the snapshot date; the “next ${st.h} days” column is what happened afterwards.${ar.customers ? ` At risk customers, who used to buy often, came back ${pct(ar.active / ar.customers)} of the time: the group where a nudge has the most to win.` : ""}</div>` : "";
    } else $("verdict").innerHTML = `<div class="callout bad"><b>No look-ahead for this date.</b> The data ends on 9 Dec 2011, so ${st.h} days after ${date} is not fully observed. Choose an earlier snapshot or a shorter look-ahead.</div>`;

    $("act-title").textContent = s.forward ? `Share who ordered in the next ${st.h} days` : "Customers per segment";
    $("act").innerHTML = C.barH(rows.map((r) => ({ label: r.g, value: s.forward ? (r.customers ? r.active / r.customers : 0) : r.customers, color: SEG_COLOR[r.g], note: fmtN(r.customers) + " customers" })), { fmt: s.forward ? (v) => pct(v) : fmtN, max: s.forward ? 1 : undefined, labelW: 130, width: 480, label: "Activity by segment" });
    $("share-title").textContent = s.forward ? `Share of the next ${st.h} days' revenue` : "Share of revenue so far";
    $("share").innerHTML = C.barH(rows.map((r) => ({ label: r.g, value: s.forward ? (totFut ? r.future_revenue / totFut : 0) : r.revenue / totRev, color: SEG_COLOR[r.g], note: s.forward ? `${pct(r.customers / s.total)} of customers` : "" })),
      { fmt: (v) => pct(v), max: 1, labelW: 130, width: 480, label: "Revenue share by segment" });

    // migration
    const fromOpts = ends.filter((d) => d < st.asof);
    if (!st.from || !fromOpts.includes(st.from)) st.from = addMonths(st.asof, 6) < st.asof ? addMonths(st.asof, 6) : fromOpts[0];
    $("from").innerHTML = fromOpts.map((d) => `<option value="${d}"${d === st.from ? " selected" : ""}>${RT.monthLabel(RT.monthOfDay(RT.dayOfIso(d)))} (end)</option>`).join("");
    $("from").onchange = () => { st.from = $("from").value; render(); };
    if (!fromOpts.length) { $("mig").innerHTML = '<p class="muted">Choose a later snapshot to compare with an earlier one.</p>'; $("mig-note").textContent = ""; }
    else {
      const m = RT.migration(P, RT.dayOfIso(st.from), asof, st.f), rowsN = ["Not yet a customer"].concat(SEG), tot = {};
      rowsN.forEach((r) => { tot[r] = SEG.reduce((x, c) => x + (m[r + "|" + c] || 0), 0); });
      const vals = rowsN.map((r) => SEG.map((c) => (tot[r] ? (m[r + "|" + c] || 0) / tot[r] : null)));
      $("mig").innerHTML = C.heat({ rows: rowsN.map((r) => r + " (" + fmtN(tot[r]) + ")"), cols: SEG.map((c) => c), values: vals, width: 1000, labelW: 210, cellH: 30, fmt: (v) => pct(v), cellText: (v) => Math.round(v * 100) + "%", cellMinW: 40, cellFont: 11, label: "Segment migration" });
      const stay = ["Champions", "Loyal", "Needs attention", "At risk", "Hibernating", "Lost"].filter((g) => tot[g] > 0).map((g) => ({ g, v: (m[g + "|" + g] || 0) / tot[g] })).sort((x, y) => x.v - y.v);
      const ch = tot.Champions ? (m["Champions|Champions"] || 0) / tot.Champions : null;
      $("mig-note").textContent = `Each row is where customers were at the end of ${RT.monthLabel(RT.monthOfDay(RT.dayOfIso(st.from)))}; each column is where the same customers are at the end of ${date}. ${ch != null ? `${pct(ch)} of Champions are still Champions. ` : ""}${stay.length ? `Among established segments the least sticky is ${stay[0].g} (${pct(stay[0].v)} unchanged); New and Promising customers cannot stay as they are, because time passes. ` : ""}Segments are relative (scores are ranks among customers at that date), so some movement is simply others overtaking.`;
    }

    $("rules").innerHTML = `<p><b>Recency</b> and <b>spend</b> are scored 1 to 5 by rank (quintiles of customers at the snapshot date, ties broken by customer ID). <b>Frequency</b> uses fixed bins instead, because most customers have one or two visits and quintiles would split identical customers arbitrarily: 1 visit = 1, 2 = 2, 3 to 4 = 3, 5 to 9 = 4, 10 or more = 5. A <em>visit</em> is a customer on one day. Segments use recency (R) and frequency (F):</p>` +
      C.table(["Segment", "Rule", "Meaning"], [["Champions", "R ≥ 4 and F ≥ 4"], ["Loyal", "R ≥ 3 and F ≥ 3 (not Champions)"], ["New", "R ≥ 4 and F = 1"], ["Promising", "R ≥ 4 and F = 2"], ["Needs attention", "R = 3 and F ≤ 2"], ["At risk", "R ≤ 2 and F ≥ 3"], ["Hibernating", "R = 2 and F ≤ 2"], ["Lost", "R = 1 and F ≤ 2"]].map(([g, r]) => ({ cells: [`<b style="color:${SEG_COLOR[g]}">&#9632;</b> ${g}`, r, esc(SEG_NOTE[g])] })), { left: [0, 1, 2] }) +
      '<p class="small">The same scoring is written in SQL (<code>sql/rfm_asof.sql</code>) and checked against this page\'s numbers in the tests. Scores are ranks at each date, so segments describe relative standing, not absolute behaviour.</p>';
  }
  controls(); render();
})();
