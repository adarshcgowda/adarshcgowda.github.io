/* One fixed composition of every Explorer view (calendar, bubbles, Sankey, sunburst, treemap, tree, drivers), drawn from the real cubes.
   It exists only to produce the portfolio thumbnail; the interactive dashboard is explorer.html. */
(function () {
  const CUBE = FD.cubes.ops, MON = FD.monitor, S = FDStats, X = FDExplore, V = FDViz, C = FDCharts, esc = C.esc, DIMS = CUBE.dims;
  const M = (k) => X.measureOf(CUBE, k), all = X.total(CUBE, {}), fmtInt = S.fmtInt;
  const lerp = (a, b, k) => Math.round(a + (b - a) * k);
  const col = (t) => { if (!t) return "#5b7aa3"; const k = Math.min(1, Math.abs(t)), to = t > 0 ? [248, 113, 113] : [45, 212, 191]; return `rgb(${lerp(91, to[0], k)},${lerp(122, to[1], k)},${lerp(163, to[2], k)})`; };
  const ovLate = S.measureValue(M("late_rate"), all), ovTime = S.measureValue(M("avg_time"), all);
  const NAT = { Traffic: ["Low", "Medium", "High", "Jam", "Missing"], "Deliveries carried": ["0", "1", "2", "3", "Missing"] };
  const natSort = (dim, gs) => { const nat = NAT[DIMS[dim]]; return nat ? gs.sort((a, b) => nat.indexOf(a.label) - nat.indexOf(b.label)) : gs.sort((a, b) => b.n - a.n); };
  const panel = (n, title, tag, hl, body, align) => `<section class="pn${align ? " " + align : ""}"><h3>${n ? `<span class="n">${n}</span>` : ""}${title}<span class="tag">${tag}</span></h3><p class="hl">${hl}</p><div class="body">${body}</div></section>`;
  const grp = (f, d) => X.group(CUBE, f, d, "orders").filter((g) => g.n > 0);

  // ---------- header and KPI strip
  const top = `<div class="top"><span class="brand"><i></i>Food delivery intelligence</span><span class="chips"><span class="chip">Metric: Late rate (&gt;40 min)</span></span>` +
    `<span class="tabs">${["Story", "Breakdown", "Drill-down", "Decomposition tree", "Shapes", "Hot spots"].map((t, k) => `<span class="${k === 0 ? "on" : ""}">${t}</span>`).join("")}</span></div>`;
  // ---------- 1 · calendar
  const ci = -1, acc = MON.dates.map(() => [0, 0, 0]);
  MON.rows.forEach((r) => { const a = acc[r[0]]; a[0] += r[2]; a[1] += r[5]; });
  const vals = acc.map((a) => (a[0] ? { n: a[0], v: (100 * a[1]) / a[0] } : null)), real = vals.filter(Boolean).map((x) => x.v), mean = real.reduce((a, b) => a + b, 0) / real.length;
  const missing = vals.filter((v) => !v).length;
  const cal = V.calendar(V.calendarGrid(MON.dates), vals.map((v) => (v ? v.v : null)), { color: (v) => col(X.tone("late_rate", v, mean, 0.3)), label: "Late rate per day", tip: (i) => MON.dates[i] });

  // ---------- 2 · bubbles
  const gc = X.group(CUBE, {}, 0, "orders").filter((g) => g.n >= 12), bySize = gc.slice().sort((a, b) => b.n - a.n);
  const items = gc.map((g) => ({ x: S.measureValue(M("avg_time"), g.v), y: S.measureValue(M("late_rate"), g.v), size: g.n, label: g.label, g }));
  const ext = [items.slice().sort((a, b) => a.y - b.y)[0], items.slice().sort((a, b) => b.y - a.y)[0], items.slice().sort((a, b) => b.x - a.x)[0], items.slice().sort((a, b) => a.x - b.x)[0]];
  items.forEach((p) => { p.color = col(X.tone("late_rate", p.y, ovLate, 0.2)); p.show = ext.includes(p) || bySize.slice(0, 2).includes(p); p.tip = p.label; });
  const yr = Math.max(...items.map((p) => p.y)) - Math.min(...items.map((p) => p.y)), xr = Math.max(...items.map((p) => p.x)) - Math.min(...items.map((p) => p.x));
  const bub = V.bubbles(items, { width: 456, height: 318, xlabel: "Average delivery time (min)", ylabel: "Late rate (%)", ref: { x: ovTime, y: ovLate }, fmtX: (v) => v.toFixed(1), fmtY: (v) => v.toFixed(1), label: "Cities by speed and lateness" });

  // ---------- 3 · sankey (traffic -> deliveries carried -> late / on time)
  const A = 2, B = 6, ga = natSort(A, grp({}, A)), gb = natSort(B, grp({}, B)), g2 = X.group2(CUBE, {}, A, B, "orders"), late = all[2], meta = {};
  ga.forEach((g) => { meta["a" + g.i] = g; }); gb.forEach((g) => { meta["b" + g.i] = g; });
  const L = V.sankeyLayout([ga.map((g) => ({ id: "a" + g.i, value: g.n })), gb.map((g) => ({ id: "b" + g.i, value: g.n })), [{ id: "late", value: late }, { id: "ok", value: all[0] - late }]],
    g2.map((g) => ({ s: "a" + g.a, t: "b" + g.b, value: g.n })).concat(gb.flatMap((g) => [{ s: "b" + g.i, t: "late", value: g.v[2] }, { s: "b" + g.i, t: "ok", value: g.n - g.v[2] }])), 603, 318, { pad: 8, left: 120, right: 96 });
  const rate = (n) => (100 * meta[n.id].v[2]) / meta[n.id].n, nodeColor = (n) => (n.id === "late" ? "#f87171" : n.id === "ok" ? "#2dd4bf" : col(X.tone("late_rate", rate(n), ovLate, 0.6)));
  const sank = V.sankey(L, 603, 318, { label: "Orders flowing to late", nodeColor, linkColor: (l) => (l.t.id === "late" ? "#f87171" : l.t.id === "ok" ? "#2dd4bf" : nodeColor(l.s)),
    nodeLabel: (n) => (n.id === "late" ? "Late" : n.id === "ok" ? "On time" : `${meta[n.id].label} · ${rate(n).toFixed(0)}%`), nodeTip: () => "", linkTip: () => "", nodeAttrs: () => "" });
  const jam = ga.find((g) => g.label === "Jam"), jamShare = (100 * jam.n) / all[0], jamLate = (100 * jam.v[2]) / late;

  const kpiDefs = [["orders", "Orders analysed", "11 Feb to 6 Apr 2022"], ["avg_time", "Average delivery time (min)", `22 cities within ${xr.toFixed(1)} min`], ["late_rate", "Late rate (over 40 min)", `traffic jam: ${(100 * jam.v[2] / jam.n).toFixed(0)}%`], ["avg_rating", "Average rider rating", "5-point scale"], ["avg_prep", "Average prep time (min)", "5, 10 or 15 min only"]];
  const fmtK = (k, v) => (k === "orders" ? fmtInt(v) : k === "late_rate" ? v.toFixed(1) + "%" : k === "avg_rating" ? v.toFixed(2) : v.toFixed(1));
  const kp = `<div class="kp">${kpiDefs.map(([k, l, d]) => `<div class="kpi"><b>${fmtK(k, S.measureValue(M(k), all))}</b><span>${l}</span><span class="d">${d}</span></div>`).join("")}` +
    `<div class="story"><small>The story</small><div class="steps2">${["The pulse", "Where", "Why", "Trust", "So what"].map((t, i) => `<span><b>${i + 1}</b>${t}</span>`).join("")}</div></div></div>`;

  // ---------- 4 · sunburst (traffic -> deliveries -> weather)
  const chain = [2, 6, 3], minSize = all[0] * 0.006;
  const build = (f, level) => (level >= chain.length ? undefined : natSort(chain[level], grp(f, chain[level]).filter((g) => g.n >= minSize)).map((g) => ({ size: g.n, label: g.label, n: g.n, value: g.value, d: chain[level], depth: level + 1, children: build(X.merge(f, { [chain[level]]: [g.i] }), level + 1) })));
  const gl = (f, d) => X.group(CUBE, f, d, "late_rate");
  const buildL = (f, level) => (level >= chain.length ? undefined : natSort(chain[level], gl(f, chain[level]).filter((g) => g.n >= minSize)).map((g) => ({ size: g.n, label: g.label, n: g.n, value: g.value, d: chain[level], depth: level + 1, children: buildL(X.merge(f, { [chain[level]]: [g.i] }), level + 1) })));
  const sun = V.sunburst(V.partition({ size: all[0], label: "All orders", n: all[0], value: ovLate, children: buildL({}, 0) }, 3), { size: 340, label: "Sunburst", color: (n) => col(X.tone("late_rate", n.value, ovLate, 0.25)), tip: () => "", attrs: () => "",
    short: (n, len) => (n.label.length > len / 6.5 ? n.label.slice(0, Math.max(3, Math.floor(len / 6.5) - 1)) + "…" : n.label), center: ["All orders", ovLate.toFixed(1) + "% late", fmtInt(all[0])] });

  // ---------- 5 · treemap of cities
  const cities = gc.map((g) => Object.assign({ size: g.n }, g)), TW = 347, TH = 318, tiles = X.treemap(cities, 0, 0, TW, TH);
  const tm = `<svg viewBox="0 0 ${TW} ${TH}" class="chart" role="img" aria-label="Treemap of cities">${tiles.map((t) => {
    const big = t.w > 62 && t.h > 36, mid = t.w > 40 && t.h > 20, lr = S.measureValue(M("late_rate"), t.v);
    return `<rect x="${t.x.toFixed(1)}" y="${t.y.toFixed(1)}" width="${t.w.toFixed(1)}" height="${t.h.toFixed(1)}" rx="4" fill="${col(X.tone("late_rate", lr, ovLate, 0.2))}" stroke="#0b1220" stroke-width="2"/>` +
      (mid ? `<text x="${(t.x + 6).toFixed(1)}" y="${(t.y + 15).toFixed(1)}" font-size="${big ? 11 : 9}" font-weight="600" fill="#fff">${esc(t.label.length > t.w / 6 ? t.label.slice(0, Math.floor(t.w / 6) - 1) + "…" : t.label)}</text>` : "") +
      (big ? `<text x="${(t.x + 6).toFixed(1)}" y="${(t.y + 29).toFixed(1)}" font-size="10" fill="#fff" opacity=".85">${lr.toFixed(1)}%</text>` : "");
  }).join("")}</svg>`;

  // ---------- 6 · decomposition tree excerpt: Traffic -> Jam -> Deliveries carried -> Weather
  const tnRow = (label, dim, val, n, share, parentVal, depth, open, worst, maxv) => {
    const t = parentVal ? X.tone("late_rate", val, parentVal, 0.2) : 0, r = parentVal ? (val - parentVal) / parentVal : null;
    return `<div class="tn${worst ? " worst" : ""}" style="--d:${depth}"><button class="tg" disabled>${open ? "▾" : "▸"}</button><span class="nm">${esc(label)}${dim ? ` <small>${esc(dim)}</small>` : ""}</span><span class="track"><span class="fill" style="width:${Math.max(2, (100 * val) / maxv).toFixed(1)}%;background:${col(t)}"></span></span>` +
      `<span class="num">${val.toFixed(1)}%</span><span class="num" style="color:${t > 0.05 ? "var(--red)" : t < -0.05 ? "var(--teal)" : "var(--soft)"}">${r == null ? fmtInt(n) : (r >= 0 ? "+" : "") + (r * 100).toFixed(0) + "%"}</span></div>`;
  };
  const kids = (f, d, minN) => X.group(CUBE, f, d, "late_rate").filter((g) => g.n >= minN);
  const trafficKids = natSort(2, kids({}, 2, 100)).filter((g) => g.label !== "Missing"), jamIdx = trafficKids.find((g) => g.label === "Jam").i;
  const fJam = { 2: [jamIdx] }, delKids = natSort(6, kids(fJam, 6, 100)).filter((g) => ["0", "1", "2"].includes(g.label)), two = delKids.find((g) => g.label === "2"), fTwo = X.merge(fJam, { 6: [two.i] }), wKids = kids(fTwo, 3, 100).sort((a, b) => b.value - a.value).slice(0, 2);
  let rows = tnRow("All orders", "", ovLate, all[0], 1, 0, 0, true, false, 60);
  trafficKids.forEach((g) => {
    const isJam = g.i === jamIdx; rows += tnRow(g.label, "Traffic", g.value, g.n, 0, ovLate, 1, isJam, isJam, 60);
    if (isJam) { delKids.forEach((h) => { const isTwo = h.i === two.i; rows += tnRow(h.label, "Deliveries carried", h.value, h.n, 0, g.value, 2, isTwo, isTwo, 60); if (isTwo) wKids.forEach((w) => { rows += tnRow(w.label, "Weather", w.value, w.n, 0, h.value, 3, false, false, 60); }); }); }
  });
  const tree = `<div class="tree"><div class="thead"><span></span><span>Segment</span><span></span><span>Late %</span><span>vs parent</span></div>${rows}</div>`;

  // ---------- 7 · what adds minutes (regression)
  const coefs = FD.study.model.coefs.filter((c) => !/missing/i.test(c.name)).sort((a, b) => Math.abs(b.coef) - Math.abs(a.coef)).slice(0, 8);
  const short = (n) => n.replace(/ \(vs .*\)/, "").replace("Deliveries carried", "Load").replace("Distance (per km, from coordinate offset)", "Distance per km").replace(" (per point)", "/pt");
  const forest = C.forest(coefs.map((c) => ({ label: short(c.name), coef: c.coef, lo: c.lo, hi: c.hi })), { width: 347, labelW: 130, rowH: 34, label: "Minutes added" });

  const poster = document.getElementById("poster");
  poster.innerHTML = top + kp +
    `<div class="r3">${panel(1, "The pulse", "calendar heatmap", `Late rate by day. <b>${missing} of ${MON.dates.length} days</b> have no data at all.`, cal)}` +
    `${panel(2, "Where it happens", "bubble map", `All 22 cities in one patch: <b>${yr.toFixed(1)} pts</b> and <b>${xr.toFixed(1)} min</b> apart.`, bub)}` +
    `${panel(3, "Why it happens", "flow diagram", `Jam is <b>${jamShare.toFixed(0)}%</b> of orders but <b>${jamLate.toFixed(0)}%</b> of the late ones.`, sank)}</div>` +
    `<div class="r4">${panel(0, "Sunburst", "traffic · load · weather", "Rings drill from traffic into load and weather.", sun)}` +
    `${panel(0, "Treemap", "size = orders", "Colour = late rate against the average.", tm)}` +
    `${panel(0, "Decomposition tree", "follow the problem", "Each split picks the widest gap.", tree, "flush")}` +
    `${panel(0, "What adds minutes", "regression, 95% CI", `Model explains <b>${(100 * FD.study.model.test.r2).toFixed(0)}%</b> of unseen deliveries.`, forest)}</div>`;

  const fit = () => { const k = Math.min(innerWidth / 1600, innerHeight / 1000); poster.style.transform = k < 1 || k > 1 ? `scale(${k})` : "none"; };
  fit(); addEventListener("resize", fit);
})();
