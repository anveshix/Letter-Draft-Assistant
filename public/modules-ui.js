/* Letter Draft Assistant v3.0 — Advanced School Modules UI
   Covers: Signature Pad, Sarkari Phrasebook, Approval Queue, Bulk Mail-Merge,
   Student & Staff Master Directory, and Visual Analytics & Inspection Audit. */
(function (root) {
  'use strict';

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ==================== 1. LIVE SIGNATURE PAD MODAL (szimek/signature_pad) ====================
  function openSignaturePadModal(ctx, { title, onSigned }) {
    ctx.modal(`
      <h3>✍️ ${esc(title || 'Draw Live Digital Signature (डिजिटल हस्ताक्षर करें)')}</h3>
      <p class="mut" style="margin-top:-4px">Sign below using Mouse, Stylus, or Touch Screen. Transparent high-DPI PNG is generated locally.</p>
      <div class="bar" style="margin:8px 0">
        <span style="font-size:12.5px;font-weight:600">Pen Ink:</span>
        <button type="button" class="sm pri" id="penBlue">🖊 Official Blue Ink</button>
        <button type="button" class="sm" id="penBlack">✒️ Black Ink</button>
        <span class="sp"></span>
        <button type="button" class="sm" id="sigClear">🧹 Clear</button>
      </div>
      <div class="sigpad-wrap">
        <canvas id="sigCanvas" class="sigpad-canvas" width="520" height="180"></canvas>
      </div>
      <div class="bar" style="margin-top:12px">
        <span class="sp"></span>
        <button type="button" id="sigCancel">Cancel</button>
        <button type="button" class="ok" id="sigSave">✅ Apply Signature</button>
      </div>
    `);

    const canvas = document.getElementById('sigCanvas');
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = 520 * ratio;
    canvas.height = 180 * ratio;
    canvas.getContext('2d').scale(ratio, ratio);

    const pad = new window.SignaturePad(canvas, {
      penColor: '#1e3a8a',
      minWidth: 0.9,
      maxWidth: 2.6,
    });

    document.getElementById('penBlue').onclick = () => {
      pad.penColor = '#1e3a8a';
      document.getElementById('penBlue').classList.add('pri');
      document.getElementById('penBlack').classList.remove('pri');
    };
    document.getElementById('penBlack').onclick = () => {
      pad.penColor = '#0f172a';
      document.getElementById('penBlack').classList.add('pri');
      document.getElementById('penBlue').classList.remove('pri');
    };
    document.getElementById('sigClear').onclick = () => pad.clear();
    document.getElementById('sigCancel').onclick = () => ctx.closeModal();
    document.getElementById('sigSave').onclick = async () => {
      if (pad.isEmpty()) return ctx.toast('Please draw a signature first.');
      const dataUrl = pad.toDataURL('image/png');
      await onSigned(dataUrl);
      ctx.closeModal();
    };
  }

  // ==================== 2. 80+ OFFICIAL SARKARI PHRASEBOOK MODAL ====================
  function openPhrasebookModal(ctx, lang, onPick) {
    const cats = window.DraftStudio.PHRASE_CATEGORIES;
    ctx.modal(`
      <h3>📚 Official Sarkari Phrasebook (कार्यालयी वाक्यांश कोष)</h3>
      <p class="mut" style="margin-top:-4px">Click any standard government/school administrative phrase to insert directly into your letter (${lang === 'hi' ? 'हिंदी' : 'English'}).</p>
      <div class="row g" style="margin:8px 0">
        <input id="pbSearch" placeholder="🔍 Filter phrases (e.g. compliance, अनुदान, चरित्र, संलग्न, RTI)…">
        <select id="pbCat" style="max-width:240px">
          <option value="">All Categories</option>
          ${cats.map(c => `<option value="${c.id}">${esc(c.label)}</option>`).join('')}
        </select>
      </div>
      <div id="pbList" style="max-height:52vh;overflow-y:auto"></div>
      <div class="bar" style="margin-top:10px"><span class="sp"></span><button id="pbClose">Close</button></div>
    `);

    const renderList = () => {
      const q = document.getElementById('pbSearch').value.trim().toLowerCase();
      const cat = document.getElementById('pbCat').value;
      const html = [];
      cats.forEach(c => {
        if (cat && c.id !== cat) return;
        const matched = c.items.filter(it => !q || it.en.toLowerCase().includes(q) || it.hi.toLowerCase().includes(q));
        if (!matched.length) return;
        html.push(`<h4 style="margin:10px 0 6px;color:#1e3a8a">${esc(c.label)}</h4>`);
        matched.forEach((it) => {
          const primary = lang === 'hi' ? it.hi : it.en;
          const secondary = lang === 'hi' ? it.en : it.hi;
          html.push(`
            <div class="af-item" data-ph="${esc(primary)}" data-target="${c.id === 'cc' ? 'cc' : 'body'}" style="border:1px solid #e2e8f0;border-radius:7px;margin-bottom:6px">
              <div style="font-weight:600;color:#0f172a">${esc(primary)}</div>
              <div class="mut" style="margin-top:2px">${esc(secondary)}</div>
            </div>
          `);
        });
      });
      const box = document.getElementById('pbList');
      box.innerHTML = html.join('') || '<p class="mut">No matching phrases.</p>';
      box.querySelectorAll('[data-ph]').forEach(el => {
        el.onclick = () => {
          onPick(el.dataset.ph, el.dataset.target);
          ctx.closeModal();
        };
      });
    };

    document.getElementById('pbSearch').oninput = renderList;
    document.getElementById('pbCat').onchange = renderList;
    document.getElementById('pbClose').onclick = () => ctx.closeModal();
    renderList();
  }

  // ==================== 3. PRINCIPAL APPROVAL QUEUE ====================
  function renderApprovalQueueView(ctx) {
    const { db, auth } = ctx;
    const isAdmin = auth.user && auth.user.role === 'admin';
    const pending = db.letters.filter(l => l.status === 'pending_approval');
    const returned = db.letters.filter(l => l.status === 'returned');

    const el = document.getElementById('view');
    el.innerHTML = `
      <div class="bar">
        <div>
          <h2 style="margin:0">✅ Clerk → Principal Approval Queue (अनुमोदन कतार)</h2>
          <small class="mut">Two-stage verification workflow: Office Clerk drafts → Principal inspects, signs &amp; issues Ref. No.</small>
        </div>
        <span class="sp"></span>
        ${isAdmin ? `<label class="chk card" style="margin:0;padding:6px 12px"><input type="checkbox" id="polToggle" ${db.settings.requireApprovalForStaff ? 'checked' : ''}> Require Principal Approval before Staff can issue Ref. Nos.</label>` : ''}
      </div>

      <div class="card">
        <h3>⏳ Awaiting Principal Approval (${pending.length})</h3>
        ${pending.length ? `
          <div class="table-wrap">
            <table class="tbl">
              <thead><tr><th>Date</th><th>Major Head</th><th>Submitted By</th><th>Recipient / Party</th><th>Subject &amp; Clerk Note</th><th>Actions</th></tr></thead>
              <tbody>
                ${pending.map(l => `
                  <tr>
                    <td>${esc(Core.fmtDateDMY(l.date))}</td>
                    <td><span class="pill p-head">${esc(l.majorHead || 'ADM')}</span></td>
                    <td><b>${esc(l.submittedBy || l.createdBy || 'staff')}</b></td>
                    <td>${esc(((l.to || '').split('\n')[0]) || (l.fields && l.fields.name) || '—')}</td>
                    <td>
                      <b>${esc(l.subject || l.heading || '—')}</b>
                      ${l.submissionNote ? `<br><small class="mut">📝 Clerk Note: ${esc(l.submissionNote)}</small>` : ''}
                    </td>
                    <td class="acts">
                      <button class="sm" data-open="${l.id}">👁 Inspect / Edit</button>
                      ${isAdmin ? `
                        <button class="sm ok" data-app="${l.id}">✅ Approve &amp; Issue Ref</button>
                        <button class="sm pri" data-signapp="${l.id}">✍️ Live Sign &amp; Issue</button>
                        <button class="sm danger" data-ret="${l.id}">↩ Return</button>
                      ` : '<span class="mut">Awaiting Principal</span>'}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : '<p class="mut">🎉 Zero letters waiting in the Principal Approval Queue.</p>'}
      </div>

      ${returned.length ? `
        <div class="card">
          <h3>↩ Returned for Correction (${returned.length})</h3>
          <div class="table-wrap">
            <table class="tbl">
              <thead><tr><th>Date</th><th>Subject</th><th>Principal's Correction Note</th><th>Action</th></tr></thead>
              <tbody>
                ${returned.map(l => `
                  <tr>
                    <td>${esc(Core.fmtDateDMY(l.date))}</td>
                    <td>${esc(l.subject || l.heading || '—')}</td>
                    <td style="color:#b91c1c"><b>${esc(l.approvalNote || 'Correction requested')}</b> <small class="mut">(${esc(l.reviewedBy || 'Principal')})</small></td>
                    <td><button class="sm pri" data-open="${l.id}">✏️ Revise &amp; Resubmit</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}
    `;

    if (isAdmin && document.getElementById('polToggle')) {
      document.getElementById('polToggle').onchange = async (e) => {
        const next = Object.assign({}, db.settings, { requireApprovalForStaff: e.target.checked });
        await ctx.op('saveSettings', next);
        ctx.toast(e.target.checked ? 'Mandatory Principal Approval enabled for Staff.' : 'Staff allowed to issue Ref. Nos. directly.');
      };
    }

    el.querySelectorAll('[data-open]').forEach(b => b.onclick = () => ctx.openLetter(b.dataset.open));

    el.querySelectorAll('[data-app]').forEach(b => b.onclick = async () => {
      const l = db.letters.find(x => x.id === b.dataset.app);
      const next = Core.peekRef(db, 'out', l.date, l.majorHead).ref;
      if (!confirm(`Approve this letter and assign Official Ref. No. ${next}?`)) return;
      await ctx.op('approveAndIssueLetter', { id: l.id, date: l.date, showSign: true });
      ctx.toast(`Approved & Issued Ref. No. ${next}`);
      renderApprovalQueueView(ctx);
    });

    el.querySelectorAll('[data-signapp]').forEach(b => b.onclick = () => {
      const l = db.letters.find(x => x.id === b.dataset.signapp);
      const next = Core.peekRef(db, 'out', l.date, l.majorHead).ref;
      openSignaturePadModal(ctx, {
        title: `Sign & Issue Ref. No. ${next}`,
        onSigned: async (dataUrl) => {
          const up = await ctx.api('/api/upload-image', { dataUrl, kind: 'livesign' });
          await ctx.op('approveAndIssueLetter', { id: l.id, date: l.date, customStamp: up.url, showSign: true });
          ctx.toast(`Signed & Issued Ref. No. ${next}`);
          renderApprovalQueueView(ctx);
        },
      });
    });

    el.querySelectorAll('[data-ret]').forEach(b => b.onclick = async () => {
      const note = prompt('Enter correction remarks for Office Clerk (सुधार हेतु टिप्पणी):');
      if (note === null) return;
      await ctx.op('returnLetter', { id: b.dataset.ret, note });
      ctx.toast('Returned to clerk with remarks.');
      renderApprovalQueueView(ctx);
    });
  }

  // ==================== 4. BULK MAIL-MERGE & BATCH CERTIFICATE ENGINE ====================
  const batchState = {
    tplId: 'bon',
    lang: 'en',
    source: 'students',
    classFilter: '',
    excelRows: [],
    commonPurpose: 'e-Kalyan / National Scholarship Portal 2026-27',
    commonSession: Core.sessionFromISO(Core.todayISO()),
    subHead: 'Batch-Cert',
    issueRefs: true,
    showSign: true,
    showQr: true,
  };

  function mapPersonToFields(person, kind, lang, common) {
    const isHi = lang === 'hi';
    if (kind === 'staff') {
      return Object.assign({}, common, {
        staff_name: isHi ? (person.nameHi || person.name) : person.name,
        person_name: isHi ? (person.nameHi || person.name) : person.name,
        name: isHi ? (person.nameHi || person.name) : person.name,
        designation: isHi ? (person.designationHi || person.designation) : person.designation,
        emp_id: person.empId || '',
        subject: person.subject || 'General',
        from_date: Core.fmtDateDMY(person.joinDate) || '',
        to_date: Core.fmtDateDMY(Core.todayISO()),
        father: person.fatherOrSpouse || '',
      });
    }
    return Object.assign({}, common, {
      name: isHi ? (person.nameHi || person.name) : person.name,
      student_name: isHi ? (person.nameHi || person.name) : person.name,
      father: isHi ? (person.fatherHi || person.father) : person.father,
      mother: isHi ? (person.motherHi || person.mother) : (person.mother || ''),
      cls: person.cls || '',
      adm: person.admNo || '',
      roll: person.rollNo || '',
      dob: Core.fmtDateDMY(person.dob) || person.dob || '',
      session: person.session || common.session || Core.sessionFromISO(Core.todayISO()),
      from_session: person.session || common.session,
      to_session: person.session || common.session,
      conduct: isHi ? 'उत्तम' : 'Good',
    });
  }

  function renderBatchMailMergeView(ctx) {
    const { db } = ctx;
    const allTpls = ctx.allTemplates();
    const tpl = allTpls.find(t => t.id === batchState.tplId) || allTpls[0];
    const classes = [...new Set(db.students.map(s => s.cls).filter(Boolean))].sort();

    let sourceRecords = [];
    if (batchState.source === 'students') {
      sourceRecords = db.students
        .filter(s => !batchState.classFilter || s.cls === batchState.classFilter)
        .map(s => mapPersonToFields(s, 'students', batchState.lang, {
          purpose: batchState.commonPurpose,
          session: batchState.commonSession,
        }));
    } else if (batchState.source === 'staff') {
      sourceRecords = db.staff.map(s => mapPersonToFields(s, 'staff', batchState.lang, {
        purpose: batchState.commonPurpose,
        session: batchState.commonSession,
      }));
    } else {
      sourceRecords = batchState.excelRows.map(r => Object.assign({
        purpose: batchState.commonPurpose,
        session: batchState.commonSession,
      }, r));
    }

    const headCode = tpl.majorHead || Core.inferMajorHead(tpl.id);
    const firstPeek = Core.peekRef(db, 'out', Core.todayISO(), headCode);
    const lastRef = sourceRecords.length
      ? Core.fmtRef(db.settings.refFormat, firstPeek.n + sourceRecords.length - 1, firstPeek.yk, db.settings.padWidth, headCode)
      : '—';

    const el = document.getElementById('view');
    el.innerHTML = `
      <div class="bar">
        <div>
          <h2 style="margin:0">⚡ Bulk Mail-Merge &amp; Batch Certificate Engine</h2>
          <small class="mut">Generate 10–250 Certificates, Notices, or Letters at once — Combined Print PDF (pdf-lib) or Individual ZIP (JSZip)</small>
        </div>
      </div>

      <div class="card">
        <h3>1. Choose Template &amp; Batch Source</h3>
        <div class="row g">
          <label>Template / Format
            <select id="bmTpl">
              ${allTpls.map(t => `<option value="${t.id}" ${t.id === tpl.id ? 'selected' : ''}>[${esc(t.majorHead || Core.inferMajorHead(t.id))}] ${esc(t.name)}</option>`).join('')}
            </select>
          </label>
          <label>Language (भाषा)
            <select id="bmLang">
              <option value="en" ${batchState.lang === 'en' ? 'selected' : ''}>English</option>
              <option value="hi" ${batchState.lang === 'hi' ? 'selected' : ''}>हिंदी (Devanagari)</option>
            </select>
          </label>
          <label>Data Source (डेटा स्रोत)
            <select id="bmSrc">
              <option value="students" ${batchState.source === 'students' ? 'selected' : ''}>🎓 Student Master Directory (${db.students.length})</option>
              <option value="staff" ${batchState.source === 'staff' ? 'selected' : ''}>👩‍🏫 Staff Master Directory (${db.staff.length})</option>
              <option value="excel" ${batchState.source === 'excel' ? 'selected' : ''}>📊 Custom Uploaded Excel (.xlsx)</option>
            </select>
          </label>
          ${batchState.source === 'students' ? `
            <label>Filter by Class (कक्षा)
              <select id="bmCls">
                <option value="">All Classes (${db.students.length})</option>
                ${classes.map(c => `<option value="${esc(c)}" ${batchState.classFilter === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
              </select>
            </label>
          ` : ''}
        </div>

        ${batchState.source === 'excel' ? `
          <div class="bar" style="background:#f8fafc;padding:10px;border-radius:8px;border:1px dashed #94a3b8;margin-top:6px">
            <button id="bmSampleBtn">⬇ Download Sample Excel for "${esc(tpl.name)}"</button>
            <label class="btn pri" style="margin:0;cursor:pointer">📤 Upload Filled Excel (.xlsx)<input type="file" id="bmFile" accept=".xlsx" hidden></label>
            <span class="mut">${batchState.excelRows.length} rows loaded from Excel.</span>
          </div>
        ` : ''}

        <div class="row g" style="margin-top:10px">
          <label>Default Purpose / Reason (सामान्य प्रयोजन)
            <input id="bmPurp" value="${esc(batchState.commonPurpose)}">
          </label>
          <label>Default Session (सत्र)
            <input id="bmSess" value="${esc(batchState.commonSession)}">
          </label>
          <label>Sub-Head / Batch Tag (संचिका टैग)
            <input id="bmSub" value="${esc(batchState.subHead)}">
          </label>
        </div>

        <div class="bar" style="margin-top:6px">
          <label class="chk"><input type="checkbox" id="bmIssue" ${batchState.issueRefs ? 'checked' : ''}> <b>Allocate Official Sequential Ref. Nos.</b> (${sourceRecords.length ? `${esc(firstPeek.ref)} → ${esc(lastRef)}` : '0 docs'})</label>
          <label class="chk"><input type="checkbox" id="bmSign" ${batchState.showSign ? 'checked' : ''}> Include Signatory Stamp</label>
          <label class="chk"><input type="checkbox" id="bmQr" ${batchState.showQr ? 'checked' : ''}> Include Tamper-Proof QR Code</label>
        </div>
      </div>

      <div class="card">
        <div class="bar">
          <h3 style="margin:0">2. Batch Preview (${sourceRecords.length} Documents Ready)</h3>
          <span class="sp"></span>
          <button class="pri" id="genCombinedPdf" ${!sourceRecords.length ? 'disabled' : ''}>📕 Generate Combined Print PDF (${sourceRecords.length} Pages)</button>
          <button class="ok" id="genZipPdf" ${!sourceRecords.length ? 'disabled' : ''}>📦 Download ZIP of PDFs</button>
          <button id="genZipDocx" ${!sourceRecords.length ? 'disabled' : ''}>📝 Download ZIP of Word (.docx)</button>
        </div>

        ${sourceRecords.length ? `
          <div class="table-wrap">
            <table class="tbl">
              <thead><tr><th>#</th><th>Preview Ref. No.</th><th>Name / Recipient</th><th>Father / Designation</th><th>Class / Dept</th><th>Purpose / Session</th></tr></thead>
              <tbody>
                ${sourceRecords.slice(0, 25).map((r, i) => {
                  const pRef = batchState.issueRefs
                    ? Core.fmtRef(db.settings.refFormat, firstPeek.n + i, firstPeek.yk, db.settings.padWidth, headCode)
                    : 'DRAFT';
                  return `<tr>
                    <td>${i + 1}</td>
                    <td><b>${esc(pRef)}</b></td>
                    <td><b>${esc(r.name || r.staff_name || r.person_name || r.to || '—')}</b></td>
                    <td>${esc(r.father || r.designation || '—')}</td>
                    <td>${esc(r.cls || r.subject || '—')}</td>
                    <td>${esc(r.purpose || r.session || '—')}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
          ${sourceRecords.length > 25 ? `<p class="mut" style="margin-top:6px">…and ${sourceRecords.length - 25} more documents in this batch.</p>` : ''}
        ` : `
          <div class="warn">
            No records selected yet. ${batchState.source === 'students' ? 'Add or import students in <b>🎓 Master Directory</b> first, or switch Data Source to Custom Excel.' : 'Upload a filled Excel sheet above or add records in Master Directory.'}
          </div>
        `}
      </div>
    `;

    document.getElementById('bmTpl').onchange = e => { batchState.tplId = e.target.value; renderBatchMailMergeView(ctx); };
    document.getElementById('bmLang').onchange = e => { batchState.lang = e.target.value; renderBatchMailMergeView(ctx); };
    document.getElementById('bmSrc').onchange = e => { batchState.source = e.target.value; renderBatchMailMergeView(ctx); };
    if (document.getElementById('bmCls')) {
      document.getElementById('bmCls').onchange = e => { batchState.classFilter = e.target.value; renderBatchMailMergeView(ctx); };
    }
    document.getElementById('bmPurp').oninput = e => { batchState.commonPurpose = e.target.value; };
    document.getElementById('bmSess').oninput = e => { batchState.commonSession = e.target.value; };
    document.getElementById('bmSub').oninput = e => { batchState.subHead = e.target.value; };
    document.getElementById('bmIssue').onchange = e => { batchState.issueRefs = e.target.checked; renderBatchMailMergeView(ctx); };
    document.getElementById('bmSign').onchange = e => { batchState.showSign = e.target.checked; };
    document.getElementById('bmQr').onchange = e => { batchState.showQr = e.target.checked; };

    if (document.getElementById('bmSampleBtn')) {
      document.getElementById('bmSampleBtn').onclick = () =>
        ctx.downloadBinary('/api/export/mailmerge-sample', 'POST', { tpl }, `MailMerge_${tpl.id}.xlsx`);
    }
    if (document.getElementById('bmFile')) {
      document.getElementById('bmFile').onchange = async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        const ab = await f.arrayBuffer();
        const bytes = new Uint8Array(ab);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        const res = await ctx.api('/api/import/mailmerge-parse', { base64: btoa(bin) });
        batchState.excelRows = res.rows || [];
        ctx.toast(`Loaded ${batchState.excelRows.length} rows from Excel.`);
        renderBatchMailMergeView(ctx);
      };
    }

    const runBatch = async (outputFormat) => {
      if (!sourceRecords.length) return;
      if (batchState.issueRefs && !confirm(`Issue ${sourceRecords.length} official sequential Reference Numbers (${firstPeek.ref} → ${lastRef}) and generate ${outputFormat}?`)) return;

      const builtLetters = sourceRecords.map(fields => ctx.buildLetterFromTemplateFields(tpl, batchState.lang, fields, {
        majorHead: headCode,
        subHead: batchState.subHead,
        showSign: batchState.showSign,
        showQr: batchState.showQr,
      }));

      await ctx.downloadBinary('/api/batch/generate', 'POST', {
        letters: builtLetters,
        issueRefs: batchState.issueRefs,
        outputFormat,
        date: Core.todayISO(),
      }, outputFormat === 'combined-pdf' ? `Batch_${sourceRecords.length}_Docs.pdf` : `Batch_${sourceRecords.length}_Docs.zip`);

      await ctx.reloadDb();
      renderBatchMailMergeView(ctx);
    };

    document.getElementById('genCombinedPdf').onclick = () => runBatch('combined-pdf');
    document.getElementById('genZipPdf').onclick = () => runBatch('zip-pdf');
    document.getElementById('genZipDocx').onclick = () => runBatch('zip-docx');
  }

  // ==================== 5. STUDENT & STAFF MASTER DIRECTORY ====================
  const dirState = { tab: 'students', q: '', cls: '' };

  function renderMasterDirectoryView(ctx) {
    const { db, auth } = ctx;
    const isAdmin = auth.user && auth.user.role === 'admin';
    const isStu = dirState.tab === 'students';
    const rawList = isStu ? db.students : db.staff;
    const classes = [...new Set(db.students.map(s => s.cls).filter(Boolean))].sort();

    let filtered = rawList.filter(item => !isStu || !dirState.cls || item.cls === dirState.cls);
    if (dirState.q.trim()) {
      if (window.Fuse) {
        const fuse = new window.Fuse(filtered, {
          keys: isStu
            ? ['admNo', 'rollNo', 'name', 'nameHi', 'father', 'fatherHi', 'cls', 'phone']
            : ['empId', 'name', 'nameHi', 'designation', 'subject', 'phone'],
          threshold: 0.34,
        });
        filtered = fuse.search(dirState.q.trim()).map(r => r.item);
      } else {
        const q = dirState.q.toLowerCase();
        filtered = filtered.filter(x => JSON.stringify(x).toLowerCase().includes(q));
      }
    }

    const el = document.getElementById('view');
    el.innerHTML = `
      <div class="bar">
        <div>
          <h2 style="margin:0">🎓 Student &amp; Staff Master Directory (मास्टर कोष)</h2>
          <small class="mut">Import Admission / Staff Excel once → 1-Click Auto-Fill in Certificates &amp; Track Per-Person Issued History</small>
        </div>
        <span class="sp"></span>
        <button class="${isStu ? 'pri' : ''}" id="tabStu">🎓 Students (${db.students.length})</button>
        <button class="${!isStu ? 'pri' : ''}" id="tabStf">👩‍🏫 Staff (${db.staff.length})</button>
      </div>

      <div class="card">
        <div class="bar">
          <input id="dirQ" placeholder="🔍 Fuzzy Search Name, हिंदी नाम, Admission No., Roll, Father, Emp ID…" value="${esc(dirState.q)}" style="max-width:340px">
          ${isStu ? `
            <select id="dirCls" style="max-width:190px">
              <option value="">All Classes</option>
              ${classes.map(c => `<option value="${esc(c)}" ${dirState.cls === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
            </select>
          ` : ''}
          <span class="sp"></span>
          <button class="pri" id="dirAdd">+ Add ${isStu ? 'Student' : 'Staff'}</button>
          <label class="btn ok" style="margin:0;cursor:pointer">📤 Import .xlsx<input type="file" id="dirImp" accept=".xlsx" hidden></label>
          <button id="dirSample">⬇ Sample .xlsx</button>
          <button id="dirExp">📊 Export .xlsx</button>
        </div>

        <div class="table-wrap">
          <table class="tbl">
            <thead>
              ${isStu
                ? '<tr><th>Adm No.</th><th>Roll</th><th>Student Name</th><th>Father Name</th><th>Class</th><th>DOB / Session</th><th>Issued Docs</th><th>Quick Issue / Edit</th></tr>'
                : '<tr><th>Emp ID</th><th>Staff Name</th><th>Designation</th><th>Subject</th><th>Joining Date</th><th>Issued Docs</th><th>Quick Issue / Edit</th></tr>'}
            </thead>
            <tbody>
              ${filtered.map(item => {
                const issuedCount = db.letters.filter(l =>
                  l.ref && (
                    (l.personRef && l.personRef.id === item.id) ||
                    (l.fields && ((item.admNo && l.fields.adm === item.admNo) || (l.fields.name && l.fields.name === item.name) || (l.fields.staff_name && l.fields.staff_name === item.name)))
                  )
                ).length;

                if (isStu) {
                  return `<tr>
                    <td><b>${esc(item.admNo || '—')}</b></td>
                    <td>${esc(item.rollNo || '—')}</td>
                    <td><b>${esc(item.name)}</b>${item.nameHi ? `<br><small class="mut">${esc(item.nameHi)}</small>` : ''}</td>
                    <td>${esc(item.father || '—')}${item.fatherHi ? `<br><small class="mut">${esc(item.fatherHi)}</small>` : ''}</td>
                    <td>${esc(item.cls || '—')}</td>
                    <td>${esc(Core.fmtDateDMY(item.dob) || '—')}<br><small class="mut">${esc(item.session || '')}</small></td>
                    <td><button class="sm" data-hist="${item.id}">📜 ${issuedCount} Docs</button></td>
                    <td class="acts">
                      <button class="sm pri" data-qissue="${item.id}" data-tpl="bon">Bonafide</button>
                      <button class="sm" data-qissue="${item.id}" data-tpl="char">Character</button>
                      <button class="sm" data-qissue="${item.id}" data-tpl="fee_cert">Fee Cert</button>
                      <button class="sm" data-edit="${item.id}">✏️</button>
                      ${isAdmin ? `<button class="sm danger" data-del="${item.id}">🗑</button>` : ''}
                    </td>
                  </tr>`;
                }
                return `<tr>
                  <td><b>${esc(item.empId || '—')}</b></td>
                  <td><b>${esc(item.name)}</b>${item.nameHi ? `<br><small class="mut">${esc(item.nameHi)}</small>` : ''}</td>
                  <td>${esc(item.designation || '—')}</td>
                  <td>${esc(item.subject || '—')}</td>
                  <td>${esc(Core.fmtDateDMY(item.joinDate) || '—')}</td>
                  <td><button class="sm" data-hist="${item.id}">📜 ${issuedCount} Docs</button></td>
                  <td class="acts">
                    <button class="sm pri" data-qissue="${item.id}" data-tpl="exp">Experience</button>
                    <button class="sm" data-qissue="${item.id}" data-tpl="relieve">Relieving</button>
                    <button class="sm" data-qissue="${item.id}" data-tpl="noc">NOC</button>
                    <button class="sm" data-edit="${item.id}">✏️</button>
                    ${isAdmin ? `<button class="sm danger" data-del="${item.id}">🗑</button>` : ''}
                  </td>
                </tr>`;
              }).join('') || `<tr><td colspan="8" class="mut">No ${isStu ? 'student' : 'staff'} records yet. Click "+ Add" or "📤 Import .xlsx" (or download Sample .xlsx to see columns).</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('tabStu').onclick = () => { dirState.tab = 'students'; renderMasterDirectoryView(ctx); };
    document.getElementById('tabStf').onclick = () => { dirState.tab = 'staff'; renderMasterDirectoryView(ctx); };
    document.getElementById('dirQ').oninput = e => { dirState.q = e.target.value; renderMasterDirectoryView(ctx); };
    if (document.getElementById('dirCls')) {
      document.getElementById('dirCls').onchange = e => { dirState.cls = e.target.value; renderMasterDirectoryView(ctx); };
    }

    document.getElementById('dirSample').onclick = () =>
      ctx.downloadBinary(`/api/export/directory-xlsx?kind=${dirState.tab}&sample=1`, 'GET', null, `Sample_${dirState.tab}.xlsx`);
    document.getElementById('dirExp').onclick = () =>
      ctx.downloadBinary(`/api/export/directory-xlsx?kind=${dirState.tab}&sample=0`, 'GET', null, `${dirState.tab}_Directory.xlsx`);

    document.getElementById('dirImp').onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const ab = await f.arrayBuffer();
      const bytes = new Uint8Array(ab);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const res = await ctx.api('/api/import/directory-xlsx', { base64: btoa(bin), kind: dirState.tab });
      await ctx.reloadDb();
      ctx.toast(`Imported! Added: ${res.stats.added}, Updated: ${res.stats.updated}`);
      renderMasterDirectoryView(ctx);
    };

    document.getElementById('dirAdd').onclick = () => openPersonModal(ctx, dirState.tab, null, () => renderMasterDirectoryView(ctx));
    el.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
      const item = rawList.find(x => x.id === b.dataset.edit);
      openPersonModal(ctx, dirState.tab, item, () => renderMasterDirectoryView(ctx));
    });
    el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!confirm('Delete this record from Master Directory?')) return;
      await ctx.op(isStu ? 'deleteStudent' : 'deleteStaff', { id: b.dataset.del });
      renderMasterDirectoryView(ctx);
    });
    el.querySelectorAll('[data-qissue]').forEach(b => b.onclick = () => {
      const person = rawList.find(x => x.id === b.dataset.qissue);
      ctx.startLetterForPerson(person, dirState.tab, b.dataset.tpl);
    });
    el.querySelectorAll('[data-hist]').forEach(b => b.onclick = () => {
      const person = rawList.find(x => x.id === b.dataset.hist);
      const history = db.letters.filter(l =>
        (l.personRef && l.personRef.id === person.id) ||
        (l.fields && ((person.admNo && l.fields.adm === person.admNo) || (l.fields.name && l.fields.name === person.name) || (l.fields.staff_name && l.fields.staff_name === person.name)))
      );
      ctx.modal(`
        <h3>📜 Document History — ${esc(person.name)}</h3>
        ${history.length ? `
          <table class="tbl">
            <thead><tr><th>Ref. No.</th><th>Date</th><th>Document</th><th>Status</th><th></th></tr></thead>
            <tbody>
              ${history.map(l => `<tr>
                <td><b>${esc(l.ref || 'DRAFT')}</b></td>
                <td>${esc(Core.fmtDateDMY(l.date))}</td>
                <td>${esc(l.heading || l.subject || l.tpl)}</td>
                <td><span class="pill p-${l.status}">${esc(l.status)}</span></td>
                <td><button class="sm" data-ol="${l.id}">Open</button></td>
              </tr>`).join('')}
            </tbody>
          </table>
        ` : '<p class="mut">No letters or certificates issued to this person yet.</p>'}
        <div class="bar" style="margin-top:12px"><span class="sp"></span><button id="hClose">Close</button></div>
      `);
      document.getElementById('hClose').onclick = () => ctx.closeModal();
      document.querySelectorAll('[data-ol]').forEach(ob => ob.onclick = () => { ctx.closeModal(); ctx.openLetter(ob.dataset.ol); });
    });
  }

  function openPersonModal(ctx, kind, existing, onDone) {
    const isStu = kind === 'students';
    const p = existing || {};
    ctx.modal(`
      <h3>${existing ? '✏️ Edit' : '+ Add'} ${isStu ? 'Student (छात्रा विवरण)' : 'Staff Member (शिक्षक/कर्मी विवरण)'}</h3>
      ${isStu ? `
        <div class="row g">
          <label>Admission No. (प्रवेश सं.)<input id="pAdm" value="${esc(p.admNo || '')}" placeholder="2024/118"></label>
          <label>Roll No. (क्रमांक)<input id="pRoll" value="${esc(p.rollNo || '')}" placeholder="14"></label>
          <label>Class &amp; Section (कक्षा)<input id="pCls" value="${esc(p.cls || '')}" placeholder="Class XII (Science)"></label>
        </div>
        <div class="row g">
          <label>Student Name (English)*<input id="pName" value="${esc(p.name || '')}" placeholder="Kumari Anita Tudu"></label>
          <label>छात्रा का नाम (हिंदी)<input id="pNameHi" value="${esc(p.nameHi || '')}" placeholder="कुमारी अनिता टुडू"></label>
        </div>
        <div class="row g">
          <label>Father's Name (English)<input id="pFat" value="${esc(p.father || '')}" placeholder="Shri Rameshwar Tudu"></label>
          <label>पिता का नाम (हिंदी)<input id="pFatHi" value="${esc(p.fatherHi || '')}" placeholder="श्री रामेश्वर टुडू"></label>
        </div>
        <div class="row g">
          <label>Mother's Name<input id="pMot" value="${esc(p.mother || '')}"></label>
          <label>Date of Birth<input type="date" id="pDob" value="${esc(p.dob || '')}"></label>
          <label>Session (सत्र)<input id="pSess" value="${esc(p.session || Core.sessionFromISO(Core.todayISO()))}"></label>
        </div>
        <div class="row g">
          <label>Category (ST/SC/OBC/Gen)<input id="pCat" value="${esc(p.category || '')}"></label>
          <label>Guardian Phone<input id="pPh" value="${esc(p.phone || '')}"></label>
        </div>
      ` : `
        <div class="row g">
          <label>Employee / Teacher ID<input id="pEmp" value="${esc(p.empId || '')}" placeholder="JH-EDU-1024"></label>
          <label>Staff Name (English)*<input id="pName" value="${esc(p.name || '')}" placeholder="Smt. Kavita Murmu"></label>
          <label>नाम (हिंदी)<input id="pNameHi" value="${esc(p.nameHi || '')}" placeholder="श्रीमती कविता मुर्मू"></label>
        </div>
        <div class="row g">
          <label>Designation (English)<input id="pDes" value="${esc(p.designation || '')}" placeholder="PGT History"></label>
          <label>पदनाम (हिंदी)<input id="pDesHi" value="${esc(p.designationHi || '')}" placeholder="स्नातकोत्तर शिक्षिका"></label>
        </div>
        <div class="row g">
          <label>Subject / Dept<input id="pSubj" value="${esc(p.subject || '')}"></label>
          <label>Joining Date<input type="date" id="pJoin" value="${esc(p.joinDate || '')}"></label>
          <label>Phone<input id="pPh" value="${esc(p.phone || '')}"></label>
        </div>
      `}
      <div class="bar" style="margin-top:12px">
        <span class="sp"></span>
        <button id="pmCancel">Cancel</button>
        <button class="pri" id="pmSave">💾 Save Record</button>
      </div>
    `);

    document.getElementById('pmCancel').onclick = () => ctx.closeModal();
    document.getElementById('pmSave').onclick = async () => {
      const payload = isStu ? {
        id: p.id,
        admNo: document.getElementById('pAdm').value,
        rollNo: document.getElementById('pRoll').value,
        cls: document.getElementById('pCls').value,
        name: document.getElementById('pName').value,
        nameHi: document.getElementById('pNameHi').value,
        father: document.getElementById('pFat').value,
        fatherHi: document.getElementById('pFatHi').value,
        mother: document.getElementById('pMot').value,
        dob: document.getElementById('pDob').value,
        session: document.getElementById('pSess').value,
        category: document.getElementById('pCat').value,
        phone: document.getElementById('pPh').value,
      } : {
        id: p.id,
        empId: document.getElementById('pEmp').value,
        name: document.getElementById('pName').value,
        nameHi: document.getElementById('pNameHi').value,
        designation: document.getElementById('pDes').value,
        designationHi: document.getElementById('pDesHi').value,
        subject: document.getElementById('pSubj').value,
        joinDate: document.getElementById('pJoin').value,
        phone: document.getElementById('pPh').value,
      };
      await ctx.op(isStu ? 'saveStudent' : 'saveStaff', payload);
      ctx.closeModal();
      ctx.toast('Saved to Master Directory.');
      if (onDone) onDone();
    };
  }

  // ==================== 6. VISUAL ANALYTICS & INSPECTION AUDIT VIEW ====================
  function renderAnalyticsAuditView(ctx) {
    const { db } = ctx;
    const heads = db.settings.majorHeads || Core.DEFAULT_MAJOR_HEADS;
    const issued = db.letters.filter(l => l.status === 'issued' || l.status === 'dispatched');
    const dispatched = db.letters.filter(l => l.status === 'dispatched');
    const overdueInw = db.inward.filter(r => Core.inwardDeadlineMeta(r).overdue);
    const repliedInw = db.inward.filter(r => r.status === 'replied');
    const needReplyInw = db.inward.filter(r => r.needsReply);

    const headCounts = heads.map(h => ({
      code: h.code,
      label: `${h.code} — ${h.en}`,
      out: issued.filter(l => (l.majorHead || 'ADM') === h.code).length,
      inw: db.inward.filter(r => (r.majorHead || 'ADM') === h.code).length,
    }));
    const maxHead = Math.max(1, ...headCounts.map(x => x.out + x.inw));

    // Monthly breakdown (last 6 active months or current year)
    const monthMap = {};
    issued.forEach(l => {
      const ym = String(l.date || '').slice(0, 7) || 'Unknown';
      monthMap[ym] = monthMap[ym] || { out: 0, inw: 0 };
      monthMap[ym].out++;
    });
    db.inward.forEach(r => {
      const ym = String(r.date || '').slice(0, 7) || 'Unknown';
      monthMap[ym] = monthMap[ym] || { out: 0, inw: 0 };
      monthMap[ym].inw++;
    });
    const months = Object.keys(monthMap).sort().slice(-8);

    const slaRate = needReplyInw.length
      ? Math.round(((needReplyInw.length - overdueInw.length) / needReplyInw.length) * 100)
      : 100;

    const el = document.getElementById('view');
    el.innerHTML = `
      <div class="bar">
        <div>
          <h2 style="margin:0">📈 Analytics, Compliance &amp; Inspection Audit</h2>
          <small class="mut">Real-time Major-Head breakdown, Monthly volume, RTI/SLA compliance, and 1-click DEO/CBSE Inspection Report</small>
        </div>
        <span class="sp"></span>
        <button class="pri" id="dlInspectPdf">📕 Download Official Inspection Summary (.pdf)</button>
        <button class="ok" id="dlRegXlsxA">📊 Download Full 4-Sheet Excel (.xlsx)</button>
      </div>

      <div class="stats">
        <div class="stat"><b>${issued.length}</b><span>Total Outward Issued</span></div>
        <div class="stat"><b>${issued.length ? Math.round((dispatched.length / issued.length) * 100) : 100}%</b><span>Dispatch Completion Rate</span></div>
        <div class="stat"><b>${slaRate}%</b><span>Inward SLA On-Time Rate</span></div>
        <div class="stat"><b>${repliedInw.length}/${needReplyInw.length}</b><span>Inward Replies Completed</span></div>
        <div class="stat"><b>${db.students.length + db.staff.length}</b><span>Directory Profiles</span></div>
      </div>

      <div class="card">
        <h3>📊 Major Head Correspondence Distribution (मुख्य शीर्षवार पत्राचार)</h3>
        ${headCounts.map(hc => {
          const total = hc.out + hc.inw;
          const pct = Math.round((total / maxHead) * 100);
          return `
            <div class="bar-chart-row">
              <div><b>${esc(hc.code)}</b> <span class="mut">${esc(hc.label.split('—')[1] || '')}</span></div>
              <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
              <div style="text-align:right"><b>${hc.out}</b><small class="mut"> out / ${hc.inw} in</small></div>
            </div>
          `;
        }).join('')}
      </div>

      <div class="card">
        <h3>📅 Monthly Outward vs Inward Volume (मासिक पत्राचार विवरण)</h3>
        ${months.length ? `
          <table class="tbl">
            <thead><tr><th>Month (YYYY-MM)</th><th>Outward Issued (जावक)</th><th>Inward Logged (आवक)</th><th>Total Activity</th></tr></thead>
            <tbody>
              ${months.map(m => `<tr>
                <td><b>${esc(m)}</b></td>
                <td>${monthMap[m].out}</td>
                <td>${monthMap[m].inw}</td>
                <td><b>${monthMap[m].out + monthMap[m].inw}</b></td>
              </tr>`).join('')}
            </tbody>
          </table>
        ` : '<p class="mut">Issue or log letters to see monthly trends.</p>'}
      </div>
    `;

    document.getElementById('dlInspectPdf').onclick = () =>
      ctx.downloadBinary('/api/export/inspection-pdf', 'GET', null, `Inspection_Audit_Report_${Core.todayISO()}.pdf`);
    document.getElementById('dlRegXlsxA').onclick = () =>
      ctx.downloadBinary('/api/export/register-xlsx', 'GET', null, `Master_Letter_Register_${Core.todayISO()}.xlsx`);
  }

  root.ModulesUI = {
    openSignaturePadModal,
    openPhrasebookModal,
    renderApprovalQueueView,
    renderBatchMailMergeView,
    renderMasterDirectoryView,
    renderAnalyticsAuditView,
    mapPersonToFields,
  };
})(typeof self !== 'undefined' ? self : this);
