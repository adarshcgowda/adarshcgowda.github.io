(function () {
  const { RT, P, C, esc, fmtN, pct, gbp, gbp2, filterOptions, asOfOptions } = APP, $ = (id) => document.getElementById(id), KEY = "rt_builder_v1", ends = APP.monthEnds(), HS = [30, 60, 90, 180];
  const FIELDS = [["recencyMin", "Last visit at least (days ago)"], ["recencyMax", "Last visit at most (days ago)"], ["visitsMin", "Visits at least"], ["visitsMax", "Visits at most"], ["spendMin", "Spend at least (£)"], ["spendMax", "Spend at most (£)"]];
  const PRESETS = [
    { name: "Big spenders going quiet", rules: { spendMin: 2000, recencyMin: 90, recencyMax: 180 } },
    { name: "One-time buyers", rules: { visitsMax: 1 } },
    { name: "Regulars, active lately", rules: { visitsMin: 5, recencyMax: 60 } },
    { name: "Two visits, then silence", rules: { visitsMin: 2, visitsMax: 2, recencyMin: 120 } }
  ];
  const H = APP.readHash();
  let cur = { asof: ends.includes(H.asof) ? H.asof : "2011-03-31", h: HS.includes(+H.h) ? +H.h : 90, f: ["all", "uk", "other"].includes(H.f) ? H.f : "all", rules: {} };
  FIELDS.forEach(([k]) => { if (H[k] !== undefined && H[k] !== "" && !isNaN(+H[k])) cur.rules[k] = +H[k]; });
  let saved = [];
  const validSeg = (s) => s && typeof s.name === "string" && ends.includes(s.asof) && HS.includes(s.h) && ["all", "uk", "other"].includes(s.f) && s.rules && FIELDS.every(([k]) => s.rules[k] == null || typeof s.rules[k] === "number");
  try { const x = JSON.parse(localStorage.getItem(KEY)); if (Array.isArray(x) && x.every(validSeg)) saved = x; } catch (e) { /* none */ }
  try { if (H.t) { const x = JSON.parse(decodeURIComponent(escape(atob(H.t)))); if (Array.isArray(x) && x.every(validSeg)) saved = x; } } catch (e) { /* ignore a bad link */ }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) { /* storage may be blocked */ } };

  const describe = (r) => {
    const p = [];
    if (r.recencyMin != null && r.recencyMax != null) p.push(`last visit ${r.recencyMin} to ${r.recencyMax} days ago`); else if (r.recencyMin != null) p.push(`last visit ≥ ${r.recencyMin} days ago`); else if (r.recencyMax != null) p.push(`last visit ≤ ${r.recencyMax} days ago`);
    if (r.visitsMin != null && r.visitsMax != null) p.push(r.visitsMin === r.visitsMax ? `exactly ${r.visitsMin} visit${r.visitsMin === 1 ? "" : "s"}` : `${r.visitsMin} to ${r.visitsMax} visits`); else if (r.visitsMin != null) p.push(`≥ ${r.visitsMin} visits`); else if (r.visitsMax != null) p.push(r.visitsMax === 1 ? "only 1 visit" : `≤ ${r.visitsMax} visits`);
    if (r.spendMin != null && r.spendMax != null) p.push(`spend £${r.spendMin} to £${r.spendMax}`); else if (r.spendMin != null) p.push(`spend ≥ £${r.spendMin}`); else if (r.spendMax != null) p.push(`spend ≤ £${r.spendMax}`);
    return p.length ? p.join(", ") : "everyone";
  };
  const evaluate = (s) => RT.customSegment(P, RT.dayOfIso(s.asof), s.rules, s.h, s.f);

  function form() {
    $("snap").innerHTML = `<label>Snapshot at<select id="asof">${asOfOptions(cur.asof)}</select></label><label>Look ahead<select id="h">${HS.map((n) => `<option value="${n}"${n === cur.h ? " selected" : ""}>${n} days</option>`).join("")}</select></label><label>Customers<select id="f">${filterOptions(cur.f)}</select></label>`;
    $("rules").innerHTML = FIELDS.map(([k, l]) => `<label>${l}<input type="number" min="0" step="1" id="r-${k}" value="${cur.rules[k] != null ? cur.rules[k] : ""}" style="width:9rem"></label>`).join("");
    $("presets").innerHTML = PRESETS.map((p, i) => `<button data-p="${i}"><b>${esc(p.name)}</b><small>${esc(describe(p.rules))}</small></button>`).join("");
    const read = () => { cur.asof = $("asof").value; cur.h = +$("h").value; cur.f = $("f").value; cur.rules = {}; FIELDS.forEach(([k]) => { const v = $("r-" + k).value; if (v !== "" && !isNaN(+v) && +v >= 0) cur.rules[k] = +v; }); render(); };
    $("snap").querySelectorAll("select").forEach((e) => (e.onchange = read)); $("rules").querySelectorAll("input").forEach((e) => (e.oninput = read));
    $("presets").querySelectorAll("button").forEach((b) => (b.onclick = () => { cur.rules = Object.assign({}, PRESETS[+b.dataset.p].rules); form(); render(); }));
  }

  function render() {
    APP.writeHash(Object.assign({ asof: cur.asof, h: cur.h, f: cur.f }, cur.rules));
    const r = evaluate(cur), s = r.segment, all = r.everyone, date = RT.monthLabel(RT.monthOfDay(RT.dayOfIso(cur.asof)));
    let h = `<div class="kpis"><div class="kpi"><b>${fmtN(s.customers)}</b><span>customers match (${pct(all.customers ? s.customers / all.customers : 0, 1)} of ${fmtN(all.customers)} scored)</span></div>
      <div class="kpi"><b>${pct(all.revenue ? s.revenue / all.revenue : 0, 1)}</b><span>of revenue up to ${date} (${gbp(s.revenue)})</span></div>`;
    if (r.forward && s.customers) {
      const a = s.active / s.customers, b = all.active / all.customers, fr = s.future_revenue / s.customers, fb = all.future_revenue / all.customers;
      h += `<div class="kpi ${a > b ? "good" : "warn"}"><b>${pct(a)}</b><span>ordered in the next ${cur.h} days (everyone: ${pct(b)}; ${(a / b).toFixed(1)}×)</span></div>
        <div class="kpi"><b>${gbp2(fr)}</b><span>next-${cur.h}-day revenue per customer (everyone: ${gbp2(fb)})</span></div></div>`;
      h += `<div class="callout ${s.customers < 30 ? "bad" : ""}"><b>Reading it.</b> ${esc(describe(cur.rules))}. ${s.customers < 30 ? `Only ${s.customers} customers match, too few to trust: a handful of accounts can swing every figure.` : `These customers ${a > b ? "were more" : "were less"} likely than average to order again (${pct(a)} against ${pct(b)}), and ${fr > fb ? "spent more" : "spent less"} per head afterwards.`} The rules used only what was known at the end of ${date}; the next-${cur.h}-day figures are what happened afterwards.</div>`;
    } else if (!r.forward) h += `<div class="kpi bad"><b>n/a</b><span>look-ahead not fully observed</span></div></div><div class="callout bad"><b>No look-ahead.</b> The data ends on 9 Dec 2011, so ${cur.h} days after ${date} cannot be checked. Choose an earlier snapshot or a shorter look-ahead.</div>`;
    else h += `</div><div class="callout bad"><b>No customers match.</b> Loosen a rule.</div>`;
    $("result").innerHTML = h;
  }

  function drawSaved() {
    if (!saved.length) { $("saved").innerHTML = '<div class="callout"><b>No saved segments yet.</b> Press “Save this segment” to keep the current one and compare it with others.</div>'; return; }
    $("saved").innerHTML = `<div class="card wide"><h3>Saved segments</h3>` + C.table(["Name", "Rules", "As of", "Customers", "Ordered next period", "Lift", "Revenue per customer next", ""], saved.map((sg, i) => {
      const r = evaluate(sg), s = r.segment, a = r.forward && s.customers ? s.active / s.customers : null, b = r.forward ? r.everyone.active / r.everyone.customers : null;
      return { cells: [`<b>${esc(sg.name)}</b>`, esc(describe(sg.rules)), RT.monthLabel(RT.monthOfDay(RT.dayOfIso(sg.asof))) + " +" + sg.h + "d", fmtN(s.customers), a == null ? "n/a" : pct(a), a == null ? "n/a" : (a / b).toFixed(1) + "×",
        r.forward && s.customers ? gbp2(s.future_revenue / s.customers) : "n/a", `<button data-i="${i}">Remove</button>`] };
    }), { left: [0, 1, 2] }) + '<p class="small">Each saved segment is re-evaluated live with its own snapshot, look-ahead and customer filter.</p></div>';
    $("saved").querySelectorAll("button[data-i]").forEach((b) => (b.onclick = () => { saved.splice(+b.dataset.i, 1); persist(); drawSaved(); }));
  }

  function actions() {
    $("actions").innerHTML = '<button id="a-save" class="primary">Save this segment</button><button id="a-link">Copy link to saved segments</button><button id="a-export">Export JSON</button><button id="a-import">Import JSON</button><button id="a-clear">Clear saved</button><span class="small" id="a-msg"></span>';
    const msg = (t) => { $("a-msg").textContent = t; setTimeout(() => ($("a-msg").textContent = ""), 2200); };
    $("a-save").onclick = () => { const name = (prompt("Name this segment", describe(cur.rules).slice(0, 40)) || "").trim(); if (!name) return; saved.push({ name, asof: cur.asof, h: cur.h, f: cur.f, rules: Object.assign({}, cur.rules) }); persist(); drawSaved(); };
    $("a-link").onclick = () => { const url = location.href.split("#")[0] + "#t=" + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(saved))))); history.replaceState(null, "", url); navigator.clipboard && navigator.clipboard.writeText(url); msg("Link copied (and shown in the address bar)."); };
    $("a-export").onclick = () => { $("io").hidden = false; $("json").value = JSON.stringify(saved, null, 1); $("ioerr").textContent = "Copy this to keep or share your segments."; };
    $("a-import").onclick = () => { $("io").hidden = false; $("json").value = ""; $("ioerr").textContent = ""; };
    $("cancelimport").onclick = () => ($("io").hidden = true);
    $("doimport").onclick = () => { try { const x = JSON.parse($("json").value); if (!Array.isArray(x) || !x.every(validSeg)) throw new Error("not a valid list of segments"); saved = x; persist(); drawSaved(); $("io").hidden = true; } catch (e) { $("ioerr").textContent = "Could not import: " + e.message + "."; } };
    $("a-clear").onclick = () => { saved = []; persist(); drawSaved(); };
  }
  form(); actions(); render(); drawSaved();
})();
