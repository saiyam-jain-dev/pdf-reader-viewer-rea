import * as pdfjs from 'pdfjs-dist/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument, PDFString, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export async function openPdf(file) {
  if (!file || !file.name.toLowerCase().endsWith('.pdf')) throw new Error('Choose a PDF document.');
  const bytes = await file.arrayBuffer();
  // PDF.js may transfer/detach the ArrayBuffer passed as `data`. Keep the original
  // bytes intact because pdf-lib needs them later when the user exports edits.
  const document = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
  return { document, bytes, name: file.name };
}

export async function createBlankPdf() {
  const document = await PDFDocument.create();
  document.addPage([612, 792]);
  const bytes = await document.save();
  const file = new File([bytes], 'untitled.pdf', { type: 'application/pdf' });
  return openPdf(file);
}

function mergeAdjacentRuns(items) {
  if (!items || !items.length) return [];
  const merged = [];
  let current = null;

  for (const item of items) {
    if (!item.str) continue;
    if (!current) {
      current = { ...item };
      continue;
    }

    const [a1, b1, , , e1, f1] = current.transform;
    const [a2, b2, , , e2, f2] = item.transform;
    const sameFont = current.fontName === item.fontName;
    const sameBaseline = Math.abs(f1 - f2) < 1.2;
    const sameScale = Math.abs(a1 - a2) < 0.1 && Math.abs(b1 - b2) < 0.1;

    const prevEndX = e1 + (current.width || 0);
    const curStartX = e2;
    const gap = curStartX - prevEndX;
    const fontSize = Math.hypot(a1, b1) || current.height || 10;
    const isAdjacent = gap >= -2.0 && gap <= Math.max(8, fontSize * 0.65);

    if (sameFont && sameBaseline && sameScale && isAdjacent) {
      const needsSpace = gap > fontSize * 0.18 && !current.str.endsWith(' ') && !item.str.startsWith(' ');
      current.str = current.str + (needsSpace ? ' ' : '') + item.str;
      current.width = (e2 + (item.width || 0)) - e1;
      current.height = Math.max(current.height || 0, item.height || 0);
    } else {
      merged.push(current);
      current = { ...item };
    }
  }

  if (current) merged.push(current);
  return merged;
}

export function resolveFontFamily(fontName, styleObj = {}) {
  const combined = `${fontName || ''} ${styleObj.name || ''} ${styleObj.fontFamily || ''}`.toLowerCase();
  if (/courier|consolas|mono|typewriter|menlo/.test(combined)) {
    return { pdfFamily: 'Courier', cssFamily: '"Courier New", Courier, monospace' };
  }
  if (/times|georgia|garamond|cambria|palatino|minion/.test(combined) || (combined.includes('serif') && !combined.includes('sans'))) {
    return { pdfFamily: 'TimesRoman', cssFamily: '"Times New Roman", Times, Georgia, serif' };
  }
  if (/calibri/.test(combined)) {
    return { pdfFamily: 'Helvetica', cssFamily: 'Calibri, "Segoe UI", Arial, sans-serif' };
  }
  if (/segoe/.test(combined)) {
    return { pdfFamily: 'Helvetica', cssFamily: '"Segoe UI", Arial, sans-serif' };
  }
  if (/verdana/.test(combined)) {
    return { pdfFamily: 'Helvetica', cssFamily: 'Verdana, Arial, sans-serif' };
  }
  if (/roboto/.test(combined)) {
    return { pdfFamily: 'Helvetica', cssFamily: 'Roboto, "Helvetica Neue", Arial, sans-serif' };
  }
  return { pdfFamily: 'Helvetica', cssFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif' };
}

export async function readTextRuns(page, viewport) {
  const content = await page.getTextContent({ normalizeWhitespace: true });
  const rawItems = (content.items || []).filter((item) => item.str?.trim());
  const groupedItems = mergeAdjacentRuns(rawItems);

  return groupedItems.map((item, id) => {
    const [a, b, , , e, f] = item.transform;
    const size = Math.hypot(a, b) || item.height || 10;
    const x1 = e;
    const y1 = f;
    const x2 = e + item.width;
    const y2 = f + item.height;
    const corners = [[x1, y1], [x1, y2], [x2, y1], [x2, y2]]
      .map(([x, y]) => viewport.convertToViewportPoint(x, y));
    const xs = corners.map(([x]) => x);
    const ys = corners.map(([, y]) => y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const width = Math.max(...xs) - left;
    const height = Math.max(...ys) - top;
    const style = content.styles?.[item.fontName] || {};
    const fontName = item.fontName || 'Unknown font';
    const { pdfFamily, cssFamily } = resolveFontFamily(fontName, style);
    const signature = `${fontName} ${style.fontFamily || ''} ${style.fontName || ''} ${style.name || ''}`.toLowerCase();
    const boxPdf = [[left, top], [left + width, top], [left, top + height], [left + width, top + height]]
      .map(([x, y]) => viewport.convertToPdfPoint(x, y));
    const pdfXs = boxPdf.map(([x]) => x);
    const pdfYs = boxPdf.map(([, y]) => y);
    const baselineA = viewport.convertToViewportPoint(x1, y1);
    const baselineB = viewport.convertToViewportPoint(x1 + a, y1 + b);
    const baselineOffset = (baselineA[1] - top) / (viewport.scale || 1);

    return {
      id,
      text: item.str,
      x: left,
      y: top,
      width,
      height,
      size,
      fontName,
      family: cssFamily,
      cssFamily,
      pdfFamily,
      baselineOffset,
      bold: /bold|black|heavy|demi/.test(signature) || Number(style.fontWeight) >= 600,
      italic: /italic|oblique/.test(signature),
      direction: item.dir || 'ltr',
      ascent: style.ascent,
      descent: style.descent,
      angle: Math.atan2(baselineB[1] - baselineA[1], baselineB[0] - baselineA[0]) * 180 / Math.PI,
      pdfX: Math.min(...pdfXs) - 0.5,
      pdfY: Math.min(...pdfYs) - 0.5,
      pdfWidth: Math.max(...pdfXs) - Math.min(...pdfXs) + 1,
      pdfHeight: Math.max(...pdfYs) - Math.min(...pdfYs) + 1,
      baselineX: x1,
      baselineY: y1,
    };
  });
}

export function standardFontFamily(run) {
  if (run?.pdfFamily) return run.pdfFamily;
  const raw = `${run?.family || ''} ${run?.fontName || ''}`.toLowerCase();
  if (/courier|mono|consolas|typewriter/.test(raw)) return 'Courier';
  if (/times|serif|georgia|garamond|cambria/.test(raw) && !/sans/.test(raw)) return 'TimesRoman';
  return 'Helvetica';
}

function colorFromHex(hex) {
  const clean = (hex || '#111111').replace('#', '').trim();
  let r = 0.1, g = 0.1, b = 0.1;
  if (clean.length === 6) {
    r = parseInt(clean.slice(0, 2), 16) / 255;
    g = parseInt(clean.slice(2, 4), 16) / 255;
    b = parseInt(clean.slice(4, 6), 16) / 255;
  } else if (clean.length === 3) {
    r = parseInt(clean[0] + clean[0], 16) / 255;
    g = parseInt(clean[1] + clean[1], 16) / 255;
    b = parseInt(clean[2] + clean[2], 16) / 255;
  }
  return rgb(isNaN(r) ? 0.1 : r, isNaN(g) ? 0.1 : g, isNaN(b) ? 0.1 : b);
}

function pdfFontName(family, bold, italic) {
  if (bold && italic) return family === 'Helvetica' ? 'HelveticaBoldOblique' : family === 'TimesRoman' ? 'TimesRomanBoldItalic' : 'CourierBoldOblique';
  if (bold) return family === 'Helvetica' ? 'HelveticaBold' : family === 'TimesRoman' ? 'TimesRomanBold' : 'CourierBold';
  if (italic) return family === 'Helvetica' ? 'HelveticaOblique' : family === 'TimesRoman' ? 'TimesRomanItalic' : 'CourierOblique';
  return family;
}

function dataUrlBytes(url) {
  return Uint8Array.from(atob(url.split(',')[1]), (char) => char.charCodeAt(0));
}

export async function exportPdf(bytes, fileName, marksByPage) {
  const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const output = await PDFDocument.create();
  output.registerFontkit(fontkit);

  // Copy all original pages directly to preserve 100% vector fidelity, metadata, and sharp text
  const copiedPages = await output.copyPages(source, source.getPageIndices());
  copiedPages.forEach((page) => output.addPage(page));
  const outputPages = output.getPages();

  const fontCache = new Map();
  const getFont = async (family, bold, italic) => {
    const key = pdfFontName(family || 'Helvetica', bold, italic);
    if (!fontCache.has(key)) {
      fontCache.set(key, await output.embedFont(StandardFonts[key] || StandardFonts.Helvetica));
    }
    return fontCache.get(key);
  };

  for (const [pageNumber, marks] of marksByPage) {
    const page = outputPages[pageNumber - 1];
    if (!page) continue;
    const pageHeight = page.getHeight();
    const pageWidth = page.getWidth();

    for (const mark of marks) {
      const ink = colorFromHex(mark.color);

      if (mark.type === 'replace') {
        const font = await getFont(mark.fontFamily || 'Helvetica', mark.bold, mark.italic);
        const size = mark.fontSize || 12;
        const text = mark.text || '';
        const textWidth = text ? font.widthOfTextAtSize(text, size) : 0;

        // Position coordinates in PDF space (origin bottom-left)
        const coverX = mark.pdfX !== undefined ? mark.pdfX : mark.x;
        const coverY = mark.pdfY !== undefined ? mark.pdfY : (pageHeight - mark.y - (mark.height || size));
        const coverW = Math.max(mark.pdfWidth || mark.width || 0, textWidth + 4);
        const coverH = Math.max(mark.pdfHeight || mark.height || size, size * 1.25);

        // Vector mask to cover the old text seamlessly without rasterizing the page
        page.drawRectangle({
          x: Math.max(0, coverX - 1),
          y: Math.max(0, coverY - 1),
          width: coverW + 2,
          height: coverH + 2,
          color: mark.background ? colorFromHex(mark.background) : rgb(1, 1, 1),
          borderWidth: 0,
        });

        // Draw crisp replacement vector text
        if (text.trim()) {
          const textX = mark.baselineX !== undefined ? mark.baselineX : coverX;
          const textY = mark.baselineY !== undefined ? mark.baselineY : (coverY + size * 0.2);
          page.drawText(text, {
            x: textX,
            y: textY,
            size,
            font,
            color: ink,
          });
        }
      }

      if (mark.type === 'highlight') {
        page.drawRectangle({
          x: mark.x,
          y: pageHeight - mark.y - mark.height,
          width: mark.width,
          height: mark.height,
          color: rgb(0.97, 0.79, 0.22),
          opacity: 0.36,
          borderWidth: 0,
        });
      }

      if (mark.type === 'whiteout') {
        page.drawRectangle({
          x: mark.x,
          y: pageHeight - mark.y - mark.height,
          width: mark.width,
          height: mark.height,
          color: rgb(1, 1, 1),
          borderWidth: 0,
        });
      }

      if (['text', 'signature'].includes(mark.type) && mark.text) {
        const font = await getFont(mark.type === 'signature' ? 'TimesRoman' : (mark.fontFamily || 'Helvetica'), mark.bold, mark.type === 'signature' ? true : mark.italic);
        const size = mark.fontSize || 12;
        const x = mark.x;
        const y = pageHeight - mark.y - size * 0.85;
        const options = { x, y, size, font, color: ink, lineHeight: size * 1.2 };
        options.maxWidth = Math.max(1, mark.width || pageWidth - x);
        page.drawText(mark.text, options);
      }

      if (mark.type === 'draw' && mark.points?.length > 1) {
        for (let index = 1; index < mark.points.length; index += 1) {
          const from = mark.points[index - 1];
          const to = mark.points[index];
          page.drawLine({
            start: { x: from.x, y: pageHeight - from.y },
            end: { x: to.x, y: pageHeight - to.y },
            thickness: mark.lineWidth || 1.8,
            color: ink,
          });
        }
      }

      if (mark.type === 'rectangle') {
        page.drawRectangle({
          x: mark.x,
          y: pageHeight - mark.y - mark.height,
          width: mark.width,
          height: mark.height,
          borderColor: ink,
          borderWidth: 1.5,
        });
      }

      if (mark.type === 'ellipse') {
        page.drawEllipse({
          x: mark.x + mark.width / 2,
          y: pageHeight - mark.y - mark.height / 2,
          xScale: Math.abs(mark.width / 2),
          yScale: Math.abs(mark.height / 2),
          borderColor: ink,
          borderWidth: 1.5,
        });
      }

      if (mark.type === 'strike') {
        page.drawLine({
          start: { x: mark.x, y: pageHeight - mark.y - mark.height * 0.5 },
          end: { x: mark.x + mark.width, y: pageHeight - mark.y - mark.height * 0.5 },
          thickness: 1.8,
          color: ink,
        });
      }

      if (mark.type === 'line') {
        page.drawLine({
          start: { x: mark.x, y: pageHeight - mark.y },
          end: { x: mark.x + mark.width, y: pageHeight - mark.y - mark.height },
          thickness: 1.5,
          color: ink,
        });
      }

      if (mark.type === 'image' && mark.data) {
        const data = dataUrlBytes(mark.data);
        const image = mark.data.startsWith('data:image/png') ? await output.embedPng(data) : await output.embedJpg(data);
        page.drawImage(image, {
          x: mark.x,
          y: pageHeight - mark.y - mark.height,
          width: mark.width,
          height: mark.height,
        });
      }

      if (mark.type === 'link' && mark.url) {
        const ref = output.context.register(output.context.obj({
          Type: 'Annot',
          Subtype: 'Link',
          Rect: [mark.x, pageHeight - mark.y - mark.height, mark.x + mark.width, pageHeight - mark.y],
          Border: [0, 0, 0],
          A: { Type: 'Action', S: 'URI', URI: PDFString.of(mark.url) }
        }));
        page.node.addAnnot(ref);
      }

      if (mark.type === 'field') {
        const form = output.getForm();
        const bounds = {
          x: mark.x,
          y: pageHeight - mark.y - mark.height,
          width: mark.width,
          height: mark.height,
          borderWidth: 1,
          borderColor: rgb(0.4, 0.55, 0.45)
        };
        if (mark.fieldType === 'checkbox') form.createCheckBox(mark.name).addToPage(page, bounds);
        else if (mark.fieldType === 'radio') form.createRadioGroup(mark.name).addOptionToPage('Option', page, bounds);
        else if (mark.fieldType === 'dropdown') {
          const field = form.createDropdown(mark.name);
          field.addOptions(['Option 1', 'Option 2']);
          field.select('Option 1');
          field.addToPage(page, bounds);
        } else {
          const field = form.createTextField(mark.name);
          if (mark.value) field.setText(mark.value);
          field.addToPage(page, bounds);
        }
      }
    }
  }

  if ([...marksByPage.values()].flat().some((mark) => mark.type === 'field')) {
    const formFont = await getFont('Helvetica', false, false);
    output.getForm().updateFieldAppearances(formFont);
  }

  const editedBytes = await output.save();
  const baseName = fileName.replace(/\.pdf$/i, '');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([editedBytes], { type: 'application/pdf' }));
  link.download = `${baseName}-edited.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1500);
}
