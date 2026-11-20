'use strict';

const path = require('path');
const PDFDocument = require('pdfkit');
const Core = require('../public/core.js');

const FONTS_DIR = path.join(__dirname, '..', 'public', 'fonts');

const LBL = {
  en: { to: 'To,', subj: 'Subject:', ref: 'Ref. No.:', date: 'Date:', encl: 'Enclosure(s):', cc: 'Copy forwarded to:', head: 'Major Head / File:' },
  hi: { to: 'सेवा में,', subj: 'विषय:', ref: 'पत्रांक:', date: 'दिनांक:', encl: 'संलग्नक:', cc: 'प्रतिलिपि सूचनार्थ एवं आवश्यक कार्यार्थ:', head: 'मद / संचिका:' },
};

function cleanMarkers(str) {
  return String(str || '').replace(/‹([^›]+)›/g, '[$1]');
}

function mmToPt(mm) {
  return (Number(mm) || 0) * 2.83465;
}

function registerAppFonts(doc, family) {
  const useMukta = family === 'mukta';
  const regPath = path.join(FONTS_DIR, useMukta ? 'Mukta-Regular.ttf' : 'Karma-Regular.ttf');
  const boldPath = path.join(FONTS_DIR, useMukta ? 'Mukta-Bold.ttf' : 'Karma-Bold.ttf');
  const uiReg = path.join(FONTS_DIR, 'Mukta-Regular.ttf');
  const uiBold = path.join(FONTS_DIR, 'Mukta-Bold.ttf');
  doc.registerFont('BodyReg', regPath);
  doc.registerFont('BodyBold', boldPath);
  doc.registerFont('UiReg', uiReg);
  doc.registerFont('UiBold', uiBold);
}

function generateLetterPdfBuffer(db, letter, resolveImageBuffer, opts = {}) {
  return new Promise((resolve, reject) => {
    try {
      const S = db.settings;
      const isHi = letter.lang === 'hi';
      const L = LBL[isHi ? 'hi' : 'en'];
      const sg = (S.signatories || []).find(x => x.id === letter.sig) || (S.signatories || [])[0] || {};
      const fontPt = Math.max(10, Math.min(16, Number(S.fontPt) || 12));
      const lineGap = isHi ? 3.5 : 2.5;

      const marginX = 45;
      const marginY = 36;
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: marginY, bottom: marginY, left: marginX, right: marginX },
        info: {
          Title: `${letter.ref ? 'Letter ' + letter.ref : 'Draft Letter'} — ${S.school.en || ''}`,
          Author: S.school.en || 'Letter Draft Assistant',
          Creator: 'Letter Draft Assistant v3.0',
        },
      });

      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      registerAppFonts(doc, S.fontFamily);
      const contentWidth = doc.page.width - marginX * 2;

      // Watermark for cancelled or unissued letters
      if (letter.status === 'cancelled' || !letter.ref) {
        doc.save();
        doc.fillColor(letter.status === 'cancelled' ? '#fecaca' : '#e5e7eb');
        doc.opacity(0.30);
        doc.rotate(-35, { origin: [doc.page.width / 2, doc.page.height / 2] });
        doc.font('UiBold').fontSize(56).text(
          letter.status === 'cancelled' ? 'CANCELLED / रद्द' : 'DRAFT / प्रारूप',
          0,
          doc.page.height / 2 - 30,
          { width: doc.page.width, align: 'center' }
        );
        doc.restore();
        doc.opacity(1).fillColor('#000000');
      }

      // Certificate decorative frame
      if (letter.layout === 'cert' && !S.preprinted) {
        doc.save();
        doc.lineWidth(1.2).strokeColor('#1f3a5f')
          .rect(24, 24, doc.page.width - 48, doc.page.height - 48).stroke();
        doc.lineWidth(0.4).strokeColor('#64748b')
          .rect(28, 28, doc.page.width - 56, doc.page.height - 56).stroke();
        doc.restore();
      }

      // 1. Header / Letterhead
      if (S.preprinted) {
        doc.y = marginY + mmToPt(S.topMm || 48);
      } else {
        const lhBuf = resolveImageBuffer ? resolveImageBuffer(S.letterhead) : null;
        if (lhBuf) {
          try {
            doc.image(lhBuf, marginX, marginY, { width: contentWidth });
            let imgH = 108;
            if (lhBuf.length > 24 && lhBuf[0] === 0x89 && lhBuf[1] === 0x50) {
              const w = lhBuf.readUInt32BE(16);
              const h = lhBuf.readUInt32BE(20);
              if (w > 0 && h > 0) imgH = (contentWidth * h) / w;
            }
            doc.y = marginY + imgH + 8;
          } catch (_) {
            renderTextHeader(doc, S, marginX, contentWidth);
          }
        } else {
          renderTextHeader(doc, S, marginX, contentWidth);
        }
      }

      doc.fillColor('#000000');

      // 2. Ref. No. & Date Row
      const refText = `${L.ref} ${letter.ref || '________ (Draft)'}`;
      const dateText = `${L.date} ${Core.fmtDateDMY(letter.date)}`;
      const rowY = doc.y;
      doc.font('UiBold').fontSize(fontPt - 0.5);
      doc.text(refText, marginX, rowY, { width: contentWidth * 0.62, align: 'left' });
      doc.text(dateText, marginX, rowY, { width: contentWidth, align: 'right' });
      doc.moveDown(0.35);

      if (S.showMajorHeadOnLetter || letter.subHead) {
        const mhObj = Core.getMajorHeadObj(db, letter.majorHead);
        const mhStr = [mhObj ? (isHi ? mhObj.hi : mhObj.en) : '', letter.subHead].filter(Boolean).join(' / ');
        if (mhStr) {
          doc.font('UiReg').fontSize(fontPt - 2).fillColor('#374151')
            .text(`${L.head} ${mhStr}`, marginX, doc.y, { width: contentWidth, align: 'left' });
          doc.fillColor('#000000').moveDown(0.35);
        }
      }

      doc.moveDown(0.35);

      // 3. Recipient / Heading / Subject
      if (letter.layout === 'letter' && letter.to) {
        doc.font('BodyBold').fontSize(fontPt).text(L.to, marginX, doc.y, { lineGap });
        doc.font('BodyReg').fontSize(fontPt).text(cleanMarkers(letter.to), marginX, doc.y, { width: contentWidth, lineGap });
        doc.moveDown(0.6);
      }

      if (letter.layout === 'notice' || letter.layout === 'cert') {
        if (letter.heading) {
          doc.moveDown(0.3);
          doc.font('BodyBold').fontSize(fontPt + 3)
            .text(cleanMarkers(letter.heading), marginX, doc.y, { width: contentWidth, align: 'center', underline: true, lineGap });
          doc.moveDown(0.45);
        }
        if (letter.subject) {
          doc.font('BodyBold').fontSize(fontPt + 0.5)
            .text(cleanMarkers(letter.subject), marginX, doc.y, { width: contentWidth, align: 'center', lineGap });
          doc.moveDown(0.45);
        }
        if (letter.layout === 'notice' && letter.to) {
          doc.font('BodyBold').fontSize(fontPt)
            .text(cleanMarkers(letter.to), marginX, doc.y, { width: contentWidth, align: 'center', lineGap });
          doc.moveDown(0.5);
        }
      } else if (letter.subject) {
        doc.font('BodyBold').fontSize(fontPt)
          .text(`${L.subj} ${cleanMarkers(letter.subject)}`, marginX, doc.y, { width: contentWidth, lineGap });
        doc.moveDown(0.55);
      }

      // 4. Salutation
      if (letter.layout === 'letter' && letter.salutation) {
        doc.font('BodyReg').fontSize(fontPt).text(cleanMarkers(letter.salutation), marginX, doc.y, { lineGap });
        doc.moveDown(0.35);
      }

      // 5. Body Paragraphs
      const paragraphs = cleanMarkers(letter.body || '').split(/\n{2,}/);
      doc.font('BodyReg').fontSize(fontPt);
      for (const p of paragraphs) {
        if (!p.trim()) continue;
        doc.text(p.trim(), marginX, doc.y, { width: contentWidth, align: 'justify', lineGap });
        doc.moveDown(0.55);
      }

      // 6. Signatory + Optional QR Verification Row
      doc.moveDown(0.6);
      if (doc.y > doc.page.height - 175) doc.addPage();

      const blockStartY = doc.y;
      const sigBlockWidth = 220;
      const sigIsLeft = S.sigAlign === 'left';
      const sigX = sigIsLeft ? marginX : (doc.page.width - marginX - sigBlockWidth);
      const sigAlign = sigIsLeft ? 'left' : 'center';

      if (letter.layout === 'letter' && letter.closing) {
        doc.font('BodyReg').fontSize(fontPt).text(cleanMarkers(letter.closing), sigX, doc.y, { width: sigBlockWidth, align: sigAlign, lineGap });
        doc.moveDown(0.25);
      }

      const chosenStampSrc = letter.customStamp || sg.stamp;
      const stampBuf = (letter.showSign || letter.customStamp) && chosenStampSrc && resolveImageBuffer
        ? resolveImageBuffer(chosenStampSrc)
        : null;

      if (stampBuf) {
        try {
          const imgW = 145;
          let imgH = 66;
          if (stampBuf.length > 24 && stampBuf[0] === 0x89 && stampBuf[1] === 0x50) {
            const w = stampBuf.readUInt32BE(16);
            const h = stampBuf.readUInt32BE(20);
            if (w > 0 && h > 0) imgH = (imgW * h) / w;
          }
          const imgX = sigAlign === 'left' ? sigX : sigX + (sigBlockWidth - imgW) / 2;
          doc.image(stampBuf, imgX, doc.y, { width: imgW });
          doc.y += imgH + 2;
        } catch (_) {
          doc.moveDown(2.0);
        }
      } else {
        doc.moveDown(2.2);
      }

      const sigName = isHi ? (sg.nameHi || sg.name || '') : (sg.name || '');
      const sigDesig = isHi ? (sg.designationHi || sg.designation || '') : (sg.designation || '');
      const sigOrg = isHi ? (sg.orgHi || sg.org || '') : (sg.org || '');

      if (sigName) {
        doc.font('BodyBold').fontSize(fontPt).text(`(${sigName})`, sigX, doc.y, { width: sigBlockWidth, align: sigAlign });
      }
      if (sigDesig && (!stampBuf || letter.customStamp)) {
        doc.font('BodyReg').fontSize(fontPt - 0.5).text(sigDesig, sigX, doc.y, { width: sigBlockWidth, align: sigAlign });
      }
      if (sigOrg && (!stampBuf || letter.customStamp)) {
        doc.font('BodyReg').fontSize(fontPt - 1).text(sigOrg, sigX, doc.y, { width: sigBlockWidth, align: sigAlign });
      }
      const afterSigY = doc.y;

      // Render Tamper-Proof Verification QR on opposite side if available
      if (letter.showQr !== false && letter.ref && opts.qrBuffer) {
        try {
          const qrSize = 62;
          const qrX = sigIsLeft ? (doc.page.width - marginX - 150) : marginX;
          doc.image(opts.qrBuffer, qrX, blockStartY + 4, { width: qrSize, height: qrSize });
          doc.font('UiBold').fontSize(7.5).fillColor('#162d4c')
            .text(isHi ? 'सत्यापित दस्तावेज़ (QR स्कैन करें)' : 'Verified Official Document', qrX, blockStartY + qrSize + 7, { width: 165, align: 'left' });
          if (opts.verifyCode) {
            doc.font('UiReg').fontSize(7).fillColor('#475569')
              .text(`Verify Code: ${opts.verifyCode}`, qrX, doc.y, { width: 165, align: 'left' });
          }
          doc.fillColor('#000000');
        } catch (_) {}
      }

      doc.y = Math.max(afterSigY, doc.y);
      doc.x = marginX;

      // 7. Enclosures & Copy To
      if (letter.encl) {
        doc.moveDown(0.7);
        doc.font('BodyBold').fontSize(fontPt - 0.5).text(`${L.encl} `, marginX, doc.y, { continued: true });
        doc.font('BodyReg').text(cleanMarkers(letter.encl), { width: contentWidth, lineGap });
      }
      if (letter.cc) {
        doc.moveDown(0.5);
        doc.font('BodyBold').fontSize(fontPt - 0.5).text(L.cc, marginX, doc.y, { width: contentWidth });
        doc.font('BodyReg').fontSize(fontPt - 0.5).text(cleanMarkers(letter.cc), marginX, doc.y, { width: contentWidth, lineGap });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function renderTextHeader(doc, S, marginX, contentWidth) {
  const sc = S.school || {};
  doc.font('UiBold').fontSize(15).fillColor('#1f3a5f')
    .text(sc.name || sc.en || 'OFFICIAL LETTERHEAD', marginX, doc.y, { width: contentWidth, align: 'center' });
  if (sc.subName) {
    doc.font('UiBold').fontSize(11).text(sc.subName, marginX, doc.y, { width: contentWidth, align: 'center' });
  }
  const metaLine = [
    sc.cbseAff ? `CBSE Affiliation: ${sc.cbseAff}` : '',
    sc.udise ? `U-DISE: ${sc.udise}` : '',
  ].filter(Boolean).join('  |  ');
  if (metaLine) {
    doc.font('UiReg').fontSize(9.5).fillColor('#374151')
      .text(metaLine, marginX, doc.y, { width: contentWidth, align: 'center' });
  }
  if (sc.addressEn) {
    doc.font('UiBold').fontSize(10).fillColor('#111827')
      .text(sc.addressEn, marginX, doc.y, { width: contentWidth, align: 'center' });
  }
  doc.moveDown(0.35);
  doc.moveTo(marginX, doc.y).lineTo(marginX + contentWidth, doc.y).lineWidth(1.2).strokeColor('#1f3a5f').stroke();
  doc.moveDown(0.6);
}

function generateRegisterPdfBuffer(db, rows, title) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margins: { top: 30, bottom: 30, left: 30, right: 30 },
        info: { Title: title || 'Outward Letter Register' },
      });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      registerAppFonts(doc, 'mukta');
      const pageW = doc.page.width - 60;

      const drawHeader = () => {
        doc.font('UiBold').fontSize(14).fillColor('#1f3a5f')
          .text(`${db.settings.school.en || db.settings.school.name} — ${title || 'Outward Register (जावक पंजी)'}`, 30, 26, { width: pageW, align: 'center' });
        doc.font('UiReg').fontSize(9).fillColor('#4b5563')
          .text(`Generated on: ${Core.fmtDateDMY(Core.todayISO())}  |  Total Records: ${rows.length}`, 30, doc.y, { width: pageW, align: 'center' });
        doc.moveDown(0.5);

        const cols = [
          { label: 'Ref. No.', w: 72 },
          { label: 'Date', w: 64 },
          { label: 'Major Head (मद)', w: 120 },
          { label: 'Sub-Head', w: 85 },
          { label: 'Recipient (प्राप्तकर्ता)', w: 145 },
          { label: 'Subject (विषय)', w: 196 },
          { label: 'Status / Dispatch', w: 100 },
        ];
        const y = doc.y;
        doc.rect(30, y, pageW, 20).fill('#1f3a5f');
        let x = 30;
        doc.fillColor('#ffffff').font('UiBold').fontSize(8.5);
        for (const c of cols) {
          doc.text(c.label, x + 4, y + 4, { width: c.w - 8, lineBreak: false });
          x += c.w;
        }
        doc.y = y + 22;
        doc.fillColor('#000000');
        return cols;
      };

      let cols = drawHeader();

      rows.forEach((l, idx) => {
        const mh = Core.getMajorHeadObj(db, l.majorHead);
        const cells = [
          l.ref || 'DRAFT',
          Core.fmtDateDMY(l.date),
          mh ? `${mh.code}: ${mh.en}` : (l.majorHead || 'ADM'),
          l.subHead || '—',
          ((l.to || '').split('\n')[0] || (l.fields && l.fields.name) || '—').slice(0, 80),
          cleanMarkers(l.subject || l.heading || '—').slice(0, 140),
          l.dispatch ? `${l.status} (${l.dispatch.mode})` : (l.status || ''),
        ];

        doc.font('UiReg').fontSize(8.5);
        const heights = cells.map((txt, i) => doc.heightOfString(String(txt), { width: cols[i].w - 8 }) + 8);
        const rowH = Math.max(20, ...heights);

        if (doc.y + rowH > doc.page.height - 34) {
          doc.addPage();
          cols = drawHeader();
        }

        const y = doc.y;
        if (idx % 2 === 1) {
          doc.save().rect(30, y, pageW, rowH).fill('#f8fafc').restore();
        }
        doc.save().moveTo(30, y + rowH).lineTo(30 + pageW, y + rowH).lineWidth(0.4).strokeColor('#e2e8f0').stroke().restore();

        let x = 30;
        cells.forEach((txt, i) => {
          doc.font(i === 0 ? 'UiBold' : 'UiReg').fontSize(8.5).fillColor('#111827')
            .text(String(txt), x + 4, y + 4, { width: cols[i].w - 8 });
          x += cols[i].w;
        });
        doc.y = y + rowH;
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function generateInspectionReportPdfBuffer(db) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margins: { top: 36, bottom: 36, left: 42, right: 42 } });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      registerAppFonts(doc, 'mukta');
      const W = doc.page.width - 84;
      const S = db.settings || Core.defaultSettings();
      const sc = S.school || {};

      doc.font('UiBold').fontSize(15).fillColor('#162d4c')
        .text(sc.name || sc.en, 42, 36, { width: W, align: 'center' });
      doc.font('UiBold').fontSize(11.5).fillColor('#1e40af')
        .text('OFFICIAL CORRESPONDENCE & REGISTER INSPECTION SUMMARY (पत्राचार अंकेक्षण प्रतिवेदन)', 42, doc.y, { width: W, align: 'center' });
      doc.font('UiReg').fontSize(9).fillColor('#475569')
        .text(`U-DISE: ${sc.udise || '-'}  |  CBSE Aff.: ${sc.cbseAff || '-'}  |  Date: ${Core.fmtDateDMY(Core.todayISO())}`, 42, doc.y, { width: W, align: 'center' });
      doc.moveDown(0.8);

      const issued = db.letters.filter(l => l.status === 'issued' || l.status === 'dispatched');
      const dispatched = db.letters.filter(l => l.status === 'dispatched');
      const pendingAppr = db.letters.filter(l => l.status === 'pending_approval');
      const overdueInw = db.inward.filter(r => Core.inwardDeadlineMeta(r).overdue);

      doc.font('UiBold').fontSize(11).fillColor('#0f172a').text('1. Executive Summary (सारांश)');
      doc.font('UiReg').fontSize(9.5).fillColor('#1e293b').text(
        `• Total Issued Outward Letters: ${issued.length}   |   Dispatched: ${dispatched.length}   |   Pending Principal Approval: ${pendingAppr.length}\n` +
        `• Total Inward Letters Logged: ${db.inward.length}   |   Pending Replies: ${db.inward.filter(r => r.status === 'pending').length}   |   Overdue SLA: ${overdueInw.length}\n` +
        `• Master Directory Records: ${db.students.length} Students   |   ${db.staff.length} Teaching/Non-Teaching Staff`
      );
      doc.moveDown(0.8);

      doc.font('UiBold').fontSize(11).fillColor('#0f172a').text('2. Major Head-Wise Breakdown (मुख्य शीर्ष / मदवार विवरण)');
      doc.moveDown(0.3);

      const cols = [
        { label: 'Code', w: 52 },
        { label: 'Major Head (मुख्य शीर्ष)', w: 235 },
        { label: 'Issued', w: 55 },
        { label: 'Dispatched', w: 65 },
        { label: 'Inward', w: 52 },
        { label: 'Pending Reply', w: 52 },
      ];
      let y = doc.y;
      doc.rect(42, y, W, 19).fill('#162d4c');
      let x = 42;
      doc.fillColor('#ffffff').font('UiBold').fontSize(8.5);
      cols.forEach(c => { doc.text(c.label, x + 4, y + 3, { width: c.w - 6 }); x += c.w; });
      doc.y = y + 21;

      (S.majorHeads || Core.DEFAULT_MAJOR_HEADS).forEach((h, i) => {
        const outH = db.letters.filter(l => (l.majorHead || 'ADM') === h.code);
        const inH = db.inward.filter(r => (r.majorHead || 'ADM') === h.code);
        const rowVals = [
          h.code,
          `${h.en} (${h.hi})`,
          outH.filter(l => l.status === 'issued' || l.status === 'dispatched').length,
          outH.filter(l => l.status === 'dispatched').length,
          inH.length,
          inH.filter(r => r.status === 'pending').length,
        ];
        const ry = doc.y;
        if (i % 2 === 1) doc.save().rect(42, ry, W, 18).fill('#f8fafc').restore();
        let rx = 42;
        rowVals.forEach((v, ci) => {
          doc.font(ci === 0 ? 'UiBold' : 'UiReg').fontSize(8.5).fillColor('#0f172a')
            .text(String(v), rx + 4, ry + 3, { width: cols[ci].w - 6, lineBreak: false });
          rx += cols[ci].w;
        });
        doc.y = ry + 18;
      });

      doc.moveDown(2.2);
      const sg = (S.signatories || [])[0] || {};
      doc.font('UiBold').fontSize(10).text(`(${sg.name || 'Principal'})`, 42, doc.y, { width: W, align: 'right' });
      doc.font('UiReg').fontSize(9).text(sg.designation || 'Head of Institution', 42, doc.y, { width: W, align: 'right' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateLetterPdfBuffer,
  generateRegisterPdfBuffer,
  generateInspectionReportPdfBuffer,
};
