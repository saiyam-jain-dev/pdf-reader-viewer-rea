import { createWorker } from 'tesseract.js';

let workerPromise = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker('eng');
      return worker;
    })();
  }
  return workerPromise;
}

/**
 * Performs client-side OCR on a canvas element or image data URL.
 * Returns text runs structured identically to PDF.js runs.
 */
export async function recognizePageText(canvas, viewport) {
  if (!canvas) return [];
  const worker = await getWorker();
  const { data } = await worker.recognize(canvas);

  const runs = [];
  const ratio = window.devicePixelRatio || 1;
  const zoom = viewport?.scale || 1;

  // Process recognized words/lines from OCR
  (data.words || []).forEach((word, index) => {
    const text = word.text?.trim();
    if (!text || word.confidence < 35) return;

    // word.bbox has { x0, y0, x1, y1 } in canvas pixel coordinates
    const left = word.bbox.x0 / ratio;
    const top = word.bbox.y0 / ratio;
    const width = (word.bbox.x1 - word.bbox.x0) / ratio;
    const height = (word.bbox.y1 - word.bbox.y0) / ratio;
    const size = Math.max(9, Math.round(height * 0.85));

    // Convert viewport points to PDF points
    const boxPdf = [[left, top], [left + width, top], [left, top + height], [left + width, top + height]]
      .map(([x, y]) => viewport ? viewport.convertToPdfPoint(x, y) : [x, y]);
    const pdfXs = boxPdf.map(([x]) => x);
    const pdfYs = boxPdf.map(([, y]) => y);

    runs.push({
      id: `ocr-${Date.now()}-${index}`,
      text,
      x: left,
      y: top,
      width,
      height,
      size,
      fontName: 'OCR Detected',
      family: 'Arial, sans-serif',
      cssFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
      pdfFamily: 'Helvetica',
      bold: word.is_bold || false,
      italic: false,
      baselineOffset: height * 0.82,
      angle: 0,
      direction: 'ltr',
      pdfX: Math.min(...pdfXs),
      pdfY: Math.min(...pdfYs),
      pdfWidth: Math.max(...pdfXs) - Math.min(...pdfXs),
      pdfHeight: Math.max(...pdfYs) - Math.min(...pdfYs),
      baselineX: Math.min(...pdfXs),
      baselineY: Math.min(...pdfYs) + size * 0.2,
      isOcr: true,
    });
  });

  return runs;
}
