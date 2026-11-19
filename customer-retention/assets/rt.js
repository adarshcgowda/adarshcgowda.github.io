/* Customer retention engine: pure functions over compact per-customer visit lists; no DOM.
   Loaded by the pages and by tests/rt.test.js, which checks it against results computed by the Python reference (src/analytics.py).
   Definitions: day = days since 2009-12-01; month 0 = Dec 2009; a visit is one customer on one day; revenue is in pence; period = floor(month / grain). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RT = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var UK = "United Kingdom", LAST_COMPLETE_MONTH = 23, START = Date.UTC(2009, 11, 1);
  var SEGMENTS = ["Champions", "Loyal", "New", "Promising", "Needs attention", "At risk", "Hibernating", "Lost"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function isoOfDay(d) { return new Date(START + d * 86400000).toISOString().slice(0, 10); }
  function dayOfIso(s) { var p = s.split("-"); return Math.round((Date.UTC(+p[0], +p[1] - 1, +p[2]) - START) / 86400000); }
  function monthOfDay(d) { var t = new Date(START + d * 86400000); return (t.getUTCFullYear() - 2009) * 12 + (t.getUTCMonth() + 1 - 12); }
  function monthLabel(m) { var k = m + 11; return MONTHS[k % 12] + " " + (2009 + Math.floor(k / 12)); }
  function periodLabel(p, grain) {
    if (grain === 1) return monthLabel(p);
    return monthLabel(p * grain).slice(0, 3) + "–" + monthLabel(p * grain + grain - 1);
  }

  /** data = window.RT_DATA. Adds the per-day month lookup and splits each visit list into [day, pence] pairs. */
  function prepare(data) {
    var P = { lastDay: data.last_day, countries: data.countries, n: data.ctry.length, uk: [], days: [], pence: [], monthOf: [] };
    for (var d = 0; d <= data.last_day; d++) P.monthOf.push(monthOfDay(d));
    for (var i = 0; i < P.n; i++) {
      var v = data.visits[i], ds = [], ps = [];
      for (var j = 0; j < v.length; j += 2) { ds.push(v[j]); ps.push(v[j + 1]); }
      P.days.push(ds); P.pence.push(ps); P.uk.push(data.countries[data.ctry[i]] === UK ? 1 : 0);
    }
    P.country = data.ctry;
    return P;
  }

  /** flt: "all", "uk", "other", or {country: index} for a single country. */
  function keep(P, i, flt) {
    if (flt === "all" || flt == null) return true;
    if (typeof flt === "object") return P.country[i] === flt.country;
    return (flt === "uk") === (P.uk[i] === 1);
  }

  // ---- cohorts ----
  function cohortTable(P, grain, flt) {
    var lp = Math.floor(LAST_COMPLETE_MONTH / grain), first = [], i, j;
    var size = {}, active = {}, rev = {}, vis = {};
    for (i = 0; i < P.n; i++) {
      if (!keep(P, i, flt)) continue;
      var c0 = Math.floor(P.monthOf[P.days[i][0]] / grain);
      if (c0 > lp) continue;
      size[c0] = (size[c0] || 0) + 1;
      var seen = {};
      for (j = 0; j < P.days[i].length; j++) {
        var p = Math.floor(P.monthOf[P.days[i][j]] / grain);
        if (p > lp) continue;
        var k = p - c0, key = c0 * 100 + k;
        if (!seen[k]) { seen[k] = 1; active[key] = (active[key] || 0) + 1; }
        rev[key] = (rev[key] || 0) + P.pence[i][j];
        vis[key] = (vis[key] || 0) + 1;
      }
    }
    var cohorts = Object.keys(size).map(Number).sort(function (a, b) { return a - b; });
    var ret = [], crev = [], cvis = [];
    cohorts.forEach(function (c) {
      var n = size[c], r = [], v = [], s = [], cr = 0, cv = 0;
      for (var k = 0; k <= lp - c; k++) {
        var key = c * 100 + k;
        r.push((active[key] || 0) / n);
        cr += rev[key] || 0; cv += vis[key] || 0;
        v.push(cr / 100 / n); s.push(cv / n);
      }
      ret.push(r); crev.push(v); cvis.push(s);
    });
    return { cohorts: cohorts, size: cohorts.map(function (c) { return size[c]; }), retention: ret, revenue: crev, visits: cvis };
  }

  // ---- RFM ----
  function ntile(n, k) {
    k = k || 5;
    var q = Math.floor(n / k), r = n % k, out = [];
    for (var i = 0; i < n; i++) out.push(i < r * (q + 1) ? Math.floor(i / (q + 1)) + 1 : r + Math.floor((i - r * (q + 1)) / q) + 1);
    return out;
  }
  function fScore(f) { return f === 1 ? 1 : f === 2 ? 2 : f <= 4 ? 3 : f <= 9 ? 4 : 5; }
  function segmentOf(r, f) {
    if (r >= 4 && f >= 4) return "Champions";
    if (r >= 3 && f >= 3) return "Loyal";
    if (r >= 4) return f === 1 ? "New" : "Promising";
    if (r === 3) return "Needs attention";
    if (f >= 3) return "At risk";
    return r === 2 ? "Hibernating" : "Lost";
  }

  /** Snapshot at day asof. Returns rows [{i, recency, frequency, monetary (pence), r, f, m, seg}] in customer order. */
  function rfm(P, asof, flt) {
    var rows = [], i, j;
    for (i = 0; i < P.n; i++) {
      if (!keep(P, i, flt)) continue;
      var ds = P.days[i], cnt = 0, sum = 0;
      for (j = 0; j < ds.length && ds[j] <= asof; j++) { cnt++; sum += P.pence[i][j]; }
      if (cnt) rows.push({ i: i, recency: asof - ds[cnt - 1], frequency: cnt, monetary: sum });
    }
    var n = rows.length, nt = ntile(n), idx = rows.map(function (_, k) { return k; });
    var byR = idx.slice().sort(function (a, b) { return rows[a].recency - rows[b].recency || rows[a].i - rows[b].i; });
    var byM = idx.slice().sort(function (a, b) { return rows[a].monetary - rows[b].monetary || rows[a].i - rows[b].i; });
    byR.forEach(function (k, rank) { rows[k].r = 6 - nt[rank]; });
    byM.forEach(function (k, rank) { rows[k].m = nt[rank]; });
    rows.forEach(function (r) { r.f = fScore(r.frequency); r.seg = segmentOf(r.r, r.f); });
    return rows;
  }

  /** For each snapshot row: [visited in (asof, asof + horizon], pence spent]; null when the window is not fully observed. */
  function forward(P, snap, asof, horizon) {
    if (asof + horizon > P.lastDay) return null;
    return snap.map(function (row) {
      var ds = P.days[row.i], act = 0, sum = 0;
      for (var j = 0; j < ds.length; j++) if (ds[j] > asof && ds[j] <= asof + horizon) { act = 1; sum += P.pence[row.i][j]; }
      return [act, sum];
    });
  }

  function segmentSummary(P, asof, horizon, flt) {
    var snap = rfm(P, asof, flt), fw = forward(P, snap, asof, horizon), agg = {};
    SEGMENTS.forEach(function (s) { agg[s] = { customers: 0, revenue: 0, active: 0, future_revenue: 0 }; });
    snap.forEach(function (row, k) {
      var a = agg[row.seg];
      a.customers++; a.revenue += row.monetary;
      if (fw) { a.active += fw[k][0]; a.future_revenue += fw[k][1]; }
    });
    return { total: snap.length, forward: fw !== null, segments: agg, snap: snap };
  }

  /** Counts by [segment at asofA, segment at asofB]. */
  function migration(P, asofA, asofB, flt) {
    var a = {}, out = {};
    rfm(P, asofA, flt).forEach(function (r) { a[r.i] = r.seg; });
    rfm(P, asofB, flt).forEach(function (r) {
      var k = (a[r.i] || "Not yet a customer") + "|" + r.seg;
      out[k] = (out[k] || 0) + 1;
    });
    return out;
  }

  /** A customer-defined segment: rules on recency (days), visits, spend (pounds) and country. Returns its size, revenue and what it did next. */
  function customSegment(P, asof, rules, horizon, flt) {
    var snap = rfm(P, asof, flt), fw = forward(P, snap, asof, horizon);
    var inside = [], r = rules || {};
    snap.forEach(function (row, k) {
      var pounds = row.monetary / 100;
      if (r.recencyMax != null && row.recency > r.recencyMax) return;
      if (r.recencyMin != null && row.recency < r.recencyMin) return;
      if (r.visitsMin != null && row.frequency < r.visitsMin) return;
      if (r.visitsMax != null && row.frequency > r.visitsMax) return;
      if (r.spendMin != null && pounds < r.spendMin) return;
      if (r.spendMax != null && pounds > r.spendMax) return;
      inside.push(k);
    });
    function stats(ks) {
      var rev = 0, act = 0, fr = 0;
      ks.forEach(function (k) { rev += snap[k].monetary; if (fw) { act += fw[k][0]; fr += fw[k][1]; } });
      return { customers: ks.length, revenue: rev / 100, active: fw ? act : null, future_revenue: fw ? fr / 100 : null };
    }
    var all = snap.map(function (_, k) { return k; });
    return { segment: stats(inside), everyone: stats(all), forward: fw !== null };
  }

  // ---- repeat purchase ----
  function repeatCurve(P, n, horizon, flt) {
    var base = 0, again = 0;
    for (var i = 0; i < P.n; i++) {
      if (!keep(P, i, flt) || P.days[i].length < n) continue;
      var dn = P.days[i][n - 1];
      if (dn > P.lastDay - horizon) continue;
      base++;
      if (P.days[i].length > n && P.days[i][n] - dn <= horizon) again++;
    }
    return { base: base, again: again, share: base ? again / base : null };
  }

  // ---- lifetime value ----
  function factors(cum, origin, H) {
    var f = [];
    for (var j = 0; j < H; j++) {
      var num = 0, den = 0;
      for (var a = 0; a < cum.cohorts.length; a++) {
        var row = cum.revenue[a];
        if (cum.cohorts[a] + j + 1 <= origin && j + 1 < row.length) { num += row[j + 1]; den += row[j]; }
      }
      f.push(den ? num / den : null);
    }
    return f;
  }
  function project(row, k, f, H) {
    var v = row[k];
    for (var j = k; j < H; j++) { if (f[j] === null) return null; v *= f[j]; }
    return v;
  }
  function ltvBacktest(P, flt, H, kmin, origins) {
    H = H == null ? 11 : H; kmin = kmin == null ? 3 : kmin;
    if (!origins) { origins = []; for (var t = 14; t < 24; t++) origins.push(t); }
    var cum = cohortTable(P, 1, flt), rows = [];
    origins.forEach(function (T) {
      var f = factors(cum, T, H);
      cum.cohorts.forEach(function (c, a) {
        var row = cum.revenue[a], k = T - c;
        if (k < kmin || k >= H || c + H > LAST_COMPLETE_MONTH) return;
        rows.push({ origin: T, cohort: c, k: k, actual: row[H], so_far: row[k], run_rate: row[k] * (H + 1) / (k + 1), chain_ladder: project(row, k, f, H) });
      });
    });
    return rows;
  }
  /** Mean absolute percentage error and mean signed error of each method over backtest rows (rows where a method has no forecast are skipped). */
  function backtestScores(rows) {
    var out = {};
    ["so_far", "run_rate", "chain_ladder"].forEach(function (m) {
      var e = [], s = [];
      rows.forEach(function (r) { if (r[m] !== null) { e.push(Math.abs(r[m] - r.actual) / r.actual); s.push((r[m] - r.actual) / r.actual); } });
      out[m] = { n: e.length, mape: e.length ? e.reduce(function (a, b) { return a + b; }, 0) / e.length : null, bias: s.length ? s.reduce(function (a, b) { return a + b; }, 0) / s.length : null };
    });
    return out;
  }
  /** Projected cumulative revenue per customer at index H for cohorts whose month H is not yet observed, using data up to the last complete month. */
  function ltvForecast(P, flt, H, kmin) {
    H = H == null ? 11 : H; kmin = kmin == null ? 3 : kmin;
    var cum = cohortTable(P, 1, flt), f = factors(cum, LAST_COMPLETE_MONTH, H), out = [];
    cum.cohorts.forEach(function (c, a) {
      var row = cum.revenue[a], k = LAST_COMPLETE_MONTH - c;
      if (k < H) out.push({ cohort: c, size: cum.size[a], k: k, known: row[k], projected: k >= kmin ? project(row, k, f, H) : null });
    });
    return { factors: f, rows: out };
  }

  return { SEGMENTS: SEGMENTS, UK: UK, prepare: prepare, cohortTable: cohortTable, rfm: rfm, forward: forward, segmentSummary: segmentSummary, migration: migration,
           customSegment: customSegment, repeatCurve: repeatCurve, factors: factors, project: project, ltvBacktest: ltvBacktest, backtestScores: backtestScores, ltvForecast: ltvForecast,
           ntile: ntile, fScore: fScore, segmentOf: segmentOf, isoOfDay: isoOfDay, dayOfIso: dayOfIso, monthOfDay: monthOfDay, monthLabel: monthLabel, periodLabel: periodLabel };
});
