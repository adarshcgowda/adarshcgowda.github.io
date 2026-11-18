/* Explorer page: all views recompute from the pre-aggregated cube in the browser. Pure logic lives in fdexplore.js (unit-tested). */
(function () {
  const CUBE = FD.cubes.ops, MON = FD.monitor, Q = FD.quality, S = FDStats, X = FDExplore, V = FDViz, C = FDCharts, esc = C.esc, $ = (id) => document.getElementById(id);
  const DIMS = CUBE.dims, MEAS = CUBE.measures, MINN = 50, SPLITN = 100; // MINN: flag small samples; SPLITN: smallest slice the auto-split and "follow the problem" will trust
  const NATURAL = { Month: ["Feb", "Mar", "Apr"], Traffic: ["Low", "Medium", "High", "Jam", "Missing"], "Deliveries carried": ["0", "1", "2", "3", "Missing"] };
  const DEFAULT_ORDER = [0, 2, 3, 4, 5, 6, 1];
  const TABS = [["story", "Story"], ["overview", "Breakdown"], ["drill", "Drill-down"], ["tree", "Decomposition tree"], ["treemap", "Shapes"], ["hot", "Hot spots"]];
  const fresh = () => ({ tab: "story", m: "late_rate", f: {}, drill: [], dstart: 0, tree: {}, tm: [], tmNext: -1, segMin: 150, hx: 2, hy: 6, shape: "treemap", bub: 0, fa: 2, fb: 6 });
  const st = fresh();

  // ---------- formatting and colour
  const M = () => X.measureOf(CUBE, st.m);
  const fmtV = (v, key) => { key = key || st.m; return v == null ? "n/a" : key === "orders" ? S.fmtInt(v) : key === "late_rate" ? v.toFixed(1) + "%" : key === "avg_rating" ? v.toFixed(2) : v.toFixed(1); };
  const gapTxt = (a, b) => (st.m === "late_rate" ? (a - b).toFixed(1) + " pts" : st.m === "avg_rating" ? (a - b).toFixed(2) : (a - b).toFixed(1) + " min");
  const rel = (v, ref) => (v == null || !ref ? null : (v - ref) / Math.abs(ref));
  const pctTxt = (r) => (r == null ? "" : (r >= 0 ? "+" : "") + (r * 100).toFixed(0) + "%");
  const lerp = (a, b, k) => Math.round(a + (b - a) * k);
  const col = (t) => {
    if (!t) return "#5b7aa3";
    const k = Math.min(1, Math.abs(t)), to = t > 0 ? [248, 113, 113] : [45, 212, 191];
    return `rgb(${lerp(91, to[0], k)},${lerp(122, to[1], k)},${lerp(163, to[2], k)})`;
  };
  const mLabel = () => M()[1];
  const dimsFree = (extra) => DIMS.map((_, d) => d).filter((d) => !(st.f[d] && st.f[d].length) && !(extra || []).includes(d));
  const sortGroups = (dim, gs) => {
    const nat = NATURAL[DIMS[dim]], dir = X.badDir(st.m);
    if (nat) return gs.sort((a, b) => (nat.indexOf(a.label) < 0 ? 99 : nat.indexOf(a.label)) - (nat.indexOf(b.label) < 0 ? 99 : nat.indexOf(b.label)));
    return gs.sort((a, b) => (dir ? (b.value == null) - (a.value == null) || dir * (b.value - a.value) : b.n - a.n));
  };
  function nextDim(used, preferred) {
    const order = (preferred >= 0 ? [preferred] : []).concat(DEFAULT_ORDER);
    return order.find((d) => dimsFree(used).includes(d));
  }

  // ---------- shared building blocks
  function barRows(gs, o) {
    const dir = X.badDir(st.m), vals = gs.map((g) => g.value).filter((v) => v != null), max = Math.max(...vals, 1e-9);
    return '<div class="brows">' + gs.map((g) => {
      const t = o.ref != null && dir ? X.tone(st.m, g.value, o.ref, 0.2) : 0, w = g.value == null ? 0 : Math.max(1.5, 100 * g.value / max);
      const r = o.ref != null && st.m !== "orders" ? rel(g.value, o.ref) : null, on = o.selected && o.selected(g);
      const refPos = o.ref != null && st.m !== "orders" ? Math.min(100, 100 * o.ref / max) : null;
      const col2 = st.m === "orders" ? "#5b7aa3" : col(t);
      return `<button class="brow${on ? " on" : ""}" data-act="${o.act}" data-d="${o.dim}" data-i="${g.i}"${o.j != null ? ` data-j="${o.j}"` : ""} title="${esc(g.label)}: ${esc(fmtV(g.value))} from ${S.fmtInt(g.n)} orders${r != null ? ", " + pctTxt(r) + " vs reference" : ""}${g.n < MINN ? " (small sample)" : ""}" style="${g.n < MINN ? "opacity:.55" : ""}">` +
        `<span class="lab">${esc(g.label)}</span><span class="track"><span class="fill" style="width:${w.toFixed(1)}%;background:${col2}"></span>${refPos != null ? `<span class="ref" style="left:${refPos.toFixed(1)}%"></span>` : ""}</span>` +
        `<span class="val">${esc(fmtV(g.value))}${r != null && o.delta ? `<small>${pctTxt(r)}</small>` : ""}</span></button>`;
    }).join("") + "</div>";
  }
  const legend = () => (st.m === "orders" ? '<div class="legend"><span>Bar length = orders. Click a bar to filter.</span></div>'
    : '<div class="legend"><span><i style="background:#f87171"></i>worse than reference</span><span><i style="background:#5b7aa3"></i>about the same</span><span><i style="background:#2dd4bf"></i>better</span><span>white tick = reference</span></div>');
  const card = (title, sub, body, cls) => `<div class="card ${cls || ""}"><h3>${title}</h3>${sub ? `<p>${sub}</p>` : ""}${body}</div>`;
  const groupsOf = (f, dim) => X.group(CUBE, f, dim, st.m);
  const valOf = (f) => { const v = X.total(CUBE, f); return { v, n: v[0], value: S.measureValue(M(), v) }; };
  const segName = (a, ai, b, bi) => `${DIMS[a]} = ${CUBE.vocab[a][ai]} · ${DIMS[b]} = ${CUBE.vocab[b][bi]}`;

  // ---------- filter bar, chips, tabs
  function renderBar() {
    $("bar").innerHTML = `<label>Metric<select data-chg="m">${MEAS.map((m) => `<option value="${m[0]}"${m[0] === st.m ? " selected" : ""}>${esc(m[1])}</option>`).join("")}</select></label>` +
      DIMS.map((d, i) => `<label>${esc(d)}<select data-chg="fd" data-d="${i}"><option value="">All</option>${CUBE.vocab[i].map((v, j) => `<option value="${j}"${(st.f[i] || [])[0] === j && (st.f[i] || []).length === 1 ? " selected" : ""}>${esc(v)}</option>`).join("")}</select></label>`).join("") +
      '<button data-act="reset">Reset all</button>';
    const chips = Object.entries(st.f).filter(([, v]) => v.length).map(([d, v]) => `<span class="chip">${esc(DIMS[d])}: ${esc(v.map((j) => CUBE.vocab[d][j]).join(", "))}<button data-act="unf" data-d="${d}" aria-label="Remove filter">×</button></span>`);
    const tot = X.total(CUBE, st.f)[0];
    $("chips").innerHTML = `<button data-act="hback" ${pos > 0 ? "" : "disabled"} title="Undo the last change (also Alt + Left)">← Back</button><button data-act="hfwd" ${pos < snaps.length - 1 ? "" : "disabled"} title="Redo">Forward →</button>` + (chips.length ? chips.join("") : '<span class="small">No filters. Click any bar, or use the boxes above, to focus.</span>') + `<span class="small" style="margin-left:auto">${S.fmtInt(tot)} of ${S.fmtInt(FD.meta.orders)} orders in view</span>`;
    $("tabs").innerHTML = TABS.map(([k, t]) => `<button role="tab" aria-selected="${k === st.tab}" data-act="tab" data-tab="${k}">${t}</button>`).join("") + '<span class="hint">Tip: copy the address bar to share this exact view</span>';
  }

  // ---------- Overview
  function insights() {
    const out = [], m = M(), artifact = (v) => (st.m === "late_rate" && v >= 99.9 ? " A perfect 100% is a deterministic pattern in this file, not a real-world finding (<a href=\"quality.html\">Data quality</a>)." : "");
    if (m[2] === "sum") {
      const s = X.autoSplit(CUBE, st.f, "orders", 1);
      if (s) out.push(["Concentration", `<b>Concentration</b>${esc(DIMS[s.dim])}: <b>${esc(s.hi.label)}</b> holds ${(100 * s.score).toFixed(0)}% of the orders in view.`, "good"]);
    } else {
      const sp = dimsFree().map((d) => X.spread(CUBE, st.f, d, st.m, 100)).filter(Boolean).sort((a, b) => b.score - a.score);
      if (sp.length) {
        const w = sp[0];
        out.push(["Widest gap", `<b>Widest gap</b><b>${esc(DIMS[w.dim])}</b> moves ${esc(mLabel().toLowerCase())} the most: ${esc(w.hi.label)} is ${esc(fmtV(w.hi.value))} against ${esc(w.lo.label)} at ${esc(fmtV(w.lo.value))}, a gap of ${esc(gapTxt(w.hi.value, w.lo.value))} (${(100 * w.score).toFixed(0)}% of the average).${artifact(w.hi.value)}`, "warn"]);
        const q = sp[sp.length - 1];
        if (sp.length > 1) {
          const city = q.dim === 0 && q.score < 0.12;
          out.push([city ? "Suspiciously alike" : "Weakest factor", `<b>${city ? "Suspiciously alike" : "Weakest factor"}</b>` + (city
            ? `All ${q.groups} cities sit within ${esc(gapTxt(q.hi.value, q.lo.value))} of each other. Real cities usually differ more, which is one sign the data is generated. <a href="quality.html">See the evidence</a>.`
            : `<b>${esc(DIMS[q.dim])}</b> barely matters here: the best and worst groups differ by only ${esc(gapTxt(q.hi.value, q.lo.value))}.`), city ? "bad" : "good"]);
        }
      }
      const seg = X.segments(CUBE, st.f, st.m, 150).ranked[0];
      if (seg) out.push(["Hot spot", `<b>Worst hot spot</b>${esc(segName(seg.a, seg.ai, seg.b, seg.bi))}: ${esc(fmtV(seg.value))} (${pctTxt(seg.lift)} vs the view average) across ${S.fmtInt(seg.n)} orders.${artifact(seg.value)} <a href="#" data-act="goto" data-tab="hot">Open hot spots</a>`, "bad"]);
    }
    return out.map(([, h, c]) => `<div class="insight ${c}">${h}</div>`).join("");
  }
  function kpiRow() {
    const all = X.total(CUBE, {}), cur = X.total(CUBE, st.f), filtered = Object.values(st.f).some((v) => v.length);
    return MEAS.map((m) => {
      const v = S.measureValue(m, cur), a = S.measureValue(m, all), r = rel(v, a), dir = X.badDir(m[0]);
      let d = '<span class="d flat">all data</span>';
      if (m[0] === "orders") d = `<span class="d flat">${(100 * cur[0] / all[0]).toFixed(1)}% of all orders</span>`;
      else if (filtered && r != null) { const bad = dir * r > 0.005, good = dir * r < -0.005; d = `<span class="d ${bad ? (r > 0 ? "up-bad" : "dn-bad") : good ? (r > 0 ? "up-good" : "dn-good") : "flat"}">${r >= 0 ? "▲" : "▼"} ${pctTxt(r)} vs all data (${fmtV(a, m[0])})</span>`; }
      return `<div class="kpi"><b>${esc(fmtV(v, m[0]))}</b><span>${esc(m[1])}</span>${d}</div>`;
    }).join("");
  }
  function renderOverview() {
    const all = X.total(CUBE, {}), cur = X.total(CUBE, st.f), filtered = Object.values(st.f).some((v) => v.length);
    if (!cur[0]) return '<div class="callout bad">No orders match this combination of filters. Remove a filter above.</div>';
    const kp = kpiRow();
    const ref = st.m === "orders" ? null : S.measureValue(M(), cur);
    const order = [2, 0, 3, 4, 5, 6, 1];
    const cards = order.map((d) => {
      const gs = sortGroups(d, groupsOf(st.f, d).filter((g) => g.n > 0)), sel = st.f[d] || [];
      const note = DIMS[d] === "Month" ? " February covers different cities from March and April, so month gaps mix in city mix." : "";
      return card(`${esc(mLabel())} by ${esc(DIMS[d])}`, `Click a bar to filter everything on this page.${note}`, barRows(gs, { act: "flt", dim: d, ref, selected: (g) => sel.includes(g.i) }), d === 0 ? "wide" : "");
    });
    return `<div class="kpis">${kp}</div><div class="insights">${insights()}</div>${legend()}<div class="grid" style="margin-top:10px">${cards.join("")}</div>`;
  }

  // ---------- Drill-down
  function renderDrill() {
    const path = st.drill, startOpts = dimsFree().map((d) => `<option value="${d}"${d === st.dstart ? " selected" : ""}>${esc(DIMS[d])}</option>`).join("");
    let html = `<div class="bar"><label>Start with<select data-chg="dstart">${startOpts}</select></label><button data-act="dreset">Back to the top</button><span class="small">Click a bar to drill into it. The next level picks the next factor automatically.</span></div>`;
    html += `<div class="crumbs"><button data-act="dcrumb" data-j="0"${path.length ? "" : " aria-current=step"}>All orders in view</button>` +
      path.map((p, j) => `<span class="sep">›</span><button data-act="dcrumb" data-j="${j + 1}"${j === path.length - 1 ? " aria-current=step" : ""}>${esc(DIMS[p.d])}: ${esc(CUBE.vocab[p.d][p.v])}</button>`).join("") + "</div>";
    const levels = []; let f = X.merge(st.f), used = [];
    for (let j = 0; j <= path.length; j++) {
      const dim = j < path.length ? path[j].d : nextDim(used, j === 0 ? st.dstart : -1);
      if (dim == null) { levels.push('<div class="callout good"><b>End of the road.</b> Every factor is already fixed, so this is the most specific slice available.</div>'); break; }
      const here = valOf(f), gs = sortGroups(dim, groupsOf(f, dim).filter((g) => g.n > 0)), sel = j < path.length ? path[j].v : null;
      let call = "";
      if (j === path.length && st.m !== "orders") {
        const dir = X.badDir(st.m), ok = gs.filter((g) => g.n >= MINN && g.value != null).sort((a, b) => dir * (b.value - a.value));
        if (ok.length > 1) call = `<div class="callout" style="margin:10px 0 0">Worst: <b>${esc(ok[0].label)}</b> at ${esc(fmtV(ok[0].value))} (${pctTxt(rel(ok[0].value, here.value))} vs this slice). Best: <b>${esc(ok[ok.length - 1].label)}</b> at ${esc(fmtV(ok[ok.length - 1].value))}.</div>`;
      }
      const scope = path.slice(0, j).map((p) => `${DIMS[p.d]}: ${CUBE.vocab[p.d][p.v]}`).join(" › ") || "all orders in view";
      levels.push(card(`${esc(mLabel())} by ${esc(DIMS[dim])}<small>${esc(scope)} · ${S.fmtInt(here.n)} orders · slice average ${esc(fmtV(here.value))}</small>`, "",
        barRows(gs, { act: "drill", dim, j, ref: st.m === "orders" ? null : here.value, delta: true, selected: (g) => g.i === sel }) + call, "level"));
      if (j < path.length) { f = X.merge(f, { [dim]: [path[j].v] }); used.push(dim); }
    }
    return html + legend() + `<div class="levels" style="margin-top:10px">${levels.join("")}</div>`;
  }

  // ---------- Decomposition tree
  const pid = (p) => p.map((x) => x.d + "=" + x.v).join("/") || "root";
  function treeNode(path, depth, parent, siblingMax, worstId) {
    const id = pid(path), f = X.merge(st.f, X.pathFilters(path)), cur = valOf(f), split = st.tree[id], m = M(), dir = X.badDir(st.m);
    const used = path.map((p) => p.d), canSplit = dimsFree(used).length > 0 && cur.n >= SPLITN, open = split !== undefined && canSplit;
    const last = path[path.length - 1], name = last ? `${esc(CUBE.vocab[last.d][last.v])} <small>${esc(DIMS[last.d])}</small>` : "All orders in view";
    const r = parent && st.m !== "orders" ? rel(cur.value, parent.value) : null, share = parent ? cur.n / parent.n : 1;
    const fill = st.m === "orders" ? 100 * share : cur.value == null ? 0 : Math.max(2, 100 * cur.value / (siblingMax || cur.value || 1));
    const t = parent && dir ? X.tone(st.m, cur.value, parent.value, 0.2) : 0;
    let html = `<div class="tn${id === worstId ? " worst" : ""}" style="--d:${depth}"><button class="tg" data-act="ttoggle" data-id="${id}"${canSplit ? "" : " disabled"} aria-expanded="${open}" aria-label="Expand or collapse">${open ? "▾" : "▸"}</button>` +
      `<span class="nm" title="${esc(name.replace(/<[^>]+>/g, ""))}">${name}</span><span class="track"><span class="fill" style="width:${fill.toFixed(1)}%;background:${st.m === "orders" ? "#5b7aa3" : col(t)}"></span></span>` +
      `<span class="num">${esc(fmtV(cur.value))}</span><span class="num n">${S.fmtInt(cur.n)}${parent ? ` <small class="small">${(100 * share).toFixed(0)}%</small>` : ""}</span><span class="num" style="color:${t > 0.05 ? "var(--red)" : t < -0.05 ? "var(--teal)" : "var(--soft)"}">${r == null ? "" : pctTxt(r)}</span></div>`;
    if (!open) return html;
    const auto = split === "auto" ? X.autoSplit(CUBE, f, st.m, SPLITN) : null, dim = split === "auto" ? (auto ? auto.dim : dimsFree(used)[0]) : +split;
    const opts = `<option value="auto"${split === "auto" ? " selected" : ""}>Auto: widest gap</option>` + dimsFree(used).map((d) => `<option value="${d}"${split !== "auto" && +split === d ? " selected" : ""}>${esc(DIMS[d])}</option>`).join("");
    const why = auto && st.m !== "orders" ? `<span class="why">auto chose ${esc(DIMS[auto.dim])}: ${esc(auto.hi.label)} ${esc(fmtV(auto.hi.value))} vs ${esc(auto.lo.label)} ${esc(fmtV(auto.lo.value))}</span>` : "";
    html += `<div class="tsplit" style="--d:${depth}">split by <select data-chg="tsplit" data-id="${id}">${opts}</select>${why}</div>`;
    const kids = sortGroups(dim, groupsOf(f, dim).filter((g) => g.n > 0)), ok = kids.filter((g) => g.n >= SPLITN && g.value != null).sort((a, b) => (dir || 1) * (b.value - a.value));
    const wid = st.m === "orders" ? null : ok.length > 1 ? pid(path.concat({ d: dim, v: ok[0].i })) : null, mx = Math.max(...kids.map((g) => g.value || 0), 1e-9);
    kids.forEach((g) => { html += treeNode(path.concat({ d: dim, v: g.i }), depth + 1, cur, mx, wid); });
    return html;
  }
  function expandPath(path) { st.tree = {}; for (let k = 0; k <= path.length; k++) st.tree[pid(path.slice(0, k))] = "auto"; }
  function expandDepth(path, depth) {
    if (depth === 0) return;
    const f = X.merge(st.f, X.pathFilters(path)), cur = valOf(f);
    if (cur.n < SPLITN || !dimsFree(path.map((p) => p.d)).length) return;
    st.tree[pid(path)] = "auto";
    const s = X.autoSplit(CUBE, f, st.m, SPLITN);
    if (!s) return;
    groupsOf(f, s.dim).filter((g) => g.n >= SPLITN).forEach((g) => expandDepth(path.concat({ d: s.dim, v: g.i }), depth - 1));
  }
  function renderTree() {
    if (!X.total(CUBE, st.f)[0]) return '<div class="callout bad">No orders match the filters.</div>';
    const wp = st.m === "orders" ? [] : X.worstPath(CUBE, st.f, st.m, SPLITN, 5);
    let answer = "";
    if (wp.length) {
      const end = valOf(X.merge(st.f, X.pathFilters(wp))), base = valOf(st.f);
      answer = `<div class="callout bad"><b>The problem lives here.</b> Following the worst branch at each split: ${wp.map((p) => `<b>${esc(DIMS[p.d])} ${esc(CUBE.vocab[p.d][p.v])}</b>`).join(" › ")} reaches ${esc(fmtV(end.value))} ${esc(mLabel().toLowerCase())} across ${S.fmtInt(end.n)} orders, against ${esc(fmtV(base.value))} overall (${pctTxt(rel(end.value, base.value))}).</div>`;
    }
    const bar = '<div class="bar"><button class="primary" data-act="follow">Follow the problem</button><button data-act="expand2">Expand 2 levels</button><button data-act="collapse">Collapse all</button><span class="small">Each node splits by the factor with the widest gap, or pick your own. Red outline = the worst branch at that split. Slices under 100 orders are too small to split.</span></div>';
    if (!Object.keys(st.tree).length) st.tree.root = "auto";
    const head = '<div class="thead"><span></span><span>Segment</span><span>' + esc(mLabel()) + '</span><span>Value</span><span>Orders</span><span>vs parent</span></div>';
    return bar + answer + legend() + card("Decomposition tree", "Click ▸ to open a node. Colour compares each segment with its parent.", `<div class="tree">${head}${treeNode([], 0, null, null, null)}</div>`);
  }

  // ---------- Treemap
  function renderTreemap() {
    const path = st.tm, f = X.merge(st.f, X.pathFilters(path)), here = valOf(f);
    if (!here.n) return '<div class="callout bad">No orders match the filters.</div>';
    const dim = nextDim(path.map((p) => p.d), st.tmNext);
    const opts = '<option value="-1">Next factor automatically</option>' + dimsFree(path.map((p) => p.d)).map((d) => `<option value="${d}"${d === st.tmNext ? " selected" : ""}>${esc(DIMS[d])}</option>`).join("");
    const toggle = `<div class="tab" style="margin:0">${[["treemap", "Treemap"], ["sunburst", "Sunburst"]].map(([k, t]) => `<button data-act="shape" data-shape="${k}" aria-pressed="${st.shape === k}">${t}</button>`).join("")}</div>`;
    let html = `<div class="bar">${toggle}<label>${st.shape === "sunburst" ? "Innermost ring" : "Split by"}<select data-chg="tmnext">${opts}</select></label><button data-act="tmreset">Back to the top</button><span class="small">${st.shape === "sunburst" ? "Arc angle = orders. Arc colour" : "Tile size = orders. Tile colour"} = ${esc(mLabel().toLowerCase())} against the parent. Click to zoom in.</span></div>`;
    html += `<div class="crumbs"><button data-act="tmcrumb" data-j="0"${path.length ? "" : " aria-current=step"}>All orders in view</button>` +
      path.map((p, j) => `<span class="sep">›</span><button data-act="tmcrumb" data-j="${j + 1}"${j === path.length - 1 ? " aria-current=step" : ""}>${esc(DIMS[p.d])}: ${esc(CUBE.vocab[p.d][p.v])}</button>`).join("") + "</div>";
    if (dim == null) return html + '<div class="callout good">This is the most specific slice. Go up a level to compare siblings.</div>';
    if (st.shape === "sunburst") return html + legend() + sunburstCard(f, here, path);
    const gs = groupsOf(f, dim).filter((g) => g.n > 0), W = 960, H = 440, dir = X.badDir(st.m);
    const tiles = X.treemap(gs.map((g) => Object.assign({ size: g.n }, g)), 0, 0, W, H);
    const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Treemap of orders by ${esc(DIMS[dim])}">` + tiles.map((t) => {
      const tn = dir ? X.tone(st.m, t.value, here.value, 0.2) : 0, big = t.w > 84 && t.h > 40, mid = t.w > 46 && t.h > 24;
      return `<g><rect data-act="tm" data-d="${dim}" data-i="${t.i}" x="${t.x.toFixed(1)}" y="${t.y.toFixed(1)}" width="${t.w.toFixed(1)}" height="${t.h.toFixed(1)}" rx="4" fill="${st.m === "orders" ? "#3b5b86" : col(tn)}"><title>${esc(t.label)}: ${S.fmtInt(t.n)} orders, ${esc(mLabel())} ${esc(fmtV(t.value))}${st.m !== "orders" ? " (" + pctTxt(rel(t.value, here.value)) + " vs parent)" : ""}</title></rect>` +
        (mid ? `<text x="${(t.x + 8).toFixed(1)}" y="${(t.y + 18).toFixed(1)}" font-size="${big ? 13 : 11}" font-weight="600">${esc(t.label.length > t.w / 7 ? t.label.slice(0, Math.max(3, Math.floor(t.w / 7) - 1)) + "…" : t.label)}</text>` : "") +
        (big ? `<text x="${(t.x + 8).toFixed(1)}" y="${(t.y + 35).toFixed(1)}" font-size="11" opacity=".85">${esc(fmtV(t.value))} · ${S.fmtInt(t.n)}</text>` : "") + "</g>";
    }).join("") + "</svg>";
    const sized = gs.slice().sort((a, b) => b.n - a.n)[0], ok = gs.filter((g) => g.n >= MINN && g.value != null).sort((a, b) => (dir || 1) * (b.value - a.value));
    const call = `<div class="callout" style="margin-top:12px">Biggest tile: <b>${esc(sized.label)}</b> (${(100 * sized.n / here.n).toFixed(0)}% of orders).` + (dir && ok.length > 1 ? ` Worst: <b>${esc(ok[0].label)}</b> at ${esc(fmtV(ok[0].value))} (${pctTxt(rel(ok[0].value, here.value))}); best: <b>${esc(ok[ok.length - 1].label)}</b> at ${esc(fmtV(ok[ok.length - 1].value))}.` : "") + "</div>";
    return html + legend() + `<div class="card"><h3>${esc(mLabel())} across ${esc(DIMS[dim])}<small class="small" style="margin-left:8px">${S.fmtInt(here.n)} orders · average ${esc(fmtV(here.value))}</small></h3><div class="tmwrap">${svg}</div>${call}</div>`;
  }

  // ---------- cross-tab links: carry the current view into another tab and offer a way back
  const fStr = () => Object.entries(st.f).filter(([, v]) => v.length).map(([d, v]) => d + ":" + v.join(".")).join(";");
  const ctxLabel = () => [mLabel()].concat(Object.entries(st.f).filter(([, v]) => v.length).map(([d, v]) => v.map((j) => CUBE.vocab[d][j]).join("/"))).join(" · ");
  const cityOnly = () => (st.f[0] && st.f[0].length === 1 ? CUBE.vocab[0][st.f[0][0]] : null);
  const xlink = (page, hash, text, cls) => `<a class="xl ${cls || ""}" href="${page}#${hash}&xr=${encodeURIComponent(toHash())}&xl=${encodeURIComponent(ctxLabel())}">${text}</a>`;
  const builderHash = (dim) => `ds=ops&m=${st.m}&g=${dim}&g2=-1&t=bar&sort=value&top=15&min=30&f=${encodeURIComponent(fStr())}&title=${encodeURIComponent("From Explorer: " + ctxLabel())}`;
  const inTab = (tab, text) => `<a class="xl" href="#" data-act="goto" data-tab="${tab}">${text}</a>`;
  const fmtDate = (iso) => +iso.slice(8) + " " + ["", "Jan", "Feb", "Mar", "Apr"][+iso.slice(5, 7)];
  const natOrder = (dim, gs) => {
    const nat = NATURAL[DIMS[dim]];
    return nat ? gs.sort((a, b) => (nat.indexOf(a.label) < 0 ? 99 : nat.indexOf(a.label)) - (nat.indexOf(b.label) < 0 ? 99 : nat.indexOf(b.label))) : gs.sort((a, b) => b.n - a.n);
  };

  // ---------- Story: one narrative, five chapters, each linking to the tab that goes deeper
  const MONTH_OF = { "02": "Feb", "03": "Mar", "04": "Apr" };
  function dailyVals(city) {
    const ci = city ? MON.cities.indexOf(city) : -1, acc = MON.dates.map(() => [0, 0, 0, 0, 0, 0, 0]);
    MON.rows.forEach((r) => { if (ci >= 0 && r[1] !== ci) return; const a = acc[r[0]]; a[0] += r[2]; a[1] += r[3]; a[2] += r[5]; a[3] += r[6]; a[4] += r[7]; a[5] += r[8]; a[6] += r[9]; });
    const pick = { orders: (a) => a[0], avg_time: (a) => a[1] / a[0], late_rate: (a) => 100 * a[2] / a[0], avg_rating: (a) => (a[3] ? a[4] / a[3] : null), avg_prep: (a) => (a[5] ? a[6] / a[5] : null) }[st.m];
    return acc.map((a) => (a[0] ? { n: a[0], v: pick(a) } : null));
  }
  const chapter = (n, id, title, question, headline, body, links) =>
    `<section class="chapter" id="${id}"><div class="chead"><span class="cnum">${n}</span><div><h2>${title}</h2><p class="cq">${question}</p></div></div><p class="headline">${headline}</p>${body}<div class="golinks"><span class="small">Go deeper</span>${links.join("")}</div></section>`;
  const dimSelect = (chg, sel, opts) => `<select data-chg="${chg}">${opts.map((d) => `<option value="${d}"${d === sel ? " selected" : ""}>${esc(DIMS[d])}</option>`).join("")}</select>`;

  function chapterPulse() {
    const city = cityOnly(), vals = dailyVals(city), grid = V.calendarGrid(MON.dates), real = vals.map((v, i) => (v ? { i, v: v.v, n: v.n } : null)).filter((x) => x && x.v != null);
    const monthSel = st.f[1] && st.f[1].length === 1 ? CUBE.vocab[1][st.f[1][0]] : null, scope = city || "all 22 cities";
    const nums = real.map((x) => x.v), mean = nums.reduce((a, b) => a + b, 0) / (nums.length || 1), mx = Math.max(...nums, 1e-9), missing = vals.filter((v) => !v).length;
    const color = (v) => (st.m === "orders" ? `rgb(${lerp(29, 96, v / mx)},${lerp(53, 165, v / mx)},${lerp(87, 250, v / mx)})` : col(X.tone(st.m, v, mean, 0.3)));
    const lo = real.slice().sort((a, b) => a.v - b.v)[0], hi = real.slice().sort((a, b) => b.v - a.v)[0];
    const svg = V.calendar(grid, vals.map((v) => (v ? v.v : null)), { color, label: `${mLabel()} per day`, dim: (i) => monthSel && MONTH_OF[MON.dates[i].slice(5, 7)] !== monthSel,
      tip: (i) => (vals[i] ? `${MON.dates[i]}: ${fmtV(vals[i].v)} (${mLabel()}) from ${S.fmtInt(vals[i].n)} orders` : `${MON.dates[i]}: no orders reported`) });
    const head = real.length ? `${esc(mLabel())} for <b>${esc(scope)}</b> ranges from <b>${esc(fmtV(lo.v))}</b> on ${fmtDate(MON.dates[lo.i])} to <b>${esc(fmtV(hi.v))}</b> on ${fmtDate(MON.dates[hi.i])}, and <b>${missing} of ${MON.dates.length} calendar days have no data at all</b>. That gap is in the source, not in the code.` : "No daily data for this selection.";
    const other = Object.keys(st.f).some((d) => +d !== 0 && +d !== 1 && st.f[d].length) ? '<p class="small">Daily figures exist per city only, so traffic, weather and the other filters apply to chapters 2 to 5, not to this calendar.</p>' : "";
    const lg = `<div class="legend"><span><i style="background:repeating-linear-gradient(45deg,#1a1020,#1a1020 3px,#f87171 3px,#f87171 4px)"></i>no data that day</span>` + (st.m === "orders" ? "<span>darker = fewer orders</span>" : '<span><i style="background:#2dd4bf"></i>better than average</span><span><i style="background:#f87171"></i>worse</span>') + "<span>hover a day for the numbers</span></div>";
    return chapter(1, "ch1", "The pulse", "What does a normal day look like, and where is the data silent?", head, `<div class="card"><div class="calwrap">${svg}</div>${lg}${other}</div>`,
      [xlink("monitor.html", "city=" + encodeURIComponent(city || "Bangalore"), `Monitor: control charts for ${esc(city || "Bangalore")}`), xlink("quality.html", "sec=sec-coverage", "Data quality: why days are missing")]);
  }

  function chapterWhere() {
    const fo = X.merge(st.f); delete fo[st.bub];
    const gs = X.group(CUBE, fo, st.bub, "orders").filter((g) => g.n >= 12), mAT = X.measureOf(CUBE, "avg_time"), mLR = X.measureOf(CUBE, "late_rate"), mCur = M();
    const all = X.total(CUBE, fo), ovT = S.measureValue(mAT, all), ovL = S.measureValue(mLR, all), ovC = S.measureValue(mCur, all), dir = X.badDir(st.m), sel = st.f[st.bub] || [];
    if (gs.length < 2) return chapter(2, "ch2", "Where it happens", "", "Too few orders per group to compare (groups under 12 orders are hidden). Use <b>← Back</b> above, or remove a filter.", "", []);
    const items = gs.map((g) => ({ x: S.measureValue(mAT, g.v), y: S.measureValue(mLR, g.v), size: g.n, label: g.label, g, on: sel.includes(g.i) }));
    const bySize = items.slice().sort((a, b) => b.size - a.size), ext = [items.slice().sort((a, b) => a.y - b.y)[0], items.slice().sort((a, b) => b.y - a.y)[0], items.slice().sort((a, b) => b.x - a.x)[0]];
    items.forEach((p) => {
      p.color = st.m === "orders" ? "#5b7aa3" : col(X.tone(st.m, S.measureValue(mCur, p.g.v), ovC, 0.2));
      p.show = items.length <= 8 || p.on || bySize.slice(0, 4).includes(p) || ext.includes(p);
      p.attrs = `data-act="flt" data-d="${st.bub}" data-i="${p.g.i}"`;
      p.tip = `${p.label}: ${S.fmtInt(p.g.n)} orders · ${p.x.toFixed(1)} min average · ${p.y.toFixed(1)}% late`;
    });
    const ys = items.map((p) => p.y), xs = items.map((p) => p.x), yr = Math.max(...ys) - Math.min(...ys), xr = Math.max(...xs) - Math.min(...xs), tight = yr < 0.3 * ovL && xr < 0.12 * ovT;
    const worst = items.slice().sort((a, b) => b.y - a.y)[0];
    const head = tight ? `All <b>${items.length}</b> ${esc(DIMS[st.bub].toLowerCase())} groups land in one small patch: late rate within <b>${yr.toFixed(1)} pts</b> and delivery time within <b>${xr.toFixed(1)} min</b> of each other.${st.bub === 0 ? " Real cities rarely look this alike, which is one sign the data is generated." : ""}`
      : `<b>${esc(worst.label)}</b> stands out: ${worst.y.toFixed(1)}% late and ${worst.x.toFixed(1)} min on average, against ${ovL.toFixed(1)}% and ${ovT.toFixed(1)} min for all ${esc(DIMS[st.bub].toLowerCase())} groups.`;
    const svg = V.bubbles(items, { xlabel: "Average delivery time (min) →", ylabel: "Late rate (% over 40 min) →", ref: { x: ovT, y: ovL }, fmtX: (v) => v.toFixed(1), fmtY: (v) => v.toFixed(1) + "%", label: `${DIMS[st.bub]} groups by speed and lateness` });
    const pick = `<div class="inline">One bubble per ${dimSelect("bubdim", st.bub, DIMS.map((_, d) => d))}<span class="small">Size = orders. Colour follows your metric. Axes zoom to the data, so read the tick values. Click a bubble to filter.</span></div>`;
    const city = cityOnly();
    return chapter(2, "ch2", "Where it happens", "Do places differ, or does something else drive the delay?", head, `<div class="card">${pick}${svg}</div>`,
      [xlink("study.html", "sec=sec-bangalore", "Study: is Bangalore really different?"), xlink("monitor.html", "city=" + encodeURIComponent(city || "Bangalore"), `Monitor: ${esc(city || "Bangalore")} day by day`), xlink("quality.html", "sec=sec-real", "Data quality: does it look real?")]);
  }

  function chapterWhy() {
    const free = dimsFree(), total = X.total(CUBE, st.f), late = total[2];
    const A = free.includes(st.fa) ? st.fa : free[0], B = free.includes(st.fb) && st.fb !== A ? st.fb : free.find((d) => d !== A);
    if (A == null || B == null) return chapter(3, "ch3", "Why it happens", "", "Remove a filter to see how two factors combine into late orders.", "", []);
    const ga = natOrder(A, X.group(CUBE, st.f, A, "orders").filter((g) => g.n > 0)), gb = natOrder(B, X.group(CUBE, st.f, B, "orders").filter((g) => g.n > 0)), g2 = X.group2(CUBE, st.f, A, B, "orders");
    const ovL = total[0] ? (100 * late) / total[0] : 0, meta = {};
    ga.forEach((g) => { meta["a" + g.i] = { d: A, g }; }); gb.forEach((g) => { meta["b" + g.i] = { d: B, g }; });
    const cols = [ga.map((g) => ({ id: "a" + g.i, value: g.n })), gb.map((g) => ({ id: "b" + g.i, value: g.n })), [{ id: "late", value: late }, { id: "ok", value: total[0] - late }]];
    const links = g2.map((g) => ({ s: "a" + g.a, t: "b" + g.b, value: g.n })).concat(gb.flatMap((g) => [{ s: "b" + g.i, t: "late", value: g.v[2] }, { s: "b" + g.i, t: "ok", value: g.n - g.v[2] }]));
    const W = 960, H = 400, L = V.sankeyLayout(cols, links, W, H, { pad: 9, left: 150, right: 120 });
    const rate = (n) => (n.id === "late" || n.id === "ok" ? null : (100 * meta[n.id].g.v[2]) / meta[n.id].g.n);
    const nodeColor = (n) => (n.id === "late" ? "#f87171" : n.id === "ok" ? "#2dd4bf" : col(X.tone("late_rate", rate(n), ovL, 0.6)));
    const svg = V.sankey(L, W, H, { label: "Orders flowing from two factors to late or on time", nodeColor,
      linkColor: (l) => (l.t.id === "late" ? "#f87171" : l.t.id === "ok" ? "#2dd4bf" : nodeColor(l.s)),
      nodeLabel: (n) => (n.id === "late" ? "Late (over 40 min)" : n.id === "ok" ? "On time" : `${meta[n.id].g.label} · ${rate(n).toFixed(0)}% late`),
      nodeTip: (n) => (n.id === "late" || n.id === "ok" ? `${S.fmtInt(n.value)} orders` : `${DIMS[meta[n.id].d]} = ${meta[n.id].g.label}: ${S.fmtInt(n.value)} orders, ${rate(n).toFixed(1)}% late`),
      linkTip: (l) => `${S.fmtInt(l.value)} orders: ${l.s.id === "late" ? "" : ""}${meta[l.s.id] ? meta[l.s.id].g.label : l.s.id} to ${meta[l.t.id] ? meta[l.t.id].g.label : l.t.id === "late" ? "late" : "on time"}`,
      nodeAttrs: (n) => (meta[n.id] ? `data-act="flt" data-d="${meta[n.id].d}" data-i="${meta[n.id].g.i}"` : "") });
    let head = "No late orders in this view.";
    if (late > 0) {
      const lift = (gs) => gs.filter((g) => g.n >= SPLITN).map((g) => ({ g, os: g.n / total[0], ls: g.v[2] / late })).sort((a, b) => b.ls / b.os - a.ls / a.os)[0];
      const pa = lift(ga), pb = lift(gb), line = (p, d) => (p ? `<b>${esc(DIMS[d])} ${esc(p.g.label)}</b> is ${(100 * p.os).toFixed(0)}% of orders but ${(100 * p.ls).toFixed(0)}% of the late ones` : "");
      head = [line(pa, A), line(pb, B)].filter(Boolean).join(". ") + `. Overall ${ovL.toFixed(1)}% of orders are late.`;
    }
    const pickers = `<div class="inline">Orders flow from ${dimSelect("fa", A, free.filter((d) => d !== B))} through ${dimSelect("fb", B, free.filter((d) => d !== A))} to the outcome<span class="small">Ribbon width = orders. Red = late. Click a node to filter.</span></div>`;
    return chapter(3, "ch3", "Why it happens", "Which factors turn an order into a late one?", head, `<div class="card">${pickers}${svg}</div>`,
      [xlink("study.html", "sec=sec-model", "Study: how many minutes each factor adds"), xlink("builder.html", builderHash(A), "Build your own: chart this view"), inTab("tree", "Decomposition tree: follow the worst branch"), inTab("hot", "Hot spots: rank the combinations")]);
  }

  function chapterTrust() {
    const eta = Q.eta.slice().sort((a, b) => b.eta2 - a.eta2), top = eta[0], cityE = Q.eta.find((e) => /city/i.test(e.factor)), inf = Q.missing_vs_outcome.filter((x) => x.informative).length;
    const tile = (big, text, hash) => xlink("quality.html", hash, `<b>${big}</b><span>${text}</span>`, "kpi xk");
    const tiles = [
      tile(`${(100 * top.eta2).toFixed(0)}% vs ${cityE ? (100 * cityE.eta2).toFixed(2) : "?"}%`, `of delivery-time variation explained by ${esc(top.factor.toLowerCase())} vs by city`, "sec=sec-real"),
      tile(`${Q.calendar.missing_days.length} days`, "with no orders reported anywhere", "sec=sec-coverage"),
      tile(`${inf} of ${Q.missing_vs_outcome.length}`, "fields where a blank itself predicts the outcome", "sec=sec-missing"),
      tile(`${Q.coords.valid_pct.toFixed(0)}%`, `of orders have usable GPS; Bangalore is ${Q.coords.bangalore_valid_pct}%`, "sec=sec-real"),
    ].join("");
    return chapter(4, "ch4", "Can we trust it?", "Before acting on any of this, what does the data itself say about its quality?",
      `The factors that matter (<b>${esc(top.factor.toLowerCase())}</b>, traffic) are real signals, but the near-zero city effect, the missing days and the perfectly even categories suggest the file is partly <b>generated</b>. Treat the findings as a demonstration of method.`,
      `<div class="kpis">${tiles}</div>`, [xlink("quality.html", "sec=sec-ledger", "Data quality: the cleaning ledger"), xlink("quality.html", "sec=sec-outliers", "Data quality: outliers")]);
  }

  function chapterSoWhat() {
    const wp = st.m === "orders" ? [] : X.worstPath(CUBE, st.f, st.m, 1000, 3), base = valOf(st.f); // 1,000+ orders per step, so the headline rests on slices that matter
    let head = "Pick a metric other than Orders to get a worst-branch answer.";
    if (wp.length) {
      const end = valOf(X.merge(st.f, X.pathFilters(wp)));
      head = `Among slices of 1,000+ orders, the slowest is <b>${wp.map((p) => esc(DIMS[p.d] + " " + CUBE.vocab[p.d][p.v])).join(" › ")}</b>: ${esc(fmtV(end.value))} ${esc(mLabel().toLowerCase())} across ${S.fmtInt(end.n)} orders, against ${esc(fmtV(base.value))} overall (${pctTxt(rel(end.value, base.value))}).`;
    }
    const moves = `<div class="nextmoves"><button class="primary" data-act="gofollow">Follow the problem in the tree →</button><button data-act="goto" data-tab="hot">Rank every two-factor hot spot →</button>${xlink("study.html", "sec=sec-actions", "What I would do with this", "btnlike")}</div>`;
    return chapter(5, "ch5", "So what?", "What should an ops team do first?", head, `<div class="insights">${insights()}</div>${moves}`, [xlink("study.html", "sec=sec-actions", "Study: recommendations"), xlink("builder.html", builderHash(2), "Build your own: save this as a dashboard")]);
  }

  function renderStory() {
    if (!X.total(CUBE, st.f)[0]) return '<div class="callout bad">No orders match this combination of filters. Remove a filter above.</div>';
    const strip = ["The pulse", "Where", "Why", "Trust", "So what"].map((t, k) => `<button data-act="scroll" data-to="ch${k + 1}"><span class="cnum sm">${k + 1}</span>${t}</button>`).join('<span class="sep">›</span>');
    return `<div class="kpis">${kpiRow()}</div><div class="chapters-nav">${strip}</div>${chapterPulse()}${chapterWhere()}${chapterWhy()}${chapterTrust()}${chapterSoWhat()}`;
  }

  // ---------- Sunburst (the radial twin of the treemap)
  function sunburstCard(f, here, path) {
    const used = path.map((p) => p.d), chain = [];
    let u = used.slice();
    const SB_ORDER = [2, 6, 3, 4, 5, 0, 1]; // few-slice factors first, so the inner rings stay readable
    for (let k = 0; k < 3; k++) {
      const free = dimsFree(u), d = k === 0 && free.includes(st.tmNext) ? st.tmNext : SB_ORDER.find((x) => free.includes(x));
      if (d == null) break;
      chain.push(d); u.push(d);
    }
    const minSize = here.n * 0.006;
    const build = (ff, level, trail, pth) => {
      if (level >= chain.length) return undefined;
      const dim = chain[level];
      return natOrder(dim, groupsOf(ff, dim).filter((g) => g.n >= minSize)).map((g) => {
        const t2 = trail.concat(g.label), p2 = pth.concat(dim + "." + g.i);
        return { size: g.n, label: g.label, n: g.n, value: g.value, d: dim, depth: level + 1, trail: t2, path: p2, children: build(X.merge(ff, { [dim]: [g.i] }), level + 1, t2, p2) };
      });
    };
    const last = path[path.length - 1], root = { size: here.n, label: last ? CUBE.vocab[last.d][last.v] : "All orders", n: here.n, value: here.value, children: build(f, 0, [], []) };
    const arcs = V.partition(root, chain.length), ring = ["#1e3a5f", "#2a4f7c", "#3b6a9e", "#4f86bd"];
    const svg = V.sunburst(arcs, { label: "Sunburst of orders", size: 600, color: (n) => (st.m === "orders" ? ring[n.depth] : col(X.tone(st.m, n.value, here.value, 0.25))),
      tip: (n) => `${DIMS[n.d]} = ${n.label}: ${fmtV(n.value)} ${mLabel()} · ${S.fmtInt(n.n)} orders (${(100 * n.n / here.n).toFixed(0)}% of this view)`,
      attrs: (n) => `data-act="tmpath" data-path="${n.path.join(",")}"`, short: (n, len) => (n.label.length > len / 6.5 ? n.label.slice(0, Math.max(3, Math.floor(len / 6.5) - 1)) + "…" : n.label),
      center: [root.label, fmtV(here.value), S.fmtInt(here.n) + " orders"], centerAttrs: path.length ? 'data-act="tmback"' : "" });
    const dir = X.badDir(st.m), leaves = arcs.filter((a) => a.depth > 0 && a.node.n >= SPLITN && a.node.value != null).sort((a, b) => (dir || 1) * (b.node.value - a.node.value));
    const call = dir && leaves.length ? `<div class="callout" style="margin-top:12px">Hottest slice: <b>${esc(leaves[0].node.trail.join(" › "))}</b> at ${esc(fmtV(leaves[0].node.value))} (${pctTxt(rel(leaves[0].node.value, here.value))} vs the centre) across ${S.fmtInt(leaves[0].node.n)} orders.</div>` : "";
    const rings = `<p class="small">Rings from the centre outwards: ${chain.map((d) => esc(DIMS[d])).join(" → ")}. Click an arc to zoom in, the centre to step back. Slices under 0.6% of orders are left out.</p>`;
    return `<div class="card"><h3>${esc(mLabel())} across ${chain.map((d) => esc(DIMS[d])).join(", ")}</h3>${rings}<div class="sbwrap">${svg}</div>${call}</div>`;
  }

  // ---------- Hot spots
  function renderHot() {
    const seg = X.segments(CUBE, st.f, st.m, st.segMin), r = seg.ranked, neutral = st.m === "orders";
    const top = r.slice(0, 12), bottom = r.slice(-12).reverse(), minOpts = [50, 100, 150, 300, 600].map((n) => `<option value="${n}"${n === st.segMin ? " selected" : ""}>${n}+ orders</option>`).join("");
    const worse = (s) => (s.lift > 0) === (X.badDir(st.m) > 0);
    const tbl = (list) => `<div class="tablewrap"><table><thead><tr><th class="l">Segment</th><th>Orders</th><th>${esc(mLabel())}</th>${neutral ? "" : "<th>vs average</th>"}</tr></thead><tbody>` +
      list.map((s) => `<tr class="go" data-act="seg" data-a="${s.a}" data-ai="${s.ai}" data-b="${s.b}" data-bi="${s.bi}"><td class="l">${esc(segName(s.a, s.ai, s.b, s.bi))}</td><td>${S.fmtInt(s.n)}</td><td>${esc(fmtV(s.value))}</td>${neutral ? "" : `<td><span class="${worse(s) ? "hot" : "cold"}">${pctTxt(s.lift)}</span></td>`}</tr>`).join("") + "</tbody></table></div>";
    const dimOpts = (sel) => DIMS.map((d, i) => `<option value="${i}"${i === sel ? " selected" : ""}>${esc(d)}</option>`).join("");
    const gs = X.group2(CUBE, st.f, st.hx, st.hy, st.m).filter((g) => g.n >= MINN && g.value != null), rl = [...new Set(gs.map((g) => g.a))], cl = [...new Set(gs.map((g) => g.b))];
    const so = (dim) => (a, b) => { const nat = NATURAL[DIMS[dim]], ia = nat ? nat.indexOf(CUBE.vocab[dim][a]) : a, ib = nat ? nat.indexOf(CUBE.vocab[dim][b]) : b; return ia - ib; };
    rl.sort(so(st.hx)); cl.sort(so(st.hy));
    const heat = st.hx === st.hy ? '<div class="callout">Choose two different factors for the matrix.</div>' : !gs.length ? '<div class="callout">No cells reach 50 orders under these filters.</div>' :
      C.heat({ rows: rl.map((i) => CUBE.vocab[st.hx][i]), cols: cl.map((i) => CUBE.vocab[st.hy][i]), values: rl.map((a) => cl.map((b) => { const g = gs.find((x) => x.a === a && x.b === b); return g ? g.value : null; })), fmt: (v) => fmtV(v), labelW: 130, zeroBased: M()[2] === "sum" || M()[2] === "pct", label: mLabel() });
    const hdr = `<div class="bar"><label>Smallest segment to trust<select data-chg="segmin">${minOpts}</select></label><span class="small">Every pair of unfiltered factors is scanned. Click a row to apply it as filters and see it on the Overview.</span></div>`;
    if (!r.length) return hdr + '<div class="callout bad">No segment reaches that size. Lower the minimum or remove filters.</div>';
    const det = st.m === "late_rate" && (r[0].value >= 99.9 || r[r.length - 1].value <= 0.1) ? '<div class="callout bad"><b>Read with care.</b> Exact 100% and 0% late rates are deterministic patterns in this file (a load of 3 is always late, low traffic almost never), which is one reason the delivery data looks generated. See <a href="quality.html">Data quality</a>. Use the ranking to demonstrate the method, not to describe real riders.</div>' : "";
    return hdr + det + `<div class="rank">${card(neutral ? "Biggest segments" : "Worst segments", `${S.fmtInt(r.length)} two-factor segments scanned. Average ${esc(fmtV(seg.overall))}.`, tbl(top))}${card(neutral ? "Smallest segments" : "Best segments", "The other end of the ranking.", tbl(bottom))}</div>` +
      card("Matrix", `Any two factors against ${esc(mLabel().toLowerCase())}. Cells under ${MINN} orders are left blank.`, `<div class="bar" style="border:0;padding:0;margin:0 0 8px"><label>Rows<select data-chg="hx">${dimOpts(st.hx)}</select></label><label>Columns<select data-chg="hy">${dimOpts(st.hy)}</select></label></div>${heat}`);
  }

  // ---------- state in the URL, so a view can be shared
  function toHash() {
    const f = Object.entries(st.f).filter(([, v]) => v.length).map(([d, v]) => d + ":" + v.join(".")).join(";");
    return new URLSearchParams({ t: st.tab, m: st.m, f, dr: st.drill.map((p) => p.d + "." + p.v).join(","), s: st.dstart, sh: st.shape }).toString();
  }
  function fromHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    if (TABS.some(([k]) => k === p.get("t"))) st.tab = p.get("t");
    if (MEAS.some((m) => m[0] === p.get("m"))) st.m = p.get("m");
    (p.get("f") || "").split(";").filter(Boolean).forEach((x) => { const [d, v] = x.split(":"); if (DIMS[+d]) st.f[+d] = v.split(".").map(Number).filter((j) => CUBE.vocab[+d][j] !== undefined); });
    st.drill = (p.get("dr") || "").split(",").filter(Boolean).map((x) => { const [d, v] = x.split(".").map(Number); return { d, v }; }).filter((x) => CUBE.vocab[x.d] && CUBE.vocab[x.d][x.v] !== undefined && !(st.f[x.d] && st.f[x.d].length));
    st.dstart = DIMS[+p.get("s")] ? +p.get("s") : 0;
    if (p.get("sh") === "sunburst") st.shape = "sunburst";
  }

  // ---------- render and events
  // Undo/redo: every view change is a history entry holding a full snapshot of the state, so the browser's Back button and the on-page buttons agree.
  const snaps = [];
  let pos = -1;
  function commit(mode) {
    if (mode === "pop") return;
    const snap = JSON.stringify(st);
    if (pos < 0) { snaps.push(snap); pos = 0; history.replaceState({ i: 0 }, "", "#" + toHash()); return; }
    if (snap === snaps[pos]) { history.replaceState({ i: pos }, "", "#" + toHash()); return; }
    snaps.length = pos + 1; snaps.push(snap); pos++;
    history.pushState({ i: pos }, "", "#" + toHash());
  }
  function render(mode) {
    commit(mode);
    renderBar();
    $("view").innerHTML = { story: renderStory, overview: renderOverview, drill: renderDrill, tree: renderTree, treemap: renderTreemap, hot: renderHot }[st.tab]();
    $("tabs").querySelectorAll("button").forEach((b) => { b.tabIndex = b.getAttribute("aria-selected") === "true" ? 0 : -1; });
  }
  const resetPaths = () => { st.drill = []; st.tm = []; st.tree = {}; st.tmNext = -1; if (!dimsFree().includes(st.dstart)) st.dstart = dimsFree()[0]; };
  function onClick(e) {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const a = el.dataset.act, d = +el.dataset.d, i = +el.dataset.i, j = +el.dataset.j;
    if (a === "hback") { history.back(); return; }
    if (a === "hfwd") { history.forward(); return; }
    if (a === "scroll") { const t = document.getElementById(el.dataset.to); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    if (a === "tab" || a === "goto") { e.preventDefault(); st.tab = el.dataset.tab; window.scrollTo({ top: 0 }); }
    else if (a === "gofollow") { st.tab = "tree"; expandPath(X.worstPath(CUBE, st.f, st.m, SPLITN, 5)); window.scrollTo({ top: 0 }); }
    else if (a === "shape") st.shape = el.dataset.shape;
    else if (a === "tmpath") { st.tm = st.tm.concat(el.dataset.path.split(",").map((x) => { const [dd, vv] = x.split(".").map(Number); return { d: dd, v: vv }; })); st.tmNext = -1; }
    else if (a === "tmback") st.tm = st.tm.slice(0, -1);
    else if (a === "flt") { (st.f[d] || []).includes(i) ? delete st.f[d] : (st.f[d] = [i]); resetPaths(); }
    else if (a === "unf") { delete st.f[d]; resetPaths(); }
    else if (a === "reset") { st.f = {}; resetPaths(); }
    else if (a === "drill") st.drill = st.drill.slice(0, j).concat({ d, v: i });
    else if (a === "dcrumb") st.drill = st.drill.slice(0, j);
    else if (a === "dreset") st.drill = [];
    else if (a === "ttoggle") {
      const id = el.dataset.id;
      if (st.tree[id] !== undefined) Object.keys(st.tree).forEach((k) => { if (k === id || id === "root" || k.startsWith(id + "/")) delete st.tree[k]; });
      else st.tree[id] = "auto";
    }
    else if (a === "follow") expandPath(X.worstPath(CUBE, st.f, st.m, SPLITN, 5));
    else if (a === "expand2") { st.tree = {}; expandDepth([], 2); }
    else if (a === "collapse") st.tree = {};
    else if (a === "tm") st.tm = st.tm.concat({ d, v: i }), st.tmNext = -1;
    else if (a === "tmcrumb") { st.tm = st.tm.slice(0, j); st.tmNext = -1; }
    else if (a === "tmreset") { st.tm = []; st.tmNext = -1; }
    else if (a === "seg") { const A = +el.dataset.a, B = +el.dataset.b; st.f[A] = [+el.dataset.ai]; st.f[B] = [+el.dataset.bi]; resetPaths(); st.tab = "overview"; }
    render();
  }
  function onChange(e) {
    const el = e.target.closest("[data-chg]");
    if (!el) return;
    const k = el.dataset.chg, v = el.value;
    if (k === "m") { st.m = v; st.tree = {}; }
    else if (k === "fd") { v === "" ? delete st.f[+el.dataset.d] : (st.f[+el.dataset.d] = [+v]); resetPaths(); }
    else if (k === "dstart") { st.dstart = +v; st.drill = []; }
    else if (k === "tsplit") { Object.keys(st.tree).forEach((x) => { if (x.startsWith(el.dataset.id + "/")) delete st.tree[x]; }); st.tree[el.dataset.id] = v; }
    else if (k === "tmnext") { st.tmNext = +v; }
    else if (k === "segmin") st.segMin = +v;
    else if (k === "hx") st.hx = +v;
    else if (k === "hy") st.hy = +v;
    else if (k === "bubdim") st.bub = +v;
    else if (k === "fa") st.fa = +v;
    else if (k === "fb") st.fb = +v;
    render();
  }
  fromHash();
  $("bar").addEventListener("change", onChange); $("bar").addEventListener("click", onClick);
  $("chips").addEventListener("click", onClick); $("tabs").addEventListener("click", onClick);
  $("view").addEventListener("click", onClick); $("view").addEventListener("change", onChange);
  window.addEventListener("popstate", (e) => {
    const i = e.state && e.state.i;
    if (i != null && snaps[i]) {
      Object.keys(st).forEach((k) => delete st[k]); Object.assign(st, JSON.parse(snaps[i])); pos = i;
      render("pop");
    } else { // an entry from before this page load (or a pasted link): rebuild from the URL
      Object.keys(st).forEach((k) => delete st[k]); Object.assign(st, fresh()); fromHash();
      snaps.length = 0; pos = -1; render("init");
    }
  });
  render("init");
})();
