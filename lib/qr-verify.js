'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');
const Core = require('../public/core.js');

function loadOrCreateVerifySecret(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const keyFile = path.join(dataDir, 'verify-secret.key');
  if (fs.existsSync(keyFile)) {
    const existing = fs.readFileSync(keyFile, 'utf8').trim();
    if (existing.length >= 32) return existing;
  }
  const secret = process.env.VERIFY_HMAC_SECRET || crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(keyFile, secret, { mode: 0o600 });
  return secret;
}

function computeVerifyCode(secret, letter) {
  if (!letter || !letter.ref) return '';
  const payload = `${letter.id}|${letter.ref}|${letter.date || ''}`;
  return crypto
    .createHmac('sha256', String(secret))
    .update(payload)
    .digest('hex')
    .slice(0, 16)
    .toUpperCase();
}

function formatVerifyCode(code) {
  const clean = String(code || '').replace(/[^A-F0-9]/gi, '').toUpperCase();
  if (clean.length !== 16) return clean;
  return `${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}`;
}

function buildVerifyUrl(baseUrl, letter, secret) {
  if (!letter || !letter.ref) return '';
  const code = computeVerifyCode(secret, letter);
  const base = String(baseUrl || 'http://localhost:3000').replace(/\/+$/, '');
  return `${base}/verify?ref=${encodeURIComponent(letter.ref)}&c=${encodeURIComponent(code)}`;
}

async function generateQrPngBuffer(text, width = 160) {
  if (!text) return null;
  return QRCode.toBuffer(text, {
    type: 'png',
    width,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#162d4c', light: '#ffffff' },
  });
}

async function generateQrDataUrl(text, width = 140) {
  if (!text) return '';
  return QRCode.toDataURL(text, {
    width,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#162d4c', light: '#ffffff' },
  });
}

function verifyDocumentRecord(db, secret, refInput, codeInput) {
  const ref = String(refInput || '').trim();
  const cleanCode = String(codeInput || '').replace(/[^A-F0-9]/gi, '').toUpperCase();
  if (!ref || cleanCode.length !== 16) {
    return { valid: false, status: 'invalid_input', message: 'Invalid Reference Number or 16-character Verification Code.' };
  }

  const letter = (db.letters || []).find(l => l.ref && String(l.ref).toLowerCase() === ref.toLowerCase());
  if (!letter) {
    return { valid: false, status: 'not_found', message: 'No issued document matches this Reference Number.' };
  }

  const expected = computeVerifyCode(secret, letter);
  const bufA = Buffer.from(cleanCode, 'utf8');
  const bufB = Buffer.from(expected, 'utf8');
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    return { valid: false, status: 'forged_or_mismatch', message: 'Cryptographic signature mismatch. Document could not be verified.' };
  }

  const S = db.settings || Core.defaultSettings();
  const sg = (S.signatories || []).find(x => x.id === letter.sig) || (S.signatories || [])[0] || {};
  const mh = Core.getMajorHeadObj(db, letter.majorHead);
  const party = ((letter.to || '').split('\n')[0])
    || (letter.fields && (letter.fields.name || letter.fields.staff_name || letter.fields.person_name))
    || 'Official Recipient';

  return {
    valid: letter.status !== 'cancelled',
    status: letter.status === 'cancelled' ? 'cancelled' : 'verified',
    institution: S.school.en || S.school.name,
    institutionHi: S.school.hi || '',
    udise: S.school.udise || '',
    cbseAff: S.school.cbseAff || '',
    address: S.school.addressEn || '',
    ref: letter.ref,
    date: Core.fmtDateDMY(letter.date),
    majorHead: mh ? `${mh.code} — ${mh.en}` : (letter.majorHead || 'ADM'),
    documentTitle: letter.heading || letter.subject || 'Official Document',
    issuedTo: party,
    signatory: sg.designation ? `${sg.name} (${sg.designation})` : (sg.name || ''),
    cancelReason: letter.status === 'cancelled' ? (letter.cancelReason || 'Cancelled by issuing authority') : undefined,
    verifyCode: formatVerifyCode(expected),
  };
}

function renderPublicVerifyPageHtml() {
  const verifyHtmlPath = path.join(__dirname, '..', 'public', 'verify.html');
  return fs.readFileSync(verifyHtmlPath, 'utf8');
}

module.exports = {
  loadOrCreateVerifySecret,
  computeVerifyCode,
  formatVerifyCode,
  buildVerifyUrl,
  generateQrPngBuffer,
  generateQrDataUrl,
  verifyDocumentRecord,
  renderPublicVerifyPageHtml,
};
