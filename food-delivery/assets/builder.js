(function () {
  const CUBES = FD.cubes, S = FDStats, C = FDCharts, esc = C.esc, $ = (id) => document.getElementById(id);
  const KEY = "fd-pins-v1", MAXPINS = 8;
  const NATURAL = { Month: ["Feb", "Mar", "Apr"], Traffic: ["Low", "Medium", "High", "Jam", "Missing"], "Deliveries carried": ["0", "1", "2", "3", "Missing"],
    "Price band": ["Budget (<=250)", "Mid (251-500)", "Upper-mid (501-1000)", "Premium (>1000)", "Unknown"] };
  const DEFAULT = { ds: "ops", m: "late_rate", g: 2, g2: -1, t: "bar", sort: "natural", top: 15, min: 30, f: {}, title: "" };
  const RECIPES = [
    ["Late rate by traffic", { ds: "ops", m: "late_rate", g: 2, g2: -1, t: "bar", sort: "natural", min: 30 }],
    ["Speed by traffic and load", { ds: "ops", m: "avg_time", g: 2, g2: 6, t: "heat", sort: "natural", min: 30 }],
    ["Orders by month", { ds: "ops", m: "orders", g: 1, g2: -1, t: "col", sort: "natural", min: 0 }],
    ["Bangalore: listings by area", { ds: "restaurants", m: "listings", g: 0, g2: -1, t: "bar", sort: "value", min: 0, top: 15 }],
    ["Rating by price band and ownership", { ds: "restaurants", m: "wrating", g: 2, g2: 4, t: "heat", sort: "natural", min: 20 }],
  ];
  let st = Object.assign({}, DEFAULT);

  const cube = () => CUBES[st.ds];
  const fmtFor = (m) => (m[2] === "sum" ? (v) => S.fmtInt(v) : m[2] === "pct" ? (v) => v.toFixed(1) + "%" : /rating|wrating/.test(m[0]) ? (v) => v.toFixed(2) : (v) => v.toFixed(1));

  // ---- state in the URL hash, so a view can be shared
  function toHash() {
    const f = Object.entries(st.f).filter(([, v]) => v.length).map(([d, v]) => d + ":" + v.join(".")).join(";");
    return new URLSearchParams({ ds: st.ds, m: st.m, g: st.g, g2: st.g2, t: st.t, sort: st.sort, top: st.top, min: st.min, f, title: st.title }).toString();
  }
  function fromHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    if (!p.get("ds") || !CUBES[p.get("ds")]) return;
    st = Object.assign({}, DEFAULT, { ds: p.get("ds"), m: p.get("m"), g: +p.get("g"), g2: +p.get("g2"), t: p.get("t") || "bar", sort: p.get("sort") || "value", top: +p.get("top") || 15, min: +p.get("min") || 0, title: p.get("title") || "" });
    st.f = {};
    (p.get("f") || "").split(";").filter(Boolean).forEach((x) => { const [d, v] = x.split(":"); st.f[d] = v.split(".").filter((s) => s !== "").map(Number); });
  }

  // ---- controls
  function fillControls() {
    const cb = cube();
    $("ds").innerHTML = Object.entries(CUBES).map(([k, c]) => `<option value="${k}">${esc(c.name)}</option>`).join("");
    $("ds").value = st.ds;
    $("m").innerHTML = cb.measures.map((m) => `<option value="${m[0]}">${esc(m[1])}</option>`).join("");
    if (!cb.measures.some((m) => m[0] === st.m)) st.m = cb.measures[0][0];
    $("m").value = st.m;
    const dimOpts = cb.dims.map((d, i) => `<option value="${i}">${esc(d)}</option>`).join("");
    $("g").innerHTML = dimOpts; $("g2").innerHTML = '<option value="-1">None</option>' + dimOpts;
    if (st.g >= cb.dims.length) st.g = 0;
    if (st.g2 >= cb.dims.length) st.g2 = -1;
    $("g").value = st.g; $("g2").value = st.g2;
    ["t", "sort", "top", "min", "title"].forEach((id) => { $(id).value = st[id]; });
    $("filters").innerHTML = cb.dims.map((d, i) => {
      const sel = st.f[i] || [];
      return `<details><summary>${esc(d)} ${sel.length ? `<span class="pill good">${sel.length} selected</span>` : '<span class="small">all</span>'}</summary><div style="display:flex;flex-wrap:wrap;gap:4px 14px;padding:8px 0">` +
        cb.vocab[i].map((v, j) => `<label style="flex-direction:row;align-items:center;gap:5px"><input type="checkbox" data-d="${i}" data-v="${j}" ${sel.includes(j) ? "checked" : ""}>${esc(v)}</label>`).join("") + "</div></details>";
    }).join("");
  }
  const orderOf = (dim, labels) => {
    const nat = NATURAL[cube().dims[dim]];
    return nat ? (a, b) => (nat.indexOf(a) < 0 ? 99 : nat.indexOf(a)) - (nat.indexOf(b) < 0 ? 99 : nat.indexOf(b)) : (a, b) => (a < b ? -1 : 1);
  };

  // ---- build the chart for the current state; returns {svg, note}
  function buildChart() {
    const cb = cube(), m = cb.measures.find((x) => x[0] === st.m), fmt = fmtFor(m);
    const rows = S.query(cb, { group: st.g, group2: st.g2 >= 0 && st.g2 !== st.g ? st.g2 : null, measure: st.m, filters: st.f, minN: st.min }).filter((r) => r.value != null);
    if (!rows.length) return { svg: '<div class="callout bad">No groups meet the filters and the minimum row count. Lower the minimum or widen the filters.</div>', note: "" };
    const two = rows[0].label2 != null, total = rows.reduce((s, r) => s + r.n, 0);
    const cmp = orderOf(st.g);
    let svg;
    if (st.t === "heat") {
      if (!two) return { svg: '<div class="callout">A heatmap needs a second grouping. Choose "Split by".</div>', note: "" };
      const rl = [...new Set(rows.map((r) => r.label))].sort(orderOf(st.g)), cl = [...new Set(rows.map((r) => r.label2))].sort(orderOf(st.g2));
      const val = rl.map((a) => cl.map((b) => { const r = rows.find((x) => x.label === a && x.label2 === b); return r ? r.value : null; }));
      svg = C.heat({ rows: rl.slice(0, st.top), cols: cl.slice(0, 24), values: val.slice(0, st.top).map((r) => r.slice(0, 24)), fmt, labelW: 130, zeroBased: m[2] === "sum" || m[2] === "pct", label: m[1] });
    } else {
      let items = rows.map((r) => ({ label: two ? r.label + " · " + r.label2 : r.label, value: r.value, n: r.n, key: r.label, key2: r.label2 }));
      if (st.sort === "value") items.sort((a, b) => b.value - a.value);
      else if (st.sort === "label") items.sort((a, b) => (a.label < b.label ? -1 : 1));
      else items.sort((a, b) => cmp(a.key, b.key) || (two ? orderOf(st.g2)(a.key2, b.key2) : 0));
      items = items.slice(0, st.top);
      if (st.t === "bar") svg = C.barH(items.map((i) => ({ label: i.label, value: i.value, note: S.fmtInt(i.n) + " rows" })), { fmt, labelW: 190, label: m[1] });
      else if (st.t === "col") svg = C.columns(items.map((i) => ({ label: i.label.length > 12 ? i.label.slice(0, 11) + "…" : i.label, value: i.value })), { fmt, label: m[1] });
      else if (st.t === "line") svg = C.line({ points: items.map((i) => ({ x: i.label, y: i.value, tip: `${i.label}: ${fmt(i.value)} (${S.fmtInt(i.n)} rows)` })), fmt, xticks: items.map((i, k) => ({ i: k, label: i.label.length > 10 ? i.label.slice(0, 9) + "…" : i.label })), yMin: m[2] === "sum" ? 0 : undefined, label: m[1] });
      else svg = C.table([cb.dims[st.g], two ? cb.dims[st.g2] : "", m[1], "Rows"].filter((h) => h !== ""), items.map((i) => ({ cells: [esc(i.key)].concat(two ? [esc(i.key2)] : []).concat([fmt(i.value), S.fmtInt(i.n)]) })), { left: two ? [0, 1] : [0] });
    }
    return { svg, note: `${rows.length} groups, ${S.fmtInt(total)} rows behind the chart. Groups with fewer than ${st.min} rows are hidden.` };
  }
  const autoTitle = () => { const cb = cube(), m = cb.measures.find((x) => x[0] === st.m); return `${m[1]} by ${cb.dims[st.g]}${st.g2 >= 0 && st.g2 !== st.g ? " and " + cb.dims[st.g2] : ""}`; };

  function render() {
    const out = buildChart();
    $("preview").innerHTML = out.svg;
    $("support").textContent = out.note;
    $("title").placeholder = autoTitle();
    history.replaceState(null, "", "#" + toHash());
  }

  // ---- pins
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; } };
  const save = (p) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { $("msg").textContent = "Could not save in this browser (storage is blocked). Download still works for this session."; } };
  let pins = load();
  function drawPins() {
    $("pincount").textContent = pins.length ? `${pins.length} of ${MAXPINS} pinned, saved in this browser` : "Nothing pinned yet. Build a chart above and press Pin.";
    $("pins").innerHTML = pins.map((p, i) => `<div class="card pin"><button class="x" data-i="${i}" aria-label="Remove">x</button><h3>${esc(p.title)}</h3><p>${esc(p.note)}</p>${p.svg}</div>`).join("");
  }
  $("pins").onclick = (e) => { if (e.target.dataset.i != null) { pins.splice(+e.target.dataset.i, 1); save(pins); drawPins(); } };
  $("pin").onclick = () => {
    if (pins.length >= MAXPINS) { $("msg").textContent = `Limit of ${MAXPINS} charts. Remove one first.`; return; }
    const out = buildChart();
    if (out.svg.includes("callout")) { $("msg").textContent = "Fix the chart before pinning."; return; }
    pins.push({ title: st.title || autoTitle(), note: out.note, svg: out.svg });
    save(pins); drawPins(); $("msg").textContent = "Pinned.";
  };
  $("clear").onclick = () => { pins = []; save(pins); drawPins(); };
  $("dl").onclick = () => {
    if (!pins.length) { $("msg").textContent = "Pin at least one chart first."; return; }
    const css = "body{margin:0;background:#0b1220;color:#e6edf7;font:16px/1.5 system-ui,sans-serif}.w{max-width:1000px;margin:0 auto;padding:24px 16px}.g{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:14px}.c{background:#111c31;border:1px solid #22324d;border-radius:12px;padding:14px}h1{margin:0 0 4px}h3{margin:0}p{color:#8fa3bf;font-size:.85rem;margin:2px 0 10px}.chart{width:100%;height:auto}table{width:100%;border-collapse:collapse;font-size:.85rem}th,td{padding:5px 8px;text-align:right;border-bottom:1px solid #22324d}th:first-child,td:first-child,.l{text-align:left}th{color:#8fa3bf}";
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>My dashboard</title><style>${css}</style></head><body><div class="w"><h1>My dashboard</h1><p>Built from open Zomato datasets with the food-delivery-intelligence builder. Data is aggregated, simulated-looking and for demonstration.</p><div class="g">` +
      pins.map((p) => `<div class="c"><h3>${esc(p.title)}</h3><p>${esc(p.note)}</p>${p.svg}</div>`).join("") + "</div></div></body></html>";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([html], { type: "text/html" })); a.download = "my-dashboard.html"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  // ---- wiring
  function read() {
    st.ds = $("ds").value; st.m = $("m").value; st.g = +$("g").value; st.g2 = +$("g2").value; st.t = $("t").value; st.sort = $("sort").value;
    st.top = Math.min(40, Math.max(3, +$("top").value || 15)); st.min = Math.max(0, +$("min").value || 0); st.title = $("title").value;
  }
  ["m", "g", "g2", "t", "sort", "top", "min", "title"].forEach((id) => { $(id).oninput = () => { read(); render(); }; });
  $("ds").onchange = () => { const ds = $("ds").value; st = Object.assign({}, DEFAULT, { ds, g: 0, m: CUBES[ds].measures[0][0], f: {}, min: ds === "ops" ? 30 : 5, sort: "value" }); fillControls(); render(); };
  $("filters").onchange = (e) => {
    const d = e.target.dataset.d, v = +e.target.dataset.v; if (d == null) return;
    const cur = new Set(st.f[d] || []); e.target.checked ? cur.add(v) : cur.delete(v); st.f[d] = [...cur];
    fillControls(); render();
  };
  $("reset").onclick = () => { st = Object.assign({}, DEFAULT); fillControls(); render(); };
  $("link").onclick = () => { navigator.clipboard.writeText(location.href).then(() => { $("msg").textContent = "Link copied."; }, () => { $("msg").textContent = "Copy this page's address from the browser bar."; }); };
  $("recipes").innerHTML = RECIPES.map((r, i) => `<button data-i="${i}">${esc(r[0])}</button>`).join("");
  $("recipes").onclick = (e) => { if (e.target.dataset.i != null) { st = Object.assign({}, DEFAULT, RECIPES[+e.target.dataset.i][1], { f: {} }); fillControls(); render(); } };

  fromHash(); fillControls(); render(); drawPins();
})();
