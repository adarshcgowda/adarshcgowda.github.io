(function () {
  const { RT, P, Q, C, esc, fmtN, pct, gbp, FILTERS, filterOptions, legend } = APP, $ = (id) => document.getElementById(id), K = Q.concentration;
  const H = APP.readHash();
  const first90 = RT.repeatCurve(P, 1, 90, "all"), guestShare = Q.monthly.reduce((s, m) => s + m.guest_revenue, 0) / (Q.monthly.reduce((s, m) => s + m.guest_revenue + m.revenue, 0));
  $("kpis").innerHTML = [[fmtN(K.customers), "identified customers", ""], [fmtN(K.visits), "visits (a customer on a day)", ""], [gbp(K.revenue), "merchandise revenue from them", ""],
    [pct(first90.share), "came back within 90 days of a first visit", "warn"], [pct(K.top10), "of revenue from the top 10% of customers", "warn"]].map(([v, l, c]) => `<div class="kpi ${c}"><b>${v}</b><span>${l}</span></div>`).join("");

  // 1. monthly new vs returning
  const ms = Q.monthly.filter((m) => m.month <= 23), x = ms.map((m) => RT.monthLabel(m.month));
  const ticks = ms.map((m, i) => i).filter((i) => i % 3 === 0).map((i) => ({ i, label: RT.monthLabel(ms[i].month).replace(" 20", " ’") }));
  const peak = ms.reduce((a, m) => (m.active > a.active ? m : a), ms[0]);
  $("m-note").textContent = `Active customers each month, split into those making their first-ever purchase here and those who had bought before. From spring 2010 onwards returning customers make up most of each month (in December 2009 everyone looks new simply because the data starts there). Activity peaks in ${RT.monthLabel(peak.month)} with ${fmtN(peak.active)} customers: gift-ware sells towards the winter.`;
  $("monthly").innerHTML = C.multiline({ x, series: [{ name: "Returning", color: C.COL.teal, points: ms.map((m, i) => (i === 0 ? null : m.returning)) }, { name: "New", color: C.COL.amber, points: ms.map((m) => m.new) }],
    fmt: (v) => fmtN(v), yMin: 0, height: 230, legend: false, xticks: ticks, label: "Active customers per month, new and returning" }) + legend([[C.COL.teal, "Returning customers"], [C.COL.amber, "New customers"]]);

  // 2. repeat curve
  $("f").innerHTML = filterOptions(H.f || "all"); $("h").value = ["30", "90", "180"].includes(H.h) ? H.h : "90";
  function repeat() {
    const h = +$("h").value, f = $("f").value;
    APP.writeHash({ h: h, f: f });
    const rows = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ n, r: RT.repeatCurve(P, n, h, f) })).filter((x) => x.r.base >= 30);
    const lab = (n) => (n === 1 ? "After 1st visit" : n === 2 ? "After 2nd visit" : n === 3 ? "After 3rd visit" : "After " + n + "th visit");
    $("repeat").innerHTML = C.barH(rows.map((x) => ({ label: lab(x.n), value: x.r.share, note: fmtN(x.r.base) + " customers observed long enough", color: x.n === 1 ? C.COL.amber : C.COL.teal })), { fmt: (v) => pct(v), max: 1, labelW: 130, label: "Share who visit again" });
    const a = rows[0].r.share, b = rows.length > 1 ? rows[1].r.share : null;
    $("r-note").textContent = `Of customers whose first visit was at least ${h} days before the data ends, ${pct(a)} came back within ${h} days${b != null ? `; after a second visit that rises to ${pct(b)}` : ""}. Only customers who could have been observed for the full ${h} days are counted, so recent customers do not drag the figure down.`;
  }
  $("h").onchange = $("f").onchange = repeat; repeat();

  // 3. concentration
  $("conc").innerHTML = C.barH([{ label: "Top 1% of customers", value: K.top1 }, { label: "Top 10%", value: K.top10 }, { label: "Top 20%", value: K.top20 }, { label: "Customers with 2+ visits", value: K.repeat_revenue_share, color: C.COL.blue }],
    { fmt: (v) => pct(v), max: 1, width: 440, labelW: 150, label: "Revenue share" });
  $("conc-note").innerHTML = `<p>The top 1% of customers (${fmtN(Math.max(1, Math.floor(K.customers * 0.01)))} accounts) bring ${pct(K.top1)} of revenue and the top 10% bring ${pct(K.top10)}. Customers with at least two visits account for ${pct(K.repeat_revenue_share)} of revenue, so keeping existing customers matters far more than the count of new ones suggests.</p>` +
    `<p class="small">Revenue is merchandise only, for identified customers. Guest checkouts add a further ${pct(guestShare)} of merchandise revenue that cannot be tied to anyone.</p>`;

  // 4. links
  $("next").innerHTML = [["cohorts.html", "Cohorts", "Group customers by first month and watch how many return and how much they spend."], ["segments.html", "Segments", "Score every customer on recency, frequency and spend, and check the segments really predict what happens next."],
    ["ltv.html", "Lifetime value", "Project what a new cohort will be worth, and see how accurate that method was in the past."], ["builder.html", "Build a segment", "Define your own customer group and test it against what they did next."]]
    .map(([h, t, d]) => `<a class="step" href="${h}" style="text-decoration:none"><b>${t}</b><p>${d}</p></a>`).join("");
})();
