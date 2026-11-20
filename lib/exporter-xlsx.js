'use strict';

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const Core = require('../public/core.js');

function styleHeaderRow(row, bgColor = 'FF1F3A5F') {
  row.height = 24;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10.5, name: 'Calibri' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });
}

function styleDataRow(row, isEven) {
  row.eachCell((cell) => {
    cell.font = { size: 10, name: 'Calibri' };
    cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
    if (isEven) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    };
  });
}

async function buildMasterRegisterWorkbook(db, filterOpts = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Letter Draft Assistant v3.0';
  wb.created = new Date();

  const S = db.settings || Core.defaultSettings();
  const schoolTitle = S.school.en || S.school.name || 'Official Letter Register';

  // ==================== SHEET 1: OUTWARD REGISTER ====================
  const wsOut = wb.addWorksheet('Outward Register (जावक पंजी)', {
    views: [{ state: 'frozen', ySplit: 2 }],
  });

  wsOut.mergeCells('A1:O1');
  const titleCell = wsOut.getCell('A1');
  titleCell.value = `${schoolTitle} — Outward Letter Register (जावक पत्र पंजी) | U-DISE: ${S.school.udise || ''}`;
  titleCell.font = { bold: true, size: 13, color: { argb: 'FF1F3A5F' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  wsOut.getRow(1).height = 28;

  const outCols = [
    { header: 'Sl. No.', key: 'sl', width: 8 },
    { header: 'Letter / Ref. No. (पत्रांक)', key: 'ref', width: 18 },
    { header: 'Date (दिनांक)', key: 'date', width: 13 },
    { header: 'Session / Year', key: 'year', width: 13 },
    { header: 'Major Head Code', key: 'headCode', width: 15 },
    { header: 'Major Head (मुख्य शीर्ष)', key: 'headName', width: 32 },
    { header: 'Sub-Head / File No. (उप-शीर्ष)', key: 'subHead', width: 22 },
    { header: 'Template / Category', key: 'tpl', width: 18 },
    { header: 'Language', key: 'lang', width: 10 },
    { header: 'Recipient / Party (प्राप्तकर्ता)', key: 'to', width: 32 },
    { header: 'Subject / Heading (विषय)', key: 'subject', width: 42 },
    { header: 'Status (स्थिति)', key: 'status', width: 15 },
    { header: 'Dispatch Details (प्रेषण विवरण)', key: 'dispatch', width: 26 },
    { header: 'Signatory (हस्ताक्षरकर्ता)', key: 'sig', width: 22 },
    { header: 'Remarks / Reply Note (टिप्पणी)', key: 'remarks', width: 28 },
  ];

  wsOut.getRow(2).values = outCols.map(c => c.header);
  outCols.forEach((c, i) => { wsOut.getColumn(i + 1).width = c.width; });
  styleHeaderRow(wsOut.getRow(2));
  wsOut.autoFilter = 'A2:O2';

  let letters = [...(db.letters || [])];
  if (filterOpts.majorHead) letters = letters.filter(l => l.majorHead === filterOpts.majorHead);
  if (filterOpts.status) letters = letters.filter(l => l.status === filterOpts.status);
  if (filterOpts.year) letters = letters.filter(l => String(l.refYear || (l.date || '').slice(0, 4)) === String(filterOpts.year));
  if (filterOpts.q) {
    const q = String(filterOpts.q).toLowerCase();
    letters = letters.filter(l =>
      [l.ref, l.to, l.subject, l.heading, l.majorHead, l.subHead, l.remarks]
        .some(x => String(x || '').toLowerCase().includes(q))
    );
  }
  letters.sort((a, b) => (a.refYear || 0) - (b.refYear || 0) || (a.refNo || 999999) - (b.refNo || 999999));

  letters.forEach((l, idx) => {
    const mh = Core.getMajorHeadObj(db, l.majorHead);
    const sg = (S.signatories || []).find(s => s.id === l.sig) || {};
    const disp = l.dispatch
      ? `${l.dispatch.mode || ''}${l.dispatch.tracking ? ' #' + l.dispatch.tracking : ''}${l.dispatch.date ? ' (' + Core.fmtDateDMY(l.dispatch.date) + ')' : ''}`
      : '';
    const rNote = [l.remarks, l.reply ? `Reply: ${l.reply}` : '', l.cancelReason ? `Cancelled: ${l.cancelReason}` : '']
      .filter(Boolean).join(' | ');

    const row = wsOut.addRow([
      idx + 1,
      l.ref || 'DRAFT',
      Core.fmtDateDMY(l.date),
      l.refYear || Core.sessionFromISO(l.date),
      mh.code,
      `${mh.en} / ${mh.hi}`,
      l.subHead || '',
      l.tpl || 'custom',
      l.lang === 'hi' ? 'Hindi (हिंदी)' : 'English',
      (l.to || '').replace(/\n+/g, ', ') || (l.fields && l.fields.name) || '',
      (l.subject || l.heading || '').replace(/‹([^›]+)›/g, '[$1]'),
      l.status || 'draft',
      disp,
      sg.name || '',
      rNote,
    ]);
    styleDataRow(row, idx % 2 === 1);
  });

  // ==================== SHEET 2: INWARD REGISTER ====================
  const wsIn = wb.addWorksheet('Inward Register (आवक पंजी)', {
    views: [{ state: 'frozen', ySplit: 2 }],
  });

  wsIn.mergeCells('A1:L1');
  const inTitle = wsIn.getCell('A1');
  inTitle.value = `${schoolTitle} — Inward / Receipt Register (आवक पत्र पंजी)`;
  inTitle.font = { bold: true, size: 13, color: { argb: 'FF14532D' } };
  inTitle.alignment = { vertical: 'middle', horizontal: 'center' };
  wsIn.getRow(1).height = 28;

  const inCols = [
    { header: 'Sl. No.', width: 8 },
    { header: 'Inward No. (आवक सं.)', width: 18 },
    { header: 'Received Date (प्राप्ति तिथि)', width: 15 },
    { header: 'Priority (प्राथमिकता)', width: 16 },
    { header: 'Due Date (अंतिम तिथि)', width: 15 },
    { header: 'Major Head Code', width: 15 },
    { header: 'Major Head (मुख्य शीर्ष)', width: 30 },
    { header: 'Sub-Head / File No.', width: 20 },
    { header: 'Received From (प्रेषक)', width: 30 },
    { header: 'Sender Letter No. & Date', width: 24 },
    { header: 'Subject (विषय)', width: 42 },
    { header: 'Status & Linked Reply', width: 26 },
  ];
  wsIn.getRow(2).values = inCols.map(c => c.header);
  inCols.forEach((c, i) => { wsIn.getColumn(i + 1).width = c.width; });
  styleHeaderRow(wsIn.getRow(2), 'FF166534');
  wsIn.autoFilter = 'A2:L2';

  (db.inward || []).forEach((r, idx) => {
    const mh = Core.getMajorHeadObj(db, r.majorHead);
    const row = wsIn.addRow([
      idx + 1,
      r.no || '',
      Core.fmtDateDMY(r.date),
      r.priority || 'normal',
      r.dueDate ? Core.fmtDateDMY(r.dueDate) : '',
      mh.code,
      `${mh.en} / ${mh.hi}`,
      r.subHead || '',
      r.from || '',
      r.senderRef || '',
      r.subject || '',
      r.reply ? `Replied (${r.reply.ref})` : (r.status || ''),
    ]);
    styleDataRow(row, idx % 2 === 1);
  });

  // ==================== SHEET 3: MAJOR HEAD SUMMARY ====================
  const wsSum = wb.addWorksheet('Major Heads Summary (मद सारांश)', {
    views: [{ state: 'frozen', ySplit: 2 }],
  });
  wsSum.mergeCells('A1:G1');
  const sumTitle = wsSum.getCell('A1');
  sumTitle.value = `${schoolTitle} — Major Head-Wise Correspondence Summary (मुख्य शीर्ष सारांश)`;
  sumTitle.font = { bold: true, size: 13, color: { argb: 'FF1E3A8A' } };
  sumTitle.alignment = { vertical: 'middle', horizontal: 'center' };
  wsSum.getRow(1).height = 28;

  const sumCols = [
    { header: 'Major Head Code', width: 18 },
    { header: 'Major Head (English)', width: 34 },
    { header: 'मुख्य शीर्ष (हिंदी)', width: 34 },
    { header: 'Outward Issued', width: 18 },
    { header: 'Outward Dispatched', width: 18 },
    { header: 'Inward Received', width: 18 },
    { header: 'Pending Action', width: 18 },
  ];
  wsSum.getRow(2).values = sumCols.map(c => c.header);
  sumCols.forEach((c, i) => { wsSum.getColumn(i + 1).width = c.width; });
  styleHeaderRow(wsSum.getRow(2), 'FF1E3A8A');

  (S.majorHeads || Core.DEFAULT_MAJOR_HEADS).forEach((h, idx) => {
    const outList = (db.letters || []).filter(l => (l.majorHead || 'ADM') === h.code);
    const inList = (db.inward || []).filter(r => (r.majorHead || 'ADM') === h.code);
    const row = wsSum.addRow([
      h.code,
      h.en,
      h.hi,
      outList.filter(l => l.status === 'issued' || l.status === 'dispatched').length,
      outList.filter(l => l.status === 'dispatched').length,
      inList.length,
      inList.filter(r => r.status === 'pending').length + outList.filter(l => l.awaitingReply && !l.reply).length,
    ]);
    styleDataRow(row, idx % 2 === 1);
  });

  // ==================== SHEET 4: STUDENT DIRECTORY ====================
  if ((db.students || []).length) {
    const wsStu = wb.addWorksheet('Student Directory (छात्रा कोष)', { views: [{ state: 'frozen', ySplit: 1 }] });
    const stuCols = [
      { header: 'Admission No', width: 16 },
      { header: 'Roll No', width: 10 },
      { header: 'Student Name (EN)', width: 26 },
      { header: 'छात्रा का नाम (HI)', width: 26 },
      { header: 'Father Name (EN)', width: 24 },
      { header: 'पिता का नाम (HI)', width: 24 },
      { header: 'Mother Name', width: 22 },
      { header: 'Class & Section', width: 16 },
      { header: 'DOB (YYYY-MM-DD)', width: 16 },
      { header: 'Session', width: 14 },
      { header: 'Category', width: 12 },
      { header: 'Phone', width: 16 },
    ];
    wsStu.getRow(1).values = stuCols.map(c => c.header);
    stuCols.forEach((c, i) => { wsStu.getColumn(i + 1).width = c.width; });
    styleHeaderRow(wsStu.getRow(1), 'FF0F766E');
    db.students.forEach((s, i) => {
      const r = wsStu.addRow([s.admNo, s.rollNo, s.name, s.nameHi, s.father, s.fatherHi, s.mother, s.cls, s.dob, s.session, s.category, s.phone]);
      styleDataRow(r, i % 2 === 1);
    });
  }

  return wb;
}

async function generateRegisterXlsxBuffer(db, filterOpts = {}) {
  const wb = await buildMasterRegisterWorkbook(db, filterOpts);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

async function syncMasterExcelFile(db, filePath) {
  const buf = await generateRegisterXlsxBuffer(db);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, filePath);
  return filePath;
}

async function buildDirectoryWorkbookBuffer(db, kind = 'students', sampleOnly = false) {
  const wb = new ExcelJS.Workbook();
  if (kind === 'staff') {
    const ws = wb.addWorksheet('Staff Directory');
    const cols = [
      { header: 'Employee ID', width: 16 },
      { header: 'Staff Name (EN)', width: 26 },
      { header: 'नाम (HI)', width: 26 },
      { header: 'Designation (EN)', width: 22 },
      { header: 'पदनाम (HI)', width: 22 },
      { header: 'Subject', width: 18 },
      { header: 'Joining Date (YYYY-MM-DD)', width: 18 },
      { header: 'Phone', width: 16 },
      { header: 'Email', width: 24 },
    ];
    ws.getRow(1).values = cols.map(c => c.header);
    cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });
    styleHeaderRow(ws.getRow(1), 'FF1E3A8A');
    const list = sampleOnly ? [
      { empId: 'JH-EDU-1024', name: 'Smt. Kavita Murmu', nameHi: 'श्रीमती कविता मुर्मू', designation: 'PGT History', designationHi: 'स्नातकोत्तर शिक्षिका (इतिहास)', subject: 'History', joinDate: '2018-07-12', phone: '9876543210', email: 'kavita@example.edu.in' },
    ] : (db.staff || []);
    list.forEach((s, i) => {
      const r = ws.addRow([s.empId, s.name, s.nameHi, s.designation, s.designationHi, s.subject, s.joinDate, s.phone, s.email]);
      styleDataRow(r, i % 2 === 1);
    });
  } else {
    const ws = wb.addWorksheet('Student Directory');
    const cols = [
      { header: 'Admission No', width: 16 },
      { header: 'Roll No', width: 10 },
      { header: 'Student Name (EN)', width: 26 },
      { header: 'छात्रा का नाम (HI)', width: 26 },
      { header: 'Father Name (EN)', width: 24 },
      { header: 'पिता का नाम (HI)', width: 24 },
      { header: 'Mother Name', width: 22 },
      { header: 'Class & Section', width: 16 },
      { header: 'DOB (YYYY-MM-DD)', width: 16 },
      { header: 'Session', width: 14 },
      { header: 'Category', width: 12 },
      { header: 'Phone', width: 16 },
    ];
    ws.getRow(1).values = cols.map(c => c.header);
    cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });
    styleHeaderRow(ws.getRow(1), 'FF0F766E');
    const list = sampleOnly ? [
      { admNo: '2024/118', rollNo: '14', name: 'Kumari Anita Tudu', nameHi: 'कुमारी अनिता टुडू', father: 'Shri Rameshwar Tudu', fatherHi: 'श्री रामेश्वर टुडू', mother: 'Smt. Phoolmani Tudu', cls: 'Class XII (Science)', dob: '2009-05-14', session: '2026-27', category: 'ST', phone: '9000011111' },
      { admNo: '2024/119', rollNo: '15', name: 'Kumari Priya Kumari', nameHi: 'कुमारी प्रिया कुमारी', father: 'Shri Manoj Prasad', fatherHi: 'श्री मनोज प्रसाद', mother: 'Smt. Sunita Devi', cls: 'Class XII (Science)', dob: '2009-08-22', session: '2026-27', category: 'OBC', phone: '9000022222' },
    ] : (db.students || []);
    list.forEach((s, i) => {
      const r = ws.addRow([s.admNo, s.rollNo, s.name, s.nameHi, s.father, s.fatherHi, s.mother, s.cls, s.dob, s.session, s.category, s.phone]);
      styleDataRow(r, i % 2 === 1);
    });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function cellStr(val) {
  if (val === null || val === undefined) return '';
  if (val instanceof Date && !isNaN(val)) return val.toISOString().slice(0, 10);
  if (typeof val === 'object' && val.text) return String(val.text).trim();
  return String(val).trim();
}

async function parseDirectoryExcelBuffer(buf, kind = 'students') {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Excel file has no worksheets.');

  let headerRowIdx = 1;
  let headers = [];
  for (let r = 1; r <= Math.min(5, ws.rowCount); r++) {
    const vals = [];
    ws.getRow(r).eachCell({ includeEmpty: true }, (c, col) => { vals[col] = cellStr(c.value).toLowerCase(); });
    if (vals.some(v => v && (v.includes('name') || v.includes('नाम') || v.includes('adm') || v.includes('emp')))) {
      headerRowIdx = r;
      headers = vals;
      break;
    }
  }
  if (!headers.length) throw new Error('Could not detect Directory column headers.');

  const colOf = (...terms) => {
    for (let i = 1; i < headers.length; i++) {
      const h = headers[i] || '';
      if (terms.some(t => h.includes(t))) return i;
    }
    return -1;
  };

  const rows = [];
  if (kind === 'staff') {
    const cEmp = colOf('emp', 'id', 'कर्मी');
    const cName = colOf('name (en)', 'staff name', 'teacher', 'name');
    const cNameHi = colOf('नाम', 'name (hi)');
    const cDesig = colOf('designation (en)', 'designation', 'post');
    const cDesigHi = colOf('पदनाम', 'designation (hi)');
    const cSubj = colOf('subject', 'विषय');
    const cJoin = colOf('join', 'योगदान');
    const cPhone = colOf('phone', 'mobile', 'मोबाइल');
    const cEmail = colOf('email', 'ईमेल');

    for (let r = headerRowIdx + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const get = idx => (idx > 0 ? cellStr(row.getCell(idx).value) : '');
      const name = get(cName) || get(cNameHi);
      if (!name) continue;
      rows.push({
        empId: get(cEmp),
        name,
        nameHi: get(cNameHi),
        designation: get(cDesig),
        designationHi: get(cDesigHi),
        subject: get(cSubj),
        joinDate: get(cJoin),
        phone: get(cPhone),
        email: get(cEmail),
      });
    }
  } else {
    const cAdm = colOf('adm', 'प्रवेश', 'sr no');
    const cRoll = colOf('roll', 'क्रमांक');
    const cName = colOf('student name', 'name (en)', 'name');
    const cNameHi = colOf('छात्रा', 'नाम (hi)', 'name (hi)');
    const cFather = colOf('father name (en)', 'father');
    const cFatherHi = colOf('पिता');
    const cMother = colOf('mother', 'माता');
    const cCls = colOf('class', 'कक्षा');
    const cDob = colOf('dob', 'birth', 'जन्म');
    const cSess = colOf('session', 'सत्र');
    const cCat = colOf('category', 'कोटि', 'caste');
    const cPhone = colOf('phone', 'mobile', 'मोबाइल');

    for (let r = headerRowIdx + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const get = idx => (idx > 0 ? cellStr(row.getCell(idx).value) : '');
      const name = get(cName) || get(cNameHi);
      if (!name) continue;
      rows.push({
        admNo: get(cAdm),
        rollNo: get(cRoll),
        name,
        nameHi: get(cNameHi),
        father: get(cFather),
        fatherHi: get(cFatherHi),
        mother: get(cMother),
        cls: get(cCls),
        dob: get(cDob),
        session: get(cSess),
        category: get(cCat),
        phone: get(cPhone),
      });
    }
  }
  return rows;
}

async function buildTemplateMailMergeSampleBuffer(tpl) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('MailMerge_Data');
  const fields = (tpl && tpl.fields) || [{ k: 'name', l: 'Name', ph: 'Sample Name' }];
  ws.getRow(1).values = fields.map(f => f.k);
  ws.getRow(2).values = fields.map(f => f.ph || f.l || f.k);
  fields.forEach((_, i) => { ws.getColumn(i + 1).width = 24; });
  styleHeaderRow(ws.getRow(1), 'FF1D4ED8');
  styleDataRow(ws.getRow(2), false);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function parseGenericMailMergeExcelBuffer(buf) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws || ws.rowCount < 2) throw new Error('Excel sheet must have a header row and at least 1 data row.');

  const headers = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, col) => {
    headers[col] = cellStr(c.value).replace(/[^a-zA-Z0-9_]/g, '').trim();
  });

  const rows = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const obj = {};
    let nonEmpty = false;
    for (let col = 1; col < headers.length; col++) {
      const k = headers[col];
      if (!k) continue;
      const v = cellStr(row.getCell(col).value);
      if (v) nonEmpty = true;
      obj[k] = v;
    }
    if (nonEmpty) rows.push(obj);
  }
  return { headers: headers.filter(Boolean), rows };
}

async function parseImportedRegisterXlsx(buf) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Excel file has no worksheets.');

  let headerRowIdx = 1;
  let headers = [];
  for (let r = 1; r <= Math.min(5, ws.rowCount); r++) {
    const vals = [];
    ws.getRow(r).eachCell({ includeEmpty: true }, (c, colNumber) => {
      vals[colNumber] = String(c.value || '').trim().toLowerCase();
    });
    if (vals.some(v => v.includes('ref') || v.includes('पत्रांक') || v.includes('subject') || v.includes('विषय'))) {
      headerRowIdx = r;
      headers = vals;
      break;
    }
  }
  if (!headers.length) throw new Error('Could not find Ref. No. / Subject header row in Excel.');

  const findCol = (...terms) => {
    for (let i = 1; i < headers.length; i++) {
      const h = headers[i] || '';
      if (terms.some(t => h.includes(t))) return i;
    }
    return -1;
  };

  const cRef = findCol('ref', 'पत्रांक', 'letter no');
  const cDate = findCol('date', 'दिनांक');
  const cHeadCode = findCol('head code');
  const cHead = findCol('major head', 'मुख्य शीर्ष');
  const cSub = findCol('sub-head', 'उप-शीर्ष', 'file');
  const cTo = findCol('recipient', 'प्राप्तकर्ता', 'to', 'party');
  const cSubj = findCol('subject', 'विषय', 'heading');
  const cStatus = findCol('status', 'स्थिति');
  const cRem = findCol('remark', 'टिप्पणी');

  const imported = [];
  for (let r = headerRowIdx + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const getVal = idx => (idx > 0 ? cellStr(row.getCell(idx).value) : '');
    const ref = getVal(cRef);
    const subject = getVal(cSubj);
    const to = getVal(cTo);
    if (!ref && !subject && !to) continue;

    let isoDate = Core.todayISO();
    const rawDate = cDate > 0 ? row.getCell(cDate).value : null;
    if (rawDate instanceof Date && !isNaN(rawDate)) {
      isoDate = rawDate.toISOString().slice(0, 10);
    } else {
      const ds = String(rawDate || '').trim();
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(ds)) isoDate = ds.split('/').reverse().join('-');
      else if (/^\d{4}-\d{2}-\d{2}$/.test(ds)) isoDate = ds;
    }

    let headCode = getVal(cHeadCode).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!headCode && cHead > 0) {
      const hm = /^([A-Z]{2,6})\b/.exec(getVal(cHead));
      if (hm) headCode = hm[1];
    }

    imported.push({
      id: Core.uid(),
      ref: ref === 'DRAFT' ? undefined : ref,
      date: isoDate,
      majorHead: headCode || 'ADM',
      subHead: getVal(cSub),
      to,
      subject,
      body: subject,
      layout: 'letter',
      lang: 'en',
      status: ref && ref !== 'DRAFT' ? (getVal(cStatus) || 'issued') : 'draft',
      remarks: getVal(cRem),
    });
  }
  return imported;
}

module.exports = {
  buildMasterRegisterWorkbook,
  generateRegisterXlsxBuffer,
  syncMasterExcelFile,
  buildDirectoryWorkbookBuffer,
  parseDirectoryExcelBuffer,
  buildTemplateMailMergeSampleBuffer,
  parseGenericMailMergeExcelBuffer,
  parseImportedRegisterXlsx,
};
