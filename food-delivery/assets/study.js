(function () {
  const S0 = FD.study, Q = FD.quality, S = FDStats, C = FDCharts, $ = (id) => document.getElementById(id);
  const E = S0.effects, mdl = S0.model, R = S0.restaurants, B = S0.bangalore_vs_rest;
  const get = (dim, lv) => E[dim].find((x) => x.level === lv);

  // ---- headline
  const jam = get("Traffic", "Jam"), low = get("Traffic", "Low"), d3 = get("Deliveries carried", "3"), d2 = get("Deliveries carried", "2"), fest = get("Festival", "Yes");
  $("headline").innerHTML = [
    [S.pct(d3.late, 0), `late when the multiple_deliveries field is 3 (vs ${S.pct(get("Deliveries carried", "0").late, 0)} at 0)`, "bad"],
    [S.pct(fest.late, 0), "late on festival days", "bad"],
    [S.fmt1(jam.avg - low.avg) + " min", "extra time in a traffic jam vs low traffic", "warn"],
    [(mdl.test.r2 * 100).toFixed(0) + "%", `of delivery-time variation explained on unseen later orders (MAE ${S.fmt1(mdl.test.mae)} min)`, "good"],
  ].map(([v, l, c]) => `<div class="kpi ${c}"><b>${v}</b><span>${l}</span></div>`).join("");

  // ---- effects explorer
  const dims = ["Traffic", "Deliveries carried", "Festival", "Weather", "Vehicle", "Order type", "Order hour"];
  const order = { Traffic: ["Low", "Medium", "High", "Jam", "Missing"], "Deliveries carried": ["0", "1", "2", "3", "Missing"], Festival: ["No", "Yes", "Missing"] };
  let cur = "Traffic";
  function drawEffects() {
    let rows = E[cur].filter((r) => r.n >= 30);
    if (order[cur]) rows.sort((a, b) => order[cur].indexOf(a.level) - order[cur].indexOf(b.level)); else if (cur === "Order hour") rows.sort((a, b) => a.level - b.level); else rows.sort((a, b) => b.avg - a.avg);
    const mx = Math.max(...rows.map((r) => r.avg));
    $("e-avg").innerHTML = C.barH(rows.map((r) => ({ label: r.level, value: r.avg, flag: r.level === "Missing", note: S.fmtInt(r.n) + " orders" })), { fmt: (v) => v.toFixed(1), max: mx * 1.05, label: cur });
    $("e-late").innerHTML = C.barH(rows.map((r) => ({ label: r.level, value: r.late * 100, color: r.late > 0.3 ? C.COL.red : undefined, flag: r.level === "Missing", note: S.fmtInt(r.n) + " orders" })), { fmt: (v) => v.toFixed(1) + "%", max: 100, label: cur + " late rate" });
    $("tabs").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.textContent === cur));
    const notes = { Traffic: "Jam adds about 10 minutes over low traffic, but medium and high traffic look almost the same, which real traffic would not.", "Deliveries carried": "The strongest signal in the data. The source field multiple_deliveries (0 to 3) is documented only briefly; read as load per trip, a value of 2 makes nearly half of orders late and 3 makes every one late. Confirm the field definition before acting on it.", Festival: "Festival days are rare (about 2% of orders) but 9 in 10 are late. Missing festival flags behave like a different population (see Data quality).", Weather: "Fog and cloud slow orders most; sandstorms and storms are no worse than wind. That ordering is not physically sensible, another sign the data is generated.", Vehicle: "Motorcycles are a few minutes slower than scooters. Bicycles (68 orders) are too few to conclude anything.", "Order type": "No effect at all: all four types average the same. Eta squared is 0.01%.", "Order hour": "Evening hours carry far more orders. Delivery time shifts little by hour." };
    $("effect-notes").innerHTML = `<p>${notes[cur]}</p><p class="small">Groups with fewer than 30 orders are hidden. Counts appear in each bar's tooltip.</p>`;
  }
  $("tabs").innerHTML = dims.map((d) => `<button aria-pressed="false">${d}</button>`).join("");
  $("tabs").onclick = (e) => { if (e.target.tagName === "BUTTON") { cur = e.target.textContent; drawEffects(); } };
  drawEffects();
  $("eta").innerHTML = C.barH(Q.eta.map((e) => ({ label: e.factor, value: e.eta2 * 100, flag: e.eta2 < 0.005 })), { fmt: (v) => v.toFixed(2) + "%", labelW: 160, label: "variance explained" });

  // ---- model
  const wo = mdl.without_distance.test;
  $("model-kpis").innerHTML = [[S.pct(mdl.test.r2, 1), "R-squared on later, unseen orders", "good"], [S.fmt1(mdl.test.mae) + " min", "average error (MAE)", ""],
    [S.fmt1(mdl.baseline_traffic.mae) + " min", "error of a traffic-only rule", ""], [S.fmt1(mdl.baseline_mean.mae) + " min", "error of guessing the average", ""]]
    .map(([v, l, c]) => `<div class="kpi ${c}"><b>${v}</b><span>${l}</span></div>`).join("");
  const top = mdl.coefs.filter((c) => !/missing/.test(c.name)).sort((a, b) => Math.abs(b.coef) - Math.abs(a.coef)).slice(0, 14);
  $("forest").innerHTML = C.forest(top.map((c) => ({ label: c.name.replace(/ \(vs .*\)/, "").replace("Distance (per km, from coordinate offset)", "Distance (per km)"), coef: c.coef, lo: c.lo, hi: c.hi })), { labelW: 280 });
  $("model-notes").innerHTML = `<b>How to trust this.</b> Orders before ${mdl.split_date} trained the model (${S.fmtInt(mdl.n_train)} orders); the ${S.fmtInt(mdl.n_test)} later orders tested it. Train R-squared ${S.pct(mdl.train.r2, 1)} against test ${S.pct(mdl.test.r2, 1)}, so it is not memorising. ` +
    `Adding distance (derived from coordinates that turned out to be a 12-level code) lifts test R-squared only from ${S.pct(wo.r2, 1)} to ${S.pct(mdl.test.r2, 1)}. Most of what remains unexplained is likely unrecorded (rider speed, restaurant delays, road conditions). Linear and interpretable on purpose: a manager can read it.`;

  // ---- Bangalore
  const sig = !(B.lo <= 0 && B.hi >= 0);  // significant only if the 95% interval excludes zero
  $("bvr").innerHTML = `<div class="kpis"><div class="kpi"><b>${S.fmt1(B.avg_bangalore)}</b><span>Bangalore avg (min), ${S.fmtInt(B.bangalore_n)} orders</span></div><div class="kpi"><b>${S.fmt1(B.avg_rest)}</b><span>all other cities</span></div></div>` +
    `<div class="callout ${sig ? "good" : ""}"><b>Difference: ${B.diff > 0 ? "+" : ""}${B.diff.toFixed(2)} min</b> (95% interval ${B.lo.toFixed(2)} to ${B.hi.toFixed(2)}). ${sig ? "The interval excludes zero." : "The interval includes zero, so there is no evidence Bangalore differs from the rest."}</div>`;
  $("cities").innerHTML = C.barH(S0.cities.map((c) => ({ label: c.city, value: c.avg, flag: c.city === "Bangalore", note: S.fmtInt(c.n) + " orders" })), { fmt: (v) => v.toFixed(1), label: "avg time by city", labelW: 110, rowH: 20 });

  // ---- restaurants
  $("areas").innerHTML = C.table(["Area", "Listings", "Rated", "Median cost for two", "Raw rating", "Shrunk rating", "Under 10 reviews", "Chain share"],
    R.areas.map((a) => ({ cells: [a.area, S.fmtInt(a.listings), S.fmtInt(a.rated), "Rs " + S.fmtInt(a.median_cost), S.fmt2(a.raw_rating), S.fmt2(a.shrunk_rating), a.low_evidence_pct.toFixed(1) + "%", a.chain_pct.toFixed(0) + "%"] })), { left: [0] });
  $("cuisines").innerHTML = C.barH(R.cuisines.map((c) => ({ label: c.cuisine, value: c.listings, note: "shrunk rating " + S.fmt2(c.shrunk_rating) })), { labelW: 130, rowH: 22, label: "cuisines" });
  $("price").innerHTML = C.table(["Segment", "Listings", "Raw", "Shrunk"], R.bands.map((b) => ({ cells: [b.band, S.fmtInt(b.listings), S.fmt2(b.raw_rating), S.fmt2(b.shrunk_rating)] }))
    .concat([{ cells: ["Chain", S.fmtInt(R.chain.listings), S.fmt2(R.chain.raw_rating), S.fmt2(R.chain.shrunk_rating)] }, { cells: ["Independent", S.fmtInt(R.independent.listings), S.fmt2(R.independent.raw_rating), S.fmt2(R.independent.shrunk_rating)] }])) +
    `<p class="small">A chain is any name with 3+ listings. Rating gaps between segments are around 0.1 stars: small in practice.</p>`;
  $("gems").innerHTML = C.table(["Restaurant", "Area", "Cuisine", "Rating", "Reviews", "Cost for two", "Shrunk score"], R.top_listings.map((t) => ({ cells: [C.esc(t.name), C.esc(t.area), C.esc(t.cuisine || ""), t.rating.toFixed(1), S.fmtInt(t.reviews), "Rs " + S.fmtInt(t.cost), t.score.toFixed(2)] })), { left: [0, 1, 2] });

  // ---- recommendations
  $("recs").innerHTML = '<div class="tiles">' + [
    ["Test a cap on multi-order trips", `If multiple_deliveries means orders carried together, a value of 3 is late ${S.pct(d3.late, 0)} of the time and 2 is ${S.pct(d2.late, 0)}. Confirm the definition, then trial a cap in one city with a holdout and watch lateness against rider earnings.`],
    ["Plan festival capacity ahead", `Festival days are ${S.pct(fest.n / FD.meta.orders, 1)} of orders but ${S.pct(fest.late, 0)} late. Pre-position riders and warn customers with a longer ETA.`],
    ["Quote ETAs from the model", `A simple model cuts ETA error from ${S.fmt1(mdl.baseline_traffic.mae)} to ${S.fmt1(mdl.test.mae)} minutes versus a traffic-only rule. Re-fit it monthly and monitor the error on the Monitor page.`],
    ["Rank restaurants with shrunk ratings", "Use evidence-adjusted ratings in search and curation so new listings with a handful of 5-star reviews do not leapfrog proven ones."],
  ].map(([h, p]) => `<div class="card"><h3>${h}</h3><p>${p}</p></div>`).join("") + "</div>";
})();
