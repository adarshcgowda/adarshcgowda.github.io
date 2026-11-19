/* Shared page chrome: navigation and the data-honesty footer. */
(function () {
  const pages = [["index.html", "Overview"], ["cohorts.html", "Cohorts"], ["segments.html", "Segments"], ["ltv.html", "Lifetime value"], ["quality.html", "Data quality"], ["method.html", "Method"], ["builder.html", "Build a segment"]];
  const here = location.pathname.split("/").pop() || "index.html";
  document.getElementById("nav").innerHTML = '<span class="brand">Customer retention and lifetime value</span>' +
    pages.map(([f, t]) => `<a href="${f}"${f === here ? ' aria-current="page"' : ""}>${t}</a>`).join("");
  document.getElementById("foot").innerHTML =
    'Data: <a href="https://archive.ics.uci.edu/dataset/502/online+retail+ii">Online Retail II</a> by Daqing Chen (UCI Machine Learning Repository, doi 10.24432/C5CG6D), licensed CC BY 4.0. ' +
    "Real transactions of a UK-based online gift retailer whose customers are largely wholesalers, 1 Dec 2009 to 9 Dec 2011. Customers here are mostly businesses, so patterns may differ from consumer retail. " +
    'Only identified customers are analysed (guest checkouts are excluded; see <a href="quality.html">Data quality</a>). Page shows aggregates and pseudonymous visit patterns, never customer IDs.';
})();
