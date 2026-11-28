/* Voice Studio — Hindi/English dictation + spoken commands for school clerks.
   parse(transcript, lang) -> ops[]; apply(ops, ctx) mutates text fields. */
(function (root) {
  'use strict';

  const L = '(?<![\\p{L}\\p{M}\\p{N}])', R = '(?![\\p{L}\\p{M}\\p{N}])';
  const FIELD = {
    recipient: 'eTo', subject: 'eSubj', body: 'eBody', closing: 'eClose',
    enclosure: 'eEncl', copy: 'eCc', salutation: 'eSal', heading: 'eHeading',
  };
  const GO_HI = '(?:पर\\s+)?(?:जाओ|जाइए|जाएं|जाएँ|चलो)';
  // [regex source, op]  — Hindi + English spoken commands
  const CMDS = [
    ['new paragraph|नया पैराग्राफ|नया अनुच्छेद', { t: 'sym', v: '\n\n' }],
    ['new line|next line|नई लाइन|नयी लाइन|अगली पंक्ति|अगली लाइन', { t: 'sym', v: '\n' }],
    ['full stop|पूर्ण विराम|पूरा विराम|फुल स्टॉप|दंडा', { t: 'stop' }],
    ['comma|अल्प विराम|कॉमा|कोमा', { t: 'sym', v: ',' }],
    ['question mark|प्रश्न चिह्न|प्रश्नवाचक चिह्न', { t: 'sym', v: '?' }],
    ['semicolon|अर्द्ध विराम|अर्धविराम', { t: 'sym', v: ';' }],
    ['colon|कोलन', { t: 'sym', v: ':' }],
    ['undo that|scratch that|delete that|पीछे हटो|यह मिटाओ|इसे मिटाओ|वह मिटाओ', { t: 'undo' }],
    ['stop listening|stop dictation|सुनना बंद करो|रिकॉर्डिंग बंद करो|बोलना बंद', { t: 'halt' }],
    ['switch to english|english mode|अंग्रेजी में बोलो|अंग्रेज़ी में बोलो|इंग्लिश में बोलो', { t: 'lang', v: 'en' }],
    ['switch to hindi|hindi mode|हिंदी में बोलो|हिन्दी में बोलो', { t: 'lang', v: 'hi' }],
    ['go to (?:the )?(recipient|address|subject|body|closing|enclosure|copy|salutation|heading)', { t: 'goto', g: 1 }],
    ['(प्राप्तकर्ता|पता|विषय|मुख्य भाग|मुख्य पाठ|समापन|संलग्नक|प्रतिलिपि|संबोधन|शीर्षक)\\s+' + GO_HI, { t: 'goto', hi: 1 }],
  ];
  const HI_FIELD = {
    'प्राप्तकर्ता': 'recipient', 'पता': 'recipient', 'विषय': 'subject', 'मुख्य भाग': 'body', 'मुख्य पाठ': 'body',
    'समापन': 'closing', 'संलग्नक': 'enclosure', 'प्रतिलिपि': 'copy', 'संबोधन': 'salutation', 'शीर्षक': 'heading',
  };
  const RE = new RegExp(L + '(?:' + CMDS.map((c, i) => `(?<c${i}>${c[0]})`).join('|') + ')' + R, 'giu');

  function parse(transcript, lang) {
    const text = String(transcript || '');
    const ops = [];
    let last = 0, m;
    const pushText = (s) => { s = s.replace(/\s+/g, ' ').trim(); if (s) ops.push({ t: 'text', v: s }); };
    RE.lastIndex = 0;
    while ((m = RE.exec(text))) {
      pushText(text.slice(last, m.index));
      last = m.index + m[0].length;
      const i = CMDS.findIndex((_, k) => m.groups['c' + k] !== undefined);
      const spec = CMDS[i][1];
      if (spec.t === 'stop') ops.push({ t: 'sym', v: lang === 'hi' ? '।' : '.' });
      else if (spec.t === 'goto') {
        const key = spec.g ? m[0].toLowerCase().replace(/^go to (the )?/, '').trim() : HI_FIELD[m[0].split(/\s+(?:पर\s+)?(?:जाओ|जाइए|जाएं|जाएँ|चलो)/)[0].trim()];
        const id = FIELD[key === 'address' ? 'recipient' : key];
        if (id) ops.push({ t: 'goto', id });
      } else ops.push(Object.assign({}, spec));
    }
    pushText(text.slice(last));
    return ops;
  }

  /* ctx: { getTarget(), setTarget(id), toast(msg), setLang(l), halt(), notify(el) } */
  function apply(ops, ctx, state) {
    state.undo = state.undo || [];
    for (const op of ops) {
      if (op.t === 'goto') { ctx.setTarget(op.id); continue; }
      if (op.t === 'lang') { ctx.setLang(op.v); continue; }
      if (op.t === 'halt') { ctx.halt(); continue; }
      const el = ctx.getTarget();
      if (!el) continue;
      if (op.t === 'undo') {
        const u = state.undo.pop();
        if (u && u.el.value.slice(u.at, u.at + u.len) === u.s) {
          u.el.value = u.el.value.slice(0, u.at) + u.el.value.slice(u.at + u.len);
          u.el.setSelectionRange(u.at, u.at);
          ctx.notify(u.el);
        }
        continue;
      }
      if (op.t === 'sym' && op.v[0] === '\n') {
        const p0 = el.selectionStart ?? el.value.length;
        const trimmed = el.value.slice(0, p0).replace(/[ \t]+$/, '');
        el.value = trimmed + el.value.slice(p0);
        el.setSelectionRange(trimmed.length, trimmed.length);
      }
      const pos = el.selectionStart ?? el.value.length;
      const before = el.value.slice(0, pos);
      let s = op.v;
      if (op.t === 'text') {
        if (before && !/[\s(]$/.test(before)) s = ' ' + s;
      } else if (/^[,;:.?।]$/.test(s)) {
        s = s + ' ';
      }
      el.value = before + s + el.value.slice(pos);
      el.setSelectionRange(pos + s.length, pos + s.length);
      state.undo.push({ el, at: pos, len: s.length, s });
      if (state.undo.length > 50) state.undo.shift();
      ctx.notify(el);
    }
  }

  const COMMAND_HELP = [
    ['नई लाइन / new line', 'Enter'],
    ['नया पैराग्राफ / new paragraph', 'Blank line'],
    ['पूर्ण विराम / full stop', '। or .'],
    ['अल्प विराम / comma', ','],
    ['प्रश्न चिह्न / question mark', '?'],
    ['विषय पर जाओ / go to subject', 'Move to a field'],
    ['मुख्य भाग पर जाओ / go to body', 'subject · recipient · body · closing · enclosure · copy'],
    ['इसे मिटाओ / undo that', 'Remove last phrase'],
    ['अंग्रेजी में बोलो / switch to english', 'Change language by voice'],
    ['हिंदी में बोलो / switch to hindi', 'Change language by voice'],
    ['सुनना बंद करो / stop listening', 'Mic off'],
  ];

  const api = { parse, apply, COMMAND_HELP, FIELD };
  root.VoiceStudio = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
