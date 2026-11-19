(function () {
  const { RT, Q, C, esc, fmtN, pct, gbp } = APP, $ = (id) => document.getElementById(id), L = Q.ledger, M = Q.monthly;
  const sev = (s) => `<span class="pill ${s === "error" ? "bad" : s === "warn" ? "warn" : s === "pass" ? "good" : ""}">${s}</span>`;
  const guestRev = M.reduce((s, m) => s + m.guest_revenue, 0), idRev = M.reduce((s, m) => s + m.revenue, 0), by = (r) => L.find((x) => x.rule === r);

  $("kpis").innerHTML = [[fmtN(Q.raw_rows), "raw rows in the file", ""], [fmtN(Q.orders), "orders kept (merchandise only)", "good"], [fmtN(Q.concentration.customers), "identified customers", "good"], [pct(guestRev / (guestRev + idRev)), "of revenue is guest checkouts (not analysed)", "warn"], [gbp(Q.returns_value), "of merchandise was cancelled (not netted off)", "warn"]]
    .map(([v, l, c]) => `<div class="kpi ${c}"><b>${v}</b><span>${l}</span></div>`).join("");
  $("verdict").innerHTML = `<div class="callout"><b>Verdict: real data, usable, with four structural limits.</b> (1) ${pct(guestRev / (guestRev + idRev))} of merchandise revenue comes from guest checkouts that cannot be followed over time, so every customer figure describes identified customers only. (2) The history begins in December 2009, so ${fmtN(Q.monthly[0].new)} customers already active then look new. (3) December 2011 ends on the 9th, so the last month is left out of retention. (4) Many customers are wholesalers, so patterns need not match consumer retail.</div>`;

  // funnel: raw rows -> analysis rows
  const steps = [["Raw rows in the file", Q.raw_rows, ""], ["Duplicate copies (sheets overlap)", -(by("RET-01").rows), "RET-01"], ["Cancellation lines", -(by("RET-04").rows), "RET-04"], ["Non-merchandise lines", -(by("RET-05").rows), "RET-05"],
    ["Zero or negative quantity", -(by("RET-06").rows), "RET-06"], ["Zero or negative price", -(by("RET-07").rows), "RET-07"]];
  let left = Q.raw_rows;
  const rows = steps.map(([t, n, r]) => { if (n < 0) left += n; return { cells: [esc(t), n < 0 ? "−" + fmtN(-n) : fmtN(n), fmtN(left), r] }; });
  rows.push({ cls: "pass", cells: ["Sale lines kept", "", fmtN(Q.sale_lines), ""] });
  const g = by("RET-08");
  rows.push({ cells: [`of which guest checkouts (kept in totals, excluded from customer measures)`, fmtN(g.rows), fmtN(Q.sale_lines - g.rows) + " identified", "RET-08"] });
  $("funnel").innerHTML = C.table(["Step", "Rows", "Rows remaining", "Rule"], rows, { left: [0, 3] });

  let filt = "all";
  function drawLedger() {
    const rs = L.filter((r) => filt === "all" || r.severity === filt);
    $("ledger").innerHTML = C.table(["Rule", "Issue", "Rows", "% of rows", "Value", "What we did", "Severity"], rs.map((r) => ({ cls: r.severity, cells: [r.rule, esc(r.issue), fmtN(r.rows), r.pct.toFixed(2) + "%", r.value == null ? "" : gbp(r.value), esc(r.action), sev(r.severity)] })), { left: [1, 5], nowrap0: true });
    $("sev").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.k === filt));
  }
  $("sev").innerHTML = ["all", "error", "warn", "info", "pass"].map((k) => `<button data-k="${k}" aria-pressed="false">${k}</button>`).join("");
  $("sev").onclick = (e) => { if (e.target.dataset.k) { filt = e.target.dataset.k; drawLedger(); } };
  drawLedger();

  // limits of the history
  const lab = (m) => RT.monthLabel(m), tick = (i) => lab(M[i].month).replace(" 20", " ’");
  $("cens-note").textContent = `${fmtN(M[0].new)} “new” customers in December 2009 against about ${fmtN(Math.round(M.slice(1, 13).reduce((s, m) => s + m.new, 0) / 12))} in a typical month after: most were already customers before the data starts. The first cohort is shown with an asterisk and left out of averages.`;
  $("cens").innerHTML = C.columns(M.filter((m) => m.month <= 23).map((m) => ({ label: m.month % 3 === 0 ? tick(m.month) : "", value: m.new, flagged: m.month === 0 ? m.new : 0 })), { fmt: fmtN, height: 200, width: 520, label: "New customers per month" });
  $("part-note").textContent = `December 2011 stops on the 9th (${fmtN(M[24].orders)} orders so far), and December 2010 has no trading after about the 23rd. Incomplete months are excluded from cohort tables.`;
  $("part").innerHTML = C.columns(M.map((m) => ({ label: m.month % 3 === 0 ? tick(m.month) : "", value: m.orders, flagged: m.month === 24 ? m.orders : 0 })), { fmt: fmtN, height: 200, width: 520, label: "Orders per month" });

  $("ctry").innerHTML = C.barH(Q.countries.map((c) => ({ label: c.country, value: c.share })), { fmt: (v) => pct(v, 1), max: 1, labelW: 120, width: 460, label: "Revenue share by country" }) +
    `<p class="small">The United Kingdom is ${pct(Q.countries[0].share)} of revenue, so the “outside the UK” filter rests on far fewer customers.</p>`;
  $("guest-note").textContent = `Orders with no customer ID. They are kept in revenue totals but cannot be tied to anyone, so they never appear in cohorts, segments or lifetime value.`;
  $("guest").innerHTML = C.multiline({ x: M.filter((m) => m.month <= 23).map((m) => lab(m.month)), series: [{ name: "guest share", color: C.COL.amber, points: M.filter((m) => m.month <= 23).map((m) => m.guest_revenue / (m.guest_revenue + m.revenue)) }], fmt: (v) => pct(v), yMin: 0, height: 180, legend: false,
    xticks: M.filter((m) => m.month <= 23).map((m, i) => ({ i, label: tick(i) })).filter((_, i) => i % 4 === 0), label: "Guest share of revenue per month" });
  $("visits").innerHTML = C.columns(Q.visits_hist.map((v, i) => ({ label: i === 11 ? "12+" : String(i + 1), value: v })), { fmt: fmtN, height: 190, width: 520, label: "Customers by number of visits" });
  const bins = Q.order_value_bins, bl = bins.slice(0, -1).map((b, i) => (i === bins.length - 2 ? "£" + (b >= 1000 ? b / 1000 + "k" : b) + "+" : "£" + (b >= 1000 ? b / 1000 + "k" : b)));
  $("values").innerHTML = C.columns(Q.order_value_hist.map((v, i) => ({ label: bl[i], value: v })), { fmt: fmtN, height: 190, width: 520, label: "Orders by value" });
})();
