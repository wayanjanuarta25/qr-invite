const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');
const QRCode = require('qrcode');
const fontkit = require('fontkit');

const fontPath = path.join(__dirname, '../assets/fonts/Alice-Regular.ttf');
let font = null;
if (fs.existsSync(fontPath)) {
  try {
    font = fontkit.openSync(fontPath);
  } catch (e) {
    console.error('Failed to load Alice font:', e);
  }
}

const templatePath = path.join(__dirname, '../assets/templates/Template_Undangan_HUT_SS_2026.pdf');

/**
 * Clean & crop zero-border around QR code modules (like qr-crop-app)
 */
async function cropQrCodeBuffer(rawQrBuffer) {
  const { data, info } = await sharp(rawQrBuffer).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let minX = width, minY = height, maxX = 0, maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      if (lum < 128) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (minX > maxX || minY > maxY) {
    return rawQrBuffer;
  }

  return await sharp(rawQrBuffer)
    .extract({
      left: minX,
      top: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1
    })
    .png()
    .toBuffer();
}

/**
 * Split name into 1 or 2 lines fitting within maxWidth points
 */
function fitNameToLines(name, maxW = 500) {
  if (!font) {
    return { lines: [name.trim()], fontSize: 31 };
  }
  const getWidth = (str, sz) => (font.layout(str).advanceWidth / font.unitsPerEm) * sz;
  const words = name.trim().split(/\s+/);

  let sz = 31;
  while (sz >= 16) {
    if (getWidth(name, sz) <= maxW) {
      return { lines: [name.trim()], fontSize: sz };
    }
    let bestSplit = null;
    let bestDiff = Infinity;
    for (let i = 1; i < words.length; i++) {
      const l1 = words.slice(0, i).join(' ');
      const l2 = words.slice(i).join(' ');
      const w1 = getWidth(l1, sz);
      const w2 = getWidth(l2, sz);
      if (w1 <= maxW && w2 <= maxW) {
        const diff = Math.abs(w1 - w2);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestSplit = [l1, l2];
        }
      }
    }
    if (bestSplit) {
      return { lines: bestSplit, fontSize: sz };
    }
    sz -= 1;
  }
  return { lines: [name.trim()], fontSize: sz };
}

/**
 * Render guest name with Alice font, gradient -180 deg (#fff6de -> #ead296)
 */
async function renderNameVectorImage(lines, fontSize = 31, lineHeightMul = 1.09) {
  if (!font) {
    const textSvg = '<svg width="600" height="100" xmlns="http://www.w3.org/2000/svg"><text x="300" y="50" font-size="' + fontSize + '" fill="#FFF6DE" text-anchor="middle">' + lines.join(' ') + '</text></svg>';
    const buf = await sharp(Buffer.from(textSvg)).png().toBuffer();
    return { buffer: buf, width: 600, height: 100 };
  }

  const lineH = fontSize * lineHeightMul;
  const ascent = (font.ascent / font.unitsPerEm) * fontSize;
  const descent = Math.abs((font.descent / font.unitsPerEm) * fontSize);
  const totalH = (lines.length - 1) * lineH + (ascent + descent);

  const lineAdvances = lines.map(l => (font.layout(l).advanceWidth / font.unitsPerEm) * fontSize);
  const maxLineW = Math.max(...lineAdvances, 10);
  const totalW = Math.ceil(maxLineW) + 20;

  const allPaths = [];
  lines.forEach((lineText, lineIdx) => {
    const run = font.layout(lineText);
    const lineW = (run.advanceWidth / font.unitsPerEm) * fontSize;
    let startX = (totalW - lineW) / 2;
    const baselineY = 10 + ascent + (lineIdx * lineH);

    for (let i = 0; i < run.glyphs.length; i++) {
      const glyph = run.glyphs[i];
      const pos = run.positions[i];
      const p = glyph.path.toSVG();
      if (p) {
        const scale = fontSize / font.unitsPerEm;
        const gx = startX + (pos.xOffset * scale);
        const gy = baselineY;
        allPaths.push('<path d="' + p + '" transform="translate(' + gx + ', ' + gy + ') scale(' + scale + ', -' + scale + ')" />');
      }
      startX += (pos.xAdvance / font.unitsPerEm) * fontSize;
    }
  });

  const svgH = Math.ceil(totalH) + 20;
  const svg = '<svg width="' + totalW + '" height="' + svgH + '" viewBox="0 0 ' + totalW + ' ' + svgH + '" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gold" x1="0" y1="0" x2="0" y2="100%"><stop offset="0%" stop-color="#fff6de"/><stop offset="100%" stop-color="#ead296"/></linearGradient></defs><g fill="url(#gold)">' + allPaths.join('') + '</g></svg>';

  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return { buffer, width: totalW, height: svgH };
}

/**
 * Generate 3-page Invitation PDF for a guest
 */
async function generateInvitationPdf(guest, checkUrl) {
  if (!fs.existsSync(templatePath)) {
    throw new Error('File template undangan tidak ditemukan di server.');
  }

  const templateBytes = fs.readFileSync(templatePath);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const page1 = pdfDoc.getPages()[0];
  const { width: pW, height: pH } = page1.getSize();

  // 1. Generate & crop QR code
  const rawQrBuffer = await QRCode.toBuffer(checkUrl, {
    errorCorrectionLevel: 'H',
    margin: 4,
    width: 600,
    color: { dark: '#000000', light: '#FFFFFF' }
  });
  const croppedQrBuffer = await cropQrCodeBuffer(rawQrBuffer);

  const qrX = (726887 / 18288000) * pW;
  const qrW = (1834988 / 18288000) * pW;
  const qrH = (1829073 / 10287000) * pH;
  const qrY = ((10287000 - (7914371 + 1829073)) / 10287000) * pH;

  const embeddedQr = await pdfDoc.embedPng(croppedQrBuffer);
  page1.drawImage(embeddedQr, { x: qrX, y: qrY, width: qrW, height: qrH });

  // 2. Render Name with Alice font & gold gradient
  const maxAllowedWidth = 520;
  const fit = fitNameToLines(guest.name, maxAllowedWidth);
  const nameImg = await renderNameVectorImage(fit.lines, fit.fontSize, 1.09);
  const embeddedName = await pdfDoc.embedPng(nameImg.buffer);

  const namePdfX = (pW - nameImg.width) / 2;
  const nameCenterY = ((10287000 - (8594916 + 443357 / 2)) / 10287000) * pH;
  const namePdfY = nameCenterY - (nameImg.height / 2);

  page1.drawImage(embeddedName, {
    x: namePdfX,
    y: namePdfY,
    width: nameImg.width,
    height: nameImg.height
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

module.exports = {
  generateInvitationPdf,
  cropQrCodeBuffer
};
