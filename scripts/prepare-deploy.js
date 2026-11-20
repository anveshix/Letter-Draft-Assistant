'use strict';

/**
 * Prepare static browser vendor bundles & curated vector icon pack
 * so that `npm run build` succeeds 100% offline across Vercel, Render,
 * Railway, Netlify, Docker, Koyeb, Fly.io, and GitHub Pages.
 *
 * Bundled open-source libraries (0 vulnerabilities):
 *  - fuse.js (krisk/Fuse, Apache-2.0)
 *  - signature_pad.js (szimek/signature_pad, MIT)
 *  - anime.js (juliangarnier/anime v4.5, MIT)
 *  - auto-animate.js (formkit/auto-animate, MIT)
 *  - icons.js (lucide-icons/lucide curated 24x24 stroke SVG subset, ISC)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VENDOR_DIR = path.join(ROOT, 'public', 'vendor');

fs.mkdirSync(VENDOR_DIR, { recursive: true });

// 1. Fuse.js (Fuzzy Search)
const fuseSrc = path.join(ROOT, 'node_modules', 'fuse.js', 'dist', 'fuse.min.cjs');
if (fs.existsSync(fuseSrc)) {
  const raw = fs.readFileSync(fuseSrc, 'utf8');
  const wrapped = `(function(){var module={exports:{}},exports=module.exports;\n${raw}\nwindow.Fuse=module.exports.default||module.exports;})();\n`;
  fs.writeFileSync(path.join(VENDOR_DIR, 'fuse.js'), wrapped);
}

// 2. SignaturePad (High-DPI Digital Signature Canvas)
const sigSrc = path.join(ROOT, 'node_modules', 'signature_pad', 'dist', 'signature_pad.umd.min.js');
if (fs.existsSync(sigSrc)) {
  fs.copyFileSync(sigSrc, path.join(VENDOR_DIR, 'signature_pad.js'));
}

// 3. Anime.js v4.5 (Timeline, Spring Physics, SVG Drawable & Stagger Motion Engine)
const animeSrc = path.join(ROOT, 'node_modules', 'animejs', 'dist', 'bundles', 'anime.umd.min.js');
if (fs.existsSync(animeSrc)) {
  fs.copyFileSync(animeSrc, path.join(VENDOR_DIR, 'anime.js'));
}

// 4. FormKit AutoAnimate (Zero-Config Smooth DOM List & Table Transitions)
const aaSrc = path.join(ROOT, 'node_modules', '@formkit', 'auto-animate', 'index.min.js');
if (fs.existsSync(aaSrc)) {
  let rawAa = fs.readFileSync(aaSrc, 'utf8').trim();
  rawAa = rawAa.replace(/export\s*\{[^}]+\}\s*;?\s*$/, 'window.autoAnimate=H;');
  fs.writeFileSync(
    path.join(VENDOR_DIR, 'auto-animate.js'),
    `/*! @formkit/auto-animate | MIT License */\n(function(){${rawAa}})();\n`
  );
}

// 5. Curated Lucide Vector Icon Subset (Crisp 24x24 Geometric Stroke Icons)
const lucideModPath = path.join(ROOT, 'node_modules', 'lucide');
if (fs.existsSync(lucideModPath)) {
  const L = require('lucide');
  const ICON_NAMES = [
    'LayoutDashboard', 'FilePenLine', 'CheckCircle2', 'Layers', 'GraduationCap',
    'Table2', 'Send', 'Inbox', 'BarChart3', 'LayoutTemplate', 'Users', 'Settings',
    'ShieldCheck', 'ShieldAlert', 'ShieldX', 'Search', 'Plus', 'Download', 'Upload',
    'FileText', 'FileSpreadsheet', 'Printer', 'Share2', 'PenTool', 'Copy', 'Trash2',
    'Mic', 'Keyboard', 'BookOpen', 'Languages', 'Sparkles', 'Bell', 'Clock',
    'AlertTriangle', 'Check', 'X', 'ChevronRight', 'Moon', 'Sun', 'Command',
    'Lock', 'LogOut', 'KeyRound', 'ScanLine', 'QrCode', 'RefreshCw', 'Eye',
    'CornerUpLeft', 'Building2', 'Award', 'FolderKanban', 'SlidersHorizontal',
    'ZoomIn', 'ZoomOut', 'ExternalLink', 'Smartphone',
  ];
  const map = {};
  for (const name of ICON_NAMES) {
    if (Array.isArray(L[name])) map[name] = L[name];
  }
  const iconsJs = `/*! Curated Lucide Icons Subset (lucide-icons/lucide, ISC License) */
(function (root) {
  'use strict';
  var ICONS = ${JSON.stringify(map)};
  function escAttr(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function iconSvg(name, opts) {
    var def = ICONS[name];
    if (!def) return '';
    var o = opts || {};
    var size = o.size || 17;
    var cls = 'ui-ico' + (o.cls ? ' ' + o.cls : '');
    var sw = o.strokeWidth || 1.9;
    var inner = def.map(function (node) {
      var tag = node[0];
      var attrs = node[1] || {};
      var attrStr = Object.keys(attrs).map(function (k) {
        return k + '="' + escAttr(attrs[k]) + '"';
      }).join(' ');
      return '<' + tag + ' ' + attrStr + '></' + tag + '>';
    }).join('');
    return '<svg class="' + escAttr(cls) + '" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  }
  function hydrateIcons(container) {
    var rootEl = container || document;
    if (!rootEl.querySelectorAll) return;
    var nodes = rootEl.querySelectorAll('[data-icon]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var name = el.getAttribute('data-icon');
      var size = parseInt(el.getAttribute('data-icon-size') || '17', 10);
      var svg = iconSvg(name, { size: size });
      if (svg) el.innerHTML = svg;
    }
  }
  root.LucideIcons = ICONS;
  root.iconSvg = iconSvg;
  root.hydrateIcons = hydrateIcons;
})(typeof self !== 'undefined' ? self : this);
`;
  fs.writeFileSync(path.join(VENDOR_DIR, 'icons.js'), iconsJs);
}

console.log('[prepare-deploy] Vendor bundles prepared in public/vendor/ (fuse.js, signature_pad.js, anime.js, auto-animate.js, icons.js).');
