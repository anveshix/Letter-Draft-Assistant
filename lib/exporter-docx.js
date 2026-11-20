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
  en: { to: 'To,', subj: 'Subject:', ref: 'Ref. No.:', date: 'Date:', encl: 'Enclosure(s):', cc: 'Copy forwarded to:', head: 'Major Head / File:' },
  hi: { to: 'सेवा में,', subj: 'विषय:', ref: 'पत्रांक:', date: 'दिनांक:', encl: 'संलग्नक:', cc: 'प्रतिलिपि सूचनार्थ एवं आवश्यक कार्यार्थ:', head: 'मद / संचिका:' },
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

function makeFontSpec(isHi) {
  return {
    ascii: 'Times New Roman',
    hAnsi: 'Times New Roman',
    cs: isHi ? 'Nirmala UI' : 'Mangal',
    eastAsia: 'Nirmala UI',
  };
}

function tr(text, opts = {}) {
  const halfPts = Math.round((opts.pt || 12) * 2);
  return new TextRun({
    text: String(text || ''),
    bold: !!opts.bold,
    italics: !!opts.italic,
    underline: opts.underline ? { type: UnderlineType.SINGLE } : undefined,
    size: halfPts,
    sizeCs: halfPts,
    color: opts.color || '000000',
    font: makeFontSpec(opts.isHi),
  });
}

function multilineRuns(text, opts = {}) {
  const lines = cleanMarkers(text).split('\n');
  const runs = [];
  lines.forEach((ln, idx) => {
    if (idx > 0) runs.push(new TextRun({ break: 1 }));
    runs.push(tr(ln, opts));
  });
  return runs;
}

function readImageDimensions(buf) {
  if (!buf || buf.length < 24) return { w: 600, h: 140, type: 'png' };
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { w: buf.readUInt32BE(16) || 600, h: buf.readUInt32BE(20) || 140, type: 'png' };
  }
  return { w: 600, h: 150, type: 'jpg' };
}

async function generateLetterDocxBuffer(db, letter, resolveImageBuffer, opts = {}) {
  const S = db.settings;
  const isHi = letter.lang === 'hi';
  const L = LBL[isHi ? 'hi' : 'en'];
  const sg = (S.signatories || []).find(x => x.id === letter.sig) || (S.signatories || [])[0] || {};
  const pt = Math.max(10, Math.min(16, Number(S.fontPt) || 12));

  const children = [];

  // 1. Header / Letterhead
  if (S.preprinted) {
    const spacerTwips = Math.round((Number(S.topMm) || 48) * 56.6929);
    children.push(new Paragraph({ spacing: { before: spacerTwips, after: 80 }, children: [tr('', { pt, isHi })] }));
  } else {
    const lhBuf = resolveImageBuffer ? resolveImageBuffer(S.letterhead) : null;
    if (lhBuf) {
      const dim = readImageDimensions(lhBuf);
      const targetW = 640;
      const targetH = Math.max(70, Math.round((targetW * dim.h) / (dim.w || 600)));
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 140 },
          children: [
            new ImageRun({
              data: lhBuf,
              type: dim.type,
              transformation: { width: targetW, height: targetH },
            }),
          ],
        })
      );
    } else {
      const sc = S.school || {};
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 40 },
          children: [tr(sc.name || sc.en || 'OFFICIAL LETTERHEAD', { pt: pt + 3, bold: true, color: '1F3A5F', isHi })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 40 },
          children: [tr(sc.subName || '', { pt: pt - 0.5, bold: true, isHi })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: '1F3A5F' } },
          spacing: { after: 160 },
          children: [
            tr(`CBSE Affiliation: ${sc.cbseAff || ''}  |  U-DISE: ${sc.udise || ''}  |  ${sc.addressEn || ''}`, { pt: pt - 2, color: '374151', isHi }),
          ],
        })
      );
    }
  }

  // 2. Ref. No. & Date Table
  const refStr = `${L.ref} ${letter.ref || '________ (Draft)'}`;
  const dateStr = `${L.date} ${Core.fmtDateDMY(letter.date)}`;
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: NO_BORDERS,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 60, type: WidthType.PERCENTAGE },
              borders: NO_BORDERS,
              children: [new Paragraph({ children: [tr(refStr, { pt, bold: true, isHi })] })],
            }),
            new TableCell({
              width: { size: 40, type: WidthType.PERCENTAGE },
              borders: NO_BORDERS,
              children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [tr(dateStr, { pt, bold: true, isHi })] })],
            }),
          ],
        }),
      ],
    })
  );

  if (S.showMajorHeadOnLetter || letter.subHead) {
    const mh = Core.getMajorHeadObj(db, letter.majorHead);
    const mhStr = [mh ? (isHi ? mh.hi : mh.en) : '', letter.subHead].filter(Boolean).join(' / ');
    if (mhStr) {
      children.push(
        new Paragraph({
          spacing: { before: 60, after: 80 },
          children: [tr(`${L.head} ${mhStr}`, { pt: pt - 1.5, color: '374151', isHi })],
        })
      );
    }
  }

  children.push(new Paragraph({ spacing: { after: 100 }, children: [] }));

  // 3. Recipient / Heading / Subject
  if (letter.layout === 'letter' && letter.to) {
    children.push(
      new Paragraph({ spacing: { after: 40 }, children: [tr(L.to, { pt, bold: true, isHi })] }),
      new Paragraph({ spacing: { after: 160, line: 300 }, children: multilineRuns(letter.to, { pt, isHi }) })
    );
  }

  if (letter.layout === 'notice' || letter.layout === 'cert') {
    if (letter.heading) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 80, after: 140 },
          children: [tr(cleanMarkers(letter.heading), { pt: pt + 3, bold: true, underline: true, isHi })],
        })
      );
    }
    if (letter.subject) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 140 },
          children: [tr(cleanMarkers(letter.subject), { pt: pt + 0.5, bold: true, isHi })],
        })
      );
    }
    if (letter.layout === 'notice' && letter.to) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 140 },
          children: multilineRuns(letter.to, { pt, bold: true, isHi }),
        })
      );
    }
  } else if (letter.subject) {
    children.push(
      new Paragraph({
        spacing: { after: 160, line: 300 },
        children: [
          tr(`${L.subj} `, { pt, bold: true, isHi }),
          tr(cleanMarkers(letter.subject), { pt, bold: true, isHi }),
        ],
      })
    );
  }

  // 4. Salutation
  if (letter.layout === 'letter' && letter.salutation) {
    children.push(
      new Paragraph({
        spacing: { after: 100 },
        children: [tr(cleanMarkers(letter.salutation), { pt, isHi })],
      })
    );
  }

  // 5. Body Paragraphs
  const paragraphs = cleanMarkers(letter.body || '').split(/\n{2,}/);
  for (const p of paragraphs) {
    if (!p.trim()) continue;
    children.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 160, line: isHi ? 340 : 300 },
        children: multilineRuns(p.trim(), { pt, isHi }),
      })
    );
  }

  // 6. Signatory + Optional QR Verification Row
  const sigParagraphs = [];
  const sigAlign = S.sigAlign === 'left' ? AlignmentType.LEFT : AlignmentType.CENTER;
  if (letter.layout === 'letter' && letter.closing) {
    sigParagraphs.push(
      new Paragraph({ alignment: sigAlign, spacing: { before: 120, after: 60 }, children: [tr(cleanMarkers(letter.closing), { pt, isHi })] })
    );
  }

  const chosenStamp = letter.customStamp || sg.stamp;
  const stampBuf = (letter.showSign || letter.customStamp) && chosenStamp && resolveImageBuffer
    ? resolveImageBuffer(chosenStamp)
    : null;

  if (stampBuf) {
    const dim = readImageDimensions(stampBuf);
    const sw = 150;
    const sh = Math.max(45, Math.round((sw * dim.h) / (dim.w || 220)));
    sigParagraphs.push(
      new Paragraph({
        alignment: sigAlign,
        spacing: { before: 40, after: 40 },
        children: [
          new ImageRun({
            data: stampBuf,
            type: dim.type,
            transformation: { width: sw, height: sh },
          }),
        ],
      })
    );
  } else {
    sigParagraphs.push(new Paragraph({ spacing: { before: 520, after: 60 }, children: [] }));
  }

  const sigName = isHi ? (sg.nameHi || sg.name || '') : (sg.name || '');
  const sigDesig = isHi ? (sg.designationHi || sg.designation || '') : (sg.designation || '');
  const sigOrg = isHi ? (sg.orgHi || sg.org || '') : (sg.org || '');

  if (sigName) {
    sigParagraphs.push(new Paragraph({ alignment: sigAlign, children: [tr(`(${sigName})`, { pt, bold: true, isHi })] }));
  }
  if (sigDesig && (!stampBuf || letter.customStamp)) {
    sigParagraphs.push(new Paragraph({ alignment: sigAlign, children: [tr(sigDesig, { pt: pt - 0.5, isHi })] }));
  }
  if (sigOrg && (!stampBuf || letter.customStamp)) {
    sigParagraphs.push(new Paragraph({ alignment: sigAlign, children: [tr(sigOrg, { pt: pt - 1, isHi })] }));
  }

  const qrParagraphs = [];
  if (letter.showQr !== false && letter.ref && opts.qrBuffer) {
    qrParagraphs.push(
      new Paragraph({
        spacing: { before: 120, after: 30 },
        children: [
          new ImageRun({
            data: opts.qrBuffer,
            type: 'png',
            transformation: { width: 80, height: 80 },
          }),
        ],
      }),
      new Paragraph({
        children: [tr(isHi ? 'सत्यापित दस्तावेज़ (QR स्कैन करें)' : 'Verified Official Document', { pt: 8, bold: true, color: '162D4C', isHi })],
      }),
      new Paragraph({
        children: [tr(opts.verifyCode ? `Code: ${opts.verifyCode}` : '', { pt: 7.5, color: '475569', isHi })],
      })
    );
  } else {
    qrParagraphs.push(new Paragraph({ children: [] }));
  }

  const leftCellChildren = S.sigAlign === 'left' ? sigParagraphs : qrParagraphs;
  const rightCellChildren = S.sigAlign === 'left' ? qrParagraphs : sigParagraphs;

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: NO_BORDERS,
      rows: [
        new TableRow({
          children: [
            new TableCell({ width: { size: 52, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, children: leftCellChildren }),
            new TableCell({ width: { size: 48, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, children: rightCellChildren }),
          ],
        }),
      ],
    })
  );

  // 7. Enclosures & CC
  if (letter.encl) {
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 80 },
        children: [
          tr(`${L.encl} `, { pt: pt - 0.5, bold: true, isHi }),
          ...multilineRuns(letter.encl, { pt: pt - 0.5, isHi }),
        ],
      })
    );
  }
  if (letter.cc) {
    children.push(
      new Paragraph({ spacing: { before: 140, after: 40 }, children: [tr(L.cc, { pt: pt - 0.5, bold: true, isHi })] }),
      new Paragraph({ spacing: { after: 80, line: 280 }, children: multilineRuns(letter.cc, { pt: pt - 0.5, isHi }) })
    );
  }

  const doc = new Document({
    creator: 'Letter Draft Assistant v3.0',
    title: `${letter.ref ? 'Letter ' + letter.ref : 'Draft Letter'}`,
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 900, bottom: 720, left: 900 },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

module.exports = { generateLetterDocxBuffer };
