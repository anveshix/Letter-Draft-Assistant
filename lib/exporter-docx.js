'use strict';

const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  UnderlineType,
} = require('docx');
const Core = require('../public/core.js');

const LBL = {
  en: { to: 'To,', subj: 'Subject: ', ref: 'Ref. No.: ', date: 'Date: ', encl: 'Enclosure(s): ', cc: 'Copy forwarded to:' },
  hi: { to: 'सेवा में,', subj: 'विषय: ', ref: 'पत्रांक: ', date: 'दिनांक: ', encl: 'संलग्नक: ', cc: 'प्रतिलिपि सूचनार्थ एवं आवश्यक कार्यार्थ:' },
};

const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

function cleanMarkers(str) {
  return String(str || '').replace(/‹([^›]+)›/g, '[$1]');
}

function detectImageMeta(buf) {
  if (!buf || buf.length < 24) return { type: 'png', w: 500, h: 110 };
  // PNG magic: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
    return { type: 'png', w: buf.readUInt32BE(16) || 500, h: buf.readUInt32BE(20) || 110 };
  }
  // JPEG magic: FF D8
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    return { type: 'jpg', w: 500, h: 120 };
  }
  return { type: 'png', w: 500, h: 110 };
}

async function generateLetterDocxBuffer(db, letter, resolveImageBuffer) {
  const S = db.settings;
  const isHi = letter.lang === 'hi';
  const L = LBL[isHi ? 'hi' : 'en'];
  const sg = (S.signatories || []).find(x => x.id === letter.sig) || (S.signatories || [])[0] || {};
  const fontPt = Math.max(10, Math.min(16, Number(S.fontPt) || 12));
  const halfPts = Math.round(fontPt * 2); // Word uses half-points (24 = 12pt)
  const lineSpacing = isHi ? 340 : 300;   // 240 = 1.0x, 300 = 1.25x, 340 = ~1.42x

  const fontSpec = S.fontFamily === 'mukta'
    ? { ascii: 'Calibri', hAnsi: 'Calibri', cs: 'Nirmala UI', eastAsia: 'Mangal' }
    : { ascii: 'Times New Roman', hAnsi: 'Times New Roman', cs: 'Nirmala UI', eastAsia: 'Mangal' };

  const run = (text, opts = {}) => new TextRun(Object.assign({
    text: String(text ?? ''),
    font: fontSpec,
    size: opts.size || halfPts,
  }, opts));

  const multilineRuns = (text, opts = {}) => {
    const lines = cleanMarkers(text).split('\n');
    const out = [];
    lines.forEach((line, idx) => {
      if (idx > 0) out.push(new TextRun({ break: 1, font: fontSpec, size: opts.size || halfPts }));
      out.push(run(line, opts));
    });
    return out;
  };

  const children = [];

  // 1. Header / Letterhead
  if (S.preprinted) {
    const topTwips = Math.round((Number(S.topMm) || 48) * 56.6929);
    children.push(new Paragraph({ spacing: { before: topTwips, after: 120 }, children: [] }));
  } else {
    const lhBuf = resolveImageBuffer ? resolveImageBuffer(S.letterhead) : null;
    if (lhBuf) {
      const meta = detectImageMeta(lhBuf);
      const targetW = 620;
      const targetH = Math.max(40, Math.round((targetW * meta.h) / meta.w));
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 140 },
        children: [
          new ImageRun({
            type: meta.type,
            data: lhBuf,
            transformation: { width: targetW, height: targetH },
          }),
        ],
      }));
    } else {
      const sc = S.school || {};
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [run(sc.name || sc.en || 'OFFICIAL LETTERHEAD', { bold: true, size: 30, color: '1F3A5F' })],
      }));
      if (sc.subName) {
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 40 },
          children: [run(sc.subName, { bold: true, size: 22 })],
        }));
      }
      if (sc.addressEn) {
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 140 },
          border: { bottom: { color: '1F3A5F', space: 4, style: BorderStyle.SINGLE, size: 8 } },
          children: [run(sc.addressEn, { bold: true, size: 20 })],
        }));
      }
    }
  }

  // 2. Ref. No. & Date Table (2 columns, borderless)
  const refStr = `${L.ref}${letter.ref || '____________'}`;
  const dateStr = `${L.date}${Core.fmtDateDMY(letter.date)}`;
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 60, type: WidthType.PERCENTAGE },
            borders: NO_BORDERS,
            children: [new Paragraph({ children: [run(refStr, { bold: true, size: halfPts - 1 })] })],
          }),
          new TableCell({
            width: { size: 40, type: WidthType.PERCENTAGE },
            borders: NO_BORDERS,
            children: [new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [run(dateStr, { bold: true, size: halfPts - 1 })],
            })],
          }),
        ],
      }),
    ],
  }));

  if (S.showMajorHeadOnLetter || letter.subHead) {
    const mhObj = Core.getMajorHeadObj(db, letter.majorHead);
    const mhStr = [mhObj ? (isHi ? mhObj.hi : mhObj.en) : '', letter.subHead].filter(Boolean).join(' / ');
    if (mhStr) {
      children.push(new Paragraph({
        spacing: { before: 60, after: 80 },
        children: [run(`${isHi ? 'मद / संचिका: ' : 'Major Head / File: '}${mhStr}`, { size: halfPts - 3, color: '4B5563' })],
      }));
    }
  }

  children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));

  // 3. Recipient / Heading / Subject
  if (letter.layout === 'letter' && letter.to) {
    children.push(new Paragraph({
      spacing: { after: 40, line: lineSpacing },
      children: [run(L.to, { bold: true })],
    }));
    children.push(new Paragraph({
      spacing: { after: 180, line: lineSpacing },
      children: multilineRuns(letter.to),
    }));
  }

  if (letter.layout === 'notice' || letter.layout === 'cert') {
    if (letter.heading) {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 120, after: 160, line: lineSpacing },
        children: [run(cleanMarkers(letter.heading), {
          bold: true,
          size: halfPts + 6,
          underline: { type: UnderlineType.SINGLE },
        })],
      }));
    }
    if (letter.subject) {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 140, line: lineSpacing },
        children: multilineRuns(letter.subject, { bold: true }),
      }));
    }
    if (letter.layout === 'notice' && letter.to) {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 160, line: lineSpacing },
        children: multilineRuns(letter.to, { bold: true }),
      }));
    }
  } else if (letter.subject) {
    children.push(new Paragraph({
      spacing: { after: 180, line: lineSpacing },
      children: [run(L.subj, { bold: true }), ...multilineRuns(letter.subject, { bold: true })],
    }));
  }

  // 4. Salutation
  if (letter.layout === 'letter' && letter.salutation) {
    children.push(new Paragraph({
      spacing: { after: 120, line: lineSpacing },
      children: [run(cleanMarkers(letter.salutation))],
    }));
  }

  // 5. Body Paragraphs
  const paras = cleanMarkers(letter.body || '').split(/\n{2,}/);
  for (const p of paras) {
    if (!p.trim()) continue;
    children.push(new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 160, line: lineSpacing },
      children: multilineRuns(p.trim()),
    }));
  }

  // 6. Signatory & Stamp Block
  const sigAlign = S.sigAlign === 'left' ? AlignmentType.LEFT : AlignmentType.RIGHT;
  children.push(new Paragraph({ spacing: { before: 240 }, children: [] }));

  if (letter.layout === 'letter' && letter.closing) {
    children.push(new Paragraph({
      alignment: sigAlign,
      spacing: { after: 80, line: lineSpacing },
      children: [run(cleanMarkers(letter.closing))],
    }));
  }

  const stampBuf = letter.showSign && sg.stamp && resolveImageBuffer ? resolveImageBuffer(sg.stamp) : null;
  if (stampBuf) {
    const meta = detectImageMeta(stampBuf);
    const targetW = 185;
    const targetH = Math.max(45, Math.round((targetW * meta.h) / meta.w));
    children.push(new Paragraph({
      alignment: sigAlign,
      spacing: { after: 40 },
      children: [
        new ImageRun({
          type: meta.type,
          data: stampBuf,
          transformation: { width: targetW, height: targetH },
        }),
      ],
    }));
  } else {
    children.push(new Paragraph({ spacing: { before: 520 }, children: [] }));
  }

  const sigName = isHi ? (sg.nameHi || sg.name || '') : (sg.name || '');
  const sigDesig = isHi ? (sg.designationHi || sg.designation || '') : (sg.designation || '');
  const sigOrg = isHi ? (sg.orgHi || sg.org || '') : (sg.org || '');

  if (sigName) {
    children.push(new Paragraph({
      alignment: sigAlign,
      spacing: { after: 20 },
      children: [run(`(${sigName})`, { bold: true })],
    }));
  }
  if (sigDesig && !stampBuf) {
    children.push(new Paragraph({
      alignment: sigAlign,
      spacing: { after: 20 },
      children: [run(sigDesig)],
    }));
  }
  if (sigOrg && !stampBuf) {
    children.push(new Paragraph({
      alignment: sigAlign,
      spacing: { after: 80 },
      children: [run(sigOrg, { size: halfPts - 2 })],
    }));
  }

  // 7. Enclosures & Copy To
  if (letter.encl) {
    children.push(new Paragraph({
      spacing: { before: 200, after: 80, line: lineSpacing },
      children: [run(L.encl, { bold: true }), ...multilineRuns(letter.encl)],
    }));
  }
  if (letter.cc) {
    children.push(new Paragraph({
      spacing: { before: 120, after: 40, line: lineSpacing },
      children: [run(L.cc, { bold: true })],
    }));
    children.push(new Paragraph({
      spacing: { after: 80, line: lineSpacing },
      children: multilineRuns(letter.cc),
    }));
  }

  const pageBorders = letter.layout === 'cert' && !S.preprinted
    ? {
        pageBorderTop: { style: BorderStyle.DOUBLE, size: 12, space: 18, color: '1F3A5F' },
        pageBorderBottom: { style: BorderStyle.DOUBLE, size: 12, space: 18, color: '1F3A5F' },
        pageBorderLeft: { style: BorderStyle.DOUBLE, size: 12, space: 18, color: '1F3A5F' },
        pageBorderRight: { style: BorderStyle.DOUBLE, size: 12, space: 18, color: '1F3A5F' },
      }
    : undefined;

  const doc = new Document({
    creator: 'Letter Draft Assistant v2.0',
    title: letter.ref ? `Letter ${letter.ref}` : 'Draft Letter',
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4 in twips
            margin: { top: 794, bottom: 794, left: 964, right: 964 }, // ~14mm top/bottom, ~17mm left/right
            borders: pageBorders,
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

module.exports = {
  generateLetterDocxBuffer,
};
