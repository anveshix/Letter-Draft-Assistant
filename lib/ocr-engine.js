'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { createWorker } = require('tesseract.js');
const engData = require('@tesseract.js-data/eng');
const hinData = require('@tesseract.js-data/hin');

let cachedLangDir = null;
let sharedWorkerPromise = null;

function ensureLocalTessdataDir() {
  if (cachedLangDir && fs.existsSync(cachedLangDir)) return cachedLangDir;
  const dir = path.join(os.tmpdir(), 'lda-tessdata-v4');
  fs.mkdirSync(dir, { recursive: true });
  for (const pkg of [engData, hinData]) {
    if (pkg && pkg.langPath && fs.existsSync(pkg.langPath)) {
      for (const f of fs.readdirSync(pkg.langPath)) {
        const dst = path.join(dir, f);
        if (!fs.existsSync(dst)) {
          fs.copyFileSync(path.join(pkg.langPath, f), dst);
        }
      }
    }
  }
  cachedLangDir = dir;
  return dir;
}

async function getOcrWorker() {
  if (!sharedWorkerPromise) {
    sharedWorkerPromise = (async () => {
      const langDir = ensureLocalTessdataDir();
      const worker = await createWorker(['eng', 'hin'], 1, {
        langPath: langDir,
        cacheMethod: 'none',
        gzip: true,
      });
      return worker;
    })().catch(err => {
      sharedWorkerPromise = null;
      throw err;
    });
  }
  return sharedWorkerPromise;
}

function extractInwardMetadataFromText(rawText) {
  const text = String(rawText || '').replace(/\r\n/g, '\n');
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // 1. Extract Sender Reference / Memo No.
  let senderRef = '';
  const refPatterns = [
    /(?:पत्रांक|ज्ञापांक|Memo\s*No\.?|Letter\s*No\.?|Ref\.?\s*No\.?)\s*[:\-–.]?\s*([A-Za-z0-9\/._\-]{2,35})/i,
    /\b([0-9]{2,5}\/[A-Za-z0-9\-]{2,15})\b/,
  ];
  for (const re of refPatterns) {
    const m = re.exec(text);
    if (m && m[1]) { senderRef = m[1].trim(); break; }
  }

  // 2. Extract Date (if present near Memo/Date)
  const dateMatch = /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](20\d{2}|\d{2})\b/.exec(text);
  if (dateMatch && senderRef && !senderRef.toLowerCase().includes('dt')) {
    senderRef = `${senderRef} dt. ${dateMatch[0]}`;
  }

  // 3. Extract Subject
  let subject = '';
  const subjMatch = /(?:विषय|Subject|Sub\.?)\s*[:\-–.]\s*([^\n]+(?:\n[^\n]{5,80})?)/i.exec(text);
  if (subjMatch && subjMatch[1]) {
    subject = subjMatch[1].replace(/\s+/g, ' ').trim().slice(0, 260);
  } else if (lines.length >= 2) {
    subject = lines.slice(0, 3).join(' — ').slice(0, 200);
  }

  // 4. Guess Sender Office
  let from = '';
  const officeHints = [
    [/जिला शिक्षा पदाधिकारी|District Education Officer|\bDEO\b/i, 'District Education Officer (DEO)'],
    [/जिला शिक्षा अधीक्षक|District Superintendent of Education|\bDSE\b/i, 'District Superintendent of Education (DSE)'],
    [/उपायुक्त|Deputy Commissioner|\bDC Office\b/i, 'Deputy Commissioner Office'],
    [/प्रखंड शिक्षा पदाधिकारी|Block Education Officer|\bBEO\b/i, 'Block Education Officer (BEO)'],
    [/CBSE|केंद्रीय माध्यमिक शिक्षा बोर्ड/i, 'CBSE Regional Office'],
    [/JCERT|JEPC|झारखंड शिक्षा परियोजना/i, 'JCERT / JEPC Ranchi'],
    [/कोषागार|Treasury/i, 'District Treasury Office'],
  ];
  for (const [re, label] of officeHints) {
    if (re.test(text)) { from = label; break; }
  }
  if (!from && lines[0]) from = lines[0].slice(0, 120);

  // 5. Auto-classify Priority & Major Head
  let priority = 'normal';
  let majorHead = 'ADM';
  if (/सूचना का अधिकार|\bRTI\b|Right to Information/i.test(text)) {
    priority = 'rti';
    majorHead = 'LGL';
  } else if (/अति आवश्यक|तत्काल|24\s*घंटे|Urgent|Immediate|Show\s*Cause|स्पष्टीकरण/i.test(text)) {
    priority = 'urgent';
  } else if (/न्यायालय|Court|CBSE|Board\s*Exam|बोर्ड परीक्षा/i.test(text)) {
    priority = 'board_court';
    majorHead = /CBSE|Board/i.test(text) ? 'BRD' : 'LGL';
  }

  if (/छात्रवृत्ति|Scholarship|Bonafide|अध्ययनरत|e-Kalyan/i.test(text)) majorHead = 'STD';
  else if (/वेतन|शिक्षक|स्थापना|विरमन|योगदान|अवकाश|Salary|Teacher|Leave/i.test(text)) majorHead = 'EST';
  else if (/विपत्र|बजट|लेखा|अंकेक्षण|Audit|Bill|Grant|समग्र शिक्षा/i.test(text)) majorHead = 'FIN';
  else if (/भवन|मरम्मत|निर्माण|Civil|Repair/i.test(text)) majorHead = 'INF';
  else if (/क्रय|निविदा|कोटेशन|Tender|Purchase/i.test(text)) majorHead = 'PUR';

  return {
    rawText: text.trim(),
    from,
    senderRef,
    subject,
    priority,
    majorHead,
  };
}

async function runOfflineOcrOnBuffer(imageBuffer) {
  const worker = await getOcrWorker();
  const res = await worker.recognize(imageBuffer);
  return extractInwardMetadataFromText((res && res.data && res.data.text) || '');
}

async function shutdownOcrWorker() {
  if (sharedWorkerPromise) {
    try {
      const w = await sharedWorkerPromise;
      await w.terminate();
    } catch (_) {}
    sharedWorkerPromise = null;
  }
}

module.exports = {
  runOfflineOcrOnBuffer,
  extractInwardMetadataFromText,
  shutdownOcrWorker,
};
