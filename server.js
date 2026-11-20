/* Letter Draft Assistant v2.0 — Secure Full-Stack Server
   Features:
   - Scrypt Password Auth, Role-Based Access Control (Admin / Staff / Viewer), CSRF & Rate-Limiting
   - Atomic JSON Database + 30-day Rotating Backups + Auto-Updated Master_Letter_Register.xlsx
   - Genuine Word (.docx), Embedded-Font Devanagari+English PDF (.pdf), & Excel (.xlsx) Exporters
   - Google Sheets Live Sync (SSRF-protected Apps Script Webhook)
*/
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const Core = require('./public/core.js');
const { createAuthManager } = require('./lib/auth.js');
const { generateLetterPdfBuffer, generateRegisterPdfBuffer } = require('./lib/exporter-pdf.js');
const { generateLetterDocxBuffer } = require('./lib/exporter-docx.js');
const { buildRegisterWorkbookBuffer, syncMasterExcelFile, parseExcelRegisterBuffer } = require('./lib/exporter-xlsx.js');
const { syncToGoogleSheet, GOOGLE_APPS_SCRIPT_TEMPLATE } = require('./lib/gsheets-sync.js');

const ROOT = __dirname;
const PUB_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const DEFAULTS_DIR = path.join(ROOT, 'storage', 'defaults');
const UPLOADS_DIR = path.join(ROOT, 'storage', 'uploads');

[DATA_DIR, BACKUP_DIR, DEFAULTS_DIR, UPLOADS_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Initialize Auth Manager
const Auth = createAuthManager(DATA_DIR);

// Load or initialize Database
const dbFile = path.join(DATA_DIR, 'db.json');
let db;
try {
  if (fs.existsSync(dbFile)) {
    db = Core.migrate(JSON.parse(fs.readFileSync(dbFile, 'utf8')));
  } else {
    db = Core.defaultDb();
  }
} catch (err) {
  console.error('CRITICAL: db.json is unreadable — refusing to overwrite:', err.message);
  process.exit(1);
}

let excelSyncTimer = null;
function scheduleMasterExcelUpdate() {
  clearTimeout(excelSyncTimer);
  excelSyncTimer = setTimeout(() => {
    syncMasterExcelFile(DATA_DIR, db).catch(err => {
      console.error('Excel auto-save warning:', err.message);
    });
  }, 150);
}

function saveDb(syncSheet = false) {
  const tmp = dbFile + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, dbFile);

  const dayFile = path.join(BACKUP_DIR, 'db-' + Core.todayISO() + '.json');
  if (!fs.existsSync(dayFile)) {
    fs.copyFileSync(dbFile, dayFile);
    const allBackups = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('db-')).sort();
    if (allBackups.length > 30) {
      allBackups.slice(0, allBackups.length - 30).forEach(f => {
        try { fs.unlinkSync(path.join(BACKUP_DIR, f)); } catch (_) {}
      });
    }
  }

  scheduleMasterExcelUpdate();

  if (syncSheet && db.settings && db.settings.gsheet && db.settings.gsheet.enabled && db.settings.gsheet.autoSync && db.settings.gsheet.webhookUrl) {
    syncToGoogleSheet(db)
      .then(() => {
        db.settings.gsheet.lastSyncAt = Date.now();
        db.settings.gsheet.lastSyncStatus = 'Auto-synced OK';
        const t2 = dbFile + '.tmp.' + process.pid;
        fs.writeFileSync(t2, JSON.stringify(db, null, 2), { mode: 0o600 });
        fs.renameSync(t2, dbFile);
      })
      .catch(e => {
        db.settings.gsheet.lastSyncStatus = 'Sync error: ' + e.message;
      });
  }
}

// Initial persistence + Master Excel generation
saveDb(false);
syncMasterExcelFile(DATA_DIR, db).catch(() => {});

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
};

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'content-security-policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'",
};

function sendJson(res, status, obj, extraHeaders) {
  res.writeHead(status, Object.assign({}, SECURITY_HEADERS, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  }, extraHeaders || {}));
  res.end(JSON.stringify(obj));
}

function sendBinary(res, status, buf, contentType, downloadFilename) {
  const headers = Object.assign({}, SECURITY_HEADERS, {
    'content-type': contentType,
    'content-length': buf.length,
    'cache-control': 'no-store',
  });
  if (downloadFilename) {
    const asciiFallback = downloadFilename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
    headers['content-disposition'] = `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(downloadFilename)}`;
  }
  res.writeHead(status, headers);
  res.end(buf);
}

function readJsonBody(req, maxBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', chunk => {
      total += chunk.length;
      if (total > maxBytes) {
        const err = new Error('Request payload too large.');
        err.status = 413;
        reject(err);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (_) {
        const err = new Error('Malformed JSON request body.');
        err.status = 400;
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function getLanUrls(port) {
  const urls = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        urls.push(`http://${net.address}:${port}`);
      }
    }
  }
  return urls;
}

// Safely resolve image buffer for PDF/DOCX exporters without SSRF or path traversal
function resolveImageBuffer(src) {
  if (!src || typeof src !== 'string') return null;
  const s = src.trim();
  if (s.startsWith('data:image/')) {
    const idx = s.indexOf('base64,');
    if (idx > 0) {
      try { return Buffer.from(s.slice(idx + 7), 'base64'); } catch (_) { return null; }
    }
    return null;
  }
  if (s === 'assets/letterhead.png' || s === '/assets/letterhead.png') {
    const p1 = path.join(PUB_DIR, 'assets', 'letterhead.png');
    if (fs.existsSync(p1)) return fs.readFileSync(p1);
    const p2 = path.join(DEFAULTS_DIR, 'letterhead.png');
    if (fs.existsSync(p2)) return fs.readFileSync(p2);
    return null;
  }
  if (s.startsWith('api/files/') || s.startsWith('/api/files/') || s === 'private/sign.png') {
    const base = s === 'private/sign.png' ? 'sign.png' : path.basename(s);
    if (!/^[a-zA-Z0-9._-]+$/.test(base)) return null;
    const upPath = path.join(UPLOADS_DIR, base);
    if (fs.existsSync(upPath)) return fs.readFileSync(upPath);
    const defPath = path.join(DEFAULTS_DIR, base);
    if (fs.existsSync(defPath)) return fs.readFileSync(defPath);
  }
  return null;
}

function validateAndSaveUploadedImage(dataUrl, prefix = 'img') {
  const m = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('Only PNG, JPEG, or WEBP images are allowed.');
  const buf = Buffer.from(m[2].replace(/\s+/g, ''), 'base64');
  if (buf.length > 5 * 1024 * 1024) throw new Error('Image size must not exceed 5 MB.');
  if (buf.length < 16) throw new Error('Invalid image file.');

  // Verify magic bytes
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
  const isJpg = buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
  const isWebp = buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP';
  if (!isPng && !isJpg && !isWebp) {
    throw new Error('File header does not match a valid PNG, JPEG, or WEBP image.');
  }
  const ext = isPng ? '.png' : (isJpg ? '.jpg' : '.webp');
  const safePrefix = String(prefix).replace(/[^a-z0-9_-]/gi, '').slice(0, 16) || 'img';
  const filename = `${safePrefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buf, { mode: 0o600 });
  return `api/files/${filename}`;
}

function filterOutwardLetters(queryObj) {
  const q = String(queryObj.get('q') || '').trim().toLowerCase();
  const head = String(queryObj.get('head') || '').trim().toUpperCase();
  const subHead = String(queryObj.get('subHead') || '').trim().toLowerCase();
  const status = String(queryObj.get('status') || '').trim().toLowerCase();
  const year = String(queryObj.get('year') || '').trim();
  const from = String(queryObj.get('from') || '').trim();
  const to = String(queryObj.get('to') || '').trim();

  return db.letters
    .filter(l => {
      if (head && (l.majorHead || 'ADM') !== head) return false;
      if (subHead && !String(l.subHead || '').toLowerCase().includes(subHead)) return false;
      if (status && l.status !== status) return false;
      if (year && String(l.refYear || Core.yearKey(l.date || Core.todayISO(), db.settings.yearMode)) !== year) return false;
      if (from && (l.date || '') < from) return false;
      if (to && (l.date || '') > to) return false;
      if (q) {
        const mh = Core.getMajorHeadObj(db, l.majorHead);
        const hay = [
          l.ref, l.majorHead, mh && mh.en, mh && mh.hi, l.subHead,
          l.to, l.subject, l.heading, l.body, l.cc, l.remarks,
          JSON.stringify(l.fields || {}),
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const va = a.ref ? (a.refYear * 1e6 + a.refNo) : (1e12 + (a.createdAt || 0));
      const vb = b.ref ? (b.refYear * 1e6 + b.refNo) : (1e12 + (b.createdAt || 0));
      return vb - va;
    });
}

function makeSafeFilename(prefix, letter, ext) {
  const refPart = letter.ref ? letter.ref.replace(/[^a-zA-Z0-9_-]/g, '-') : 'Draft';
  const headPart = (letter.majorHead || 'ADM').replace(/[^A-Z0-9]/g, '');
  return `${prefix}_${refPart}_${headPart}_${letter.date || Core.todayISO()}.${ext}`;
}

const server = http.createServer(async (req, res) => {
  const ip = getClientIp(req);
  try {
    const urlObj = new URL(req.url, 'http://localhost');
    let pathname;
    try {
      pathname = decodeURIComponent(urlObj.pathname);
    } catch (_) {
      return sendJson(res, 400, { ok: false, error: 'Malformed URL.' });
    }

    // Health probe
    if (pathname === '/api/health' && req.method === 'GET') {
      return sendJson(res, 200, { ok: true, status: 'healthy' });
    }

    // Auth status (public)
    if (pathname === '/api/auth/status' && req.method === 'GET') {
      const needsSetup = Auth.needsSetup();
      const session = Auth.authenticate(req, { requireCsrf: false });
      return sendJson(res, 200, {
        ok: true,
        needsSetup,
        authenticated: !!session,
        user: session ? session.user : null,
        csrfToken: session ? session.csrfToken : null,
      });
    }

    // First-time Admin Setup (only when 0 users exist)
    if (pathname === '/api/auth/setup' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const sess = Auth.setupInitialAdmin(body, ip);
      const cookieHdr = Auth.buildSessionCookies(req, sess.sessionToken, sess.maxAgeSec);
      return sendJson(res, 200, {
        ok: true,
        user: sess.user,
        csrfToken: sess.csrfToken,
        sessionToken: sess.sessionToken,
      }, { 'set-cookie': cookieHdr });
    }

    // Login
    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const sess = Auth.login(body, ip);
      const cookieHdr = Auth.buildSessionCookies(req, sess.sessionToken, sess.maxAgeSec);
      return sendJson(res, 200, {
        ok: true,
        user: sess.user,
        csrfToken: sess.csrfToken,
        sessionToken: sess.sessionToken,
      }, { 'set-cookie': cookieHdr });
    }

    // =========================================================================
    // ALL OTHER /api/* AND /private/* ROUTES REQUIRE AUTHENTICATION
    // =========================================================================
    if (pathname.startsWith('/private/')) {
      return sendJson(res, 403, { ok: false, error: 'Direct private path access is forbidden.' });
    }

    if (pathname.startsWith('/api/')) {
      const isMutating = req.method !== 'GET' && req.method !== 'HEAD';
      const session = Auth.authenticate(req, { requireCsrf: isMutating });
      if (!session) {
        return sendJson(res, 401, { ok: false, error: 'Authentication required. Please sign in.' });
      }
      const user = session.user;

      // Logout
      if (pathname === '/api/auth/logout' && req.method === 'POST') {
        const body = await readJsonBody(req);
        Auth.logout(req, !!(body && body.allDevices), ip);
        return sendJson(res, 200, { ok: true }, { 'set-cookie': Auth.buildSessionCookies(req, '', 0) });
      }

      // Change own password
      if (pathname === '/api/auth/password' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const out = Auth.changeOwnPassword(user, body, ip);
        return sendJson(res, 200, out);
      }

      // User management (Admin only)
      if (pathname === '/api/users') {
        if (!Auth.can(user, 'admin')) return sendJson(res, 403, { ok: false, error: 'Admin privileges required.' });
        if (req.method === 'GET') {
          return sendJson(res, 200, { ok: true, users: Auth.listUsers() });
        }
        if (req.method === 'POST') {
          const body = await readJsonBody(req);
          if (body.action === 'create') {
            return sendJson(res, 200, { ok: true, user: Auth.createUser(user, body, ip) });
          }
          if (body.action === 'update') {
            return sendJson(res, 200, { ok: true, user: Auth.updateUser(user, body, ip) });
          }
          if (body.action === 'delete') {
            return sendJson(res, 200, { ok: true, deleted: Auth.deleteUser(user, body, ip) });
          }
          return sendJson(res, 400, { ok: false, error: 'Invalid user action.' });
        }
      }

      // Security Audit Logs (Admin only)
      if (pathname === '/api/audit' && req.method === 'GET') {
        if (!Auth.can(user, 'admin')) return sendJson(res, 403, { ok: false, error: 'Admin privileges required.' });
        return sendJson(res, 200, { ok: true, logs: Auth.getAuditLogs(250) });
      }

      // Protected Private Files (sign.png, uploaded stamps/letterheads)
      if (pathname.startsWith('/api/files/') && req.method === 'GET') {
        const fname = path.basename(pathname.slice('/api/files/'.length));
        if (!/^[a-zA-Z0-9._-]+$/.test(fname)) {
          return sendJson(res, 400, { ok: false, error: 'Invalid file name.' });
        }
        const buf = resolveImageBuffer('api/files/' + fname);
        if (!buf) return sendJson(res, 404, { ok: false, error: 'File not found.' });
        const ext = path.extname(fname).toLowerCase();
        return sendBinary(res, 200, buf, MIME[ext] || 'application/octet-stream');
      }

      // Secure Image Upload (Admin only)
      if (pathname === '/api/upload-image' && req.method === 'POST') {
        if (!Auth.can(user, 'admin')) return sendJson(res, 403, { ok: false, error: 'Admin privileges required to upload stamps or letterheads.' });
        const body = await readJsonBody(req, 8 * 1024 * 1024);
        const savedPath = validateAndSaveUploadedImage(body.dataUrl, body.kind || 'asset');
        Auth.logAudit(user.username, user.role, 'IMAGE_UPLOADED', `Uploaded ${body.kind || 'image'} -> ${savedPath}`, ip);
        return sendJson(res, 200, { ok: true, path: savedPath });
      }

      // Fetch DB + Server Info
      if (pathname === '/api/db' && req.method === 'GET') {
        const masterXlsx = path.join(DATA_DIR, 'Master_Letter_Register.xlsx');
        return sendJson(res, 200, {
          ok: true,
          db,
          serverInfo: {
            port: PORT,
            lanUrls: getLanUrls(PORT),
            masterExcelReady: fs.existsSync(masterXlsx),
            masterExcelUpdatedAt: fs.existsSync(masterXlsx) ? fs.statSync(masterXlsx).mtimeMs : null,
            appsScriptTemplate: GOOGLE_APPS_SCRIPT_TEMPLATE,
          },
        });
      }

      // State Operations
      if (pathname === '/api/op' && req.method === 'POST') {
        const { name, payload } = await readJsonBody(req, 6 * 1024 * 1024);
        if (Core.ADMIN_ONLY_OPS.has(name)) {
          if (!Auth.can(user, 'admin')) {
            return sendJson(res, 403, { ok: false, error: `Operation "${name}" requires Administrator privileges.` });
          }
        } else if (!Auth.can(user, 'write')) {
          return sendJson(res, 403, { ok: false, error: 'Your account has Viewer (read-only) access.' });
        }

        const result = Core.apply(db, name, payload, user.username);
        const shouldSyncSheet = ['saveLetter', 'issueLetter', 'cancelLetter', 'patchLetter', 'saveInward', 'deleteInward'].includes(name);
        saveDb(shouldSyncSheet);

        if (name === 'issueLetter') {
          Auth.logAudit(user.username, user.role, 'LETTER_ISSUED', `Issued Ref. No. ${result.ref} (${result.majorHead}) — ${result.subject || result.heading || ''}`, ip);
        } else if (name === 'cancelLetter') {
          Auth.logAudit(user.username, user.role, 'LETTER_CANCELLED', `Cancelled Ref. No. ${result.ref}: ${result.cancelReason}`, ip);
        } else if (name === 'setCounter') {
          Auth.logAudit(user.username, user.role, 'COUNTER_UPDATED', `Updated counter: ${JSON.stringify(payload)}`, ip);
        } else if (name === 'restore') {
          Auth.logAudit(user.username, user.role, 'BACKUP_RESTORED', 'Restored database from JSON backup', ip);
        }

        return sendJson(res, 200, { ok: true, result, counters: db.counters });
      }

      // Export Word (.docx)
      if (pathname === '/api/export/docx' && (req.method === 'GET' || req.method === 'POST')) {
        let letter;
        if (req.method === 'POST') {
          const body = await readJsonBody(req);
          letter = body.letter;
        } else {
          const id = urlObj.searchParams.get('id');
          letter = db.letters.find(x => x.id === id);
        }
        if (!letter) return sendJson(res, 404, { ok: false, error: 'Letter not found.' });
        const buf = await generateLetterDocxBuffer(db, letter, resolveImageBuffer);
        return sendBinary(
          res,
          200,
          buf,
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          makeSafeFilename('Letter', letter, 'docx')
        );
      }

      // Export Letter PDF (.pdf)
      if (pathname === '/api/export/pdf' && (req.method === 'GET' || req.method === 'POST')) {
        let letter;
        if (req.method === 'POST') {
          const body = await readJsonBody(req);
          letter = body.letter;
        } else {
          const id = urlObj.searchParams.get('id');
          letter = db.letters.find(x => x.id === id);
        }
        if (!letter) return sendJson(res, 404, { ok: false, error: 'Letter not found.' });
        const buf = await generateLetterPdfBuffer(db, letter, resolveImageBuffer);
        return sendBinary(res, 200, buf, 'application/pdf', makeSafeFilename('Letter', letter, 'pdf'));
      }

      // Export Register Excel (.xlsx)
      if (pathname === '/api/export/xlsx' && req.method === 'GET') {
        const hasFilters = ['q', 'head', 'subHead', 'status', 'year', 'from', 'to'].some(k => urlObj.searchParams.get(k));
        const rows = hasFilters ? filterOutwardLetters(urlObj.searchParams) : undefined;
        const buf = await buildRegisterWorkbookBuffer(db, rows ? { letters: rows.slice().reverse() } : {});
        const fname = hasFilters
          ? `Filtered_Letter_Register_${Core.todayISO()}.xlsx`
          : `Master_Letter_Register_${Core.todayISO()}.xlsx`;
        Auth.logAudit(user.username, user.role, 'EXPORT_XLSX', `Downloaded ${fname}`, ip);
        return sendBinary(
          res,
          200,
          buf,
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          fname
        );
      }

      // Export Printable Register PDF (.pdf)
      if (pathname === '/api/export/register-pdf' && req.method === 'GET') {
        const rows = filterOutwardLetters(urlObj.searchParams).reverse();
        const headParam = urlObj.searchParams.get('head');
        const title = headParam
          ? `Outward Register — Major Head: ${Core.getMajorHeadLabel(db, headParam, 'en')}`
          : 'Outward Letter Register (जावक पत्र पंजी)';
        const buf = await generateRegisterPdfBuffer(db, rows, title);
        return sendBinary(res, 200, buf, 'application/pdf', `Letter_Register_${Core.todayISO()}.pdf`);
      }

      // Import Register Rows from Excel (.xlsx)
      if (pathname === '/api/import/xlsx' && req.method === 'POST') {
        if (!Auth.can(user, 'write')) return sendJson(res, 403, { ok: false, error: 'Write permission required.' });
        const body = await readJsonBody(req, 10 * 1024 * 1024);
        if (!body.base64) return sendJson(res, 400, { ok: false, error: 'Missing Excel file content.' });
        const buf = Buffer.from(String(body.base64), 'base64');
        const imported = await parseExcelRegisterBuffer(buf, db);
        imported.forEach(item => {
          item.createdBy = user.username;
          db.letters.push(item);
        });
        saveDb(true);
        Auth.logAudit(user.username, user.role, 'IMPORT_XLSX', `Imported ${imported.length} letters from Excel`, ip);
        return sendJson(res, 200, { ok: true, importedCount: imported.length });
      }

      // Manual Google Sheet Test & Full Sync
      if (pathname === '/api/gsheet/sync' && req.method === 'POST') {
        if (!Auth.can(user, 'write')) return sendJson(res, 403, { ok: false, error: 'Write permission required.' });
        const body = await readJsonBody(req);
        if (body && body.webhookUrl !== undefined && Auth.can(user, 'admin')) {
          db.settings.gsheet = Object.assign(db.settings.gsheet || {}, {
            enabled: body.enabled !== false,
            autoSync: body.autoSync !== false,
            webhookUrl: String(body.webhookUrl || '').trim(),
            webhookSecret: String(body.webhookSecret || '').trim(),
          });
        }
        const syncRes = await syncToGoogleSheet(db);
        db.settings.gsheet.lastSyncAt = Date.now();
        db.settings.gsheet.lastSyncStatus = `Synced ${db.letters.length} outward & ${db.inward.length} inward records`;
        saveDb(false);
        Auth.logAudit(user.username, user.role, 'GSHEET_SYNC', db.settings.gsheet.lastSyncStatus, ip);
        return sendJson(res, 200, {
          ok: true,
          syncResult: syncRes,
          lastSyncAt: db.settings.gsheet.lastSyncAt,
          lastSyncStatus: db.settings.gsheet.lastSyncStatus,
        });
      }

      return sendJson(res, 404, { ok: false, error: 'API endpoint not found.' });
    }

    // =========================================================================
    // STATIC PUBLIC SHELL (ONLY safe UI assets inside public/)
    // =========================================================================
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, SECURITY_HEADERS);
      return res.end('Method Not Allowed');
    }

    const relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const resolved = path.resolve(PUB_DIR, relPath);
    if (resolved !== PUB_DIR && !resolved.startsWith(PUB_DIR + path.sep)) {
      res.writeHead(403, SECURITY_HEADERS);
      return res.end('Forbidden');
    }

    fs.stat(resolved, (stErr, stat) => {
      if (stErr || !stat.isFile()) {
        res.writeHead(404, SECURITY_HEADERS);
        return res.end('Not Found');
      }
      const ext = path.extname(resolved).toLowerCase();
      const cacheHdr = (ext === '.ttf' || ext === '.woff2')
        ? 'public, max-age=604800, immutable'
        : 'no-cache';
      res.writeHead(200, Object.assign({}, SECURITY_HEADERS, {
        'content-type': MIME[ext] || 'application/octet-stream',
        'cache-control': cacheHdr,
      }));
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(resolved).pipe(res);
    });
  } catch (err) {
    const code = err.status || 500;
    const safeMsg = code < 500 ? err.message : 'Internal server error.';
    if (code >= 500) console.error('[Server Error]', err);
    if (!res.headersSent) sendJson(res, code, { ok: false, error: safeMsg });
  }
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    const lan = getLanUrls(PORT);
    console.log('\n====================================================================');
    console.log('  ✉  Letter Draft Assistant v2.0 (सुरक्षित पत्र-प्रारूप एवं पंजी प्रणाली)');
    console.log('====================================================================');
    console.log(`  Local PC URL   :  http://localhost:${PORT}`);
    if (lan.length) {
      console.log(`  Office Wi-Fi   :  ${lan.join('  |  ')}`);
    }
    console.log(`  Security       :  Mandatory Login ON (Scrypt + RBAC + CSRF)`);
    console.log(`  Excel Register :  data/Master_Letter_Register.xlsx (Auto-Saved)`);
    console.log(`  Daily Backups  :  data/backups/ (30-Day Retention)`);
    console.log('====================================================================\n');
  });
}

module.exports = { server, db, Auth };
