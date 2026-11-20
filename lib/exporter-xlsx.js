'use strict';

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const Core = require('../public/core.js');

// Prevent Spreadsheet Formula Injection (OWASP CSV/XLSX Injection mitigation)
function safeCellText(val) {
  const s = String(val ?? '').replace(/\r\n/g, '\n').trim();
  if (!s) return '';
  if (/^[=+\-@]/.test(s) && !/^-\d/.test(s)) {
    return "'" + s;
  }
  return s;
}

function cleanMarkers(str) {
  return String(str || '').replace(/‹([^›]+)›/g, '[$1]');
}

function styleBanner(sheet, colCount, title, subtitle) {
  sheet.mergeCells(1, 1, 1, colCount);
  const r1 = sheet.getRow(1);
  r1.getCell(1).value = title;
  r1.getCell(1).font = { name: 'Nirmala UI', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  r1.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } };
  r1.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
  r1.height = 26;

  sheet.mergeCells(2, 1, 2, colCount);
  const r2 = sheet.getRow(2);
  r2.getCell(1).value = subtitle;
  r2.getCell(1).font = { name: 'Nirmala UI', size: 9.5, italic: true, color: { argb: 'FF334155' } };
  r2.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  r2.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
  r2.height = 19;
}

function styleHeaderRow(row) {
  row.height = 24;
  row.eachCell(cell => {
    cell.font = { name: 'Nirmala UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'medium', color: { argb: 'FF1E3A8A' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });
}

async function buildRegisterWorkbookBuffer(db, opts = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Letter Draft Assistant v2.0';
  wb.created = new Date();
  wb.modified = new Date();

  const S = db.settings || Core.defaultSettings();
  const sc = S.school || {};
  const subtitle = `${sc.en || sc.name}  |  U-DISE: ${sc.udise || '-'}  |  CBSE Aff.: ${sc.cbseAff || '-'}  |  Updated: ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`;

  // =========================================================================
  // SHEET 1: OUTWARD REGISTER (जावक पंजी)
  // =========================================================================
  const shOut = wb.addWorksheet('Outward Register (जावक पंजी)', {
    views: [{ state: 'frozen', ySplit: 3 }],
  });

  const outCols = [
    { header: 'S.No.', key: 'sno', width: 7 },
    { header: 'Letter No. (पत्रांक)', key: 'ref', width: 16 },
    { header: 'Date (दिनांक)', key: 'date', width: 13 },
    { header: 'Year (वर्ष)', key: 'year', width: 10 },
    { header: 'Major Head Code', key: 'headCode', width: 14 },
    { header: 'Major Head / मुख्य शीर्ष', key: 'headName', width: 34 },
    { header: 'Sub-Head / File No. (उप-शीर्ष)', key: 'subHead', width: 22 },
    { header: 'Template', key: 'tpl', width: 14 },
    { header: 'Lang', key: 'lang', width: 8 },
    { header: 'Recipient (प्राप्तकर्ता)', key: 'to', width: 32 },
    { header: 'Subject (विषय)', key: 'subject', width: 42 },
    { header: 'Status (स्थिति)', key: 'status', width: 14 },
    { header: 'Dispatch Mode', key: 'dispMode', width: 16 },
    { header: 'Dispatch Date', key: 'dispDate', width: 14 },
    { header: 'Tracking / Note', key: 'dispNote', width: 22 },
    { header: 'Signatory (हस्ताक्षरकर्ता)', key: 'signatory', width: 24 },
    { header: 'Issued By', key: 'issuedBy', width: 15 },
    { header: 'Remarks / Cancel Reason', key: 'remarks', width: 26 },
  ];

  shOut.columns = outCols.map(c => ({ key: c.key, width: c.width }));
  styleBanner(shOut, outCols.length, `${sc.name || sc.en} — OUTWARD LETTER REGISTER (जावक पत्र पंजी)`, subtitle);

  const outHdr = shOut.getRow(3);
  outCols.forEach((c, idx) => { outHdr.getCell(idx + 1).value = c.header; });
  styleHeaderRow(outHdr);

  const letters = Array.isArray(opts.letters) ? opts.letters : db.letters.slice().sort((a, b) => {
    const va = a.ref ? (a.refYear * 1e6 + a.refNo) : (1e12 + (a.createdAt || 0));
    const vb = b.ref ? (b.refYear * 1e6 + b.refNo) : (1e12 + (b.createdAt || 0));
    return va - vb;
  });

  letters.forEach((l, i) => {
    const mh = Core.getMajorHeadObj(db, l.majorHead);
    const sg = (S.signatories || []).find(x => x.id === l.sig) || {};
    const row = shOut.addRow({
      sno: i + 1,
      ref: safeCellText(l.ref || 'DRAFT'),
      date: Core.fmtDateDMY(l.date),
      year: l.refYear || Core.yearKey(l.date || Core.todayISO(), S.yearMode),
      headCode: safeCellText(mh ? mh.code : (l.majorHead || 'ADM')),
      headName: safeCellText(mh ? `${mh.en} / ${mh.hi}` : (l.majorHead || 'ADM')),
      subHead: safeCellText(l.subHead || ''),
      tpl: safeCellText(l.tpl || ''),
      lang: l.lang === 'hi' ? 'हिंदी' : 'English',
      to: safeCellText((l.to || '').replace(/\n+/g, ', ') || (l.fields && l.fields.name) || ''),
      subject: safeCellText(cleanMarkers(l.subject || l.heading || '')),
      status: safeCellText((l.status || 'draft').toUpperCase()),
      dispMode: safeCellText(l.dispatch && l.dispatch.mode),
      dispDate: l.dispatch && l.dispatch.date ? Core.fmtDateDMY(l.dispatch.date) : '',
      dispNote: safeCellText(l.dispatch && l.dispatch.note),
      signatory: safeCellText(sg.name || ''),
      issuedBy: safeCellText(l.issuedBy || l.createdBy || ''),
      remarks: safeCellText([l.remarks, l.cancelReason ? `Cancelled: ${l.cancelReason}` : ''].filter(Boolean).join(' | ')),
    });
    row.eachCell(cell => {
      cell.font = { name: 'Nirmala UI', size: 10 };
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFF1F5F9' } },
        right: { style: 'thin', color: { argb: 'FFF1F5F9' } },
      };
    });
    if (l.status === 'cancelled') {
      row.getCell(12).font = { name: 'Nirmala UI', size: 10, bold: true, color: { argb: 'FFB91C1C' } };
    } else if (l.status === 'dispatched') {
      row.getCell(12).font = { name: 'Nirmala UI', size: 10, bold: true, color: { argb: 'FF15803D' } };
    } else if (l.status === 'issued') {
      row.getCell(12).font = { name: 'Nirmala UI', size: 10, bold: true, color: { argb: 'FF1D4ED8' } };
    }
    row.getCell(2).font = { name: 'Nirmala UI', size: 10, bold: true };
  });

  shOut.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: Math.max(3, 3 + letters.length), column: outCols.length },
  };

  // =========================================================================
  // SHEET 2: INWARD REGISTER (आवक पंजी)
  // =========================================================================
  const shIn = wb.addWorksheet('Inward Register (आवक पंजी)', {
    views: [{ state: 'frozen', ySplit: 3 }],
  });

  const inCols = [
    { header: 'S.No.', key: 'sno', width: 7 },
    { header: 'Inward No. (आवक सं.)', key: 'no', width: 16 },
    { header: 'Received Date', key: 'date', width: 14 },
    { header: 'Major Head Code', key: 'headCode', width: 14 },
    { header: 'Major Head / मुख्य शीर्ष', key: 'headName', width: 34 },
    { header: 'Sub-Head / File No.', key: 'subHead', width: 20 },
    { header: 'From / Sender (प्रेषक)', key: 'from', width: 30 },
    { header: 'Sender Ref. & Date', key: 'senderRef', width: 22 },
    { header: 'Subject (विषय)', key: 'subject', width: 40 },
    { header: 'Mode', key: 'mode', width: 14 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Reply Letter No.', key: 'replyRef', width: 18 },
    { header: 'Remarks', key: 'remarks', width: 24 },
  ];

  shIn.columns = inCols.map(c => ({ key: c.key, width: c.width }));
  styleBanner(shIn, inCols.length, `${sc.name || sc.en} — INWARD LETTER REGISTER (आवक पत्र पंजी)`, subtitle);

  const inHdr = shIn.getRow(3);
  inCols.forEach((c, idx) => { inHdr.getCell(idx + 1).value = c.header; });
  styleHeaderRow(inHdr);

  const inwardList = Array.isArray(opts.inward) ? opts.inward : db.inward;
  inwardList.forEach((r, i) => {
    const mh = Core.getMajorHeadObj(db, r.majorHead);
    const row = shIn.addRow({
      sno: i + 1,
      no: safeCellText(r.no || ''),
      date: Core.fmtDateDMY(r.date),
      headCode: safeCellText(mh ? mh.code : (r.majorHead || 'ADM')),
      headName: safeCellText(mh ? `${mh.en} / ${mh.hi}` : (r.majorHead || 'ADM')),
      subHead: safeCellText(r.subHead || ''),
      from: safeCellText(r.from || ''),
      senderRef: safeCellText(r.senderRef || ''),
      subject: safeCellText(r.subject || ''),
      mode: safeCellText(r.mode || ''),
      status: safeCellText((r.status || '').toUpperCase()),
      replyRef: safeCellText(r.reply && r.reply.ref ? `${r.reply.ref} (${Core.fmtDateDMY(r.reply.date)})` : ''),
      remarks: safeCellText(r.remarks || ''),
    });
    row.eachCell(cell => {
      cell.font = { name: 'Nirmala UI', size: 10 };
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
    });
  });

  shIn.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: Math.max(3, 3 + inwardList.length), column: inCols.length },
  };

  // =========================================================================
  // SHEET 3: MAJOR HEAD SUMMARY (मदवार सारांश)
  // =========================================================================
  const shSum = wb.addWorksheet('Major Head Summary (मद सारांश)', {
    views: [{ state: 'frozen', ySplit: 3 }],
  });

  const sumCols = [
    { header: 'Major Head Code', key: 'code', width: 16 },
    { header: 'Major Head (English)', key: 'en', width: 34 },
    { header: 'मुख्य शीर्ष (हिंदी)', key: 'hi', width: 34 },
    { header: 'Active Outward (Issued + Dispatched)', key: 'activeOut', width: 22 },
    { header: 'Dispatched', key: 'dispatched', width: 14 },
    { header: 'Drafts', key: 'drafts', width: 12 },
    { header: 'Cancelled', key: 'cancelled', width: 12 },
    { header: 'Inward Received', key: 'inTotal', width: 16 },
    { header: 'Inward Reply Pending', key: 'inPending', width: 18 },
  ];

  shSum.columns = sumCols.map(c => ({ key: c.key, width: c.width }));
  styleBanner(shSum, sumCols.length, `${sc.name || sc.en} — MAJOR HEAD WISE SUMMARY (मदवार पत्र सारांश)`, subtitle);

  const sumHdr = shSum.getRow(3);
  sumCols.forEach((c, idx) => { sumHdr.getCell(idx + 1).value = c.header; });
  styleHeaderRow(sumHdr);

  const heads = S.majorHeads || Core.DEFAULT_MAJOR_HEADS;
  heads.forEach(h => {
    const outH = db.letters.filter(l => (l.majorHead || 'ADM') === h.code);
    const inH = db.inward.filter(r => (r.majorHead || 'ADM') === h.code);
    const row = shSum.addRow({
      code: h.code,
      en: h.en,
      hi: h.hi,
      activeOut: outH.filter(l => l.status === 'issued' || l.status === 'dispatched').length,
      dispatched: outH.filter(l => l.status === 'dispatched').length,
      drafts: outH.filter(l => l.status === 'draft').length,
      cancelled: outH.filter(l => l.status === 'cancelled').length,
      inTotal: inH.length,
      inPending: inH.filter(r => r.status === 'pending').length,
    });
    row.eachCell(cell => {
      cell.font = { name: 'Nirmala UI', size: 10 };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
    });
    row.getCell(1).font = { name: 'Nirmala UI', size: 10, bold: true };
  });

  shSum.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: Math.max(3, 3 + heads.length), column: sumCols.length },
  };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

async function syncMasterExcelFile(dataDir, db) {
  const filePath = path.join(dataDir, 'Master_Letter_Register.xlsx');
  const tmpPath = filePath + '.tmp.' + process.pid;
  const buf = await buildRegisterWorkbookBuffer(db);
  fs.writeFileSync(tmpPath, buf);
  fs.renameSync(tmpPath, filePath);
  return filePath;
}

async function parseExcelRegisterBuffer(buf, db) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error('Workbook contains no worksheets.');

  // Locate header row (within first 6 rows)
  let headerRowNum = 1;
  let colMap = {};
  for (let r = 1; r <= Math.min(6, sheet.rowCount); r++) {
    const row = sheet.getRow(r);
    const vals = [];
    row.eachCell({ includeEmpty: true }, (c, colNumber) => {
      vals[colNumber] = String(c.text || c.value || '').toLowerCase().trim();
    });
    const joined = vals.join(' ');
    if (joined.includes('subject') || joined.includes('विषय') || joined.includes('ref') || joined.includes('पत्रांक') || joined.includes('letter no')) {
      headerRowNum = r;
      vals.forEach((v, idx) => {
        if (!v) return;
        if (v.includes('letter no') || v.includes('ref') || v.includes('पत्रांक')) colMap.ref = colMap.ref || idx;
        else if (v.includes('date') && !v.includes('dispatch') || v.includes('दिनांक')) colMap.date = colMap.date || idx;
        else if (v.includes('major head code') || v === 'head code' || v === 'code') colMap.headCode = idx;
        else if (v.includes('major head') || v.includes('मुख्य शीर्ष') || v.includes('मद')) colMap.headName = colMap.headName || idx;
        else if (v.includes('sub-head') || v.includes('file') || v.includes('उप-शीर्ष')) colMap.subHead = idx;
        else if (v.includes('recipient') || v === 'to' || v.includes('प्राप्तकर्ता')) colMap.to = idx;
        else if (v.includes('subject') || v.includes('विषय')) colMap.subject = idx;
        else if (v.includes('status') || v.includes('स्थिति')) colMap.status = idx;
        else if (v.includes('remark') || v.includes('अभ्युक्ति')) colMap.remarks = idx;
      });
      break;
    }
  }

  if (!colMap.subject && !colMap.ref) {
    throw new Error('Could not find "Letter No. / Ref" or "Subject" columns in the uploaded Excel sheet.');
  }

  const imported = [];
  const existingRefs = new Set(db.letters.filter(l => l.ref).map(l => String(l.ref).trim().toLowerCase()));

  for (let r = headerRowNum + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const getVal = (col) => {
      if (!col) return '';
      const cell = row.getCell(col);
      if (cell.value instanceof Date) return cell.value.toISOString().slice(0, 10);
      return String(cell.text || cell.value || '').replace(/^'/, '').trim();
    };

    const ref = getVal(colMap.ref);
    const subject = getVal(colMap.subject);
    if (!ref && !subject) continue;
    if (ref && ref !== 'DRAFT' && existingRefs.has(ref.toLowerCase())) continue;

    let isoDate = Core.todayISO();
    const rawDate = getVal(colMap.date);
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) isoDate = rawDate;
    else {
      const m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/.exec(rawDate);
      if (m) isoDate = (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    }

    let headCode = (getVal(colMap.headCode) || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!headCode && colMap.headName) {
      const hn = getVal(colMap.headName).toLowerCase();
      const match = (db.settings.majorHeads || Core.DEFAULT_MAJOR_HEADS).find(
        h => hn.includes(h.code.toLowerCase()) || hn.includes(h.en.toLowerCase()) || hn.includes(h.hi)
      );
      if (match) headCode = match.code;
    }
    if (!headCode) headCode = 'ADM';

    const refNumMatch = /^(\d+)/.exec(ref);
    const refNo = refNumMatch ? parseInt(refNumMatch[1], 10) : 0;
    const refYear = Core.yearKey(isoDate, db.settings.yearMode);
    const isIssued = ref && ref.toUpperCase() !== 'DRAFT';

    const rawStatus = getVal(colMap.status).toLowerCase();
    const status = !isIssued ? 'draft' : (['issued', 'dispatched', 'cancelled'].includes(rawStatus) ? rawStatus : 'issued');

    const entry = {
      id: Core.uid(),
      tpl: 'blank',
      layout: 'letter',
      lang: /[\u0900-\u097F]/.test(subject) ? 'hi' : 'en',
      majorHead: headCode,
      subHead: getVal(colMap.subHead).slice(0, 120),
      fields: {},
      to: getVal(colMap.to).slice(0, 400),
      subject: subject.slice(0, 400),
      body: subject,
      date: isoDate,
      sig: db.settings.defaultSignatory || 'sg1',
      showSign: false,
      manual: true,
      toManual: true,
      status,
      remarks: getVal(colMap.remarks).slice(0, 300),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    if (isIssued) {
      entry.ref = ref;
      entry.refNo = refNo;
      entry.refYear = refYear;
      entry.issuedAt = Date.now();
      existingRefs.add(ref.toLowerCase());
    }
    imported.push(entry);
  }

  return imported;
}

module.exports = {
  buildRegisterWorkbookBuffer,
  syncMasterExcelFile,
  parseExcelRegisterBuffer,
};
