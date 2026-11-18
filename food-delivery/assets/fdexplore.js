/* Pure logic for the Explorer page: aggregation, drill paths, decomposition-tree splits, segment finder, treemap layout.
   No DOM access, so it can be unit-tested in Node (tests/fdexplore.test.js). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./fdstats.js"));
  else root.FDExplore = factory(root.FDStats);
})(this, function (S) {
  const width = (cube) => cube.rows[0].length - cube.dims.length;
  const measureOf = (cube, key) => cube.measures.find((m) => m[0] === key);
  const pass = (row, filters) => {
    for (const d in filters) { const a = filters[d]; if (a && a.length && !a.includes(row[+d])) return false; }
    return true;
  };
  const merge = (...fs) => { const o = {}; fs.forEach((f) => Object.entries(f || {}).forEach(([d, v]) => { o[d] = v; })); return o; };
  const pathFilters = (path) => { const o = {}; (path || []).forEach((p) => { o[p.d] = [p.v]; }); return o; };

  /** Sum of every metric column for rows passing the filters. */
  function total(cube, filters) {
    const D = cube.dims.length, v = new Array(width(cube)).fill(0);
    for (const row of cube.rows) if (pass(row, filters)) for (let i = 0; i < v.length; i++) v[i] += row[D + i];
    return v;
  }

  /** Group by one dimension. Returns [{i, label, v, n, value}] with value = the measure. */
  function group(cube, filters, dim, mKey) {
    const D = cube.dims.length, W = width(cube), m = measureOf(cube, mKey), acc = new Map();
    for (const row of cube.rows) {
      if (!pass(row, filters)) continue;
      let v = acc.get(row[dim]);
      if (!v) { v = new Array(W).fill(0); acc.set(row[dim], v); }
      for (let i = 0; i < W; i++) v[i] += row[D + i];
    }
    return [...acc].map(([i, v]) => ({ i, label: cube.vocab[dim][i], v, n: v[0], value: S.measureValue(m, v) }));
  }

  /** Group by two dimensions at once (used by the segment finder). */
  function group2(cube, filters, d1, d2, mKey) {
    const D = cube.dims.length, W = width(cube), m = measureOf(cube, mKey), acc = new Map();
    for (const row of cube.rows) {
      if (!pass(row, filters)) continue;
      const k = row[d1] * 1000 + row[d2];
      let v = acc.get(k);
      if (!v) { v = new Array(W).fill(0); acc.set(k, v); }
      for (let i = 0; i < W; i++) v[i] += row[D + i];
    }
    return [...acc].map(([k, v]) => ({ a: Math.floor(k / 1000), b: k % 1000, v, n: v[0], value: S.measureValue(m, v) }));
  }

  /** +1 when a higher value is worse (time, lateness), -1 when higher is better (rating), 0 when neutral (volume). */
  const badDir = (mKey) => (mKey === "avg_rating" ? -1 : mKey === "orders" ? 0 : 1);

  /** Signed badness in [-1, 1]: positive = worse than the reference, clamped at +/- `cap` relative difference. */
  function tone(mKey, value, ref, cap) {
    if (value == null || !ref) return 0;
    const rel = (value - ref) / Math.abs(ref), t = Math.max(-1, Math.min(1, rel / (cap || 0.25)));
    return badDir(mKey) * t;
  }

  /** How much a dimension separates the groups. For ratio and percent measures: the gap between best and worst group (both with n >= minN),
      relative to the overall value. For volume: the share held by the biggest group. */
  function spread(cube, filters, dim, mKey, minN) {
    const gs = group(cube, filters, dim, mKey).filter((g) => g.n >= minN && g.value != null);
    if (gs.length < 2) return null;
    const m = measureOf(cube, mKey), all = S.measureValue(m, total(cube, filters));
    const sorted = gs.slice().sort((a, b) => a.value - b.value), lo = sorted[0], hi = sorted[sorted.length - 1];
    let score;
    if (m[2] === "sum") { const tot = gs.reduce((s, g) => s + g.n, 0); score = hi.n / tot; }
    else score = (hi.value - lo.value) / Math.abs(all || 1);
    return { dim, score, lo, hi, groups: gs.length, overall: all };
  }

  /** The unfiltered dimension that separates the groups most (the "auto" split of the decomposition tree). */
  function autoSplit(cube, filters, mKey, minN, exclude) {
    let best = null;
    for (let d = 0; d < cube.dims.length; d++) {
      if ((filters[d] && filters[d].length) || (exclude || []).includes(d)) continue;
      const s = spread(cube, filters, d, mKey, minN);
      if (s && (!best || s.score > best.score)) best = s;
    }
    return best;
  }

  /** Follow the problem: starting from `filters`, repeatedly split on the auto dimension and step into the worst child. Returns a path. */
  function worstPath(cube, filters, mKey, minN, maxDepth) {
    const path = [], dir = badDir(mKey) || 1;
    let f = merge(filters);
    for (let k = 0; k < maxDepth; k++) {
      const s = autoSplit(cube, f, mKey, minN);
      if (!s) break;
      const kids = group(cube, f, s.dim, mKey).filter((g) => g.n >= minN && g.value != null);
      kids.sort((a, b) => dir * (b.value - a.value));
      const w = kids[0];
      path.push({ d: s.dim, v: w.i });
      f = merge(f, { [s.dim]: [w.i] });
    }
    return path;
  }

  /** Two-dimension segments ranked by how far they sit from the overall value, worst first. Skips pairs that include a filtered dimension. */
  function segments(cube, filters, mKey, minN) {
    const m = measureOf(cube, mKey), all = S.measureValue(m, total(cube, filters)), out = [], dir = badDir(mKey) || 1;
    for (let a = 0; a < cube.dims.length; a++) {
      if (filters[a] && filters[a].length) continue;
      for (let b = a + 1; b < cube.dims.length; b++) {
        if (filters[b] && filters[b].length) continue;
        for (const g of group2(cube, filters, a, b, mKey)) {
          if (g.n < minN || g.value == null) continue;
          out.push({ a, b, ai: g.a, bi: g.b, n: g.n, value: g.value, lift: all ? (g.value - all) / Math.abs(all) : 0 });
        }
      }
    }
    out.sort((x, y) => dir * (y.value - x.value));
    return { overall: all, ranked: out };
  }

  /** Squarified treemap. items: [{size, ...}] with size > 0. Returns the items with x, y, w, h filling the rectangle. */
  function treemap(items, x, y, w, h) {
    const list = items.filter((i) => i.size > 0).sort((a, b) => b.size - a.size);
    if (!list.length) return [];
    const k = (w * h) / list.reduce((s, i) => s + i.size, 0), nodes = list.map((i) => Object.assign({}, i, { a: i.size * k })), res = [];
    const worst = (row, side) => {
      const s = row.reduce((t, n) => t + n.a, 0), mx = Math.max(...row.map((n) => n.a)), mn = Math.min(...row.map((n) => n.a));
      return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
    };
    const place = (row) => {
      const s = row.reduce((t, n) => t + n.a, 0);
      if (w >= h) { const cw = s / h; let yy = y; row.forEach((n) => { const nh = n.a / cw; res.push(Object.assign(n, { x, y: yy, w: cw, h: nh })); yy += nh; }); x += cw; w -= cw; }
      else { const rh = s / w; let xx = x; row.forEach((n) => { const nw = n.a / rh; res.push(Object.assign(n, { x: xx, y, w: nw, h: rh })); xx += nw; }); y += rh; h -= rh; }
    };
    let row = [];
    for (const n of nodes) {
      const side = Math.min(w, h);
      if (!row.length || worst(row.concat(n), side) <= worst(row, side)) row.push(n);
      else { place(row); row = [n]; }
    }
    if (row.length) place(row);
    return res;
  }

  return { width, measureOf, pass, merge, pathFilters, total, group, group2, badDir, tone, spread, autoSplit, worstPath, segments, treemap };
});
