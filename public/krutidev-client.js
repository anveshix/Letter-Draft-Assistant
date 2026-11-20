/* KrutiDev-010 to Unicode Devanagari Converter (Shared Browser + Node)
   Eliminates legacy non-Unicode Hindi font issues when pasting from older Word documents. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KrutiDev = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PAIRS = [
    ['ñ', '॰'], ['Q+Z', 'क़्'], ['sas', 'सँ'], ['aa', 'ा'], ['र्Z', 'र्द्ध'], ['ZZ', 'ीं'],
    ['‘', '"'], ['’', '"'], ['“', "'"], ['”', "'"], ['å', '०'], ['ƒ', '१'], ['„', '२'],
    ['…', '३'], ['†', '४'], ['‡', '५'], ['ˆ', '६'], ['‰', '७'], ['Š', '८'], ['‹', '९'],
    ['¶+', 'फ़्'], ['d+', 'क़'], ['[+k', 'ख़'], ['[+', 'ख़्'], ['x+', 'ग़'], ['T+', 'ज़्'],
    ['t+', 'ज़'], ['M+', 'ड़'], ['<+', 'ढ़'], ['Q+', 'फ़'], [';+', 'य़'], ['j+', 'ऱ'],
    ['u+', 'ऩ'], ['Ùk', 'त्त'], ['Ù', 'त्त्'], ['ä', 'क्त'], ['–', 'दृ'], ['—', 'कृ'],
    ['é', 'न्न'], ['™', 'न्न्'], ['=kk', '=k'], ['f=k', 'f='],
    ['à', 'ह्न'], ['á', 'ह्य'], ['â', 'हृ'], ['ã', 'ह्म'], ['ºz', 'ह्र'], ['º', 'ह्'],
    ['í', 'द्द'], ['{k', 'क्ष'], ['{', 'क्ष्'], ['=', 'त्र'], ['«', 'त्र्'],
    ['Nî', 'छ्य'], ['Vî', 'ट्य'], ['Bî', 'ठ्य'], ['Mî', 'ड्य'], ['<î', 'ढ्य'],
    ['|', 'द्य'], ['K', 'ज्ञ'], ['}', 'द्व'], ['J', 'श्र'], ['Vª', 'ट्र'], ['Mª', 'ड्र'],
    ['<ªª', 'ढ्र'], ['Nª', 'छ्र'], ['Ø', 'क्र'], ['Ý', 'फ्र'], ['nzZ', 'र्द्र'], ['æ', 'द्र'],
    ['ç', 'प्र'], ['Á', 'प्र'], ['xz', 'ग्र'], ['#', 'रु'], [':', 'रू'],
    ['v‚', 'ऑ'], ['vks', 'ओ'], ['vkS', 'औ'], ['vk', 'आ'], ['v', 'अ'],
    ['b±', 'ईं'], ['Ã', 'ई'], ['bZ', 'ई'], ['b', 'इ'], ['mQ', 'ऊ'], ['m', 'उ'],
    ['Å', 'ऊ'], [',s', 'ऐ'], [',', 'ए'], ['_', 'ऋ'],
    ['ô', 'क्क'], ['d', 'क'], ['Dk', 'क'], ['D', 'क्'],
    ['[k', 'ख'], ['[', 'ख्'], ['x', 'ग'], ['Xk', 'ग'], ['X', 'ग्'],
    ['Ä', 'घ'], ['?k', 'घ'], ['?', 'घ्'], ['³', 'ङ'],
    ['pkS', 'चौ'], ['p', 'च'], ['Pk', 'च'], ['P', 'च्'], ['N', 'छ'],
    ['t', 'ज'], ['Tk', 'ज'], ['T', 'ज्'], ['>', 'झ'], ['÷', 'झ्'], ['¥', 'ञ'],
    ['ê', 'ट्ट'], ['ë', 'ट्ठ'], ['V', 'ट'], ['B', 'ठ'], ['ì', 'ड्ड'], ['ï', 'ड्ढ'],
    ['M+', 'ड़'], ['<+', 'ढ़'], ['M', 'ड'], ['<', 'ढ'], ['.k', 'ण'], ['.', 'ण्'],
    ['r', 'त'], ['Rk', 'त'], ['R', 'त्'], ['Fk', 'थ'], ['F', 'थ्'],
    [')', 'द्ध'], ['n', 'द'], ['/k', 'ध'], ['èk', 'ध'], ['/', 'ध्'], ['Ë', 'ध्'],
    ['u', 'न'], ['Uk', 'न'], ['U', 'न्'],
    ['i', 'प'], ['Ik', 'प'], ['I', 'प्'], ['¶', 'फ्'], ['Q', 'फ'],
    ['c', 'ब'], ['Ck', 'ब'], ['C', 'ब्'], ['Hk', 'भ'], ['H', 'भ्'],
    ['e', 'म'], ['Ek', 'म'], ['E', 'म्'],
    [';', 'य'], ['¸', 'य्'], ['j', 'र'], ['y', 'ल'], ['Yk', 'ल'], ['Y', 'ल्'], ['G', 'ळ'],
    ['o', 'व'], ['Ok', 'व'], ['O', 'व्'],
    ["'k", 'श'], ["'", 'श्'], ['"k', 'ष'], ['"', 'ष्'], ['l', 'स'], ['Lk', 'स'], ['L', 'स्'], ['g', 'ह'],
    ['È', 'ीं'], ['z', '्र'],
    ['Ì', 'द्द'], ['Í', 'ट्ट'], ['Î', 'ट्ठ'], ['Ï', 'ड्ड'], ['Ñ', 'कृ'], ['Ò', 'भ'], ['Ó', '्य'], ['Ô', 'ड्ढ'],
    ['Ö', 'झ्'], ['Ø', 'क्र'], ['Ù', 'त्त्'], ['Ü', 'श'],
    ['‚', 'ॉ'], ['ks', 'ो'], ['kS', 'ौ'], ['k', 'ा'], ['h', 'ी'], ['q', 'ु'], ['w', 'ू'], ['`', 'ृ'],
    ['s', 'े'], ['¢', 'े'], ['S', 'ै'], ['a', 'ं'], ['¡', 'ँ'], ['%', 'ः'], ['W', 'ॅ'], ['•', 'ऽ'], ['~', '्'], ['+', '़'],
    ['0', '०'], ['1', '१'], ['2', '२'], ['3', '३'], ['4', '४'], ['5', '५'], ['6', '६'], ['7', '७'], ['8', '८'], ['9', '९'],
  ];

  function looksLikeKrutiDev(text) {
    const s = String(text || '');
    if (!s.trim()) return false;
    // If already has significant Devanagari Unicode, it's probably already Unicode
    const devCount = (s.match(/[\u0900-\u097F]/g) || []).length;
    if (devCount > s.length * 0.15) return false;
    // Typical KrutiDev patterns: vk, dks, gS, es, fd;k, i=kad, fon~;ky;
    return /\b(gS|gSa|esa|dks|ls|fd;k|vkSj|i=kad|fnukad|egksn;|lfou;|fuosnu)\b/.test(s);
  }

  function toUnicode(input) {
    let s = String(input || '');
    if (!s) return '';

    for (const [from, to] of PAIRS) {
      s = s.split(from).join(to);
    }

    // Move short 'i' matra 'f' across following half-consonants + full consonant -> 'ि'
    let pos = s.indexOf('f');
    while (pos !== -1) {
      let target = pos + 1;
      let ch = s.charAt(target);
      if (!ch) break;
      // Advance across conjunct clusters (consonant + halant '्')
      while (s.charAt(target + 1) === '्' && s.charAt(target + 2)) {
        target += 2;
      }
      const cluster = s.slice(pos + 1, target + 1);
      s = s.slice(0, pos) + cluster + 'ि' + s.slice(target + 1);
      pos = s.indexOf('f', pos + cluster.length + 1);
    }

    // Reposition Reph 'Z' -> 'र्' before the preceding consonant cluster + matras
    const matras = 'ािीुूृेैोौंँःॅॉ़';
    let zPos = s.indexOf('Z');
    while (zPos !== -1) {
      let start = zPos - 1;
      while (start >= 0 && matras.includes(s.charAt(start))) start--;
      while (start >= 2 && s.charAt(start - 1) === '्') start -= 2;
      if (start < 0) {
        s = s.slice(0, zPos) + s.slice(zPos + 1);
      } else {
        const segment = s.slice(start, zPos);
        s = s.slice(0, start) + 'र्' + segment + s.slice(zPos + 1);
      }
      zPos = s.indexOf('Z');
    }

    // Cleanup common combinations
    s = s.replace(/अा/g, 'आ').replace(/अो/g, 'ओ').replace(/अौ/g, 'औ').replace(/एे/g, 'ऐ').replace(/।+/g, '।');
    return s;
  }

  return { toUnicode, looksLikeKrutiDev };
});
