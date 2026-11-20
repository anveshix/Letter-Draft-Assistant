/* Letter Draft Assistant v2.0 — Complete Secure Web App UI */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtD = (iso) => Core.fmtDateDMY(iso);
const clone = (o) => JSON.parse(JSON.stringify(o));

function toast(msg, bad = false) {
  const t = $('#toast');
  t.textContent = String(msg || '');
  t.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(toast.h);
  toast.h = setTimeout(() => { t.className = ''; }, bad ? 4500 : 2400);
}

/* ---------- Authenticated Image Blob Cache (for protected api/files/*) ---------- */
const ImageCache = {
  map: new Map(),
  async preloadAll(db) {
    if (!db || !db.settings) return;
    const urls = new Set();
    if (db.settings.letterhead && db.settings.letterhead.startsWith('api/files/')) urls.add(db.settings.letterhead);
    (db.settings.signatories || []).forEach(sg => {
      if (sg.stamp && sg.stamp.startsWith('api/files/')) urls.add(sg.stamp);
    });
    await Promise.all([...urls].map(u => this.ensure(u)));
  },
  async ensure(src) {
    if (!src || !src.startsWith('api/files/')) return src;
    if (this.map.has(src)) return this.map.get(src);
    try {
      const r = await apiFetch(src);
      if (!r.ok) return '';
      const blob = await r.blob();
      const objUrl = URL.createObjectURL(blob);
      this.map.set(src, objUrl);
      return objUrl;
    } catch (_) {
      return '';
    }
  },
  resolve(src) {
    const clean = Core.sanitizeImageSrc(src, '');
    if (!clean) return '';
    if (clean.startsWith('api/files/')) return this.map.get(clean) || '';
    return clean;
  },
  clear() {
    for (const u of this.map.values()) {
      try { URL.revokeObjectURL(u); } catch (_) {}
    }
    this.map.clear();
  },
};

/* ---------- Secure API Client (Cookie + Session Header + CSRF) ---------- */
const Session = {
  user: null,
  csrfToken: null,
  token: sessionStorage.getItem('lda_token') || null,
  set(data) {
    this.user = data.user || null;
    this.csrfToken = data.csrfToken || this.csrfToken;
    if (data.sessionToken) {
      this.token = data.sessionToken;
      try { sessionStorage.setItem('lda_token', data.sessionToken); } catch (_) {}
    }
  },
  clear() {
    this.user = null;
    this.csrfToken = null;
    this.token = null;
    try { sessionStorage.removeItem('lda_token'); } catch (_) {}
    ImageCache.clear();
  },
  can(perm) {
    if (!this.user) return false;
    if (this.user.role === 'admin') return true;
    if (this.user.role === 'staff') return perm === 'read' || perm === 'write';
    if (this.user.role === 'viewer') return perm === 'read';
    return false;
  },
};

async function apiFetch(url, opts = {}) {
  const headers = Object.assign({}, opts.headers || {});
  if (Session.token) headers['x-session-token'] = Session.token;
  if (Session.csrfToken && opts.method && opts.method !== 'GET' && opts.method !== 'HEAD') {
    headers['x-csrf-token'] = Session.csrfToken;
  }
  return fetch(url, Object.assign({ credentials: 'same-origin', cache: 'no-store' }, opts, { headers }));
}

async function apiJson(url, opts = {}) {
  const headers = Object.assign({ 'content-type': 'application/json' }, opts.headers || {});
  const res = await apiFetch(url, Object.assign({}, opts, { headers }));
  const data = await res.json().catch(() => ({ ok: false, error: 'Unexpected server response.' }));
  if (res.status === 401 && !url.includes('api/auth/')) {
    Session.clear();
    showAuthGate();
    throw new Error('Session expired. Please sign in again.');
  }
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

async function downloadFromApi(url, postBody, fallbackName) {
  try {
    toast('Generating file… (फ़ाइल तैयार हो रही है…)');
    const opts = postBody
      ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(postBody) }
      : { method: 'GET' };
    const res = await apiFetch(url, opts);
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Export failed (${res.status})`);
    }
    const blob = await res.blob();
    let filename = fallbackName || 'download';
    const cd = res.headers.get('content-disposition') || '';
    const mUtf = /filename\*=UTF-8''([^;]+)/i.exec(cd);
    const mStd = /filename="([^"]+)"/i.exec(cd);
    if (mUtf) filename = decodeURIComponent(mUtf[1]);
    else if (mStd) filename = mStd[1];

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('Downloaded: ' + filename);
  } catch (e) {
    toast(e.message, true);
  }
}

/* ---------- Store ---------- */
const Store = {
  db: null,
  serverInfo: {},
  async reload() {
    const j = await apiJson('api/db');
    this.db = Core.migrate(j.db);
    this.serverInfo = j.serverInfo || {};
    await ImageCache.preloadAll(this.db);
    const sub = $('#brandSub');
    if (sub && this.db.settings && this.db.settings.school) {
      sub.textContent = this.db.settings.school.en || this.db.settings.school.name;
    }
  },
  async op(name, payload) {
    const j = await apiJson('api/op', { method: 'POST', body: JSON.stringify({ name, payload }) });
    this.merge(name, j.result, j.counters);
    if (name === 'saveSettings') await ImageCache.preloadAll(this.db);
    return j.result;
  },
  merge(name, res, counters) {
    const db = this.db;
    const up = (arr, x) => { const i = arr.findIndex(y => y.id === x.id); if (i < 0) arr.push(x); else arr[i] = x; };
    if (counters) db.counters = counters;
    if (['saveLetter', 'issueLetter', 'patchLetter', 'cancelLetter'].includes(name)) up(db.letters, res);
    if (name === 'issueLetter' && res.replyTo) this.reload();
    if (name === 'deleteLetter') db.letters = db.letters.filter(x => x.id !== res.id);
    if (name === 'saveInward') up(db.inward, res);
    if (name === 'deleteInward') db.inward = db.inward.filter(x => x.id !== res.id);
    if (name === 'saveSettings' || name === 'markBackup') db.settings = res;
    if (name === 'saveCustomTemplate' || name === 'deleteCustomTemplate') db.customTemplates = res;
    if (name === 'restore') this.reload();
  },
};

/* ---------- Modal Dialog Helper ---------- */
function ask(title, fields, okLabel = 'OK') {
  return new Promise(resolve => {
    const d = $('#dlg');
    d.innerHTML = `<form method="dialog">
      <h3>${esc(title)}</h3>
      ${fields.map(f => {
        if (f.type === 'info') return `<p class="mut">${esc(f.l)}</p>`;
        if (f.type === 'select') {
          return `<label>${esc(f.l)}<select name="${esc(f.k)}">${(f.opts || []).map(o => {
            const val = typeof o === 'object' ? o.v : o;
            const lbl = typeof o === 'object' ? o.l : o;
            return `<option value="${esc(val)}" ${String(f.v || '') === String(val) ? 'selected' : ''}>${esc(lbl)}</option>`;
          }).join('')}</select></label>`;
        }
        return `<label>${esc(f.l)}${
          f.type === 'area'
            ? `<textarea name="${esc(f.k)}" rows="3" placeholder="${esc(f.ph || '')}">${esc(f.v || '')}</textarea>`
            : `<input name="${esc(f.k)}" type="${esc(f.type || 'text')}" value="${esc(f.v || '')}" placeholder="${esc(f.ph || '')}" autocomplete="off">`
        }</label>`;
      }).join('')}
      <div class="row end">
        <button value="x" class="ghost" formnovalidate>Cancel (रद्द करें)</button>
        <button value="ok" class="pri">${esc(okLabel)}</button>
      </div>
    </form>`;
    const done = v => { d.onclose = null; resolve(v); };
    d.onclose = () => {
      if (d.returnValue !== 'ok') return done(null);
      const out = {};
      $$('input,textarea,select', d).forEach(el => { out[el.name] = el.value; });
      done(out);
    };
    d.returnValue = '';
    if (!d.open) d.showModal();
    const first = $('input,textarea,select', d);
    if (first) first.focus();
  });
}

/* ---------- Auth / Login / Setup Screen ---------- */
async function showAuthGate() {
  $('#app').style.display = 'none';
  $('#authScreen').style.display = 'flex';
  const box = $('#authBody');
  try {
    const st = await apiJson('api/auth/status');
    if (st.authenticated && st.user) {
      Session.set(st);
      return enterApp();
    }
    if (st.needsSetup) renderSetupForm(box);
    else renderLoginForm(box);
  } catch (e) {
    box.innerHTML = `<div class="auth-err">Server unreachable: ${esc(e.message)}</div>`;
  }
}

function renderSetupForm(box, errMsg = '') {
  box.innerHTML = `
    <div class="auth-info">
      <b>प्रथम बार सेटअप (First-Time Admin Setup):</b><br>
      अनधिकृत एक्सेस रोकने हेतु अपना मुख्य एडमिन (प्राचार्य/प्रशासक) खाता बनाएँ।
    </div>
    ${errMsg ? `<div class="auth-err">${esc(errMsg)}</div>` : ''}
    <form id="setupForm">
      <label>Admin Username (यूज़रनेम — जैसे <code>admin</code> या <code>principal</code>)
        <input name="username" required minlength="3" maxlength="32" value="admin" autocomplete="username">
      </label>
      <label>Full Name &amp; Designation (पूरा नाम व पदनाम)
        <input name="displayName" required placeholder="Mrs. Sumita Tudu (Principal)" value="Administrator">
      </label>
      <label>Strong Password (सुरक्षित पासवर्ड — कम से कम 8 अक्षर)
        <input name="password" type="password" required minlength="8" placeholder="Minimum 8 characters" autocomplete="new-password">
      </label>
      <label>Confirm Password (पासवर्ड दोबारा लिखें)
        <input name="confirm" type="password" required minlength="8" placeholder="Re-enter password" autocomplete="new-password">
      </label>
      <button type="submit" class="pri" style="width:100%;justify-content:center;padding:10px;margin-top:6px">
        🔐 Create Admin &amp; Launch System
      </button>
    </form>`;
  $('#setupForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const pw = fd.get('password');
    if (pw !== fd.get('confirm')) {
      return renderSetupForm(box, 'Passwords do not match (दोनों पासवर्ड समान नहीं हैं).');
    }
    try {
      const res = await apiJson('api/auth/setup', {
        method: 'POST',
        body: JSON.stringify({
          username: fd.get('username'),
          displayName: fd.get('displayName'),
          password: pw,
        }),
      });
      Session.set(res);
      toast('Admin account created! Welcome.');
      enterApp();
    } catch (err) {
      renderSetupForm(box, err.message);
    }
  };
}

function renderLoginForm(box, errMsg = '') {
  box.innerHTML = `
    <div class="auth-info">
      अधिकृत कार्यालय लॉगिन (Authorized Personnel Only)। कृपया अपना यूज़रनेम और पासवर्ड दर्ज करें।
    </div>
    ${errMsg ? `<div class="auth-err">${esc(errMsg)}</div>` : ''}
    <form id="loginForm">
      <label>Username (यूज़रनेम)
        <input name="username" required autocomplete="username" placeholder="Enter username">
      </label>
      <label>Password (पासवर्ड)
        <input name="password" type="password" required autocomplete="current-password" placeholder="Enter password">
      </label>
      <label class="chk" style="margin:6px 0 12px">
        <input name="remember" type="checkbox"> Keep signed in on this trusted PC (7 days)
      </label>
      <button type="submit" class="pri" style="width:100%;justify-content:center;padding:10px">
        🔓 Sign In (सुरक्षित लॉगिन करें)
      </button>
    </form>`;
  const uInput = $('input[name="username"]', box);
  if (uInput) uInput.focus();
  $('#loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const res = await apiJson('api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username: fd.get('username'),
          password: fd.get('password'),
          remember: fd.get('remember') === 'on',
        }),
      });
      Session.set(res);
      toast('Signed in as ' + res.user.displayName);
      enterApp();
    } catch (err) {
      renderLoginForm(box, err.message);
    }
  };
}

async function enterApp() {
  try {
    await Store.reload();
    $('#authScreen').style.display = 'none';
    $('#app').style.display = 'grid';
    const u = Session.user;
    $('#userBadge').textContent = `👤 ${u.displayName} (${u.role.toUpperCase()})`;
    go(S.view || 'home', S.cur);
  } catch (e) {
    toast(e.message, true);
  }
}

/* ---------- Letter Model & Accurate Placeholder Engine ---------- */
const allTemplates = () => Tpl.allList(Store.db && Store.db.customTemplates);
const getTpl = (id) => Tpl.get(id, Store.db && Store.db.customTemplates);

const LBL = {
  en: { to: 'To,', subj: 'Subject:', ref: 'Ref. No.:', date: 'Date:', encl: 'Enclosure(s):', cc: 'Copy forwarded to:', head: 'Major Head / File:' },
  hi: { to: 'सेवा में,', subj: 'विषय:', ref: 'पत्रांक:', date: 'दिनांक:', encl: 'संलग्नक:', cc: 'प्रतिलिपि सूचनार्थ एवं आवश्यक कार्यार्थ:', head: 'मद / संचिका:' },
};

function defaultFields(tid, isoDate) {
  const o = {};
  const sess = Core.sessionFromISO(isoDate || Core.todayISO());
  getTpl(tid).fields.forEach(f => {
    if (f.def) o[f.k] = f.def === '__session__' ? sess : f.def;
  });
  return o;
}

function nextRefNow(headCode, isoDate) {
  return Core.peekRef(Store.db, 'out', isoDate || Core.todayISO(), headCode || 'ADM');
}

function regen(l) {
  const t = getTpl(l.tpl);
  const c = t[l.lang] || t.en;
  const S0 = Store.db.settings;
  l.layout = t.layout || 'letter';
  l.heading = c.heading || '';
  l.salutation = c.salutation || '';
  l.closing = c.closing || '';
  const nx = nextRefNow(l.majorHead, l.date);
  const ctx = Core.buildPlaceholderContext(Store.db, l, nx.ref);

  if (!l.manual) {
    l.subject = Tpl.render(c.subject, l.fields, t.fields, ctx);
    l.body = Tpl.render(c.body, l.fields, t.fields, ctx);
  }
  if (!l.toManual) {
    const r = S0.recipients.find(x => x.alias === l.rcpt);
    l.to = r ? (r[l.lang === 'hi' ? 'hi' : 'en'] || r.en) : Tpl.render(c.to || '', l.fields, t.fields, ctx);
  }
}

// Resolve any {{placeholder}} written manually inside Subject, Body, To, Enclosures, CC
function resolveLiveLetter(l) {
  const t = getTpl(l.tpl);
  const nx = nextRefNow(l.majorHead, l.date);
  const ctx = Core.buildPlaceholderContext(Store.db, l, nx.ref);
  const out = clone(l);
  out.to = Tpl.render(l.to || '', l.fields, t.fields, ctx);
  out.heading = Tpl.render(l.heading || '', l.fields, t.fields, ctx);
  out.subject = Tpl.render(l.subject || '', l.fields, t.fields, ctx);
  out.salutation = Tpl.render(l.salutation || '', l.fields, t.fields, ctx);
  out.body = Tpl.render(l.body || '', l.fields, t.fields, ctx);
  out.closing = Tpl.render(l.closing || '', l.fields, t.fields, ctx);
  out.encl = Tpl.render(l.encl || '', l.fields, t.fields, ctx);
  out.cc = Tpl.render(l.cc || '', l.fields, t.fields, ctx);
  return out;
}

function getUnfilledMarkers(l) {
  const r = resolveLiveLetter(l);
  const text = [r.to, r.heading, r.subject, r.body, r.encl, r.cc].join('\n');
  const set = new Set();
  const re = /‹([^›]+)›/g;
  let m;
  while ((m = re.exec(text))) set.add(m[1]);
  return [...set];
}

function detectCustomPlaceholderKeys(l) {
  const t = getTpl(l.tpl);
  const known = new Set((t.fields || []).map(f => f.k));
  const sysCtx = Core.buildPlaceholderContext(Store.db, l, '000');
  Object.keys(sysCtx).forEach(k => known.add(k));
  const raw = Tpl.extractPlaceholders([l.to, l.subject, l.body, l.encl, l.cc]);
  return raw.filter(k => !known.has(k));
}

function newLetter(o = {}) {
  const S0 = Store.db.settings;
  const [tid, lg] = (o.tpl || 'req').split('.');
  const tpl = allTemplates().find(t => t.id === tid) || allTemplates()[0];
  const dt = o.date || Core.todayISO();
  const l = {
    id: Core.uid(),
    status: 'draft',
    lang: lg || o.lang || 'en',
    tpl: tpl.id,
    majorHead: o.majorHead || tpl.majorHead || Core.inferMajorHead(tpl.id),
    subHead: o.subHead || '',
    fields: Object.assign(defaultFields(tpl.id, dt), o.fields || {}),
    rcpt: o.rcpt || '',
    to: '',
    subject: '',
    body: '',
    date: dt,
    sig: S0.defaultSignatory,
    showSign: !!S0.defaultShowSign,
    encl: o.encl || '',
    cc: o.cc || '',
    remarks: o.remarks || '',
    manual: false,
    toManual: false,
    replyTo: o.replyTo || '',
  };
  regen(l);
  if (o.to) { l.to = o.to; l.toManual = true; }
  if (o.subject) { l.subject = o.subject; l.manual = true; }
  if (o.body) { l.body = o.body; l.manual = true; }
  return l;
}

const party = (l) => ((l.to || '').split('\n')[0]) || (l.fields && (l.fields.name || l.fields.staff_name || l.fields.person_name || l.fields.title)) || '—';

/* ---------- Render Letter HTML (Live Preview + Browser A4 Print) ---------- */
function para(t, print) {
  return esc(t)
    .split(/\n{2,}/)
    .map(p => '<p>' + p.replace(/\n/g, '<br>') + '</p>')
    .join('')
    .replace(/‹([^›]+)›/g, (_, x) => (print ? '[' + x + ']' : '<mark>[' + x + ']</mark>'));
}

function letterHTML(rawLetter, print) {
  const l = resolveLiveLetter(rawLetter);
  const S0 = Store.db.settings;
  const isHi = l.lang === 'hi';
  const L = LBL[isHi ? 'hi' : 'en'];
  const sg = (S0.signatories || []).find(x => x.id === l.sig) || (S0.signatories || [])[0] || {};
  const lhSrc = ImageCache.resolve(S0.letterhead);
  const stampSrc = l.showSign && sg.stamp ? ImageCache.resolve(sg.stamp) : '';
  const fontPt = Math.max(10, Math.min(16, Number(S0.fontPt) || 12));
  const sigAlignClass = S0.sigAlign === 'left' ? 'sig-left' : 'sig-right';
  const fontClass = S0.fontFamily === 'mukta' ? 'mukta' : '';
  const certClass = l.layout === 'cert' && !S0.preprinted ? 'cert-box' : '';

  const head = S0.preprinted
    ? `<div class="pre" style="height:${Math.max(10, Math.min(100, +S0.topMm || 48))}mm">${print ? '' : 'Pre-printed Letterhead Blank Space (' + (+S0.topMm || 48) + ' mm)'}</div>`
    : (lhSrc ? `<img class="lh" src="${esc(lhSrc)}" alt="Letterhead">` : `<div style="text-align:center;border-bottom:2px solid #1f3a5f;padding-bottom:6px;margin-bottom:8px"><b>${esc(S0.school.name)}</b><br><small>${esc(S0.school.addressEn)}</small></div>`);

  const ref = l.ref || (print ? '' : '__________');
  let h = `<div class="lt ${isHi ? 'hi' : ''} ${fontClass} ${certClass}" style="font-size:${fontPt}pt">`;
  h += head;
  h += `<div class="refrow"><b>${esc(L.ref)} ${esc(ref)}</b><b>${esc(L.date)} ${esc(fmtD(l.date))}</b></div>`;

  if (S0.showMajorHeadOnLetter || l.subHead) {
    const mh = Core.getMajorHeadObj(Store.db, l.majorHead);
    const mhTxt = [mh ? (isHi ? mh.hi : mh.en) : '', l.subHead].filter(Boolean).join(' / ');
    if (mhTxt) h += `<div class="headrow">${esc(L.head)} ${esc(mhTxt)}</div>`;
  }

  if (l.layout === 'letter' && l.to) {
    h += `<div class="to"><b>${esc(L.to)}</b><br>${para(l.to, print).replace(/<\/?p>/g, '')}</div>`;
  }
  if (l.layout === 'notice' || l.layout === 'cert') {
    if (l.heading) h += `<div class="hd">${para(l.heading, print).replace(/<\/?p>/g, '')}</div>`;
    if (l.subject) h += `<div class="sj">${para(l.subject, print).replace(/<\/?p>/g, '')}</div>`;
    if (l.layout === 'notice' && l.to) h += `<div class="to2">${para(l.to, print).replace(/<\/?p>/g, '')}</div>`;
  } else if (l.subject) {
    h += `<div class="sub"><b>${esc(L.subj)} ${para(l.subject, print).replace(/<\/?p>/g, '')}</b></div>`;
  }

  if (l.layout === 'letter' && l.salutation) {
    h += `<p class="sal">${esc(l.salutation)}</p>`;
  }
  h += `<div class="bd">${para(l.body || '', print)}</div>`;

  const sigName = isHi ? (sg.nameHi || sg.name || '') : (sg.name || '');
  const sigDesig = isHi ? (sg.designationHi || sg.designation || '') : (sg.designation || '');
  const sigOrg = isHi ? (sg.orgHi || sg.org || '') : (sg.org || '');

  let sigHtml = `<div class="sig ${sigAlignClass}">`;
  if (l.layout === 'letter' && l.closing) sigHtml += `<div>${esc(l.closing)}</div>`;
  if (stampSrc) {
    sigHtml += `<img class="stamp" src="${esc(stampSrc)}" alt="Signature & Stamp"><div class="nm"><b>(${esc(sigName)})</b></div>`;
  } else {
    sigHtml += `<div class="gap"></div><div class="nm"><b>(${esc(sigName)})</b></div><div>${esc(sigDesig)}</div><div>${esc(sigOrg)}</div>`;
  }
  h += sigHtml + '</div>';

  if (l.encl) h += `<div class="ft"><b>${esc(L.encl)}</b> ${para(l.encl, print).replace(/<\/?p>/g, '')}</div>`;
  if (l.cc) h += `<div class="ft"><b>${esc(L.cc)}</b><br>${para(l.cc, print).replace(/<\/?p>/g, '')}</div>`;
  return h + '</div>';
}

function printHTML(html) {
  const r = $('#printRoot');
  r.innerHTML = html;
  document.body.classList.add('printing');
  const done = () => {
    document.body.classList.remove('printing');
    r.innerHTML = '';
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 80);
}

/* ---------- App Router ---------- */
const S = {
  view: 'home',
  cur: null,
  dashHead: '',
  q: '',
  head: '',
  subHead: '',
  status: '',
  year: '',
  fromDate: '',
  toDate: '',
  inQ: '',
  inHead: '',
  timer: null,
  activeField: null,
};

function statusChip(s) {
  const map = {
    draft: 'Draft (प्रारूप)',
    issued: 'Issued (निर्गत)',
    dispatched: 'Dispatched (प्रेषित)',
    cancelled: 'Cancelled (रद्द)',
    pending: 'Reply Pending (उत्तर बाकी)',
    replied: 'Replied (उत्तरित)',
    noaction: 'Recorded (दर्ज)',
  };
  const safeClass = ['draft', 'issued', 'dispatched', 'cancelled', 'pending', 'replied', 'noaction'].includes(s) ? s : '';
  return `<span class="chip ${safeClass}">${esc(map[s] || s)}</span>`;
}

function go(v, arg) {
  S.view = v;
  if (v === 'editor') S.cur = arg || S.cur || newLetter({ tpl: 'req' });
  if (v !== 'editor') clearTimeout(S.timer);
  $$('#sideNav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  const views = {
    home: viewHome,
    editor: viewEditor,
    out: viewOut,
    inw: viewIn,
    sync: viewSync,
    sec: viewSec,
    set: viewSet,
  };
  (views[v] || viewHome)();
  window.scrollTo(0, 0);
}

/* ---------- 1. DASHBOARD (HOME) ---------- */
function viewHome() {
  const db = Store.db;
  const nx = nextRefNow('ADM');
  const L = db.letters;
  const drafts = L.filter(l => l.status === 'draft');
  const toDisp = L.filter(l => l.status === 'issued');
  const pend = db.inward.filter(r => r.status === 'pending');
  const recent = L.filter(l => l.ref).sort((a, b) => (b.issuedAt || 0) - (a.issuedAt || 0)).slice(0, 8);
  const heads = db.settings.majorHeads || Core.DEFAULT_MAJOR_HEADS;
  const tpls = allTemplates().filter(t => !S.dashHead || (t.majorHead || 'ADM') === S.dashHead);

  $('#main').innerHTML = `
    <div class="grid4">
      <div class="card big">
        <div class="mut">Next Outward Ref. No. (अगला पत्रांक)</div>
        <div class="num">${esc(nx.ref)}</div>
        <div class="mut" style="margin-top:4px">Auto-assigned without gaps on Issue</div>
      </div>
      <div class="card">
        <div class="mut">Saved Drafts (प्रारूप)</div>
        <div class="num sm">${drafts.length}</div>
        <div class="mut">Ready to edit / issue</div>
      </div>
      <div class="card">
        <div class="mut">Issued — Awaiting Dispatch (भेजना बाकी)</div>
        <div class="num sm">${toDisp.length}</div>
        <div class="mut">Click Outward Register to log</div>
      </div>
      <div class="card">
        <div class="mut">Inward — Reply Pending (उत्तर बाकी)</div>
        <div class="num sm">${pend.length}</div>
        <div class="mut">Auto-closes when reply is issued</div>
      </div>
    </div>

    <div class="card">
      <div class="row between">
        <h3 style="margin:0">📊 Search Register by Major Head (मदवार पंजी एवं त्वरित खोज)</h3>
        <div class="row">
          <button class="sm ok" id="dlMasterXlsx">📊 Download Master Excel (.xlsx)</button>
          <button class="sm" id="goSheetSearch">🔍 Open Full Sheet Search</button>
        </div>
      </div>
      <div class="head-pills" style="margin-bottom:0">
        ${heads.map(h => {
          const cnt = L.filter(l => (l.majorHead || 'ADM') === h.code).length;
          return `<button class="head-pill" data-openhead="${esc(h.code)}" title="${esc(h.hi)}"><b>${esc(h.code)}</b> · ${esc(h.en)} <span class="chip">${cnt}</span></button>`;
        }).join('')}
      </div>
    </div>

    ${Session.can('write') ? `
      <div class="row between" style="margin-top:16px">
        <h2 style="margin:0">✍ Start a New Official Letter / Certificate (नया पत्र या प्रमाण-पत्र बनाएँ)</h2>
        <select id="dashHeadSel" style="width:auto;min-width:230px">
          <option value="">All Major Heads (सभी मद — ${allTemplates().length} प्रारूप)</option>
          ${heads.map(h => `<option value="${esc(h.code)}" ${S.dashHead === h.code ? 'selected' : ''}>${esc(h.code)} — ${esc(h.en)} (${esc(h.hi)})</option>`).join('')}
        </select>
      </div>
      <div class="tiles" style="margin-top:10px">
        ${tpls.map(t => `
          <button class="tile" data-t="${esc(t.id)}">
            <span class="t-head">${esc(t.majorHead || 'ADM')}</span>
            <span class="t-title">${esc(t.name)}</span>
            <span class="t-lang">
              <i data-t="${esc(t.id)}">English</i>
              <i class="hi" data-t="${esc(t.id)}.hi">हिंदी</i>
            </span>
          </button>
        `).join('')}
      </div>
    ` : ''}

    ${drafts.length ? `<h2>📝 Unissued Drafts (अधूरे प्रारूप)</h2>${renderLetterTable(drafts.slice(0, 6))}` : ''}
    <h2>📤 Recently Issued Letters (हाल ही में निर्गत पत्र)</h2>
    ${recent.length ? renderLetterTable(recent) : '<div class="card mut">No issued letters yet. Choose any English or हिंदी template tile above to draft your first letter!</div>'}
  `;

  $('#dlMasterXlsx').onclick = () => downloadFromApi('api/export/xlsx', null, `Master_Letter_Register_${Core.todayISO()}.xlsx`);
  $('#goSheetSearch').onclick = () => go('out');
  $$('[data-openhead]').forEach(b => {
    b.onclick = () => { S.head = b.dataset.openhead; S.q = ''; go('out'); };
  });
  const dSel = $('#dashHeadSel');
  if (dSel) dSel.onchange = e => { S.dashHead = e.target.value; viewHome(); };
  $$('.tile').forEach(b => {
    b.onclick = e => {
      const code = e.target.dataset.t || b.dataset.t;
      go('editor', newLetter({ tpl: code }));
    };
  });
  bindLetterTableClicks();
}

function renderLetterTable(rows) {
  return `<div class="table-wrap"><table class="tb">
    <thead>
      <tr>
        <th>Letter No. (पत्रांक)</th>
        <th>Date</th>
        <th>Major Head (मद)</th>
        <th>Recipient (प्राप्तकर्ता)</th>
        <th>Subject (विषय)</th>
        <th>Status</th>
        <th>Download</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map(l => `
        <tr data-id="${esc(l.id)}">
          <td><b>${esc(l.ref || 'DRAFT')}</b></td>
          <td>${esc(fmtD(l.date))}</td>
          <td><span class="head-badge">${esc(l.majorHead || 'ADM')}</span>${l.subHead ? `<br><small>${esc(l.subHead)}</small>` : ''}</td>
          <td>${esc(party(l))}</td>
          <td>${esc(String(l.subject || l.heading || '').replace(/‹([^›]+)›/g, '[$1]'))}</td>
          <td>${statusChip(l.status)}</td>
          <td class="act">
            <button data-dl="docx" title="Download Word (.docx)">📄 .docx</button>
            <button data-dl="pdf" title="Download PDF (.pdf)">📕 .pdf</button>
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table></div>`;
}

function bindLetterTableClicks() {
  $$('tbody tr[data-id]').forEach(tr => {
    tr.onclick = (e) => {
      const id = tr.dataset.id;
      const dl = e.target.dataset.dl;
      const l = Store.db.letters.find(x => x.id === id);
      if (!l) return;
      if (dl === 'docx') {
        e.stopPropagation();
        return downloadFromApi(`api/export/docx?id=${encodeURIComponent(id)}`, null, `Letter_${l.ref || 'Draft'}.docx`);
      }
      if (dl === 'pdf') {
        e.stopPropagation();
        return downloadFromApi(`api/export/pdf?id=${encodeURIComponent(id)}`, null, `Letter_${l.ref || 'Draft'}.pdf`);
      }
      go('editor', clone(l));
    };
  });
}

/* ---------- 2. SMART LETTER EDITOR ---------- */
function viewEditor() {
  const l = S.cur;
  const S0 = Store.db.settings;
  const t = getTpl(l.tpl);
  const issued = l.status !== 'draft';
  const readOnly = !Session.can('write');
  const heads = S0.majorHeads || Core.DEFAULT_MAJOR_HEADS;
  const customKeys = detectCustomPlaceholderKeys(l);
  const unfilled = getUnfilledMarkers(l);

  const renderFieldInput = (f) => {
    const val = l.fields[f.k] ?? '';
    const optTag = f.opt ? ' <small>(optional / वैकल्पिक)</small>' : ' <small style="color:#b91c1c">*</small>';
    if (f.t === 'area') {
      return `<label>${esc(f.l)}${optTag}<textarea data-k="${esc(f.k)}" rows="3" placeholder="${esc(f.ph || '')}" ${readOnly ? 'disabled' : ''}>${esc(val)}</textarea></label>`;
    }
    if (f.t === 'select') {
      return `<label>${esc(f.l)}${optTag}<select data-k="${esc(f.k)}" ${readOnly ? 'disabled' : ''}>${(f.opts || []).map(o => `<option value="${esc(o)}" ${val === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
    }
    return `<label>${esc(f.l)}${optTag}<input data-k="${esc(f.k)}" type="${f.t === 'date' ? 'date' : 'text'}" value="${esc(val)}" placeholder="${esc(f.ph || '')}" ${readOnly ? 'disabled' : ''}></label>`;
  };

  $('#main').innerHTML = `<div class="ed">
    <section class="form">
      <div class="row between">
        <div class="row">
          <b class="refbig">${l.ref ? 'पत्रांक / Ref. No.: ' + esc(l.ref) : 'Next Ref: ' + esc(nextRefNow(l.majorHead, l.date).ref) + ' (assigned on Issue)'}</b>
          ${statusChip(l.status)}
          ${l.editedAfterIssue ? '<span class="chip cancelled">Edited after issue</span>' : ''}
        </div>
        <span id="saved" class="mut"></span>
      </div>

      <div id="phStatusBox">
        ${unfilled.length
          ? `<div class="warn" style="margin:8px 0">⚠ <b>${unfilled.length} Placeholder(s) Unfilled (अधूरे स्थान):</b> ${unfilled.map(u => `<code>[${esc(u)}]</code>`).join(' ')}</div>`
          : `<div class="ok-banner">✓ <b>All placeholders accurately filled!</b> Ready to Issue, Print, or Download (.docx / .pdf).</div>`}
      </div>

      <div class="row g">
        <label>Major Head (मुख्य शीर्ष / मद)
          <select id="majorHead" ${readOnly ? 'disabled' : ''}>
            ${heads.map(h => `<option value="${esc(h.code)}" ${(l.majorHead || 'ADM') === h.code ? 'selected' : ''}>${esc(h.code)} — ${esc(h.en)} (${esc(h.hi)})</option>`).join('')}
          </select>
        </label>
        <label>Sub-Head / File No. (उप-शीर्ष / संचिका सं.)
          <input id="subHead" value="${esc(l.subHead || '')}" placeholder="e.g. Scholarship / CBSE-2026 / File-04" ${readOnly ? 'disabled' : ''}>
        </label>
      </div>

      <div class="row g">
        <label>Template (पत्र का प्रारूप)
          <select id="tpl" ${readOnly ? 'disabled' : ''}>
            ${allTemplates().map(x => `<option value="${esc(x.id)}" ${x.id === l.tpl ? 'selected' : ''}>[${esc(x.majorHead || 'ADM')}] ${esc(x.name)}</option>`).join('')}
          </select>
        </label>
        <label style="max-width:130px">Language (भाषा)
          <select id="lang" ${readOnly ? 'disabled' : ''}>
            <option value="en" ${l.lang === 'en' ? 'selected' : ''}>English</option>
            <option value="hi" ${l.lang === 'hi' ? 'selected' : ''}>हिंदी (Unicode)</option>
          </select>
        </label>
        <label style="max-width:155px">Date (दिनांक)
          <input id="date" type="date" value="${esc(l.date)}" ${readOnly ? 'disabled' : ''}>
        </label>
      </div>

      ${l.layout === 'letter' || l.layout === 'notice' ? `
        <label>Recipient / Addressee (प्राप्तकर्ता चुनें या नीचे टाइप करें)
          <select id="rcpt" ${readOnly ? 'disabled' : ''}>
            <option value="">— Custom / Type below —</option>
            ${S0.recipients.map(r => `<option value="${esc(r.alias)}" ${r.alias === l.rcpt ? 'selected' : ''}>@${esc(r.alias)} — ${esc(r.en.split('\n')[0])}</option>`).join('')}
          </select>
        </label>
        <textarea id="to" rows="3" placeholder="Recipient designation & address..." ${readOnly ? 'disabled' : ''}>${esc(l.to)}</textarea>
      ` : ''}

      ${t.fields.length || customKeys.length ? `
        <fieldset>
          <legend>🎯 Fill Accurate Placeholders (आवश्यक विवरण भरें)</legend>
          ${t.fields.map(renderFieldInput).join('')}
          <div id="customPhInputs">
            ${customKeys.map(ck => `
              <label>Custom Placeholder <code>{{${esc(ck)}}}</code>
                <input data-k="${esc(ck)}" type="text" value="${esc(l.fields[ck] || '')}" placeholder="Value for {{${esc(ck)}}}" ${readOnly ? 'disabled' : ''}>
              </label>
            `).join('')}
          </div>
        </fieldset>
      ` : `<div id="customPhInputs"></div>`}

      ${!readOnly ? `
        <div class="ph-bar">
          <span class="mut" style="width:100%;font-size:11.5px"><b>+ Insert Auto/Custom Placeholder into Subject or Body:</b> (Click any tag below)</span>
          ${Core.SYSTEM_PLACEHOLDERS.map(p => `<button type="button" class="ph-chip" data-ins="{{${esc(p.key)}}}" title="${esc(p.label)}">+ {{${esc(p.key)}}}</button>`).join('')}
          <button type="button" class="ph-chip" id="addCustomPhBtn" style="background:#eff6ff;font-weight:700">+ Custom {{…}}</button>
          <button type="button" class="ph-chip" id="krutiBtn" style="background:#fef3c7;color:#92400e;border-color:#fcd34d" title="Convert legacy KrutiDev-010 text into clean Unicode Hindi">🔤 KrutiDev → Unicode</button>
        </div>
      ` : ''}

      ${l.layout === 'cert' || l.layout === 'notice' ? `
        <label>Heading (शीर्षक)<input id="heading" value="${esc(l.heading || '')}" ${readOnly ? 'disabled' : ''}></label>
      ` : ''}

      <label>Subject (विषय)
        <input id="subject" value="${esc(l.subject)}" placeholder="Official letter subject..." ${readOnly ? 'disabled' : ''}>
      </label>

      <label>
        <span>Letter Body (पत्र का मुख्य भाग)
          <span id="regen" class="mut" style="display:${l.manual ? 'inline' : 'none'}">
            — manually edited · <a href="#" id="regenb">↻ Reset from template</a>
          </span>
        </span>
        <textarea id="body" rows="10" ${readOnly ? 'disabled' : ''}>${esc(l.body)}</textarea>
      </label>

      <div id="krutiHint" class="warn" style="display:none">
        ⚠ यह टेक्स्ट पुराने <b>KrutiDev</b> फ़ॉन्ट जैसा लग रहा है! सभी कंप्यूटर/मोबाइल पर सही दिखने के लिए <button type="button" class="sm pri" id="krutiAutoFix">अभी Unicode हिंदी में बदलें</button>
      </div>

      <div class="row g">
        <label>Signatory (हस्ताक्षरकर्ता)
          <select id="sig" ${readOnly ? 'disabled' : ''}>
            ${S0.signatories.map(s => `<option value="${esc(s.id)}" ${s.id === l.sig ? 'selected' : ''}>${esc(s.name)} — ${esc(s.designation)}</option>`).join('')}
          </select>
        </label>
        <label class="chk">
          <input id="showSign" type="checkbox" ${l.showSign ? 'checked' : ''} ${readOnly ? 'disabled' : ''}>
          Attach Signature &amp; Stamp (हस्ताक्षर व मुहर जोड़ें)
        </label>
      </div>

      <div class="row g">
        <label>Enclosures (संलग्नक)<input id="encl" value="${esc(l.encl)}" placeholder="e.g. As stated above (02 pages)" ${readOnly ? 'disabled' : ''}></label>
        <label>Copy To (प्रतिलिपि)<textarea id="cc" rows="2" placeholder="1. DEO Dumka for kind information..." ${readOnly ? 'disabled' : ''}></textarea></label>
      </div>

      <label>Register Remarks (पंजी अभ्युक्ति — केवल रजिस्टर/एक्सेल के लिए, पत्र पर प्रिंट नहीं होगा)
        <input id="remarks" value="${esc(l.remarks || '')}" placeholder="Optional file note for Excel / Google Sheet register..." ${readOnly ? 'disabled' : ''}>
      </label>

      <div class="bar">
        ${!readOnly ? (issued
          ? `<button class="pri" id="reprint">🖨 Print A4</button>
             <button id="save">💾 Save Changes</button>
             <button id="disp">✉ Dispatch…</button>`
          : `<button class="pri" id="ip">🖨 Issue &amp; Print <kbd>Ctrl+Enter</kbd></button>
             <button class="ok" id="issue">✓ Issue Ref. No.</button>
             <button id="save">💾 Save Draft <kbd>Ctrl+S</kbd></button>`
        ) : ''}
        <button id="dlDocx" title="Download Editable Microsoft Word (.docx)">📄 Word (.docx)</button>
        <button id="dlPdf" title="Download Official PDF with Embedded Fonts (.pdf)">📕 PDF (.pdf)</button>
        ${!readOnly ? `<button class="ghost" id="dup">📋 Duplicate</button>` : ''}
        ${Session.can('admin') && issued && l.status !== 'cancelled' ? `<button class="danger" id="cancel">🚫 Cancel</button>` : ''}
        ${Session.can('admin') && !issued ? `<button class="danger" id="del">🗑 Delete Draft</button>` : ''}
      </div>
    </section>

    <section class="prev">
      <div class="zoom"><div class="page" id="preview"></div></div>
    </section>
  </div>`;

  // Set textarea value safely
  const ccEl = $('#cc');
  if (ccEl) ccEl.value = l.cc || '';

  bindEditor();
  updatePreview();
}

function refreshPlaceholderBanner() {
  const box = $('#phStatusBox');
  if (!box || !S.cur) return;
  const unfilled = getUnfilledMarkers(S.cur);
  box.innerHTML = unfilled.length
    ? `<div class="warn" style="margin:8px 0">⚠ <b>${unfilled.length} Placeholder(s) Unfilled (अधूरे स्थान):</b> ${unfilled.map(u => `<code>[${esc(u)}]</code>`).join(' ')}</div>`
    : `<div class="ok-banner">✓ <b>All placeholders accurately filled!</b> Ready to Issue, Print, or Download (.docx / .pdf).</div>`;
}

function refreshCustomPlaceholderInputs() {
  const wrap = $('#customPhInputs');
  if (!wrap || !S.cur) return;
  const keys = detectCustomPlaceholderKeys(S.cur);
  const existing = [...$$('input[data-k]', wrap)].map(i => i.dataset.k);
  if (JSON.stringify(keys) === JSON.stringify(existing)) return;
  wrap.innerHTML = keys.map(ck => `
    <label>Custom Placeholder <code>{{${esc(ck)}}}</code>
      <input data-k="${esc(ck)}" type="text" value="${esc(S.cur.fields[ck] || '')}" placeholder="Enter value for {{${esc(ck)}}}">
    </label>
  `).join('');
  $$('input[data-k]', wrap).forEach(inp => {
    inp.addEventListener('input', () => {
      S.cur.fields[inp.dataset.k] = inp.value;
      updatePreview();
      refreshPlaceholderBanner();
      touch();
    });
  });
}

function updatePreview() {
  const p = $('#preview');
  if (p && S.cur) p.innerHTML = letterHTML(S.cur, false);
  refreshPlaceholderBanner();
}

function touch() {
  if (!Session.can('write')) return;
  S.cur.dirty = true;
  clearTimeout(S.timer);
  const sv = $('#saved');
  if (sv) sv.textContent = 'editing…';
  S.timer = setTimeout(() => saveCur(true), 1400);
}

function syncTextFields() {
  const l = S.cur;
  if ($('#subject')) $('#subject').value = l.subject;
  if ($('#body')) $('#body').value = l.body;
  if ($('#to')) $('#to').value = l.to;
  if ($('#heading')) $('#heading').value = l.heading;
  if ($('#regen')) $('#regen').style.display = l.manual ? 'inline' : 'none';
}

async function saveCur(quiet = false) {
  const l = S.cur;
  if (!l || S.view !== 'editor' || !Session.can('write')) return;
  clearTimeout(S.timer);
  try {
    const r = await Store.op('saveLetter', l);
    S.cur = Object.assign(l, r);
    l.dirty = false;
    const sv = $('#saved');
    if (sv) sv.textContent = 'Saved ✓';
    if (!quiet) toast('Saved to Register & Excel ✓');
  } catch (e) {
    toast(e.message, true);
  }
}

function bindEditor() {
  const l = S.cur;
  const on = (sel, ev, fn) => { const e = $(sel); if (e) e.addEventListener(ev, fn); };

  ['#subject', '#body', '#to', '#encl', '#cc'].forEach(sel => {
    const el = $(sel);
    if (el) el.addEventListener('focus', () => { S.activeField = el; });
  });

  $$('[data-k]').forEach(inp => {
    const evName = inp.tagName === 'SELECT' ? 'change' : 'input';
    inp.addEventListener(evName, () => {
      l.fields[inp.dataset.k] = inp.value;
      regen(l);
      syncTextFields();
      updatePreview();
      touch();
    });
  });

  on('#majorHead', 'change', e => { l.majorHead = e.target.value; updatePreview(); viewEditor(); touch(); });
  on('#subHead', 'input', e => { l.subHead = e.target.value; updatePreview(); touch(); });
  on('#tpl', 'change', e => {
    l.tpl = e.target.value;
    const tObj = getTpl(l.tpl);
    l.majorHead = tObj.majorHead || Core.inferMajorHead(l.tpl);
    l.manual = false;
    l.fields = Object.assign(defaultFields(l.tpl, l.date), l.fields);
    regen(l);
    viewEditor();
    touch();
  });
  on('#lang', 'change', e => {
    l.lang = e.target.value;
    if (!l.manual) regen(l);
    else {
      const c = getTpl(l.tpl)[l.lang] || getTpl(l.tpl).en;
      l.salutation = c.salutation || '';
      l.closing = c.closing || '';
      if (!l.heading) l.heading = c.heading || '';
    }
    if (!l.toManual) regen(l);
    viewEditor();
    touch();
  });
  on('#date', 'change', e => { l.date = e.target.value; regen(l); syncTextFields(); updatePreview(); touch(); });
  on('#rcpt', 'change', e => { l.rcpt = e.target.value; l.toManual = false; regen(l); syncTextFields(); updatePreview(); touch(); });
  on('#to', 'input', e => { l.to = e.target.value; l.toManual = true; refreshCustomPlaceholderInputs(); updatePreview(); touch(); });
  on('#heading', 'input', e => { l.heading = e.target.value; updatePreview(); touch(); });
  on('#subject', 'input', e => {
    l.subject = e.target.value;
    l.manual = true;
    if ($('#regen')) $('#regen').style.display = 'inline';
    refreshCustomPlaceholderInputs();
    updatePreview();
    touch();
  });
  on('#body', 'input', e => {
    l.body = e.target.value;
    l.manual = true;
    if ($('#regen')) $('#regen').style.display = 'inline';
    if ($('#krutiHint')) $('#krutiHint').style.display = KrutiDev.looksLikeKrutiDev(l.body) ? 'block' : 'none';
    refreshCustomPlaceholderInputs();
    updatePreview();
    touch();
  });
  on('#regenb', 'click', e => {
    e.preventDefault();
    l.manual = false;
    regen(l);
    syncTextFields();
    updatePreview();
    touch();
  });
  on('#sig', 'change', e => { l.sig = e.target.value; updatePreview(); touch(); });
  on('#showSign', 'change', e => { l.showSign = e.target.checked; updatePreview(); touch(); });
  on('#encl', 'input', e => { l.encl = e.target.value; refreshCustomPlaceholderInputs(); updatePreview(); touch(); });
  on('#cc', 'input', e => { l.cc = e.target.value; refreshCustomPlaceholderInputs(); updatePreview(); touch(); });
  on('#remarks', 'input', e => { l.remarks = e.target.value; touch(); });

  // Placeholder chip insertion
  $$('.ph-chip[data-ins]').forEach(btn => {
    btn.onclick = () => {
      const target = S.activeField || $('#body');
      if (!target) return;
      const tag = btn.dataset.ins;
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? target.value.length;
      target.value = target.value.slice(0, start) + tag + target.value.slice(end);
      target.dispatchEvent(new Event('input'));
      target.focus();
      target.selectionStart = target.selectionEnd = start + tag.length;
    };
  });

  on('#addCustomPhBtn', 'click', async () => {
    const v = await ask('Insert Custom Placeholder (कस्टम प्लेसहोल्डर जोड़ें)', [
      { k: 'name', l: 'Placeholder Key (e.g. bank_account, roll_no, amount)', ph: 'custom_field' },
      { k: 'val', l: 'Value (मान)', ph: 'Enter value now or fill later' },
    ], 'Insert Placeholder');
    if (!v || !v.name) return;
    const key = v.name.trim().replace(/[^a-zA-Z0-9_\u0900-\u097F]/g, '_');
    if (!key) return;
    if (v.val) l.fields[key] = v.val;
    const target = S.activeField || $('#body');
    const tag = `{{${key}}}`;
    const start = target.selectionStart ?? target.value.length;
    target.value = target.value.slice(0, start) + tag + target.value.slice(target.selectionEnd ?? start);
    target.dispatchEvent(new Event('input'));
  });

  const convertKrutiNow = () => {
    l.subject = KrutiDev.looksLikeKrutiDev(l.subject) ? KrutiDev.toUnicode(l.subject) : l.subject;
    l.body = KrutiDev.toUnicode(l.body);
    if (l.to && KrutiDev.looksLikeKrutiDev(l.to)) l.to = KrutiDev.toUnicode(l.to);
    l.lang = 'hi';
    l.manual = true;
    viewEditor();
    touch();
    toast('Converted KrutiDev to standard Unicode Hindi ✓');
  };
  on('#krutiBtn', 'click', convertKrutiNow);
  on('#krutiAutoFix', 'click', convertKrutiNow);

  on('#save', 'click', () => saveCur(false));
  on('#ip', 'click', () => issueCur(true));
  on('#issue', 'click', () => issueCur(false));
  on('#reprint', 'click', async () => { await saveCur(true); printHTML(letterHTML(S.cur, true)); });

  on('#dlDocx', 'click', async () => {
    if (Session.can('write')) await saveCur(true);
    const resolved = resolveLiveLetter(S.cur);
    downloadFromApi('api/export/docx', { letter: resolved }, `Letter_${resolved.ref || 'Draft'}.docx`);
  });

  on('#dlPdf', 'click', async () => {
    if (Session.can('write')) await saveCur(true);
    const resolved = resolveLiveLetter(S.cur);
    downloadFromApi('api/export/pdf', { letter: resolved }, `Letter_${resolved.ref || 'Draft'}.pdf`);
  });

  on('#dup', 'click', () => {
    const c = clone(S.cur);
    ['ref', 'refNo', 'refYear', 'issuedAt', 'issuedBy', 'dispatch', 'reply', 'cancelReason', 'editedAfterIssue', 'createdAt'].forEach(k => delete c[k]);
    c.id = Core.uid();
    c.status = 'draft';
    c.date = Core.todayISO();
    c.replyTo = '';
    go('editor', c);
    toast('Duplicated as new draft');
  });

  on('#del', 'click', async () => {
    if (!confirm('Delete this unissued draft permanently?')) return;
    try { await Store.op('deleteLetter', { id: l.id }); S.cur = null; go('home'); } catch (e) { toast(e.message, true); }
  });
  on('#disp', 'click', () => dispatchDlg(l.id));
  on('#cancel', 'click', () => cancelDlg(l.id));
}

async function issueCur(andPrint) {
  const l = S.cur;
  const resolved = resolveLiveLetter(l);
  if (!resolved.body.trim() && l.layout !== 'cert') {
    return toast('Letter body cannot be empty (पत्र का मुख्य भाग खाली है).', true);
  }
  const unfilled = getUnfilledMarkers(l);
  if (unfilled.length && !confirm(`Some placeholders are still unfilled: [${unfilled.join(', ')}].\nIssue Ref. No. anyway?`)) {
    return;
  }
  try {
    // Freeze resolved text on issue so permanent record has exact final wording
    const toSave = Object.assign(l, {
      to: resolved.to,
      heading: resolved.heading,
      subject: resolved.subject,
      body: resolved.body,
      encl: resolved.encl,
      cc: resolved.cc,
    });
    const sv = await Store.op('saveLetter', toSave);
    Object.assign(l, sv);
    const issued = await Store.op('issueLetter', { id: l.id, date: l.date });
    S.cur = issued;
    toast(`Issued — Ref. No. ${issued.ref} (${issued.majorHead}) saved to Register & Excel!`);
    viewEditor();
    if (andPrint) printHTML(letterHTML(issued, true));
  } catch (e) {
    toast(e.message, true);
  }
}

async function dispatchDlg(id) {
  const l = Store.db.letters.find(x => x.id === id);
  if (!l) return;
  const v = await ask(`Mark Dispatched — Ref. No. ${l.ref || ''}`, [
    { k: 'mode', l: 'Dispatch Mode (प्रेषण माध्यम)', type: 'select', opts: ['By Hand / दस्ती', 'Speed Post / स्पीड पोस्ट', 'Registered Post / निबंधित डाक', 'Official Email / ईमेल', 'WhatsApp / इलेक्ट्रॉनिक संदेश', 'Special Messenger / विशेष दूत'], v: (l.dispatch && l.dispatch.mode) || 'By Hand / दस्ती' },
    { k: 'date', l: 'Dispatch Date (प्रेषण तिथि)', type: 'date', v: (l.dispatch && l.dispatch.date) || Core.todayISO() },
    { k: 'note', l: 'Receipt / Consignment / Tracking No. (पावती या ट्रैकिंग सं.)', v: (l.dispatch && l.dispatch.note) || '' },
  ], 'Save Dispatch');
  if (!v) return;
  const r = await Store.op('patchLetter', { id, patch: { dispatch: v } });
  if (S.cur && S.cur.id === id) S.cur = Object.assign(S.cur, r);
  toast('Dispatch details recorded ✓');
  go(S.view, S.cur);
}

async function cancelDlg(id) {
  const v = await ask('Cancel Issued Letter (Ref. No. remains preserved in Register)', [
    { k: 'reason', l: 'Reason for Cancellation (रद्द करने का कारण)', ph: 'Typing error / superseded by new order...' },
  ], 'Confirm Cancel');
  if (!v) return;
  const r = await Store.op('cancelLetter', { id, reason: v.reason });
  toast('Letter marked Cancelled');
  if (S.view === 'editor') go('editor', r);
  else go(S.view);
}

/* ---------- 3. SHEET & SEARCH (OUTWARD REGISTER + MAJOR HEADS) ---------- */
function buildFilterQuery() {
  const p = new URLSearchParams();
  if (S.q) p.set('q', S.q);
  if (S.head) p.set('head', S.head);
  if (S.subHead) p.set('subHead', S.subHead);
  if (S.status) p.set('status', S.status);
  if (S.year) p.set('year', S.year);
  if (S.fromDate) p.set('from', S.fromDate);
  if (S.toDate) p.set('to', S.toDate);
  return p.toString();
}

function viewOut() {
  const L = Store.db.letters;
  const heads = Store.db.settings.majorHeads || Core.DEFAULT_MAJOR_HEADS;
  const years = [...new Set(L.map(l => l.refYear || Core.yearKey(l.date || Core.todayISO(), Store.db.settings.yearMode)))].sort().reverse();

  $('#main').innerHTML = `
    <div class="row between">
      <div>
        <h2 style="margin:0">📊 Outward Sheet Register &amp; Major Head Search (जावक पंजी एवं मदवार खोज)</h2>
        <small class="mut">Every Letter No. &amp; Major Head is automatically indexed here and in <code>Master_Letter_Register.xlsx</code>.</small>
      </div>
      <div class="row">
        <button class="ok" id="btnXlsx">📊 Download Excel (.xlsx)</button>
        <button id="btnRegPdf">📕 Register PDF (.pdf)</button>
        ${Session.can('write') ? `<label style="margin:0"><span class="btn-like" id="impTrigger"></span><input id="impXlsx" type="file" accept=".xlsx" style="display:none"></label><button id="btnImp">📥 Import Excel</button>` : ''}
        ${Store.db.settings.gsheet && Store.db.settings.gsheet.webhookUrl && Session.can('write') ? `<button class="pri" id="btnQuickSync">☁ Sync Google Sheet</button>` : ''}
      </div>
    </div>

    <div class="head-pills">
      <button class="head-pill ${!S.head ? 'on' : ''}" data-h="">All Heads (${L.length})</button>
      ${heads.map(h => {
        const c = L.filter(x => (x.majorHead || 'ADM') === h.code).length;
        return `<button class="head-pill ${S.head === h.code ? 'on' : ''}" data-h="${esc(h.code)}"><b>${esc(h.code)}</b> · ${esc(h.en)} (${c})</button>`;
      }).join('')}
    </div>

    <div class="card" style="padding:12px 14px">
      <div class="row g">
        <label style="flex:2;min-width:220px">Search Letter No., Subject, Recipient, Student/Staff Name (खोजें)
          <input id="q" placeholder="Type Ref. No. (e.g. 321/26), name, topic, keyword…" value="${esc(S.q)}">
        </label>
        <label>Major Head (मुख्य शीर्ष)
          <select id="headSel">
            <option value="">All Major Heads</option>
            ${heads.map(h => `<option value="${esc(h.code)}" ${S.head === h.code ? 'selected' : ''}>${esc(h.code)} — ${esc(h.en)}</option>`).join('')}
          </select>
        </label>
        <label>Sub-Head / File No.
          <input id="subQ" placeholder="e.g. Scholarship" value="${esc(S.subHead)}">
        </label>
        <label style="max-width:135px">Status
          <select id="st">
            <option value="">All Status</option>
            ${['draft', 'issued', 'dispatched', 'cancelled'].map(s => `<option value="${s}" ${S.status === s ? 'selected' : ''}>${s.toUpperCase()}</option>`).join('')}
          </select>
        </label>
        <label style="max-width:110px">Year
          <select id="yr">
            <option value="">All Years</option>
            ${years.map(y => `<option value="${esc(y)}" ${String(S.year) === String(y) ? 'selected' : ''}>${esc(y)}</option>`).join('')}
          </select>
        </label>
        <label style="max-width:140px">From Date
          <input id="fDate" type="date" value="${esc(S.fromDate)}">
        </label>
        <label style="max-width:140px">To Date
          <input id="tDate" type="date" value="${esc(S.toDate)}">
        </label>
        <button id="clrF" class="ghost" style="margin-bottom:8px">✕ Reset</button>
      </div>
    </div>

    <div id="rows"></div>
  `;

  const draw = () => {
    const q = S.q.trim().toLowerCase();
    const sub = S.subHead.trim().toLowerCase();
    const filtered = L.slice()
      .filter(l => {
        if (S.head && (l.majorHead || 'ADM') !== S.head) return false;
        if (sub && !String(l.subHead || '').toLowerCase().includes(sub)) return false;
        if (S.status && l.status !== S.status) return false;
        const ly = String(l.refYear || Core.yearKey(l.date || Core.todayISO(), Store.db.settings.yearMode));
        if (S.year && ly !== String(S.year)) return false;
        if (S.fromDate && (l.date || '') < S.fromDate) return false;
        if (S.toDate && (l.date || '') > S.toDate) return false;
        if (q) {
          const mh = Core.getMajorHeadObj(Store.db, l.majorHead);
          const hay = [l.ref, l.majorHead, mh && mh.en, mh && mh.hi, l.subHead, l.to, l.subject, l.heading, l.body, l.remarks, JSON.stringify(l.fields || {})].join(' ').toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => (b.ref ? b.refYear * 1e6 + b.refNo : 1e12 + (b.createdAt || 0)) - (a.ref ? a.refYear * 1e6 + a.refNo : 1e12 + (a.createdAt || 0)));

    $('#rows').innerHTML = `
      <div class="table-wrap">
        <table class="tb">
          <thead>
            <tr>
              <th>Letter No. (पत्रांक)</th>
              <th>Date</th>
              <th>Major Head (मुख्य शीर्ष)</th>
              <th>Sub-Head / File</th>
              <th>Recipient (प्राप्तकर्ता)</th>
              <th>Subject (विषय)</th>
              <th>Status &amp; Dispatch</th>
              <th>Actions / Download</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(l => {
              const mh = Core.getMajorHeadObj(Store.db, l.majorHead);
              return `<tr data-id="${esc(l.id)}">
                <td><b>${esc(l.ref || 'DRAFT')}</b></td>
                <td>${esc(fmtD(l.date))}</td>
                <td><span class="head-badge" title="${esc(mh ? mh.hi : '')}">${esc(l.majorHead || 'ADM')}</span> <small>${esc(mh ? mh.en : '')}</small></td>
                <td>${esc(l.subHead || '—')}</td>
                <td>${esc(party(l))}</td>
                <td>${esc(String(l.subject || l.heading || '').replace(/‹([^›]+)›/g, '[$1]'))}${l.editedAfterIssue ? ' <span class="chip cancelled">edited</span>' : ''}</td>
                <td>${statusChip(l.status)}${l.dispatch ? `<br><small>${esc(l.dispatch.mode)} · ${esc(fmtD(l.dispatch.date))}</small>` : ''}</td>
                <td class="act">
                  <button data-a="docx" title="Download Word (.docx)">📄 .docx</button>
                  <button data-a="pdf" title="Download PDF (.pdf)">📕 .pdf</button>
                  <button data-a="print" title="Print A4">🖨</button>
                  ${Session.can('write') && l.status === 'issued' ? `<button data-a="disp" title="Mark Dispatched">✉</button>` : ''}
                </td>
              </tr>`;
            }).join('') || `<tr><td colspan="8" class="mut" style="text-align:center;padding:20px">No matching letters found (कोई पत्र नहीं मिला)।</td></tr>`}
          </tbody>
        </table>
      </div>
      <p class="mut" style="margin-top:8px">Showing <b>${filtered.length}</b> of ${L.length} record(s)</p>
    `;

    $$('#rows tr[data-id]').forEach(tr => {
      tr.onclick = (e) => {
        const id = tr.dataset.id;
        const a = e.target.dataset.a;
        const l = Store.db.letters.find(x => x.id === id);
        if (!l) return;
        if (a === 'docx') { e.stopPropagation(); return downloadFromApi(`api/export/docx?id=${encodeURIComponent(id)}`, null, `Letter_${l.ref || 'Draft'}.docx`); }
        if (a === 'pdf') { e.stopPropagation(); return downloadFromApi(`api/export/pdf?id=${encodeURIComponent(id)}`, null, `Letter_${l.ref || 'Draft'}.pdf`); }
        if (a === 'print') { e.stopPropagation(); return printHTML(letterHTML(l, true)); }
        if (a === 'disp') { e.stopPropagation(); return dispatchDlg(id); }
        go('editor', clone(l));
      };
    });
  };

  $$('.head-pill').forEach(p => { p.onclick = () => { S.head = p.dataset.h; viewOut(); }; });
  $('#q').oninput = e => { S.q = e.target.value; draw(); };
  $('#headSel').onchange = e => { S.head = e.target.value; viewOut(); };
  $('#subQ').oninput = e => { S.subHead = e.target.value; draw(); };
  $('#st').onchange = e => { S.status = e.target.value; draw(); };
  $('#yr').onchange = e => { S.year = e.target.value; draw(); };
  $('#fDate').onchange = e => { S.fromDate = e.target.value; draw(); };
  $('#tDate').onchange = e => { S.toDate = e.target.value; draw(); };
  $('#clrF').onclick = () => { S.q = ''; S.head = ''; S.subHead = ''; S.status = ''; S.year = ''; S.fromDate = ''; S.toDate = ''; viewOut(); };

  $('#btnXlsx').onclick = () => {
    const qs = buildFilterQuery();
    downloadFromApi('api/export/xlsx' + (qs ? '?' + qs : ''), null, `Letter_Register_${Core.todayISO()}.xlsx`);
  };
  $('#btnRegPdf').onclick = () => {
    const qs = buildFilterQuery();
    downloadFromApi('api/export/register-pdf' + (qs ? '?' + qs : ''), null, `Letter_Register_${Core.todayISO()}.pdf`);
  };

  const btnImp = $('#btnImp');
  const impInput = $('#impXlsx');
  if (btnImp && impInput) {
    btnImp.onclick = () => impInput.click();
    impInput.onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const buf = await f.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const res = await apiJson('api/import/xlsx', { method: 'POST', body: JSON.stringify({ base64: btoa(binary) }) });
        await Store.reload();
        toast(`Imported ${res.importedCount} record(s) from Excel ✓`);
        viewOut();
      } catch (err) {
        toast(err.message, true);
      }
    };
  }

  const qsBtn = $('#btnQuickSync');
  if (qsBtn) {
    qsBtn.onclick = async () => {
      try {
        toast('Syncing with Google Sheet…');
        const r = await apiJson('api/gsheet/sync', { method: 'POST', body: JSON.stringify({}) });
        toast('Google Sheet Synced ✓ (' + r.lastSyncStatus + ')');
      } catch (err) {
        toast(err.message, true);
      }
    };
  }

  draw();
}

/* ---------- 4. INWARD REGISTER ---------- */
function viewIn() {
  const heads = Store.db.settings.majorHeads || Core.DEFAULT_MAJOR_HEADS;
  const R = Store.db.inward.slice().reverse().filter(r => {
    if (S.inHead && (r.majorHead || 'ADM') !== S.inHead) return false;
    if (S.inQ) {
      const hay = [r.no, r.from, r.subject, r.senderRef, r.subHead, r.remarks].join(' ').toLowerCase();
      if (!hay.includes(S.inQ.toLowerCase())) return false;
    }
    return true;
  });

  $('#main').innerHTML = `
    <div class="row between">
      <h2 style="margin:0">📥 Inward Letter Register (आवक पत्र पंजी — प्राप्त पत्र)</h2>
      <button class="ok" id="inwXlsx">📊 Download Full Excel (.xlsx)</button>
    </div>

    ${Session.can('write') ? `
      <form id="inf" class="card" style="margin-top:12px">
        <h3>+ Log Received Letter (प्राप्त पत्र दर्ज करें)</h3>
        <div class="row g">
          <label>From / Sender Office (प्रेषक कार्यालय/व्यक्ति)<input name="from" required placeholder="e.g. District Education Officer, Dumka"></label>
          <label>Subject (विषय)<input name="subject" required placeholder="Subject of received letter..."></label>
          <label>Major Head (मुख्य शीर्ष)
            <select name="majorHead">
              ${heads.map(h => `<option value="${esc(h.code)}">${esc(h.code)} — ${esc(h.en)} (${esc(h.hi)})</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="row g">
          <label>Sub-Head / File No.<input name="subHead" placeholder="Optional file head"></label>
          <label>Sender Letter No. &amp; Date<input name="senderRef" placeholder="e.g. Memo 412 dt 15/11/2026"></label>
          <label>Received Date<input name="date" type="date" value="${esc(Core.todayISO())}"></label>
          <label>Mode
            <select name="mode"><option>By Hand</option><option>Speed Post</option><option>Post</option><option>Email</option><option>WhatsApp</option></select>
          </label>
          <label class="chk"><input name="needsReply" type="checkbox" checked> Reply Needed (उत्तर अपेक्षित)</label>
          <button class="pri" style="margin-bottom:8px">+ Add Entry</button>
        </div>
      </form>
    ` : ''}

    <div class="row g" style="margin:10px 0">
      <label style="flex:2"><input id="inQ" placeholder="Search inward no, sender, subject…" value="${esc(S.inQ)}"></label>
      <label>
        <select id="inHead">
          <option value="">All Major Heads</option>
          ${heads.map(h => `<option value="${esc(h.code)}" ${S.inHead === h.code ? 'selected' : ''}>${esc(h.code)} — ${esc(h.en)}</option>`).join('')}
        </select>
      </label>
    </div>

    <div class="table-wrap">
      <table class="tb">
        <thead>
          <tr>
            <th>Inward No.</th>
            <th>Date</th>
            <th>Major Head</th>
            <th>From (प्रेषक)</th>
            <th>Subject (विषय)</th>
            <th>Sender Ref.</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${R.map(r => `
            <tr data-id="${esc(r.id)}">
              <td><b>${esc(r.no)}</b></td>
              <td>${esc(fmtD(r.date))}</td>
              <td><span class="head-badge">${esc(r.majorHead || 'ADM')}</span>${r.subHead ? `<br><small>${esc(r.subHead)}</small>` : ''}</td>
              <td>${esc(r.from)}</td>
              <td>${esc(r.subject)}</td>
              <td>${esc(r.senderRef || '—')}</td>
              <td>${statusChip(r.status)} ${r.reply ? `<br><small>Outward: <b>${esc(r.reply.ref)}</b></small>` : ''}</td>
              <td class="act">
                ${Session.can('write') && r.status === 'pending' ? `<button data-a="reply" class="pri sm">↩ Draft Reply</button>` : ''}
                ${Session.can('admin') ? `<button data-a="del" class="danger sm" title="Delete">✕</button>` : ''}
              </td>
            </tr>
          `).join('') || `<tr><td colspan="8" class="mut" style="text-align:center;padding:18px">No inward letters recorded yet.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  $('#inwXlsx').onclick = () => downloadFromApi('api/export/xlsx', null, `Master_Letter_Register_${Core.todayISO()}.xlsx`);
  $('#inQ').oninput = e => { S.inQ = e.target.value; viewIn(); };
  $('#inHead').onchange = e => { S.inHead = e.target.value; viewIn(); };

  const inf = $('#inf');
  if (inf) {
    inf.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(inf);
      await Store.op('saveInward', {
        id: Core.uid(),
        from: fd.get('from'),
        subject: fd.get('subject'),
        majorHead: fd.get('majorHead'),
        subHead: fd.get('subHead'),
        senderRef: fd.get('senderRef'),
        date: fd.get('date'),
        mode: fd.get('mode'),
        needsReply: fd.get('needsReply') === 'on',
      });
      toast('Inward letter recorded ✓');
      viewIn();
    };
  }

  $$('tbody tr[data-id]').forEach(tr => {
    tr.onclick = async (e) => {
      const a = e.target.dataset.a;
      const r = Store.db.inward.find(x => x.id === tr.dataset.id);
      if (!r) return;
      if (a === 'reply') {
        e.stopPropagation();
        go('editor', newLetter({
          tpl: 'reply',
          majorHead: r.majorHead || 'ADM',
          subHead: r.subHead || '',
          to: r.from,
          fields: { inward_ref: r.senderRef || r.no, topic: r.subject },
          replyTo: r.id,
        }));
      } else if (a === 'del' && confirm('Delete this inward entry?')) {
        e.stopPropagation();
        await Store.op('deleteInward', { id: r.id });
        viewIn();
      }
    };
  });
}

/* ---------- 5. GOOGLE SHEETS & EXCEL SYNC HUB ---------- */
function viewSync() {
  const gs = Store.db.settings.gsheet || {};
  const info = Store.serverInfo || {};
  const isAdmin = Session.can('admin');

  $('#main').innerHTML = `
    <h2>☁ Google Sheets &amp; Excel Register Auto-Save (गूगल शीट एवं एक्सेल डेटाबेस सिंक)</h2>

    <div class="card">
      <h3>1. Automatic Local Master Excel Workbook (<code>data/Master_Letter_Register.xlsx</code>)</h3>
      <p class="mut" style="margin:0 0 12px">
        हर पत्र सेव या जारी होते ही सर्वर पर 3 शीट वाली असली Excel फ़ाइल (<b>Outward Register</b>, <b>Inward Register</b>, और <b>Major Head Summary</b>) स्वतः अपडेट होती है — जिसमें <b>Letter No. (पत्रांक)</b> और <b>Major Head (मुख्य शीर्ष)</b> पर Auto-Filter लगा होता है।
      </p>
      <div class="row">
        <button class="ok" id="syncDlXlsx">📊 Download Master Excel Workbook (.xlsx)</button>
        <span class="mut">Status: <b>${info.masterExcelReady ? '● Active & Auto-Saving' : 'Initializing'}</b></span>
      </div>
    </div>

    <div class="card">
      <h3>2. Live Google Sheets Auto-Sync (गूगल शीट में स्वतः डेटा सेव करें)</h3>
      <p class="mut" style="margin:0 0 12px">
        इसे चालू करने पर हर नया पत्रांक (Letter No.), दिनांक, मुख्य शीर्ष (Major Head), प्राप्तकर्ता और विषय सीधे आपकी <b>Google Sheet</b> में सेव होता रहेगा, जहाँ से आप कहीं भी मोबाइल या पीसी पर <code>Ctrl+F</code> या फ़िल्टर से खोज सकते हैं।
      </p>
      <div class="row g">
        <label style="flex:2">Google Apps Script Web App URL (<code>https://script.google.com/macros/s/.../exec</code>)
          <input id="gsUrl" value="${esc(gs.webhookUrl || '')}" placeholder="https://script.google.com/macros/s/.../exec" ${!isAdmin ? 'disabled' : ''}>
        </label>
        <label style="max-width:220px">Optional Secret Key (सुरक्षा कुंजी)
          <input id="gsSecret" type="password" value="${esc(gs.webhookSecret || '')}" placeholder="Optional shared secret" ${!isAdmin ? 'disabled' : ''}>
        </label>
      </div>
      <div class="row">
        <label class="chk" style="margin-top:4px"><input id="gsEnabled" type="checkbox" ${gs.enabled ? 'checked' : ''} ${!isAdmin ? 'disabled' : ''}> Enable Google Sheets Sync</label>
        <label class="chk" style="margin-top:4px"><input id="gsAuto" type="checkbox" ${gs.autoSync !== false ? 'checked' : ''} ${!isAdmin ? 'disabled' : ''}> Auto-sync whenever a letter is issued/updated</label>
      </div>
      <div class="row" style="margin-top:10px">
        ${isAdmin ? `<button class="pri" id="saveGs">💾 Save Google Sheet Config</button>` : ''}
        ${Session.can('write') ? `<button class="ok" id="testGs">☁ Test &amp; Sync All Records Now</button>` : ''}
        <span class="mut">Last Sync: <b>${gs.lastSyncAt ? new Date(gs.lastSyncAt).toLocaleString() + ' — ' + esc(gs.lastSyncStatus || 'OK') : 'Not synced yet'}</b></span>
      </div>
    </div>

    <div class="card">
      <div class="row between">
        <h3 style="margin:0">📋 2-Minute Google Sheet Setup Guide (गूगल शीट कैसे जोड़ें — बेहद आसान)</h3>
        <button class="sm pri" id="copyScript">📋 Copy Apps Script Code</button>
      </div>
      <ol style="font-size:13px;line-height:1.7;padding-left:20px;margin:10px 0">
        <li>अपने Google अकाउंट में एक नई <b>Google Sheet</b> खोलें (<code>sheets.new</code>)।</li>
        <li>ऊपर मेनू में <b>Extensions → Apps Script</b> पर क्लिक करें।</li>
        <li>वहाँ नीचे दिया गया कोड कॉपी करके पेस्ट करें और <b>Save (💾)</b> दबाएँ।</li>
        <li>ऊपर दाईं ओर <b>Deploy → New deployment</b> चुनें → Type: <b>Web app</b> → <i>Execute as: Me</i> → <i>Who has access: Anyone</i> → <b>Deploy</b> करें और मिला हुआ <code>https://script.google.com/macros/s/.../exec</code> URL ऊपर बॉक्स में पेस्ट कर दें!</li>
      </ol>
      <pre class="codebox" id="gsCodeBox">${esc(info.appsScriptTemplate || '')}</pre>
    </div>
  `;

  $('#syncDlXlsx').onclick = () => downloadFromApi('api/export/xlsx', null, `Master_Letter_Register_${Core.todayISO()}.xlsx`);

  const saveGs = $('#saveGs');
  if (saveGs) {
    saveGs.onclick = async () => {
      const s = clone(Store.db.settings);
      s.gsheet = Object.assign({}, s.gsheet, {
        webhookUrl: $('#gsUrl').value.trim(),
        webhookSecret: $('#gsSecret').value.trim(),
        enabled: $('#gsEnabled').checked,
        autoSync: $('#gsAuto').checked,
      });
      await Store.op('saveSettings', s);
      toast('Google Sheets configuration saved ✓');
      viewSync();
    };
  }

  const testGs = $('#testGs');
  if (testGs) {
    testGs.onclick = async () => {
      try {
        toast('Pushing register to Google Sheets…');
        const payload = isAdmin ? {
          webhookUrl: $('#gsUrl').value.trim(),
          webhookSecret: $('#gsSecret').value.trim(),
          enabled: $('#gsEnabled').checked,
          autoSync: $('#gsAuto').checked,
        } : {};
        const r = await apiJson('api/gsheet/sync', { method: 'POST', body: JSON.stringify(payload) });
        await Store.reload();
        toast('Synced successfully! ' + r.lastSyncStatus);
        viewSync();
      } catch (err) {
        toast(err.message, true);
      }
    };
  }

  $('#copyScript').onclick = async () => {
    try {
      await navigator.clipboard.writeText(info.appsScriptTemplate || '');
      toast('Apps Script copied to clipboard ✓');
    } catch (_) {
      toast('Select and copy from the code box below.');
    }
  };
}

/* ---------- 6. USERS & SECURITY ---------- */
async function viewSec() {
  const isAdmin = Session.can('admin');
  const u = Session.user;

  $('#main').innerHTML = `
    <h2>🔐 Login Security, Role Access &amp; Audit Trail (सुरक्षा एवं उपयोगकर्ता प्रबंधन)</h2>

    <div class="card">
      <div class="row between">
        <div>
          <h3 style="margin:0">👤 Signed-In Account: ${esc(u.displayName)} (<code>@${esc(u.username)}</code>)</h3>
          <small class="mut">Role: <span class="chip ${esc(u.role)}">${esc(u.role.toUpperCase())}</span></small>
        </div>
        <button class="danger" id="logoutAllBtn">⏻ Sign Out From All Devices</button>
      </div>
      <hr style="border:0;border-top:1px solid var(--bd);margin:14px 0">
      <form id="pwForm" class="row g">
        <label>Current Password (वर्तमान पासवर्ड)<input name="currentPassword" type="password" required></label>
        <label>New Strong Password (नया पासवर्ड — min 8 chars)<input name="newPassword" type="password" minlength="8" required></label>
        <button class="pri" style="margin-bottom:8px">🔑 Change Password</button>
      </form>
    </div>

    ${isAdmin ? `
      <div class="card">
        <div class="row between">
          <h3 style="margin:0">👥 Authorized Office Users (कार्यालय उपयोगकर्ता खाते)</h3>
          <button class="pri sm" id="addUserBtn">+ Add User Account</button>
        </div>
        <p class="mut" style="margin:6px 0 12px">
          <b>Admin:</b> सभी अधिकार (सेटिंग, हस्ताक्षर अपलोड, रद्द करना, यूज़र प्रबंधन) ·
          <b>Staff:</b> पत्र बनाना, जारी करना, डिस्पैच व डाउनलोड ·
          <b>Viewer:</b> केवल पंजी खोजना एवं देखना।
        </p>
        <div id="usersBox"><p class="mut">Loading users…</p></div>
      </div>

      <div class="card">
        <h3>🛡 Security &amp; Action Audit Log (सुरक्षा ऑडिट लॉग)</h3>
        <div id="auditBox"><p class="mut">Loading audit logs…</p></div>
      </div>
    ` : ''}
  `;

  $('#logoutAllBtn').onclick = async () => {
    if (!confirm('Sign out from all computers/phones immediately?')) return;
    await apiJson('api/auth/logout', { method: 'POST', body: JSON.stringify({ allDevices: true }) }).catch(() => {});
    Session.clear();
    showAuthGate();
  };

  $('#pwForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await apiJson('api/auth/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: fd.get('currentPassword'), newPassword: fd.get('newPassword') }),
      });
      e.target.reset();
      toast('Password updated successfully ✓');
    } catch (err) {
      toast(err.message, true);
    }
  };

  if (isAdmin) {
    loadAdminSecurityTables();
    $('#addUserBtn').onclick = async () => {
      const v = await ask('Create Authorized User (नया यूज़र जोड़ें)', [
        { k: 'username', l: 'Username (e.g. clerk1, office_desk)', ph: 'clerk1' },
        { k: 'displayName', l: 'Full Name & Designation', ph: 'Shri Mohan Lal (Office Clerk)' },
        { k: 'role', l: 'Access Role (भूमिका)', type: 'select', opts: [
          { v: 'staff', l: 'Staff (Draft, Issue, Dispatch & Download)' },
          { v: 'viewer', l: 'Viewer (Search & View Only)' },
          { v: 'admin', l: 'Admin (Full Principal/System Control)' },
        ], v: 'staff' },
        { k: 'password', l: 'Initial Password (कम से कम 8 अक्षर)', type: 'password' },
      ], 'Create User');
      if (!v) return;
      try {
        await apiJson('api/users', { method: 'POST', body: JSON.stringify(Object.assign({ action: 'create' }, v)) });
        toast('User account created ✓');
        loadAdminSecurityTables();
      } catch (err) {
        toast(err.message, true);
      }
    };
  }
}

async function loadAdminSecurityTables() {
  try {
    const [uRes, aRes] = await Promise.all([apiJson('api/users'), apiJson('api/audit')]);
    const uBox = $('#usersBox');
    if (uBox) {
      uBox.innerHTML = `<div class="table-wrap"><table class="tb">
        <thead><tr><th>Username</th><th>Full Name</th><th>Role</th><th>Status</th><th>Last Login</th><th>Actions</th></tr></thead>
        <tbody>
          ${uRes.users.map(x => `
            <tr>
              <td><code>@${esc(x.username)}</code></td>
              <td><b>${esc(x.displayName)}</b></td>
              <td><span class="chip ${esc(x.role)}">${esc(x.role.toUpperCase())}</span></td>
              <td>${x.active ? '<span class="chip dispatched">Active</span>' : '<span class="chip cancelled">Disabled</span>'}</td>
              <td>${x.lastLoginAt ? esc(new Date(x.lastLoginAt).toLocaleString()) : 'Never'}</td>
              <td class="act">
                <button class="sm" data-uact="pw" data-uid="${esc(x.id)}" data-un="${esc(x.username)}">🔑 Reset PW</button>
                <button class="sm" data-uact="toggle" data-uid="${esc(x.id)}" data-active="${x.active ? '1' : '0'}">${x.active ? 'Disable' : 'Enable'}</button>
                ${x.id !== Session.user.id ? `<button class="sm danger" data-uact="del" data-uid="${esc(x.id)}">✕</button>` : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table></div>`;

      $$('[data-uact]', uBox).forEach(btn => {
        btn.onclick = async () => {
          const act = btn.dataset.uact;
          const id = btn.dataset.uid;
          try {
            if (act === 'pw') {
              const v = await ask(`Reset Password for @${btn.dataset.un}`, [{ k: 'pw', l: 'New Password (min 8 chars)', type: 'password' }], 'Reset Password');
              if (!v || !v.pw) return;
              await apiJson('api/users', { method: 'POST', body: JSON.stringify({ action: 'update', id, newPassword: v.pw }) });
              toast('Password reset ✓');
            } else if (act === 'toggle') {
              const nextActive = btn.dataset.active !== '1';
              await apiJson('api/users', { method: 'POST', body: JSON.stringify({ action: 'update', id, active: nextActive }) });
              toast(nextActive ? 'User enabled' : 'User disabled');
            } else if (act === 'del' && confirm('Permanently delete this user?')) {
              await apiJson('api/users', { method: 'POST', body: JSON.stringify({ action: 'delete', id }) });
              toast('User deleted');
            }
            loadAdminSecurityTables();
          } catch (err) {
            toast(err.message, true);
          }
        };
      });
    }

    const aBox = $('#auditBox');
    if (aBox) {
      aBox.innerHTML = `<div class="table-wrap" style="max-height:320px;overflow-y:auto"><table class="tb">
        <thead><tr><th>Time (UTC)</th><th>User</th><th>Role</th><th>Action</th><th>Details</th><th>IP</th></tr></thead>
        <tbody>
          ${aRes.logs.slice(0, 80).map(lg => `
            <tr>
              <td><small>${esc(lg.ts.replace('T', ' ').slice(0, 19))}</small></td>
              <td><code>${esc(lg.actor)}</code></td>
              <td>${esc(lg.role)}</td>
              <td><b>${esc(lg.action)}</b></td>
              <td>${esc(lg.detail)}</td>
              <td><small>${esc(lg.ip)}</small></td>
            </tr>
          `).join('')}
        </tbody>
      </table></div>`;
    }
  } catch (e) {
    toast(e.message, true);
  }
}

/* ---------- 7. SETTINGS, CUSTOM TEMPLATES & EASY DEPLOY GUIDE ---------- */
function viewSet() {
  const s = clone(Store.db.settings);
  const nx = nextRefNow('ADM');
  const isAdmin = Session.can('admin');
  const lanUrls = (Store.serverInfo && Store.serverInfo.lanUrls) || [];

  $('#main').innerHTML = `
    <h2>⚙ Institution Settings, Placeholders &amp; Easy Deployment (सेटिंग एवं सरल डिप्लॉयमेंट)</h2>

    <div class="card">
      <h3>🚀 Deploy &amp; Access from Any Laptop, PC, Wi-Fi or Cloud (आसान होस्टिंग गाइड)</h3>
      <div class="row g">
        <div style="flex:1;min-width:250px">
          <b>1. Local Windows / Mac / Linux PC (1-Click):</b>
          <p class="mut" style="margin:4px 0">Windows पर <code>start.bat</code> पर डबल-क्लिक करें (या Linux/Mac पर <code>./start.sh</code>)। यह स्वतः निर्भरताएँ जाँचकर ब्राउज़र में ऐप खोल देगा।</p>
          <b>2. Office Wi-Fi / LAN Sharing (एक ही नेटवर्क पर अन्य पीसी/मोबाइल):</b>
          <p class="mut" style="margin:4px 0">
            ${lanUrls.length ? `इस नेटवर्क पर अन्य डिवाइस से खोलें: ${lanUrls.map(u => `<code>${esc(u)}</code>`).join(' , ')}` : 'अपने ऑफिस वाई-फ़ाई से जुड़ने पर यहाँ LAN IP दिखेगा (<code>http://&lt;PC-IP&gt;:3000</code>)।'}
          </p>
        </div>
        <div style="flex:1;min-width:250px">
          <b>3. Cloud / Internet Hosting (Render · Railway · Docker):</b>
          <p class="mut" style="margin:4px 0">
            इस रिपॉज़िटरी में <code>Dockerfile</code>, <code>docker-compose.yml</code>, <code>render.yaml</code> और <code>railway.json</code> पहले से शामिल हैं — बस GitHub से जोड़कर 1-क्लिक में ऑनलाइन होस्ट करें या <code>cloudflared tunnel --url http://localhost:3000</code> चलाएँ!
          </p>
        </div>
      </div>
    </div>

    ${!isAdmin ? `<div class="warn">Note: Only <b>Administrator</b> accounts can modify system settings, counters, or stamps.</div>` : ''}

    <div class="card">
      <h3>🏛 Institution Profile &amp; Global Placeholders (संस्था विवरण — सभी पत्रों में स्वतः प्रयुक्त)</h3>
      <div class="row g">
        <label>Header Name (English Caps)<input id="sc_name" value="${esc(s.school.name || '')}" ${!isAdmin ? 'disabled' : ''}></label>
        <label>Sub-Title<input id="sc_subName" value="${esc(s.school.subName || '')}" ${!isAdmin ? 'disabled' : ''}></label>
      </div>
      <div class="row g">
        <label>Institution Name — English (<code>{{school_name_en}}</code>)<input id="sc_en" value="${esc(s.school.en || '')}" ${!isAdmin ? 'disabled' : ''}></label>
        <label>संस्था का नाम — हिंदी (<code>{{school_name_hi}}</code>)<input id="sc_hi" value="${esc(s.school.hi || '')}" ${!isAdmin ? 'disabled' : ''}></label>
      </div>
      <div class="row g">
        <label>Address — English (<code>{{school_address_en}}</code>)<input id="sc_addrEn" value="${esc(s.school.addressEn || '')}" ${!isAdmin ? 'disabled' : ''}></label>
        <label>पता — हिंदी (<code>{{school_address_hi}}</code>)<input id="sc_addrHi" value="${esc(s.school.addressHi || '')}" ${!isAdmin ? 'disabled' : ''}></label>
      </div>
      <div class="row g">
        <label>U-DISE Code (<code>{{udise_code}}</code>)<input id="sc_udise" value="${esc(s.school.udise || '')}" ${!isAdmin ? 'disabled' : ''}></label>
        <label>CBSE Affiliation No. (<code>{{cbse_aff_no}}</code>)<input id="sc_cbse" value="${esc(s.school.cbseAff || '')}" ${!isAdmin ? 'disabled' : ''}></label>
        <label>Est. Year (<code>{{estd_year}}</code>)<input id="sc_estd" value="${esc(s.school.estd || '')}" ${!isAdmin ? 'disabled' : ''}></label>
        <label>Official Email<input id="sc_email" value="${esc(s.school.email || '')}" ${!isAdmin ? 'disabled' : ''}></label>
        <label>Phone<input id="sc_phone" value="${esc(s.school.phone || '')}" ${!isAdmin ? 'disabled' : ''}></label>
      </div>
    </div>

    <div class="card">
      <h3>🔢 Reference Numbering (पत्रांक प्रारूप एवं अगला नंबर)</h3>
      <div class="row g">
        <label>Outward Format
          <input id="refFormat" value="${esc(s.refFormat)}" ${!isAdmin ? 'disabled' : ''}>
          <small>Tokens: <code>{n}</code> no · <code>{yy}</code> 26 · <code>{yyyy}</code> 2026 · <code>{sess}</code> 26-27 · <code>{head}</code> Major Head</small>
        </label>
        <label>Year Cycle
          <select id="yearMode" ${!isAdmin ? 'disabled' : ''}>
            <option value="calendar" ${s.yearMode === 'calendar' ? 'selected' : ''}>Calendar Year (Jan–Dec)</option>
            <option value="session" ${s.yearMode === 'session' ? 'selected' : ''}>Academic/Financial (Apr–Mar)</option>
          </select>
        </label>
        <label>Zero Padding<input id="padWidth" type="number" min="0" max="6" value="${esc(s.padWidth)}" ${!isAdmin ? 'disabled' : ''}></label>
        <label>Inward Format<input id="inFormat" value="${esc(s.inFormat)}" ${!isAdmin ? 'disabled' : ''}></label>
      </div>
      ${isAdmin ? `
        <div class="row g" style="margin-top:8px">
          <label style="max-width:220px">Set Next Outward Number (अगला नंबर)<input id="nextN" type="number" min="1" value="${esc(nx.n)}"></label>
          <button id="setN" style="margin-bottom:8px">Set Next Number</button>
          <span class="mut" style="margin-bottom:12px">Next preview: <b>${esc(nx.ref)}</b></span>
        </div>
      ` : ''}
    </div>

    <div class="card">
      <h3>🖨 Typography, Fonts &amp; Print Layout (फ़ॉन्ट एवं प्रिंट सेटिंग)</h3>
      <div class="row g">
        <label>Official Font Theme (PDF + Print + Preview)
          <select id="fontFamily" ${!isAdmin ? 'disabled' : ''}>
            <option value="karma" ${s.fontFamily !== 'mukta' ? 'selected' : ''}>Karma Official Serif (सरकारी सेरिफ़ — हिंदी + English)</option>
            <option value="mukta" ${s.fontFamily === 'mukta' ? 'selected' : ''}>Mukta Clean Modern (आधुनिक मुक्ता — हिंदी + English)</option>
          </select>
        </label>
        <label>Font Size (pt)
          <select id="fontPt" ${!isAdmin ? 'disabled' : ''}>${[11, 12, 13, 14].map(x => `<option value="${x}" ${+s.fontPt === x ? 'selected' : ''}>${x} pt</option>`).join('')}</select>
        </label>
        <label>Signature Alignment
          <select id="sigAlign" ${!isAdmin ? 'disabled' : ''}>
            <option value="right" ${s.sigAlign === 'right' ? 'selected' : ''}>Right (दाईं ओर — मानक)</option>
            <option value="left" ${s.sigAlign === 'left' ? 'selected' : ''}>Left (बाईं ओर)</option>
          </select>
        </label>
        <label>Top Blank Space (mm, for pre-printed pad)<input id="topMm" type="number" min="10" max="100" value="${esc(s.topMm)}" ${!isAdmin ? 'disabled' : ''}></label>
      </div>
      <div class="row">
        <label class="chk"><input id="preprinted" type="checkbox" ${s.preprinted ? 'checked' : ''} ${!isAdmin ? 'disabled' : ''}> Printing on pre-printed letterhead pad</label>
        <label class="chk"><input id="defaultShowSign" type="checkbox" ${s.defaultShowSign ? 'checked' : ''} ${!isAdmin ? 'disabled' : ''}> Attach signature/stamp by default</label>
        <label class="chk"><input id="showMajorHeadOnLetter" type="checkbox" ${s.showMajorHeadOnLetter ? 'checked' : ''} ${!isAdmin ? 'disabled' : ''}> Print Major Head line below Ref. No.</label>
      </div>
      ${isAdmin ? `
        <div class="row g" style="margin-top:10px">
          <label>Upload Custom Letterhead Image (PNG/JPG)<input id="lhfile" type="file" accept="image/png,image/jpeg,image/webp"></label>
          <button id="lhreset" class="ghost" style="margin-bottom:8px">Reset Default Letterhead</button>
        </div>
      ` : ''}
    </div>

    <div class="card">
      <h3>🗂 Major Heads List (मुख्य शीर्ष / मद सूची — Excel व Google Sheet खोज के लिए)</h3>
      <div id="mhList"></div>
      ${isAdmin ? `<button id="addMh" class="sm">+ Add Major Head</button>` : ''}
    </div>

    <div class="card">
      <h3>✍ Signatories &amp; Protected Stamps (हस्ताक्षरकर्ता एवं सुरक्षित मुहर)</h3>
      <small class="mut" style="display:block;margin-bottom:8px">Uploaded signature/stamp images are stored outside <code>public/</code> and protected behind login.</small>
      <div id="sgs"></div>
      ${isAdmin ? `<button id="addsg" class="sm">+ Add Signatory</button>` : ''}
    </div>

    <div class="card">
      <h3>📖 Address Book (पता सूची — कमांड में <code>@alias</code> लिखकर उपयोग करें)</h3>
      <div id="rcs"></div>
      ${isAdmin ? `<button id="addrc" class="sm">+ Add Addressee</button>` : ''}
    </div>

    ${isAdmin ? `<div class="row" style="margin-bottom:18px"><button class="pri" id="saveS" style="padding:10px 22px">💾 Save All Settings (सभी सेटिंग सहेजें)</button></div>` : ''}

    <div class="card">
      <div class="row between">
        <h3 style="margin:0">🧩 Custom Reusable Templates (कस्टम टेम्पलेट बनाएँ)</h3>
        ${Session.can('write') ? `<button class="sm pri" id="newCustTpl">+ Create Custom Template</button>` : ''}
      </div>
      <div id="custTplBox" style="margin-top:10px">
        ${(Store.db.customTemplates || []).length
          ? `<div class="table-wrap"><table class="tb"><thead><tr><th>ID</th><th>Major Head</th><th>Template Name</th><th>Placeholders</th><th></th></tr></thead><tbody>
              ${Store.db.customTemplates.map(ct => `<tr>
                <td><code>${esc(ct.id)}</code></td>
                <td><span class="head-badge">${esc(ct.majorHead)}</span></td>
                <td><b>${esc(ct.name)}</b></td>
                <td>${(ct.fields || []).map(f => `<code>{{${esc(f.k)}}}</code>`).join(' ') || '—'}</td>
                <td class="act">${isAdmin ? `<button class="sm danger" data-deltpl="${esc(ct.id)}">✕</button>` : ''}</td>
              </tr>`).join('')}
            </tbody></table></div>`
          : `<p class="mut" style="margin:4px 0">No custom templates yet. You can create reusable templates with any <code>{{placeholder}}</code>!</p>`}
      </div>
    </div>

    <div class="card">
      <h3>💾 Full System JSON Backup &amp; Restore (संपूर्ण डेटा बैकअप)</h3>
      <div class="row g">
        <button id="bkBtn">⬇ Download JSON Backup</button>
        ${isAdmin ? `<label>Restore from JSON Backup<input id="rf" type="file" accept=".json"></label>` : ''}
      </div>
      <p class="mut">Automatic daily backups are also saved in <code>data/backups/</code> (last 30 days retained).</p>
    </div>
  `;

  const renderMh = () => {
    $('#mhList').innerHTML = s.majorHeads.map((h, i) => `
      <div class="row g mhrow" data-i="${i}">
        <label style="max-width:110px">Code<input data-f="code" value="${esc(h.code)}" ${!isAdmin ? 'disabled' : ''}></label>
        <label>English Head<input data-f="en" value="${esc(h.en)}" ${!isAdmin ? 'disabled' : ''}></label>
        <label>हिंदी शीर्ष<input data-f="hi" value="${esc(h.hi)}" ${!isAdmin ? 'disabled' : ''}></label>
        ${isAdmin ? `<button class="ghost" data-delmh="${i}" style="margin-bottom:8px">✕</button>` : ''}
      </div>
    `).join('');
  };

  const renderSgs = () => {
    $('#sgs').innerHTML = s.signatories.map((g, i) => `
      <div class="row g sgrow" data-i="${i}" style="border-bottom:1px solid #f1f5f9;padding-bottom:8px;margin-bottom:8px">
        <label>Name (EN)<input data-f="name" value="${esc(g.name || '')}" ${!isAdmin ? 'disabled' : ''}></label>
        <label>नाम (HI)<input data-f="nameHi" value="${esc(g.nameHi || '')}" ${!isAdmin ? 'disabled' : ''}></label>
        <label>Designation (EN)<input data-f="designation" value="${esc(g.designation || '')}" ${!isAdmin ? 'disabled' : ''}></label>
        <label>पदनाम (HI)<input data-f="designationHi" value="${esc(g.designationHi || '')}" ${!isAdmin ? 'disabled' : ''}></label>
        ${isAdmin ? `<label>Upload Sign/Stamp<input data-f="stampfile" type="file" accept="image/png,image/jpeg,image/webp"></label>` : ''}
        <span class="mut" style="margin-bottom:12px">${g.stamp ? '🔒 Stamp set' : 'No stamp'}</span>
        ${isAdmin && s.signatories.length > 1 ? `<button class="ghost" data-delsg="${i}" style="margin-bottom:8px">✕</button>` : ''}
      </div>
    `).join('');
  };

  const renderRcs = () => {
    $('#rcs').innerHTML = s.recipients.map((r, i) => `
      <div class="row g rcrow" data-i="${i}">
        <label style="max-width:110px">@Alias<input data-f="alias" value="${esc(r.alias)}" ${!isAdmin ? 'disabled' : ''}></label>
        <label>English Address<textarea data-f="en" rows="2" ${!isAdmin ? 'disabled' : ''}>${esc(r.en)}</textarea></label>
        <label>हिंदी पता<textarea data-f="hi" rows="2" ${!isAdmin ? 'disabled' : ''}>${esc(r.hi)}</textarea></label>
        ${isAdmin ? `<button class="ghost" data-delrc="${i}" style="margin-bottom:8px">✕</button>` : ''}
      </div>
    `).join('');
  };

  renderMh(); renderSgs(); renderRcs();

  const readDataUrl = f => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(f); });

  if (isAdmin) {
    $('#mhList').addEventListener('input', e => {
      const row = e.target.closest('.mhrow');
      if (row && e.target.dataset.f) s.majorHeads[+row.dataset.i][e.target.dataset.f] = e.target.value;
    });
    $('#mhList').addEventListener('click', e => {
      if (e.target.dataset.delmh !== undefined && s.majorHeads.length > 1) {
        s.majorHeads.splice(+e.target.dataset.delmh, 1);
        renderMh();
      }
    });
    $('#addMh').onclick = () => { s.majorHeads.push({ code: 'NEW', en: 'New Major Head', hi: 'नया मद' }); renderMh(); };

    $('#sgs').addEventListener('input', e => {
      const row = e.target.closest('.sgrow');
      if (row && e.target.dataset.f && e.target.dataset.f !== 'stampfile') s.signatories[+row.dataset.i][e.target.dataset.f] = e.target.value;
    });
    $('#sgs').addEventListener('change', async e => {
      if (e.target.dataset.f === 'stampfile' && e.target.files[0]) {
        try {
          const dUrl = await readDataUrl(e.target.files[0]);
          const up = await apiJson('api/upload-image', { method: 'POST', body: JSON.stringify({ dataUrl: dUrl, kind: 'stamp' }) });
          s.signatories[+e.target.closest('.sgrow').dataset.i].stamp = up.path;
          toast('Protected stamp uploaded — click Save All Settings');
          renderSgs();
        } catch (err) { toast(err.message, true); }
      }
    });
    $('#sgs').addEventListener('click', e => {
      if (e.target.dataset.delsg !== undefined && s.signatories.length > 1) {
        s.signatories.splice(+e.target.dataset.delsg, 1);
        renderSgs();
      }
    });
    $('#addsg').onclick = () => { s.signatories.push({ id: Core.uid(), name: '', nameHi: '', designation: '', designationHi: '', org: s.school.en, orgHi: s.school.hi, stamp: '' }); renderSgs(); };

    $('#rcs').addEventListener('input', e => {
      const row = e.target.closest('.rcrow');
      if (row && e.target.dataset.f) s.recipients[+row.dataset.i][e.target.dataset.f] = e.target.value;
    });
    $('#rcs').addEventListener('click', e => {
      if (e.target.dataset.delrc !== undefined) { s.recipients.splice(+e.target.dataset.delrc, 1); renderRcs(); }
    });
    $('#addrc').onclick = () => { s.recipients.push({ alias: '', en: '', hi: '' }); renderRcs(); };

    $('#lhfile').onchange = async e => {
      if (!e.target.files[0]) return;
      try {
        const dUrl = await readDataUrl(e.target.files[0]);
        const up = await apiJson('api/upload-image', { method: 'POST', body: JSON.stringify({ dataUrl: dUrl, kind: 'letterhead' }) });
        s.letterhead = up.path;
        toast('Letterhead uploaded — click Save All Settings');
      } catch (err) { toast(err.message, true); }
    };
    $('#lhreset').onclick = () => { s.letterhead = 'assets/letterhead.png'; toast('Reset to default letterhead — click Save All Settings'); };

    $('#setN').onclick = async () => {
      const n = +$('#nextN').value;
      if (!(n >= 1)) return toast('Enter a valid number ≥ 1', true);
      await Store.op('setCounter', { series: 'out', year: nextRefNow('ADM').yk, last: n - 1 });
      toast('Next Ref. No. updated to ' + nextRefNow('ADM').ref);
      viewSet();
    };

    $('#saveS').onclick = async () => {
      s.school.name = $('#sc_name').value.trim();
      s.school.subName = $('#sc_subName').value.trim();
      s.school.en = $('#sc_en').value.trim();
      s.school.hi = $('#sc_hi').value.trim();
      s.school.addressEn = $('#sc_addrEn').value.trim();
      s.school.addressHi = $('#sc_addrHi').value.trim();
      s.school.udise = $('#sc_udise').value.trim();
      s.school.cbseAff = $('#sc_cbse').value.trim();
      s.school.estd = $('#sc_estd').value.trim();
      s.school.email = $('#sc_email').value.trim();
      s.school.phone = $('#sc_phone').value.trim();

      s.refFormat = $('#refFormat').value.trim();
      s.inFormat = $('#inFormat').value.trim();
      s.yearMode = $('#yearMode').value;
      s.padWidth = +$('#padWidth').value;
      s.fontFamily = $('#fontFamily').value;
      s.fontPt = +$('#fontPt').value;
      s.sigAlign = $('#sigAlign').value;
      s.topMm = +$('#topMm').value;
      s.preprinted = $('#preprinted').checked;
      s.defaultShowSign = $('#defaultShowSign').checked;
      s.showMajorHeadOnLetter = $('#showMajorHeadOnLetter').checked;

      if (!/\{n\}/.test(s.refFormat)) return toast('Ref. format must include {n}', true);
      try {
        await Store.op('saveSettings', s);
        toast('Settings saved ✓');
        viewSet();
      } catch (err) { toast(err.message, true); }
    };

    const rf = $('#rf');
    if (rf) {
      rf.onchange = async e => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          const parsed = JSON.parse(await f.text());
          if (!confirm('Replace ALL current letters and settings with this backup?')) return;
          await Store.op('restore', parsed);
          await Store.reload();
          toast('Database restored ✓');
          go('home');
        } catch (err) { toast(err.message, true); }
      };
    }

    $$('[data-deltpl]').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Delete this custom template?')) return;
        await Store.op('deleteCustomTemplate', { id: btn.dataset.deltpl });
        viewSet();
      };
    });
  }

  const newCustBtn = $('#newCustTpl');
  if (newCustBtn) {
    newCustBtn.onclick = async () => {
      const v = await ask('Create Custom Bilingual Template (कस्टम टेम्पलेट)', [
        { k: 'name', l: 'Template Title (e.g. Scholarship Forwarding / छात्रवृत्ति प्रेषण)' },
        { k: 'majorHead', l: 'Default Major Head', type: 'select', opts: s.majorHeads.map(h => ({ v: h.code, l: `${h.code} — ${h.en}` })), v: 'ADM' },
        { k: 'layout', l: 'Layout Style', type: 'select', opts: [{ v: 'letter', l: 'Official Letter' }, { v: 'cert', l: 'Certificate' }, { v: 'notice', l: 'Notice / Office Order' }], v: 'letter' },
        { k: 'enSubj', l: 'English Subject (use {{placeholder}})', ph: 'Regarding {{topic}} for {{student_name}}' },
        { k: 'enBody', l: 'English Body (use {{placeholder}})', type: 'area', ph: 'With due respect, {{details}}...' },
        { k: 'hiSubj', l: 'हिंदी विषय ({{placeholder}} का प्रयोग करें)', ph: '{{student_name}} के {{topic}} के संबंध में।' },
        { k: 'hiBody', l: 'हिंदी मुख्य भाग ({{placeholder}} का प्रयोग करें)', type: 'area', ph: 'सविनय निवेदन है कि {{details}}...' },
      ], 'Save Template');
      if (!v || !v.name) return;
      const keys = Tpl.extractPlaceholders([v.enSubj, v.enBody, v.hiSubj, v.hiBody]);
      const sys = new Set(Core.SYSTEM_PLACEHOLDERS.map(p => p.key));
      const fields = keys.filter(k => !sys.has(k)).map(k => ({ k, l: k.replace(/_/g, ' '), t: 'text' }));
      await Store.op('saveCustomTemplate', {
        name: v.name,
        majorHead: v.majorHead,
        layout: v.layout,
        fields,
        en: { subject: v.enSubj, body: v.enBody, heading: v.layout !== 'letter' ? v.name.toUpperCase() : '' },
        hi: { subject: v.hiSubj, body: v.hiBody, heading: v.layout !== 'letter' ? v.name : '' },
      });
      toast('Custom template created ✓');
      viewSet();
    };
  }

  $('#bkBtn').onclick = async () => {
    const blob = new Blob([JSON.stringify(Store.db, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `LetterDraftAssistant_Backup_${Core.todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (Session.can('write')) await Store.op('markBackup').catch(() => {});
    toast('JSON Backup downloaded ✓');
  };
}

/* ---------- Quick Command Bar ---------- */
const HELP = [
  ['n <tpl>[.hi] [@alias] [k="v"]', 'New letter — e.g. n bon.hi name="Anita" father="Ramesh" cls=XII purpose="Scholarship"'],
  ['head <code>', 'Filter register by Major Head — e.g. head STD  |  head FIN  |  head ADM'],
  ['f <keyword>', 'Search Letter No., Major Head, Recipient, or Subject'],
  ['ref <no>  |  dup <no>', 'Open or duplicate letter by Ref. No. (e.g. ref 321)'],
  ['d <no> [mode]', 'Mark letter dispatched today (e.g. d 321 Speed Post)'],
  ['docx · pdf · xlsx', 'Download current letter as Word/PDF, or Master Register as Excel (.xlsx)'],
  ['Shortcuts', 'Ctrl+K Command bar · Ctrl+S Save draft · Ctrl+Enter Issue & Print'],
];

function tok(s) {
  const o = [];
  const re = /(?:(\w+)=)?(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let m;
  while ((m = re.exec(s))) o.push({ k: m[1], v: m[2] ?? m[3] ?? m[4] });
  return o;
}

const findByRef = (a) => {
  const yk = nextRefNow('ADM').yk;
  const x = String(a || '').trim();
  return Store.db.letters.find(l => l.ref === x)
    || Store.db.letters.find(l => l.ref && l.refNo === +x && l.refYear === yk)
    || Store.db.letters.filter(l => l.ref && l.refNo === +x).sort((p, q) => q.refYear - p.refYear)[0];
};

async function runCmd(line) {
  line = line.trim();
  if (!line || !Store.db) return;
  const t = tok(line);
  const c = (t[0].v || '').toLowerCase();
  const rest = t.slice(1);
  try {
    if (c === 'help' || c === '?') return showHelp();
    if (c === 'xlsx' || c === 'excel') return downloadFromApi('api/export/xlsx', null, `Master_Letter_Register_${Core.todayISO()}.xlsx`);
    if (c === 'docx' && S.view === 'editor' && S.cur) return downloadFromApi('api/export/docx', { letter: resolveLiveLetter(S.cur) }, 'Letter.docx');
    if (c === 'pdf' && S.view === 'editor' && S.cur) return downloadFromApi('api/export/pdf', { letter: resolveLiveLetter(S.cur) }, 'Letter.pdf');
    if (c === 'head' && rest[0]) { S.head = rest[0].v.toUpperCase(); S.q = ''; return go('out'); }
    if (['home', 'out', 'inw', 'sync', 'sec', 'set'].includes(c)) return go(c);

    if (c === 'n' || c === 'new') {
      const tp = (rest[0] && !rest[0].k ? rest[0].v : 'req').toLowerCase();
      const [id, lg] = tp.split('.');
      const tpl = allTemplates().find(x => x.id === id) || allTemplates().find(x => x.id.startsWith(id));
      if (!tpl) throw new Error('Unknown template: ' + id);
      const o = { tpl: tpl.id + (lg ? '.' + lg : ''), fields: {} };
      rest.slice(1).concat(rest[0] && rest[0].k ? [rest[0]] : []).forEach(a => {
        if (!a.k && a.v[0] === '@') {
          const al = a.v.slice(1).toLowerCase();
          const r = Store.db.settings.recipients.find(x => x.alias === al || x.alias.startsWith(al));
          if (!r) throw new Error('Unknown @alias: ' + al);
          o.rcpt = r.alias;
        } else if (a.k === 'head') o.majorHead = a.v.toUpperCase();
        else if (a.k === 'sub') o.subHead = a.v;
        else if (a.k === 'subject') o.subject = a.v;
        else if (a.k === 'to') o.to = a.v.replace(/\\n|;/g, '\n');
        else if (a.k) o.fields[a.k] = a.v.replace(/\\n/g, '\n');
      });
      return go('editor', newLetter(o));
    }

    if (c === 'ref' || c === 'open') {
      const l = findByRef(rest[0] && rest[0].v);
      if (!l) throw new Error('Letter not found');
      return go('editor', clone(l));
    }
    if (c === 'dup') {
      const l = findByRef(rest[0] && rest[0].v);
      if (!l) throw new Error('Letter not found');
      const d = clone(l);
      ['ref', 'refNo', 'refYear', 'issuedAt', 'dispatch', 'reply', 'cancelReason', 'editedAfterIssue', 'createdAt'].forEach(k => delete d[k]);
      d.id = Core.uid(); d.status = 'draft'; d.date = Core.todayISO();
      return go('editor', d);
    }
    if (c === 'd' && rest[0]) {
      const l = findByRef(rest[0].v);
      if (!l) throw new Error('Letter not found');
      const mode = rest.slice(1).map(x => x.v).join(' ') || 'By Hand';
      await Store.op('patchLetter', { id: l.id, patch: { dispatch: { mode, date: Core.todayISO(), note: '' } } });
      toast(`${l.ref} marked dispatched (${mode})`);
      return go(S.view, S.cur);
    }

    S.q = (c === 'f' || c === 'find') ? line.replace(/^(f|find)\s+/i, '') : line;
    S.head = '';
    go('out');
  } catch (e) {
    toast(e.message, true);
  }
}

function showHelp() {
  const d = $('#dlg');
  d.innerHTML = `<form method="dialog">
    <h3>⌨ Quick Commands &amp; Shortcuts</h3>
    <table class="tb">${HELP.map(h => `<tr><td><code>${esc(h[0])}</code></td><td>${esc(h[1])}</td></tr>`).join('')}</table>
    <div class="row end"><button class="pri">Close</button></div>
  </form>`;
  d.onclose = null;
  d.showModal();
}

function bindGlobalEvents() {
  $$('#sideNav button').forEach(b => {
    b.onclick = () => go(b.dataset.v);
  });

  $('#btnLogout').onclick = async () => {
    await apiJson('api/auth/logout', { method: 'POST', body: JSON.stringify({}) }).catch(() => {});
    Session.clear();
    toast('Signed out safely');
    showAuthGate();
  };

  const cmd = $('#cmd');
  const sug = $('#sug');
  cmd.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const v = cmd.value;
      cmd.value = '';
      sug.innerHTML = '';
      cmd.blur();
      runCmd(v);
    } else if (e.key === 'Escape') {
      cmd.value = '';
      sug.innerHTML = '';
      cmd.blur();
    }
  });
  cmd.addEventListener('input', () => {
    const m = /^(n|new)\s+(\S*)$/i.exec(cmd.value.trim());
    if (!m || !Store.db) { sug.innerHTML = ''; return; }
    const q = m[2].split('.')[0].toLowerCase();
    sug.innerHTML = allTemplates()
      .filter(t => t.id.startsWith(q))
      .slice(0, 8)
      .map(t => `<div data-pick="${esc(t.id)}"><b>${esc(t.id)}</b> · [${esc(t.majorHead || 'ADM')}] <span>${esc(t.name)}</span></div>`)
      .join('');
    $$('div[data-pick]', sug).forEach(el => {
      el.onmousedown = () => {
        cmd.value = `n ${el.dataset.pick} `;
        sug.innerHTML = '';
        cmd.focus();
      };
    });
  });
  cmd.addEventListener('blur', () => setTimeout(() => { sug.innerHTML = ''; }, 160));

  document.addEventListener('keydown', e => {
    if (!Session.user) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'k') {
      e.preventDefault(); cmd.focus(); cmd.select();
    } else if ((e.ctrlKey || e.metaKey) && k === 's' && S.view === 'editor') {
      e.preventDefault(); saveCur(false);
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && S.view === 'editor' && S.cur) {
      e.preventDefault();
      if (S.cur.status === 'draft' && Session.can('write')) issueCur(true);
      else printHTML(letterHTML(S.cur, true));
    }
  });

  window.addEventListener('beforeunload', e => {
    if (S.cur && S.cur.dirty) { e.preventDefault(); e.returnValue = ''; }
  });
}

/* ---------- Boot ---------- */
(function init() {
  bindGlobalEvents();
  showAuthGate();
})();
