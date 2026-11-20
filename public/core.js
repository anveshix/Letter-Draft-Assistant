/* Letter Draft Assistant v3.0 — Shared Core Domain Logic (Browser + Node.js Server)
   Includes: Ref. No. engine, Major Heads, Placeholders, Student/Staff Master Directory,
   Clerk->Principal Approval Queue, QR Settings, and Inward SLA Deadlines. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const pad = (n, w) => String(n).padStart(w || 0, '0');
  const todayISO = () => {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2);
  };
  const addDaysISO = (iso, days) => {
    const base = /^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) ? new Date(iso + 'T00:00:00Z') : new Date();
    base.setUTCDate(base.getUTCDate() + (Number(days) || 0));
    return base.toISOString().slice(0, 10);
  };
  const diffDaysISO = (targetIso, refIso) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(targetIso || ''))) return null;
    const t = new Date(targetIso + 'T00:00:00Z').getTime();
    const r = new Date((refIso || todayISO()) + 'T00:00:00Z').getTime();
    return Math.round((t - r) / 86400000);
  };
  const fmtDateDMY = (iso) => {
    if (!iso || typeof iso !== 'string') return '';
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso;
  };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const yearKey = (iso, mode) => {
    const safe = /^\d{4}-\d{2}/.test(String(iso || '')) ? iso : todayISO();
    const y = +safe.slice(0, 4);
    const m = +safe.slice(5, 7);
    return mode === 'session' ? (m >= 4 ? y : y - 1) : y;
  };

  const sessionFromISO = (iso) => {
    const safe = /^\d{4}-\d{2}/.test(String(iso || '')) ? iso : todayISO();
    const y = +safe.slice(0, 4);
    const m = +safe.slice(5, 7);
    const start = m >= 4 ? y : y - 1;
    return start + '-' + pad((start + 1) % 100, 2);
  };

  const fmtRef = (fmt, n, yk, w, headCode) =>
    String(fmt || '{n}/{yy}')
      .replace(/\{head\}/g, String(headCode || 'GEN').toUpperCase())
      .replace(/\{n\}/g, pad(n, w))
      .replace(/\{yyyy\}/g, yk)
      .replace(/\{yy\}/g, pad(yk % 100, 2))
      .replace(/\{sess\}/g, pad(yk % 100, 2) + '-' + pad((yk + 1) % 100, 2));

  const DEFAULT_MAJOR_HEADS = [
    { code: 'ADM', en: 'Administration & General', hi: 'प्रशासन एवं सामान्य पत्राचार' },
    { code: 'EST', en: 'Establishment, Staff & HR', hi: 'स्थापना, शिक्षक एवं कर्मी मद' },
    { code: 'ACD', en: 'Academic & Examination', hi: 'शैक्षणिक एवं परीक्षा मद' },
    { code: 'STD', en: 'Student Certificates & Welfare', hi: 'छात्रा प्रमाण-पत्र, कल्याण एवं छात्रवृत्ति' },
    { code: 'FIN', en: 'Finance, Accounts & Audit', hi: 'वित्त, लेखा, विपत्र एवं अंकेक्षण' },
    { code: 'SCH', en: 'Grants, Schemes & Samagra Shiksha', hi: 'अनुदान, सरकारी योजनाएँ एवं समग्र शिक्षा' },
    { code: 'INF', en: 'Infrastructure, Civil & Maintenance', hi: 'भवन, मरम्मत एवं अधोसंरचना मद' },
    { code: 'PUR', en: 'Purchase, Store & Tender', hi: 'क्रय, भंडार एवं निविदा मद' },
    { code: 'BRD', en: 'CBSE / JAC / Board Affiliation', hi: 'सीबीएसई / जैक / बोर्ड संबद्धता' },
    { code: 'EVT', en: 'Events, Sports & Co-Curricular', hi: 'कार्यक्रम, खेलकूद एवं सह-शैक्षणिक' },
    { code: 'LGL', en: 'RTI, Legal & Compliance', hi: 'आरटीआई, विधिक एवं अनुपालन' },
    { code: 'NOT', en: 'Notices, Circulars & Office Orders', hi: 'सूचना, परिपत्र एवं कार्यालय आदेश' },
  ];

  const INWARD_PRIORITIES = [
    { id: 'normal', label: 'Normal (7 Days / सामान्य)', days: 7 },
    { id: 'urgent', label: 'Urgent 48h (अति आवश्यक / तत्काल)', days: 2 },
    { id: 'rti', label: 'RTI Statutory (30 Days / सूचना का अधिकार)', days: 30 },
    { id: 'board_court', label: 'Board / Court / Audit (5 Days)', days: 5 },
  ];

  const SYSTEM_PLACEHOLDERS = [
    { key: 'ref_no', label: 'Ref. No. / पत्रांक' },
    { key: 'date', label: 'Letter Date / दिनांक' },
    { key: 'academic_session', label: 'Academic Session / शैक्षणिक सत्र' },
    { key: 'financial_year', label: 'Financial Year / वित्तीय वर्ष' },
    { key: 'major_head', label: 'Major Head / मुख्य शीर्ष' },
    { key: 'sub_head', label: 'Sub-Head / File No. / संचिका सं.' },
    { key: 'school_name', label: 'Institution Name / विद्यालय का नाम' },
    { key: 'school_address', label: 'Address / विद्यालय का पता' },
    { key: 'udise_code', label: 'U-DISE Code' },
    { key: 'cbse_aff_no', label: 'CBSE Affiliation No.' },
    { key: 'estd_year', label: 'Est. Year / स्थापना वर्ष' },
    { key: 'district', label: 'District / जिला' },
    { key: 'state', label: 'State / राज्य' },
    { key: 'signatory_name', label: 'Signatory Name / हस्ताक्षरकर्ता' },
    { key: 'signatory_designation', label: 'Designation / पदनाम' },
  ];

  function sanitizeImageSrc(src, fallback) {
    const s = String(src || '').trim();
    if (!s) return fallback || '';
    if (s === 'private/sign.png' || s === '/private/sign.png') return 'api/files/sign.png';
    if (/^(assets\/|api\/files\/)[a-zA-Z0-9._/-]+$/.test(s) && !s.includes('..')) return s;
    if (/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=\s]+$/.test(s) && s.length < 7 * 1024 * 1024) {
      return s.replace(/\s+/g, '');
    }
    return fallback || '';
  }

  function sanitizeAttachmentSrc(src) {
    const s = String(src || '').trim();
    if (!s) return '';
    if (/^api\/files\/[a-zA-Z0-9._-]+$/.test(s)) return s;
    return '';
  }

  const defaultSettings = () => ({
    school: {
      name: "CM SCHOOL OF EXCELLENCE GIRLS' DUMKA",
      subName: "(+2 GOVT. GIRLS' HIGH SCHOOL, DUMKA)",
      en: 'CM School of Excellence Girls, Dumka',
      hi: 'सी.एम. स्कूल ऑफ एक्सीलेंस गर्ल्स, दुमका',
      addressEn: 'Ambedkar Chowk, Dumka - 814101 (Jharkhand)',
      addressHi: 'अंबेडकर चौक, दुमका - 814101 (झारखंड)',
      udise: '20110129403',
      cbseAff: '3420138',
      estd: '1951',
      districtEn: 'Dumka',
      districtHi: 'दुमका',
      stateEn: 'Jharkhand',
      stateHi: 'झारखंड',
      email: '',
      phone: '',
    },
    letterhead: 'assets/letterhead.png',
    yearMode: 'calendar',
    refFormat: '{n}/{yy}',
    inFormat: 'IN-{n}/{yy}',
    padWidth: 0,
    preprinted: false,
    topMm: 48,
    fontPt: 12,
    fontFamily: 'karma',
    sigAlign: 'right',
    defaultShowSign: false,
    defaultShowQr: true,
    publicBaseUrl: '',
    requireApprovalForStaff: false,
    showMajorHeadOnLetter: false,
    majorHeads: DEFAULT_MAJOR_HEADS.map(h => Object.assign({}, h)),
    signatories: [
      {
        id: 'sg1',
        name: 'Mrs. Sumita Tudu',
        nameHi: 'श्रीमती सुमिता टुडू',
        designation: 'Principal-in-Charge',
        designationHi: 'प्रभारी प्राचार्य',
        org: 'CM School of Excellence Girls, Dumka',
        orgHi: 'सी.एम. स्कूल ऑफ एक्सीलेंस गर्ल्स, दुमका',
        stamp: 'api/files/sign.png',
      },
    ],
    defaultSignatory: 'sg1',
    recipients: [
      { alias: 'cm', en: "The Hon'ble Chief Minister,\nGovernment of Jharkhand,\nRanchi.", hi: 'माननीय मुख्यमंत्री,\nझारखंड सरकार,\nराँची।' },
      { alias: 'sec', en: 'The Secretary,\nSchool Education and Literacy Department,\nGovernment of Jharkhand,\nRanchi.', hi: 'सचिव,\nविद्यालय शिक्षा एवं साक्षरता विभाग,\nझारखंड सरकार,\nराँची।' },
      { alias: 'jcert', en: 'The Director,\nJCERT / JEPC,\nGovernment of Jharkhand,\nRanchi.', hi: 'निदेशक,\nझारखंड शिक्षा परियोजना परिषद (JEPC),\nराँची।' },
      { alias: 'dc', en: 'The Deputy Commissioner,\nDumka (Jharkhand).', hi: 'उपायुक्त,\nदुमका (झारखंड)।' },
      { alias: 'deo', en: 'The District Education Officer (DEO),\nDumka.', hi: 'जिला शिक्षा पदाधिकारी (DEO),\nदुमका।' },
      { alias: 'dse', en: 'The District Superintendent of Education (DSE),\nDumka.', hi: 'जिला शिक्षा अधीक्षक (DSE),\nदुमका।' },
      { alias: 'beo', en: 'The Block Education Officer (BEO),\nDumka.', hi: 'प्रखंड शिक्षा पदाधिकारी (BEO),\nदुमका।' },
      { alias: 'cbse', en: 'The Regional Officer,\nCBSE Regional Office,\nPatna / Ranchi.', hi: 'क्षेत्रीय पदाधिकारी,\nकेंद्रीय माध्यमिक शिक्षा बोर्ड (CBSE),\nपटना / राँची।' },
      { alias: 'treasury', en: 'The Treasury Officer,\nDistrict Treasury, Dumka.', hi: 'कोषागार पदाधिकारी,\nजिला कोषागार, दुमका।' },
    ],
    gsheet: {
      enabled: false,
      autoSync: true,
      mode: 'webhook',
      webhookUrl: '',
      webhookSecret: '',
      spreadsheetId: '',
      lastSyncAt: null,
      lastSyncStatus: '',
    },
    lastBackup: null,
  });

  const defaultDb = () => ({
    v: 3,
    settings: defaultSettings(),
    counters: { 'out|2026': 320 },
    letters: [],
    inward: [],
    students: [],
    staff: [],
    customTemplates: [],
  });

  function sanitizeSettings(raw) {
    const def = defaultSettings();
    const s = Object.assign({}, def, raw || {});
    s.school = Object.assign({}, def.school, (raw && raw.school) || {});
    s.letterhead = sanitizeImageSrc(s.letterhead, 'assets/letterhead.png');
    s.yearMode = s.yearMode === 'session' ? 'session' : 'calendar';
    s.refFormat = /\{n\}/.test(String(s.refFormat || '')) ? String(s.refFormat).slice(0, 40) : '{n}/{yy}';
    s.inFormat = /\{n\}/.test(String(s.inFormat || '')) ? String(s.inFormat).slice(0, 40) : 'IN-{n}/{yy}';
    s.padWidth = Math.max(0, Math.min(6, parseInt(s.padWidth, 10) || 0));
    s.preprinted = !!s.preprinted;
    s.topMm = Math.max(10, Math.min(100, parseInt(s.topMm, 10) || 48));
    s.fontPt = Math.max(10, Math.min(16, parseFloat(s.fontPt) || 12));
    s.fontFamily = ['karma', 'mukta'].includes(s.fontFamily) ? s.fontFamily : 'karma';
    s.sigAlign = s.sigAlign === 'left' ? 'left' : 'right';
    s.defaultShowSign = !!s.defaultShowSign;
    s.defaultShowQr = s.defaultShowQr !== false;
    s.publicBaseUrl = String(s.publicBaseUrl || '').trim().replace(/\/+$/, '').slice(0, 200);
    s.requireApprovalForStaff = !!s.requireApprovalForStaff;
    s.showMajorHeadOnLetter = !!s.showMajorHeadOnLetter;

    if (!Array.isArray(s.majorHeads) || !s.majorHeads.length) {
      s.majorHeads = DEFAULT_MAJOR_HEADS.map(h => Object.assign({}, h));
    } else {
      s.majorHeads = s.majorHeads
        .filter(h => h && String(h.code || '').trim())
        .map(h => ({
          code: String(h.code).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 12) || 'GEN',
          en: String(h.en || h.code).trim().slice(0, 100),
          hi: String(h.hi || h.en || h.code).trim().slice(0, 100),
        }));
      if (!s.majorHeads.length) s.majorHeads = DEFAULT_MAJOR_HEADS.map(h => Object.assign({}, h));
    }

    if (!Array.isArray(s.signatories) || !s.signatories.length) {
      s.signatories = def.signatories;
    } else {
      s.signatories = s.signatories.map(sg => ({
        id: String(sg.id || uid()).slice(0, 32),
        name: String(sg.name || '').trim().slice(0, 100),
        nameHi: String(sg.nameHi || '').trim().slice(0, 100),
        designation: String(sg.designation || '').trim().slice(0, 100),
        designationHi: String(sg.designationHi || '').trim().slice(0, 100),
        org: String(sg.org || '').trim().slice(0, 140),
        orgHi: String(sg.orgHi || '').trim().slice(0, 140),
        stamp: sanitizeImageSrc(sg.stamp, ''),
      }));
    }
    if (!s.signatories.some(x => x.id === s.defaultSignatory)) {
      s.defaultSignatory = s.signatories[0].id;
    }

    if (!Array.isArray(s.recipients)) s.recipients = def.recipients;
    else {
      s.recipients = s.recipients
        .filter(r => r && String(r.alias || '').trim())
        .map(r => ({
          alias: String(r.alias).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24),
          en: String(r.en || '').slice(0, 500),
          hi: String(r.hi || '').slice(0, 500),
        }))
        .filter(r => r.alias);
    }

    s.gsheet = Object.assign({}, def.gsheet, (raw && raw.gsheet) || {});
    s.gsheet.enabled = !!s.gsheet.enabled;
    s.gsheet.autoSync = s.gsheet.autoSync !== false;
    s.gsheet.mode = s.gsheet.mode === 'service_account' ? 'service_account' : 'webhook';
    s.gsheet.webhookUrl = String(s.gsheet.webhookUrl || '').trim().slice(0, 500);
    s.gsheet.webhookSecret = String(s.gsheet.webhookSecret || '').trim().slice(0, 128);
    s.gsheet.spreadsheetId = String(s.gsheet.spreadsheetId || '').trim().slice(0, 120);
    return s;
  }

  function sanitizeStudent(raw) {
    return {
      id: String(raw.id || ('stu_' + uid())).slice(0, 40),
      admNo: String(raw.admNo || '').trim().slice(0, 40),
      rollNo: String(raw.rollNo || '').trim().slice(0, 20),
      name: String(raw.name || '').trim().slice(0, 120),
      nameHi: String(raw.nameHi || '').trim().slice(0, 120),
      father: String(raw.father || '').trim().slice(0, 120),
      fatherHi: String(raw.fatherHi || '').trim().slice(0, 120),
      mother: String(raw.mother || '').trim().slice(0, 120),
      motherHi: String(raw.motherHi || '').trim().slice(0, 120),
      cls: String(raw.cls || '').trim().slice(0, 40),
      dob: String(raw.dob || '').trim().slice(0, 20),
      session: String(raw.session || '').trim().slice(0, 20),
      category: String(raw.category || '').trim().slice(0, 30),
      phone: String(raw.phone || '').trim().slice(0, 25),
      updatedAt: Date.now(),
    };
  }

  function sanitizeStaff(raw) {
    return {
      id: String(raw.id || ('stf_' + uid())).slice(0, 40),
      empId: String(raw.empId || '').trim().slice(0, 40),
      name: String(raw.name || '').trim().slice(0, 120),
      nameHi: String(raw.nameHi || '').trim().slice(0, 120),
      fatherOrSpouse: String(raw.fatherOrSpouse || '').trim().slice(0, 120),
      designation: String(raw.designation || '').trim().slice(0, 100),
      designationHi: String(raw.designationHi || '').trim().slice(0, 100),
      subject: String(raw.subject || '').trim().slice(0, 80),
      joinDate: String(raw.joinDate || '').trim().slice(0, 20),
      phone: String(raw.phone || '').trim().slice(0, 25),
      email: String(raw.email || '').trim().slice(0, 100),
      updatedAt: Date.now(),
    };
  }

  const migrate = (db) => {
    if (!db || typeof db !== 'object') return defaultDb();
    db.v = 3;
    db.settings = sanitizeSettings(db.settings);
    db.counters = db.counters && typeof db.counters === 'object' ? db.counters : {};
    db.letters = Array.isArray(db.letters) ? db.letters : [];
    db.inward = Array.isArray(db.inward) ? db.inward : [];
    db.students = Array.isArray(db.students) ? db.students : [];
    db.staff = Array.isArray(db.staff) ? db.staff : [];
    db.customTemplates = Array.isArray(db.customTemplates) ? db.customTemplates : [];

    db.letters.forEach(l => {
      if (!l.majorHead) l.majorHead = inferMajorHead(l.tpl);
      if (l.subHead === undefined) l.subHead = '';
      if (l.remarks === undefined) l.remarks = '';
      if (l.showQr === undefined) l.showQr = l.layout === 'cert' ? true : !!db.settings.defaultShowQr;
      if (l.customStamp) l.customStamp = sanitizeImageSrc(l.customStamp, '');
    });

    db.inward.forEach(r => {
      if (!r.majorHead) r.majorHead = 'ADM';
      if (r.subHead === undefined) r.subHead = '';
      if (r.remarks === undefined) r.remarks = '';
      if (!r.priority) r.priority = 'normal';
      if (r.needsReply && !r.dueDate) {
        const pObj = INWARD_PRIORITIES.find(x => x.id === r.priority) || INWARD_PRIORITIES[0];
        r.dueDate = addDaysISO(r.date || todayISO(), pObj.days);
      }
      if (r.attachment) r.attachment = sanitizeAttachmentSrc(r.attachment);
    });
    return db;
  };

  function inferMajorHead(tplId) {
    const map = {
      req: 'ADM', rem: 'ADM', fwd: 'ADM', reply: 'ADM', noc: 'ADM', blank: 'ADM',
      oo: 'NOT', not: 'NOT', circ: 'NOT',
      bon: 'STD', char: 'STD', fee_cert: 'STD', pm: 'STD', tc_req: 'STD',
      sanction: 'FIN', uc: 'SCH',
      quot: 'PUR',
      relieve: 'EST', exp: 'EST', leave: 'EST',
      inv: 'EVT', perm: 'EVT', thx: 'EVT',
    };
    return map[tplId] || 'ADM';
  }

  function getMajorHeadObj(db, code) {
    const heads = (db && db.settings && db.settings.majorHeads) || DEFAULT_MAJOR_HEADS;
    return heads.find(h => h.code === code) || heads[0] || DEFAULT_MAJOR_HEADS[0];
  }

  function getMajorHeadLabel(db, code, lang) {
    const h = getMajorHeadObj(db, code);
    if (!h) return code || 'ADM';
    if (lang === 'hi') return `${h.code} — ${h.hi}`;
    if (lang === 'en') return `${h.code} — ${h.en}`;
    return `${h.code} — ${h.en} (${h.hi})`;
  }

  function inwardDeadlineMeta(r, refToday) {
    if (!r || r.status !== 'pending' || !r.dueDate) {
      return { overdue: false, dueSoon: false, daysLeft: null, label: '' };
    }
    const daysLeft = diffDaysISO(r.dueDate, refToday || todayISO());
    if (daysLeft === null) return { overdue: false, dueSoon: false, daysLeft: null, label: '' };
    if (daysLeft < 0) {
      return { overdue: true, dueSoon: false, daysLeft, label: `Overdue by ${Math.abs(daysLeft)}d` };
    }
    if (daysLeft === 0) {
      return { overdue: false, dueSoon: true, daysLeft: 0, label: 'Due Today!' };
    }
    if (daysLeft <= 3) {
      return { overdue: false, dueSoon: true, daysLeft, label: `Due in ${daysLeft}d` };
    }
    return { overdue: false, dueSoon: false, daysLeft, label: `${daysLeft}d left` };
  }

  function buildPlaceholderContext(db, letter, nextRefPreview) {
    const S = (db && db.settings) || defaultSettings();
    const sc = S.school || {};
    const isHi = (letter && letter.lang) === 'hi';
    const iso = (letter && letter.date) || todayISO();
    const sess = sessionFromISO(iso);
    const sg = (S.signatories || []).find(x => x.id === (letter && letter.sig)) || (S.signatories || [])[0] || {};
    const mh = getMajorHeadObj(db, letter && letter.majorHead);
    const refVal = (letter && letter.ref) || nextRefPreview || '____';

    return {
      ref_no: refVal,
      पत्रांक: refVal,
      date: fmtDateDMY(iso),
      दिनांक: fmtDateDMY(iso),
      today: fmtDateDMY(todayISO()),
      academic_session: sess,
      session_auto: sess,
      सत्र: sess,
      financial_year: sess,
      fy: sess,
      वित्तीय_वर्ष: sess,
      major_head: isHi ? mh.hi : mh.en,
      major_head_code: mh.code,
      मुख्य_शीर्ष: mh.hi,
      sub_head: (letter && letter.subHead) || '',
      file_no: (letter && letter.subHead) || '',
      उप_शीर्ष: (letter && letter.subHead) || '',
      संचिका: (letter && letter.subHead) || '',
      school: isHi ? (sc.hi || sc.en) : (sc.en || sc.name),
      school_name: isHi ? (sc.hi || sc.en) : (sc.en || sc.name),
      school_name_en: sc.en || sc.name || '',
      school_name_hi: sc.hi || sc.en || '',
      विद्यालय: sc.hi || sc.en || '',
      school_sub_name: sc.subName || '',
      school_address: isHi ? (sc.addressHi || sc.addressEn) : (sc.addressEn || sc.addressHi),
      school_address_en: sc.addressEn || '',
      school_address_hi: sc.addressHi || '',
      विद्यालय_पता: sc.addressHi || sc.addressEn || '',
      udise_code: sc.udise || '',
      udise: sc.udise || '',
      cbse_aff_no: sc.cbseAff || '',
      affiliation_no: sc.cbseAff || '',
      estd_year: sc.estd || '',
      district: isHi ? (sc.districtHi || sc.districtEn) : (sc.districtEn || sc.districtHi),
      जिला: sc.districtHi || sc.districtEn || '',
      state: isHi ? (sc.stateHi || sc.stateEn) : (sc.stateEn || sc.stateHi),
      राज्य: sc.stateHi || sc.stateEn || '',
      school_email: sc.email || '',
      school_phone: sc.phone || '',
      signatory_name: isHi ? (sg.nameHi || sg.name || '') : (sg.name || ''),
      हस्ताक्षरकर्ता: sg.nameHi || sg.name || '',
      signatory_designation: isHi ? (sg.designationHi || sg.designation || '') : (sg.designation || ''),
      पदनाम: sg.designationHi || sg.designation || '',
      signatory_org: isHi ? (sg.orgHi || sg.org || '') : (sg.org || ''),
    };
  }

  const seriesFmt = (s, series) => (series === 'in' ? s.inFormat : s.refFormat);

  const peekRef = (db, series, iso, headCode) => {
    const s = db.settings;
    const yk = yearKey(iso || todayISO(), s.yearMode);
    const n = (db.counters[series + '|' + yk] || 0) + 1;
    return { n, yk, ref: fmtRef(seriesFmt(s, series), n, yk, s.padWidth, headCode) };
  };

  const alloc = (db, series, iso, headCode) => {
    const p = peekRef(db, series, iso, headCode);
    db.counters[series + '|' + p.yk] = p.n;
    return p;
  };

  const need = (x, msg) => { if (!x) throw new Error(msg); return x; };
  const findL = (db, id) => need(db.letters.find(x => x.id === id), 'Letter not found');

  const ops = {
    saveLetter(db, l, actor) {
      need(l && l.id, 'Invalid letter payload');
      l.id = String(l.id).slice(0, 40);
      l.majorHead = String(l.majorHead || inferMajorHead(l.tpl)).toUpperCase().slice(0, 12);
      l.subHead = String(l.subHead || '').trim().slice(0, 120);
      l.remarks = String(l.remarks || '').trim().slice(0, 500);
      l.showQr = l.showQr !== false;
      if (l.customStamp) l.customStamp = sanitizeImageSrc(l.customStamp, '');
      l.updatedAt = Date.now();
      if (actor) l.updatedBy = actor;

      const i = db.letters.findIndex(x => x.id === l.id);
      if (i < 0) {
        l.createdAt = l.createdAt || Date.now();
        if (actor) l.createdBy = actor;
        l.status = 'draft';
        delete l.ref; delete l.refNo; delete l.refYear;
        db.letters.push(l);
        return l;
      }
      const o = db.letters[i];
      Object.assign(l, {
        ref: o.ref,
        refNo: o.refNo,
        refYear: o.refYear,
        status: o.status,
        createdAt: o.createdAt,
        createdBy: o.createdBy,
        issuedAt: o.issuedAt,
        issuedBy: o.issuedBy,
        approvedBy: o.approvedBy,
        approvedAt: o.approvedAt,
        approvalNote: o.approvalNote,
        submittedBy: o.submittedBy,
        submittedAt: o.submittedAt,
        submissionNote: o.submissionNote,
        dispatch: o.dispatch,
        reply: o.reply,
        cancelReason: o.cancelReason,
      });
      if (o.status === 'issued' || o.status === 'dispatched') {
        l.editedAfterIssue = o.editedAfterIssue || o.body !== l.body || o.subject !== l.subject || o.to !== l.to;
      }
      Object.keys(l).forEach(k => { if (l[k] === undefined) delete l[k]; });
      db.letters[i] = l;
      return l;
    },

    submitForApproval(db, { id, note }, actor) {
      const l = findL(db, id);
      need(!l.ref && ['draft', 'returned', 'pending_approval'].includes(l.status), 'Only unissued drafts can be sent for approval.');
      l.status = 'pending_approval';
      l.submittedBy = actor || l.updatedBy || 'staff';
      l.submittedAt = Date.now();
      l.submissionNote = String(note || '').trim().slice(0, 300);
      l.updatedAt = Date.now();
      return l;
    },

    returnLetter(db, { id, note }, actor) {
      const l = findL(db, id);
      need(!l.ref, 'Issued letter cannot be returned as draft.');
      l.status = 'returned';
      l.approvalNote = String(note || '').trim().slice(0, 400);
      l.reviewedBy = actor || 'admin';
      l.reviewedAt = Date.now();
      l.updatedAt = Date.now();
      return l;
    },

    approveAndIssueLetter(db, { id, date, note, customStamp, showSign }, actor) {
      const l = findL(db, id);
      need(l.status !== 'cancelled', 'Cancelled letter cannot be approved.');
      if (customStamp) l.customStamp = sanitizeImageSrc(customStamp, '');
      if (typeof showSign === 'boolean') l.showSign = showSign;
      l.approvedBy = actor || 'admin';
      l.approvedAt = Date.now();
      if (note !== undefined) l.approvalNote = String(note || '').trim().slice(0, 400);
      return ops.issueLetter(db, { id, date }, actor);
    },

    issueLetter(db, { id, date }, actor) {
      const l = findL(db, id);
      need(l.status !== 'cancelled', 'Cancelled letter cannot be issued.');
      if (!l.ref) {
        const d = date || l.date || todayISO();
        const p = alloc(db, 'out', d, l.majorHead);
        Object.assign(l, {
          ref: p.ref,
          refNo: p.n,
          refYear: p.yk,
          date: d,
          issuedAt: Date.now(),
          issuedBy: actor || l.updatedBy || 'system',
          status: 'issued',
        });
        if (l.replyTo) {
          const r = db.inward.find(x => x.id === l.replyTo);
          if (r) {
            r.status = 'replied';
            r.reply = { ref: l.ref, date: d, letterId: l.id };
          }
        }
      }
      l.updatedAt = Date.now();
      return l;
    },

    cancelLetter(db, { id, reason }, actor) {
      const l = findL(db, id);
      need(l.ref, 'Only issued letters can be cancelled.');
      l.status = 'cancelled';
      l.cancelReason = String(reason || '').slice(0, 300);
      l.cancelledBy = actor || '';
      l.updatedAt = Date.now();
      return l;
    },

    deleteLetter(db, { id }) {
      const l = findL(db, id);
      need(!l.ref, 'Issued letters cannot be deleted; use Cancel so Ref. Nos. have no gaps.');
      db.letters = db.letters.filter(x => x.id !== id);
      return { id };
    },

    patchLetter(db, { id, patch }, actor) {
      const l = findL(db, id);
      need(patch && typeof patch === 'object', 'Invalid patch');
      ['dispatch', 'reply', 'remarks', 'awaitingReply', 'majorHead', 'subHead', 'showQr'].forEach(k => {
        if (k in patch) l[k] = patch[k];
      });
      if (patch.dispatch && l.status === 'issued') l.status = 'dispatched';
      if (patch.dispatch === null && l.status === 'dispatched') l.status = 'issued';
      l.updatedAt = Date.now();
      if (actor) l.updatedBy = actor;
      return l;
    },

    saveInward(db, r, actor) {
      need(r && r.id, 'Invalid inward record');
      r.majorHead = String(r.majorHead || 'ADM').toUpperCase().slice(0, 12);
      r.subHead = String(r.subHead || '').trim().slice(0, 120);
      r.from = String(r.from || '').trim().slice(0, 300);
      r.subject = String(r.subject || '').trim().slice(0, 400);
      r.senderRef = String(r.senderRef || '').trim().slice(0, 120);
      r.remarks = String(r.remarks || '').trim().slice(0, 400);
      r.priority = INWARD_PRIORITIES.some(p => p.id === r.priority) ? r.priority : 'normal';
      r.attachment = sanitizeAttachmentSrc(r.attachment);
      r.ocrText = String(r.ocrText || '').slice(0, 4000);
      need(r.from && r.subject, 'Sender and Subject are required.');

      if (r.needsReply && !r.dueDate) {
        const pObj = INWARD_PRIORITIES.find(x => x.id === r.priority) || INWARD_PRIORITIES[0];
        r.dueDate = addDaysISO(r.date || todayISO(), pObj.days);
      }

      const i = db.inward.findIndex(x => x.id === r.id);
      if (i < 0) {
        const p = alloc(db, 'in', r.date || todayISO(), r.majorHead);
        r.no = p.ref;
        r.createdAt = Date.now();
        if (actor) r.createdBy = actor;
        r.status = r.needsReply ? 'pending' : 'noaction';
        db.inward.push(r);
        return r;
      }
      const o = db.inward[i];
      r.no = o.no;
      r.createdAt = o.createdAt;
      r.createdBy = o.createdBy;
      r.reply = o.reply;
      r.status = o.status === 'replied' ? 'replied' : (r.needsReply ? 'pending' : 'noaction');
      db.inward[i] = r;
      return r;
    },

    deleteInward(db, { id }) {
      db.inward = db.inward.filter(x => x.id !== id);
      return { id };
    },

    // Student & Staff Master Directory Ops
    saveStudent(db, stu) {
      need(stu && stu.name, 'Student name is required.');
      const clean = sanitizeStudent(stu);
      const idx = db.students.findIndex(x => x.id === clean.id || (clean.admNo && x.admNo && x.admNo.toLowerCase() === clean.admNo.toLowerCase()));
      if (idx >= 0) {
        clean.id = db.students[idx].id;
        db.students[idx] = clean;
      } else {
        db.students.push(clean);
      }
      return clean;
    },

    deleteStudent(db, { id }) {
      db.students = db.students.filter(x => x.id !== id);
      return { id };
    },

    bulkUpsertStudents(db, { rows }) {
      need(Array.isArray(rows), 'Invalid student list');
      let added = 0, updated = 0;
      rows.forEach(raw => {
        if (!raw || !String(raw.name || '').trim()) return;
        const clean = sanitizeStudent(raw);
        const idx = clean.admNo
          ? db.students.findIndex(x => x.admNo && x.admNo.toLowerCase() === clean.admNo.toLowerCase())
          : -1;
        if (idx >= 0) {
          clean.id = db.students[idx].id;
          db.students[idx] = clean;
          updated++;
        } else {
          db.students.push(clean);
          added++;
        }
      });
      return { added, updated, total: db.students.length };
    },

    saveStaff(db, stf) {
      need(stf && stf.name, 'Staff name is required.');
      const clean = sanitizeStaff(stf);
      const idx = db.staff.findIndex(x => x.id === clean.id || (clean.empId && x.empId && x.empId.toLowerCase() === clean.empId.toLowerCase()));
      if (idx >= 0) {
        clean.id = db.staff[idx].id;
        db.staff[idx] = clean;
      } else {
        db.staff.push(clean);
      }
      return clean;
    },

    deleteStaff(db, { id }) {
      db.staff = db.staff.filter(x => x.id !== id);
      return { id };
    },

    bulkUpsertStaff(db, { rows }) {
      need(Array.isArray(rows), 'Invalid staff list');
      let added = 0, updated = 0;
      rows.forEach(raw => {
        if (!raw || !String(raw.name || '').trim()) return;
        const clean = sanitizeStaff(raw);
        const idx = clean.empId
          ? db.staff.findIndex(x => x.empId && x.empId.toLowerCase() === clean.empId.toLowerCase())
          : -1;
        if (idx >= 0) {
          clean.id = db.staff[idx].id;
          db.staff[idx] = clean;
          updated++;
        } else {
          db.staff.push(clean);
          added++;
        }
      });
      return { added, updated, total: db.staff.length };
    },

    saveSettings(db, s) {
      db.settings = sanitizeSettings(s);
      return db.settings;
    },

    saveCustomTemplate(db, tpl) {
      need(tpl && tpl.name, 'Template name is required');
      const id = String(tpl.id || ('cust_' + uid())).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
      const clean = {
        id,
        custom: true,
        name: String(tpl.name).trim().slice(0, 120),
        majorHead: String(tpl.majorHead || 'ADM').toUpperCase().slice(0, 12),
        layout: ['letter', 'notice', 'cert'].includes(tpl.layout) ? tpl.layout : 'letter',
        fields: Array.isArray(tpl.fields) ? tpl.fields.slice(0, 25).map(f => ({
          k: String(f.k || '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 32),
          l: String(f.l || f.k || '').slice(0, 100),
          t: ['text', 'area', 'date', 'select'].includes(f.t) ? f.t : 'text',
          ph: String(f.ph || '').slice(0, 120),
          opt: !!f.opt,
        })).filter(f => f.k) : [],
        en: {
          heading: String((tpl.en && tpl.en.heading) || '').slice(0, 150),
          to: String((tpl.en && tpl.en.to) || '').slice(0, 500),
          subject: String((tpl.en && tpl.en.subject) || '').slice(0, 400),
          salutation: String((tpl.en && tpl.en.salutation) || 'Respected Sir/Madam,').slice(0, 120),
          closing: String((tpl.en && tpl.en.closing) || 'Yours faithfully,').slice(0, 120),
          body: String((tpl.en && tpl.en.body) || '').slice(0, 10000),
        },
        hi: {
          heading: String((tpl.hi && tpl.hi.heading) || '').slice(0, 150),
          to: String((tpl.hi && tpl.hi.to) || '').slice(0, 500),
          subject: String((tpl.hi && tpl.hi.subject) || '').slice(0, 400),
          salutation: String((tpl.hi && tpl.hi.salutation) || 'महोदय/महोदया,').slice(0, 120),
          closing: String((tpl.hi && tpl.hi.closing) || 'भवदीय,').slice(0, 120),
          body: String((tpl.hi && tpl.hi.body) || '').slice(0, 10000),
        },
      };
      const idx = db.customTemplates.findIndex(x => x.id === id);
      if (idx >= 0) db.customTemplates[idx] = clean;
      else db.customTemplates.push(clean);
      return db.customTemplates;
    },

    deleteCustomTemplate(db, { id }) {
      db.customTemplates = db.customTemplates.filter(x => x.id !== id);
      return db.customTemplates;
    },

    setCounter(db, { series, year, last }) {
      need(['out', 'in'].includes(series), 'Invalid series');
      need(Number.isInteger(last) && last >= 0 && last <= 9999999, 'Invalid counter number');
      db.counters[series + '|' + year] = last;
      return db.counters;
    },

    restore(db, d) {
      need(d && Array.isArray(d.letters) && d.settings, 'Invalid Letter Draft Assistant backup file.');
      db.settings = d.settings;
      db.counters = d.counters || {};
      db.letters = d.letters;
      db.inward = d.inward || [];
      db.students = d.students || [];
      db.staff = d.staff || [];
      db.customTemplates = d.customTemplates || [];
      migrate(db);
      return { ok: true };
    },

    markBackup(db) {
      db.settings.lastBackup = Date.now();
      return db.settings;
    },
  };

  const ADMIN_ONLY_OPS = new Set([
    'returnLetter',
    'approveAndIssueLetter',
    'cancelLetter',
    'deleteLetter',
    'deleteInward',
    'deleteStudent',
    'deleteStaff',
    'saveSettings',
    'setCounter',
    'restore',
    'deleteCustomTemplate',
  ]);

  const apply = (db, name, payload, actor) => {
    const f = ops[name];
    if (!f) throw new Error('Unknown operation: ' + name);
    return f(db, payload || {}, actor);
  };

  return {
    DEFAULT_MAJOR_HEADS,
    INWARD_PRIORITIES,
    SYSTEM_PLACEHOLDERS,
    ADMIN_ONLY_OPS,
    defaultSettings,
    defaultDb,
    migrate,
    sanitizeSettings,
    sanitizeImageSrc,
    sanitizeAttachmentSrc,
    inferMajorHead,
    getMajorHeadObj,
    getMajorHeadLabel,
    inwardDeadlineMeta,
    buildPlaceholderContext,
    peekRef,
    alloc,
    todayISO,
    addDaysISO,
    diffDaysISO,
    fmtDateDMY,
    sessionFromISO,
    uid,
    yearKey,
    fmtRef,
    apply,
    ops: Object.keys(ops),
  };
});
