'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };
const KEY_LEN = 64;
const MAX_FAILS = 5;
const LOCK_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_RATE_ENTRIES = 2000;
const MAX_AUDIT_ENTRIES = 1000;

function sha256Hex(str) {
  return crypto.createHash('sha256').update(String(str)).digest('hex');
}

function hashPassword(password, saltHex) {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
  const derived = crypto.scryptSync(String(password), salt, KEY_LEN, SCRYPT_PARAMS);
  return { salt: salt.toString('hex'), hash: derived.toString('hex') };
}

function verifyPassword(password, saltHex, expectedHashHex) {
  if (!password || !saltHex || !expectedHashHex) return false;
  try {
    const derived = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), KEY_LEN, SCRYPT_PARAMS);
    const expected = Buffer.from(expectedHashHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch (_) {
    return false;
  }
}

function safeEqualStr(a, b) {
  const x = crypto.createHash('sha256').update(String(a || '')).digest();
  const y = crypto.createHash('sha256').update(String(b || '')).digest();
  return crypto.timingSafeEqual(x, y);
}

function normalizeUsername(u) {
  return String(u || '').trim().toLowerCase();
}

function validateUsername(u) {
  const clean = normalizeUsername(u);
  if (!/^[a-z0-9._-]{3,32}$/.test(clean)) {
    throw new Error('Username must be 3–32 characters (letters, numbers, dot, underscore, or hyphen).');
  }
  return clean;
}

function validatePassword(pw, username) {
  const s = String(pw || '');
  if (s.length < 8) throw new Error('Password must be at least 8 characters long (पासवर्ड कम से कम 8 अक्षरों का होना चाहिए).');
  if (s.length > 128) throw new Error('Password must not exceed 128 characters.');
  const weak = ['12345678', '123456789', 'password', 'password123', 'admin123', 'qwerty123', '00000000'];
  if (weak.includes(s.toLowerCase()) || (username && s.toLowerCase() === normalizeUsername(username))) {
    throw new Error('Please choose a stronger password (कृपया अधिक सुरक्षित पासवर्ड चुनें).');
  }
}

function createAuthManager(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const authFile = path.join(dataDir, 'auth.json');
  const sessionsFile = path.join(dataDir, 'sessions.json');
  const auditFile = path.join(dataDir, 'audit.json');

  const rateMap = new Map(); // key -> { count, firstAt, lockedUntil }

  function atomicWrite(file, obj) {
    const tmp = file + '.tmp.' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }

  function readJson(file, fallback) {
    try {
      if (!fs.existsSync(file)) return fallback;
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (_) {
      return fallback;
    }
  }

  let authData = readJson(authFile, { v: 1, users: [] });
  if (!Array.isArray(authData.users)) authData = { v: 1, users: [] };

  let sessionStore = readJson(sessionsFile, { sessions: {} });
  if (!sessionStore || typeof sessionStore.sessions !== 'object') sessionStore = { sessions: {} };

  let auditLog = readJson(auditFile, []);
  if (!Array.isArray(auditLog)) auditLog = [];

  function saveAuth() { atomicWrite(authFile, authData); }
  function saveSessions() { atomicWrite(sessionsFile, sessionStore); }
  function saveAudit() { atomicWrite(auditFile, auditLog); }

  function logAudit(actor, role, action, detail, ip) {
    auditLog.unshift({
      id: crypto.randomBytes(6).toString('hex'),
      ts: new Date().toISOString(),
      actor: actor || 'anonymous',
      role: role || '-',
      action,
      detail: String(detail || '').slice(0, 300),
      ip: String(ip || '').slice(0, 64),
    });
    if (auditLog.length > MAX_AUDIT_ENTRIES) auditLog.length = MAX_AUDIT_ENTRIES;
    try { saveAudit(); } catch (_) {}
  }

  // Optional auto-seed from environment variables for automated cloud deployments
  if (authData.users.length === 0 && process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
    try {
      const username = validateUsername(process.env.ADMIN_USERNAME);
      validatePassword(process.env.ADMIN_PASSWORD, username);
      const { salt, hash } = hashPassword(process.env.ADMIN_PASSWORD);
      authData.users.push({
        id: 'usr_' + crypto.randomBytes(6).toString('hex'),
        username,
        displayName: process.env.ADMIN_DISPLAY_NAME || 'Administrator',
        role: 'admin',
        salt,
        hash,
        active: true,
        createdAt: Date.now(),
        lastLoginAt: null,
      });
      saveAuth();
      logAudit(username, 'admin', 'ENV_ADMIN_SEEDED', 'Initial admin created from environment configuration', 'local');
    } catch (e) {
      console.error('Warning: Could not seed ADMIN_USERNAME/ADMIN_PASSWORD:', e.message);
    }
  }

  function pruneSessions() {
    const now = Date.now();
    let changed = false;
    for (const [k, s] of Object.entries(sessionStore.sessions)) {
      if (!s || s.expiresAt <= now) {
        delete sessionStore.sessions[k];
        changed = true;
      }
    }
    if (changed) saveSessions();
  }
  pruneSessions();

  function checkRateLimit(key) {
    const now = Date.now();
    const rec = rateMap.get(key);
    if (!rec) return { blocked: false };
    if (rec.lockedUntil && rec.lockedUntil > now) {
      return { blocked: true, retryAfterSec: Math.ceil((rec.lockedUntil - now) / 1000) };
    }
    if (now - rec.firstAt > LOCK_WINDOW_MS) {
      rateMap.delete(key);
      return { blocked: false };
    }
    return { blocked: false };
  }

  function recordFailure(key) {
    const now = Date.now();
    if (rateMap.size >= MAX_RATE_ENTRIES) {
      const oldestKey = rateMap.keys().next().value;
      if (oldestKey) rateMap.delete(oldestKey);
    }
    const rec = rateMap.get(key);
    if (!rec || now - rec.firstAt > LOCK_WINDOW_MS) {
      rateMap.set(key, { count: 1, firstAt: now, lockedUntil: 0 });
      return;
    }
    rec.count += 1;
    if (rec.count >= MAX_FAILS) {
      rec.lockedUntil = now + LOCK_WINDOW_MS;
    }
    rateMap.set(key, rec);
  }

  function clearFailures(key) {
    rateMap.delete(key);
  }

  function needsSetup() {
    return authData.users.length === 0;
  }

  function publicUser(u) {
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      active: u.active !== false,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
    };
  }

  function setupInitialAdmin({ username, displayName, password }, ip) {
    if (!needsSetup()) {
      const err = new Error('Setup already completed.');
      err.status = 403;
      throw err;
    }
    const cleanUser = validateUsername(username);
    validatePassword(password, cleanUser);
    const { salt, hash } = hashPassword(password);
    const user = {
      id: 'usr_' + crypto.randomBytes(6).toString('hex'),
      username: cleanUser,
      displayName: String(displayName || cleanUser).trim().slice(0, 80) || cleanUser,
      role: 'admin',
      salt,
      hash,
      active: true,
      createdAt: Date.now(),
      lastLoginAt: Date.now(),
    };
    authData.users.push(user);
    saveAuth();
    logAudit(user.username, user.role, 'INITIAL_ADMIN_CREATED', `Admin account "${user.displayName}" initialized`, ip);
    return createSession(user, false, ip);
  }

  function createSession(user, remember, ip) {
    pruneSessions();
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = sha256Hex(rawToken);
    const csrfToken = crypto.randomBytes(24).toString('hex');
    const ttlHours = remember ? 24 * 7 : (Number(process.env.SESSION_TTL_HOURS) || 12);
    const ttlMs = ttlHours * 3600 * 1000;
    sessionStore.sessions[tokenHash] = {
      userId: user.id,
      csrfToken,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
      ttlMs,
      ip: String(ip || '').slice(0, 64),
    };
    saveSessions();
    return {
      sessionToken: rawToken,
      csrfToken,
      maxAgeSec: Math.floor(ttlMs / 1000),
      user: publicUser(user),
    };
  }

  function login({ username, password, remember }, ip) {
    const cleanUser = normalizeUsername(username);
    const ipKey = 'ip:' + (ip || 'unknown');
    const usrKey = 'usr:' + cleanUser;

    const ipLim = checkRateLimit(ipKey);
    if (ipLim.blocked) {
      const err = new Error(`Too many failed login attempts. Try again in ${ipLim.retryAfterSec}s.`);
      err.status = 429;
      throw err;
    }
    const usrLim = checkRateLimit(usrKey);
    if (usrLim.blocked) {
      const err = new Error(`Account temporarily locked. Try again in ${usrLim.retryAfterSec}s.`);
      err.status = 429;
      throw err;
    }

    const user = authData.users.find(u => u.username === cleanUser);
    if (!user || user.active === false || !verifyPassword(password, user.salt, user.hash)) {
      recordFailure(ipKey);
      if (cleanUser) recordFailure(usrKey);
      logAudit(cleanUser || 'unknown', '-', 'LOGIN_FAILED', 'Invalid credentials or inactive account', ip);
      const err = new Error('Invalid username or password (गलत यूज़रनेम या पासवर्ड).');
      err.status = 401;
      throw err;
    }

    clearFailures(ipKey);
    clearFailures(usrKey);
    user.lastLoginAt = Date.now();
    saveAuth();
    logAudit(user.username, user.role, 'LOGIN_SUCCESS', 'Signed in successfully', ip);
    return createSession(user, !!remember, ip);
  }

  function parseCookies(req) {
    const hdr = req.headers.cookie || '';
    const out = {};
    hdr.split(';').forEach(part => {
      const idx = part.indexOf('=');
      if (idx > 0) {
        const k = part.slice(0, idx).trim();
        const v = part.slice(idx + 1).trim();
        if (k) out[k] = v;
      }
    });
    return out;
  }

  function extractRawToken(req) {
    const cookies = parseCookies(req);
    if (cookies.lda_sid) return cookies.lda_sid;
    const hdr = req.headers['x-session-token'];
    if (typeof hdr === 'string' && hdr.length >= 32) return hdr.trim();
    return null;
  }

  function authenticate(req, { requireCsrf = false } = {}) {
    const rawToken = extractRawToken(req);
    if (!rawToken) return null;
    const tokenHash = sha256Hex(rawToken);
    const sess = sessionStore.sessions[tokenHash];
    if (!sess) return null;
    if (sess.expiresAt <= Date.now()) {
      delete sessionStore.sessions[tokenHash];
      saveSessions();
      return null;
    }
    const user = authData.users.find(u => u.id === sess.userId && u.active !== false);
    if (!user) {
      delete sessionStore.sessions[tokenHash];
      saveSessions();
      return null;
    }
    if (requireCsrf) {
      const csrfHdr = req.headers['x-csrf-token'];
      if (!csrfHdr || !safeEqualStr(csrfHdr, sess.csrfToken)) {
        const err = new Error('Invalid or missing CSRF security token. Please reload the page.');
        err.status = 403;
        throw err;
      }
    }
    // Sliding session renewal if past 25% of TTL
    if (sess.ttlMs && sess.expiresAt - Date.now() < sess.ttlMs * 0.75) {
      sess.expiresAt = Date.now() + sess.ttlMs;
      saveSessions();
    }
    return {
      user: publicUser(user),
      csrfToken: sess.csrfToken,
      tokenHash,
    };
  }

  function logout(req, allDevices, ip) {
    const auth = authenticate(req, { requireCsrf: false });
    if (!auth) return;
    if (allDevices) {
      for (const [k, s] of Object.entries(sessionStore.sessions)) {
        if (s.userId === auth.user.id) delete sessionStore.sessions[k];
      }
      logAudit(auth.user.username, auth.user.role, 'LOGOUT_ALL', 'Signed out from all devices', ip);
    } else {
      delete sessionStore.sessions[auth.tokenHash];
      logAudit(auth.user.username, auth.user.role, 'LOGOUT', 'Signed out', ip);
    }
    saveSessions();
  }

  function can(user, perm) {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (user.role === 'staff') return perm === 'read' || perm === 'write';
    if (user.role === 'viewer') return perm === 'read';
    return false;
  }

  function listUsers() {
    return authData.users.map(publicUser);
  }

  function createUser(actor, { username, displayName, password, role }, ip) {
    const cleanUser = validateUsername(username);
    if (authData.users.some(u => u.username === cleanUser)) {
      throw new Error('Username already exists (यह यूज़रनेम पहले से मौजूद है).');
    }
    const validRoles = ['admin', 'staff', 'viewer'];
    const r = validRoles.includes(role) ? role : 'staff';
    validatePassword(password, cleanUser);
    const { salt, hash } = hashPassword(password);
    const u = {
      id: 'usr_' + crypto.randomBytes(6).toString('hex'),
      username: cleanUser,
      displayName: String(displayName || cleanUser).trim().slice(0, 80) || cleanUser,
      role: r,
      salt,
      hash,
      active: true,
      createdAt: Date.now(),
      lastLoginAt: null,
    };
    authData.users.push(u);
    saveAuth();
    logAudit(actor.username, actor.role, 'USER_CREATED', `Created user "${u.username}" (${u.role})`, ip);
    return publicUser(u);
  }

  function updateUser(actor, { id, displayName, role, active, newPassword }, ip) {
    const u = authData.users.find(x => x.id === id);
    if (!u) throw new Error('User not found.');
    const activeAdmins = authData.users.filter(x => x.role === 'admin' && x.active !== false);
    if (u.role === 'admin' && activeAdmins.length <= 1) {
      if (active === false || (role && role !== 'admin')) {
        throw new Error('Cannot remove or deactivate the last active Administrator account.');
      }
    }
    if (displayName !== undefined) u.displayName = String(displayName).trim().slice(0, 80) || u.username;
    if (role && ['admin', 'staff', 'viewer'].includes(role)) u.role = role;
    if (typeof active === 'boolean') {
      u.active = active;
      if (!active) {
        for (const [k, s] of Object.entries(sessionStore.sessions)) {
          if (s.userId === u.id) delete sessionStore.sessions[k];
        }
        saveSessions();
      }
    }
    if (newPassword) {
      validatePassword(newPassword, u.username);
      const { salt, hash } = hashPassword(newPassword);
      u.salt = salt;
      u.hash = hash;
    }
    saveAuth();
    logAudit(actor.username, actor.role, 'USER_UPDATED', `Updated user "${u.username}" (role=${u.role}, active=${u.active})`, ip);
    return publicUser(u);
  }

  function changeOwnPassword(actor, { currentPassword, newPassword }, ip) {
    const u = authData.users.find(x => x.id === actor.id);
    if (!u) throw new Error('User not found.');
    if (!verifyPassword(currentPassword, u.salt, u.hash)) {
      throw new Error('Current password is incorrect (वर्तमान पासवर्ड गलत है).');
    }
    validatePassword(newPassword, u.username);
    const { salt, hash } = hashPassword(newPassword);
    u.salt = salt;
    u.hash = hash;
    saveAuth();
    logAudit(u.username, u.role, 'PASSWORD_CHANGED', 'Changed own account password', ip);
    return { ok: true };
  }

  function deleteUser(actor, { id }, ip) {
    const u = authData.users.find(x => x.id === id);
    if (!u) throw new Error('User not found.');
    if (u.id === actor.id) throw new Error('You cannot delete your own active account.');
    const activeAdmins = authData.users.filter(x => x.role === 'admin' && x.active !== false);
    if (u.role === 'admin' && activeAdmins.length <= 1) {
      throw new Error('Cannot delete the last Administrator.');
    }
    authData.users = authData.users.filter(x => x.id !== id);
    for (const [k, s] of Object.entries(sessionStore.sessions)) {
      if (s.userId === id) delete sessionStore.sessions[k];
    }
    saveAuth();
    saveSessions();
    logAudit(actor.username, actor.role, 'USER_DELETED', `Deleted user "${u.username}"`, ip);
    return { id };
  }

  function getAuditLogs(limit = 200) {
    return auditLog.slice(0, Math.min(limit, MAX_AUDIT_ENTRIES));
  }

  function buildSessionCookies(req, sessionToken, maxAgeSec) {
    const isHttps = req.headers['x-forwarded-proto'] === 'https' || !!(req.socket && req.socket.encrypted);
    if (!sessionToken) {
      return `lda_sid=; HttpOnly; Path=/; Max-Age=0; SameSite=${isHttps ? 'None; Secure; Partitioned' : 'Lax'}`;
    }
    if (isHttps) {
      return `lda_sid=${sessionToken}; HttpOnly; Path=/; Max-Age=${maxAgeSec}; SameSite=None; Secure; Partitioned`;
    }
    return `lda_sid=${sessionToken}; HttpOnly; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax`;
  }

  return {
    needsSetup,
    setupInitialAdmin,
    login,
    authenticate,
    logout,
    can,
    listUsers,
    createUser,
    updateUser,
    changeOwnPassword,
    deleteUser,
    logAudit,
    getAuditLogs,
    buildSessionCookies,
  };
}

module.exports = {
  createAuthManager,
  hashPassword,
  verifyPassword,
};
