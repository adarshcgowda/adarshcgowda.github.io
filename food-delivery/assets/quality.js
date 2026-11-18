(function () {
  const Q = FD.quality, S = FDStats, C = FDCharts, esc = C.esc, $ = (id) => document.getElementById(id);
  const L = Q.ledger, byRule = (r) => L.filter((x) => x.rule === r);
  const sev = (s) => `<span class="pill ${s === "error" ? "bad" : s === "warn" ? "warn" : s === "pass" ? "good" : ""}">${s}</span>`;
  const count = (k) => L.filter((x) => x.severity === k).length;

  $("kpis").innerHTML = [[L.length, "rules checked", ""], [count("error"), "errors fixed", count("error") ? "bad" : "good"], [count("warn"), "warnings handled", "warn"], [count("pass"), "checks passed clean", "good"],
    [Q.outliers.flagged, `orders flagged as outliers (|z| > ${Q.outliers.z})`, ""]].map(([v, l, c]) => `<div class="kpi ${c}"><b>${v}</b><span>${l}</span></div>`).join("");

  const evenCount = Q.uniformity.filter((u) => u.even).length;
  $("verdict").innerHTML = `<div class="callout bad"><b>Verdict: usable to demonstrate method, not to state market facts.</b> ${evenCount} of ${Q.uniformity.length} categorical tests are too even for real data, the 22 cities are statistically identical, GPS offsets take only ${Q.coords.distinct_offsets} values, and the rules relating load and festivals to lateness are close to deterministic. That pattern points to generated or heavily simulated data, so the study reports effects with that caveat.</div>`;

  // 1. ledger with filter
  let filt = "all";
  function drawLedger() {
    const rows = L.filter((r) => r.table === "orders" && (filt === "all" || r.severity === filt));
    $("ledger").innerHTML = C.table(["Rule", "Column", "Issue", "Rows", "% of rows", "What we did", "Severity"], rows.map((r) => ({ cls: r.severity, cells: [r.rule, esc(r.column), esc(r.issue), S.fmtInt(r.rows), r.pct.toFixed(2) + "%", esc(r.action), sev(r.severity)] })), { left: [1, 2, 5], nowrap0: true });
    $("sev").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.k === filt));
  }
  $("sev").innerHTML = ["all", "error", "warn", "info", "pass"].map((k) => `<button data-k="${k}" aria-pressed="false">${k}</button>`).join("");
  $("sev").onclick = (e) => { if (e.target.dataset.k) { filt = e.target.dataset.k; drawLedger(); } };
  drawLedger();

  // 2. completeness
  $("complete").innerHTML = C.table(["Field", "Missing in raw file", "Null after cleaning", "Why they differ"], Q.completeness.map((c) => {
    const why = c.field === "GPS coordinates" ? "Zeros (0.0) are GPS failures stored as numbers; nulled" : c.field === "Rider rating" ? "Plus 53 ratings of 6.0 on a 5-point scale, nulled" : c.field === "Order time (prep)" ? "Excel day-fractions and hour-24 times decoded, so only real blanks remain" : "Same blanks, now true NULLs";
    return { cells: [c.field, c.raw_missing.toFixed(2) + "%", c.clean_null.toFixed(2) + "%", esc(why)] };
  }), { left: [3] });
  const ex = byRule("OPS-13").concat(byRule("OPS-14"));
  const exTotal = ex.reduce((s, r) => s + r.rows, 0);
  $("excel").innerHTML = `<div class="callout bad"><b>${S.fmtInt(exTotal)} time values were corrupted by a spreadsheet.</b> A naive parser would have thrown away about a fifth of the prep times.</div>` + C.table(["Column", "Problem", "Rows"], ex.map((r) => ({ cells: [esc(r.column), esc(r.issue), S.fmtInt(r.rows)] })), { left: [0, 1] }) +
    `<p class="small">Fix: decode day-fractions (0.4583 is 11:00, 1 is midnight) and wrap hour 24 to 00. After decoding, prep time takes exactly three values: 5, 10 and 15 minutes.</p>`;
  $("mnar").innerHTML = C.table(["Field", "Rows missing", "Avg min if missing", "Avg min if present", "Gap", "Informative?"], Q.missing_vs_outcome.map((r) => ({ cls: r.informative ? "warn" : "", cells: [esc(r.field), S.fmtInt(r.n_missing), S.fmt1(r.avg_missing), S.fmt1(r.avg_present), (r.diff > 0 ? "+" : "") + r.diff.toFixed(1), r.informative ? '<span class="pill warn">yes</span>' : "no"] })), { left: [0] }) +
    `<p class="small">"Yes" means the 95% interval for the gap excludes zero. Festival is the standout: its missing rows average 11 minutes against 26, so those orders are a different population and are kept as their own group, not guessed.</p>`;

  // 3. even / eta / coords
  $("even").innerHTML = C.table(["Field", "Min / max count", "Chi-square", "5% limit", "Verdict"], Q.uniformity.map((u) => ({ cells: [esc(u.field), `${S.fmtInt(u.min)} / ${S.fmtInt(u.max)}`, u.chi2.toFixed(1), u.critical, u.even ? '<span class="pill bad">too even</span>' : '<span class="pill warn">near even</span>'] })), { left: [0] }) + '<p class="small">' + Q.uniformity.map((u) => esc(u.note)).join(". ") + ".</p>";
  $("eta").innerHTML = C.barH(Q.eta.map((e) => ({ label: e.factor, value: e.eta2 * 100, flag: e.eta2 < 0.005 })), { fmt: (v) => v.toFixed(2) + "%", labelW: 160 });
  const K = Q.coords;
  $("coords").innerHTML = `<div class="kpis"><div class="kpi"><b>${K.valid_pct.toFixed(1)}%</b><span>of orders have usable coordinates (zeros nulled)</span></div><div class="kpi good"><b>${K.bangalore_valid_pct.toFixed(0)}%</b><span>of Bangalore orders have usable coordinates</span></div><div class="kpi bad"><b>${K.equal_offset_pct.toFixed(0)}%</b><span>of drop-offs are offset equally in latitude and longitude</span></div><div class="kpi warn"><b>${K.distinct_offsets}</b><span>distinct offset values in total</span></div></div>` +
    `<p>Every delivery location sits a fixed diagonal step from its restaurant, so "distance" is really a ${K.distinct_offsets}-level code (${K.dist_min.toFixed(1)} to ${K.dist_max.toFixed(1)} km), not geography. It still correlates with delivery time (r = ${K.r_distance_time.toFixed(2)}), so the model uses it as an ordinal signal, with this caveat, and reports results with and without it. Restaurant coordinates do match their cities: ${byRule("OPS-12")[0].rows} of ${S.fmtInt(K.valid)} fall far from their city's centre, which validates the city codes decoded from rider IDs.</p>`;

  // 4. outliers
  const O = Q.outliers;
  $("o-note").textContent = `Robust z-score (median and MAD) within each traffic and load group; flagged above ${O.z}. ${O.flagged} orders (${(O.flagged / FD.meta.orders * 100).toFixed(2)}%) are flagged in amber. They are kept in every analysis, only marked.`;
  $("hist").innerHTML = C.columns(O.hist.map((h) => ({ label: h.bin, value: h.n, flagged: h.flagged })), { every: 2, label: "delivery time histogram", height: 210 });
  $("o-seg").innerHTML = C.table(["Segment", "Orders", "Flagged"], O.segments.map((s) => ({ cells: [esc(s.segment), S.fmtInt(s.n), s.flagged] })), { left: [0] }) + '<p class="small">Flags sit in low-load groups, where 44 to 54 minutes is unusual. The same time in a jam with several deliveries is normal and is not flagged.</p>';
  $("o-top").innerHTML = C.table(["Order", "City", "Minutes", "Traffic", "z"], O.top.map((t) => ({ cells: [esc(t.order), esc(t.city), t.minutes, esc(t.traffic), t.z.toFixed(1)] })), { left: [0, 1, 3] });

  // 5. calendar
  const cal = Q.calendar;
  $("cal-note").innerHTML = `<b>${cal.missing_days.length} days have no orders at all</b>: ${cal.missing_days[0]} to ${cal.missing_days[cal.missing_days.length - 2]} (a ten-day gap) and ${cal.missing_days[cal.missing_days.length - 1]}. Volume also alternates every other day, which is why the Monitor page pools two days.`;
  $("cal").innerHTML = C.columns(cal.days.map((d) => ({ label: d.date.slice(5), value: d.n })), { every: 7, height: 200, label: "orders per day" });
  $("calm").innerHTML = C.heat({ rows: cal.cities, cols: cal.weeks.map((w) => w.slice(5)), values: cal.matrix.map((r) => r.map((v) => (v ? v : null))), cellH: 16, labelW: 100, width: 640, label: "orders by city and week" });

  // 6. restaurants
  const R = Q.restaurants;
  $("r-ev").innerHTML = C.barH(R.evidence.map((e) => ({ label: e.band + " reviews", value: e.n, flag: e.band === "0" || e.band === "1-9" })), { labelW: 120 });
  $("r-cost").innerHTML = C.columns(R.cost_hist.map((c) => ({ label: c.bin >= 2000 ? "2k+" : c.bin, value: c.n })), { every: 3, height: 190 });
  $("r-note").textContent = `Tukey fence on the log scale: costs above Rs ${S.fmtInt(R.cost_fence)} are flagged (cost_outlier). They are legitimate fine-dining prices, so they are kept and flagged.`;
  $("r-ledger").innerHTML = C.table(["Rule", "Issue", "Rows", "% of listings", "What we did"], L.filter((r) => r.table === "restaurants").map((r) => ({ cls: r.severity, cells: [r.rule, esc(r.issue), S.fmtInt(r.rows), r.pct.toFixed(2) + "%", esc(r.action)] })), { left: [1, 4], nowrap0: true });
})();
