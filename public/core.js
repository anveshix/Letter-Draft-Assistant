/* Letter Desk core — shared by browser (local mode) and server.js (server mode).
   All ref-number logic lives here so numbering is identical everywhere. */
(function (root, f) { if (typeof module === 'object' && module.exports) module.exports = f(); else root.Core = f(); })(typeof self !== 'undefined' ? self : this, function () {
  const pad = (n, w) => String(n).padStart(w || 0, '0');
  const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2); };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const yearKey = (iso, mode) => { const y = +iso.slice(0, 4), m = +iso.slice(5, 7); return mode === 'session' ? (m >= 4 ? y : y - 1) : y; };
  const fmtRef = (fmt, n, yk, w) => fmt.replace(/\{n\}/g, pad(n, w)).replace(/\{yyyy\}/g, yk).replace(/\{yy\}/g, pad(yk % 100, 2)).replace(/\{sess\}/g, pad(yk % 100, 2) + '-' + pad((yk + 1) % 100, 2));

  const defaultSettings = () => ({
    school: { name: "CM SCHOOL OF EXCELLENCE GIRLS' DUMKA", en: 'CM School of Excellence Girls, Dumka', hi: 'सी.एम. स्कूल ऑफ एक्सीलेंस गर्ल्स, दुमका' },
    letterhead: 'assets/letterhead.png',
    yearMode: 'calendar',            // 'calendar' (Jan–Dec) or 'session' (Apr–Mar)
    refFormat: '{n}/{yy}',           // tokens: {n} {yy} {yyyy} {sess}
    inFormat: 'IN-{n}/{yy}',
    padWidth: 0,
    preprinted: false,               // true = leave blank space for pre-printed letterhead paper
    topMm: 48,
    fontPt: 12,
    sigAlign: 'left',
    defaultShowSign: false,
    signatories: [{ id: 'sg1', name: 'Mrs. Sumita Tudu', designation: 'Principal-in-Charge', org: 'CM School of Excellence Girls, Dumka', stamp: 'private/sign.png' }],
    defaultSignatory: 'sg1',
    recipients: [
      { alias: 'cm', en: "The Hon'ble Chief Minister,\nGovernment of Jharkhand,\nRanchi.", hi: 'माननीय मुख्यमंत्री,\nझारखंड सरकार,\nराँची।' },
      { alias: 'sec', en: 'The Secretary,\nSchool Education and Literacy Department,\nGovernment of Jharkhand,\nRanchi.', hi: 'सचिव,\nविद्यालय शिक्षा एवं साक्षरता विभाग,\nझारखंड सरकार,\nराँची।' },
      { alias: 'dc', en: 'The Deputy Commissioner,\nDumka.', hi: 'उपायुक्त,\nदुमका।' },
      { alias: 'dse', en: 'The District Superintendent of Education,\nDumka.', hi: 'जिला शिक्षा अधीक्षक,\nदुमका।' },
      { alias: 'beo', en: 'The Block Education Officer,\nDumka.', hi: 'प्रखंड शिक्षा पदाधिकारी,\nदुमका।' },
    ],
    lastBackup: null,
  });
  const defaultDb = () => ({ v: 1, settings: defaultSettings(), counters: { 'out|2026': 320 }, letters: [], inward: [] });
  const migrate = (db) => {
    db.settings = Object.assign(defaultSettings(), db.settings || {});
    db.counters = db.counters || {}; db.letters = db.letters || []; db.inward = db.inward || []; return db;
  };

  const seriesFmt = (s, series) => series === 'in' ? s.inFormat : s.refFormat;
  const peekRef = (db, series, iso) => {
    const s = db.settings, yk = yearKey(iso, s.yearMode), n = (db.counters[series + '|' + yk] || 0) + 1;
    return { n, yk, ref: fmtRef(seriesFmt(s, series), n, yk, s.padWidth) };
  };
  const alloc = (db, series, iso) => { const p = peekRef(db, series, iso); db.counters[series + '|' + p.yk] = p.n; return p; };
  const need = (x, msg) => { if (!x) throw new Error(msg); return x; };
  const findL = (db, id) => need(db.letters.find(x => x.id === id), 'Letter not found');

  const ops = {
    saveLetter(db, l) {
      need(l && l.id, 'Bad letter'); l.updatedAt = Date.now();
      const i = db.letters.findIndex(x => x.id === l.id);
      if (i < 0) { l.createdAt = l.createdAt || Date.now(); l.status = 'draft'; delete l.ref; delete l.refNo; delete l.refYear; db.letters.push(l); return l; }
      const o = db.letters[i];
      Object.assign(l, { ref: o.ref, refNo: o.refNo, refYear: o.refYear, status: o.status, createdAt: o.createdAt, issuedAt: o.issuedAt, dispatch: o.dispatch, reply: o.reply, cancelReason: o.cancelReason });
      if (o.status !== 'draft') l.editedAfterIssue = o.editedAfterIssue || o.body !== l.body || o.subject !== l.subject || o.to !== l.to;
      Object.keys(l).forEach(k => { if (l[k] === undefined) delete l[k]; });
      db.letters[i] = l; return l;
    },
    issueLetter(db, { id, date }) {
      const l = findL(db, id); need(l.status !== 'cancelled', 'Letter is cancelled');
      if (!l.ref) {
        const d = date || l.date || todayISO(), p = alloc(db, 'out', d);
        Object.assign(l, { ref: p.ref, refNo: p.n, refYear: p.yk, date: d, issuedAt: Date.now(), status: 'issued' });
        if (l.replyTo) { const r = db.inward.find(x => x.id === l.replyTo); if (r) { r.status = 'replied'; r.reply = { ref: l.ref, date: d, letterId: l.id }; } }
      }
      l.updatedAt = Date.now(); return l;
    },
    cancelLetter(db, { id, reason }) { const l = findL(db, id); need(l.ref, 'Only issued letters can be cancelled'); l.status = 'cancelled'; l.cancelReason = reason || ''; l.updatedAt = Date.now(); return l; },
    deleteLetter(db, { id }) { const l = findL(db, id); need(l.status === 'draft', 'Only drafts can be deleted'); db.letters = db.letters.filter(x => x.id !== id); return { id }; },
    patchLetter(db, { id, patch }) {
      const l = findL(db, id); ['dispatch', 'reply', 'remarks', 'awaitingReply'].forEach(k => { if (k in patch) l[k] = patch[k]; });
      if (patch.dispatch && l.status === 'issued') l.status = 'dispatched'; if (patch.dispatch === null && l.status === 'dispatched') l.status = 'issued';
      l.updatedAt = Date.now(); return l;
    },
    saveInward(db, r) {
      need(r && r.id, 'Bad record'); const i = db.inward.findIndex(x => x.id === r.id);
      if (i < 0) { const p = alloc(db, 'in', r.date || todayISO()); r.no = p.ref; r.createdAt = Date.now(); r.status = r.needsReply ? 'pending' : 'noaction'; db.inward.push(r); return r; }
      const o = db.inward[i]; r.no = o.no; r.createdAt = o.createdAt; r.reply = o.reply;
      r.status = o.status === 'replied' ? 'replied' : (r.needsReply ? 'pending' : 'noaction'); db.inward[i] = r; return r;
    },
    deleteInward(db, { id }) { db.inward = db.inward.filter(x => x.id !== id); return { id }; },
    saveSettings(db, s) { db.settings = Object.assign(defaultSettings(), s); return db.settings; },
    setCounter(db, { series, year, last }) { need(Number.isInteger(last) && last >= 0, 'Bad number'); db.counters[series + '|' + year] = last; return db.counters; },
    restore(db, d) { need(d && d.letters && d.settings, 'Not a Letter Desk backup'); db.settings = d.settings; db.counters = d.counters || {}; db.letters = d.letters; db.inward = d.inward || []; migrate(db); return { ok: true }; },
    markBackup(db) { db.settings.lastBackup = Date.now(); return db.settings; },
  };
  const apply = (db, name, payload) => { const f = ops[name]; if (!f) throw new Error('Unknown op ' + name); return f(db, payload || {}); };
  return { defaultDb, migrate, apply, peekRef, alloc, todayISO, uid, yearKey, fmtRef, ops: Object.keys(ops) };
});
