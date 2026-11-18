/* Layout maths and SVG renderers for the Explorer's story views: calendar heatmap, bubble map, Sankey flow, sunburst.
   Layout functions are pure so they can be unit-tested in Node (tests/fdviz.test.js); renderers return SVG strings. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FDViz = factory();
})(this, function () {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const K = { soft: "#8fa3bf", ink: "#e6edf7", grid: "#22324d", bg: "#0b1220", card: "#111c31", red: "#f87171", teal: "#2dd4bf", amber: "#fbbf24" };
  const rnd = (x) => Math.round(x * 10) / 10;

  // ---------- pure layout
  /** Round axis ticks that cover [lo, hi]. */
  function niceTicks(lo, hi, n) {
    if (!(hi > lo)) hi = lo + 1;
    const raw = (hi - lo) / Math.max(1, n), mag = Math.pow(10, Math.floor(Math.log10(raw))), norm = raw / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag, ticks = [];
    for (let v = Math.floor(lo / step) * step; ; v += step) { ticks.push(+v.toFixed(10)); if (v >= hi - 1e-9) break; }
    return { ticks, lo: ticks[0], hi: ticks[ticks.length - 1], step };
  }

  /** Weeks-as-columns calendar. dates: contiguous ISO dates. Rows are Monday (0) to Sunday (6). */
  function calendarGrid(dates) {
    const dow = (d) => (new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7, off = dates.length ? dow(dates[0]) : 0;
    const cells = dates.map((date, i) => ({ date, i, col: Math.floor((i + off) / 7), row: dow(date) }));
    return { cells, cols: cells.length ? cells[cells.length - 1].col + 1 : 0 };
  }

  /** cols: [[{id, value}]] in display order. links: [{s, t, value}] between ids in adjacent columns.
      Node heights share one scale (the tightest column), so ribbons keep the same width at both ends. */
  function sankeyLayout(cols, links, W, H, o) {
    o = o || {};
    const pad = o.pad == null ? 10 : o.pad, nw = o.nodeW || 14, left = o.left || 0, right = o.right || 0;
    const ky = Math.min(...cols.map((c) => { const t = c.reduce((s, n) => s + n.value, 0); return t ? (H - pad * (c.length - 1)) / t : Infinity; }));
    const byId = new Map(), nodes = [];
    cols.forEach((c, ci) => {
      let y = 0;
      const x = cols.length === 1 ? left : left + ((W - left - right - nw) * ci) / (cols.length - 1);
      c.forEach((n, k) => { const node = { id: n.id, col: ci, k, value: n.value, x, y, h: n.value * ky, src: [], dst: [], so: 0, to: 0 }; y += node.h + pad; byId.set(n.id, node); nodes.push(node); });
    });
    const L = links.filter((l) => l.value > 0 && byId.has(l.s) && byId.has(l.t)).map((l) => ({ s: byId.get(l.s), t: byId.get(l.t), value: l.value, w: l.value * ky }));
    L.forEach((l) => { l.s.dst.push(l); l.t.src.push(l); });
    nodes.forEach((n) => {
      n.dst.sort((a, b) => a.t.k - b.t.k); n.src.sort((a, b) => a.s.k - b.s.k);
      n.dst.forEach((l) => { l.sy = n.y + n.so + l.w / 2; n.so += l.w; });
    });
    nodes.forEach((n) => n.src.forEach((l) => { l.ty = n.y + n.to + l.w / 2; n.to += l.w; }));
    return { nodes, links: L, nodeW: nw, ky };
  }

  /** Radial partition: node = {size, children?}. The root fills the centre disc (depth 0); each child gets an angle proportional to its size. */
  function partition(root, maxDepth) {
    const out = [];
    (function walk(node, depth, a0, a1) {
      out.push({ node, depth, a0, a1 });
      if (depth >= maxDepth || !node.children || !node.children.length) return;
      const tot = node.children.reduce((s, c) => s + c.size, 0) || 1;
      let a = a0;
      node.children.forEach((c) => { const span = ((a1 - a0) * c.size) / tot; walk(c, depth + 1, a, a + span); a += span; });
    })(root, 0, 0, 2 * Math.PI);
    return out;
  }

  /** SVG path of a ring segment. Angles run clockwise from 12 o'clock. */
  function arcPath(cx, cy, r0, r1, a0, a1) {
    if (a1 - a0 >= 2 * Math.PI - 1e-6) a1 = a0 + 2 * Math.PI - 1e-4;
    const p = (r, a) => [rnd(cx + r * Math.sin(a)), rnd(cy - r * Math.cos(a))], large = a1 - a0 > Math.PI ? 1 : 0;
    const [x0, y0] = p(r1, a0), [x1, y1] = p(r1, a1), [x2, y2] = p(r0, a1), [x3, y3] = p(r0, a0);
    return `M${x0},${y0}A${r1},${r1} 0 ${large} 1 ${x1},${y1}L${x2},${y2}A${r0},${r0} 0 ${large} 0 ${x3},${y3}Z`;
  }

  // ---------- renderers
  /** vals[i]: number | null (null = no data). o: {color(v), dim(i), tip(i), label, legend} */
  function calendar(grid, vals, o) {
    const cs = 30, gap = 4, left = 34, top = 24, W = left + grid.cols * (cs + gap) + 6, H = top + 7 * (cs + gap) + 4;
    let s = `<svg viewBox="0 0 ${W} ${H}" class="chart cal" role="img" aria-label="${esc(o.label || "calendar heatmap")}"><defs><pattern id="gap" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#1a1020"/><line x1="0" y1="0" x2="0" y2="6" stroke="${K.red}" stroke-width="2"/></pattern></defs>`;
    ["Mon", "Wed", "Fri", "Sun"].forEach((d, k) => { s += `<text x="${left - 6}" y="${top + [0, 2, 4, 6][k] * (cs + gap) + cs / 2 + 4}" text-anchor="end" fill="${K.soft}" font-size="11">${d}</text>`; });
    let lastMonth = "";
    grid.cells.forEach((c) => {
      const x = left + c.col * (cs + gap), y = top + c.row * (cs + gap), v = vals[c.i], m = c.date.slice(0, 7);
      if (m !== lastMonth && c.row < 4) { lastMonth = m; s += `<text x="${x}" y="14" fill="${K.soft}" font-size="11">${["", "Jan", "Feb", "Mar", "Apr", "May"][+m.slice(5)] || m}</text>`; }
      const none = v == null, dim = o.dim && o.dim(c.i);
      s += `<g opacity="${dim ? 0.28 : 1}"><rect x="${x}" y="${y}" width="${cs}" height="${cs}" rx="5" fill="${none ? "url(#gap)" : o.color(v)}"${none ? ` stroke="${K.red}" stroke-opacity=".5"` : ""}><title>${esc(o.tip(c.i))}</title></rect>` +
        `<text x="${x + cs / 2}" y="${y + cs / 2 + 4}" text-anchor="middle" fill="${none ? K.red : "#06231f"}" font-size="10" opacity=".8" pointer-events="none">${+c.date.slice(8)}</text></g>`;
    });
    return s + "</svg>";
  }

  /** items: [{x, y, size, label, color, attrs, tip, show}]. o: {xlabel, ylabel, ref:{x,y}, fmtX, fmtY} */
  function bubbles(items, o) {
    const W = o.width || 920, H = o.height || 400, pl = 62, pr = 24, pt = 18, pb = 50, pts = items.filter((i) => i.x != null && i.y != null);
    if (!pts.length) return '<div class="callout">Not enough data to place bubbles.</div>';
    const xs = pts.map((p) => p.x).concat(o.ref ? [o.ref.x] : []), ys = pts.map((p) => p.y).concat(o.ref ? [o.ref.y] : []);
    const padx = (Math.max(...xs) - Math.min(...xs) || 1) * 0.12, pady = (Math.max(...ys) - Math.min(...ys) || 1) * 0.15;
    const tx = niceTicks(Math.min(...xs) - padx, Math.max(...xs) + padx, 6), ty = niceTicks(Math.min(...ys) - pady, Math.max(...ys) + pady, 5);
    const X = (v) => pl + ((W - pl - pr) * (v - tx.lo)) / (tx.hi - tx.lo), Y = (v) => pt + ((H - pt - pb) * (ty.hi - v)) / (ty.hi - ty.lo);
    const smax = Math.max(...pts.map((p) => p.size), 1e-9), R = (v) => 7 + 25 * Math.sqrt(v / smax);
    const fx = o.fmtX || ((v) => String(+v.toFixed(2))), fy = o.fmtY || ((v) => String(+v.toFixed(2)));
    let s = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(o.label || "bubble chart")}">`;
    ty.ticks.forEach((v) => { s += `<line x1="${pl}" x2="${W - pr}" y1="${rnd(Y(v))}" y2="${rnd(Y(v))}" stroke="${K.grid}"/><text x="${pl - 8}" y="${rnd(Y(v)) + 4}" text-anchor="end" fill="${K.soft}" font-size="11">${esc(fy(v))}</text>`; });
    tx.ticks.forEach((v) => { s += `<line y1="${pt}" y2="${H - pb}" x1="${rnd(X(v))}" x2="${rnd(X(v))}" stroke="${K.grid}" stroke-opacity=".5"/><text x="${rnd(X(v))}" y="${H - pb + 16}" text-anchor="middle" fill="${K.soft}" font-size="11">${esc(fx(v))}</text>`; });
    s += `<text x="${(pl + W - pr) / 2}" y="${H - 8}" text-anchor="middle" fill="${K.soft}" font-size="12">${esc(o.xlabel || "")}</text><text transform="translate(14 ${(pt + H - pb) / 2}) rotate(-90)" text-anchor="middle" fill="${K.soft}" font-size="12">${esc(o.ylabel || "")}</text>`;
    if (o.ref) s += `<line x1="${rnd(X(o.ref.x))}" x2="${rnd(X(o.ref.x))}" y1="${pt}" y2="${H - pb}" stroke="${K.ink}" stroke-dasharray="4 4" opacity=".45"/><line x1="${pl}" x2="${W - pr}" y1="${rnd(Y(o.ref.y))}" y2="${rnd(Y(o.ref.y))}" stroke="${K.ink}" stroke-dasharray="4 4" opacity=".45"/><text x="${W - pr - 4}" y="${rnd(Y(o.ref.y)) - 6}" text-anchor="end" fill="${K.soft}" font-size="11">all orders in view</text>`;
    pts.slice().sort((a, b) => b.size - a.size).forEach((p) => {
      s += `<g ${p.attrs || ""} style="cursor:pointer"><circle cx="${rnd(X(p.x))}" cy="${rnd(Y(p.y))}" r="${rnd(R(p.size))}" fill="${p.color}" fill-opacity=".78" stroke="${p.on ? "#fff" : K.bg}" stroke-width="${p.on ? 2.5 : 1.5}"><title>${esc(p.tip)}</title></circle>` +
        (p.show ? `<text x="${rnd(X(p.x))}" y="${rnd(Y(p.y)) - R(p.size) - 5}" text-anchor="middle" fill="${K.ink}" font-size="11" pointer-events="none">${esc(p.label)}</text>` : "") + "</g>";
    });
    return s + "</svg>";
  }

  /** layout from sankeyLayout. o: {nodeColor(n), linkColor(l), nodeLabel(n), nodeAttrs(n), linkTip(l), left, right} */
  function sankey(L, W, H, o) {
    let s = `<svg viewBox="0 0 ${W} ${H + 8}" class="chart" role="img" aria-label="${esc(o.label || "flow diagram")}">`;
    L.links.forEach((l) => {
      const x0 = l.s.x + L.nodeW, x1 = l.t.x, xm = (x0 + x1) / 2;
      s += `<path d="M${rnd(x0)},${rnd(l.sy)}C${rnd(xm)},${rnd(l.sy)} ${rnd(xm)},${rnd(l.ty)} ${rnd(x1)},${rnd(l.ty)}" fill="none" stroke="${o.linkColor(l)}" stroke-opacity=".5" stroke-width="${Math.max(1, rnd(l.w))}"><title>${esc(o.linkTip(l))}</title></path>`;
    });
    L.nodes.forEach((n) => {
      const last = n.col === Math.max(...L.nodes.map((m) => m.col)), lx = last ? n.x + L.nodeW + 8 : n.x - 8, anchor = last ? "start" : "end";
      s += `<g ${o.nodeAttrs(n)} style="cursor:pointer"><rect x="${rnd(n.x)}" y="${rnd(n.y)}" width="${L.nodeW}" height="${Math.max(2, rnd(n.h))}" rx="3" fill="${o.nodeColor(n)}"><title>${esc(o.nodeTip ? o.nodeTip(n) : "")}</title></rect>` +
        (n.h > 12 ? `<text x="${lx}" y="${rnd(n.y + n.h / 2) + 4}" text-anchor="${anchor}" fill="${K.ink}" font-size="12" pointer-events="none" style="paint-order:stroke;stroke:#0b1220;stroke-width:3px">${esc(o.nodeLabel(n))}</text>` : "") + "</g>";
    });
    return s + "</svg>";
  }

  /** arcs from partition(). o: {size, ringW, color(node), tip(node), attrs(node), center:[lines], centerAttrs} */
  function sunburst(arcs, o) {
    const S = o.size || 560, c = S / 2, maxD = Math.max(...arcs.map((a) => a.depth)), r0 = 66, rw = (c - 6 - r0) / Math.max(1, maxD);
    let s = `<svg viewBox="0 0 ${S} ${S}" class="chart sb" role="img" aria-label="${esc(o.label || "sunburst")}" style="max-width:${S}px">`;
    arcs.forEach((a) => {
      if (a.depth === 0 || a.a1 - a.a0 < 0.012) return;
      const ri = r0 + (a.depth - 1) * rw, ro = ri + rw - 2, mid = (a.a0 + a.a1) / 2, rm = (ri + ro) / 2, arcLen = (a.a1 - a.a0) * rm;
      s += `<g ${o.attrs(a.node)} style="cursor:pointer"><path d="${arcPath(c, c, ri, ro, a.a0, a.a1)}" fill="${o.color(a.node)}" stroke="${K.bg}" stroke-width="1.5"><title>${esc(o.tip(a.node))}</title></path>` +
        (arcLen > 46 && rw > 30 ? `<text x="${rnd(c + rm * Math.sin(mid))}" y="${rnd(c - rm * Math.cos(mid)) + 4}" text-anchor="middle" fill="#fff" font-size="${arcLen > 80 ? 12 : 10}" pointer-events="none" style="paint-order:stroke;stroke:rgba(0,0,0,.35);stroke-width:2px">${esc(o.short(a.node, arcLen))}</text>` : "") + "</g>";
    });
    s += `<g ${o.centerAttrs || ""} style="cursor:pointer"><circle cx="${c}" cy="${c}" r="${r0 - 4}" fill="${K.card}" stroke="${K.grid}"/>` +
      (o.center || []).map((t, k, a) => `<text x="${c}" y="${c + (k - (a.length - 1) / 2) * 17 + 4}" text-anchor="middle" fill="${k === 0 ? K.ink : K.soft}" font-size="${k === 0 ? 14 : 11}" font-weight="${k === 0 ? 700 : 400}" pointer-events="none">${esc(t)}</text>`).join("") + "</g>";
    return s + "</svg>";
  }

  return { esc, niceTicks, calendarGrid, sankeyLayout, partition, arcPath, calendar, bubbles, sankey, sunburst };
});
