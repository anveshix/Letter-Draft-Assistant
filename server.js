/* Letter Desk server — zero dependencies, Node 18+. Run: node server.js
   Data: data/db.json (+ daily copies in data/backups). Set a PIN in data/config.json to allow other devices. */
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const Core = require('./public/core.js');
const PUB = path.join(__dirname, 'public'), DATA = path.join(__dirname, 'data'), BK = path.join(DATA, 'backups');
fs.mkdirSync(BK, { recursive: true });
const cfgFile = path.join(DATA, 'config.json');
if (!fs.existsSync(cfgFile)) fs.writeFileSync(cfgFile, JSON.stringify({ pin: '', port: 3000 }, null, 2));
const cfg = Object.assign({ pin: '', port: 3000 }, JSON.parse(fs.readFileSync(cfgFile, 'utf8')));
if (process.env.PIN) cfg.pin = process.env.PIN; if (process.env.PORT) cfg.port = +process.env.PORT;
const HOST = process.env.HOST || (cfg.pin ? '0.0.0.0' : '127.0.0.1');
const dbFile = path.join(DATA, 'db.json');
let db; try { db = Core.migrate(JSON.parse(fs.readFileSync(dbFile, 'utf8'))); } catch (e) { if (fs.existsSync(dbFile)) { console.error('db.json unreadable — refusing to overwrite:', e.message); process.exit(1); } db = Core.defaultDb(); }
function save() {
  const tmp = dbFile + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, dbFile);
  const day = path.join(BK, 'db-' + Core.todayISO() + '.json'); if (!fs.existsSync(day)) { fs.copyFileSync(dbFile, day); fs.readdirSync(BK).sort().slice(0, -30).forEach(f => fs.unlinkSync(path.join(BK, f))); }
}
save();
const sessions = new Map(), fails = new Map();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const cookie = req => Object.fromEntries((req.headers.cookie || '').split(';').map(s => s.trim().split('=')).filter(x => x[0]));
const authed = req => !cfg.pin || sessions.has(cookie(req).sid);
const json = (res, code, o, h) => { res.writeHead(code, Object.assign({ 'content-type': 'application/json', 'cache-control': 'no-store' }, h)); res.end(JSON.stringify(o)); };
const body = req => new Promise((ok, no) => { let b = '', n = 0; req.on('data', c => { n += c.length; if (n > 15e6) { no(new Error('Too large')); req.destroy(); } else b += c; }); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { no(e); } }); });
const eq = (a, b) => { const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest(); return crypto.timingSafeEqual(x, y); };

http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname), ip = req.socket.remoteAddress;
    if (p === '/api/ping') return json(res, 200, { ok: true, auth: !!cfg.pin, logged: authed(req) });
    if (p === '/api/login' && req.method === 'POST') {
      const f = fails.get(ip) || { n: 0, t: Date.now() }; if (Date.now() - f.t > 60000) { f.n = 0; f.t = Date.now(); } if (f.n >= 5) return json(res, 429, { ok: false });
      const { pin } = await body(req);
      if (cfg.pin && !eq(pin, cfg.pin)) { f.n++; fails.set(ip, f); return json(res, 401, { ok: false }); }
      const sid = crypto.randomBytes(24).toString('hex'); sessions.set(sid, Date.now());
      return json(res, 200, { ok: true }, { 'set-cookie': `sid=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}` });
    }
    if (p.startsWith('/api/') || p.startsWith('/private/')) if (!authed(req)) return json(res, 401, { ok: false });
    if (p === '/api/db') return json(res, 200, db);
    if (p === '/api/op' && req.method === 'POST') {
      const { name, payload } = await body(req);
      try { const result = Core.apply(db, name, payload); save(); return json(res, 200, { ok: true, result, counters: db.counters }); }
      catch (e) { return json(res, 400, { ok: false, error: e.message }); }
    }
    let f = path.normalize(path.join(PUB, p === '/' ? 'index.html' : p));
    if (!f.startsWith(PUB + path.sep) && f !== PUB) { res.writeHead(403); return res.end(); }
    fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end('Not found'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' }); res.end(d); });
  } catch (e) { json(res, 500, { ok: false, error: e.message }); }
}).listen(cfg.port, HOST, () => {
  console.log(`\n  Letter Desk running →  http://localhost:${cfg.port}`);
  console.log(cfg.pin ? `  PIN protection ON (other devices: http://<this-PC-IP>:${cfg.port})` : '  PIN not set → reachable only from this computer. Put a PIN in data/config.json to allow other devices.');
  console.log('  Data file: data/db.json   (daily backups: data/backups)\n');
});
