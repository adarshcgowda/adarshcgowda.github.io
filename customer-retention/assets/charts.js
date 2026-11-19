/* Dependency-free SVG charts. Each function returns an HTML string; marks carry <title> tooltips. */
(function (root) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const COL = { teal: "#2dd4bf", amber: "#fbbf24", red: "#f87171", soft: "#8fa3bf", ink: "#e6edf7", grid: "#22324d", blue: "#60a5fa" };

  function barH(items, o) {
    o = o || {};
    const fmt = o.fmt || ((v) => v.toLocaleString("en-US")), W = o.width || 640, lw = o.labelW || 150, rh = o.rowH || 26;
    const top = o.max != null ? o.max : Math.max(...items.map((i) => i.value || 0), 1e-9), inner = W - lw - 78;
    let s = `<svg viewBox="0 0 ${W} ${rh * items.length + 8}" class="chart" role="img" aria-label="${esc(o.label || "bar chart")}">`;
    items.forEach((it, i) => {
      const y = 4 + i * rh, w = it.value == null ? 0 : Math.max(1, inner * it.value / top);
      const c = it.color || (it.flag ? COL.amber : o.color || COL.teal);
      s += `<text x="${lw - 8}" y="${y + 16}" text-anchor="end" fill="${COL.soft}" font-size="12">${esc(it.label)}</text>` +
           `<rect x="${lw}" y="${y + 3}" width="${w.toFixed(1)}" height="${rh - 9}" rx="3" fill="${c}"><title>${esc(it.label)}: ${esc(it.value == null ? "n/a" : fmt(it.value))}${it.note ? " · " + esc(it.note) : ""}</title></rect>` +
           `<text x="${(lw + w + 6).toFixed(1)}" y="${y + 16}" fill="${COL.ink}" font-size="12">${esc(it.value == null ? "n/a" : fmt(it.value))}</text>`;
    });
    return s + "</svg>";
  }

  function columns(items, o) {
    o = o || {};
    const W = o.width || 640, H = o.height || 220, pl = 54, pr = 8, pt = 10, pb = 26, fmt = o.fmt || ((v) => Math.round(v).toLocaleString("en-US"));
    const top = Math.max(...items.map((i) => i.value), 1e-9), n = items.length, bw = (W - pl - pr) / n;
    let s = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(o.label || "column chart")}">`;
    for (let k = 0; k <= 4; k++) {
      const v = top * k / 4, y = pt + (H - pt - pb) * (1 - k / 4);
      s += `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" stroke="${COL.grid}"/><text x="${pl - 6}" y="${y + 4}" text-anchor="end" fill="${COL.soft}" font-size="11">${esc(fmt(v))}</text>`;
    }
    items.forEach((it, i) => {
      const x = pl + i * bw, h = (H - pt - pb) * it.value / top, y = H - pb - h, fl = it.flagged || 0, fh = (H - pt - pb) * fl / top;
      s += `<rect x="${(x + 1).toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${h.toFixed(1)}" fill="${COL.teal}"><title>${esc(it.label)}: ${esc(fmt(it.value))}${fl ? " (" + fl + " flagged)" : ""}</title></rect>`;
      if (fl) s += `<rect x="${(x + 1).toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${fh.toFixed(1)}" fill="${COL.amber}"/>`;
      if (o.every ? i % o.every === 0 : true) s += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" fill="${COL.soft}" font-size="10">${esc(it.label)}</text>`;
    });
    return s + "</svg>";
  }

  /** points: [{x, y|null, flag, tip}]. lo/hi: optional per-point control limits. Missing points (y == null) are marked on the axis. */
  function line(o) {
    const W = o.width || 640, H = o.height || 230, pl = 48, pr = 12, pt = 12, pb = 28, pts = o.points, n = pts.length;
    const fmt = o.fmt || ((v) => v.toFixed(1));
    const ys = [];
    pts.forEach((p) => { if (p.y != null) ys.push(p.y); if (p.lo != null) ys.push(p.lo); if (p.hi != null) ys.push(p.hi); });
    let lo = o.yMin != null ? o.yMin : Math.min(...ys), hi = o.yMax != null ? o.yMax : Math.max(...ys);
    const pad = (hi - lo) * 0.06 || 1; if (o.yMin == null) lo -= pad; if (o.yMax == null) hi += pad;
    const X = (i) => pl + (W - pl - pr) * i / Math.max(1, n - 1), Y = (v) => pt + (H - pt - pb) * (1 - (v - lo) / (hi - lo));
    let s = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(o.label || "line chart")}">`;
    for (let k = 0; k <= 4; k++) {
      const v = lo + (hi - lo) * k / 4;
      s += `<line x1="${pl}" x2="${W - pr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="${COL.grid}"/><text x="${pl - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end" fill="${COL.soft}" font-size="11">${esc(fmt(v))}</text>`;
    }
    // control limits as a band, drawn per contiguous run of points
    const runs = []; let cur = [];
    pts.forEach((p, i) => { if (p.y != null && p.lo != null) cur.push(i); else if (cur.length) { runs.push(cur); cur = []; } });
    if (cur.length) runs.push(cur);
    runs.forEach((r) => {
      const up = r.map((i) => `${X(i).toFixed(1)},${Y(pts[i].hi).toFixed(1)}`), dn = r.slice().reverse().map((i) => `${X(i).toFixed(1)},${Y(pts[i].lo).toFixed(1)}`);
      s += `<polygon points="${up.concat(dn).join(" ")}" fill="${COL.blue}" opacity=".12"/>`;
    });
    if (o.center != null) s += `<line x1="${pl}" x2="${W - pr}" y1="${Y(o.center).toFixed(1)}" y2="${Y(o.center).toFixed(1)}" stroke="${COL.soft}" stroke-dasharray="4 4"/>`;
    let d = "", pen = false;
    pts.forEach((p, i) => { if (p.y == null) { pen = false; return; } d += `${pen ? "L" : "M"}${X(i).toFixed(1)},${Y(p.y).toFixed(1)} `; pen = true; });
    s += `<path d="${d}" fill="none" stroke="${COL.teal}" stroke-width="2"/>`;
    pts.forEach((p, i) => {
      if (p.y == null) { s += `<g><rect x="${(X(i) - 2.5).toFixed(1)}" y="${pt}" width="5" height="${H - pt - pb}" fill="${COL.red}" opacity=".35"><title>${esc(p.x)}: no data</title></rect></g>`; return; }
      s += `<circle cx="${X(i).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${p.flag ? 5 : 2.5}" fill="${p.flag ? COL.amber : COL.teal}" ${p.flag ? `stroke="${COL.ink}" stroke-width="1"` : ""}><title>${esc(p.tip || p.x + ": " + fmt(p.y))}</title></circle>`;
    });
    (o.xticks || []).forEach((t) => { s += `<text x="${X(t.i).toFixed(1)}" y="${H - 8}" text-anchor="middle" fill="${COL.soft}" font-size="11">${esc(t.label)}</text>`; });
    return s + "</svg>";
  }

  function heat(o) {
    const W = o.width || 640, lw = o.labelW || 90, ch = o.cellH || 24, top = 20, R = o.rows.length, C = o.cols.length, cw = (W - lw) / C;
    const flat = o.values.flat().filter((v) => v != null), hi = Math.max(...flat, 1e-9), lo = o.zeroBased === false ? Math.min(...flat) : 0;
    const fmt = o.fmt || ((v) => v.toLocaleString("en-US"));
    let s = `<svg viewBox="0 0 ${W} ${top + ch * R + 6}" class="chart" role="img" aria-label="${esc(o.label || "heatmap")}">`;
    o.cols.forEach((c, j) => { if (!o.everyCol || j % o.everyCol === 0) s += `<text x="${(lw + cw * j + cw / 2).toFixed(1)}" y="13" text-anchor="middle" fill="${COL.soft}" font-size="11">${esc(c)}</text>`; });
    o.rows.forEach((r, i) => {
      const y = top + i * ch;
      s += `<text x="${lw - 8}" y="${y + 16}" text-anchor="end" fill="${COL.soft}" font-size="12">${esc(r)}</text>`;
      o.values[i].forEach((v, j) => {
        const t = v == null ? 0 : (v - lo) / (hi - lo || 1), fill = v == null ? "#0f1a2e" : `rgb(${Math.round(17 + t * 28)},${Math.round(28 + t * 184)},${Math.round(48 + t * 143)})`;
        s += `<rect x="${(lw + cw * j).toFixed(1)}" y="${y}" width="${(cw - 1).toFixed(1)}" height="${ch - 1}" rx="2" fill="${fill}"><title>${esc(r)} · ${esc(o.cols[j])}: ${v == null ? "n/a" : esc(fmt(v))}</title></rect>`;
        if (o.cellText && v != null && cw >= (o.cellMinW || 30)) s += `<text x="${(lw + cw * j + cw / 2).toFixed(1)}" y="${y + ch / 2 + 4}" text-anchor="middle" font-size="${o.cellFont || 10}" fill="${t > 0.55 ? "#06231f" : COL.ink}" pointer-events="none">${esc(o.cellText(v))}</text>`;
      });
    });
    return s + "</svg>";
  }

  /** Coefficients with 95% intervals around a zero line. items: [{label, coef, lo, hi}] */
  function forest(items, o) {
    o = o || {};
    const W = o.width || 640, lw = o.labelW || 250, rh = 24, pr = 20, pt = 18;
    const mn = Math.min(0, ...items.map((i) => i.lo)), mx = Math.max(0, ...items.map((i) => i.hi)), X = (v) => lw + (W - lw - pr) * (v - mn) / (mx - mn);
    let s = `<svg viewBox="0 0 ${W} ${pt + rh * items.length + 22}" class="chart" role="img" aria-label="${esc(o.label || "effect sizes")}">`;
    s += `<line x1="${X(0).toFixed(1)}" x2="${X(0).toFixed(1)}" y1="${pt - 6}" y2="${pt + rh * items.length}" stroke="${COL.soft}" stroke-dasharray="3 3"/>`;
    items.forEach((it, i) => {
      const y = pt + i * rh + rh / 2, c = it.coef >= 0 ? COL.amber : COL.teal;
      s += `<text x="${lw - 8}" y="${y + 4}" text-anchor="end" fill="${COL.soft}" font-size="12">${esc(it.label)}</text>` +
           `<line x1="${X(it.lo).toFixed(1)}" x2="${X(it.hi).toFixed(1)}" y1="${y}" y2="${y}" stroke="${c}" stroke-width="2"/>` +
           `<circle cx="${X(it.coef).toFixed(1)}" cy="${y}" r="4" fill="${c}"><title>${esc(it.label)}: ${it.coef.toFixed(2)} min (95% CI ${it.lo.toFixed(2)} to ${it.hi.toFixed(2)})</title></circle>`;
    });
    s += `<text x="${X(0).toFixed(1)}" y="${pt + rh * items.length + 16}" text-anchor="middle" fill="${COL.soft}" font-size="11">0 = no effect on delivery time (minutes)</text>`;
    return s + "</svg>";
  }

  /** o.left: column indexes that hold text (left-aligned). o.nowrap0: keep the first column on one line. */
  function table(head, rows, o) {
    o = o || {};
    const left = o.left || [], cls = (i) => [left.includes(i) ? "l" : "", i === 0 && o.nowrap0 ? "nw" : ""].filter(Boolean).join(" ");
    return `<div class="tablewrap"><table${o.id ? ` id="${o.id}"` : ""}><thead><tr>${head.map((h, i) => `<th class="${cls(i)}">${esc(h)}</th>`).join("")}</tr></thead><tbody>` +
      rows.map((r) => `<tr${r.cls ? ` class="${r.cls}"` : ""}>${r.cells.map((c, i) => `<td class="${cls(i)}">${c}</td>`).join("")}</tr>`).join("") + "</tbody></table></div>";
  }


  /** Waterfall from a start value, through signed steps, to an end value. The axis is truncated (it does not start at zero), and says so.
      o.start/o.end: {label, value}; o.steps: [{label, value, tip}]; o.fmt formats values, o.fmtDelta formats steps. */
  function waterfall(o) {
    const W = o.width || 700, H = o.height || 300, pl = 58, pr = 10, pt = 22, pb = 66, steps = o.steps, n = steps.length + 2;
    const run = [o.start.value]; steps.forEach((s) => run.push(run[run.length - 1] + s.value));
    const all = run.concat([o.end.value]); let lo = Math.min(...all), hi = Math.max(...all);
    const pad = (hi - lo) * 0.25 || Math.abs(hi) * 0.1 || 1; lo -= pad; hi += pad * 0.6;
    const bw = (W - pl - pr) / n, Y = (v) => pt + (H - pt - pb) * (1 - (v - lo) / (hi - lo)), fmt = o.fmt, fd = o.fmtDelta;
    let s = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(o.label || "waterfall")}">`;
    for (let k = 0; k <= 4; k++) {
      const v = lo + (hi - lo) * k / 4;
      s += `<line x1="${pl}" x2="${W - pr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="${COL.grid}"/><text x="${pl - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end" fill="${COL.soft}" font-size="11">${esc(fmt(v))}</text>`;
    }
    const total = (i, t) => {
      const x = pl + i * bw + bw * 0.12, w = bw * 0.76, y = Y(t.value);
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${(Y(lo) - y).toFixed(1)}" fill="${COL.blue}" opacity=".8"><title>${esc(t.label)}: ${esc(fmt(t.value))}</title></rect>` +
        `<text x="${(x + w / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" fill="${COL.ink}" font-size="12" font-weight="600">${esc(fmt(t.value))}</text>` + label(i, t.label);
    };
    const label = (i, text) => {
      const cx = pl + i * bw + bw / 2, t = String(text).length > 14 ? String(text).slice(0, 13) + "\u2026" : String(text);
      return `<text transform="translate(${cx.toFixed(1)},${H - pb + 12}) rotate(-28)" text-anchor="end" fill="${COL.soft}" font-size="11"><title>${esc(text)}</title>${esc(t)}</text>`;
    };
    s += total(0, o.start);
    steps.forEach((st, i) => {
      const a = run[i], b = run[i + 1], x = pl + (i + 1) * bw + bw * 0.12, w = bw * 0.76, top = Math.min(Y(a), Y(b)), h = Math.max(1.5, Math.abs(Y(a) - Y(b)));
      const c = st.value >= 0 ? COL.amber : COL.teal;
      s += `<line x1="${(x - bw * 0.24).toFixed(1)}" x2="${x.toFixed(1)}" y1="${Y(a).toFixed(1)}" y2="${Y(a).toFixed(1)}" stroke="${COL.soft}" stroke-dasharray="2 2"/>` +
        `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${c}"><title>${esc(st.label)}: ${esc(st.tip || fd(st.value))}</title></rect>` +
        `<text x="${(x + w / 2).toFixed(1)}" y="${(top - 5).toFixed(1)}" text-anchor="middle" fill="${COL.ink}" font-size="11">${esc(fd(st.value))}</text>` + label(i + 1, st.label);
    });
    s += total(n - 1, o.end);
    s += `<text x="${pl}" y="12" fill="${COL.soft}" font-size="11">Axis does not start at zero. Amber pushes the number up, teal pushes it down.</text>`;
    return s + "</svg>";
  }

  /** Several series over the same x positions. series: [{name, color, points:[{y|null}]}]. */
  function multiline(o) {
    const W = o.width || 700, H = o.height || 240, pl = 52, pr = 12, pt = 12, pb = 28, fmt = o.fmt || ((v) => v.toFixed(2)), n = o.x.length;
    const ys = []; o.series.forEach((se) => se.points.forEach((p) => { if (p != null) ys.push(p); }));
    let lo = o.yMin != null ? o.yMin : Math.min(...ys), hi = Math.max(...ys); const pad = (hi - lo) * 0.08 || 1; if (o.yMin == null) lo -= pad; hi += pad;
    const X = (i) => pl + (W - pl - pr) * i / Math.max(1, n - 1), Y = (v) => pt + (H - pt - pb) * (1 - (v - lo) / (hi - lo));
    let s = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(o.label || "line chart")}">`;
    for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4; s += `<line x1="${pl}" x2="${W - pr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="${COL.grid}"/><text x="${pl - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end" fill="${COL.soft}" font-size="11">${esc(fmt(v))}</text>`; }
    (o.bands || []).forEach((b) => { s += `<rect x="${X(b.from).toFixed(1)}" y="${pt}" width="${Math.max(2, X(b.to) - X(b.from)).toFixed(1)}" height="${H - pt - pb}" fill="${b.color || COL.blue}" opacity="${b.opacity || 0.14}"><title>${esc(b.tip || "")}</title></rect>`; });
    o.series.forEach((se) => {
      let d = "", pen = false;
      se.points.forEach((p, i) => { if (p == null) { pen = false; return; } d += `${pen ? "L" : "M"}${X(i).toFixed(1)},${Y(p).toFixed(1)} `; pen = true; });
      s += `<path d="${d}" fill="none" stroke="${se.color}" stroke-width="${se.width || 2}"${se.dash ? ' stroke-dasharray="4 3"' : ""}/>`;
    });
    (o.xticks || []).forEach((t) => { s += `<text x="${X(t.i).toFixed(1)}" y="${H - 8}" text-anchor="middle" fill="${COL.soft}" font-size="11">${esc(t.label)}</text>`; });
    let lx = pl; if (o.legend !== false) o.series.forEach((se) => { s += `<rect x="${lx}" y="${H - 4}" width="10" height="3" fill="${se.color}"/><text x="${lx + 14}" y="${H}" fill="${COL.soft}" font-size="10">${esc(se.name)}</text>`; lx += 24 + se.name.length * 6; });
    return s + "</svg>";
  }

  root.FDCharts = { esc, COL, barH, columns, line, heat, forest, table, waterfall, multiline };
})(this);
