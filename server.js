'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const Core = require('./public/core.js');
const Auth = require('./lib/auth.js');
const {
  generateLetterPdfBuffer,
  generateRegisterPdfBuffer,
  generateInspectionReportPdfBuffer,
} = require('./lib/exporter-pdf.js');
const { generateLetterDocxBuffer } = require('./lib/exporter-docx.js');
const {
  generateRegisterXlsxBuffer,
  syncMasterExcelFile,
  buildDirectoryWorkbookBuffer,
  parseDirectoryExcelBuffer,
  buildTemplateMailMergeSampleBuffer,
  parseGenericMailMergeExcelBuffer,
  parseImportedRegisterXlsx,
} = require('./lib/exporter-xlsx.js');
const { syncToGoogleSheets } = require('./lib/gsheets-sync.js');
const {
  loadOrCreateVerifySecret,
  computeVerifyCode,
  formatVerifyCode,
  buildVerifyUrl,
  generateQrPngBuffer,
  generateQrDataUrl,
  verifyDocumentRecord,
  renderPublicVerifyPageHtml,
} = require('./lib/qr-verify.js');
const { generateBatchOutput } = require('./lib/batch-engine.js');
const { runOfflineOcrOnBuffer, shutdownOcrWorker } = require('./lib/ocr-engine.js');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const PUB = path.join(ROOT, 'public');
function resolveWritableDataDir() {
  if (process.env.DATA_DIR) return path.resolve(process.env.DATA_DIR);
  const preferred = path.join(ROOT, 'data');
  try {
    fs.mkdirSync(path.join(preferred, 'backups'), { recursive: true });
    const probe = path.join(preferred, '.write-probe');
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return preferred;
  } catch (_) {
    // Serverless / read-only container fallback (Vercel, AWS Lambda, Cloud Functions)
    const fallback = path.join(os.tmpdir(), 'letter-draft-assistant-data');
    fs.mkdirSync(path.join(fallback, 'backups'), { recursive: true });
    return fallback;
  }
}

const DATA = resolveWritableDataDir();
const DB_FILE = path.join(DATA, 'db.json');
const MASTER_XLSX_FILE = path.join(DATA, 'Master_Letter_Register.xlsx');
const BAK = path.join(DATA, 'backups');
const STORAGE_DEFAULTS = path.join(ROOT, 'storage', 'defaults');
const STORAGE_UPLOADS = path.join(DATA, 'uploads');

fs.mkdirSync(BAK, { recursive: true });
fs.mkdirSync(STORAGE_UPLOADS, { recursive: true });

const authMgr = Auth.createAuthManager(DATA);
const VERIFY_SECRET = loadOrCreateVerifySecret(DATA);

// Load vendor JS bundles from public/vendor/ (or node_modules fallback)
const VENDOR_FUSE = path.join(PUB, 'vendor', 'fuse.js');
const FUSE_BROWSER_BUNDLE = fs.existsSync(VENDOR_FUSE)
  ? fs.readFileSync(VENDOR_FUSE, 'utf8')
  : `(function(){var module={exports:{}},exports=module.exports;\n${fs.readFileSync(path.join(ROOT, 'node_modules', 'fuse.js', 'dist', 'fuse.min.cjs'), 'utf8')}\nwindow.Fuse=module.exports.default||module.exports;})();\n`;

const VENDOR_SIG = path.join(PUB, 'vendor', 'signature_pad.js');
const SIGPAD_BROWSER_BUNDLE = fs.existsSync(VENDOR_SIG)
  ? fs.readFileSync(VENDOR_SIG, 'utf8')
  : fs.readFileSync(path.join(ROOT, 'node_modules', 'signature_pad', 'dist', 'signature_pad.umd.min.js'), 'utf8');

function loadDb() {
  if (fs.existsSync(DB_FILE)) {
    try {
      return Core.migrate(JSON.parse(fs.readFileSync(DB_FILE, 'utf8')));
    } catch (e) {
      console.error('Warning: db.json corrupted, initializing clean state:', e.message);
    }
  }
  return Core.defaultDb();
}

let db = loadDb();
let excelSyncTimer = null;

function scheduleRegisterSync(triggerReason) {
  clearTimeout(excelSyncTimer);
  excelSyncTimer = setTimeout(async () => {
    try {
      await syncMasterExcelFile(db, MASTER_XLSX_FILE);
    } catch (e) {
      console.error('Master Excel sync warning:', e.message);
    }
    if (db.settings && db.settings.gsheet && db.settings.gsheet.enabled && db.settings.gsheet.autoSync) {
      const res = await syncToGoogleSheets(db, triggerReason || 'auto');
      if (res && res.ok) {
        db.settings.gsheet.lastSyncAt = Date.now();
        db.settings.gsheet.lastSyncStatus = `OK (${res.outwardCount} out, ${res.inwardCount} in)`;
      } else if (res && !res.skipped) {
        db.settings.gsheet.lastSyncStatus = `Error: ${res.error || 'Failed'}`;
      }
    }
  }, 250);
}

function saveDb(triggerReason) {
  const raw = JSON.stringify(db, null, 2);
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, raw, { mode: 0o600 });
  fs.renameSync(tmp, DB_FILE);

  const stamp = new Date().toISOString().slice(0, 13).replace(/[:T]/g, '-');
  const bf = path.join(BAK, `${stamp}.json`);
  if (!fs.existsSync(bf)) {
    fs.writeFileSync(bf, raw, { mode: 0o600 });
    const files = fs.readdirSync(BAK).sort();
    while (files.length > 48) {
      try { fs.unlinkSync(path.join(BAK, files.shift())); } catch (_) {}
    }
  }
  scheduleRegisterSync(triggerReason);
}

if (!fs.existsSync(DB_FILE)) saveDb('startup');
else syncMasterExcelFile(db, MASTER_XLSX_FILE).catch(() => {});

function resolveImageBuffer(src) {
  if (!src || typeof src !== 'string') return null;
  if (src.startsWith('data:image/')) {
    const idx = src.indexOf('base64,');
    if (idx > 0) return Buffer.from(src.slice(idx + 7), 'base64');
    return null;
  }
  if (src.startsWith('assets/')) {
    const p = path.resolve(PUB, src);
    if (p.startsWith(PUB + path.sep) && fs.existsSync(p)) return fs.readFileSync(p);
    return null;
  }
  if (src.startsWith('api/files/') || src.startsWith('/api/files/')) {
    const name = path.basename(src);
    const up = path.join(STORAGE_UPLOADS, name);
    if (fs.existsSync(up)) return fs.readFileSync(up);
    const def = path.join(STORAGE_DEFAULTS, name);
    if (fs.existsSync(def)) return fs.readFileSync(def);
  }
  return null;
}

function getEffectiveBaseUrl(req) {
  if (db.settings && db.settings.publicBaseUrl) return db.settings.publicBaseUrl;
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`).split(',')[0].trim();
  return `${proto}://${host}`;
}

async function buildQrOpts(req, letter) {
  if (!letter || !letter.ref || letter.showQr === false) return {};
  const baseUrl = getEffectiveBaseUrl(req);
  const verifyUrl = buildVerifyUrl(baseUrl, letter, VERIFY_SECRET);
  const verifyCode = formatVerifyCode(computeVerifyCode(VERIFY_SECRET, letter));
  const qrBuffer = await generateQrPngBuffer(verifyUrl, 150);
  return { qrBuffer, verifyCode, verifyUrl };
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self';"
  );
}

function sendJson(res, status, data, extraHeaders = {}) {
  setSecurityHeaders(res);
  res.writeHead(status, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  }, extraHeaders));
  res.end(JSON.stringify(data));
}

function readBody(req, maxBytes = 8 * 1024 * 1024) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
    if (typeof req.body === 'string') {
      try { return Promise.resolve(req.body ? JSON.parse(req.body) : {}); } catch (_) {}
    }
    if (Buffer.isBuffer(req.body)) {
      try { return Promise.resolve(req.body.length ? JSON.parse(req.body.toString('utf8')) : {}); } catch (_) {}
    }
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > maxBytes) {
        req.destroy();
        reject(Object.assign(new Error('Request payload too large'), { statusCode: 413 }));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (_) {
        reject(Object.assign(new Error('Invalid JSON payload'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function parseImageDataUrlToValidatedBuffer(dataUrl, maxBytes = 5 * 1024 * 1024) {
  const m = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!m) throw Object.assign(new Error('Invalid image format (use PNG, JPG, or WEBP).'), { statusCode: 400 });
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const buf = Buffer.from(m[2].replace(/\s+/g, ''), 'base64');
  if (buf.length > maxBytes) throw Object.assign(new Error('Image exceeds maximum size limit.'), { statusCode: 413 });
  const isPng = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const isJpg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isWebp = buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP';
  if (!isPng && !isJpg && !isWebp) {
    throw Object.assign(new Error('Image header validation failed.'), { statusCode: 400 });
  }
  return { buf, ext };
}

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

// Public verify rate-limit bucket (30 req/min/IP)
const verifyBuckets = new Map();
function checkVerifyRateLimit(ip) {
  const now = Date.now();
  const b = verifyBuckets.get(ip);
  if (!b || now - b.start > 60000) {
    verifyBuckets.set(ip, { start: now, count: 1 });
    return true;
  }
  b.count++;
  return b.count <= 40;
}

function requireAuth(req, res, { csrf = false, adminOnly = false } = {}) {
  let session = null;
  try {
    session = authMgr.authenticate(req, { requireCsrf: csrf });
  } catch (err) {
    sendJson(res, err.status || 403, { error: err.message });
    return null;
  }
  if (!session) {
    sendJson(res, 401, { error: 'Authentication required. Please sign in.' });
    return null;
  }
  if (adminOnly && session.user.role !== 'admin') {
    sendJson(res, 403, { error: 'Administrator permission required for this action.' });
    return null;
  }
  return session;
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = u.pathname;
    const ip = getClientIp(req);

    // 1. Health Check
    if (pathname === '/api/health' && req.method === 'GET') {
      return sendJson(res, 200, { ok: true, version: '3.0.0', uptime: Math.round(process.uptime()) });
    }

    // 2. Public QR Verification Portal & API (Read-only, rate-limited, zero private register leakage)
    if (pathname === '/verify' && req.method === 'GET') {
      setSecurityHeaders(res);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(renderPublicVerifyPageHtml());
    }

    if (pathname === '/api/public/verify' && req.method === 'GET') {
      if (!checkVerifyRateLimit(ip)) {
        return sendJson(res, 429, { valid: false, status: 'rate_limited', message: 'Too many verification checks. Please wait 1 minute.' });
      }
      const result = verifyDocumentRecord(db, VERIFY_SECRET, u.searchParams.get('ref'), u.searchParams.get('c'));
      return sendJson(res, 200, result);
    }

    // 3. Local Zero-CDN Browser Vendor Bundles
    if (pathname === '/vendor/fuse.js' && req.method === 'GET') {
      setSecurityHeaders(res);
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
      return res.end(FUSE_BROWSER_BUNDLE);
    }

    if (pathname === '/vendor/signature_pad.js' && req.method === 'GET') {
      setSecurityHeaders(res);
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
      return res.end(SIGPAD_BROWSER_BUNDLE);
    }

    // 4. Auth Endpoints
    if (pathname === '/api/auth/status' && req.method === 'GET') {
      const setupRequired = authMgr.needsSetup();
      const session = authMgr.authenticate(req, { requireCsrf: false });
      return sendJson(res, 200, {
        setupRequired,
        authenticated: !!session,
        user: session ? session.user : null,
        csrfToken: session ? session.csrfToken : null,
        schoolName: (db.settings && db.settings.school && db.settings.school.en) || "CM School of Excellence Girls' Dumka",
      });
    }

    if (pathname === '/api/auth/setup' && req.method === 'POST') {
      if (!authMgr.needsSetup()) {
        return sendJson(res, 403, { error: 'Initial setup is already completed. Please sign in.' });
      }
      const body = await readBody(req, 64 * 1024);
      const sess = authMgr.setupInitialAdmin(body, ip);
      return sendJson(res, 200, { ok: true, user: sess.user, csrfToken: sess.csrfToken }, {
        'Set-Cookie': authMgr.buildSessionCookies(req, sess.sessionToken, sess.maxAgeSec),
      });
    }

    if (pathname === '/api/auth/login' && req.method === 'POST') {
      if (authMgr.needsSetup()) {
        return sendJson(res, 400, { error: 'Setup required first. Create the Administrator account.' });
      }
      const body = await readBody(req, 64 * 1024);
      try {
        const sess = authMgr.login(body, ip);
        return sendJson(res, 200, { ok: true, user: sess.user, csrfToken: sess.csrfToken }, {
          'Set-Cookie': authMgr.buildSessionCookies(req, sess.sessionToken, sess.maxAgeSec),
        });
      } catch (err) {
        return sendJson(res, err.status || 401, { error: err.message });
      }
    }

    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      authMgr.logout(req, false, ip);
      return sendJson(res, 200, { ok: true }, { 'Set-Cookie': authMgr.buildSessionCookies(req, null, 0) });
    }

    if (pathname === '/api/auth/change-password' && req.method === 'POST') {
      const sess = requireAuth(req, res, { csrf: true });
      if (!sess) return;
      const body = await readBody(req, 64 * 1024);
      authMgr.changeOwnPassword(sess.user, body, ip);
      return sendJson(res, 200, { ok: true });
    }

    // 5. User Management (Admin Only)
    if (pathname === '/api/users' && req.method === 'GET') {
      const sess = requireAuth(req, res, { adminOnly: true });
      if (!sess) return;
      return sendJson(res, 200, { users: authMgr.listUsers(), audit: authMgr.getAuditLogs(80) });
    }

    if (pathname === '/api/users' && req.method === 'POST') {
      const sess = requireAuth(req, res, { csrf: true, adminOnly: true });
      if (!sess) return;
      const body = await readBody(req, 64 * 1024);
      const created = authMgr.createUser(sess.user, body, ip);
      return sendJson(res, 200, { ok: true, user: created, users: authMgr.listUsers() });
    }

    if (pathname === '/api/users/update' && req.method === 'POST') {
      const sess = requireAuth(req, res, { csrf: true, adminOnly: true });
      if (!sess) return;
      const body = await readBody(req, 64 * 1024);
      authMgr.updateUser(sess.user, body, ip);
      return sendJson(res, 200, { ok: true, users: authMgr.listUsers() });
    }

    if (pathname === '/api/users/delete' && req.method === 'POST') {
      const sess = requireAuth(req, res, { csrf: true, adminOnly: true });
      if (!sess) return;
      const body = await readBody(req, 64 * 1024);
      authMgr.deleteUser(sess.user, { id: body.id }, ip);
      return sendJson(res, 200, { ok: true, users: authMgr.listUsers() });
    }

    // 6. Protected Stamp / Scan / Upload Asset Streaming
    if (pathname.startsWith('/api/files/') && req.method === 'GET') {
      const sess = requireAuth(req, res);
      if (!sess) return;
      const name = path.basename(pathname);
      if (!/^[a-zA-Z0-9._-]+$/.test(name)) return sendJson(res, 400, { error: 'Invalid file name' });
      let filePath = path.join(STORAGE_UPLOADS, name);
      if (!fs.existsSync(filePath)) filePath = path.join(STORAGE_DEFAULTS, name);
      if (!fs.existsSync(filePath)) return sendJson(res, 404, { error: 'Asset not found' });
      setSecurityHeaders(res);
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'private, max-age=300',
      });
      return res.end(fs.readFileSync(filePath));
    }

    if (pathname === '/api/upload-image' && req.method === 'POST') {
      const sess = requireAuth(req, res, { csrf: true });
      if (!sess) return;
      const body = await readBody(req, 7 * 1024 * 1024);
      const { buf, ext } = parseImageDataUrlToValidatedBuffer(body.dataUrl, 4 * 1024 * 1024);
      const fname = `${String(body.kind || 'img').replace(/[^a-z0-9]/gi, '').slice(0, 12) || 'img'}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
      fs.writeFileSync(path.join(STORAGE_UPLOADS, fname), buf, { mode: 0o600 });
      authMgr.logAudit(sess.user.username, sess.user.role, 'upload_image', fname, ip);
      return sendJson(res, 200, { ok: true, url: `api/files/${fname}` });
    }

    // 7. Offline Hindi + English Paper Scan OCR Endpoint (tesseract.js)
    if (pathname === '/api/inward/ocr' && req.method === 'POST') {
      const sess = requireAuth(req, res, { csrf: true });
      if (!sess) return;
      const body = await readBody(req, 10 * 1024 * 1024);
      const { buf, ext } = parseImageDataUrlToValidatedBuffer(body.dataUrl, 7 * 1024 * 1024);
      let attachment = '';
      if (body.saveScan !== false) {
        const fname = `scan_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
        fs.writeFileSync(path.join(STORAGE_UPLOADS, fname), buf, { mode: 0o600 });
        attachment = `api/files/${fname}`;
      }
      const extracted = await runOfflineOcrOnBuffer(buf);
      authMgr.logAudit(sess.user.username, sess.user.role, 'inward_ocr', attachment || 'inline', ip);
      return sendJson(res, 200, Object.assign({ ok: true, attachment }, extracted));
    }

    // 8. Core Authenticated Database Read & Mutate
    if (pathname === '/api/db' && req.method === 'GET') {
      const sess = requireAuth(req, res);
      if (!sess) return;
      const safeClone = JSON.parse(JSON.stringify(db));
      if (sess.user.role !== 'admin' && safeClone.settings && safeClone.settings.gsheet) {
        safeClone.settings.gsheet.webhookSecret = safeClone.settings.gsheet.webhookSecret ? '••••••••' : '';
      }
      return sendJson(res, 200, safeClone);
    }

    if (pathname === '/api/op' && req.method === 'POST') {
      const sess = requireAuth(req, res, { csrf: true });
      if (!sess) return;
      const { op, payload } = await readBody(req, 6 * 1024 * 1024);
      if (Core.ADMIN_ONLY_OPS.has(op) && sess.user.role !== 'admin') {
        return sendJson(res, 403, { error: `Only Administrators can perform "${op}".` });
      }
      if (op === 'issueLetter' && db.settings.requireApprovalForStaff && sess.user.role !== 'admin') {
        return sendJson(res, 403, { error: 'Principal approval is required to issue Ref. Nos. Please click "Send for Approval".' });
      }
      const result = Core.apply(db, op, payload, sess.user.username);
      saveDb(op);
      if (['issueLetter', 'approveAndIssueLetter', 'returnLetter', 'cancelLetter', 'deleteLetter', 'restore', 'setCounter', 'saveSettings'].includes(op)) {
        authMgr.logAudit(sess.user.username, sess.user.role, `op:${op}`, String((payload && (payload.id || payload.series)) || ''), ip);
      }
      return sendJson(res, 200, { ok: true, result, db });
    }

    // 9. QR Metadata for Live Preview & Dispatch Share
    if (pathname.startsWith('/api/letter/') && pathname.endsWith('/qr') && req.method === 'GET') {
      const sess = requireAuth(req, res);
      if (!sess) return;
      const parts = pathname.split('/');
      const id = decodeURIComponent(parts[3] || '');
      const letter = db.letters.find(x => x.id === id);
      if (!letter || !letter.ref) {
        return sendJson(res, 200, { issued: false, qrDataUrl: '', verifyUrl: '', verifyCode: '' });
      }
      const baseUrl = getEffectiveBaseUrl(req);
      const verifyUrl = buildVerifyUrl(baseUrl, letter, VERIFY_SECRET);
      const verifyCode = formatVerifyCode(computeVerifyCode(VERIFY_SECRET, letter));
      const qrDataUrl = await generateQrDataUrl(verifyUrl, 136);
      return sendJson(res, 200, { issued: true, qrDataUrl, verifyUrl, verifyCode });
    }

    // 10. Server-Side Document Exporters (.docx, .pdf, .xlsx, Inspection PDF)
    if (pathname === '/api/export/pdf' && req.method === 'POST') {
      const sess = requireAuth(req, res, { csrf: true });
      if (!sess) return;
      const { letter } = await readBody(req, 4 * 1024 * 1024);
      if (!letter) return sendJson(res, 400, { error: 'Missing letter data' });
      // Ensure stored letter id matches for valid HMAC if issued
      const stored = letter.ref ? (db.letters.find(x => x.id === letter.id) || letter) : letter;
      const mergedLetter = Object.assign({}, stored, letter, { id: stored.id, ref: stored.ref, date: letter.date || stored.date });
      const qrOpts = await buildQrOpts(req, mergedLetter);
      const pdfBuf = await generateLetterPdfBuffer(db, mergedLetter, resolveImageBuffer, qrOpts);
      const fname = `Letter_${String(mergedLetter.ref || 'Draft').replace(/[^a-zA-Z0-9_-]/g, '-')}.pdf`;
      setSecurityHeaders(res);
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fname}"`,
        'Content-Length': pdfBuf.length,
      });
      return res.end(pdfBuf);
    }

    if (pathname === '/api/export/docx' && req.method === 'POST') {
      const sess = requireAuth(req, res, { csrf: true });
      if (!sess) return;
      const { letter } = await readBody(req, 4 * 1024 * 1024);
      if (!letter) return sendJson(res, 400, { error: 'Missing letter data' });
      const stored = letter.ref ? (db.letters.find(x => x.id === letter.id) || letter) : letter;
      const mergedLetter = Object.assign({}, stored, letter, { id: stored.id, ref: stored.ref, date: letter.date || stored.date });
      const qrOpts = await buildQrOpts(req, mergedLetter);
      const docxBuf = await generateLetterDocxBuffer(db, mergedLetter, resolveImageBuffer, qrOpts);
      const fname = `Letter_${String(mergedLetter.ref || 'Draft').replace(/[^a-zA-Z0-9_-]/g, '-')}.docx`;
      setSecurityHeaders(res);
      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${fname}"`,
        'Content-Length': docxBuf.length,
      });
      return res.end(docxBuf);
    }

    if (pathname === '/api/export/register-xlsx' && req.method === 'GET') {
      const sess = requireAuth(req, res);
      if (!sess) return;
      const filterOpts = {
        majorHead: u.searchParams.get('majorHead') || '',
        status: u.searchParams.get('status') || '',
        year: u.searchParams.get('year') || '',
        q: u.searchParams.get('q') || '',
      };
      const buf = await generateRegisterXlsxBuffer(db, filterOpts);
      const fname = `Letter_Register_${Core.todayISO()}.xlsx`;
      setSecurityHeaders(res);
      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fname}"`,
        'Content-Length': buf.length,
      });
      return res.end(buf);
    }

    if (pathname === '/api/export/register-pdf' && req.method === 'POST') {
      const sess = requireAuth(req, res, { csrf: true });
      if (!sess) return;
      const { ids, title } = await readBody(req, 1024 * 1024);
      let rows = db.letters.filter(l => l.ref);
      if (Array.isArray(ids) && ids.length) {
        const set = new Set(ids);
        rows = db.letters.filter(l => set.has(l.id));
      }
      rows.sort((a, b) => (a.refYear || 0) - (b.refYear || 0) || (a.refNo || 0) - (b.refNo || 0));
      const pdfBuf = await generateRegisterPdfBuffer(db, rows, title);
      setSecurityHeaders(res);
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Outward_Register_${Core.todayISO()}.pdf"`,
        'Content-Length': pdfBuf.length,
      });
      return res.end(pdfBuf);
    }

    if (pathname === '/api/export/inspection-pdf' && req.method === 'GET') {
      const sess = requireAuth(req, res);
      if (!sess) return;
      const pdfBuf = await generateInspectionReportPdfBuffer(db);
      setSecurityHeaders(res);
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Inspection_Audit_Report_${Core.todayISO()}.pdf"`,
        'Content-Length': pdfBuf.length,
      });
      return res.end(pdfBuf);
    }

    // 11. Student & Staff Directory Excel Import / Export
    if (pathname === '/api/export/directory-xlsx' && req.method === 'GET') {
      const sess = requireAuth(req, res);
      if (!sess) return;
      const kind = u.searchParams.get('kind') === 'staff' ? 'staff' : 'students';
      const sample = u.searchParams.get('sample') === '1';
      const buf = await buildDirectoryWorkbookBuffer(db, kind, sample);
      const fname = `${sample ? 'Sample_' : ''}${kind === 'staff' ? 'Staff' : 'Student'}_Directory_${Core.todayISO()}.xlsx`;
      setSecurityHeaders(res);
      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fname}"`,
        'Content-Length': buf.length,
      });
      return res.end(buf);
    }

    if (pathname === '/api/import/directory-xlsx' && req.method === 'POST') {
      const sess = requireAuth(req, res, { csrf: true });
      if (!sess) return;
      const { base64, kind } = await readBody(req, 10 * 1024 * 1024);
      if (!base64) return sendJson(res, 400, { error: 'Missing Excel file data' });
      const buf = Buffer.from(base64, 'base64');
      const targetKind = kind === 'staff' ? 'staff' : 'students';
      const rows = await parseDirectoryExcelBuffer(buf, targetKind);
      const stats = Core.apply(db, targetKind === 'staff' ? 'bulkUpsertStaff' : 'bulkUpsertStudents', { rows }, sess.user.username);
      saveDb(`import_${targetKind}`);
      authMgr.logAudit(sess.user.username, sess.user.role, `import_${targetKind}`, `${rows.length} rows`, ip);
      return sendJson(res, 200, { ok: true, stats, db });
    }

    // 12. Bulk Mail-Merge & Batch Certificate Engine Endpoints
    if (pathname === '/api/export/mailmerge-sample' && req.method === 'POST') {
      const sess = requireAuth(req, res, { csrf: true });
      if (!sess) return;
      const { tpl } = await readBody(req, 512 * 1024);
      const buf = await buildTemplateMailMergeSampleBuffer(tpl);
      setSecurityHeaders(res);
      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="MailMerge_Template_${(tpl && tpl.id) || 'sample'}.xlsx"`,
        'Content-Length': buf.length,
      });
      return res.end(buf);
    }

    if (pathname === '/api/import/mailmerge-parse' && req.method === 'POST') {
      const sess = requireAuth(req, res, { csrf: true });
      if (!sess) return;
      const { base64 } = await readBody(req, 8 * 1024 * 1024);
      if (!base64) return sendJson(res, 400, { error: 'Missing Excel file' });
      const parsed = await parseGenericMailMergeExcelBuffer(Buffer.from(base64, 'base64'));
      return sendJson(res, 200, { ok: true, headers: parsed.headers, rows: parsed.rows });
    }

    if (pathname === '/api/batch/generate' && req.method === 'POST') {
      const sess = requireAuth(req, res, { csrf: true });
      if (!sess) return;
      const { letters, issueRefs, outputFormat, date } = await readBody(req, 12 * 1024 * 1024);
      if (!Array.isArray(letters) || !letters.length) {
        return sendJson(res, 400, { error: 'Batch contains 0 records.' });
      }
      if (letters.length > 250) {
        return sendJson(res, 400, { error: 'Maximum 250 documents per single batch.' });
      }
      if (issueRefs && db.settings.requireApprovalForStaff && sess.user.role !== 'admin') {
        return sendJson(res, 403, { error: 'Only Administrators can issue official Ref. Nos. when Principal Approval Policy is enabled.' });
      }

      const finalized = [];
      for (const rawL of letters) {
        const saved = Core.apply(db, 'saveLetter', Object.assign({}, rawL, { id: rawL.id || Core.uid() }), sess.user.username);
        if (issueRefs) {
          Core.apply(db, 'issueLetter', { id: saved.id, date: date || saved.date || Core.todayISO() }, sess.user.username);
          // Re-substitute {{ref_no}} inside subject/body/heading if present
          ['to', 'heading', 'subject', 'salutation', 'body', 'closing', 'encl', 'cc'].forEach(k => {
            if (typeof saved[k] === 'string') {
              saved[k] = saved[k].replace(/____/g, saved.ref);
            }
          });
        }
        finalized.push(saved);
      }
      saveDb(issueRefs ? 'batch_issue' : 'batch_draft');
      authMgr.logAudit(sess.user.username, sess.user.role, issueRefs ? 'batch_issue' : 'batch_draft', `${finalized.length} docs (${outputFormat})`, ip);

      const out = await generateBatchOutput(db, finalized, resolveImageBuffer, {
        outputFormat: outputFormat || 'combined-pdf',
        baseUrl: getEffectiveBaseUrl(req),
        verifySecret: VERIFY_SECRET,
      });

      setSecurityHeaders(res);
      res.writeHead(200, {
        'Content-Type': out.mime,
        'Content-Disposition': `attachment; filename="${out.filename}"`,
        'Content-Length': out.buffer.length,
        'X-Batch-Count': String(finalized.length),
      });
      return res.end(out.buffer);
    }

    // 13. Import Register from Excel
    if (pathname === '/api/import/register-xlsx' && req.method === 'POST') {
      const sess = requireAuth(req, res, { csrf: true, adminOnly: true });
      if (!sess) return;
      const { base64 } = await readBody(req, 10 * 1024 * 1024);
      if (!base64) return sendJson(res, 400, { error: 'Missing Excel file data' });
      const buf = Buffer.from(base64, 'base64');
      const rows = await parseImportedRegisterXlsx(buf);
      const existingRefs = new Set(db.letters.map(l => l.ref).filter(Boolean));
      let added = 0;
      for (const r of rows) {
        if (r.ref && existingRefs.has(r.ref)) continue;
        db.letters.push(r);
        if (r.ref) existingRefs.add(r.ref);
        added++;
      }
      saveDb('import_xlsx');
      authMgr.logAudit(sess.user.username, sess.user.role, 'import_xlsx', `Imported ${added} letters`, ip);
      return sendJson(res, 200, { ok: true, added, totalParsed: rows.length, db });
    }

    // 14. Manual Google Sheets Sync
    if (pathname === '/api/gsheet/sync' && req.method === 'POST') {
      const sess = requireAuth(req, res, { csrf: true });
      if (!sess) return;
      const body = await readBody(req, 64 * 1024);
      if (body && body.webhookUrl && sess.user.role === 'admin') {
        db.settings.gsheet.webhookUrl = String(body.webhookUrl).trim();
        db.settings.gsheet.enabled = true;
      }
      const syncRes = await syncToGoogleSheets(db, `manual:${sess.user.username}`);
      if (!syncRes.ok) return sendJson(res, 400, { error: syncRes.error || 'Google Sheets sync failed' });
      db.settings.gsheet.lastSyncAt = Date.now();
      db.settings.gsheet.lastSyncStatus = `Synced ${syncRes.outwardCount} outward & ${syncRes.inwardCount} inward rows`;
      saveDb('gsheet_sync');
      return sendJson(res, 200, Object.assign({ ok: true, status: db.settings.gsheet.lastSyncStatus }, syncRes));
    }

    // 15. Static Public Files (Login shell, PWA manifest & service worker, fonts, stylesheet, client scripts)
    const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const fp = path.resolve(PUB, rel);
    if (!fp.startsWith(PUB + path.sep) && fp !== PUB) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
      res.writeHead(404);
      return res.end('Not found');
    }
    setSecurityHeaders(res);
    const ext = path.extname(fp).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.ttf' || ext === '.woff2' ? 'public, max-age=86400' : 'no-cache',
    });
    res.end(fs.readFileSync(fp));
  } catch (e) {
    console.error('Server error:', e);
    sendJson(res, e.statusCode || 400, { error: e.message || 'Server error' });
  }
});

function getLanAddresses() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const k of Object.keys(nets)) {
    for (const n of nets[k] || []) {
      if (n.family === 'IPv4' && !n.internal) out.push(n.address);
    }
  }
  return out;
}

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    const lans = getLanAddresses();
    console.log(`\n============================================================`);
    console.log(`  Letter Draft Assistant v3.0 (7-Module School OS)`);
    console.log(`  Local PC URL : http://localhost:${PORT}`);
    lans.forEach(ip => console.log(`  Office LAN   : http://${ip}:${PORT}`));
    console.log(`  QR Verify URL: http://localhost:${PORT}/verify`);
    console.log(`  Master Excel : ${MASTER_XLSX_FILE}`);
    console.log(`============================================================\n`);
  });

  process.on('SIGINT', async () => {
    await shutdownOcrWorker();
    process.exit(0);
  });
}

function handler(req, res) {
  return server.emit('request', req, res);
}

module.exports = { server, handler, db, saveDb, DATA };
