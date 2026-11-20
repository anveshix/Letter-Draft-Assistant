/* Letter Desk — UI. Works in two modes: "server" (data on school PC, any device) and "local" (data in this browser). */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtD = iso => iso ? iso.split('-').reverse().join('/') : '';
const clone = o => JSON.parse(JSON.stringify(o));
const toast = (m, bad) => { const t = $('#toast'); t.textContent = m; t.className = 'show' + (bad ? ' bad' : ''); clearTimeout(toast.h); toast.h = setTimeout(() => t.className = '', bad ? 4500 : 2200); };
const sessionStr = () => { const d = new Date(), y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return y + '-' + String((y + 1) % 100).padStart(2, '0'); };

/* ---------- storage: same interface for local & server ---------- */
const Store = {
  mode: 'local', db: null,
  async init() {
    if (location.protocol !== 'file:') try {
      const r = await fetch('api/ping', { cache: 'no-store' });
      if (r.ok) { const j = await r.json(); this.mode = 'server'; if (j.auth && !j.logged) await this.login(); await this.reload(); return; }
    } catch (e) { /* not served by server.js -> local mode */ }
    await this.idbLoad();
  },
  async login() {
    for (;;) {
      const v = await ask('Login (लॉगिन)', [{ k: 'pin', l: 'PIN', type: 'password' }], 'Enter');
      if (!v) continue;
      const r = await fetch('api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin: v.pin }) });
      if (r.ok) return; toast(r.status === 429 ? 'Too many attempts — wait a minute' : 'Wrong PIN', true);
    }
  },
  async reload() { const r = await fetch('api/db', { cache: 'no-store' }); if (r.status === 401) { await this.login(); return this.reload(); } this.db = await r.json(); Core.migrate(this.db); },
  idb() { return new Promise((res, rej) => { const q = indexedDB.open('letterdesk', 1); q.onupgradeneeded = () => q.result.createObjectStore('kv'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
  async idbLoad() {
    let v = null;
    try { const d = await this.idb(); v = await new Promise(r => { const g = d.transaction('kv').objectStore('kv').get('db'); g.onsuccess = () => r(g.result); g.onerror = () => r(null); }); } catch (e) { const s = localStorage.getItem('letterdesk-db'); v = s ? JSON.parse(s) : null; }
    this.db = Core.migrate(v || Core.defaultDb()); try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { }
  },
  async idbSave() {
    try { const d = await this.idb(); await new Promise((res, rej) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(this.db, 'db'); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
    catch (e) { localStorage.setItem('letterdesk-db', JSON.stringify(this.db)); }
  },
  async op(name, payload) {
    if (this.mode === 'local') { const r = Core.apply(this.db, name, clone(payload || {})); await this.idbSave(); return clone(r); }
    const r = await fetch('api/op', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, payload }) });
    if (r.status === 401) { await this.login(); return this.op(name, payload); }
    const j = await r.json(); if (!j.ok) throw new Error(j.error); this.merge(name, j.result, j.counters); return j.result;
  },
  merge(name, res, counters) {
    const db = this.db, up = (arr, x) => { const i = arr.findIndex(y => y.id === x.id); if (i < 0) arr.push(x); else arr[i] = x; };
    if (counters) db.counters = counters;
    if (['saveLetter', 'issueLetter', 'patchLetter', 'cancelLetter'].includes(name)) up(db.letters, res);
    if (name === 'issueLetter' && res.replyTo) this.reload();
    if (name === 'deleteLetter') db.letters = db.letters.filter(x => x.id !== res.id);
    if (name === 'saveInward') up(db.inward, res);
    if (name === 'deleteInward') db.inward = db.inward.filter(x => x.id !== res.id);
    if (name === 'saveSettings' || name === 'markBackup') db.settings = res;
    if (name === 'restore') this.reload();
  },
};

/* ---------- small dialog helper ---------- */
function ask(title, fields, okLabel = 'OK') {
  return new Promise(res => {
    const d = $('#dlg');
    d.innerHTML = `<form method="dialog"><h3>${esc(title)}</h3>${fields.map(f => f.type === 'info' ? `<p class="mut">${esc(f.l)}</p>` : `<label>${esc(f.l)}${f.type === 'area' ? `<textarea name="${f.k}" rows="3">${esc(f.v || '')}</textarea>` : `<input name="${f.k}" type="${f.type || 'text'}" value="${esc(f.v || '')}" autocomplete="off">`}</label>`).join('')}<div class="row end"><button value="x" class="ghost" formnovalidate>Cancel</button><button value="ok" class="pri">${okLabel}</button></div></form>`;
    const done = v => { d.onclose = null; res(v); };
    d.onclose = () => { if (d.returnValue !== 'ok') return done(null); const o = {}; $$('input,textarea', d).forEach(i => o[i.name] = i.value); done(o); };
    d.returnValue = ''; if (!d.open) d.showModal(); const f = $('input,textarea', d); f && f.focus();
  });
}

/* ---------- letter model ---------- */
const TPL = id => Tpl.get(id);
const LBL = {
  en: { to: 'To,', subj: 'Subject:', ref: 'Ref. No.', date: 'Date:', encl: 'Enclosure:', cc: 'Copy to:' },
  hi: { to: 'सेवा में,', subj: 'विषय:', ref: 'पत्रांक:', date: 'दिनांक:', encl: 'संलग्न:', cc: 'प्रतिलिपि:' },
};
function defaultFields(tid) { const o = {}; TPL(tid).fields.forEach(f => { if (f.def) o[f.k] = f.def === '__session__' ? sessionStr() : f.def; }); return o; }
function regen(l) {
  const t = TPL(l.tpl), c = t[l.lang] || t.en, S = Store.db.settings;
  l.layout = t.layout; l.heading = c.heading || ''; l.salutation = c.salutation || ''; l.closing = c.closing || '';
  const ctx = { school: S.school[l.lang === 'hi' ? 'hi' : 'en'] };
  if (!l.manual) { l.subject = Tpl.render(c.subject, l.fields, t.fields, ctx); l.body = Tpl.render(c.body, l.fields, t.fields, ctx); }
  if (!l.toManual) { const r = S.recipients.find(x => x.alias === l.rcpt); l.to = r ? (r[l.lang === 'hi' ? 'hi' : 'en'] || r.en) : Tpl.render(c.to || '', l.fields, t.fields, ctx); }
}
function newLetter(o = {}) {
  const S = Store.db.settings, [tid, lg] = (o.tpl || 'req').split('.');
  if (!Tpl.list.find(t => t.id === tid)) throw new Error('Unknown template: ' + tid);
  const l = { id: Core.uid(), status: 'draft', lang: lg || o.lang || 'en', tpl: tid, fields: Object.assign(defaultFields(tid), o.fields || {}), rcpt: o.rcpt || '', to: '', subject: '', body: '', date: o.date || Core.todayISO(), sig: S.defaultSignatory, showSign: !!S.defaultShowSign, encl: '', cc: '', manual: false, toManual: false, replyTo: o.replyTo || '' };
  regen(l);
  if (o.to) { l.to = o.to; l.toManual = true; } if (o.subject) { l.subject = o.subject; l.manual = true; } if (o.body) { l.body = o.body; l.manual = true; }
  return l;
}
const party = l => ((l.to || '').split('\n')[0]) || (l.fields && (l.fields.name || l.fields.title)) || '';
const hasMarkers = l => /‹[^›]+›/.test([l.subject, l.body, l.to].join('\n'));

/* ---------- rendering a letter (preview + print) ---------- */
const para = (t, print) => esc(t).split(/\n{2,}/).map(p => '<p>' + p.replace(/\n/g, '<br>') + '</p>').join('')
  .replace(/‹([^›]+)›/g, (m, x) => print ? '[' + x + ']' : '<mark>[' + x + ']</mark>');
function letterHTML(l, print) {
  const S = Store.db.settings, L = LBL[l.lang || 'en'], sg = S.signatories.find(x => x.id === l.sig) || S.signatories[0] || {};
  const head = S.preprinted ? `<div class="pre" style="height:${+S.topMm || 48}mm">${print ? '' : 'pre-printed letterhead area'}</div>` : `<img class="lh" src="${esc(S.letterhead)}" alt="">`;
  const ref = l.ref || (print ? '' : '__________');
  let h = `<div class="lt ${l.lang === 'hi' ? 'hi' : ''}" style="font-size:${+S.fontPt || 12}pt">${head}<div class="refrow"><b>${L.ref} ${esc(ref)}</b><b>${L.date} ${fmtD(l.date)}</b></div>`;
  if (l.layout === 'letter' && l.to) h += `<div class="to">${L.to}<br>${para(l.to, print).replace(/<\/?p>/g, '')}</div>`;
  if (l.layout === 'notice' || l.layout === 'cert') {
    h += `<div class="hd">${esc(l.heading)}</div>`; if (l.subject) h += `<div class="sj">${para(l.subject, print).replace(/<\/?p>/g, '')}</div>`;
    if (l.layout === 'notice' && l.to) h += `<div class="to2">${para(l.to, print).replace(/<\/?p>/g, '')}</div>`;
  } else if (l.subject) h += `<div class="sub"><b>${L.subj} ${para(l.subject, print).replace(/<\/?p>/g, '')}</b></div>`;
  if (l.layout === 'letter' && l.salutation) h += `<p class="sal">${esc(l.salutation)}</p>`;
  h += `<div class="bd">${para(l.body || '', print)}</div>`;
  let sig = `<div class="sig" style="text-align:${S.sigAlign}">`;
  if (l.layout === 'letter' && l.closing) sig += `<div>${esc(l.closing)}</div>`;
  if (l.showSign && sg.stamp) sig += `<div class="nm"><b>(${esc(sg.name)})</b></div><img class="stamp" src="${esc(sg.stamp)}" alt="">`;
  else sig += `<div class="gap"></div><div class="nm"><b>(${esc(sg.name)})</b></div><div>${esc(sg.designation)}</div><div>${esc(sg.org)}</div>`;
  h += sig + '</div>';
  if (l.encl) h += `<div class="ft"><b>${L.encl}</b> ${esc(l.encl)}</div>`;
  if (l.cc) h += `<div class="ft"><b>${L.cc}</b><br>${esc(l.cc).replace(/\n/g, '<br>')}</div>`;
  return h + '</div>';
}
function printHTML(html, afterId) {
  const r = $('#printRoot'); r.innerHTML = html; document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); r.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done); setTimeout(() => window.print(), 60);
}

/* ---------- app state / routing ---------- */
const S = { view: 'home', cur: null, q: '', status: '', year: '', timer: null };
function go(v, arg) {
  S.view = v; if (v === 'editor') S.cur = arg; if (v !== 'editor') { clearTimeout(S.timer); }
  $$('nav button').forEach(b => b.classList.toggle('on', b.dataset.v === (v === 'editor' ? 'editor' : v)));
  ({ home: viewHome, editor: viewEditor, out: viewOut, inw: viewIn, set: viewSet })[v](); window.scrollTo(0, 0);
}
const nextRefNow = () => Core.peekRef(Store.db, 'out', Core.todayISO());
const yearLetters = () => Store.db.letters.filter(l => l.ref && String(l.refYear) === String(nextRefNow().yk));
const statusChip = s => `<span class="chip ${s}">${({ draft: 'Draft', issued: 'Issued', dispatched: 'Dispatched', cancelled: 'Cancelled', pending: 'Reply pending', replied: 'Replied', noaction: 'No action' })[s] || s}</span>`;

/* ---------- HOME ---------- */
function viewHome() {
  const db = Store.db, nx = nextRefNow(), L = db.letters;
  const drafts = L.filter(l => l.status === 'draft'), toDisp = L.filter(l => l.status === 'issued'), pend = db.inward.filter(r => r.status === 'pending');
  const bk = db.settings.lastBackup ? Math.floor((Date.now() - db.settings.lastBackup) / 864e5) : null;
  const recent = L.filter(l => l.ref).sort((a, b) => (b.issuedAt || 0) - (a.issuedAt || 0)).slice(0, 8);
  $('#main').innerHTML = `
  <div class="grid4">
    <div class="card big"><div class="mut">Next Ref. No. (अगला पत्रांक)</div><div class="num">${esc(nx.ref)}</div></div>
    <div class="card"><div class="mut">Drafts (ड्राफ्ट)</div><div class="num sm">${drafts.length}</div></div>
    <div class="card"><div class="mut">Not yet dispatched (भेजना बाकी)</div><div class="num sm">${toDisp.length}</div></div>
    <div class="card"><div class="mut">Inward — reply pending (उत्तर बाकी)</div><div class="num sm">${pend.length}</div></div>
  </div>
  ${bk === null || bk > 7 ? `<div class="warn">⚠ Backup ${bk === null ? 'never taken' : bk + ' days old'} (बैकअप लें) — <a href="#" id="bk">Download backup now</a></div>` : ''}
  <h2>New letter (नया पत्र)</h2>
  <div class="tiles">${Tpl.list.map(t => `<button class="tile" data-t="${t.id}">${esc(t.name)}<span><i data-t="${t.id}.hi">हिंदी</i></span></button>`).join('')}</div>
  ${drafts.length ? `<h2>Drafts</h2>${table(drafts.slice(0, 6))}` : ''}
  <h2>Recent letters (हाल के पत्र)</h2>${recent.length ? table(recent) : '<p class="mut">No letters yet. Start with a template above, or press <kbd>Ctrl</kbd>+<kbd>K</kbd> and type a command.</p>'}
  <h2>Commands (कमांड)</h2><div class="card cmds"><code>n req @dc topic="…"</code> new letter to DC · <code>n bon.hi name="Anita" father="…" cls=XII purpose="…"</code> Hindi certificate · <code>f scholarship</code> find · <code>ref 321</code> open · <code>d 321 speed post</code> mark dispatched · <code>in "BEO office" "Teacher data"</code> log inward · <code>set next 330</code> · <code>help</code></div>`;
  $$('.tile').forEach(b => b.onclick = e => go('editor', newLetter({ tpl: e.target.dataset.t || b.dataset.t })));
  $$('tbody tr[data-id]').forEach(tr => tr.onclick = () => openLetter(tr.dataset.id));
  const bkl = $('#bk'); if (bkl) bkl.onclick = e => { e.preventDefault(); backup(); };
}
function table(rows) {
  return `<table class="tb"><thead><tr><th>Ref. No.</th><th>Date</th><th>To</th><th>Subject</th><th>Status</th></tr></thead><tbody>${rows.map(l => `<tr data-id="${l.id}"><td><b>${esc(l.ref || '—')}</b></td><td>${fmtD(l.date)}</td><td>${esc(party(l))}</td><td>${esc(l.subject || l.heading || '')}</td><td>${statusChip(l.status)}</td></tr>`).join('')}</tbody></table>`;
}
function openLetter(id) { const l = Store.db.letters.find(x => x.id === id); if (l) go('editor', clone(l)); }

/* ---------- EDITOR ---------- */
function viewEditor() {
  const l = S.cur, S0 = Store.db.settings, t = TPL(l.tpl), issued = l.status !== 'draft';
  const fld = f => `<label>${esc(f.l)}${f.t === 'area' ? `<textarea data-k="${f.k}" rows="3" placeholder="${esc(f.ph || '')}">${esc(l.fields[f.k] || '')}</textarea>` : `<input data-k="${f.k}" type="${f.t === 'date' ? 'date' : 'text'}" value="${esc(l.fields[f.k] || '')}" placeholder="${esc(f.ph || '')}">`}</label>`;
  $('#main').innerHTML = `<div class="ed">
  <section class="form">
    <div class="row"><b class="refbig">${l.ref ? 'Ref. No. ' + esc(l.ref) : 'Ref. No. will be assigned on Issue'}</b> ${statusChip(l.status)} ${l.editedAfterIssue ? '<span class="chip cancelled">edited after issue</span>' : ''}<span id="saved" class="mut"></span></div>
    <div class="row g">
      <label>Template (प्रारूप)<select id="tpl">${Tpl.list.map(x => `<option value="${x.id}" ${x.id === l.tpl ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
      <label>Language (भाषा)<select id="lang"><option value="en" ${l.lang === 'en' ? 'selected' : ''}>English</option><option value="hi" ${l.lang === 'hi' ? 'selected' : ''}>हिंदी</option></select></label>
      <label>Date (दिनांक)<input id="date" type="date" value="${l.date}"></label>
    </div>
    ${l.layout === 'letter' || l.layout === 'notice' ? `<label>Addressee (प्राप्तकर्ता)<select id="rcpt"><option value="">— type below —</option>${S0.recipients.map(r => `<option value="${esc(r.alias)}" ${r.alias === l.rcpt ? 'selected' : ''}>@${esc(r.alias)} — ${esc(r.en.split('\n')[0])}</option>`).join('')}</select></label><textarea id="to" rows="3">${esc(l.to)}</textarea>` : ''}
    ${t.fields.length ? `<fieldset><legend>Fill details (विवरण भरें)</legend>${t.fields.map(fld).join('')}</fieldset>` : ''}
    <label>Subject (विषय)<input id="subject" value="${esc(l.subject)}"></label>
    <label>Letter text (पत्र का मुख्य भाग) <span id="regen" class="mut" style="display:${l.manual ? 'inline' : 'none'}">— edited by hand · <a href="#" id="regenb">↻ regenerate from template</a></span><textarea id="body" rows="10">${esc(l.body)}</textarea></label>
    <div class="row g">
      <label>Signed by (हस्ताक्षरकर्ता)<select id="sig">${S0.signatories.map(s => `<option value="${s.id}" ${s.id === l.sig ? 'selected' : ''}>${esc(s.name)} — ${esc(s.designation)}</option>`).join('')}</select></label>
      <label class="chk"><input id="showSign" type="checkbox" ${l.showSign ? 'checked' : ''}> Attach signature &amp; stamp image (हस्ताक्षर-मुहर)</label>
    </div>
    <div class="row g"><label>Enclosures (संलग्नक)<input id="encl" value="${esc(l.encl)}"></label><label>Copy to (प्रतिलिपि)<textarea id="cc" rows="2">${esc(l.cc)}</textarea></label></div>
    <div class="bar">
      ${issued ? `<button class="pri" id="reprint">🖨 Reprint</button><button id="save">Save changes</button><button id="disp">Dispatch…</button><button class="ghost" id="cancel">Cancel letter</button>`
      : `<button class="pri" id="ip">🖨 Issue &amp; Print <kbd>Ctrl+Enter</kbd></button><button id="issue">Issue only</button><button id="save">Save draft <kbd>Ctrl+S</kbd></button><button class="ghost" id="del">Delete draft</button>`}
      <button class="ghost" id="dup">Duplicate</button>
    </div>
  </section>
  <section class="prev"><div class="zoom"><div class="page" id="preview"></div></div></section></div>`;
  bindEditor(); updatePreview();
}
function touch() { S.cur.dirty = true; clearTimeout(S.timer); $('#saved').textContent = 'editing…'; S.timer = setTimeout(() => saveCur(true), 1500); }
function updatePreview() { const p = $('#preview'); if (p) p.innerHTML = letterHTML(S.cur, false); }
function syncText() { $('#subject').value = S.cur.subject; $('#body').value = S.cur.body; const t = $('#to'); if (t) t.value = S.cur.to; $('#regen').style.display = S.cur.manual ? 'inline' : 'none'; }
async function saveCur(quiet) {
  const l = S.cur; if (!l || S.view !== 'editor') return; clearTimeout(S.timer);
  try { const r = await Store.op('saveLetter', l); S.cur = Object.assign(l, r); l.dirty = false; const sv = $('#saved'); if (sv) sv.textContent = 'saved ✓'; if (!quiet) toast('Saved (सहेजा गया)'); } catch (e) { toast(e.message, true); }
}
function bindEditor() {
  const l = S.cur, on = (sel, ev, fn) => { const e = $(sel); if (e) e.addEventListener(ev, fn); };
  $$('[data-k]').forEach(i => i.addEventListener('input', () => { l.fields[i.dataset.k] = i.value; regen(l); syncText(); updatePreview(); touch(); }));
  on('#tpl', 'change', e => { l.tpl = e.target.value; l.manual = false; regen(l); l.fields = Object.assign(defaultFields(l.tpl), l.fields); regen(l); viewEditor(); touch(); });
  on('#lang', 'change', e => { l.lang = e.target.value; if (!l.manual) regen(l); else { const t = TPL(l.tpl), c = t[l.lang]; l.salutation = c.salutation || ''; l.closing = c.closing || ''; l.heading = c.heading || ''; } if (!l.toManual) regen(l); viewEditor(); touch(); });
  on('#date', 'change', e => { l.date = e.target.value; updatePreview(); touch(); });
  on('#rcpt', 'change', e => { l.rcpt = e.target.value; l.toManual = false; regen(l); syncText(); updatePreview(); touch(); });
  on('#to', 'input', e => { l.to = e.target.value; l.toManual = true; updatePreview(); touch(); });
  on('#subject', 'input', e => { l.subject = e.target.value; l.manual = true; $('#regen').style.display = 'inline'; updatePreview(); touch(); });
  on('#body', 'input', e => { l.body = e.target.value; l.manual = true; $('#regen').style.display = 'inline'; updatePreview(); touch(); });
  on('#regenb', 'click', e => { e.preventDefault(); l.manual = false; regen(l); syncText(); updatePreview(); touch(); });
  on('#sig', 'change', e => { l.sig = e.target.value; updatePreview(); touch(); });
  on('#showSign', 'change', e => { l.showSign = e.target.checked; updatePreview(); touch(); });
  on('#encl', 'input', e => { l.encl = e.target.value; updatePreview(); touch(); });
  on('#cc', 'input', e => { l.cc = e.target.value; updatePreview(); touch(); });
  on('#save', 'click', () => saveCur()); on('#ip', 'click', () => issueCur(true)); on('#issue', 'click', () => issueCur(false));
  on('#reprint', 'click', async () => { await saveCur(true); printHTML(letterHTML(S.cur, true)); });
  on('#dup', 'click', () => { const c = clone(S.cur); ['ref', 'refNo', 'refYear', 'issuedAt', 'dispatch', 'reply', 'cancelReason', 'editedAfterIssue', 'createdAt'].forEach(k => delete c[k]); c.id = Core.uid(); c.status = 'draft'; c.date = Core.todayISO(); c.replyTo = ''; go('editor', c); toast('Duplicated as new draft'); });
  on('#del', 'click', async () => { if (!confirm('Delete this draft?')) return; try { await Store.op('deleteLetter', { id: l.id }); } catch (e) { } S.cur = null; go('home'); });
  on('#disp', 'click', () => dispatchDlg(l.id)); on('#cancel', 'click', () => cancelDlg(l.id));
}
async function issueCur(print) {
  const l = S.cur;
  if (!l.body.trim() && l.layout !== 'cert') return toast('Letter text is empty', true);
  if (hasMarkers(l) && !confirm('Some details are still empty — shown as [ … ].\nIssue anyway? (कुछ विवरण खाली हैं)')) return;
  try {
    const sv = await Store.op('saveLetter', l); Object.assign(l, sv);
    const r = await Store.op('issueLetter', { id: l.id, date: l.date }); S.cur = r; toast('Issued — Ref. No. ' + r.ref);
    viewEditor(); if (print) printHTML(letterHTML(r, true));
  } catch (e) { toast(e.message, true); }
}
async function dispatchDlg(id, mode) {
  const l = Store.db.letters.find(x => x.id === id), v = await ask('Dispatch ' + (l.ref || ''), [{ k: 'mode', l: 'Mode (By hand / Post / Speed Post / Email / WhatsApp)', v: mode || 'By hand' }, { k: 'date', l: 'Date', type: 'date', v: Core.todayISO() }, { k: 'note', l: 'Note / tracking no.', v: '' }], 'Mark dispatched');
  if (!v) return; const r = await Store.op('patchLetter', { id, patch: { dispatch: v } }); if (S.cur && S.cur.id === id) S.cur = Object.assign(S.cur, r); toast('Marked dispatched'); go(S.view === 'editor' ? 'editor' : S.view, S.cur);
}
async function cancelDlg(id) {
  const v = await ask('Cancel this letter? (Ref. No. stays in register)', [{ k: 'reason', l: 'Reason', v: '' }], 'Cancel letter'); if (!v) return;
  const r = await Store.op('cancelLetter', { id, reason: v.reason }); toast('Letter cancelled'); if (S.view === 'editor') go('editor', r); else go(S.view);
}

/* ---------- OUTWARD REGISTER ---------- */
function viewOut() {
  const L = Store.db.letters, years = [...new Set(L.filter(l => l.ref).map(l => l.refYear))].sort().reverse();
  $('#main').innerHTML = `<div class="row g"><h2 style="margin:0">Outward register (जावक पंजी)</h2><span style="flex:1"></span><button id="csv">⬇ Excel/CSV</button><button id="prt">🖨 Print register</button></div>
  <div class="row g filters"><input id="q" placeholder="Search ref, name, subject… (खोजें)" value="${esc(S.q)}"><select id="st"><option value="">All status</option>${['draft', 'issued', 'dispatched', 'cancelled'].map(s => `<option ${S.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select><select id="yr"><option value="">All years</option>${years.map(y => `<option ${String(S.year) === String(y) ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
  <div id="rows"></div>`;
  const draw = () => {
    const q = S.q.toLowerCase(); const rows = outRows().filter(l => (!S.status || l.status === S.status) && (!S.year || String(l.refYear) === String(S.year)) && (!q || [l.ref, l.to, l.subject, l.heading, l.body, l.cc, JSON.stringify(l.fields || {})].join(' ').toLowerCase().includes(q)));
    $('#rows').innerHTML = `<table class="tb reg"><thead><tr><th>Ref. No.</th><th>Date</th><th>To</th><th>Subject</th><th>Status</th><th>Dispatch</th><th></th></tr></thead><tbody>${rows.map(l => `<tr data-id="${l.id}"><td><b>${esc(l.ref || '—')}</b></td><td>${fmtD(l.date)}</td><td>${esc(party(l))}</td><td>${esc(l.subject || l.heading || '')}${l.editedAfterIssue ? ' <span class="chip cancelled">edited</span>' : ''}</td><td>${statusChip(l.status)}</td><td>${l.dispatch ? esc(l.dispatch.mode) + ' · ' + fmtD(l.dispatch.date) : ''}</td><td class="act">${l.ref ? `<button data-a="print" title="Reprint">🖨</button>` : ''}${l.status === 'issued' ? `<button data-a="disp" title="Mark dispatched">✉</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="mut">Nothing found</td></tr>'}</tbody></table><p class="mut">${rows.length} record(s)</p>`;
    $$('#rows tr[data-id]').forEach(tr => tr.onclick = e => { const a = e.target.dataset.a; const id = tr.dataset.id; if (a === 'print') { const l = Store.db.letters.find(x => x.id === id); printHTML(letterHTML(l, true)); } else if (a === 'disp') dispatchDlg(id); else openLetter(id); });
  };
  $('#q').oninput = e => { S.q = e.target.value; draw(); }; $('#st').onchange = e => { S.status = e.target.value; draw(); }; $('#yr').onchange = e => { S.year = e.target.value; draw(); };
  $('#csv').onclick = exportCSV; $('#prt').onclick = () => { printHTML('<h3>Outward register — ' + esc(Store.db.settings.school.en) + '</h3>' + $('#rows').innerHTML.replace(/<td class="act">.*?<\/td>/g, '<td></td>')); };
  draw();
}
const outRows = () => Store.db.letters.slice().sort((a, b) => (b.ref ? b.refYear * 1e6 + b.refNo : 1e12) - (a.ref ? a.refYear * 1e6 + a.refNo : 1e12));
function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
function exportCSV() {
  const q = s => '"' + String(s ?? '').replace(/"/g, '""').replace(/\n/g, ' ') + '"';
  const rows = [['Ref No', 'Date', 'To', 'Subject', 'Status', 'Dispatch mode', 'Dispatch date', 'Note', 'Cancel reason']].concat(outRows().filter(l => l.ref).reverse().map(l => [l.ref, fmtD(l.date), l.to, l.subject || l.heading, l.status, l.dispatch?.mode, fmtD(l.dispatch?.date), l.dispatch?.note, l.cancelReason]));
  download('outward-register-' + Core.todayISO() + '.csv', '﻿' + rows.map(r => r.map(q).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
}
async function backup() { download('letterdesk-backup-' + Core.todayISO() + '.json', JSON.stringify(Store.db), 'application/json'); await Store.op('markBackup'); toast('Backup downloaded (बैकअप सहेजा गया)'); }

/* ---------- INWARD REGISTER ---------- */
function viewIn() {
  const R = Store.db.inward.slice().reverse();
  $('#main').innerHTML = `<h2>Inward register (आवक पंजी) — letters received</h2>
  <form id="inf" class="card row g"><label>From (प्रेषक)<input name="from" required></label><label>Subject (विषय)<input name="subject" required></label><label>Received on (प्राप्ति तिथि)<input name="date" type="date" value="${Core.todayISO()}"></label><label>Their Ref. &amp; date<input name="senderRef"></label><label>Mode<select name="mode"><option>By hand</option><option>Post</option><option>Speed Post</option><option>Email</option><option>WhatsApp</option></select></label><label class="chk"><input name="needsReply" type="checkbox" checked> Reply needed (उत्तर आवश्यक)</label><button class="pri">Add (जोड़ें)</button></form>
  <table class="tb"><thead><tr><th>Inward No.</th><th>Date</th><th>From</th><th>Subject</th><th>Their ref</th><th>Status</th><th></th></tr></thead><tbody>${R.map(r => `<tr data-id="${r.id}"><td><b>${esc(r.no)}</b></td><td>${fmtD(r.date)}</td><td>${esc(r.from)}</td><td>${esc(r.subject)}</td><td>${esc(r.senderRef || '')}</td><td>${statusChip(r.status)} ${r.reply ? esc(r.reply.ref) : ''}</td><td class="act">${r.status === 'pending' ? '<button data-a="reply">↩ Reply</button>' : ''}<button data-a="del" title="Delete">✕</button></td></tr>`).join('') || '<tr><td colspan="7" class="mut">No inward letters logged</td></tr>'}</tbody></table>`;
  $('#inf').onsubmit = async e => { e.preventDefault(); const f = new FormData(e.target); await Store.op('saveInward', { id: Core.uid(), from: f.get('from'), subject: f.get('subject'), date: f.get('date'), senderRef: f.get('senderRef'), mode: f.get('mode'), needsReply: f.get('needsReply') === 'on' }); toast('Logged'); viewIn(); };
  $$('tbody tr[data-id]').forEach(tr => tr.onclick = async e => { const a = e.target.dataset.a, r = Store.db.inward.find(x => x.id === tr.dataset.id); if (a === 'reply') replyTo(r); else if (a === 'del' && confirm('Delete this entry?')) { await Store.op('deleteInward', { id: r.id }); viewIn(); } });
}
function replyTo(r) { go('editor', newLetter({ tpl: 'blank', to: r.from, subject: 'Reply to your letter ' + (r.senderRef ? r.senderRef + ' ' : '') + 'regarding ' + r.subject, replyTo: r.id })); }

/* ---------- SETTINGS ---------- */
function viewSet() {
  const s = clone(Store.db.settings), nx = nextRefNow();
  $('#main').innerHTML = `<h2>Settings (सेटिंग)</h2><p class="mut">Mode: <b>${Store.mode === 'server' ? 'Server — data on the school computer, usable from any device' : 'Local — data stays in this browser only'}</b></p>
  <div class="card"><h3>Reference numbers (पत्रांक)</h3><div class="row g">
    <label>Format<input id="refFormat" value="${esc(s.refFormat)}"><small>{n} number · {yy} 26 · {yyyy} 2026 · {sess} 26-27</small></label>
    <label>Numbering year<select id="yearMode"><option value="calendar" ${s.yearMode === 'calendar' ? 'selected' : ''}>Calendar (Jan–Dec)</option><option value="session" ${s.yearMode === 'session' ? 'selected' : ''}>Session (Apr–Mar)</option></select></label>
    <label>Zero padding<input id="padWidth" type="number" min="0" max="6" value="${s.padWidth}"></label>
    <label>Inward format<input id="inFormat" value="${esc(s.inFormat)}"></label></div>
    <div class="row g"><label>Next number to be issued (अगला नंबर)<input id="nextN" type="number" min="1" value="${nx.n}"></label><button id="setN">Set next number</button><span class="mut">Currently: <b>${esc(nx.ref)}</b> · Match this with your paper register.</span></div></div>
  <div class="card"><h3>Printing (प्रिंट)</h3><div class="row g">
    <label class="chk"><input id="preprinted" type="checkbox" ${s.preprinted ? 'checked' : ''}> Printing on pre-printed letterhead paper (leave header blank)</label>
    <label>Blank space at top (mm)<input id="topMm" type="number" min="10" max="90" value="${s.topMm}"></label>
    <label>Font size (pt)<select id="fontPt">${[11, 12, 13, 14].map(x => `<option ${+s.fontPt === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    <label>Signature block<select id="sigAlign"><option value="left" ${s.sigAlign === 'left' ? 'selected' : ''}>Left</option><option value="right" ${s.sigAlign === 'right' ? 'selected' : ''}>Right</option></select></label>
    <label class="chk"><input id="defaultShowSign" type="checkbox" ${s.defaultShowSign ? 'checked' : ''}> Attach signature image by default</label></div>
    <div class="row g"><label>Letterhead image<input id="lhfile" type="file" accept="image/*"></label><button id="lhreset" class="ghost">Use default letterhead</button></div></div>
  <div class="card"><h3>Signatories (हस्ताक्षरकर्ता)</h3><div id="sgs"></div><button id="addsg">+ Add signatory</button></div>
  <div class="card"><h3>Address book (पता सूची) — use as <code>@alias</code></h3><div id="rcs"></div><button id="addrc">+ Add addressee</button></div>
  <div class="row"><button class="pri" id="saveS">Save settings (सहेजें)</button></div>
  <div class="card"><h3>Backup (बैकअप)</h3><div class="row g"><button id="bk">⬇ Download backup</button><label>Restore from backup<input id="rf" type="file" accept=".json"></label></div><p class="mut">Last backup: ${s.lastBackup ? new Date(s.lastBackup).toLocaleString() : 'never'}${Store.mode === 'server' ? ' · the server also keeps a daily copy in data/backups' : ''}</p></div>`;
  const sgs = () => $('#sgs').innerHTML = s.signatories.map((g, i) => `<div class="row g sgrow" data-i="${i}"><label>Name<input data-f="name" value="${esc(g.name)}"></label><label>Designation<input data-f="designation" value="${esc(g.designation)}"></label><label>Organisation<input data-f="org" value="${esc(g.org)}"></label><label>Sign/stamp image<input data-f="stampfile" type="file" accept="image/*"></label><span class="mut">${g.stamp ? 'image set' : 'no image'}</span><button class="ghost" data-del="${i}">✕</button></div>`).join('');
  const rcs = () => $('#rcs').innerHTML = s.recipients.map((r, i) => `<div class="row g rcrow" data-i="${i}"><label>Alias<input data-f="alias" value="${esc(r.alias)}" size="6"></label><label>English address<textarea data-f="en" rows="3">${esc(r.en)}</textarea></label><label>हिंदी पता<textarea data-f="hi" rows="3">${esc(r.hi)}</textarea></label><button class="ghost" data-del="${i}">✕</button></div>`).join('');
  sgs(); rcs();
  const readImg = f => new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(f); });
  $('#sgs').addEventListener('input', e => { const i = e.target.closest('.sgrow').dataset.i, f = e.target.dataset.f; if (f && f !== 'stampfile') s.signatories[i][f] = e.target.value; });
  $('#sgs').addEventListener('change', async e => { if (e.target.dataset.f === 'stampfile' && e.target.files[0]) { s.signatories[e.target.closest('.sgrow').dataset.i].stamp = await readImg(e.target.files[0]); sgs(); } });
  $('#sgs').addEventListener('click', e => { if (e.target.dataset.del !== undefined && s.signatories.length > 1) { s.signatories.splice(+e.target.dataset.del, 1); sgs(); } });
  $('#rcs').addEventListener('input', e => { const i = e.target.closest('.rcrow').dataset.i, f = e.target.dataset.f; s.recipients[i][f] = e.target.value; });
  $('#rcs').addEventListener('click', e => { if (e.target.dataset.del !== undefined) { s.recipients.splice(+e.target.dataset.del, 1); rcs(); } });
  $('#addsg').onclick = () => { s.signatories.push({ id: Core.uid(), name: '', designation: '', org: s.school.en, stamp: '' }); sgs(); };
  $('#addrc').onclick = () => { s.recipients.push({ alias: '', en: '', hi: '' }); rcs(); };
  $('#lhfile').onchange = async e => { if (e.target.files[0]) { s.letterhead = await readImg(e.target.files[0]); toast('Letterhead set — press Save'); } };
  $('#lhreset').onclick = () => { s.letterhead = 'assets/letterhead.png'; toast('Default letterhead — press Save'); };
  $('#saveS').onclick = async () => {
    ['refFormat', 'inFormat', 'yearMode'].forEach(k => s[k] = $('#' + k).value); s.padWidth = +$('#padWidth').value; s.topMm = +$('#topMm').value; s.fontPt = +$('#fontPt').value; s.sigAlign = $('#sigAlign').value;
    s.preprinted = $('#preprinted').checked; s.defaultShowSign = $('#defaultShowSign').checked; s.recipients = s.recipients.filter(r => r.alias.trim()).map(r => ({ ...r, alias: r.alias.trim().toLowerCase() }));
    if (!/\{n\}/.test(s.refFormat)) return toast('Format must contain {n}', true);
    try { await Store.op('saveSettings', s); toast('Settings saved (सेटिंग सहेजी गई)'); viewSet(); } catch (e) { toast(e.message, true); }
  };
  $('#setN').onclick = () => setNext(+$('#nextN').value);
  $('#bk').onclick = backup;
  $('#rf').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const d = JSON.parse(await f.text()); if (!confirm('Replace ALL current data with this backup?')) return; await Store.op('restore', d); toast('Restored'); go('home'); } catch (er) { toast(er.message, true); } };
}
async function setNext(n) { if (!(n >= 1)) return toast('Enter a number ≥ 1', true); await Store.op('setCounter', { series: 'out', year: nextRefNow().yk, last: n - 1 }); toast('Next Ref. No. is now ' + nextRefNow().ref); if (S.view === 'set') viewSet(); }

/* ---------- COMMAND BAR ---------- */
const HELP = [
  ['n <template>[.hi] [@alias] [key=value …]', 'new letter — e.g. n req @dc topic="school repair"'],
  ['templates', Tpl.list.map(t => t.id).join(' · ') + '   (add .hi for Hindi)'],
  ['f <text>   or just type text', 'find in register'], ['ref <no>', 'open letter by number'], ['dup <no>', 'duplicate a letter'],
  ['d <no> [mode]', 'mark dispatched today'], ['x <no> reason', 'cancel a letter'], ['in "from" "subject"', 'log an inward letter'],
  ['set next <n>', 'set next Ref. No.'], ['bk · csv · home · out · inw · set', 'backup / export / go to page'],
  ['Editor keys', 'Ctrl+Enter issue & print · Ctrl+S save'],
];
function tok(s) { const o = [], re = /(?:(\w+)=)?(?:"([^"]*)"|'([^']*)'|(\S+))/g; let m; while ((m = re.exec(s))) o.push({ k: m[1], v: m[2] ?? m[3] ?? m[4] }); return o; }
const findByRef = a => { const yk = nextRefNow().yk, x = String(a).trim(); return Store.db.letters.find(l => l.ref === x) || Store.db.letters.find(l => l.ref && l.refNo === +x && l.refYear === yk) || Store.db.letters.filter(l => l.ref && l.refNo === +x).sort((a, b) => b.refYear - a.refYear)[0]; };
const parseDate = v => { const m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/.exec(v); if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; };
async function runCmd(line) {
  line = line.trim(); if (!line) return; const t = tok(line), c = (t[0].v || '').toLowerCase(), rest = t.slice(1);
  const arg = () => line.slice(line.indexOf(t[0].v) + t[0].v.length).trim();
  try {
    if (c === 'n' || c === 'new') {
      const tp = (rest[0] && !rest[0].k ? rest[0].v : 'req').toLowerCase(), [id, lg] = tp.split('.'), tpl = Tpl.list.find(x => x.id === id) || Tpl.list.find(x => x.id.startsWith(id));
      if (!tpl) throw new Error('Unknown template "' + id + '". Try: ' + Tpl.list.map(x => x.id).join(', '));
      const o = { tpl: tpl.id + (lg ? '.' + lg : ''), fields: {} };
      rest.slice(1).concat(rest[0] && rest[0].k ? [rest[0]] : []).forEach(a => {
        if (!a.k && a.v[0] === '@') { const al = a.v.slice(1).toLowerCase(), r = Store.db.settings.recipients.find(x => x.alias === al) || Store.db.settings.recipients.find(x => x.alias.startsWith(al)); if (!r) throw new Error('No addressee @' + al); o.rcpt = r.alias; }
        else if (a.k === 'date') { const d = parseDate(a.v); if (!d) throw new Error('Bad date ' + a.v); o.date = d; }
        else if (a.k === 'subject') o.subject = a.v; else if (a.k === 'to') o.to = a.v.replace(/\\n|;/g, '\n'); else if (a.k === 'lang') o.lang = a.v;
        else if (a.k) { if (tpl.fields.some(f => f.k === a.k)) o.fields[a.k] = parseDate(a.v) && tpl.fields.find(f => f.k === a.k).t === 'date' ? parseDate(a.v) : a.v.replace(/\\n/g, '\n'); else throw new Error('"' + a.k + '" is not a field of ' + tpl.id + '. Fields: ' + tpl.fields.map(f => f.k).join(', ')); }
      });
      return go('editor', newLetter(o));
    }
    if (S.view === 'editor' && ['ip', 'i', 'p', 's'].includes(c)) { if (c === 'ip' || c === 'p') return S.cur.status === 'draft' ? issueCur(true) : printHTML(letterHTML(S.cur, true)); if (c === 'i') return issueCur(false); return saveCur(); }
    if (c === 'ref' || c === 'open') { const l = findByRef(rest[0].v); if (!l) throw new Error('Not found'); return openLetter(l.id); }
    if (c === 'dup') { const l = findByRef(rest[0].v); if (!l) throw new Error('Not found'); const d = clone(l); ['ref', 'refNo', 'refYear', 'issuedAt', 'dispatch', 'reply', 'cancelReason', 'editedAfterIssue', 'createdAt'].forEach(k => delete d[k]); d.id = Core.uid(); d.status = 'draft'; d.date = Core.todayISO(); return go('editor', d); }
    if (c === 'd') { const l = findByRef(rest[0].v); if (!l) throw new Error('Not found'); const mode = rest.slice(1).map(x => x.v).join(' ') || 'By hand'; await Store.op('patchLetter', { id: l.id, patch: { dispatch: { mode, date: Core.todayISO(), note: '' } } }); toast(l.ref + ' marked dispatched (' + mode + ')'); return S.view === 'editor' ? null : go(S.view); }
    if (c === 'x') { const l = findByRef(rest[0].v); if (!l) throw new Error('Not found'); await Store.op('cancelLetter', { id: l.id, reason: rest.slice(1).map(x => x.v).join(' ') }); toast(l.ref + ' cancelled'); return go('out'); }
    if (c === 'in') { const a = rest.filter(x => !x.k).map(x => x.v); if (a.length < 2) throw new Error('Usage: in "from" "subject"'); const m = rest.find(x => x.k === 'mode'); await Store.op('saveInward', { id: Core.uid(), from: a[0], subject: a[1], date: Core.todayISO(), mode: m ? m.v : 'By hand', needsReply: true }); toast('Inward logged'); return go('inw'); }
    if (c === 'set' && (rest[0] || {}).v === 'next') return setNext(+rest[1].v);
    if (c === 'bk' || c === 'backup') return backup(); if (c === 'csv') return exportCSV();
    if (['home', 'out', 'inw', 'set'].includes(c)) return go(c);
    if (c === 'last') { S.q = ''; S.status = ''; S.year = ''; return go('out'); }
    if (c === 'help' || c === '?') return showHelp();
    S.q = (c === 'f' || c === 'find') ? arg() : line; S.status = ''; S.year = ''; go('out');
  } catch (e) { toast(e.message, true); }
}
function showHelp() { const d = $('#dlg'); d.innerHTML = `<form method="dialog"><h3>Commands</h3><table class="tb">${HELP.map(h => `<tr><td><code>${esc(h[0])}</code></td><td>${esc(h[1])}</td></tr>`).join('')}</table><div class="row end"><button class="pri">Close</button></div></form>`; d.onclose = null; d.showModal(); }
function bindCmd() {
  const i = $('#cmd'), sug = $('#sug');
  i.addEventListener('keydown', e => { if (e.key === 'Enter') { const v = i.value; i.value = ''; sug.innerHTML = ''; i.blur(); runCmd(v); } if (e.key === 'Escape') { i.value = ''; sug.innerHTML = ''; i.blur(); } });
  i.addEventListener('input', () => { const v = i.value.toLowerCase(); const m = /^(n|new)\s+(\S*)$/.exec(v); sug.innerHTML = m ? Tpl.list.filter(t => t.id.startsWith(m[2].split('.')[0])).map(t => `<div>${t.id} <span>${esc(t.name)}</span></div>`).join('') : ''; });
  i.addEventListener('blur', () => setTimeout(() => sug.innerHTML = '', 150));
  document.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'k') { e.preventDefault(); i.focus(); i.select(); }
    else if (k === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); i.focus(); }
    else if ((e.ctrlKey || e.metaKey) && k === 'enter' && S.view === 'editor') { e.preventDefault(); S.cur.status === 'draft' ? issueCur(true) : printHTML(letterHTML(S.cur, true)); }
    else if ((e.ctrlKey || e.metaKey) && k === 's' && S.view === 'editor') { e.preventDefault(); saveCur(); }
  });
}

/* ---------- boot ---------- */
(async function () {
  $$('nav button').forEach(b => b.onclick = () => go(b.dataset.v === 'editor' ? (S.cur ? 'editor' : 'home') : b.dataset.v));
  bindCmd();
  try { await Store.init(); } catch (e) { $('#main').innerHTML = '<p class="warn">Could not start: ' + esc(e.message) + '</p>'; return; }
  $('#mode').textContent = Store.mode === 'server' ? '● Server' : '● Local (this browser)';
  $('#mode').className = 'mode ' + Store.mode; go('home');
  if (Store.mode === 'server') setInterval(async () => { if (S.view === 'home' || S.view === 'out' || S.view === 'inw') { try { await Store.reload(); if (S.view === 'home') viewHome(); } catch (e) { } } }, 60000);
  window.addEventListener('beforeunload', e => { if (S.cur && S.cur.dirty) { e.preventDefault(); e.returnValue = ''; } });
})();
