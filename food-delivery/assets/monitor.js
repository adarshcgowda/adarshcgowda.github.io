(function () {
  const M = FD.monitor, S = FDStats, C = FDCharts, $ = (id) => document.getElementById(id);
  const citySel = $("city"), kSel = $("k"), wSel = $("w");
  citySel.innerHTML = '<option value="All">All cities</option>' + M.cities.map((c) => `<option>${c}</option>`).join("");
  citySel.value = decodeURIComponent((location.hash.match(/city=([^&]*)/) || [])[1] || "Bangalore");
  if (!citySel.value) citySel.value = "Bangalore";

  const ranges = (dates) => {
    const out = []; let s = null, p = null;
    dates.forEach((d) => { if (s && Date.parse(d) - Date.parse(p) === 864e5) p = d; else { if (s) out.push([s, p]); s = p = d; } });
    if (s) out.push([s, p]);
    return out.map(([a, b]) => (a === b ? a : `${a} to ${b}`));
  };
  const median = (a) => { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const mix = S.cityMix(M);

  function render() {
    const city = citySel.value, k = +kSel.value;
    history.replaceState(null, "", "#city=" + encodeURIComponent(city));
    const base = S.monitor(M, city, k, 1);                       // daily view, used for gaps and the swing test
    const swing = base.lag1 != null && base.lag1 < -0.5;
    const w = wSel.value === "auto" ? (swing ? 2 : 1) : +wSel.value;
    const mon = w === 1 ? base : S.monitor(M, city, k, w);
    const days = mon.days, live = days.filter((d) => !d.missing);
    const gaps = base.days.filter((d) => d.missing).map((d) => d.date);
    const flagged = live.filter((d) => d.avgOut || d.lateOut);

    const med = median(base.days.filter((d) => !d.missing).map((d) => d.n)), mad = median(base.days.filter((d) => !d.missing).map((d) => Math.abs(d.n - med))) || 1;
    base.days.forEach((d) => { d.volOut = !d.missing && Math.abs(0.6745 * (d.n - med) / mad) > 3.5; });

    let html = `<div class="callout good"><b>${city === "All" ? "All cities" : city}</b> reports from <b>${mon.first}</b> to <b>${mon.last}</b>. Days outside that range are not counted as missing.</div>`;
    if (gaps.length) html += `<div class="callout bad"><b>${gaps.length} day(s) with no data inside the reporting period</b>: ${ranges(gaps).join("; ")}. Any weekly or monthly total that spans them is understated.</div>`;
    if (swing) html += `<div class="callout"><b>Days alternate fast and slow</b> (lag-1 autocorrelation of daily average time = ${base.lag1.toFixed(2)}). Control limits assume independent days, so a daily chart would flag most days as alarms. ${w === 2 ? "This page therefore pools each pair of consecutive days (the swing cancels out)." : "You chose the daily view, so expect many false alarms."}</div>`;
    if (city === "All") {
      const bad = mix.pairs.filter((p) => p.overlap < 0.5);
      if (bad.length) html += `<div class="callout"><b>Different cities report in different months.</b> ${bad.map((p) => `${p.from} and ${p.to} share ${p.shared} of ${p.union} cities`).join("; ")}. Month-over-month movement in blended numbers mostly reflects which cities are included, not performance. Pick one city for a like-for-like trend.</div>`;
    }
    html += flagged.length ? `<div class="callout"><b>${flagged.length} of ${live.length} windows</b> left the ${k}-sigma band on average time or late rate. See the flagged list.</div>`
                           : `<div class="callout good"><b>Nothing outside the ${k}-sigma band</b> for this selection.</div>`;
    $("alerts").innerHTML = html;

    $("kpis").innerHTML = [["Orders", S.fmtInt(mon.N), ""], ["Avg delivery time", S.fmt1(mon.mean) + " min", ""], ["Late rate (>40 min)", S.pct(mon.pbar), ""],
      ["Windows flagged", flagged.length, flagged.length ? "warn" : "good"], ["Gap days", gaps.length, gaps.length ? "bad" : "good"]]
      .map(([l, v, c]) => `<div class="kpi ${c}"><b>${v}</b><span>${l}</span></div>`).join("");

    const ticks = days.map((d, i) => ({ i, label: d.date.slice(5) })).filter((t) => t.i % 7 === 0);
    $("c-orders").innerHTML = C.line({ points: base.days.map((d) => ({ x: d.date, y: d.missing ? null : d.n, flag: d.volOut, tip: d.date + ": " + S.fmtInt(d.n) + " orders" })), fmt: (v) => S.fmtInt(v), yMin: 0, xticks: base.days.map((d, i) => ({ i, label: d.date.slice(5) })).filter((t) => t.i % 7 === 0), label: "Orders per day", height: 200 });
    $("c-avg").innerHTML = C.line({ points: days.map((d) => d.missing ? { x: d.date, y: null } : { x: d.date, y: d.avg, lo: d.aLo, hi: d.aHi, flag: d.avgOut, tip: `${d.date}${w > 1 ? " (" + w + "-day window)" : ""}: ${S.fmt1(d.avg)} min (band ${S.fmt1(d.aLo)} to ${S.fmt1(d.aHi)}, ${d.n} orders)` }), center: mon.mean, xticks: ticks, label: "Average delivery time" });
    $("c-late").innerHTML = C.line({ points: days.map((d) => d.missing ? { x: d.date, y: null } : { x: d.date, y: d.late * 100, lo: d.pLo * 100, hi: d.pHi * 100, flag: d.lateOut, tip: `${d.date}${w > 1 ? " (" + w + "-day window)" : ""}: ${S.pct(d.late)} late (band ${S.pct(d.pLo)} to ${S.pct(d.pHi)}, ${d.n} orders)` }), center: mon.pbar * 100, fmt: (v) => v.toFixed(1) + "%", yMin: 0, xticks: ticks, label: "Late rate" });

    const mm = S.monthSummary(M, city), sgn = (v, f) => (v == null ? "–" : (v > 0 ? "+" : "") + f(v)), na = (v, f) => (v == null ? "–" : f(v));
    $("mom").innerHTML = C.table(["Month", "Coverage", "Orders", "Orders / day", "Avg time (min)", "vs prior", "Late rate", "vs prior (pts)"],
      mm.map((r) => ({ cells: [r.month, r.daysWithData === 0 ? '<span class="pill bad">no data</span>' : `<span class="pill ${r.partial ? "warn" : "good"}">${r.daysWithData} of ${r.calendarDays} days${r.partial ? " · partial" : ""}</span>`,
        S.fmtInt(r.n), na(r.perDay, S.fmtInt), na(r.avg, S.fmt1), sgn(r.dAvg, (v) => v.toFixed(2)), na(r.lateRate, S.pct), sgn(r.dLate, (v) => (v * 100).toFixed(2))] })));

    $("flagged").innerHTML = flagged.length ? C.table(["Window ending", "Orders", "Avg time", "Late rate", "Why"],
      flagged.slice(0, 12).map((d) => ({ cells: [d.date, S.fmtInt(d.n), S.fmt1(d.avg), S.pct(d.late), [d.avgOut ? "avg time" : "", d.lateOut ? "late rate" : ""].filter(Boolean).join(" + ")] })))
      + (flagged.length > 12 ? `<p class="small">Showing 12 of ${flagged.length}.</p>` : "") : '<p class="small">None.</p>';

    const R = M.riders;
    $("riders").innerHTML = R.n_flagged ? C.table(["Rider", "City", "Orders", "Avg time", "Avg load", "z"], R.flagged.map((r) => ({ cells: [r.rider, r.city, r.orders, S.fmt1(r.avg_time), S.fmt1(r.avg_deliveries), S.fmt1(r.z)] })))
      : `<div class="callout good"><b>No rider is a statistical outlier</b> (0 of ${R.n} riders with 30+ orders beyond |z| = ${R.z}). Rider speed differences here are within normal spread.</div>`;
  }
  citySel.onchange = kSel.onchange = wSel.onchange = render;
  render();
})();
