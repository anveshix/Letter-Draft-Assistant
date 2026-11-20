/* Letter Draft Assistant v3.0 — Automatic Static Cloud Vault Adapter
   - Probes `api/health` on startup.
   - If a live Node.js server is running (Local PC, Render, Railway, Vercel, Docker),
     this adapter stays 100% dormant so all requests go directly to `server.js`.
   - If hosted on a static-only host (such as GitHub Pages `*.github.io`), it seamlessly
     activates a WebCrypto PBKDF2-SHA256 Browser Vault so Login, RBAC, All 20 Templates,
     Master Directory, Approval Queue, QR Verification, Word (.doc), and Excel (.xls/.csv)
     work 100% client-side with zero 404 errors. */
(function (root) {
  'use strict';

  if (typeof window === 'undefined' || !window.fetch) return;

  const origFetch = window.fetch.bind(window);
  let backendState = null; // null = unknown, 'server' = Node server active, 'static' = Browser Vault

  const LS_DB = 'lda_v3_static_db';
  const LS_AUTH = 'lda_v3_static_auth';
  const LS_SESS = 'lda_v3_static_sess';
  const LS_AUDIT = 'lda_v3_static_audit';
  const LS_SECRET = 'lda_v3_static_qr_secret';

  function randHex(bytes) {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
  }

  async function pbkdf2Hex(password, saltHex) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: enc.encode(saltHex), iterations: 120000, hash: 'SHA-256' },
      key,
      256
    );
    return Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, '0')).join('');
  }

  async function sha256Short(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('').slice(0, 16).toUpperCase();
  }

  function loadJson(k, def) {
    try {
      const r = localStorage.getItem(k);
      return r ? JSON.parse(r) : def;
    } catch (_) { return def; }
  }
  function saveJson(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {}
  }

  function getStaticDb() {
    const raw = loadJson(LS_DB, null);
    const db = raw ? root.Core.migrate(raw) : root.Core.defaultDb();
    // On static host, clear unavailable server-only default sign stamp unless uploaded as dataUrl
    if (db.settings && Array.isArray(db.settings.signatories)) {
      db.settings.signatories.forEach(s => {
        if (s.stamp === 'api/files/sign.png') s.stamp = '';
      });
    }
    saveJson(LS_DB, db);
    return db;
  }

  function getQrSecret() {
    let s = localStorage.getItem(LS_SECRET);
    if (!s || s.length < 32) {
      s = randHex(32);
      try { localStorage.setItem(LS_SECRET, s); } catch (_) {}
    }
    return s;
  }

  function logAudit(actor, role, action, detail) {
    const list = loadJson(LS_AUDIT, []);
    list.unshift({ id: randHex(4), ts: new Date().toISOString(), actor: actor || 'local', role: role || 'admin', action, detail: String(detail || ''), ip: 'browser-vault' });
    if (list.length > 100) list.length = 100;
    saveJson(LS_AUDIT, list);
  }

  function jsonResp(status, obj) {
    return new Response(JSON.stringify(obj), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  function binResp(blobParts, mime, filename) {
    const blob = new Blob(blobParts, { type: mime });
    return new Response(blob, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  function makeVerificationBadgeSvgDataUrl(code) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140" viewBox="0 0 140 140">
      <rect width="140" height="140" rx="10" fill="#ffffff" stroke="#162d4c" stroke-width="4"/>
      <rect x="10" y="10" width="34" height="34" fill="#162d4c"/><rect x="16" y="16" width="22" height="22" fill="#fff"/><rect x="21" y="21" width="12" height="12" fill="#162d4c"/>
      <rect x="96" y="10" width="34" height="34" fill="#162d4c"/><rect x="102" y="16" width="22" height="22" fill="#fff"/><rect x="107" y="21" width="12" height="12" fill="#162d4c"/>
      <rect x="10" y="96" width="34" height="34" fill="#162d4c"/><rect x="16" y="102" width="22" height="22" fill="#fff"/><rect x="21" y="107" width="12" height="12" fill="#162d4c"/>
      <circle cx="70" cy="70" r="20" fill="#15803d"/>
      <path d="M60 70l7 7 14-15" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="70" y="124" font-family="monospace" font-size="9" font-weight="bold" text-anchor="middle" fill="#162d4c">${code.slice(0, 9)}</text>
    </svg>`;
    return 'data:image/svg+xml;base64,' + btoa(svg);
  }

  function buildWordHtmlDoc(db, letter) {
    const S = db.settings;
    const isHi = letter.lang === 'hi';
    const sg = (S.signatories || []).find(x => x.id === letter.sig) || (S.signatories || [])[0] || {};
    const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(/‹([^›]+)›/g, '[$1]');
    const paras = String(letter.body || '').split(/\n{2,}/).map(p => `<p style="text-align:justify;margin:0 0 10pt">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');

    return `\ufeff<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>Letter ${esc(letter.ref || 'Draft')}</title>
<style>
  @page { size: 21cm 29.7cm; margin: 1.8cm 2cm; }
  body { font-family: 'Nirmala UI', 'Mangal', 'Times New Roman', serif; font-size: ${S.fontPt || 12}pt; line-height: 1.55; }
</style></head>
<body>
  <div style="text-align:center;border-bottom:2px solid #162d4c;padding-bottom:6pt;margin-bottom:10pt">
    <h2 style="margin:0;color:#162d4c">${esc(S.school.name || S.school.en)}</h2>
    <div><b>${esc(S.school.subName || '')}</b></div>
    <div style="font-size:9.5pt">CBSE Affiliation: ${esc(S.school.cbseAff)} | U-DISE: ${esc(S.school.udise)} | ${esc(S.school.addressEn)}</div>
  </div>
  <table width="100%" style="font-weight:bold;margin-bottom:10pt"><tr>
    <td>${isHi ? 'पत्रांक:' : 'Ref. No.:'} ${esc(letter.ref || '____ (Draft)')}</td>
    <td align="right">${isHi ? 'दिनांक:' : 'Date:'} ${esc(root.Core.fmtDateDMY(letter.date))}</td>
  </tr></table>
  ${letter.layout === 'letter' && letter.to ? `<p><b>${isHi ? 'सेवा में,' : 'To,'}</b><br>${esc(letter.to).replace(/\n/g, '<br>')}</p>` : ''}
  ${letter.heading ? `<h3 style="text-align:center;text-decoration:underline">${esc(letter.heading)}</h3>` : ''}
  ${letter.subject ? `<p style="${letter.layout !== 'letter' ? 'text-align:center;' : ''}font-weight:bold">${letter.layout === 'letter' ? (isHi ? 'विषय: ' : 'Subject: ') : ''}${esc(letter.subject)}</p>` : ''}
  ${letter.layout === 'letter' && letter.salutation ? `<p>${esc(letter.salutation)}</p>` : ''}
  ${paras}
  <div style="margin-top:28pt;text-align:${S.sigAlign === 'left' ? 'left' : 'right'}">
    ${letter.layout === 'letter' && letter.closing ? `<div>${esc(letter.closing)}</div>` : ''}
    <br><br>
    <div><b>(${esc(isHi ? (sg.nameHi || sg.name) : sg.name)})</b></div>
    <div>${esc(isHi ? (sg.designationHi || sg.designation) : sg.designation)}</div>
  </div>
</body></html>`;
  }

  function buildExcelCsv(db) {
    const q = v => `"${String(v ?? '').replace(/"/g, '""').replace(/\n+/g, ' ')}"`;
    const header = ['Sl.No', 'Ref.No', 'Date', 'Major Head', 'Sub-Head', 'Language', 'Recipient/Party', 'Subject/Heading', 'Status', 'Remarks'];
    const lines = [header.map(q).join(',')];
    (db.letters || []).forEach((l, i) => {
      lines.push([
        i + 1,
        l.ref || 'DRAFT',
        root.Core.fmtDateDMY(l.date),
        l.majorHead || 'ADM',
        l.subHead || '',
        l.lang || 'en',
        l.to || (l.fields && l.fields.name) || '',
        l.subject || l.heading || '',
        l.status || 'draft',
        l.remarks || '',
      ].map(q).join(','));
    });
    return '\ufeff' + lines.join('\r\n');
  }

  async function probeBackendMode() {
    if (backendState) return backendState;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2200);
      const res = await origFetch('api/health', { cache: 'no-store', signal: ctrl.signal });
      clearTimeout(timer);
      if (res && res.ok) {
        const d = await res.json().catch(() => null);
        if (d && d.ok) {
          backendState = 'server';
          return 'server';
        }
      }
    } catch (_) {}
    backendState = 'static';
    setTimeout(() => {
      const pill = document.getElementById('syncPill');
      if (pill) {
        pill.textContent = '🔒 Browser Vault Mode';
        pill.title = 'Running standalone in Static Cloud / GitHub Pages Browser Vault';
      }
    }, 300);
    return 'static';
  }

  async function handleStaticApi(urlStr, init = {}) {
    const u = new URL(urlStr, location.origin);
    const idx = u.pathname.indexOf('/api/');
    const apiPath = idx >= 0 ? u.pathname.slice(idx) : u.pathname;
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body) : {};

    const db = getStaticDb();
    const authStore = loadJson(LS_AUTH, { users: [] });
    const sess = loadJson(LS_SESS, null);

    const pubUser = usr => usr ? ({ id: usr.id, username: usr.username, displayName: usr.displayName, role: usr.role, active: usr.active !== false, lastLoginAt: usr.lastLoginAt }) : null;
    const activeUser = sess ? authStore.users.find(x => x.id === sess.userId && x.active !== false) : null;

    if (apiPath === '/api/health') return jsonResp(200, { ok: true, mode: 'static-vault', version: '3.0.0' });

    if (apiPath === '/api/auth/status') {
      return jsonResp(200, {
        setupRequired: authStore.users.length === 0,
        authenticated: !!activeUser,
        user: pubUser(activeUser),
        csrfToken: sess ? sess.csrfToken : null,
        schoolName: db.settings.school.en,
      });
    }

    if (apiPath === '/api/auth/setup' && method === 'POST') {
      if (authStore.users.length > 0) return jsonResp(403, { error: 'Setup already completed.' });
      if (!body.username || String(body.password || '').length < 8) return jsonResp(400, { error: 'Username & min 8-char password required.' });
      const salt = randHex(16);
      const hash = await pbkdf2Hex(body.password, salt);
      const usr = { id: 'usr_' + randHex(4), username: String(body.username).trim().toLowerCase(), displayName: body.displayName || body.username, role: 'admin', salt, hash, active: true, lastLoginAt: Date.now() };
      authStore.users.push(usr);
      saveJson(LS_AUTH, authStore);
      const newSess = { userId: usr.id, csrfToken: randHex(16) };
      saveJson(LS_SESS, newSess);
      logAudit(usr.username, 'admin', 'INITIAL_ADMIN_CREATED', 'Browser Vault Admin created');
      return jsonResp(200, { ok: true, user: pubUser(usr), csrfToken: newSess.csrfToken });
    }

    if (apiPath === '/api/auth/login' && method === 'POST') {
      const uname = String(body.username || '').trim().toLowerCase();
      const usr = authStore.users.find(x => x.username === uname && x.active !== false);
      if (!usr) return jsonResp(401, { error: 'Invalid username or password.' });
      const checkHash = await pbkdf2Hex(body.password, usr.salt);
      if (checkHash !== usr.hash) return jsonResp(401, { error: 'Invalid username or password.' });
      usr.lastLoginAt = Date.now();
      saveJson(LS_AUTH, authStore);
      const newSess = { userId: usr.id, csrfToken: randHex(16) };
      saveJson(LS_SESS, newSess);
      logAudit(usr.username, usr.role, 'LOGIN_SUCCESS', 'Signed in');
      return jsonResp(200, { ok: true, user: pubUser(usr), csrfToken: newSess.csrfToken });
    }

    if (apiPath === '/api/auth/logout') {
      localStorage.removeItem(LS_SESS);
      return jsonResp(200, { ok: true });
    }

    if (apiPath === '/api/public/verify') {
      const ref = (u.searchParams.get('ref') || '').trim();
      const code = (u.searchParams.get('c') || '').replace(/[^A-F0-9]/gi, '').toUpperCase();
      const letter = (db.letters || []).find(l => l.ref && l.ref.toLowerCase() === ref.toLowerCase());
      if (!letter) return jsonResp(200, { valid: false, status: 'not_found', message: 'Reference No. not found in this browser vault.' });
      const expected = await sha256Short(`${ getQrSecret() }|${letter.id}|${letter.ref}|${letter.date}`);
      if (code !== expected) return jsonResp(200, { valid: false, status: 'forged_or_mismatch', message: 'Verification code mismatch.' });
      const sg = (db.settings.signatories || [])[0] || {};
      return jsonResp(200, {
        valid: letter.status !== 'cancelled',
        status: letter.status === 'cancelled' ? 'cancelled' : 'verified',
        institution: db.settings.school.en,
        institutionHi: db.settings.school.hi,
        udise: db.settings.school.udise,
        cbseAff: db.settings.school.cbseAff,
        ref: letter.ref,
        date: root.Core.fmtDateDMY(letter.date),
        majorHead: letter.majorHead || 'ADM',
        documentTitle: letter.heading || letter.subject || 'Official Document',
        issuedTo: ((letter.to || '').split('\n')[0]) || (letter.fields && letter.fields.name) || 'Official Recipient',
        signatory: `${sg.name || ''} (${sg.designation || ''})`,
        verifyCode: `${expected.slice(0, 4)}-${expected.slice(4, 8)}-${expected.slice(8, 12)}-${expected.slice(12, 16)}`,
        cancelReason: letter.cancelReason,
      });
    }

    if (!activeUser) return jsonResp(401, { error: 'Authentication required.' });

    if (apiPath === '/api/auth/change-password' && method === 'POST') {
      const checkHash = await pbkdf2Hex(body.currentPassword, activeUser.salt);
      if (checkHash !== activeUser.hash) return jsonResp(400, { error: 'Current password is incorrect.' });
      if (String(body.newPassword || '').length < 8) return jsonResp(400, { error: 'Minimum 8 characters required.' });
      activeUser.salt = randHex(16);
      activeUser.hash = await pbkdf2Hex(body.newPassword, activeUser.salt);
      saveJson(LS_AUTH, authStore);
      return jsonResp(200, { ok: true });
    }

    if (apiPath === '/api/users' && method === 'GET') {
      return jsonResp(200, { users: authStore.users.map(pubUser), audit: loadJson(LS_AUDIT, []) });
    }

    if (apiPath === '/api/users' && method === 'POST') {
      const salt = randHex(16);
      const hash = await pbkdf2Hex(body.password, salt);
      const nu = { id: 'usr_' + randHex(4), username: String(body.username).trim().toLowerCase(), displayName: body.displayName || body.username, role: body.role || 'staff', salt, hash, active: true };
      authStore.users.push(nu);
      saveJson(LS_AUTH, authStore);
      return jsonResp(200, { ok: true, user: pubUser(nu), users: authStore.users.map(pubUser) });
    }

    if (apiPath === '/api/users/update' && method === 'POST') {
      const t = authStore.users.find(x => x.id === body.id);
      if (t && body.newPassword) { t.salt = randHex(16); t.hash = await pbkdf2Hex(body.newPassword, t.salt); saveJson(LS_AUTH, authStore); }
      return jsonResp(200, { ok: true, users: authStore.users.map(pubUser) });
    }

    if (apiPath === '/api/users/delete' && method === 'POST') {
      authStore.users = authStore.users.filter(x => x.id !== body.id);
      saveJson(LS_AUTH, authStore);
      return jsonResp(200, { ok: true, users: authStore.users.map(pubUser) });
    }

    if (apiPath === '/api/db') return jsonResp(200, db);

    if (apiPath === '/api/op' && method === 'POST') {
      if (root.Core.ADMIN_ONLY_OPS.has(body.op) && activeUser.role !== 'admin') {
        return jsonResp(403, { error: 'Admin permission required.' });
      }
      const result = root.Core.apply(db, body.op, body.payload, activeUser.username);
      saveJson(LS_DB, db);
      logAudit(activeUser.username, activeUser.role, `op:${body.op}`, '');
      return jsonResp(200, { ok: true, result, db });
    }

    if (apiPath === '/api/upload-image' && method === 'POST') {
      return jsonResp(200, { ok: true, url: body.dataUrl });
    }

    if (apiPath.startsWith('/api/letter/') && apiPath.endsWith('/qr')) {
      const id = decodeURIComponent(apiPath.split('/')[3] || '');
      const l = (db.letters || []).find(x => x.id === id);
      if (!l || !l.ref) return jsonResp(200, { issued: false });
      const code = await sha256Short(`${getQrSecret()}|${l.id}|${l.ref}|${l.date}`);
      const fmt = `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}-${code.slice(12, 16)}`;
      const base = location.href.replace(/\/[^/]*$/, '');
      const verifyUrl = `${base}/verify.html?ref=${encodeURIComponent(l.ref)}&c=${code}`;
      return jsonResp(200, { issued: true, verifyUrl, verifyCode: fmt, qrDataUrl: makeVerificationBadgeSvgDataUrl(fmt) });
    }

    if (apiPath === '/api/export/docx' && method === 'POST') {
      const docHtml = buildWordHtmlDoc(db, body.letter || {});
      const fname = `Letter_${String((body.letter && body.letter.ref) || 'Draft').replace(/[^a-zA-Z0-9_-]/g, '-')}.doc`;
      return binResp([docHtml], 'application/msword;charset=utf-8', fname);
    }

    if (apiPath === '/api/export/pdf' || apiPath === '/api/export/register-pdf' || apiPath === '/api/export/inspection-pdf') {
      setTimeout(() => window.print(), 150);
      return jsonResp(400, { error: 'Opening Print / Save as PDF dialog… (Deploy on Render/Railway/Vercel/PC for direct server PDF engine).' });
    }

    if (apiPath.startsWith('/api/export/register-xlsx') || apiPath.startsWith('/api/export/directory-xlsx') || apiPath === '/api/export/mailmerge-sample') {
      const csv = buildExcelCsv(db);
      return binResp([csv], 'text/csv;charset=utf-8', `Letter_Register_${root.Core.todayISO()}.csv`);
    }

    if (apiPath === '/api/batch/generate' && method === 'POST') {
      const list = body.letters || [];
      for (const rawL of list) {
        const saved = root.Core.apply(db, 'saveLetter', Object.assign({}, rawL, { id: rawL.id || root.Core.uid() }), activeUser.username);
        if (body.issueRefs) root.Core.apply(db, 'issueLetter', { id: saved.id, date: body.date || root.Core.todayISO() }, activeUser.username);
      }
      saveJson(LS_DB, db);
      const combinedDocs = list.map(l => buildWordHtmlDoc(db, l)).join('<br style="page-break-before:always">');
      return binResp([combinedDocs], 'application/msword;charset=utf-8', `Batch_${list.length}_Documents.doc`);
    }

    if (apiPath === '/api/inward/ocr') {
      return jsonResp(200, {
        ok: true,
        attachment: body.dataUrl,
        rawText: '(Scan attached! Run on Local PC / Render / Railway / Docker for server-side Tesseract Hindi+English OCR)',
        from: '',
        senderRef: '',
        subject: '',
        priority: 'normal',
        majorHead: 'ADM',
      });
    }

    return jsonResp(400, { error: 'Action requires Node.js server mode (Render / Railway / Vercel / Local PC).' });
  }

  window.fetch = async function (input, init) {
    const urlStr = typeof input === 'string' ? input : (input && input.url) || '';
    const isApiCall = /(^|\/)api\//.test(urlStr);
    if (!isApiCall) return origFetch(input, init);

    const mode = await probeBackendMode();
    if (mode === 'server') return origFetch(input, init);
    return handleStaticApi(urlStr, init);
  };
})(typeof self !== 'undefined' ? self : window);
