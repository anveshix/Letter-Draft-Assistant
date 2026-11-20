'use strict';

const JSZip = require('jszip');
const { PDFDocument } = require('pdf-lib');
const ExcelJS = require('exceljs');
const Core = require('../public/core.js');
const { generateLetterPdfBuffer } = require('./exporter-pdf');
const { generateLetterDocxBuffer } = require('./exporter-docx');
const { buildVerifyUrl, computeVerifyCode, formatVerifyCode, generateQrPngBuffer } = require('./qr-verify');

function safeFilePart(s, fallback = 'Doc') {
  const clean = String(s || '')
    .replace(/[\/\\:*?"<>|]+/g, '-')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_\u0900-\u097F.-]/g, '')
    .slice(0, 45);
  return clean || fallback;
}

async function buildQrOptsForLetter(letter, baseUrl, verifySecret) {
  if (!letter || !letter.ref || letter.showQr === false) return {};
  const url = buildVerifyUrl(baseUrl, letter, verifySecret);
  const code = formatVerifyCode(computeVerifyCode(verifySecret, letter));
  const qrBuffer = await generateQrPngBuffer(url, 150);
  return { qrBuffer, verifyCode: code, verifyUrl: url };
}

async function buildBatchManifestBuffer(letters) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Batch_Manifest');
  ws.getRow(1).values = ['Sl.', 'Ref. No.', 'Date', 'Major Head', 'Sub-Head', 'Party / Student / Recipient', 'Subject / Heading', 'Status'];
  ws.getRow(1).font = { bold: true };
  letters.forEach((l, idx) => {
    const party = (l.fields && (l.fields.name || l.fields.staff_name || l.fields.person_name))
      || ((l.to || '').split('\n')[0])
      || '';
    ws.addRow([
      idx + 1,
      l.ref || 'DRAFT',
      Core.fmtDateDMY(l.date),
      l.majorHead || 'ADM',
      l.subHead || '',
      party,
      l.subject || l.heading || '',
      l.status || 'draft',
    ]);
  });
  ws.columns.forEach(c => { c.width = 22; });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function generateBatchOutput(db, letters, resolveImageBuffer, opts = {}) {
  if (!Array.isArray(letters) || !letters.length) {
    throw new Error('Batch contains 0 letters.');
  }
  if (letters.length > 250) {
    throw new Error('Maximum 250 documents per single batch for optimal memory safety.');
  }

  const format = opts.outputFormat || 'combined-pdf';
  const baseUrl = opts.baseUrl || 'http://localhost:3000';
  const verifySecret = opts.verifySecret || '';

  if (format === 'combined-pdf') {
    const mergedPdf = await PDFDocument.create();
    mergedPdf.setTitle(`Batch Certificates & Letters (${letters.length} Docs)`);
    mergedPdf.setCreator('Letter Draft Assistant v3.0');

    for (const letter of letters) {
      const qrOpts = await buildQrOptsForLetter(letter, baseUrl, verifySecret);
      const singleBuf = await generateLetterPdfBuffer(db, letter, resolveImageBuffer, qrOpts);
      const srcDoc = await PDFDocument.load(singleBuf);
      const copiedPages = await mergedPdf.copyPages(srcDoc, srcDoc.getPageIndices());
      copiedPages.forEach(p => mergedPdf.addPage(p));
    }

    const bytes = await mergedPdf.save();
    return {
      buffer: Buffer.from(bytes),
      mime: 'application/pdf',
      filename: `Batch_Combined_${letters.length}_Docs_${Core.todayISO()}.pdf`,
    };
  }

  const zip = new JSZip();
  const isDocx = format === 'zip-docx';

  for (let i = 0; i < letters.length; i++) {
    const letter = letters[i];
    const qrOpts = await buildQrOptsForLetter(letter, baseUrl, verifySecret);
    const party = (letter.fields && (letter.fields.name || letter.fields.staff_name || letter.fields.person_name))
      || ((letter.to || '').split('\n')[0])
      || `Doc_${i + 1}`;
    const prefix = String(i + 1).padStart(3, '0');
    const refPart = letter.ref ? safeFilePart(letter.ref) + '_' : '';
    const ext = isDocx ? 'docx' : 'pdf';
    const fname = `${prefix}_${refPart}${safeFilePart(party)}.${ext}`;

    const fileBuf = isDocx
      ? await generateLetterDocxBuffer(db, letter, resolveImageBuffer, qrOpts)
      : await generateLetterPdfBuffer(db, letter, resolveImageBuffer, qrOpts);
    zip.file(fname, fileBuf);
  }

  const manifestBuf = await buildBatchManifestBuffer(letters);
  zip.file('000_Batch_Register_Manifest.xlsx', manifestBuf);

  const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return {
    buffer: zipBuf,
    mime: 'application/zip',
    filename: `Batch_${isDocx ? 'Word_DOCX' : 'PDF'}_${letters.length}_Docs_${Core.todayISO()}.zip`,
  };
}

module.exports = { generateBatchOutput };
