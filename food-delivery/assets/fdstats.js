/* Pure functions shared by the dashboards. No DOM access, so they can be unit-tested in Node (tests/fdstats.test.js). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FDStats = factory();
})(this, function () {
  const sum = (a) => a.reduce((s, v) => s + v, 0);

  // ---- control charts -------------------------------------------------------------------------
  function limitsMean(sigma, n, center, k) { const w = (k || 3) * sigma / Math.sqrt(n); return [center - w, center + w]; }
  function limitsP(p, n, k) {
    const w = (k || 3) * Math.sqrt(p * (1 - p) / n);
    return [Math.max(0, p - w), Math.min(1, p + w)];
  }

  // Rows of the daily mart: [dateIdx, cityIdx, n, sum_t, sum_t2, late, n_rating, sum_rating, n_prep, sum_prep, n_outlier]
  function dailySeries(M, cityName) {
    const ci = cityName && cityName !== "All" ? M.cities.indexOf(cityName) : -1;
    const days = M.dates.map((d) => ({ date: d, n: 0, sumT: 0, sumT2: 0, late: 0, nOut: 0, nRating: 0, sumRating: 0 }));
    M.rows.forEach((r) => {
      if (ci >= 0 && r[1] !== ci) return;
      const d = days[r[0]];
      d.n += r[2]; d.sumT += r[3]; d.sumT2 += r[4]; d.late += r[5]; d.nRating += r[6]; d.sumRating += r[7]; d.nOut += r[10];
    });
    return days;
  }

  /** Lag-1 autocorrelation. Strongly negative means days alternate high/low, which breaks the independence assumption of control charts. */
  function lag1(xs) {
    const v = xs.filter((x) => x != null);
    if (v.length < 4) return null;
    const m = sum(v) / v.length;
    let num = 0, den = 0;
    for (let i = 0; i < v.length; i++) { den += (v[i] - m) ** 2; if (i) num += (v[i] - m) * (v[i - 1] - m); }
    return den ? num / den : null;
  }

  /** Roll consecutive days into windows of w days (a window containing a gap is missing). */
  function rollup(days, w) {
    if (!w || w < 2) return days;
    return days.map((d, i) => {
      const win = days.slice(Math.max(0, i - w + 1), i + 1);
      if (i < w - 1 || win.some((x) => x.n === 0)) return { date: d.date, n: 0, sumT: 0, sumT2: 0, late: 0, nOut: 0, nRating: 0, sumRating: 0 };
      const r = { date: d.date };
      ["n", "sumT", "sumT2", "late", "nOut", "nRating", "sumRating"].forEach((k) => { r[k] = sum(win.map((x) => x[k])); });
      return r;
    });
  }

  /** Control-chart view: X-bar chart for average time, P chart for late rate. Trims to the city's active range so
   *  days before it first reports are not mistaken for gaps; gaps inside the range are reported as missing. */
  function monitor(M, cityName, k, w) {
    k = k || 3;
    const raw = dailySeries(M, cityName);
    const idx = raw.map((d, i) => (d.n > 0 ? i : -1)).filter((i) => i >= 0);
    const first = idx[0], last = idx[idx.length - 1];
    const active = raw.slice(first, last + 1);
    const days0 = rollup(active, w);
    const have = active.filter((d) => d.n > 0);
    const N = sum(have.map((d) => d.n));
    const mean = sum(have.map((d) => d.sumT)) / N;
    const sigma = Math.sqrt(Math.max(sum(have.map((d) => d.sumT2)) / N - mean * mean, 0));
    const pbar = sum(have.map((d) => d.late)) / N;
    const days = days0.map((d, i) => {
      if (d.n === 0) return { date: d.date, n: 0, missing: true, warmup: !!w && w > 1 && i < w - 1 && active[i].n > 0 };
      const avg = d.sumT / d.n, late = d.late / d.n;
      const [aLo, aHi] = limitsMean(sigma, d.n, mean, k);
      const [pLo, pHi] = limitsP(pbar, d.n, k);
      return { date: d.date, n: d.n, avg, late, aLo, aHi, pLo, pHi, avgOut: avg < aLo || avg > aHi, lateOut: late < pLo || late > pHi,
               rating: d.nRating ? d.sumRating / d.nRating : null, nOut: d.nOut };
    });
    const dailyAvg = active.map((d) => (d.n ? d.sumT / d.n : null));
    return { days, mean, sigma, pbar, N, k, w: w || 1, first: raw[first].date, last: raw[last].date, lag1: lag1(dailyAvg) };
  }

  /** Month view with coverage, so a partial month is never compared as if it were whole. */
  function monthSummary(M, cityName) {
    const days = dailySeries(M, cityName);
    const g = {};
    days.forEach((d) => {
      const m = d.date.slice(0, 7);
      g[m] = g[m] || { month: m, n: 0, sumT: 0, late: 0, nRating: 0, sumRating: 0, daysWithData: 0, windowDays: 0 };
      g[m].windowDays += 1;
      if (d.n) { g[m].daysWithData += 1; g[m].n += d.n; g[m].sumT += d.sumT; g[m].late += d.late; g[m].nRating += d.nRating; g[m].sumRating += d.sumRating; }
    });
    const rows = Object.values(g).sort((a, b) => (a.month < b.month ? -1 : 1));
    rows.forEach((r, i) => {
      r.avg = r.n ? r.sumT / r.n : null; r.lateRate = r.n ? r.late / r.n : null; r.rating = r.nRating ? r.sumRating / r.nRating : null;
      r.perDay = r.daysWithData ? r.n / r.daysWithData : null;
      const [y, mo] = r.month.split("-").map(Number);
      r.calendarDays = new Date(y, mo, 0).getDate();
      r.partial = r.daysWithData < r.calendarDays;
      const p = rows[i - 1];
      r.dAvg = p && p.avg != null ? r.avg - p.avg : null;
      r.dLate = p && p.lateRate != null ? r.lateRate - p.lateRate : null;
    });
    return rows;
  }

  /** Which cities report in each month, and how much consecutive months overlap (composition check for blended KPIs). */
  function cityMix(M) {
    const g = {};
    M.rows.forEach((r) => { const m = M.dates[r[0]].slice(0, 7); (g[m] = g[m] || new Set()).add(M.cities[r[1]]); });
    const months = Object.keys(g).sort();
    const pairs = months.slice(1).map((m, i) => {
      const a = g[months[i]], b = g[m], shared = [...a].filter((c) => b.has(c)).length, union = new Set([...a, ...b]).size;
      return { from: months[i], to: m, shared, union, overlap: shared / union };
    });
    return { months: Object.fromEntries(months.map((m) => [m, [...g[m]].sort()])), pairs };
  }

  // ---- cube query engine (powers the do-it-yourself builder) -----------------------------------
  function measureValue(measure, v) {
    const kind = measure[2];
    if (kind === "sum") return v[measure[3]];
    const den = v[measure[4]];
    if (!den) return null;
    const x = v[measure[3]] / den;
    return kind === "pct" ? x * 100 : x;
  }

  /** spec: {group, group2, measure, filters:{dimIdx:[vocabIdx]}, minN}. Returns groups with value + support n. */
  function query(cube, spec) {
    const D = cube.dims.length, width = cube.rows[0].length - D;
    const measure = cube.measures.find((m) => m[0] === spec.measure);
    const acc = new Map();
    for (const row of cube.rows) {
      let ok = true;
      for (const [d, allowed] of Object.entries(spec.filters || {})) {
        if (allowed.length && !allowed.includes(row[+d])) { ok = false; break; }
      }
      if (!ok) continue;
      const key = row[spec.group] + "|" + (spec.group2 != null && spec.group2 >= 0 ? row[spec.group2] : "");
      let v = acc.get(key);
      if (!v) { v = new Array(width).fill(0); acc.set(key, v); }
      for (let i = 0; i < width; i++) v[i] += row[D + i];
    }
    const out = [];
    for (const [key, v] of acc) {
      const [a, b] = key.split("|");
      const n = v[0];
      if (n < (spec.minN || 0)) continue;
      out.push({ a: +a, b: b === "" ? null : +b, label: cube.vocab[spec.group][+a],
                 label2: b === "" ? null : cube.vocab[spec.group2][+b], value: measureValue(measure, v), n });
    }
    return out;
  }

  const fmtInt = (x) => (x == null ? "n/a" : Math.round(x).toLocaleString("en-US"));
  const fmt1 = (x) => (x == null ? "n/a" : x.toFixed(1));
  const fmt2 = (x) => (x == null ? "n/a" : x.toFixed(2));
  const pct = (x, d) => (x == null ? "n/a" : (x * 100).toFixed(d == null ? 1 : d) + "%");

  return { limitsMean, limitsP, dailySeries, lag1, rollup, monitor, monthSummary, cityMix, measureValue, query, fmtInt, fmt1, fmt2, pct, sum };
});
