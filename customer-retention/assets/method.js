(function () {
  const { RT, P, C, esc, fmtN, pct, meta } = APP, $ = (id) => document.getElementById(id), money = (v) => "£" + Math.round(v).toLocaleString("en-US");

  // worked cohort example: March 2010 (month 3), monthly cohorts, all customers
  const t = RT.cohortTable(P, 1, "all"), a = t.cohorts.indexOf(3), n = t.size[a];
  $("ex-cohort").innerHTML = `<p><b>Worked example, computed live.</b> The ${RT.monthLabel(3)} cohort has <b>${fmtN(n)}</b> customers (their first visit was that month).</p>` +
    C.table(["Age k", "Month", "Customers who visited", "Retention", "Cumulative revenue per customer", "Cumulative visits per customer"], [0, 1, 2, 3, 4].map((k) => ({ cells: [k, RT.monthLabel(3 + k), fmtN(Math.round(t.retention[a][k] * n)), pct(t.retention[a][k], 1), "£" + t.revenue[a][k].toFixed(2), t.visits[a][k].toFixed(2)] })), { left: [1] }) +
    '<p class="small">Age 0 is always 100%. Cumulative revenue per customer only ever grows: each age adds that month\'s revenue divided by the cohort size.</p>';

  // worked LTV example
  const fc = RT.ltvForecast(P, "all", 11, 3), f = fc.factors, r = fc.rows.find((x) => x.k === 7);
  if (r) {
    const chain = f.slice(r.k, 11), prod = chain.reduce((x, y) => x * y, 1);
    $("ex-ltv").innerHTML = `<p><b>Worked example, computed live.</b> Growth factors learned from every cohort observed at each age, using data to the end of November 2011:</p>` +
      C.table(["Age step", ...f.map((_, j) => j + "→" + (j + 1))], [{ cells: ["Factor f", ...f.map((v) => (v == null ? "n/a" : v.toFixed(3)))] }], { left: [0] }) +
      `<p>The ${RT.monthLabel(r.cohort)} cohort (${fmtN(r.size)} customers) has been observed for ${r.k + 1} months and has spent ${money(r.known)} per customer so far. To reach age 11 it must pass steps ${r.k}→${r.k + 1} to 10→11:</p>` +
      `<p class="mono">${money(r.known)} × ${chain.map((v) => v.toFixed(3)).join(" × ")} = ${money(r.known)} × ${prod.toFixed(3)} = <b>${money(r.known * prod)}</b></p>` +
      `<p class="small">That equals the projected value shown on the Lifetime value page (${money(r.projected)}).</p>`;
  }

  const g = meta.golden_cases;
  $("validation").innerHTML = `<p>There are two independent implementations: a Python reference that works from order-level rows (<code>src/analytics.py</code>) and the JavaScript engine that runs in this page from compact per-customer visit lists (<code>docs/assets/rt.js</code>). The pipeline exports <b>${g} cases</b> computed by Python to <code>tests/golden.json</code> (cohort tables for months and quarters, all and UK and non-UK customers; segment summaries with look-ahead at six dates; migration between segments; repeat-purchase curves; lifetime-value factors and every backtest row), and <code>node tests/rt.test.js</code> checks that the JavaScript reproduces every one to a relative tolerance of 1e-9.</p>
    <p>Separately, <code>sql/rfm_asof.sql</code> and the cohort views in <code>sql/02_cohorts.sql</code> compute the same customer scores and cohort retention inside SQLite, and <code>tests/test_pipeline.py</code> checks that they match the Python reference on the real warehouse. The tests also cover hand-worked cases: a three-customer cohort, recency and frequency by hand, censoring in repeat curves, the rules of a custom segment, a chain ladder on a cohort that grows exactly 10% a month, and the cleaning rules on a small synthetic file.</p>`;
  const s = meta.source;
  $("prov").innerHTML = `<p>Source: <a href="https://archive.ics.uci.edu/dataset/502/online+retail+ii">Online Retail II</a>, Daqing Chen, UCI Machine Learning Repository, <a href="https://doi.org/10.24432/C5CG6D">doi 10.24432/C5CG6D</a>, licensed under <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>. All transactions of a UK-based, registered, non-store online retailer between 1 December 2009 and 9 December 2011; the company mainly sells all-occasion gift-ware and many customers are wholesalers.</p>` +
    `<p class="small">URL: <code>${esc(s.url)}</code><br>SHA-256 of the downloaded archive: <code>${esc(s.sha256)}</code></p>` +
    `<p>This site changes the data: it removes duplicates and non-sales, merges same-day invoices into visits and aggregates. It ships a compact list of visit days and amounts per customer, with no customer IDs, product or invoice details. The raw file is downloaded by <code>src/download.py</code> and is not part of the repository.</p>`;
})();
