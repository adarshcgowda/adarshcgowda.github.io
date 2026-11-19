/* Shared state, formatting and helpers for every page. Loads after rt.js and the data files. */
(function () {
  const RT = window.RT, meta = window.RT_META, Q = window.RT_QUALITY || null, C = window.FDCharts, P = RT.prepare(window.RT_DATA);
  const esc = C.esc;

  function readHash() {
    const o = {};
    location.hash.replace(/^#/, "").split("&").filter(Boolean).forEach((kv) => { const [k, v] = kv.split("="); o[k] = decodeURIComponent(v || ""); });
    return o;
  }
  function writeHash(o) {
    const h = Object.keys(o).filter((k) => o[k] !== "" && o[k] != null).map((k) => k + "=" + encodeURIComponent(o[k])).join("&");
    history.replaceState(null, "", "#" + h);
  }

  const fmtN = (n) => Math.round(n).toLocaleString("en-US");
  const pct = (v, d) => (v == null ? "n/a" : (v * 100).toFixed(d == null ? 0 : d) + "%");
  const gbp = (v, d) => {
    if (v == null) return "n/a";
    const a = Math.abs(v), s = v < 0 ? "−" : "";
    if (a >= 1e6) return s + "£" + (a / 1e6).toFixed(d == null ? 1 : d) + "m";
    if (a >= 1e4) return s + "£" + (a / 1e3).toFixed(d == null ? 0 : d) + "k";
    return s + "£" + Math.round(a).toLocaleString("en-US");
  };
  const gbp2 = (v) => (v == null ? "n/a" : "£" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

  /** Month-end dates available as snapshot dates: Mar 2010 to Nov 2011 (earlier snapshots have too little history to score). */
  function monthEnds() {
    const out = [];
    for (let m = 3; m <= meta.last_complete_month; m++) {
      const k = m + 11, y = 2009 + Math.floor(k / 12), mo = k % 12;
      out.push(new Date(Date.UTC(y, mo + 1, 0)).toISOString().slice(0, 10));
    }
    return out;
  }
  const asOfOptions = (sel) => monthEnds().map((d) => `<option value="${d}"${d === sel ? " selected" : ""}>${RT.monthLabel(RT.monthOfDay(RT.dayOfIso(d)))} (end)</option>`).join("");

  const FILTERS = [["all", "All customers"], ["uk", "United Kingdom"], ["other", "Outside the UK"]];
  const filterOptions = (sel) => FILTERS.map(([k, l]) => `<option value="${k}"${k === sel ? " selected" : ""}>${l}</option>`).join("");
  const SEG_COLOR = { Champions: "#2dd4bf", Loyal: "#60a5fa", New: "#a78bfa", Promising: "#818cf8", "Needs attention": "#fbbf24", "At risk": "#fb923c", Hibernating: "#94a3b8", Lost: "#f87171" };
  const SEG_NOTE = {
    Champions: "Bought recently and often", Loyal: "Regular buyers, ordered in the last few months", New: "First order was recent", Promising: "Recent, second order",
    "Needs attention": "Middling recency, few orders", "At risk": "Used to buy often, gone quiet", Hibernating: "Quiet for a while, few orders", Lost: "Not seen for a long time, few orders"
  };
  const legend = (items) => '<p class="small">' + items.map(([c, t]) => `<b style="color:${c}">&#9632;</b> ${esc(t)}`).join(" &nbsp; ") + "</p>";

  window.APP = { RT, P, meta, Q, C, esc, readHash, writeHash, fmtN, pct, gbp, gbp2, monthEnds, asOfOptions, FILTERS, filterOptions, SEG_COLOR, SEG_NOTE, legend };
})();
