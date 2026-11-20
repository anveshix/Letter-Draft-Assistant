'use strict';

const https = require('https');
const Core = require('../public/core.js');

const ALLOWED_GOOGLE_HOSTS = new Set([
  'script.google.com',
  'script.googleusercontent.com',
]);

function validateGoogleWebhookUrl(rawUrl) {
  const s = String(rawUrl || '').trim();
  if (!s) throw new Error('Google Apps Script Web App URL is empty.');
  let parsed;
  try {
    parsed = new URL(s);
  } catch (_) {
    throw new Error('Invalid URL format.');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Webhook URL must use HTTPS.');
  }
  if (!ALLOWED_GOOGLE_HOSTS.has(parsed.hostname)) {
    throw new Error('For security (SSRF protection), only https://script.google.com/macros/s/... URLs are permitted.');
  }
  return parsed.toString();
}

function postJsonWithRedirect(targetUrl, payloadObj, redirectsLeft = 4) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'https:' || !ALLOWED_GOOGLE_HOSTS.has(parsed.hostname)) {
      return reject(new Error('Blocked redirect to untrusted host: ' + parsed.hostname));
    }

    const bodyBuf = Buffer.from(JSON.stringify(payloadObj), 'utf8');
    const isPost = redirectsLeft === 4;
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: 443,
        path: parsed.pathname + parsed.search,
        method: isPost ? 'POST' : 'GET',
        headers: isPost
          ? {
              'content-type': 'application/json; charset=utf-8',
              'content-length': bodyBuf.length,
              accept: 'application/json',
            }
          : { accept: 'application/json' },
        timeout: 15000,
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) return reject(new Error('Too many redirects from Google Apps Script.'));
          const nextUrl = new URL(res.headers.location, targetUrl).toString();
          return postJsonWithRedirect(nextUrl, payloadObj, redirectsLeft - 1).then(resolve, reject);
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { if (data.length < 200000) data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch (_) {
              resolve({ ok: true, raw: data.slice(0, 200) });
            }
          } else {
            reject(new Error(`Google Sheet HTTP ${res.statusCode}: ${data.slice(0, 140)}`));
          }
        });
      }
    );

    req.on('timeout', () => { req.destroy(new Error('Google Sheet sync timed out (15s).')); });
    req.on('error', reject);
    if (isPost) req.write(bodyBuf);
    req.end();
  });
}

function buildSyncPayload(db, secret) {
  const S = db.settings || Core.defaultSettings();
  const outward = db.letters.slice().sort((a, b) => {
    const va = a.ref ? (a.refYear * 1e6 + a.refNo) : (1e12 + (a.createdAt || 0));
    const vb = b.ref ? (b.refYear * 1e6 + b.refNo) : (1e12 + (b.createdAt || 0));
    return va - vb;
  }).map((l, idx) => {
    const mh = Core.getMajorHeadObj(db, l.majorHead);
    const sg = (S.signatories || []).find(x => x.id === l.sig) || {};
    return [
      idx + 1,
      l.id,
      l.ref || 'DRAFT',
      Core.fmtDateDMY(l.date),
      l.refYear || Core.yearKey(l.date || Core.todayISO(), S.yearMode),
      mh ? mh.code : (l.majorHead || 'ADM'),
      mh ? `${mh.en} (${mh.hi})` : (l.majorHead || 'ADM'),
      l.subHead || '',
      (l.to || '').replace(/\n+/g, ', ') || (l.fields && l.fields.name) || '',
      String(l.subject || l.heading || '').replace(/‹([^›]+)›/g, '[$1]'),
      (l.status || 'draft').toUpperCase(),
      (l.dispatch && l.dispatch.mode) || '',
      l.dispatch && l.dispatch.date ? Core.fmtDateDMY(l.dispatch.date) : '',
      (l.dispatch && l.dispatch.note) || '',
      sg.name || '',
      l.issuedBy || l.createdBy || '',
      [l.remarks, l.cancelReason ? `Cancelled: ${l.cancelReason}` : ''].filter(Boolean).join(' | '),
    ];
  });

  const inward = db.inward.map((r, idx) => {
    const mh = Core.getMajorHeadObj(db, r.majorHead);
    return [
      idx + 1,
      r.id,
      r.no || '',
      Core.fmtDateDMY(r.date),
      mh ? mh.code : (r.majorHead || 'ADM'),
      mh ? `${mh.en} (${mh.hi})` : (r.majorHead || 'ADM'),
      r.subHead || '',
      r.from || '',
      r.senderRef || '',
      r.subject || '',
      r.mode || '',
      (r.status || '').toUpperCase(),
      r.reply && r.reply.ref ? `${r.reply.ref} (${Core.fmtDateDMY(r.reply.date)})` : '',
      r.remarks || '',
    ];
  });

  const summary = (S.majorHeads || Core.DEFAULT_MAJOR_HEADS).map(h => {
    const outH = db.letters.filter(l => (l.majorHead || 'ADM') === h.code);
    const inH = db.inward.filter(r => (r.majorHead || 'ADM') === h.code);
    return [
      h.code,
      h.en,
      h.hi,
      outH.filter(l => l.status === 'issued' || l.status === 'dispatched').length,
      outH.filter(l => l.status === 'dispatched').length,
      outH.filter(l => l.status === 'draft').length,
      outH.filter(l => l.status === 'cancelled').length,
      inH.length,
      inH.filter(r => r.status === 'pending').length,
    ];
  });

  return {
    secret: secret || '',
    school: S.school.en || S.school.name,
    syncedAt: new Date().toISOString(),
    outwardHeaders: [
      'S.No.', 'Record ID', 'Letter No. (पत्रांक)', 'Date (दिनांक)', 'Year',
      'Major Head Code', 'Major Head (मुख्य शीर्ष)', 'Sub-Head / File No.',
      'Recipient (प्राप्तकर्ता)', 'Subject (विषय)', 'Status',
      'Dispatch Mode', 'Dispatch Date', 'Tracking / Note',
      'Signatory', 'Issued By', 'Remarks',
    ],
    outwardRows: outward,
    inwardHeaders: [
      'S.No.', 'Record ID', 'Inward No.', 'Received Date',
      'Major Head Code', 'Major Head (मुख्य शीर्ष)', 'Sub-Head / File No.',
      'Sender (प्रेषक)', 'Sender Ref.', 'Subject (विषय)',
      'Mode', 'Reply Status', 'Reply Letter No.', 'Remarks',
    ],
    inwardRows: inward,
    summaryHeaders: [
      'Major Head Code', 'Major Head (English)', 'मुख्य शीर्ष (हिंदी)',
      'Active Outward', 'Dispatched', 'Drafts', 'Cancelled', 'Inward Total', 'Reply Pending',
    ],
    summaryRows: summary,
  };
}

async function syncToGoogleSheet(db) {
  const gs = (db.settings && db.settings.gsheet) || {};
  const url = validateGoogleWebhookUrl(gs.webhookUrl || process.env.GSHEET_WEBHOOK_URL);
  const secret = gs.webhookSecret || process.env.GSHEET_WEBHOOK_SECRET || '';
  const payload = buildSyncPayload(db, secret);
  const res = await postJsonWithRedirect(url, payload);
  return res;
}

const GOOGLE_APPS_SCRIPT_TEMPLATE = `/**
 * Letter Draft Assistant — Google Sheets Auto-Sync Receiver
 * Setup (2 Minutes):
 * 1. Create a new Google Sheet -> Click "Extensions" -> "Apps Script".
 * 2. Paste this code -> Set SECRET below (optional) -> Save.
 * 3. Click "Deploy" -> "New deployment" -> Type: "Web app"
 *    - Execute as: "Me"
 *    - Who has access: "Anyone"
 * 4. Copy the Web App URL (https://script.google.com/macros/s/.../exec)
 *    and paste it into Letter Draft Assistant -> Settings -> Google Sheets Sync!
 */
const SECRET = ""; // Optional: set same Secret Key as in Letter Draft Assistant Settings

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const data = JSON.parse(e.postData.contents);
    if (SECRET && data.secret !== SECRET) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "Invalid secret" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    writeSheet(ss, "Outward_Register", data.outwardHeaders, data.outwardRows);
    writeSheet(ss, "Inward_Register", data.inwardHeaders, data.inwardRows);
    writeSheet(ss, "Major_Head_Summary", data.summaryHeaders, data.summaryRows);
    return ContentService.createTextOutput(JSON.stringify({
      ok: true,
      outward: data.outwardRows.length,
      inward: data.inwardRows.length
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function writeSheet(ss, name, headers, rows) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.clearContents();
  const all = [headers].concat(rows || []);
  sh.getRange(1, 1, all.length, headers.length).setValues(all);
  sh.setFrozenRows(1);
  const hdr = sh.getRange(1, 1, 1, headers.length);
  hdr.setBackground("#1f3a5f").setFontColor("#ffffff").setFontWeight("bold");
  if (!sh.getFilter()) sh.getRange(1, 1, all.length, headers.length).createFilter();
}`;

module.exports = {
  validateGoogleWebhookUrl,
  syncToGoogleSheet,
  GOOGLE_APPS_SCRIPT_TEMPLATE,
};
