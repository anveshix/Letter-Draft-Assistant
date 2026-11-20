/* Letter Draft Assistant v3.0 — Main Authenticated Application Controller */
(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const LBL = {
    en: { to: 'To,', subj: 'Subject:', ref: 'Ref. No.:', date: 'Date:', encl: 'Enclosure(s):', cc: 'Copy forwarded to:', head: 'Major Head / File:' },
    hi: { to: 'सेवा में,', subj: 'विषय:', ref: 'पत्रांक:', date: 'दिनांक:', encl: 'संलग्नक:', cc: 'प्रतिलिपि सूचनार्थ एवं आवश्यक कार्यार्थ:', head: 'मद / संचिका:' },
  };

  let auth = { authenticated: false, user: null, csrfToken: null };
  let db = null;
  let curView = 'dash';
  let ed = null;
  let activeFocusField = null;
  let phoneticMode = false;
  let activeSpeechRec = null;
  let cachedQrMap = {};
  let deferredPwaPrompt = null;
  let paperZoom = 0.9;

  const M = window.MotionUI || {};
  const ico = (name, size = 15, cls = '') => (M.ico ? M.ico(name, size, cls) : '');

  const outF = { q: '', year: '', status: '', majorHead: '' };
  const sheetF = { q: '', year: '', status: '', majorHead: '', fuzzy: true };
  const inwF = { q: '', status: '', majorHead: '', priority: '' };

  if (M.initTheme) M.initTheme();
  if (window.hydrateIcons) window.hydrateIcons(document);

  if ($('#themeToggleBtn')) {
    $('#themeToggleBtn').onclick = () => {
      const next = M.toggleTheme ? M.toggleTheme() : 'light';
      toast(next === 'dark' ? 'Executive Midnight Slate theme enabled.' : 'Sovereign Light theme enabled.');
    };
  }
  if ($('#cmdBtn')) {
    $('#cmdBtn').onclick = () => { if (M.openCommandPalette) M.openCommandPalette(); };
  }

  function toast(msg, ms = 3200) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    if (M.animateToast) M.animateToast(t);
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, ms);
  }

  function modal(html) {
    const m = $('#modal');
    m.innerHTML = `<div class="box">${html}</div>`;
    m.hidden = false;
    if (M.animateModalOpen) M.animateModalOpen(m);
    m.onclick = e => { if (e.target === m) closeModal(); };
  }
  function closeModal() { $('#modal').hidden = true; }

  // ==================== PWA SERVICE WORKER & INSTALL BUTTON ====================
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPwaPrompt = e;
    const btn = $('#pwaInstallBtn');
    if (btn) btn.hidden = false;
  });
  if ($('#pwaInstallBtn')) {
    $('#pwaInstallBtn').onclick = async () => {
      if (!deferredPwaPrompt) return;
      deferredPwaPrompt.prompt();
      await deferredPwaPrompt.userChoice;
      deferredPwaPrompt = null;
      $('#pwaInstallBtn').hidden = true;
    };
  }

  // ==================== API & BINARY DOWNLOAD HELPERS ====================
  async function api(url, body, method) {
    const m = method || (body !== undefined ? 'POST' : 'GET');
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth.csrfToken && m !== 'GET') headers['X-CSRF-Token'] = auth.csrfToken;

    const r = await fetch(url, {
      method: m,
      headers,
      credentials: 'same-origin',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401 && auth.authenticated) {
      auth = { authenticated: false, user: null, csrfToken: null };
      showAuthGate(false);
      throw new Error(d.error || 'Session expired. Please sign in again.');
    }
    if (!r.ok) throw new Error(d.error || r.statusText);
    return d;
  }

  async function op(name, payload) {
    const r = await api('/api/op', { op: name, payload });
    db = r.db;
    refreshChrome();
    return r.result;
  }

  async function reloadDb() {
    db = await api('/api/db');
    refreshChrome();
    return db;
  }

  async function downloadBinary(url, method, body, fallbackName) {
    try {
      toast('Generating file… कृपया प्रतीक्षा करें');
      const headers = {};
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (auth.csrfToken && method !== 'GET') headers['X-CSRF-Token'] = auth.csrfToken;
      const r = await fetch(url, {
        method,
        headers,
        credentials: 'same-origin',
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || 'Download failed');
      }
      const blob = await r.blob();
      let filename = fallbackName;
      const cd = r.headers.get('content-disposition') || '';
      const m = /filename="([^"]+)"/.exec(cd);
      if (m) filename = m[1];
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      toast(`Downloaded ${filename}`);
    } catch (e) {
      toast(e.message);
    }
  }

  // ==================== SHARED MODULE CONTEXT ====================
  function makeUiCtx() {
    return {
      get db() { return db; },
      get auth() { return auth; },
      api,
      op,
      reloadDb,
      downloadBinary,
      toast,
      modal,
      closeModal,
      allTemplates,
      openLetter: (id) => {
        const found = db.letters.find(x => x.id === id);
        if (found) { ed = JSON.parse(JSON.stringify(found)); go('edit'); }
      },
      buildLetterFromTemplateFields: (tpl, lang, fields, extra = {}) => {
        const l = {
          id: Core.uid(),
          tpl: tpl.id,
          lang,
          layout: tpl.layout,
          majorHead: extra.majorHead || tpl.majorHead || Core.inferMajorHead(tpl.id),
          subHead: extra.subHead || '',
          date: Core.todayISO(),
          sig: db.settings.defaultSignatory,
          showSign: extra.showSign !== undefined ? extra.showSign : db.settings.defaultShowSign,
          showQr: extra.showQr !== undefined ? extra.showQr : db.settings.defaultShowQr,
          fields: Object.assign({}, fields),
          encl: '',
          cc: '',
          status: 'draft',
        };
        applyTemplate(l);
        return l;
      },
      startLetterForPerson: (person, kind, tplId) => {
        const lang = 'en';
        const l = newFromTemplate(tplId || (kind === 'staff' ? 'exp' : 'bon'), lang);
        const mapped = window.ModulesUI.mapPersonToFields(person, kind, lang, {
          purpose: 'Official / Scholarship / Academic Use',
          session: Core.sessionFromISO(Core.todayISO()),
        });
        l.fields = Object.assign(l.fields || {}, mapped);
        l.personRef = { type: kind === 'staff' ? 'staff' : 'student', id: person.id, code: person.admNo || person.empId || '', name: person.name };
        applyTemplate(l);
        ed = l;
        go('edit');
      },
    };
  }

  // ==================== AUTHENTICATION GATE ====================
  async function checkAuthAndBoot() {
    try {
      const st = await fetch('/api/auth/status', { credentials: 'same-origin' }).then(r => r.json());
      if (st.schoolName) $('#authSchoolName').textContent = st.schoolName;
      if (st.authenticated) {
        auth = { authenticated: true, user: st.user, csrfToken: st.csrfToken };
        await enterApp();
      } else {
        showAuthGate(st.setupRequired);
      }
    } catch (_) {
      showAuthGate(false);
    }
  }

  function showAuthGate(setupRequired) {
    $('#appShell').hidden = true;
    $('#authGate').hidden = false;
    $('#setupForm').hidden = !setupRequired;
    $('#loginForm').hidden = !!setupRequired;
    if (M.animateAuthGate) M.animateAuthGate();
  }

  $('#loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const errBox = $('#loginErr');
    errBox.hidden = true;
    try {
      const r = await api('/api/auth/login', {
        username: $('#loginUser').value.trim(),
        password: $('#loginPass').value,
      });
      auth = { authenticated: true, user: r.user, csrfToken: r.csrfToken };
      $('#loginPass').value = '';
      await enterApp();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.hidden = false;
    }
  };

  $('#setupForm').onsubmit = async (e) => {
    e.preventDefault();
    const errBox = $('#setupErr');
    errBox.hidden = true;
    const p1 = $('#setupPass').value;
    const p2 = $('#setupPass2').value;
    if (p1 !== p2) {
      errBox.textContent = 'Passwords do not match.';
      errBox.hidden = false;
      return;
    }
    try {
      const r = await api('/api/auth/setup', {
        displayName: $('#setupDisplay').value.trim(),
        username: $('#setupUser').value.trim(),
        password: p1,
      });
      auth = { authenticated: true, user: r.user, csrfToken: r.csrfToken };
      $('#setupPass').value = '';
      $('#setupPass2').value = '';
      toast('Administrator account created & system locked!');
      await enterApp();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.hidden = false;
    }
  };

  $('#logoutBtn').onclick = async () => {
    try { await api('/api/auth/logout', {}); } catch (_) {}
    auth = { authenticated: false, user: null, csrfToken: null };
    db = null;
    ed = null;
    showAuthGate(false);
  };

  $('#acctBtn').onclick = () => {
    modal(`
      <h3>🔑 Change Password (${esc(auth.user.username)})</h3>
      <label>Current Password<input type="password" id="cpCur"></label>
      <label>New Password (min 8 characters)<input type="password" id="cpNew"></label>
      <label>Confirm New Password<input type="password" id="cpNew2"></label>
      <div class="bar"><span class="sp"></span>
        <button id="cpCancel">Cancel</button>
        <button class="pri" id="cpSave">Update Password</button>
      </div>
    `);
    $('#cpCancel').onclick = closeModal;
    $('#cpSave').onclick = async () => {
      if ($('#cpNew').value !== $('#cpNew2').value) return toast('New passwords do not match.');
      try {
        await api('/api/auth/change-password', {
          currentPassword: $('#cpCur').value,
          newPassword: $('#cpNew').value,
        });
        closeModal();
        toast('Password updated.');
      } catch (err) { toast(err.message); }
    };
  };

  if (M.registerCommandPalette) {
    M.registerCommandPalette(() => ({
      db,
      auth,
      go,
      allTemplates,
      startTemplate: (tplId, lang) => { ed = newFromTemplate(tplId, lang); go('edit'); },
      openLetter: (id) => {
        const found = db && db.letters.find(x => x.id === id);
        if (found) { ed = JSON.parse(JSON.stringify(found)); go('edit'); }
      },
      scanInwardNow: () => { go('inw'); setTimeout(() => { if ($('#iScanBtn')) $('#iScanBtn').click(); }, 90); },
      exportMasterXlsx: () => downloadBinary('/api/export/register-xlsx', 'GET', null, `Letter_Register_${Core.todayISO()}.xlsx`),
    }));
  }

  async function enterApp() {
    db = await api('/api/db');
    $('#authGate').hidden = true;
    $('#appShell').hidden = false;
    $('#userLabel').textContent = `${auth.user.displayName} (${auth.user.role === 'admin' ? 'Admin' : 'Staff'})`;
    $('#navUsers').hidden = auth.user.role !== 'admin';
    if (window.hydrateIcons) window.hydrateIcons($('#appShell'));
    refreshChrome();
    go(curView || 'dash');
  }

  // ==================== TEMPLATE & PLACEHOLDER ENGINE ====================
  function allTemplates() {
    return [...window.TEMPLATES, ...(db.customTemplates || [])];
  }

  function findTpl(id) {
    return allTemplates().find(t => t.id === id);
  }

  function subPlaceholders(str, fields, sysCtx, tplFields = []) {
    return window.Tpl.render(str, fields, tplFields, sysCtx);
  }

  function applyTemplate(l) {
    const t = findTpl(l.tpl);
    if (!t) return;
    l.layout = t.layout;
    if (!l.majorHead) l.majorHead = t.majorHead || Core.inferMajorHead(t.id);
    const v = t[l.lang] || t.en;
    const nextPreview = Core.peekRef(db, 'out', l.date, l.majorHead).ref;
    const sysCtx = Core.buildPlaceholderContext(db, l, nextPreview);

    const fields = Object.assign({}, l.fields);
    (t.fields || []).forEach(f => {
      if (f.t === 'date' && fields[f.k]) fields[f.k] = Core.fmtDateDMY(fields[f.k]);
    });

    const recMap = {};
    (db.settings.recipients || []).forEach(r => { recMap[r.alias] = r[l.lang] || r.en; });
    if (v.to && recMap[v.to]) l.to = recMap[v.to];
    else l.to = subPlaceholders(v.to || '', fields, sysCtx, t.fields);

    l.heading = subPlaceholders(v.heading || '', fields, sysCtx, t.fields);
    l.subject = subPlaceholders(v.subject || '', fields, sysCtx, t.fields);
    l.salutation = subPlaceholders(v.salutation || '', fields, sysCtx, t.fields);
    l.closing = subPlaceholders(v.closing || '', fields, sysCtx, t.fields);
    l.body = subPlaceholders(v.body || '', fields, sysCtx, t.fields);
  }

  function resolveLiveTokens(l) {
    const nextPreview = Core.peekRef(db, 'out', l.date, l.majorHead).ref;
    const sysCtx = Core.buildPlaceholderContext(db, l, nextPreview);
    const out = Object.assign({}, l);
    ['to', 'heading', 'subject', 'salutation', 'body', 'closing', 'encl', 'cc'].forEach(k => {
      if (typeof out[k] === 'string') {
        out[k] = subPlaceholders(out[k], l.fields || {}, sysCtx);
      }
    });
    return out;
  }

  function newFromTemplate(tplId, lang = 'en') {
    const t = findTpl(tplId) || window.TEMPLATES[0];
    const S = db.settings;
    const l = {
      id: Core.uid(),
      tpl: t.id,
      lang,
      layout: t.layout,
      majorHead: t.majorHead || Core.inferMajorHead(t.id),
      subHead: '',
      date: Core.todayISO(),
      sig: S.defaultSignatory,
      showSign: S.defaultShowSign,
      showQr: t.layout === 'cert' ? true : S.defaultShowQr,
      fields: {},
      encl: '',
      cc: '',
      remarks: '',
      status: 'draft',
    };
    const sess = Core.sessionFromISO(l.date);
    (t.fields || []).forEach(f => {
      if (f.k === 'session' || f.k === 'fy') l.fields[f.k] = sess;
    });
    applyTemplate(l);
    return l;
  }

  function refreshChrome() {
    if (!db) return;
    $('#schoolTag').textContent = `${db.settings.school.en} · U-DISE ${db.settings.school.udise}`;
    $('#nextRef').textContent = Core.peekRef(db, 'out', Core.todayISO(), 'ADM').ref;
    const lb = db.settings.lastBackup;
    const days = lb ? Math.floor((Date.now() - lb) / 864e5) : null;
    $('#bakStatus').innerHTML = days === null
      ? '<span style="color:#c53030">⚠ Take backup</span>'
      : `Backup: ${days === 0 ? 'today' : days + 'd ago'}`;

    const apprCount = db.letters.filter(l => l.status === 'pending_approval').length;
    const apprBadge = $('#apprBadge');
    if (apprBadge) {
      apprBadge.textContent = apprCount;
      apprBadge.hidden = apprCount === 0;
    }

    const alertInwCount = db.inward.filter(r => {
      const m = Core.inwardDeadlineMeta(r);
      return m.overdue || m.dueSoon;
    }).length;
    const inwBadge = $('#inwAlertBadge');
    if (inwBadge) {
      inwBadge.textContent = alertInwCount;
      inwBadge.hidden = alertInwCount === 0;
    }
  }

  function go(v) {
    if (activeSpeechRec) { try { activeSpeechRec.stop(); } catch (_) {} activeSpeechRec = null; }
    curView = v;
    let activeBtn = null;
    $$('#nav button').forEach(b => {
      const isOn = b.dataset.v === v;
      b.classList.toggle('on', isOn);
      if (isOn) activeBtn = b;
    });
    if (M.moveNavIndicator) requestAnimationFrame(() => M.moveNavIndicator(activeBtn));

    const uiCtx = makeUiCtx();
    const views = {
      dash: viewDash,
      edit: viewEdit,
      approve: () => window.ModulesUI.renderApprovalQueueView(uiCtx),
      batch: () => window.ModulesUI.renderBatchMailMergeView(uiCtx),
      dir: () => window.ModulesUI.renderMasterDirectoryView(uiCtx),
      sheet: viewSheet,
      out: viewOut,
      inw: viewInw,
      analytics: () => window.ModulesUI.renderAnalyticsAuditView(uiCtx),
      tpl: viewTpl,
      users: viewUsers,
      set: viewSet,
    };
    const res = (views[v] || viewDash)();
    Promise.resolve(res).then(() => {
      if (M.animateViewEnter) M.animateViewEnter($('#view'));
    });
  }

  window.addEventListener('resize', () => {
    const activeBtn = $('#nav button.on');
    if (activeBtn && M.moveNavIndicator) M.moveNavIndicator(activeBtn, true);
  });

  $$('#nav button').forEach(b => { b.onclick = () => go(b.dataset.v); });

  function headOptionsHtml(selectedCode, includeAllLabel) {
    const heads = db.settings.majorHeads || Core.DEFAULT_MAJOR_HEADS;
    return (includeAllLabel ? `<option value="">${esc(includeAllLabel)}</option>` : '') +
      heads.map(h => `<option value="${esc(h.code)}" ${h.code === selectedCode ? 'selected' : ''}>${esc(h.code)} — ${esc(h.en)} (${esc(h.hi)})</option>`).join('');
  }

  // ==================== 1. DASHBOARD ====================
  function viewDash() {
    const yk = Core.yearKey(Core.todayISO(), db.settings.yearMode);
    const issuedThisYr = db.letters.filter(l => l.refYear === yk && l.status !== 'cancelled').length;
    const drafts = db.letters.filter(l => l.status === 'draft' || l.status === 'returned').length;
    const pendingAppr = db.letters.filter(l => l.status === 'pending_approval');
    const overdueInw = db.inward.filter(r => Core.inwardDeadlineMeta(r).overdue);
    const dueSoonInw = db.inward.filter(r => Core.inwardDeadlineMeta(r).dueSoon);
    const pendIn = db.inward.filter(r => r.status === 'pending').length;

    const recent = [...db.letters].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 8);

    const el = $('#view');
    el.innerHTML = `
      ${overdueInw.length ? `
        <div class="alert-banner danger">
          <div>${ico('AlertTriangle', 16)} <b>${overdueInw.length} Inward Letter(s) Overdue!</b> (${esc(overdueInw.map(r => `${r.no}: ${r.from}`).slice(0, 2).join(' · '))})</div>
          <button class="sm danger" id="goOverdueBtn">${ico('Inbox', 14)} Open Inward Escalations →</button>
        </div>
      ` : (dueSoonInw.length ? `
        <div class="alert-banner warn">
          <div>${ico('Clock', 16)} <b>${dueSoonInw.length} Inward Letter(s) Due Within 3 Days</b> — timely compliance recommended.</div>
          <button class="sm" id="goOverdueBtn">${ico('Inbox', 14)} View Inward Deadlines →</button>
        </div>
      ` : '')}

      ${pendingAppr.length ? `
        <div class="alert-banner info">
          <div>${ico('CheckCircle2', 16)} <b>${pendingAppr.length} Draft Letter(s) Waiting in Principal Approval Queue</b></div>
          <button class="sm pri" id="goApprBtn">${ico('Check', 14)} Open Approval Queue →</button>
        </div>
      ` : ''}

      <div class="bar">
        <div>
          <h2 style="margin:0">School Office Command Center</h2>
          <small class="mut">Real-time Correspondence, Certificate Registers &amp; SLA Compliance · Press <kbd class="kbd-tag">Ctrl K</kbd> to quick-jump</small>
        </div>
        <span class="sp"></span>
        <button class="pri" id="dNew">${ico('Plus', 15)} New Letter</button>
        <button class="ok" id="dBatch">${ico('Layers', 15)} Bulk Mail-Merge</button>
        <button id="dScan">${ico('ScanLine', 15)} Scan Inward (OCR)</button>
        <button id="dXlsx">${ico('FileSpreadsheet', 15)} Master Excel (.xlsx)</button>
      </div>

      <div class="stats">
        <div class="stat" data-go="sheet">
          <div class="stat-top">
            <div><b data-count="${issuedThisYr}">${issuedThisYr}</b><span>Issued in ${yk} · Next: ${esc(Core.peekRef(db, 'out', Core.todayISO(), 'ADM').ref)}</span></div>
            <span class="stat-ico">${ico('ShieldCheck', 18)}</span>
          </div>
        </div>
        <div class="stat accent-indigo" data-go="approve">
          <div class="stat-top">
            <div><b data-count="${pendingAppr.length}">${pendingAppr.length}</b><span>Approval Queue (अनुमोदन कतार)</span></div>
            <span class="stat-ico">${ico('CheckCircle2', 18)}</span>
          </div>
        </div>
        <div class="stat accent-emerald" data-go="dir">
          <div class="stat-top">
            <div><b data-count="${db.students.length + db.staff.length}">${db.students.length + db.staff.length}</b><span>Students (${db.students.length}) &amp; Staff (${db.staff.length})</span></div>
            <span class="stat-ico">${ico('GraduationCap', 18)}</span>
          </div>
        </div>
        <div class="stat accent-amber" data-go="inw">
          <div class="stat-top">
            <div><b data-count="${pendIn}">${pendIn}</b><span>Inward Replies Pending (${overdueInw.length} Overdue)</span></div>
            <span class="stat-ico">${ico('Inbox', 18)}</span>
          </div>
        </div>
        <div class="stat" data-go="out" data-s="draft">
          <div class="stat-top">
            <div><b data-count="${drafts}">${drafts}</b><span>Saved Drafts</span></div>
            <span class="stat-ico">${ico('FilePenLine', 18)}</span>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="bar">
          <h3 style="margin:0">Recent Letters &amp; Certificates</h3>
          <span class="sp"></span>
          <button class="sm" id="goAnalyticsBtn">${ico('BarChart3', 14)} View Full Analytics &amp; Audit →</button>
        </div>
        ${recent.length ? `<div class="table-wrap"><table class="tbl">
          <thead><tr><th>Ref. No.</th><th>Date</th><th>Major Head</th><th>Recipient / Party</th><th>Subject</th><th>Status</th><th></th></tr></thead>
          <tbody class="auto-anim">${recent.map(l => `<tr>
            <td><b>${esc(l.ref || '—')}</b></td>
            <td>${esc(Core.fmtDateDMY(l.date))}</td>
            <td><span class="pill p-head">${esc(l.majorHead || 'ADM')}</span></td>
            <td>${esc((l.to || '').split('\n')[0] || (l.fields && l.fields.name) || '—')}</td>
            <td>${esc(l.subject || l.heading || '(no subject)')}</td>
            <td><span class="pill p-${l.status}">${esc(l.status)}</span></td>
            <td><button class="sm" data-open="${l.id}">Open</button></td>
          </tr>`).join('')}</tbody></table></div>`
        : '<p class="mut">No letters yet. Click <b>+ New Letter</b> or <b>Bulk Mail-Merge</b>.</p>'}
      </div>
    `;

    if ($('#goOverdueBtn')) $('#goOverdueBtn').onclick = () => { inwF.status = 'pending'; go('inw'); };
    if ($('#goApprBtn')) $('#goApprBtn').onclick = () => go('approve');
    $('#goAnalyticsBtn').onclick = () => go('analytics');
    $('#dNew').onclick = () => { ed = newFromTemplate('req', 'en'); go('edit'); };
    $('#dBatch').onclick = () => go('batch');
    $('#dScan').onclick = () => { go('inw'); setTimeout(() => { if ($('#iScanBtn')) $('#iScanBtn').click(); }, 80); };
    $('#dXlsx').onclick = () => downloadBinary('/api/export/register-xlsx', 'GET', null, `Letter_Register_${Core.todayISO()}.xlsx`);

    $$('[data-go]', el).forEach(s => s.onclick = () => {
      if (s.dataset.s !== undefined) outF.status = s.dataset.s;
      go(s.dataset.go);
    });
    $$('[data-open]', el).forEach(b => b.onclick = () => {
      ed = JSON.parse(JSON.stringify(db.letters.find(x => x.id === b.dataset.open)));
      go('edit');
    });
  }

  // ==================== 2. LIVE LETTERPREVIEW + QR ====================
  function renderPaper(rawLetter) {
    const l = resolveLiveTokens(rawLetter);
    const S = db.settings;
    const L = LBL[l.lang] || LBL.en;
    const sg = S.signatories.find(x => x.id === l.sig) || S.signatories[0] || {};
    const hi = l.lang === 'hi';
    const refShown = l.ref || `${Core.peekRef(db, 'out', l.date, l.majorHead).ref} (preview)`;
    const mark = s => esc(s).replace(/‹([^›]+)›/g, '<span class="unfilled">[$1]</span>');

    let lhHtml = '';
    if (S.preprinted) lhHtml = `<div class="lh-spacer"></div>`;
    else if (S.letterhead) lhHtml = `<div class="lh"><img src="${esc(S.letterhead)}" alt="Letterhead"></div>`;
    else lhHtml = `<div class="lh-text"><h1>${esc(S.school.name)}</h1><div>${esc(S.school.addressEn)}</div></div>`;

    const paras = (l.body || '').split(/\n{2,}/).map(p => `<p>${mark(p)}</p>`).join('');
    const chosenStamp = l.customStamp || sg.stamp;
    const showStampNow = (l.showSign || l.customStamp) && chosenStamp;
    const sigImg = showStampNow ? `<img class="stamp" src="${esc(chosenStamp)}" alt="Signature">` : `<div class="space"></div>`;
    const sigName = hi ? (sg.nameHi || sg.name) : sg.name;
    const sigDesig = hi ? (sg.designationHi || sg.designation) : sg.designation;
    const sigOrg = hi ? (sg.orgHi || sg.org) : sg.org;
    const wmark = l.status === 'cancelled' ? '<div class="wmark">CANCELLED</div>' : '';

    const mhObj = Core.getMajorHeadObj(db, l.majorHead);
    const headLine = (S.showMajorHeadOnLetter || l.subHead)
      ? `<div class="meta-head">${L.head} ${esc([mhObj ? (hi ? mhObj.hi : mhObj.en) : '', l.subHead].filter(Boolean).join(' / '))}</div>`
      : '';

    const qrInfo = l.ref ? cachedQrMap[l.id] : null;
    const qrHtml = (l.showQr !== false && l.ref && qrInfo && qrInfo.qrDataUrl)
      ? `<div class="qr-box"><img src="${esc(qrInfo.qrDataUrl)}" alt="Verify QR"><b>${hi ? 'सत्यापित दस्तावेज़' : 'Verified Document'}</b><br><span>Code: ${esc(qrInfo.verifyCode)}</span></div>`
      : (l.showQr !== false && !l.ref ? `<div class="qr-box" style="border:1px dashed #94a3b8;padding:6px;border-radius:6px">🛡 <b>QR Code</b><br><small>Auto-generated upon Ref. No. Issue</small></div>` : '<div></div>');

    return `
      <div id="paper" class="${hi ? 'hi' : ''} ${S.fontFamily === 'mukta' ? 'f-mukta' : ''} ${l.layout === 'cert' && !S.preprinted ? 'cert-border' : ''}"
           style="--fpt:${S.fontPt}pt;--topmm:${S.topMm}mm">
        ${wmark}
        ${lhHtml}
        <div class="meta">
          <div>${L.ref} ${esc(refShown)}</div>
          <div>${L.date} ${esc(Core.fmtDateDMY(l.date))}</div>
        </div>
        ${headLine}
        ${l.layout === 'letter' && l.to ? `<div class="to"><b>${L.to}</b>\n${mark(l.to)}</div>` : ''}
        ${(l.layout === 'notice' || l.layout === 'cert') && l.heading ? `<div class="heading">${mark(l.heading)}</div>` : ''}
        ${l.subject ? `<div class="subj ${l.layout !== 'letter' ? 'center' : ''}">${l.layout === 'letter' ? L.subj + ' ' : ''}${mark(l.subject)}</div>` : ''}
        ${l.layout === 'notice' && l.to ? `<div class="subj center">${mark(l.to)}</div>` : ''}
        ${l.layout === 'letter' && l.salutation ? `<div class="sal">${mark(l.salutation)}</div>` : ''}
        <div class="body">${paras}</div>
        <div class="foot-grid ${S.sigAlign === 'left' ? 'sig-left' : ''}">
          ${qrHtml}
          <div class="sig ${S.sigAlign === 'left' ? 'left' : ''}">
            ${l.layout === 'letter' && l.closing ? `<div>${mark(l.closing)}</div>` : ''}
            ${sigImg}
            ${sigName ? `<div><b>(${esc(sigName)})</b></div>` : ''}
            ${(!showStampNow || l.customStamp) && sigDesig ? `<div>${esc(sigDesig)}</div>` : ''}
            ${(!showStampNow || l.customStamp) && sigOrg ? `<div>${esc(sigOrg)}</div>` : ''}
          </div>
        </div>
        ${l.encl ? `<div class="encl"><b>${L.encl}</b> ${mark(l.encl)}</div>` : ''}
        ${l.cc ? `<div class="cc"><b>${L.cc}</b>\n${mark(l.cc)}</div>` : ''}
      </div>`;
  }

  async function ensureQrLoadedForLetter(l) {
    if (!l || !l.ref || l.showQr === false || cachedQrMap[l.id]) return;
    try {
      const info = await api(`/api/letter/${encodeURIComponent(l.id)}/qr`);
      if (info && info.issued) {
        cachedQrMap[l.id] = info;
        if (curView === 'edit' && ed && ed.id === l.id && $('#pvHost')) {
          $('#pvHost').innerHTML = renderPaper(ed);
        }
      }
    } catch (_) {}
  }

  // ==================== 3. DRAFT LETTER STUDIO ====================
  function viewEdit() {
    if (!ed) ed = newFromTemplate('req', 'en');
    const t = findTpl(ed.tpl);
    const issued = !!ed.ref;
    const isAdmin = auth.user && auth.user.role === 'admin';
    const mustRouteApproval = db.settings.requireApprovalForStaff && !isAdmin;
    const el = $('#view');

    if (issued) ensureQrLoadedForLetter(ed);

    el.innerHTML = `
      <div class="bar noprint">
        <button id="eSave">${ico('Check', 14)} Save</button>
        ${!issued && !mustRouteApproval ? `<button class="pri" id="eIssue">${ico('ShieldCheck', 15)} Issue Ref. No. (${esc(Core.peekRef(db, 'out', ed.date, ed.majorHead).ref)})</button>` : ''}
        ${!issued && ed.status !== 'pending_approval' ? `<button class="${mustRouteApproval ? 'pri' : 'warn-btn'}" id="eSendAppr">${ico('Send', 14)} Send for Principal Approval</button>` : ''}
        ${!issued && ed.status === 'pending_approval' && isAdmin ? `<button class="ok" id="eApproveNow">${ico('ShieldCheck', 15)} Principal Approve &amp; Issue</button>` : ''}
        <button class="ok" id="eDocx" title="Download Editable Microsoft Word (.docx)">${ico('FileText', 14)} Word (.docx)</button>
        <button class="pri" id="ePdf" title="Download Font-Embedded Server PDF (.pdf)">${ico('Download', 14)} PDF (.pdf)</button>
        <button id="ePrint" title="Direct Browser Print">${ico('Printer', 14)} Print</button>
        ${issued ? `<button id="eShareWa" title="Share via WhatsApp / Email">${ico('Share2', 14)} Share</button>` : ''}
        <button id="eLiveSign" title="Sign on Screen with Mouse/Touch">${ico('PenTool', 14)} Live Sign</button>
        <button id="eDup" title="Duplicate as New Draft">${ico('Copy', 14)} Copy</button>
        ${issued && ed.status !== 'cancelled' && isAdmin ? `<button class="danger" id="eCancel">Cancel Letter</button>` : ''}
        <span class="sp"></span>
        <span class="pill p-${ed.status}">${esc(ed.ref ? ed.status + ' · ' + ed.ref : ed.status)}</span>
      </div>

      ${ed.status === 'returned' && ed.approvalNote ? `<div class="warn noprint">↩ <b>Returned by Principal for Revision:</b> ${esc(ed.approvalNote)}</div>` : ''}
      ${issued ? `<div class="warn noprint">${ico('Lock', 14)} Official Ref. No. <b>${esc(ed.ref)}</b> is permanently locked &amp; HMAC-signed.</div>` : ''}

      <div class="editor">
        <div class="ed-pane noprint">
          <div class="card">
            <h3><span class="step-badge">01</span> Classification, Template &amp; Language</h3>
            <div class="row g">
              <label>Template / पत्र प्रारूप
                <select id="eTpl">
                  ${allTemplates().map(x => `<option value="${esc(x.id)}" ${x.id === ed.tpl ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}
                </select>
              </label>
              <label>Language / भाषा
                <select id="eLang">
                  <option value="en" ${ed.lang === 'en' ? 'selected' : ''}>English</option>
                  <option value="hi" ${ed.lang === 'hi' ? 'selected' : ''}>हिंदी (Devanagari)</option>
                </select>
              </label>
            </div>
            <div class="row g">
              <label>Major Head (मुख्य शीर्ष / मद) *
                <select id="eHead">${headOptionsHtml(ed.majorHead || 'ADM')}</select>
              </label>
              <label>Sub-Head / File No. (उप-शीर्ष / संचिका)
                <input id="eSubHead" value="${esc(ed.subHead || '')}" placeholder="e.g. Scholarship / CBSE-2026">
              </label>
            </div>
            <div class="row g">
              <label>Letter Date (दिनांक)
                <input type="date" id="eDate" value="${esc(ed.date)}">
              </label>
              <label>Layout
                <select id="eLay">
                  <option value="letter" ${ed.layout === 'letter' ? 'selected' : ''}>Official Letter</option>
                  <option value="notice" ${ed.layout === 'notice' ? 'selected' : ''}>Notice / Office Order</option>
                  <option value="cert" ${ed.layout === 'cert' ? 'selected' : ''}>Certificate (Framed)</option>
                </select>
              </label>
            </div>
          </div>

          <div class="card" id="fieldsCard" ${t && t.fields && t.fields.length ? '' : 'hidden'}>
            <div class="bar" style="margin-bottom:8px">
              <h3 style="margin:0"><span class="step-badge">02</span> Template Details (विवरण भरें)</h3>
              <span class="sp"></span>
              <button class="sm" id="eReapply">${ico('RefreshCw', 13)} Regenerate Text</button>
            </div>

            <!-- MODULE 1: STUDENT / STAFF DIRECTORY INSTANT AUTO-FILL -->
            <div class="autofill-box">
              <div style="font-size:12px;font-weight:700;color:#059669;margin-bottom:4px">${ico('GraduationCap', 14)} Auto-Fill from Student / Staff Master Directory (${db.students.length} Students · ${db.staff.length} Staff)</div>
              <input id="afInput" placeholder="Type Student Name, Admission No., Roll No., or Staff Name to auto-fill all fields…">
              <div id="afDrop" class="af-results" hidden></div>
              <div id="afDupWarn" style="margin-top:6px;font-size:12px;color:#b45309" hidden></div>
            </div>

            <div id="fieldsHost"></div>
          </div>

          <div class="card">
            <div class="bar" style="margin-bottom:8px">
              <h3 style="margin:0"><span class="step-badge">03</span> Smart Bilingual Drafting Studio</h3>
              <span class="sp"></span>
              <button class="sm" id="btnVoice" title="Speak in Hindi or English to dictate directly into cursor">${ico('Mic', 13)} Voice Dictate</button>
              <button class="sm ${phoneticMode ? 'pri' : ''}" id="btnPhonetic" title="Type Roman Hindi e.g. 'savinya nivedan' + Space -> सविनय निवेदन">${ico('Keyboard', 13)} Phonetic हिंदी: ${phoneticMode ? 'ON' : 'OFF'}</button>
              <button class="sm" id="btnPhrasebook" title="Insert from 80+ Official Sarkari Phrases">${ico('BookOpen', 13)} Phrasebook</button>
              <button class="sm" id="btnKruti" title="Convert legacy KrutiDev-010 text to Unicode">${ico('Languages', 13)} KrutiDev</button>
            </div>

            <div class="ph-box">
              <small class="mut"><b>Click any System Placeholder</b> to insert live token at cursor:</small>
              <div class="ph-chips">
                ${Core.SYSTEM_PLACEHOLDERS.map(p => `<span class="ph-chip" data-ins="{{${p.key}}}" title="${esc(p.label)}">{{${esc(p.key)}}}</span>`).join('')}
              </div>
            </div>

            <div id="toWrap" ${ed.layout === 'cert' ? 'hidden' : ''}>
              <div class="row" style="margin-bottom:4px">
                <label style="flex:1;margin:0">Recipient / प्राप्तकर्ता</label>
                <select id="eQuickTo" style="width:auto">
                  <option value="">Quick Recipient…</option>
                  ${db.settings.recipients.map(r => `<option value="${esc(r.alias)}">${esc(r.alias.toUpperCase())} — ${esc((r[ed.lang] || r.en).split('\n')[0])}</option>`).join('')}
                </select>
              </div>
              <textarea id="eTo" rows="3">${esc(ed.to || '')}</textarea>
            </div>

            <label id="headWrap" ${ed.layout === 'letter' ? 'hidden' : ''} style="margin-top:8px">Heading / शीर्षक
              <input id="eHeading" value="${esc(ed.heading || '')}">
            </label>
            <label style="margin-top:8px">Subject / विषय
              <input id="eSubj" value="${esc(ed.subject || '')}">
            </label>
            <label id="salWrap" ${ed.layout !== 'letter' ? 'hidden' : ''}>Salutation / संबोधन
              <input id="eSal" value="${esc(ed.salutation || '')}">
            </label>
            <label>Body / मुख्य विषय-वस्तु (blank line = new paragraph)
              <textarea id="eBody" rows="10">${esc(ed.body || '')}</textarea>
            </label>
            <div class="row g">
              <label id="closeWrap" ${ed.layout !== 'letter' ? 'hidden' : ''}>Closing / समापन
                <input id="eClose" value="${esc(ed.closing || '')}">
              </label>
              <label>Signatory / हस्ताक्षरकर्ता
                <select id="eSig">
                  ${db.settings.signatories.map(s => `<option value="${esc(s.id)}" ${s.id === ed.sig ? 'selected' : ''}>${esc(s.name)} (${esc(s.designation)})</option>`).join('')}
                </select>
              </label>
            </div>
            <div class="bar" style="margin:4px 0 8px">
              <label class="chk"><input type="checkbox" id="eStamp" ${ed.showSign ? 'checked' : ''}> Show Signatory Stamp</label>
              <label class="chk"><input type="checkbox" id="eQr" ${ed.showQr !== false ? 'checked' : ''}> Attach Tamper-Proof QR Verification</label>
              ${ed.customStamp ? `<button class="sm danger" id="clearLiveSign">✖ Clear Custom Live Sign</button>` : ''}
            </div>
            <label>Enclosure(s) / संलग्नक
              <input id="eEncl" value="${esc(ed.encl || '')}" placeholder="e.g. 1. Utilization Statement (2 pages)">
            </label>
            <label>Copy Forwarded To (CC) / प्रतिलिपि
              <textarea id="eCc" rows="2" placeholder="1. DEO, Dumka for kind information.">${esc(ed.cc || '')}</textarea>
            </label>
            <label>Register Remarks / Internal Note (पंजी टिप्पणी)
              <input id="eRem" value="${esc(ed.remarks || '')}" placeholder="Internal office note (saved in Excel register, not printed)">
            </label>
          </div>
        </div>

        <div class="pv-wrap">
          <div class="mut noprint pv-tools">
            <span>Live A4 Print Canvas · Yellow <code>[tags]</code> = unfilled · Font: <b>${db.settings.fontFamily === 'mukta' ? 'Mukta' : 'Karma'}</b></span>
            <div class="zoom-seg" role="group" aria-label="A4 Preview Zoom">
              ${[0.75, 0.9, 1].map(z => `<button type="button" data-zoom="${z}" class="${paperZoom === z ? 'on' : ''}">${Math.round(z * 100)}%</button>`).join('')}
            </div>
          </div>
          <div class="pv-desk">
            <div id="pvHost" style="zoom:${paperZoom}">${renderPaper(ed)}</div>
          </div>
        </div>
      </div>`;

    const paint = () => { $('#pvHost').innerHTML = renderPaper(ed); };

    $$('[data-zoom]', el).forEach(zb => {
      zb.onclick = () => {
        paperZoom = parseFloat(zb.dataset.zoom) || 1;
        $('#pvHost').style.zoom = String(paperZoom);
        $$('[data-zoom]', el).forEach(b => b.classList.toggle('on', b === zb));
      };
    });

    const buildFields = () => {
      const tp = findTpl(ed.tpl);
      const host = $('#fieldsHost');
      const card = $('#fieldsCard');
      if (!tp || !tp.fields || !tp.fields.length) { card.hidden = true; return; }
      card.hidden = false;
      host.innerHTML = tp.fields.map(f => {
        const val = ed.fields[f.k] ?? '';
        const req = f.opt ? '' : ' *';
        if (f.t === 'area') return `<label>${esc(f.l)}${req}<textarea data-fk="${esc(f.k)}" rows="2" placeholder="${esc(f.ph || '')}">${esc(val)}</textarea></label>`;
        if (f.t === 'date') return `<label>${esc(f.l)}${req}<input type="date" data-fk="${esc(f.k)}" value="${esc(val)}"></label>`;
        if (f.t === 'select') return `<label>${esc(f.l)}${req}<select data-fk="${esc(f.k)}">${(f.opts || []).map(o => `<option ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
        return `<label>${esc(f.l)}${req}<input data-fk="${esc(f.k)}" value="${esc(val)}" placeholder="${esc(f.ph || '')}"></label>`;
      }).join('');

      $$('[data-fk]', host).forEach(inp => {
        window.DraftStudio.attachPhoneticListener(inp, () => phoneticMode, () => {
          ed.fields[inp.dataset.fk] = inp.value;
          applyTemplate(ed);
          syncTextInputs();
          paint();
        });
        inp.oninput = () => {
          ed.fields[inp.dataset.fk] = inp.value;
          applyTemplate(ed);
          syncTextInputs();
          paint();
        };
      });
    };

    const syncTextInputs = () => {
      $('#eTo').value = ed.to || '';
      $('#eHeading').value = ed.heading || '';
      $('#eSubj').value = ed.subject || '';
      $('#eSal').value = ed.salutation || '';
      $('#eBody').value = ed.body || '';
      $('#eClose').value = ed.closing || '';
      $('#toWrap').hidden = ed.layout === 'cert';
      $('#headWrap').hidden = ed.layout === 'letter';
      $('#salWrap').hidden = ed.layout !== 'letter';
      $('#closeWrap').hidden = ed.layout !== 'letter';
    };

    buildFields();

    // Directory Fuzzy Auto-Fill Handler
    const afInput = $('#afInput');
    const afDrop = $('#afDrop');
    const afDupWarn = $('#afDupWarn');

    const checkDuplicateHistory = (person) => {
      const prevSameTpl = db.letters.filter(l =>
        l.ref && l.status !== 'cancelled' && l.tpl === ed.tpl && (
          (l.personRef && l.personRef.id === person.id) ||
          (l.fields && (l.fields.name === person.name || (person.admNo && l.fields.adm === person.admNo)))
        )
      );
      if (prevSameTpl.length) {
        const last = prevSameTpl[prevSameTpl.length - 1];
        afDupWarn.innerHTML = `⚠️ <b>Duplicate Alert:</b> This exact template was already issued to <b>${esc(person.name)}</b> under Ref. No. <b>${esc(last.ref)}</b> on ${esc(Core.fmtDateDMY(last.date))}.`;
        afDupWarn.hidden = false;
      } else {
        afDupWarn.hidden = true;
      }
    };

    if (ed.personRef) {
      const p = (ed.personRef.type === 'staff' ? db.staff : db.students).find(x => x.id === ed.personRef.id);
      if (p) checkDuplicateHistory(p);
    }

    if (afInput) {
      afInput.oninput = () => {
        const q = afInput.value.trim();
        if (!q) { afDrop.hidden = true; return; }
        const combined = [
          ...db.students.map(s => ({ kind: 'students', badge: '🎓 Student', code: s.admNo || s.rollNo, sub: `${s.cls || ''} · F: ${s.father || ''}`, item: s })),
          ...db.staff.map(s => ({ kind: 'staff', badge: '👩‍🏫 Staff', code: s.empId, sub: `${s.designation || ''} · ${s.subject || ''}`, item: s })),
        ];
        let hits = [];
        if (window.Fuse) {
          const fuse = new window.Fuse(combined, { keys: ['code', 'item.name', 'item.nameHi', 'item.father', 'item.cls', 'item.designation'], threshold: 0.36 });
          hits = fuse.search(q).slice(0, 8).map(r => r.item);
        } else {
          hits = combined.filter(c => JSON.stringify(c).toLowerCase().includes(q.toLowerCase())).slice(0, 8);
        }
        if (!hits.length) {
          afDrop.innerHTML = '<div class="af-item mut">No matching student or staff in Master Directory.</div>';
          afDrop.hidden = false;
          return;
        }
        afDrop.innerHTML = hits.map((h, idx) => `
          <div class="af-item" data-afidx="${idx}">
            <b>${esc(h.badge)}: ${esc(h.item.name)}</b> ${h.item.nameHi ? `(${esc(h.item.nameHi)})` : ''} — <code>${esc(h.code || '—')}</code>
            <div class="mut">${esc(h.sub)}</div>
          </div>
        `).join('');
        afDrop.hidden = false;
        $$('[data-afidx]', afDrop).forEach(rowEl => {
          rowEl.onclick = () => {
            const chosen = hits[+rowEl.dataset.afidx];
            const mapped = window.ModulesUI.mapPersonToFields(chosen.item, chosen.kind, ed.lang, {
              purpose: ed.fields.purpose || 'Scholarship / Academic Verification',
              session: Core.sessionFromISO(ed.date),
            });
            ed.fields = Object.assign(ed.fields || {}, mapped);
            ed.personRef = { type: chosen.kind === 'staff' ? 'staff' : 'student', id: chosen.item.id, code: chosen.code || '', name: chosen.item.name };
            applyTemplate(ed);
            buildFields();
            syncTextInputs();
            paint();
            afDrop.hidden = true;
            afInput.value = `${chosen.item.name} (${chosen.code || 'Selected'})`;
            checkDuplicateHistory(chosen.item);
            toast(`Auto-filled details for ${chosen.item.name}!`);
          };
        });
      };
    }

    // Track focused text input & attach Phonetic Hindi typing listener
    ['eTo', 'eHeading', 'eSubj', 'eSal', 'eBody', 'eClose', 'eEncl', 'eCc'].forEach(id => {
      const inp = $('#' + id);
      if (inp) {
        inp.addEventListener('focus', () => { activeFocusField = inp; });
        window.DraftStudio.attachPhoneticListener(inp, () => phoneticMode, () => {
          inp.dispatchEvent(new Event('input'));
        });
      }
    });

    $$('[data-ins]', el).forEach(chip => {
      chip.onclick = () => {
        const target = activeFocusField || $('#eBody');
        const tok = chip.dataset.ins;
        const start = target.selectionStart ?? target.value.length;
        const end = target.selectionEnd ?? target.value.length;
        target.value = target.value.slice(0, start) + tok + target.value.slice(end);
        target.dispatchEvent(new Event('input'));
        target.focus();
      };
    });

    // MODULE 6: Voice Dictation (Web Speech API hi-IN / en-IN)
    $('#btnVoice').onclick = () => {
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRec) {
        return toast('Browser Voice Dictation works in Chrome / Edge desktop & Android.');
      }
      if (activeSpeechRec) {
        activeSpeechRec.stop();
        activeSpeechRec = null;
        $('#btnVoice').classList.remove('voice-on');
        $('#btnVoice').textContent = '🎙 Voice Dictate';
        return;
      }
      const rec = new SpeechRec();
      rec.lang = ed.lang === 'hi' ? 'hi-IN' : 'en-IN';
      rec.continuous = true;
      rec.interimResults = false;
      rec.onresult = (ev) => {
        let transcript = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          if (ev.results[i].isFinal) transcript += ev.results[i][0].transcript + ' ';
        }
        if (transcript) {
          const target = activeFocusField || $('#eBody');
          const pos = target.selectionStart ?? target.value.length;
          target.value = target.value.slice(0, pos) + transcript + target.value.slice(pos);
          target.dispatchEvent(new Event('input'));
        }
      };
      rec.onend = () => {
        activeSpeechRec = null;
        if ($('#btnVoice')) {
          $('#btnVoice').classList.remove('voice-on');
          $('#btnVoice').textContent = '🎙 Voice Dictate';
        }
      };
      rec.onerror = (e) => toast('Voice Dictation: ' + (e.error || 'stopped'));
      activeSpeechRec = rec;
      $('#btnVoice').classList.add('voice-on');
      $('#btnVoice').textContent = `🔴 Listening (${rec.lang})…`;
      rec.start();
    };

    // MODULE 6: Phonetic Toggle
    $('#btnPhonetic').onclick = () => {
      phoneticMode = !phoneticMode;
      $('#btnPhonetic').classList.toggle('pri', phoneticMode);
      $('#btnPhonetic').textContent = `⌨ Phonetic हिंदी: ${phoneticMode ? 'ON' : 'OFF'}`;
      toast(phoneticMode ? 'Phonetic Hindi ON: Type Roman words + Space (e.g. savinya nivedan)!' : 'Phonetic Hindi OFF');
    };

    // MODULE 6: 80+ Sarkari Phrasebook
    $('#btnPhrasebook').onclick = () => {
      window.ModulesUI.openPhrasebookModal(makeUiCtx(), ed.lang, (phrase, targetKind) => {
        const target = targetKind === 'cc' ? $('#eCc') : (activeFocusField || $('#eBody'));
        const pos = target.selectionStart ?? target.value.length;
        const prefix = target.value && !target.value.endsWith(' ') && !target.value.endsWith('\n') ? ' ' : '';
        target.value = target.value.slice(0, pos) + prefix + phrase + target.value.slice(pos);
        target.dispatchEvent(new Event('input'));
      });
    };

    // KrutiDev -> Unicode Converter
    $('#btnKruti').onclick = () => {
      modal(`
        <h3>🔤 KrutiDev-010 → Unicode Hindi Converter</h3>
        <label>Legacy KrutiDev Text<textarea id="kdIn" rows="5" placeholder="Paste KrutiDev text here…"></textarea></label>
        <label>Converted Clean Unicode Devanagari<textarea id="kdOut" rows="5"></textarea></label>
        <div class="bar">
          <button id="kdConv" class="pri">Convert Now</button>
          <button id="kdInsert" class="ok">Insert into Letter Body</button>
          <span class="sp"></span>
          <button id="kdClose">Close</button>
        </div>
      `);
      $('#kdIn').oninput = () => { $('#kdOut').value = window.krutidevToUnicode($('#kdIn').value); };
      $('#kdConv').onclick = () => { $('#kdOut').value = window.krutidevToUnicode($('#kdIn').value); };
      $('#kdInsert').onclick = () => {
        const u = $('#kdOut').value || window.krutidevToUnicode($('#kdIn').value);
        if (u) {
          ed.body = (ed.body ? ed.body + '\n\n' : '') + u;
          $('#eBody').value = ed.body;
          paint();
        }
        closeModal();
      };
      $('#kdClose').onclick = closeModal;
    };

    // Live Signature Pad inside Editor
    $('#eLiveSign').onclick = () => {
      window.ModulesUI.openSignaturePadModal(makeUiCtx(), {
        title: 'Sign This Document Live',
        onSigned: async (dataUrl) => {
          const up = await api('/api/upload-image', { dataUrl, kind: 'livesign' });
          ed.customStamp = up.url;
          ed.showSign = true;
          viewEdit();
          toast('Live digital signature applied!');
        },
      });
    };
    if ($('#clearLiveSign')) {
      $('#clearLiveSign').onclick = () => { delete ed.customStamp; viewEdit(); };
    }

    $('#eTpl').onchange = e => {
      ed.tpl = e.target.value;
      const nt = findTpl(ed.tpl);
      if (nt && nt.majorHead) { ed.majorHead = nt.majorHead; $('#eHead').value = ed.majorHead; }
      applyTemplate(ed);
      buildFields();
      syncTextInputs();
      paint();
    };
    $('#eLang').onchange = e => { ed.lang = e.target.value; applyTemplate(ed); syncTextInputs(); paint(); };
    $('#eHead').onchange = e => { ed.majorHead = e.target.value; paint(); };
    $('#eSubHead').oninput = e => { ed.subHead = e.target.value; paint(); };
    $('#eDate').onchange = e => { ed.date = e.target.value; paint(); };
    $('#eLay').onchange = e => { ed.layout = e.target.value; syncTextInputs(); paint(); };
    $('#eReapply').onclick = () => { applyTemplate(ed); syncTextInputs(); paint(); toast('Template text regenerated.'); };
    $('#eQuickTo').onchange = e => {
      const r = db.settings.recipients.find(x => x.alias === e.target.value);
      if (r) { ed.to = r[ed.lang] || r.en; $('#eTo').value = ed.to; paint(); }
      e.target.value = '';
    };

    const bind = (sel, key) => { $(sel).oninput = e => { ed[key] = e.target.value; paint(); }; };
    bind('#eTo', 'to'); bind('#eHeading', 'heading'); bind('#eSubj', 'subject');
    bind('#eSal', 'salutation'); bind('#eBody', 'body'); bind('#eClose', 'closing');
    bind('#eEncl', 'encl'); bind('#eCc', 'cc'); bind('#eRem', 'remarks');
    $('#eSig').onchange = e => { ed.sig = e.target.value; paint(); };
    $('#eStamp').onchange = e => { ed.showSign = e.target.checked; paint(); };
    $('#eQr').onchange = e => { ed.showQr = e.target.checked; paint(); };

    const checkUnfilled = () => {
      const resolved = resolveLiveTokens(ed);
      return [resolved.to, resolved.heading, resolved.subject, resolved.body].some(s => /‹[^›]+›/.test(s || ''));
    };

    $('#eSave').onclick = async () => {
      ed = await op('saveLetter', ed);
      toast('Saved & synced to Master Register.');
      viewEdit();
    };

    if ($('#eIssue')) $('#eIssue').onclick = async () => {
      if (checkUnfilled() && !confirm('Some [placeholders] are still unfilled. Issue official Ref. No. anyway?')) return;
      const next = Core.peekRef(db, 'out', ed.date, ed.majorHead).ref;
      if (!confirm(`Assign Official Ref. No. ${next} under Major Head [${ed.majorHead}]?`)) return;
      ed = await op('saveLetter', ed);
      ed = await op('issueLetter', { id: ed.id, date: ed.date });
      const resolved = resolveLiveTokens(ed);
      Object.assign(ed, { to: resolved.to, heading: resolved.heading, subject: resolved.subject, body: resolved.body });
      ed = await op('saveLetter', ed);
      toast(`Issued Official Ref. No. ${ed.ref}`);
      viewEdit();
      if (M.playSealIssuedEffect) setTimeout(() => M.playSealIssuedEffect(ed.ref), 60);
    };

    if ($('#eSendAppr')) $('#eSendAppr').onclick = async () => {
      const note = prompt('Optional note for Principal (प्राचार्य के लिए संक्षिप्त टिप्पणी):', '') ?? '';
      ed = await op('saveLetter', ed);
      ed = await op('submitForApproval', { id: ed.id, note });
      toast('Sent to Principal Approval Queue!');
      viewEdit();
    };

    if ($('#eApproveNow')) $('#eApproveNow').onclick = async () => {
      const next = Core.peekRef(db, 'out', ed.date, ed.majorHead).ref;
      if (!confirm(`Approve & Issue Official Ref. No. ${next}?`)) return;
      ed = await op('saveLetter', ed);
      ed = await op('approveAndIssueLetter', { id: ed.id, date: ed.date, showSign: true });
      const resolved = resolveLiveTokens(ed);
      Object.assign(ed, { to: resolved.to, heading: resolved.heading, subject: resolved.subject, body: resolved.body });
      ed = await op('saveLetter', ed);
      toast(`Approved & Issued Ref. No. ${ed.ref}`);
      viewEdit();
      if (M.playSealIssuedEffect) setTimeout(() => M.playSealIssuedEffect(ed.ref), 60);
    };

    $('#eDocx').onclick = () => {
      const payload = resolveLiveTokens(ed);
      downloadBinary('/api/export/docx', 'POST', { letter: payload }, `Letter_${ed.ref || 'Draft'}.docx`);
    };

    $('#ePdf').onclick = () => {
      const payload = resolveLiveTokens(ed);
      downloadBinary('/api/export/pdf', 'POST', { letter: payload }, `Letter_${ed.ref || 'Draft'}.pdf`);
    };

    $('#ePrint').onclick = async () => {
      if (!ed.ref && !confirm('Print without an official Ref. No. (as unnumbered draft)?')) return;
      window.print();
    };

    if ($('#eShareWa')) $('#eShareWa').onclick = async () => {
      await ensureQrLoadedForLetter(ed);
      const qInfo = cachedQrMap[ed.id] || {};
      const share = window.DraftStudio.buildDispatchShareLinks(db, resolveLiveTokens(ed), qInfo.verifyUrl || '');
      modal(`
        <h3>📲 Dispatch via WhatsApp / Official Email</h3>
        <p class="mut" style="margin-top:-4px">Download the signed PDF first, then click WhatsApp or Email below to send the formatted official message + verification link.</p>
        <textarea id="shTxt" rows="7">${esc(share.text)}</textarea>
        <div class="bar" style="margin-top:10px">
          <a href="${esc(share.waUrl)}" target="_blank" rel="noopener" class="btn ok" style="text-decoration:none">📲 Open WhatsApp</a>
          <a href="${esc(share.mailUrl)}" class="btn pri" style="text-decoration:none">✉️ Open Official Email</a>
          <button id="shCopy">📋 Copy Message</button>
          <span class="sp"></span>
          <button id="shClose">Close</button>
        </div>
      `);
      $('#shCopy').onclick = () => { navigator.clipboard.writeText($('#shTxt').value); toast('Copied to clipboard!'); };
      $('#shClose').onclick = closeModal;
    };

    $('#eDup').onclick = () => {
      const c = JSON.parse(JSON.stringify(ed));
      Object.assign(c, { id: Core.uid(), date: Core.todayISO(), status: 'draft' });
      delete c.ref; delete c.refNo; delete c.refYear; delete c.issuedAt; delete c.dispatch; delete c.cancelReason;
      ed = c;
      toast('Copied as new draft.');
      viewEdit();
    };

    if ($('#eCancel')) $('#eCancel').onclick = async () => {
      const reason = prompt(`Reason for cancelling Ref. No. ${ed.ref}:`);
      if (reason === null) return;
      ed = await op('cancelLetter', { id: ed.id, reason });
      toast(`Cancelled ${ed.ref}`);
      viewEdit();
    };
  }

  // ==================== 4. SHEET & FUZZY SEARCH REGISTER (Fuse.js) ====================
  function viewSheet() {
    const years = [...new Set(db.letters.map(l => l.refYear || (l.date || '').slice(0, 4)).filter(Boolean))].sort().reverse();
    let rows = db.letters.filter(l => {
      if (sheetF.year && String(l.refYear || (l.date || '').slice(0, 4)) !== String(sheetF.year)) return false;
      if (sheetF.status && l.status !== sheetF.status) return false;
      if (sheetF.majorHead && (l.majorHead || 'ADM') !== sheetF.majorHead) return false;
      return true;
    });

    if (sheetF.q.trim()) {
      if (sheetF.fuzzy && window.Fuse) {
        const fuse = new window.Fuse(rows, {
          keys: ['ref', 'to', 'subject', 'heading', 'body', 'majorHead', 'subHead', 'remarks', 'fields.name'],
          threshold: 0.35,
          ignoreLocation: true,
        });
        rows = fuse.search(sheetF.q.trim()).map(r => r.item);
      } else {
        const q = sheetF.q.toLowerCase();
        rows = rows.filter(l =>
          [l.ref, l.to, l.subject, l.heading, l.body, l.majorHead, l.subHead, l.remarks]
            .some(x => String(x || '').toLowerCase().includes(q))
        );
      }
    } else {
      rows.sort((a, b) => (b.refYear || 0) - (a.refYear || 0) || (b.refNo || 0) - (a.refNo || 0) || (b.updatedAt || 0) - (a.updatedAt || 0));
    }

    const headSummary = (db.settings.majorHeads || Core.DEFAULT_MAJOR_HEADS).map(h => ({
      code: h.code,
      en: h.en,
      count: db.letters.filter(l => (l.majorHead || 'ADM') === h.code && l.status !== 'cancelled').length,
    })).filter(x => x.count > 0);

    const gs = db.settings.gsheet || {};
    const el = $('#view');
    el.innerHTML = `
      <div class="bar">
        <div>
          <h2 style="margin:0">📑 Searchable Register &amp; Sheet Sync (Fuse.js)</h2>
          <small class="mut">Auto-saved to <code>data/Master_Letter_Register.xlsx</code> (4 Sheets: Outward, Inward, Major Heads, Students)</small>
        </div>
        <span class="sp"></span>
        <button class="ok" id="shDlXlsx">📊 Download Excel (.xlsx)</button>
        <button class="pri" id="shDlPdf">📕 Register PDF (.pdf)</button>
        <button id="shSyncGs">☁️ Sync Google Sheets</button>
        ${auth.user.role === 'admin' ? `<label class="btn" style="margin:0;cursor:pointer">📥 Import Excel<input type="file" id="shImpXlsx" accept=".xlsx" hidden></label>` : ''}
      </div>

      ${headSummary.length ? `
        <div class="card" style="padding:10px 14px">
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            <b style="font-size:12px">Quick Filter by Major Head:</b>
            <button class="sm ${!sheetF.majorHead ? 'pri' : ''}" data-hchip="">All (${db.letters.length})</button>
            ${headSummary.map(h => `<button class="sm ${sheetF.majorHead === h.code ? 'pri' : ''}" data-hchip="${esc(h.code)}">${esc(h.code)}: ${h.count}</button>`).join('')}
          </div>
        </div>
      ` : ''}

      <div class="card">
        <div class="row g">
          <label>Search Letter No., Subject, Body, Student/Recipient
            <input id="shQ" placeholder="e.g. 321/26, Scholarship, DEO, अनिता…" value="${esc(sheetF.q)}">
          </label>
          <label>Major Head (मद)
            <select id="shHead">${headOptionsHtml(sheetF.majorHead, 'All Major Heads')}</select>
          </label>
          <label>Year
            <select id="shYear">
              <option value="">All Years</option>
              ${years.map(y => `<option ${String(sheetF.year) === String(y) ? 'selected' : ''}>${y}</option>`).join('')}
            </select>
          </label>
          <label>Status
            <select id="shStatus">
              <option value="">All Status</option>
              ${['issued', 'dispatched', 'pending_approval', 'draft', 'returned', 'cancelled'].map(s => `<option value="${s}" ${sheetF.status === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="bar" style="margin:6px 0 0">
          <label class="chk"><input type="checkbox" id="shFuzzy" ${sheetF.fuzzy ? 'checked' : ''}> 🔍 <b>Fuse.js Smart Typo-Tolerant Search</b></label>
          <span class="sp"></span>
          <span class="mut">Showing <b>${rows.length}</b> record(s) ${gs.lastSyncStatus ? `· ☁️ ${esc(gs.lastSyncStatus)}` : ''}</span>
        </div>
      </div>

      <div class="card table-wrap">
        <table class="tbl">
          <thead>
            <tr>
              <th>Letter / Ref. No.</th>
              <th>Date</th>
              <th>Major Head</th>
              <th>Sub-Head</th>
              <th>Recipient / Party</th>
              <th>Subject / Heading</th>
              <th>Status</th>
              <th>Exports</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(l => {
              const mh = Core.getMajorHeadObj(db, l.majorHead);
              return `<tr>
                <td><b>${esc(l.ref || 'DRAFT')}</b></td>
                <td>${esc(Core.fmtDateDMY(l.date))}</td>
                <td><span class="pill p-head" title="${esc(mh.en)} / ${esc(mh.hi)}">${esc(mh.code)}</span></td>
                <td>${esc(l.subHead || '—')}</td>
                <td>${esc((l.to || '').split('\n')[0] || (l.fields && l.fields.name) || '—')}</td>
                <td>${esc(l.subject || l.heading || '—')}</td>
                <td><span class="pill p-${l.status}">${esc(l.status)}</span></td>
                <td class="acts">
                  <button class="sm" data-open="${l.id}">Open</button>
                  <button class="sm ok" data-docx="${l.id}">.docx</button>
                  <button class="sm pri" data-pdf="${l.id}">.pdf</button>
                </td>
              </tr>`;
            }).join('') || '<tr><td colspan="8" class="mut">No matching records.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    $('#shQ').oninput = e => { sheetF.q = e.target.value; viewSheet(); };
    $('#shHead').onchange = e => { sheetF.majorHead = e.target.value; viewSheet(); };
    $('#shYear').onchange = e => { sheetF.year = e.target.value; viewSheet(); };
    $('#shStatus').onchange = e => { sheetF.status = e.target.value; viewSheet(); };
    $('#shFuzzy').onchange = e => { sheetF.fuzzy = e.target.checked; viewSheet(); };
    $$('[data-hchip]', el).forEach(b => b.onclick = () => { sheetF.majorHead = b.dataset.hchip; viewSheet(); });

    $('#shDlXlsx').onclick = () => {
      const qs = new URLSearchParams({ majorHead: sheetF.majorHead, status: sheetF.status, year: sheetF.year, q: sheetF.q }).toString();
      downloadBinary(`/api/export/register-xlsx?${qs}`, 'GET', null, `Letter_Register_${Core.todayISO()}.xlsx`);
    };
    $('#shDlPdf').onclick = () => {
      downloadBinary('/api/export/register-pdf', 'POST', { ids: rows.map(r => r.id), title: 'Filtered Letter Register' }, `Register_${Core.todayISO()}.pdf`);
    };
    $('#shSyncGs').onclick = async () => {
      if (!db.settings.gsheet || !db.settings.gsheet.webhookUrl) {
        toast('Configure Google Sheets Apps Script URL in ⚙️ Settings first.');
        return go('set');
      }
      try {
        const res = await api('/api/gsheet/sync', {});
        toast(res.status || 'Synced to Google Sheets!');
        await reloadDb();
        viewSheet();
      } catch (err) { toast(err.message); }
    };

    if ($('#shImpXlsx')) $('#shImpXlsx').onchange = async e => {
      const f = e.target.files[0];
      if (!f) return;
      const ab = await f.arrayBuffer();
      const bytes = new Uint8Array(ab);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const r = await api('/api/import/register-xlsx', { base64: btoa(bin) });
      db = r.db;
      toast(`Imported ${r.added} new letter record(s) from Excel.`);
      viewSheet();
    };

    $$('[data-open]', el).forEach(b => b.onclick = () => { ed = JSON.parse(JSON.stringify(db.letters.find(x => x.id === b.dataset.open))); go('edit'); });
    $$('[data-docx]', el).forEach(b => b.onclick = () => {
      const l = db.letters.find(x => x.id === b.dataset.docx);
      downloadBinary('/api/export/docx', 'POST', { letter: resolveLiveTokens(l) }, `Letter_${l.ref || 'Draft'}.docx`);
    });
    $$('[data-pdf]', el).forEach(b => b.onclick = () => {
      const l = db.letters.find(x => x.id === b.dataset.pdf);
      downloadBinary('/api/export/pdf', 'POST', { letter: resolveLiveTokens(l) }, `Letter_${l.ref || 'Draft'}.pdf`);
    });
  }

  // ==================== 5. OUTWARD REGISTER + 1-CLICK REMINDER ====================
  function viewOut() {
    const years = [...new Set(db.letters.map(l => l.refYear).filter(Boolean))].sort((a, b) => b - a);
    const q = outF.q.trim().toLowerCase();
    const rows = db.letters.filter(l => {
      if (outF.year && String(l.refYear) !== String(outF.year)) return false;
      if (outF.status && l.status !== outF.status) return false;
      if (outF.majorHead && (l.majorHead || 'ADM') !== outF.majorHead) return false;
      if (q && ![l.ref, l.to, l.subject, l.heading, l.majorHead, l.subHead, l.remarks].some(x => (x || '').toLowerCase().includes(q))) return false;
      return true;
    }).sort((a, b) => (b.refYear || 0) - (a.refYear || 0) || (b.refNo || 999999) - (a.refNo || 999999));

    const el = $('#view');
    el.innerHTML = `
      <div class="bar">
        <h2 style="margin:0">📤 Outward Register (जावक पंजी)</h2>
        <span class="sp"></span>
        <button id="oExportXlsx" class="ok">📊 Export .xlsx</button>
        <button id="oPrintReg" class="pri">📕 Register PDF</button>
      </div>
      <div class="card">
        <div class="row g">
          <input id="oQ" placeholder="Search Ref. No., recipient, subject…" value="${esc(outF.q)}">
          <select id="oHead">${headOptionsHtml(outF.majorHead, 'All Major Heads')}</select>
          <select id="oY"><option value="">All Years</option>${years.map(y => `<option ${String(outF.year) === String(y) ? 'selected' : ''}>${y}</option>`).join('')}</select>
          <select id="oS"><option value="">All Status</option>${['issued', 'dispatched', 'pending_approval', 'draft', 'cancelled'].map(s => `<option value="${s}" ${outF.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
        </div>
      </div>
      <div class="card table-wrap">
        <table class="tbl">
          <thead><tr><th>Ref. No.</th><th>Date</th><th>Head</th><th>Recipient</th><th>Subject</th><th>Status / Dispatch</th><th>Actions</th></tr></thead>
          <tbody>
            ${rows.map(l => `<tr>
              <td><b>${esc(l.ref || '—')}</b></td>
              <td>${esc(Core.fmtDateDMY(l.date))}</td>
              <td><span class="pill p-head">${esc(l.majorHead || 'ADM')}</span></td>
              <td>${esc((l.to || '').split('\n')[0] || (l.fields && l.fields.name) || '—')}</td>
              <td>${esc(l.subject || l.heading || '—')}${l.awaitingReply && !l.reply ? '<br><small style="color:#d97706">⏳ Reply Awaited</small>' : ''}</td>
              <td>
                <span class="pill p-${l.status}">${esc(l.status)}</span>
                ${l.dispatch ? `<div class="mut">${esc(l.dispatch.mode)} ${esc(l.dispatch.tracking || '')}</div>` : ''}
              </td>
              <td class="acts">
                <button class="sm" data-open="${l.id}">Open</button>
                ${l.ref && l.status !== 'cancelled' ? `<button class="sm" data-disp="${l.id}">Dispatch</button><button class="sm warn-btn" data-rem="${l.id}" title="Draft Official Reminder Letter">🔔 Reminder</button>` : ''}
                ${!l.ref && auth.user.role === 'admin' ? `<button class="sm danger" data-del="${l.id}">Delete</button>` : ''}
              </td>
            </tr>`).join('') || '<tr><td colspan="7" class="mut">No matching letters.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    $('#oQ').oninput = e => { outF.q = e.target.value; viewOut(); };
    $('#oHead').onchange = e => { outF.majorHead = e.target.value; viewOut(); };
    $('#oY').onchange = e => { outF.year = e.target.value; viewOut(); };
    $('#oS').onchange = e => { outF.status = e.target.value; viewOut(); };
    $('#oExportXlsx').onclick = () => downloadBinary('/api/export/register-xlsx', 'GET', null, `Outward_Register_${Core.todayISO()}.xlsx`);
    $('#oPrintReg').onclick = () => downloadBinary('/api/export/register-pdf', 'POST', { ids: rows.map(r => r.id) }, `Outward_Register_${Core.todayISO()}.pdf`);

    $$('[data-open]', el).forEach(b => b.onclick = () => { ed = JSON.parse(JSON.stringify(db.letters.find(x => x.id === b.dataset.open))); go('edit'); });
    $$('[data-del]', el).forEach(b => b.onclick = async () => {
      if (!confirm('Delete this unissued draft?')) return;
      await op('deleteLetter', { id: b.dataset.del });
      viewOut();
    });

    // 1-Click Official Reminder Generator
    $$('[data-rem]', el).forEach(b => b.onclick = () => {
      const orig = db.letters.find(x => x.id === b.dataset.rem);
      const rem = newFromTemplate('rem', orig.lang || 'en');
      rem.majorHead = orig.majorHead || 'ADM';
      rem.subHead = orig.subHead || '';
      rem.to = orig.to || '';
      rem.fields = {
        prev_ref: orig.ref || '',
        prev_date: orig.date || '',
        subject: orig.subject || '',
        rem_no: 'I',
        matter: orig.lang === 'hi'
          ? 'कृपया पूर्व प्रेषित पत्र पर वांछित कार्रवाई/प्रत्युत्तर यथाशीघ्र उपलब्ध कराने की कृपा की जाए।'
          : 'Kindly expedite the needful action / response on the aforementioned reference at the earliest.',
      };
      applyTemplate(rem);
      if (orig.to) rem.to = orig.to;
      ed = rem;
      go('edit');
      toast(`Drafted Reminder referencing Letter ${orig.ref}`);
    });

    $$('[data-disp]', el).forEach(b => b.onclick = () => {
      const l = db.letters.find(x => x.id === b.dataset.disp);
      const d = l.dispatch || { mode: 'By Hand / Peon Book', date: Core.todayISO(), tracking: '' };
      modal(`
        <h3>📮 Dispatch &amp; Follow-up — Ref. ${esc(l.ref)}</h3>
        <div class="row g">
          <label>Dispatch Mode
            <select id="dMode">${['By Hand / Peon Book', 'Speed Post', 'Registered Post', 'Email', 'WhatsApp', 'Special Messenger'].map(m => `<option ${m === d.mode ? 'selected' : ''}>${m}</option>`).join('')}</select>
          </label>
          <label>Dispatch Date<input type="date" id="dDate" value="${esc(d.date || Core.todayISO())}"></label>
        </div>
        <label>Receipt / Consignment / Peon Book Entry<input id="dTrk" value="${esc(d.tracking || '')}"></label>
        <label class="chk" style="margin:8px 0"><input type="checkbox" id="dAwait" ${l.awaitingReply ? 'checked' : ''}> ⏳ Mark as "Reply Awaited" (उत्तर प्रतीक्षित)</label>
        <label>Reply Received Note<input id="dRep" value="${esc(l.reply || '')}" placeholder="e.g. Sanction received vide Memo 55 dt 25/11/2026"></label>
        <div class="bar" style="margin-top:10px">
          <span class="sp"></span>
          <button id="dCancel">Close</button>
          <button class="pri" id="dSave">Save</button>
        </div>
      `);
      $('#dCancel').onclick = closeModal;
      $('#dSave').onclick = async () => {
        await op('patchLetter', {
          id: l.id,
          patch: {
            dispatch: { mode: $('#dMode').value, date: $('#dDate').value, tracking: $('#dTrk').value },
            awaitingReply: $('#dAwait').checked,
            reply: $('#dRep').value,
          },
        });
        closeModal();
        viewOut();
      };
    });
  }

  // ==================== 6. INWARD REGISTER + OFFLINE OCR + SLA TRACKER ====================
  function viewInw() {
    const q = inwF.q.trim().toLowerCase();
    const rows = db.inward.filter(r => {
      if (inwF.status && r.status !== inwF.status) return false;
      if (inwF.majorHead && (r.majorHead || 'ADM') !== inwF.majorHead) return false;
      if (inwF.priority && (r.priority || 'normal') !== inwF.priority) return false;
      if (q && ![r.no, r.from, r.senderRef, r.subject, r.majorHead, r.ocrText].some(x => (x || '').toLowerCase().includes(q))) return false;
      return true;
    }).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const el = $('#view');
    el.innerHTML = `
      <div class="bar">
        <div>
          <h2 style="margin:0">📥 Inward Register + Offline Hindi/English OCR + SLA Tracker</h2>
          <small class="mut">Upload any incoming paper letter photo → Offline Tesseract OCR auto-extracts Memo No., Sender &amp; Subject + tracks RTI/Urgent deadlines</small>
        </div>
        <span class="sp"></span>
        <button class="ok" id="iScanBtn">📷 Scan Paper Letter (Offline OCR)</button>
        <button class="pri" id="iAdd">+ Log Inward Manually</button>
      </div>

      <div class="card">
        <div class="row g">
          <input id="iQ" placeholder="Search Inward No., sender, subject, or scanned OCR text…" value="${esc(inwF.q)}">
          <select id="iHead">${headOptionsHtml(inwF.majorHead, 'All Major Heads')}</select>
          <select id="iPrio">
            <option value="">All Priorities</option>
            ${Core.INWARD_PRIORITIES.map(p => `<option value="${p.id}" ${inwF.priority === p.id ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}
          </select>
          <select id="iS">
            <option value="">All Status</option>
            <option value="pending" ${inwF.status === 'pending' ? 'selected' : ''}>Reply Pending</option>
            <option value="replied" ${inwF.status === 'replied' ? 'selected' : ''}>Replied</option>
            <option value="noaction" ${inwF.status === 'noaction' ? 'selected' : ''}>Filed / Info Only</option>
          </select>
        </div>
      </div>

      <div class="card table-wrap">
        <table class="tbl">
          <thead><tr><th>Inward No.</th><th>Received</th><th>Priority &amp; SLA</th><th>Head</th><th>From &amp; Sender Ref</th><th>Subject</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${rows.map(r => {
              const sla = Core.inwardDeadlineMeta(r);
              const slaBadge = sla.overdue
                ? `<span class="pill p-overdue">🚨 ${esc(sla.label)}</span>`
                : (sla.dueSoon ? `<span class="pill p-duesoon">⏰ ${esc(sla.label)}</span>` : (r.dueDate ? `<small class="mut">Due: ${esc(Core.fmtDateDMY(r.dueDate))}</small>` : '—'));
              return `<tr>
                <td><b>${esc(r.no)}</b></td>
                <td>${esc(Core.fmtDateDMY(r.date))}</td>
                <td><b>${esc((r.priority || 'normal').toUpperCase())}</b><br>${slaBadge}</td>
                <td><span class="pill p-head">${esc(r.majorHead || 'ADM')}</span></td>
                <td><b>${esc(r.from)}</b><br><small class="mut">${esc(r.senderRef || '')}</small></td>
                <td>${esc(r.subject)}</td>
                <td><span class="pill p-${r.status}">${esc(r.reply ? 'replied · ' + r.reply.ref : r.status)}</span></td>
                <td class="acts">
                  ${r.attachment ? `<button class="sm" data-scan="${esc(r.attachment)}" data-ocr="${esc(r.ocrText || '')}">🖼 Scan</button>` : ''}
                  ${r.status !== 'replied' ? `<button class="sm pri" data-rep="${r.id}">↩ Draft Reply</button>` : ''}
                  <button class="sm" data-edit="${r.id}">Edit</button>
                  ${auth.user.role === 'admin' ? `<button class="sm danger" data-del="${r.id}">🗑</button>` : ''}
                </td>
              </tr>`;
            }).join('') || '<tr><td colspan="8" class="mut">No inward letters logged yet. Click "📷 Scan Paper Letter (Offline OCR)" or "+ Log Inward Manually".</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    $('#iQ').oninput = e => { inwF.q = e.target.value; viewInw(); };
    $('#iHead').onchange = e => { inwF.majorHead = e.target.value; viewInw(); };
    $('#iPrio').onchange = e => { inwF.priority = e.target.value; viewInw(); };
    $('#iS').onchange = e => { inwF.status = e.target.value; viewInw(); };
    $('#iAdd').onclick = () => openInwardForm();
    $('#iScanBtn').onclick = () => openInwardForm(null, true);

    $$('[data-edit]', el).forEach(b => b.onclick = () => openInwardForm(db.inward.find(x => x.id === b.dataset.edit)));
    $$('[data-del]', el).forEach(b => b.onclick = async () => {
      if (!confirm('Delete this inward entry?')) return;
      await op('deleteInward', { id: b.dataset.del });
      viewInw();
    });
    $$('[data-scan]', el).forEach(b => b.onclick = () => {
      modal(`
        <h3>🖼 Attached Paper Scan &amp; OCR Text</h3>
        <img src="${esc(b.dataset.scan)}" style="max-width:100%;border:1px solid #cbd5e1;border-radius:8px">
        ${b.dataset.ocr ? `<label style="margin-top:10px">Extracted OCR Text<textarea rows="5" readonly>${esc(b.dataset.ocr)}</textarea></label>` : ''}
        <div class="bar" style="margin-top:10px"><span class="sp"></span><button id="scClose">Close</button></div>
      `);
      $('#scClose').onclick = closeModal;
    });
    $$('[data-rep]', el).forEach(b => b.onclick = () => {
      const r = db.inward.find(x => x.id === b.dataset.rep);
      const l = newFromTemplate('reply', 'en');
      l.majorHead = r.majorHead || 'ADM';
      l.subHead = r.subHead || '';
      l.replyTo = r.id;
      l.to = r.from;
      l.fields = {
        sender_ref: r.senderRef || r.no,
        inward_date: r.date,
        subject: r.subject,
        reply_body: 'Point-wise compliance / information is respectfully submitted as follows:',
      };
      applyTemplate(l);
      l.to = r.from;
      ed = l;
      go('edit');
    });
  }

  function openInwardForm(r, autoTriggerScan = false) {
    const x = r || {
      id: Core.uid(),
      date: Core.todayISO(),
      majorHead: 'ADM',
      subHead: '',
      priority: 'normal',
      dueDate: Core.addDaysISO(Core.todayISO(), 7),
      from: '',
      senderRef: '',
      subject: '',
      needsReply: true,
      attachment: '',
      ocrText: '',
    };

    modal(`
      <h3>${r ? 'Edit Inward ' + esc(x.no) : ico('Inbox', 17) + ' Log Inward Letter + Offline AI OCR Scan'}</h3>

      <div class="ocr-scan-box">
        <div class="bar" style="margin:0">
          <div>
            <b style="color:#059669">${ico('ScanLine', 15)} Smart Offline Paper Scan (Hindi + English OCR)</b>
            <div class="mut">Upload photo/scan (PNG/JPG/WEBP) — runs 100% locally via Tesseract.js</div>
          </div>
          <span class="sp"></span>
          <label class="btn ok" style="margin:0;cursor:pointer">${ico('Upload', 14)} Select Scan Image<input type="file" id="fScanInput" accept="image/png,image/jpeg,image/webp" hidden></label>
        </div>
        <div id="ocrPreviewStage" class="ocr-preview-stage" hidden>
          <img id="ocrPreviewImg" alt="Scanned Paper Preview">
          <div id="ocrLaser" class="ocr-laser-beam" hidden></div>
        </div>
        <div id="ocrStatus" class="mut" style="margin-top:6px">${x.attachment ? '✅ Scan attached (' + esc(x.attachment) + ')' : ''}</div>
      </div>

      <div class="row g">
        <label>Received Date<input type="date" id="fDate" value="${esc(x.date)}"></label>
        <label>Priority Tier (प्राथमिकता)
          <select id="fPrio">
            ${Core.INWARD_PRIORITIES.map(p => `<option value="${p.id}" data-days="${p.days}" ${x.priority === p.id ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}
          </select>
        </label>
        <label>SLA Due Date (अंतिम तिथि)
          <input type="date" id="fDue" value="${esc(x.dueDate || '')}">
        </label>
      </div>
      <div class="row g">
        <label>Major Head (मुख्य शीर्ष) *<select id="fHead">${headOptionsHtml(x.majorHead || 'ADM')}</select></label>
        <label>Sub-Head / File No.<input id="fSub" value="${esc(x.subHead || '')}"></label>
      </div>
      <label>Received From (प्रेषक कार्यालय / नाम) *<input id="fFrom" value="${esc(x.from)}" placeholder="e.g. District Education Officer, Dumka"></label>
      <label>Sender's Memo / Letter No. &amp; Date<input id="fSref" value="${esc(x.senderRef)}" placeholder="e.g. Memo 412/Dumka dt. 14/11/2026"></label>
      <label>Subject (विषय) *<textarea id="fSubj" rows="2">${esc(x.subject)}</textarea></label>
      <label class="chk" style="margin:8px 0"><input type="checkbox" id="fNeed" ${x.needsReply ? 'checked' : ''}> Action / Reply Required (track SLA countdown)</label>

      <div class="bar" style="margin-top:10px">
        <span class="sp"></span>
        <button id="fClose">Cancel</button>
        <button class="pri" id="fSave">💾 Save Inward Entry</button>
      </div>
    `);

    let curAttachment = x.attachment || '';
    let curOcrText = x.ocrText || '';

    const updateDueFromPrio = () => {
      const sel = $('#fPrio');
      const opt = sel.options[sel.selectedIndex];
      const days = parseInt(opt.dataset.days, 10) || 7;
      $('#fDue').value = Core.addDaysISO($('#fDate').value || Core.todayISO(), days);
    };
    $('#fPrio').onchange = updateDueFromPrio;

    $('#fScanInput').onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      $('#ocrStatus').textContent = '⏳ Optical Scanner reading Hindi + English text locally… कृपया प्रतीक्षा करें';
      try {
        const dataUrl = await fileToDataUrl(f, 5 * 1024 * 1024);
        const stage = $('#ocrPreviewStage');
        const prevImg = $('#ocrPreviewImg');
        const laser = $('#ocrLaser');
        if (stage && prevImg) {
          prevImg.src = dataUrl;
          stage.hidden = false;
          if (laser) laser.hidden = false;
        }
        const res = await api('/api/inward/ocr', { dataUrl, saveScan: true });
        if (laser) laser.hidden = true;
        curAttachment = res.attachment || '';
        curOcrText = res.rawText || '';
        if (res.from && !$('#fFrom').value) $('#fFrom').value = res.from;
        if (res.senderRef && !$('#fSref').value) $('#fSref').value = res.senderRef;
        if (res.subject && !$('#fSubj').value) $('#fSubj').value = res.subject;
        if (res.majorHead) $('#fHead').value = res.majorHead;
        if (res.priority) { $('#fPrio').value = res.priority; updateDueFromPrio(); }
        $('#ocrStatus').textContent = `✅ Scan saved & OCR extracted (${curOcrText.length} chars)! Fields auto-filled.`;
      } catch (err) {
        if ($('#ocrLaser')) $('#ocrLaser').hidden = true;
        $('#ocrStatus').textContent = '❌ OCR error: ' + err.message;
      }
    };

    if (autoTriggerScan) {
      setTimeout(() => $('#fScanInput').click(), 100);
    }

    $('#fClose').onclick = closeModal;
    $('#fSave').onclick = async () => {
      try {
        await op('saveInward', {
          id: x.id,
          date: $('#fDate').value,
          priority: $('#fPrio').value,
          dueDate: $('#fDue').value,
          majorHead: $('#fHead').value,
          subHead: $('#fSub').value.trim(),
          from: $('#fFrom').value.trim(),
          senderRef: $('#fSref').value.trim(),
          subject: $('#fSubj').value.trim(),
          needsReply: $('#fNeed').checked,
          attachment: curAttachment,
          ocrText: curOcrText,
        });
        closeModal();
        toast('Inward letter logged & synced.');
        viewInw();
      } catch (err) { toast(err.message); }
    };
  }

  // ==================== 7. TEMPLATES GALLERY ====================
  function viewTpl() {
    const el = $('#view');
    el.innerHTML = `
      <div class="bar">
        <div>
          <h2 style="margin:0">Official Bilingual Templates (${allTemplates().length})</h2>
          <small class="mut">Every template includes authentic English &amp; हिंदी (Devanagari) wording, auto-assigned Major Head &amp; QR readiness</small>
        </div>
        <span class="sp"></span>
        <button class="pri" id="btnNewTpl">${ico('Plus', 15)} Create Custom Template</button>
      </div>
      <div class="tpl-grid">
        ${allTemplates().map(t => `
          <div class="card tpl-card">
            <div>
              <div class="bar" style="margin-bottom:6px">
                <span class="pill p-head">${esc(t.majorHead || 'ADM')}</span>
                <span class="sp"></span>
                <small class="mut" style="font-weight:600">${esc(t.layout.toUpperCase())}</small>
              </div>
              <h3 style="margin-bottom:6px">${esc(t.name)}</h3>
              <p class="mut" style="margin:0 0 12px">${esc((t.fields || []).length)} smart fields · Bilingual EN + हिंदी</p>
            </div>
            <div class="bar" style="margin:0">
              <button class="pri sm" data-use="${esc(t.id)}" data-l="en">${ico('FilePenLine', 13)} Draft EN</button>
              <button class="ok sm" data-use="${esc(t.id)}" data-l="hi">${ico('Languages', 13)} हिंदी में बनाएँ</button>
              ${t.custom && auth.user.role === 'admin' ? `<button class="danger sm" data-deltpl="${esc(t.id)}">${ico('Trash2', 13)}</button>` : ''}
            </div>
          </div>`).join('')}
      </div>
    `;
    $$('[data-use]', el).forEach(b => b.onclick = () => { ed = newFromTemplate(b.dataset.use, b.dataset.l); go('edit'); });
    $$('[data-deltpl]', el).forEach(b => b.onclick = async () => {
      if (!confirm('Delete custom template?')) return;
      await op('deleteCustomTemplate', { id: b.dataset.deltpl });
      viewTpl();
    });
    $('#btnNewTpl').onclick = () => {
      modal(`
        <h3>+ Create Custom Bilingual Template</h3>
        <div class="row g">
          <label>Template Name *<input id="ctName" placeholder="e.g. Hostel Gate Pass"></label>
          <label>Major Head<select id="ctHead">${headOptionsHtml('ADM')}</select></label>
          <label>Layout<select id="ctLay"><option value="letter">Official Letter</option><option value="notice">Notice</option><option value="cert">Certificate</option></select></label>
        </div>
        <label>Custom Placeholders (comma-separated keys)<input id="ctFields" placeholder="student_name, class, reason"></label>
        <label>English Subject / Heading<input id="ctEnSubj"></label>
        <label>English Body<textarea id="ctEnBody" rows="3"></textarea></label>
        <label>हिंदी विषय / शीर्षक<input id="ctHiSubj"></label>
        <label>हिंदी मुख्य विषय-वस्तु<textarea id="ctHiBody" rows="3"></textarea></label>
        <div class="bar"><span class="sp"></span><button id="ctCancel">Cancel</button><button class="pri" id="ctSave">Save Template</button></div>
      `);
      $('#ctCancel').onclick = closeModal;
      $('#ctSave').onclick = async () => {
        const fKeys = $('#ctFields').value.split(',').map(s => s.trim().replace(/[^a-zA-Z0-9_]/g, '')).filter(Boolean);
        const lay = $('#ctLay').value;
        await op('saveCustomTemplate', {
          name: $('#ctName').value.trim(),
          majorHead: $('#ctHead').value,
          layout: lay,
          fields: fKeys.map(k => ({ k, l: k.replace(/_/g, ' ').toUpperCase(), t: 'text' })),
          en: { heading: lay !== 'letter' ? $('#ctEnSubj').value : '', subject: lay === 'letter' ? $('#ctEnSubj').value : '', body: $('#ctEnBody').value },
          hi: { heading: lay !== 'letter' ? $('#ctHiSubj').value : '', subject: lay === 'letter' ? $('#ctHiSubj').value : '', body: $('#ctHiBody').value },
        });
        closeModal();
        viewTpl();
      };
    };
  }

  // ==================== 8. USERS & SECURITY (ADMIN ONLY) ====================
  async function viewUsers() {
    if (auth.user.role !== 'admin') return go('dash');
    const data = await api('/api/users');
    const el = $('#view');
    el.innerHTML = `
      <div class="bar">
        <h2 style="margin:0">👥 Users, Roles &amp; Security Audit</h2>
        <span class="sp"></span>
        <button class="pri" id="uAdd">+ Add Office User</button>
      </div>
      <div class="card table-wrap">
        <table class="tbl">
          <thead><tr><th>Username</th><th>Full Name</th><th>Role</th><th>Status</th><th>Last Login</th><th>Actions</th></tr></thead>
          <tbody>
            ${data.users.map(u => `<tr>
              <td><b>${esc(u.username)}</b></td>
              <td>${esc(u.displayName)}</td>
              <td><span class="pill ${u.role === 'admin' ? 'p-issued' : 'p-dispatched'}">${esc(u.role)}</span></td>
              <td>${u.active !== false ? '✅ Active' : '🚫 Disabled'}</td>
              <td>${u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}</td>
              <td class="acts">
                <button class="sm" data-rst="${u.id}" data-un="${esc(u.username)}">Reset Pass</button>
                ${u.id !== auth.user.id ? `<button class="sm danger" data-udel="${u.id}">Remove</button>` : ''}
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="card">
        <h3>🛡 Recent Security &amp; Document Audit Log</h3>
        <div class="table-wrap" style="max-height:300px;overflow-y:auto">
          <table class="tbl">
            <thead><tr><th>Timestamp</th><th>Action</th><th>Actor</th><th>IP</th><th>Detail</th></tr></thead>
            <tbody>
              ${(data.audit || []).map(a => `<tr>
                <td><small>${esc(a.ts)}</small></td>
                <td><b>${esc(a.action)}</b></td>
                <td>${esc(a.actor)}</td>
                <td><small>${esc(a.ip)}</small></td>
                <td>${esc(a.detail)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    $('#uAdd').onclick = () => {
      modal(`
        <h3>+ Create Office User Account</h3>
        <label>Full Name &amp; Designation<input id="nuDisp" placeholder="e.g. Shri Manoj Kumar (Office Clerk)"></label>
        <label>Username<input id="nuUser" placeholder="clerk1"></label>
        <label>Role
          <select id="nuRole">
            <option value="staff">Office Staff (Draft, Directory, Scan OCR, Submit for Approval)</option>
            <option value="admin">Administrator / Principal (Full Approval, Sign, Cancel &amp; Settings)</option>
          </select>
        </label>
        <label>Initial Password (min 8 chars)<input type="password" id="nuPass"></label>
        <div class="bar"><span class="sp"></span><button id="nuCancel">Cancel</button><button class="pri" id="nuSave">Create</button></div>
      `);
      $('#nuCancel').onclick = closeModal;
      $('#nuSave').onclick = async () => {
        try {
          await api('/api/users', { displayName: $('#nuDisp').value, username: $('#nuUser').value, role: $('#nuRole').value, password: $('#nuPass').value });
          closeModal();
          toast('User created.');
          viewUsers();
        } catch (err) { toast(err.message); }
      };
    };

    $$('[data-rst]', el).forEach(b => b.onclick = async () => {
      const np = prompt(`New password for "${b.dataset.un}" (min 8 chars):`);
      if (!np) return;
      await api('/api/users/update', { id: b.dataset.rst, newPassword: np });
      toast('Password reset.');
    });
    $$('[data-udel]', el).forEach(b => b.onclick = async () => {
      if (!confirm('Remove this user?')) return;
      await api('/api/users/delete', { id: b.dataset.udel });
      viewUsers();
    });
  }

  // ==================== 9. SETTINGS ====================
  function fileToDataUrl(file, maxBytes = 4 * 1024 * 1024) {
    return new Promise((res, rej) => {
      if (file.size > maxBytes) return rej(new Error('Image exceeds maximum size limit.'));
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  function viewSet() {
    const isAdmin = auth.user.role === 'admin';
    const S = JSON.parse(JSON.stringify(db.settings));
    const yk = Core.yearKey(Core.todayISO(), S.yearMode);
    const el = $('#view');

    el.innerHTML = `
      <div class="bar">
        <h2 style="margin:0">⚙️ Institution, Workflow, QR &amp; Sheet Settings</h2>
        <span class="sp"></span>
        ${isAdmin ? '<button class="pri" id="sSave">💾 Save All Settings</button>' : '<span class="mut">Read-only for Staff</span>'}
      </div>

      <div class="card">
        <h3>1. Institution Identity</h3>
        <div class="row g">
          <label>Header Title<input id="sName" value="${esc(S.school.name)}"></label>
          <label>Sub-Title<input id="sSubName" value="${esc(S.school.subName || '')}"></label>
        </div>
        <div class="row g">
          <label>Name in English<input id="sEn" value="${esc(S.school.en)}"></label>
          <label>हिंदी में विद्यालय का नाम<input id="sHi" value="${esc(S.school.hi)}"></label>
        </div>
        <div class="row g">
          <label>Address (English)<input id="sAddrEn" value="${esc(S.school.addressEn)}"></label>
          <label>पता (हिंदी)<input id="sAddrHi" value="${esc(S.school.addressHi)}"></label>
        </div>
        <div class="row g">
          <label>U-DISE Code<input id="sUdise" value="${esc(S.school.udise)}"></label>
          <label>CBSE Affiliation No.<input id="sCbse" value="${esc(S.school.cbseAff || '')}"></label>
          <label>Est. Year<input id="sEstd" value="${esc(S.school.estd || '')}"></label>
        </div>
      </div>

      <div class="card">
        <h3>2. Approval Policy, QR Verification &amp; Print Typography</h3>
        <div class="row g">
          <label>Font Family
            <select id="sFontFam">
              <option value="karma" ${S.fontFamily === 'karma' ? 'selected' : ''}>Karma Serif (Formal Official Hindi + English)</option>
              <option value="mukta" ${S.fontFamily === 'mukta' ? 'selected' : ''}>Mukta Sans (Modern Clean Hindi + English)</option>
            </select>
          </label>
          <label>Font Size (pt)<input type="number" id="sFpt" min="10" max="15" step="0.5" value="${S.fontPt}"></label>
          <label>Signature Alignment
            <select id="sAlign">
              <option value="right" ${S.sigAlign === 'right' ? 'selected' : ''}>Right Aligned (Standard)</option>
              <option value="left" ${S.sigAlign === 'left' ? 'selected' : ''}>Left Aligned</option>
            </select>
          </label>
        </div>
        <div class="row g">
          <label>Public Verification Base URL (optional, for printed QR codes when hosted on cloud domain)
            <input id="sPubUrl" value="${esc(S.publicBaseUrl || '')}" placeholder="Leave blank to auto-detect current server address">
          </label>
        </div>
        <div class="bar" style="margin-top:6px">
          <label class="chk"><input type="checkbox" id="sReqAppr" ${S.requireApprovalForStaff ? 'checked' : ''}> <b>Require Principal Approval</b> before Office Staff can issue Ref. Nos.</label>
          <label class="chk"><input type="checkbox" id="sDefQr" ${S.defaultShowQr !== false ? 'checked' : ''}> Enable Tamper-Proof QR Code by default</label>
          <label class="chk"><input type="checkbox" id="sPrep" ${S.preprinted ? 'checked' : ''}> Pre-printed Letterhead Paper</label>
        </div>
      </div>

      <div class="card">
        <h3>3. Reference Numbering &amp; Counters</h3>
        <div class="row g">
          <label>Outward Ref Format (supports <code>{n}</code>, <code>{yy}</code>, <code>{yyyy}</code>, <code>{sess}</code>, <code>{head}</code>)
            <input id="sFmt" value="${esc(S.refFormat)}">
          </label>
          <label>Inward Format<input id="sInFmt" value="${esc(S.inFormat)}"></label>
          <label>Zero-Pad Width<input type="number" id="sPad" min="0" max="6" value="${S.padWidth}"></label>
        </div>
        ${isAdmin ? `
        <div class="row g" style="margin-top:6px">
          <label>Last Issued Outward Serial (${yk})<input type="number" id="cOut" min="0" value="${db.counters['out|' + yk] || 0}"></label>
          <button id="cSet">Set Counter</button>
        </div>` : ''}
      </div>

      <div class="card">
        <h3>4. Signatories &amp; Live Signature Stamp (हस्ताक्षरकर्ता)</h3>
        <div id="sigList"></div>
        ${isAdmin ? '<button id="sigAdd">+ Add Signatory</button>' : ''}
      </div>

      <div class="card">
        <h3>5. Google Sheets Live Cloud Sync</h3>
        <div class="row g">
          <label class="chk"><input type="checkbox" id="gsEn" ${S.gsheet.enabled ? 'checked' : ''}> Enable Google Sheets Webhook Sync</label>
          <label class="chk"><input type="checkbox" id="gsAuto" ${S.gsheet.autoSync ? 'checked' : ''}> Auto-sync on every save</label>
        </div>
        <div class="row g">
          <label>Google Apps Script Web App URL (<code>https://script.google.com/macros/s/.../exec</code>)
            <input id="gsUrl" value="${esc(S.gsheet.webhookUrl || '')}">
          </label>
          <label>Shared Secret<input id="gsSec" value="${esc(S.gsheet.webhookSecret || '')}"></label>
        </div>
      </div>

      <div class="card">
        <h3>6. Encrypted Full Backup &amp; Restore</h3>
        <div class="bar">
          <button class="pri" id="bDown">⬇ Download Full JSON Backup</button>
          ${isAdmin ? `<label class="btn" style="margin:0;cursor:pointer">⬆ Restore JSON Backup<input type="file" id="bUp" accept="application/json" hidden></label>` : ''}
        </div>
      </div>
    `;

    const drawSigs = () => {
      $('#sigList').innerHTML = S.signatories.map((g, i) => `
        <div class="card" style="background:#f8fafc">
          <div class="row g">
            <label>Name (EN)<input data-sg="${i}" data-k="name" value="${esc(g.name)}"></label>
            <label>नाम (HI)<input data-sg="${i}" data-k="nameHi" value="${esc(g.nameHi || '')}"></label>
            <label>Designation (EN)<input data-sg="${i}" data-k="designation" value="${esc(g.designation)}"></label>
            <label>पदनाम (HI)<input data-sg="${i}" data-k="designationHi" value="${esc(g.designationHi || '')}"></label>
          </div>
          <div class="bar" style="margin:6px 0 0">
            ${g.stamp ? `<img src="${esc(g.stamp)}" style="max-height:42px;border:1px solid #cbd5e0;background:#fff;padding:2px">` : '<span class="mut">No stamp</span>'}
            ${isAdmin ? `
              <button class="sm pri" data-drawsg="${i}">✍️ Draw Live Signature</button>
              <label class="btn sm" style="margin:0;cursor:pointer">📤 Upload PNG<input type="file" data-sgf="${i}" accept="image/*" hidden></label>
            ` : ''}
            <label class="chk"><input type="radio" name="defSig" ${S.defaultSignatory === g.id ? 'checked' : ''} data-sgd="${i}"> Default</label>
            <span class="sp"></span>
            ${S.signatories.length > 1 && isAdmin ? `<button class="sm danger" data-sgx="${i}">Remove</button>` : ''}
          </div>
        </div>`).join('');

      $$('[data-sg]').forEach(inp => inp.oninput = () => { S.signatories[+inp.dataset.sg][inp.dataset.k] = inp.value; });
      $$('[data-sgd]').forEach(r => r.onchange = () => { S.defaultSignatory = S.signatories[+r.dataset.sgd].id; });
      $$('[data-sgx]').forEach(b => b.onclick = () => { S.signatories.splice(+b.dataset.sgx, 1); drawSigs(); });
      $$('[data-drawsg]').forEach(b => b.onclick = () => {
        const idx = +b.dataset.drawsg;
        window.ModulesUI.openSignaturePadModal(makeUiCtx(), {
          title: `Draw Official Signature for ${S.signatories[idx].name}`,
          onSigned: async (dataUrl) => {
            const up = await api('/api/upload-image', { dataUrl, kind: 'stamp' });
            S.signatories[idx].stamp = up.url;
            drawSigs();
            toast('Live signature saved to protected server storage. Click Save All Settings.');
          },
        });
      });
      $$('[data-sgf]').forEach(inp => inp.onchange = async e => {
        const f = e.target.files[0]; if (!f) return;
        const dataUrl = await fileToDataUrl(f);
        const up = await api('/api/upload-image', { dataUrl, kind: 'stamp' });
        S.signatories[+inp.dataset.sgf].stamp = up.url;
        drawSigs();
      });
    };
    drawSigs();

    if ($('#sigAdd')) $('#sigAdd').onclick = () => {
      S.signatories.push({ id: Core.uid(), name: '', nameHi: '', designation: '', designationHi: '', org: S.school.en, orgHi: S.school.hi, stamp: '' });
      drawSigs();
    };

    if ($('#cSet')) $('#cSet').onclick = async () => {
      const n = parseInt($('#cOut').value, 10);
      if (!confirm(`Set last issued number for ${yk} to ${n}?`)) return;
      await op('setCounter', { series: 'out', year: yk, last: n });
      toast('Counter updated.');
    };

    if ($('#sSave')) $('#sSave').onclick = async () => {
      Object.assign(S.school, {
        name: $('#sName').value, subName: $('#sSubName').value,
        en: $('#sEn').value, hi: $('#sHi').value,
        addressEn: $('#sAddrEn').value, addressHi: $('#sAddrHi').value,
        udise: $('#sUdise').value, cbseAff: $('#sCbse').value, estd: $('#sEstd').value,
      });
      Object.assign(S, {
        fontFamily: $('#sFontFam').value,
        fontPt: +$('#sFpt').value || 12,
        sigAlign: $('#sAlign').value,
        publicBaseUrl: $('#sPubUrl').value.trim(),
        requireApprovalForStaff: $('#sReqAppr').checked,
        defaultShowQr: $('#sDefQr').checked,
        preprinted: $('#sPrep').checked,
        refFormat: $('#sFmt').value.trim(),
        inFormat: $('#sInFmt').value.trim(),
        padWidth: Math.max(0, Math.min(6, +$('#sPad').value || 0)),
      });
      Object.assign(S.gsheet, {
        enabled: $('#gsEn').checked,
        autoSync: $('#gsAuto').checked,
        webhookUrl: $('#gsUrl').value.trim(),
        webhookSecret: $('#gsSec').value.trim(),
      });
      await op('saveSettings', S);
      toast('All settings saved!');
    };

    $('#bDown').onclick = async () => {
      await op('markBackup', {});
      const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `LetterDraft_v3_Backup_${Core.todayISO()}.json`;
      a.click();
    };
    if ($('#bUp')) $('#bUp').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      if (!confirm('Replace current database with this backup?')) return;
      const d = JSON.parse(await f.text());
      await op('restore', d);
      toast('Backup restored.');
      go('dash');
    };
  }

  checkAuthAndBoot();
})();
