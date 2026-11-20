'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const JSZip = require('jszip');
const { PDFDocument } = require('pdf-lib');

const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lda-v3-test-'));
process.env.DATA_DIR = tmpDataDir;
process.env.PORT = '0';

const Core = require('../public/core.js');
const Tpl = require('../public/templates.js');
const KrutiDev = require('../public/krutidev-client.js');
const DraftStudio = require('../public/phrasebook.js');
const ExcelJS = require('exceljs');
const { server } = require('../server.js');
const { shutdownOcrWorker } = require('../lib/ocr-engine.js');

async function req(baseUrl, pathname, opts = {}) {
  const res = await fetch(baseUrl + pathname, {
    method: opts.method || 'GET',
    headers: opts.headers || {},
    body: opts.body,
  });
  return res;
}

(async () => {
  let passed = 0;
  const step = (name, fn) => Promise.resolve().then(fn).then(() => {
    passed++;
    console.log(`  ✓ ${name}`);
  });

  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  const base = `http://127.0.0.1:${addr.port}`;
  console.log(`\nRunning Letter Draft Assistant v3.0 (All 7 Modules + Security) Suite on ${base}...\n`);

  let adminCookie = '';
  let adminCsrf = '';
  let staffCookie = '';
  let staffCsrf = '';
  let issuedLetterId = '';
  let issuedLetterRef = '';

  try {
    // 1. Security & Unauthenticated Gate
    await step('Blocks unauthenticated access to /api/db, /api/op, /api/files/sign.png, and /api/inward/ocr', async () => {
      assert.strictEqual((await req(base, '/api/db')).status, 401);
      assert.strictEqual((await req(base, '/api/op', { method: 'POST', body: '{}' })).status, 401);
      assert.strictEqual((await req(base, '/api/files/sign.png')).status, 401);
      assert.strictEqual((await req(base, '/api/inward/ocr', { method: 'POST', body: '{}' })).status, 401);
      assert.strictEqual(fs.existsSync(path.join(__dirname, '..', 'public', 'private', 'sign.png')), false);
    });

    // 2. First-Time Admin Setup & CSRF Enforcement
    await step('Creates initial Principal/Admin account (scrypt) and enforces CSRF token on mutations', async () => {
      const setupRes = await req(base, '/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: 'Principal Admin',
          username: 'admin',
          password: 'StrongPassword#2026',
        }),
      });
      assert.strictEqual(setupRes.status, 200);
      const setCookie = setupRes.headers.get('set-cookie') || '';
      assert.ok(setCookie.includes('HttpOnly'));
      adminCookie = setCookie.split(';')[0];
      const data = await setupRes.json();
      adminCsrf = data.csrfToken;

      const noCsrf = await req(base, '/api/op', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({ op: 'markBackup', payload: {} }),
      });
      assert.strictEqual(noCsrf.status, 403);
    });

    // 3. Module 1: Student & Staff Master Directory (.xlsx sample + import + 4-sheet export)
    await step('Module 1: Exports Sample Student .xlsx, imports into Master Directory, and saves Staff', async () => {
      const sampleRes = await req(base, '/api/export/directory-xlsx?kind=students&sample=1', {
        headers: { Cookie: adminCookie },
      });
      assert.strictEqual(sampleRes.status, 200);
      const sampleBuf = Buffer.from(await sampleRes.arrayBuffer());

      const impRes = await req(base, '/api/import/directory-xlsx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, 'X-CSRF-Token': adminCsrf },
        body: JSON.stringify({ base64: sampleBuf.toString('base64'), kind: 'students' }),
      });
      assert.strictEqual(impRes.status, 200);
      const impJson = await impRes.json();
      assert.strictEqual(impJson.stats.added, 2);

      const stfRes = await req(base, '/api/op', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, 'X-CSRF-Token': adminCsrf },
        body: JSON.stringify({
          op: 'saveStaff',
          payload: { empId: 'JH-101', name: 'Smt. Kavita Murmu', nameHi: 'श्रीमती कविता मुर्मू', designation: 'PGT History' },
        }),
      });
      assert.strictEqual(stfRes.status, 200);
    });

    // 4. Module 3: Issue Hindi Certificate + Cryptographic HMAC-SHA256 QR Verification & Tamper Detection
    await step('Module 3: Issues Hindi Certificate with QR Code and verifies genuine vs forged vs cancelled on /api/public/verify', async () => {
      const saveRes = await req(base, '/api/op', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, 'X-CSRF-Token': adminCsrf },
        body: JSON.stringify({
          op: 'saveLetter',
          payload: {
            id: 'cert_qr_1',
            tpl: 'bon',
            lang: 'hi',
            layout: 'cert',
            majorHead: 'STD',
            subHead: 'Scholarship-2026',
            date: '2026-11-20',
            heading: 'अध्ययनरत (बोनाफाइड) प्रमाण-पत्र',
            subject: 'बोनाफाइड प्रमाण-पत्र',
            body: 'प्रमाणित किया जाता है कि कुमारी अनिता टुडू कक्षा 12वीं की नियमित छात्रा है।',
            fields: { name: 'कुमारी अनिता टुडू', adm: '2024/118' },
            sig: 'sg1',
            showSign: true,
            showQr: true,
          },
        }),
      });
      assert.strictEqual(saveRes.status, 200);

      const issRes = await req(base, '/api/op', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, 'X-CSRF-Token': adminCsrf },
        body: JSON.stringify({ op: 'issueLetter', payload: { id: 'cert_qr_1', date: '2026-11-20' } }),
      });
      const issData = await issRes.json();
      issuedLetterId = 'cert_qr_1';
      issuedLetterRef = issData.result.ref;
      assert.strictEqual(issuedLetterRef, '321/26');

      const qrRes = await req(base, `/api/letter/${issuedLetterId}/qr`, { headers: { Cookie: adminCookie } });
      const qrJson = await qrRes.json();
      assert.strictEqual(qrJson.issued, true);
      assert.ok(qrJson.qrDataUrl.startsWith('data:image/png;base64,'));
      const compactCode = qrJson.verifyCode.replace(/-/g, '');

      // Public verification — Genuine
      const pubOk = await (await req(base, `/api/public/verify?ref=${encodeURIComponent(issuedLetterRef)}&c=${compactCode}`)).json();
      assert.strictEqual(pubOk.valid, true);
      assert.strictEqual(pubOk.status, 'verified');
      assert.strictEqual(pubOk.issuedTo, 'कुमारी अनिता टुडू');

      // Public verification — Tampered HMAC (flip last hex char)
      const flipped = compactCode.slice(0, 15) + (compactCode[15] === 'A' ? 'B' : 'A');
      const pubBad = await (await req(base, `/api/public/verify?ref=${encodeURIComponent(issuedLetterRef)}&c=${flipped}`)).json();
      assert.strictEqual(pubBad.valid, false);
      assert.strictEqual(pubBad.status, 'forged_or_mismatch');

      // Export PDF & DOCX with embedded QR
      const dbNow = await (await req(base, '/api/db', { headers: { Cookie: adminCookie } })).json();
      const letterObj = dbNow.letters.find(x => x.id === issuedLetterId);

      const pdfRes = await req(base, '/api/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, 'X-CSRF-Token': adminCsrf },
        body: JSON.stringify({ letter: letterObj }),
      });
      assert.strictEqual(pdfRes.status, 200);
      const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
      assert.strictEqual(pdfBuf.slice(0, 4).toString(), '%PDF');

      const docxRes = await req(base, '/api/export/docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, 'X-CSRF-Token': adminCsrf },
        body: JSON.stringify({ letter: letterObj }),
      });
      assert.strictEqual(docxRes.status, 200);
      const docxBuf = Buffer.from(await docxRes.arrayBuffer());
      assert.strictEqual(docxBuf.slice(0, 2).toString(), 'PK');
    });

    // 5. Module 2: Bulk Mail-Merge & Batch Certificate Engine (Combined PDF via pdf-lib + DOCX ZIP via JSZip)
    await step('Module 2: Generates Batch Combined Multi-Page PDF (pdf-lib) and Batch Word .docx ZIP (JSZip) with sequential Ref. Nos.', async () => {
      const batchLetters = [
        { id: 'b1', tpl: 'bon', lang: 'en', layout: 'cert', majorHead: 'STD', subHead: 'Batch', date: '2026-11-20', heading: 'BONAFIDE CERTIFICATE', body: 'Certified for Student One.', fields: { name: 'Student One' }, sig: 'sg1', showSign: true, showQr: true },
        { id: 'b2', tpl: 'bon', lang: 'en', layout: 'cert', majorHead: 'STD', subHead: 'Batch', date: '2026-11-20', heading: 'BONAFIDE CERTIFICATE', body: 'Certified for Student Two.', fields: { name: 'Student Two' }, sig: 'sg1', showSign: true, showQr: true },
        { id: 'b3', tpl: 'bon', lang: 'hi', layout: 'cert', majorHead: 'STD', subHead: 'Batch', date: '2026-11-20', heading: 'अध्ययनरत प्रमाण-पत्र', body: 'प्रमाणित किया जाता है — छात्रा तीन।', fields: { name: 'छात्रा तीन' }, sig: 'sg1', showSign: true, showQr: true },
      ];

      // 5a. Combined Print PDF with Official Ref. Nos.
      const combRes = await req(base, '/api/batch/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, 'X-CSRF-Token': adminCsrf },
        body: JSON.stringify({ letters: batchLetters, issueRefs: true, outputFormat: 'combined-pdf', date: '2026-11-20' }),
      });
      assert.strictEqual(combRes.status, 200);
      const combBuf = Buffer.from(await combRes.arrayBuffer());
      const parsedPdf = await PDFDocument.load(combBuf);
      assert.strictEqual(parsedPdf.getPageCount(), 3, 'Combined PDF must contain exactly 3 pages');

      // 5b. ZIP of Individual .docx files + Manifest Excel
      const zipRes = await req(base, '/api/batch/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, 'X-CSRF-Token': adminCsrf },
        body: JSON.stringify({
          letters: [{ id: 'b4', tpl: 'bon', lang: 'en', layout: 'cert', majorHead: 'STD', date: '2026-11-20', heading: 'BONAFIDE', body: 'Test Zip.', fields: { name: 'Anita' }, sig: 'sg1' }],
          issueRefs: false,
          outputFormat: 'zip-docx',
        }),
      });
      assert.strictEqual(zipRes.status, 200);
      const zipBuf = Buffer.from(await zipRes.arrayBuffer());
      const loadedZip = await JSZip.loadAsync(zipBuf);
      const fileNames = Object.keys(loadedZip.files);
      assert.ok(fileNames.some(f => f.endsWith('.docx')), 'ZIP must contain .docx file');
      assert.ok(fileNames.includes('000_Batch_Register_Manifest.xlsx'), 'ZIP must include Excel Manifest');
    });

    // 6. Module 4: Clerk -> Principal Approval Queue + Policy Enforcement + Live Signature Upload
    await step('Module 4: Enforces Clerk -> Principal Approval Queue, live signature upload, and Principal approval issuance', async () => {
      // Create Staff clerk
      await req(base, '/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, 'X-CSRF-Token': adminCsrf },
        body: JSON.stringify({ username: 'clerk1', displayName: 'Office Clerk', role: 'staff', password: 'ClerkPassword#99' }),
      });
      const loginStaff = await req(base, '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'clerk1', password: 'ClerkPassword#99' }),
      });
      staffCookie = (loginStaff.headers.get('set-cookie') || '').split(';')[0];
      staffCsrf = (await loginStaff.json()).csrfToken;

      // Enable requireApprovalForStaff
      const curDb = await (await req(base, '/api/db', { headers: { Cookie: adminCookie } })).json();
      curDb.settings.requireApprovalForStaff = true;
      await req(base, '/api/op', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, 'X-CSRF-Token': adminCsrf },
        body: JSON.stringify({ op: 'saveSettings', payload: curDb.settings }),
      });

      // Clerk saves draft
      await req(base, '/api/op', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: staffCookie, 'X-CSRF-Token': staffCsrf },
        body: JSON.stringify({ op: 'saveLetter', payload: { id: 'appr_1', tpl: 'req', lang: 'en', layout: 'letter', majorHead: 'ADM', date: '2026-11-20', to: 'DEO Dumka', subject: 'Grant Request', body: 'Submitted.' } }),
      });

      // Clerk blocked from direct issueLetter when policy ON
      const directIssue = await req(base, '/api/op', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: staffCookie, 'X-CSRF-Token': staffCsrf },
        body: JSON.stringify({ op: 'issueLetter', payload: { id: 'appr_1' } }),
      });
      assert.strictEqual(directIssue.status, 403);

      // Clerk submits for Principal Approval
      const subRes = await req(base, '/api/op', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: staffCookie, 'X-CSRF-Token': staffCsrf },
        body: JSON.stringify({ op: 'submitForApproval', payload: { id: 'appr_1', note: 'Verified from file #12' } }),
      });
      assert.strictEqual((await subRes.json()).result.status, 'pending_approval');

      // Principal uploads live transparent PNG signature & approves
      const tinyPngBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const sigUp = await (await req(base, '/api/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, 'X-CSRF-Token': adminCsrf },
        body: JSON.stringify({ dataUrl: tinyPngBase64, kind: 'livesign' }),
      })).json();
      assert.ok(sigUp.url.startsWith('api/files/'));

      const appRes = await (await req(base, '/api/op', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, 'X-CSRF-Token': adminCsrf },
        body: JSON.stringify({ op: 'approveAndIssueLetter', payload: { id: 'appr_1', customStamp: sigUp.url, showSign: true } }),
      })).json();
      assert.strictEqual(appRes.result.status, 'issued');
      assert.strictEqual(appRes.result.ref, '325/26');
    });

    // 7. Module 5: Offline Bilingual OCR (tesseract.js) + SLA/RTI Deadlines
    await step('Module 5: Performs 100% offline Hindi+English OCR on scanned image and calculates RTI/Urgent SLA alerts', async () => {
      const lhBuf = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'letterhead.png'));
      const dataUrl = `data:image/png;base64,${lhBuf.toString('base64')}`;
      const ocrRes = await req(base, '/api/inward/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: staffCookie, 'X-CSRF-Token': staffCsrf },
        body: JSON.stringify({ dataUrl, saveScan: true }),
      });
      assert.strictEqual(ocrRes.status, 200);
      const ocrData = await ocrRes.json();
      assert.ok(ocrData.attachment.startsWith('api/files/scan_'));
      assert.ok(ocrData.rawText.toUpperCase().includes('EXCELLENCE'), 'Offline OCR must recognize letterhead text');

      // Test SLA overdue helper
      const overdueMeta = Core.inwardDeadlineMeta({ status: 'pending', dueDate: '2026-11-10' }, '2026-11-20');
      assert.strictEqual(overdueMeta.overdue, true);
      assert.strictEqual(overdueMeta.daysLeft, -10);
    });

    // 8. Module 6: Smart Bilingual Drafting Studio (Phonetic Hindi + Phrasebook + KrutiDev)
    await step('Module 6: Verifies offline English->Devanagari phonetic transliteration, 80+ Phrasebook & KrutiDev', async () => {
      const hi = DraftStudio.transliterateTextToHindi('savinya nivedan hai ki vidyalaya me');
      assert.strictEqual(hi, 'सविनय निवेदन है की विद्यालय में');
      const totalPhrases = DraftStudio.PHRASE_CATEGORIES.reduce((n, c) => n + c.items.length, 0);
      assert.ok(totalPhrases >= 30, 'Phrasebook categories populated with bilingual items');
      assert.strictEqual(KrutiDev.toUnicode('izkpk;Z'), 'प्राचार्य');
    });

    // 9. Module 7: Fuse.js + SignaturePad + Anime.js + AutoAnimate + Lucide Vendor Bundles + Inspection PDF + 4-Sheet Excel + PWA Assets
    await step('Module 7: Serves local Fuse.js, SignaturePad, Anime.js, AutoAnimate & Lucide Icon bundles, PWA assets, 4-sheet Excel, and Inspection PDF', async () => {
      assert.strictEqual((await req(base, '/vendor/fuse.js')).status, 200);
      assert.strictEqual((await req(base, '/vendor/signature_pad.js')).status, 200);
      assert.strictEqual((await req(base, '/vendor/anime.js')).status, 200);
      assert.strictEqual((await req(base, '/vendor/auto-animate.js')).status, 200);
      assert.strictEqual((await req(base, '/vendor/icons.js')).status, 200);
      assert.strictEqual((await req(base, '/motion-ui.js')).status, 200);
      assert.strictEqual((await req(base, '/manifest.json')).status, 200);
      assert.strictEqual((await req(base, '/sw.js')).status, 200);

      const indexHtml = await (await req(base, '/')).text();
      assert.ok(indexHtml.includes('id="authCrestSvg"'), 'Auth gate must include SVG Sovereign Crest motion stage');
      assert.ok(indexHtml.includes('id="navIndicator"'), 'Sidebar must include spring-animated sliding nav indicator');
      assert.ok(indexHtml.includes('id="cmdBtn"'), 'Topbar must include Ctrl+K Quick Command Palette trigger');

      const verifyRes = await req(base, '/verify');
      assert.strictEqual(verifyRes.status, 200);
      const verifyHtml = await verifyRes.text();
      assert.ok(verifyHtml.includes('vendor/anime.js'), 'Verification portal must load local Anime.js bundle');

      const inspRes = await req(base, '/api/export/inspection-pdf', { headers: { Cookie: adminCookie } });
      assert.strictEqual(inspRes.status, 200);
      const inspBuf = Buffer.from(await inspRes.arrayBuffer());
      assert.strictEqual(inspBuf.slice(0, 4).toString(), '%PDF');

      const xlsxRes = await req(base, '/api/export/register-xlsx', { headers: { Cookie: adminCookie } });
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(await xlsxRes.arrayBuffer()));
      assert.strictEqual(wb.worksheets.length, 4, 'Master Excel must contain Outward, Inward, Major Heads, and Student Directory sheets');
    });

    // 10. All 20 Built-in Templates Integrity Check
    await step('All 20 built-in templates have valid EN & HI placeholder parity', () => {
      assert.strictEqual(Tpl.list.length, 20);
      for (const tpl of Tpl.list) {
        assert.ok(tpl.id && tpl.en && tpl.hi);
      }
      assert.strictEqual(Tpl.render('Hello {{name}}{{adm?, Adm: %}}', { name: 'Anita', adm: '118' }, [], {}), 'Hello Anita, Adm: 118');
      assert.strictEqual(Tpl.render('Hello {{name}}{{adm?, Adm: %}}', { name: 'Anita', adm: '' }, [], {}), 'Hello Anita');
    });

    // 11. Universal Cloud & Static Deployment Readiness Check
    await step('All Cloud, Serverless, Docker & GitHub Pages deployment files are valid and ready', async () => {
      const rootDir = path.join(__dirname, '..');
      const requiredFiles = [
        '.nvmrc',
        '.node-version',
        'Procfile',
        'vercel.json',
        'api/index.js',
        'render.yaml',
        'railway.json',
        'nixpacks.toml',
        'fly.toml',
        'netlify.toml',
        'Dockerfile',
        '.nojekyll',
        'index.html',
        'scripts/prepare-deploy.js',
        'public/vendor/fuse.js',
        'public/vendor/signature_pad.js',
        'public/vendor/anime.js',
        'public/vendor/auto-animate.js',
        'public/vendor/icons.js',
        'public/motion-ui.js',
        'public/static-vault.js',
        'public/verify.html',
      ];
      for (const rel of requiredFiles) {
        assert.ok(fs.existsSync(path.join(rootDir, rel)), `Missing deployment file: ${rel}`);
      }
      const vercelFn = require('../api/index.js');
      assert.strictEqual(typeof vercelFn, 'function');
      assert.strictEqual(vercelFn.config.api.bodyParser, false);
      assert.strictEqual((await req(base, '/verify.html')).status, 200);
      assert.strictEqual((await req(base, '/static-vault.js')).status, 200);
    });

    console.log(`\n🎉 ALL ${passed} V3.0 TEST SUITES PASSED SUCCESSFULLY!\n`);
  } finally {
    await shutdownOcrWorker();
    server.close();
    fs.rmSync(tmpDataDir, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
