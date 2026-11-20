'use strict';

/**
 * Prepare static browser vendor bundles & verify required directories
 * so that `npm run build` succeeds across Vercel, Render, Railway,
 * Netlify, Docker, Koyeb, Fly.io, and GitHub Pages.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VENDOR_DIR = path.join(ROOT, 'public', 'vendor');

fs.mkdirSync(VENDOR_DIR, { recursive: true });

const fuseSrc = path.join(ROOT, 'node_modules', 'fuse.js', 'dist', 'fuse.min.cjs');
if (fs.existsSync(fuseSrc)) {
  const raw = fs.readFileSync(fuseSrc, 'utf8');
  const wrapped = `(function(){var module={exports:{}},exports=module.exports;\n${raw}\nwindow.Fuse=module.exports.default||module.exports;})();\n`;
  fs.writeFileSync(path.join(VENDOR_DIR, 'fuse.js'), wrapped);
}

const sigSrc = path.join(ROOT, 'node_modules', 'signature_pad', 'dist', 'signature_pad.umd.min.js');
if (fs.existsSync(sigSrc)) {
  fs.copyFileSync(sigSrc, path.join(VENDOR_DIR, 'signature_pad.js'));
}

console.log('[prepare-deploy] Vendor bundles prepared in public/vendor/ (fuse.js, signature_pad.js).');
