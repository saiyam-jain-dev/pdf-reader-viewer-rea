import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageThumbnail } from './components/PageThumbnail.jsx';
import { PdfPage } from './components/PdfPage.jsx';
import { Toolbar } from './components/Toolbar.jsx';
import { exportPdf, standardFontFamily } from './lib/pdfEngine.js';
import { usePdfDocument } from './hooks/usePdfDocument.js';
import { recognizePageText } from './lib/ocrEngine.js';
import { FolderOpen, Download, FileText } from 'lucide-react';

const initialControls = { size: 12, fontFamily: 'Helvetica', bold: false, italic: false, color: '#273b30', imageSize: 140, fieldType: 'text', fieldName: 'field', fieldValue: '', linkUrl: 'https://example.com' };
const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function downloadBlob(bytes, name) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1500);
}

export default function App() {
  const { documentState, busy, error, openFile, openBlank } = usePdfDocument();
  const [marks, setMarks] = useState(() => new Map());
  const marksRef = useRef(marks);
  const [textRuns, setTextRuns] = useState(() => new Map());
  const [activeText, setActiveText] = useState(null);
  const activeTextRef = useRef(null);
  const [controls, setControls] = useState(initialControls);
  const controlsRef = useRef(controls);
  const [savedTextStyle, setSavedTextStyle] = useState({
    size: 12,
    fontFamily: 'Helvetica',
    cssFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
    bold: false,
    italic: false,
    color: '#111111',
  });
  const savedTextStyleRef = useRef(savedTextStyle);
  const [mode, setMode] = useState('select');
  const [selectedId, setSelectedId] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [image, setImage] = useState(null);
  const [signatureText, setSignatureText] = useState('');
  const [signatureDraft, setSignatureDraft] = useState('');
  const [signatureDialog, setSignatureDialog] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [status, setStatus] = useState('Ready when you are');
  const [ocrBusy, setOcrBusy] = useState(false);
  const viewerRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);

  const pageCount = documentState?.document.numPages || 0;
  const allMarks = useMemo(() => [...marks.values()].flat(), [marks]);
  const currentMarks = marks.get(pageNumber) || [];

  useEffect(() => {
    marksRef.current = marks;
  }, [marks]);
  useEffect(() => { controlsRef.current = controls; }, [controls]);
  useEffect(() => {
    if (!documentState) return;
    setMarks(new Map()); marksRef.current = new Map();
    setTextRuns(new Map()); setActiveText(null); activeTextRef.current = null;
    setSelectedId(null); setPageNumber(1); setZoom(1); setMode('select');
  }, [documentState]);
  useEffect(() => {
    const toastListener = (event) => { setToast(event.detail); setTimeout(() => setToast(''), 2400); };
    const signListener = (event) => {
      if (signatureText) {
        const markId = makeId();
        addMark(event.detail.pageNumber, {
          id: markId,
          type: 'signature',
          ...event.detail.point,
          width: 180,
          height: 48,
          fontSize: Math.max(18, controlsRef.current.size * 2),
          text: signatureText,
          color: controlsRef.current.color,
          fontFamily: 'Helvetica',
          italic: true,
          sourceFamily: 'cursive',
        });
        setSelectedId(markId);
        changeMode('select');
        notify('Signature placed! Click and drag to reposition.');
      } else {
        setSignatureDraft('');
        setSignatureDialog(true);
      }
    };
    window.addEventListener('paper-toast', toastListener);
    window.addEventListener('paper-signature-place', signListener);
    return () => { window.removeEventListener('paper-toast', toastListener); window.removeEventListener('paper-signature-place', signListener); };
  }, [signatureText]);

  useEffect(() => {
    function handleKeyDown(event) {
      const tag = event.target?.tagName?.toLowerCase();
      const isInput = tag === 'input' || tag === 'textarea' || event.target?.isContentEditable;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        if (!isInput) {
          event.preventDefault();
          undo();
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setFindOpen((prev) => !prev);
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && !isInput) {
        if (selectedId) {
          event.preventDefault();
          deleteSelection();
        }
      }
      if (event.key === 'Escape') {
        if (findOpen) setFindOpen(false);
        if (analysisOpen) setAnalysisOpen(false);
        if (signatureDialog) setSignatureDialog(false);
        if (selectedId) setSelectedId(null);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, findOpen, analysisOpen, signatureDialog]);

  async function runOcrOnCurrentPage() {
    if (!documentState || ocrBusy) return;
    const canvas = document.querySelector(`[data-page="${pageNumber}"] .page-canvas`);
    if (!canvas) return notify('Page canvas not ready.');

    setOcrBusy(true);
    notify(`Scanning page ${pageNumber} with Tesseract OCR…`);
    try {
      const page = await documentState.document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: zoom });
      const ocrRuns = await recognizePageText(canvas, viewport);

      if (!ocrRuns.length) {
        notify('OCR completed: no clear text recognized on this page.');
        return;
      }

      setTextRuns((prev) => {
        const next = new Map(prev);
        const existing = next.get(pageNumber) || [];
        next.set(pageNumber, [...existing, ...ocrRuns]);
        return next;
      });

      notify(`OCR recognized ${ocrRuns.length} text runs! Click any text to edit directly.`);
    } catch (err) {
      console.error(err);
      notify('OCR scan failed: ' + (err.message || 'Unknown error'));
    } finally {
      setOcrBusy(false);
    }
  }

  const rememberTextRuns = useCallback((number, runs) => {
    setTextRuns((previous) => { const next = new Map(previous); next.set(number, runs); return next; });
  }, []);

  function replaceMarks(next) { marksRef.current = next; setMarks(next); }
  function addMark(number, mark) {
    const next = new Map(marksRef.current);
    next.set(number, [...(next.get(number) || []), mark]);
    replaceMarks(next); setSelectedId(mark.id);
  }
  function updateMark(number, id, changes) {
    const next = new Map(marksRef.current);
    const pageMarks = [...(next.get(number) || [])];
    const index = pageMarks.findIndex((mark) => mark.id === id);
    if (index < 0) return;
    const patch = typeof changes === 'function' ? changes(pageMarks[index]) : changes;
    pageMarks[index] = { ...pageMarks[index], ...patch };
    next.set(number, pageMarks); replaceMarks(next);
  }
  function changeStyle(key, value) {
    setControls((previous) => {
      const next = { ...previous, [key]: value };
      controlsRef.current = next;
      return next;
    });
    if (['size', 'fontFamily', 'bold', 'italic', 'color'].includes(key)) {
      const updated = { ...savedTextStyleRef.current, [key]: value };
      savedTextStyleRef.current = updated;
      setSavedTextStyle(updated);
    }
    const active = activeTextRef.current;
    if (active && ['size', 'fontFamily', 'bold', 'italic', 'color'].includes(key)) {
      const next = { ...active, style: { ...active.style, [key]: value } };
      activeTextRef.current = next; setActiveText(next);
    }
  }

  function setActive(next) { activeTextRef.current = next; setActiveText(next); }
  function beginTextEdit(number, run) {
    if (activeTextRef.current) commitText(activeTextRef.current.key);
    const isNew = !!run.isNew;
    const fontFamily = isNew ? (savedTextStyleRef.current.fontFamily || controlsRef.current.fontFamily) : standardFontFamily(run);
    const cssFamily = isNew ? (savedTextStyleRef.current.cssFamily || 'Arial, "Helvetica Neue", Helvetica, sans-serif') : (run.cssFamily || run.family || 'Arial, "Helvetica Neue", Helvetica, sans-serif');
    const color = isNew ? (savedTextStyleRef.current.color || controlsRef.current.color) : sampleTextColor(number, run);
    const style = {
      size: isNew ? (savedTextStyleRef.current.size || controlsRef.current.size) : Number(run.size) || 12,
      fontFamily,
      cssFamily,
      sourceFamily: cssFamily,
      bold: isNew ? !!savedTextStyleRef.current.bold : !!run.bold,
      italic: isNew ? !!savedTextStyleRef.current.italic : !!run.italic,
      color,
      direction: run.direction || 'ltr',
    };
    savedTextStyleRef.current = { ...style };
    setSavedTextStyle({ ...style });

    const active = {
      key: makeId(), pageNumber: number, run: isNew
        ? { isNew: true, x: run.x, y: run.y, width: run.width, height: run.height, angle: 0 }
        : { ...run, x: run.x / zoom, y: run.y / zoom, width: run.width / zoom, height: run.height / zoom, unzoomed: true },
      value: isNew ? '' : run.text, style,
      originalColor: color,
    };
    setActive(active);
    setControls((previous) => { const next = { ...previous, size: style.size, fontFamily: style.fontFamily, bold: style.bold, italic: style.italic, color: style.color }; controlsRef.current = next; return next; });
    setPageNumber(number);
  }
  function changeActiveText(key, value) {
    const current = activeTextRef.current;
    if (!current || current.key !== key) return;
    setActive({ ...current, value });
  }
  function commitText(key, forceValue) {
    const active = activeTextRef.current;
    if (!active || (key && active.key !== key)) return marksRef.current;
    const value = forceValue === undefined ? active.value : forceValue;

    savedTextStyleRef.current = { ...active.style };
    setSavedTextStyle({ ...active.style });

    if (active.run.isNew) {
      if (value.trim()) addMark(active.pageNumber, {
        id: makeId(),
        type: 'text',
        x: active.run.x,
        y: active.run.y,
        width: active.run.width,
        height: active.run.height,
        text: value,
        fontSize: active.style.size,
        fontFamily: active.style.fontFamily,
        cssFamily: active.style.cssFamily,
        sourceFamily: active.style.sourceFamily,
        bold: active.style.bold,
        italic: active.style.italic,
        color: active.style.color,
      });
    } else {
      const run = active.run;
      const originalColor = active.originalColor || sampleTextColor(active.pageNumber, run);
      const changed = value !== run.text || forceValue !== undefined
        || active.style.size !== Number(run.size)
        || active.style.fontFamily !== standardFontFamily(run)
        || active.style.bold !== !!run.bold
        || active.style.italic !== !!run.italic
        || active.style.color.toLowerCase() !== originalColor.toLowerCase();
      if (changed) addMark(active.pageNumber, {
        id: makeId(),
        type: 'replace',
        x: run.x,
        y: run.y,
        coverX: run.x,
        coverY: run.y,
        width: run.width,
        height: run.height,
        text: value,
        background: sampleBackgroundColor(active.pageNumber, run),
        fontSize: active.style.size,
        fontFamily: active.style.fontFamily,
        sourceFamily: active.style.sourceFamily,
        cssFamily: active.style.cssFamily,
        bold: active.style.bold,
        italic: active.style.italic,
        color: active.style.color,
        pdfX: run.pdfX,
        pdfY: run.pdfY,
        pdfWidth: run.pdfWidth,
        pdfHeight: run.pdfHeight,
        baselineX: run.baselineX,
        baselineY: run.baselineY,
        baselineOffset: run.baselineOffset,
        angle: run.angle,
      });
    }
    activeTextRef.current = null; setActiveText(null); setSelectedId(null);
    return marksRef.current;
  }
  function cancelText(key) {
    if (activeTextRef.current?.key !== key) return;
    activeTextRef.current = null; setActiveText(null);
  }
  function sampleBackgroundColor(number, run) {
    try {
      const canvas = document.querySelector(`[data-page="${number}"] .page-canvas`);
      if (!canvas) return '#ffffff';
      const ratioX = canvas.width / (canvas.clientWidth || 1), ratioY = canvas.height / (canvas.clientHeight || 1);
      const x = Math.max(0, Math.floor(run.x * ratioX)), y = Math.max(0, Math.floor(run.y * ratioY));
      const width = Math.max(1, Math.min(canvas.width - x, Math.ceil(run.width * ratioX))), height = Math.max(1, Math.min(canvas.height - y, Math.ceil(run.height * ratioY)));
      const pixels = canvas.getContext('2d').getImageData(x, y, width, height).data;
      const colors = new Map();
      for (let index = 0; index < pixels.length; index += 4) {
        const [r, g, b, alpha] = pixels.slice(index, index + 4);
        if (alpha > 80 && (r + g + b) > 570) {
          const hex = `#${[r, g, b].map((c) => Math.round(c / 4) * 4).map((c) => Math.min(255, c).toString(16).padStart(2, '0')).join('')}`;
          colors.set(hex, (colors.get(hex) || 0) + 1);
        }
      }
      const winner = [...colors].sort((a, b) => b[1] - a[1])[0];
      return winner ? winner[0] : '#ffffff';
    } catch { return '#ffffff'; }
  }
  function sampleTextColor(number, run) {
    try {
      const canvas = document.querySelector(`[data-page="${number}"] .page-canvas`);
      if (!canvas) return '#111111';
      const ratioX = canvas.width / (canvas.clientWidth || 1), ratioY = canvas.height / (canvas.clientHeight || 1);
      const currentZoom = zoom || 1;
      let rx = run.x, ry = run.y, rw = run.width, rh = run.height;
      if (run.unzoomed && currentZoom !== 1) {
        rx *= currentZoom;
        ry *= currentZoom;
        rw *= currentZoom;
        rh *= currentZoom;
      }
      const x = Math.max(0, Math.floor(rx * ratioX)), y = Math.max(0, Math.floor(ry * ratioY));
      const width = Math.max(1, Math.min(canvas.width - x, Math.ceil(rw * ratioX))), height = Math.max(1, Math.min(canvas.height - y, Math.ceil(rh * ratioY)));
      const pixels = canvas.getContext('2d').getImageData(x, y, width, height).data;

      const candidates = [];
      for (let index = 0; index < pixels.length; index += 4) {
        const [r, g, b, alpha] = pixels.slice(index, index + 4);
        if (alpha > 80) {
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          candidates.push({ r, g, b, lum });
        }
      }
      if (!candidates.length) return '#111111';

      candidates.sort((p1, p2) => p1.lum - p2.lum);
      const minLum = candidates[0].lum;

      // Filter exclusively for true ink pixels near the darkest point to avoid white background dilution
      const inkCandidates = candidates.filter((p) => p.lum <= Math.min(160, minLum + 40));
      const pool = inkCandidates.length >= 3 ? inkCandidates : candidates.slice(0, Math.max(3, Math.ceil(candidates.length * 0.05)));

      let sumR = 0, sumG = 0, sumB = 0;
      for (let i = 0; i < pool.length; i += 1) {
        sumR += pool[i].r;
        sumG += pool[i].g;
        sumB += pool[i].b;
      }
      const avgR = sumR / pool.length;
      const avgG = sumG / pool.length;
      const avgB = sumB / pool.length;

      // Standard document dark ink: snap directly to solid dark black so edited text never appears washed out
      if (avgR < 90 && avgG < 90 && avgB < 90) {
        return '#111111';
      }

      const toHex = (val) => Math.min(255, Math.max(0, Math.round(val))).toString(16).padStart(2, '0');
      return `#${toHex(avgR)}${toHex(avgG)}${toHex(avgB)}`;
    } catch { return '#111111'; }
  }
  function deleteSelection() {
    if (activeTextRef.current) {
      const active = activeTextRef.current;
      if (active.run.isNew) cancelText(active.key); else commitText(active.key, '');
      return;
    }
    if (!selectedId) return notify('Select an item to delete.');
    for (const [number, pageMarks] of marksRef.current) {
      if (pageMarks.some((mark) => mark.id === selectedId)) {
        const next = new Map(marksRef.current); next.set(number, pageMarks.filter((mark) => mark.id !== selectedId)); replaceMarks(next); setSelectedId(null); return;
      }
    }
    notify('Select an item to delete.');
  }
  function undo() {
    const next = new Map(marksRef.current); const pageMarks = [...(next.get(pageNumber) || [])];
    if (!pageMarks.length) return notify('Nothing to undo on this page.');
    const removed = pageMarks.pop(); if (removed.id === selectedId) setSelectedId(null);
    next.set(pageNumber, pageMarks); replaceMarks(next);
  }
  function notify(message) { setToast(message); setTimeout(() => setToast(''), 2400); }
  function changeMode(nextMode) {
    if (activeTextRef.current) commitText(activeTextRef.current.key);
    setMode(nextMode);
    const descriptions = { select: 'Click any text or image to edit directly · Drag to move or resize · Double-click empty canvas to add text', text: 'Click a page to add styled text', highlight: 'Drag across a page to highlight', strike: 'Drag across text to strike it through', draw: 'Draw freehand on the page', rectangle: 'Drag to add a rectangle', ellipse: 'Drag to add an ellipse', line: 'Drag to draw a line', whiteout: 'Drag over page content to cover it', image: 'Choose an image, then place it on a page', link: 'Click a page to place the link above', form: 'Click a page to add the selected form field', signature: 'Click a page to place your signature' };
    setStatus(descriptions[nextMode] || 'Ready');
  }
  function insertImageDirectly(dataUrl, aspect, targetPage = pageNumber, targetPoint = null) {
    const width = Number(controlsRef.current.imageSize) || 160;
    const height = Math.round(width / (aspect || 1));
    const x = targetPoint ? Math.max(10, Math.round(targetPoint.x - width / 2)) : 100;
    const y = targetPoint ? Math.max(10, Math.round(targetPoint.y - height / 2)) : 120;
    const markId = makeId();
    addMark(targetPage, {
      id: markId,
      type: 'image',
      data: dataUrl,
      x,
      y,
      width,
      height,
    });
    setSelectedId(markId);
    setImage(null);
    changeMode('select');
    notify('Image added! Drag to move or drag corners to resize.');
  }
  function placeImage(number, point) {
    if (!image) return;
    insertImageDirectly(image.data, image.aspect, number, point);
  }
  function loadImage(file) {
    if (!file) return;
    const isImage = file.type?.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|svg|avif)$/i.test(file.name || '');
    if (!isImage) return notify('Please choose an image file (PNG, JPG, WebP, etc.).');
    const reader = new FileReader();
    reader.onload = () => {
      const preview = new Image();
      preview.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = preview.naturalWidth || preview.width || 300;
          canvas.height = preview.naturalHeight || preview.height || 300;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(preview, 0, 0);
          const pngData = canvas.toDataURL('image/png');
          const aspect = canvas.width / (canvas.height || 1);
          insertImageDirectly(pngData, aspect, pageNumber);
        } catch {
          // Fallback to direct data URL if canvas conversion fails
          const aspect = preview.width / (preview.height || 1);
          insertImageDirectly(reader.result, aspect, pageNumber);
        }
      };
      preview.onerror = () => notify('Could not load image.');
      preview.src = reader.result;
    };
    reader.onerror = () => notify('Could not read image file.');
    reader.readAsDataURL(file);
  }
  function navigatePage(number) {
    if (!pageCount) return;
    const target = Math.max(1, Math.min(pageCount, Number(number) || 1));
    setPageNumber(target); document.querySelector(`[data-page="${target}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function fitPage() {
    const firstPage = document.querySelector('.pdf-page'); if (!firstPage || !viewerRef.current) return;
    const availableWidth = viewerRef.current.clientWidth - 70;
    setZoom(Math.max(.5, Math.min(2.3, zoom * availableWidth / firstPage.clientWidth)));
  }
  function updateCurrentPage() {
    if (!viewerRef.current) return;
    const middle = viewerRef.current.getBoundingClientRect().top + viewerRef.current.clientHeight / 2;
    const pages = [...viewerRef.current.querySelectorAll('[data-page]')];
    const nearest = pages.sort((a, b) => Math.abs(a.getBoundingClientRect().top + a.clientHeight / 2 - middle) - Math.abs(b.getBoundingClientRect().top + b.clientHeight / 2 - middle))[0];
    if (nearest) setPageNumber(Number(nearest.dataset.page));
  }
  async function applyChanges() {
    if (!documentState) return;
    setStatus('Applying edits and preparing the PDF…');
    try {
      const active = activeTextRef.current;
      if (active) commitText(active.key);
      await exportPdf(documentState.bytes, documentState.name, marksRef.current);
      setStatus('Edited PDF downloaded'); notify('Your edited PDF was downloaded.');
    } catch (cause) { console.error(cause); setStatus('Could not export the PDF'); notify(cause.message || 'Export failed. Check the PDF and edits.'); }
  }
  function findText(direction = 1) {
    const needle = query.trim().toLowerCase(); if (!needle) return notify('Type text to find first.');
    const ordered = [...textRuns.entries()].sort((a, b) => a[0] - b[0]);
    const start = ordered.findIndex(([number]) => number === pageNumber);
    const searchOrder = direction > 0 ? [...ordered.slice(Math.max(0, start)), ...ordered.slice(0, Math.max(0, start))] : [...ordered.slice(0, start + 1).reverse(), ...ordered.slice(start + 1).reverse()];
    const found = searchOrder.find(([number, runs]) => runs.some((run) => run.text.toLowerCase().includes(needle)));
    if (found) { navigatePage(found[0]); setStatus(`Found on page ${found[0]}`); } else notify('No matches found.');
  }
  function replaceAllText() {
    const needle = query.trim(); if (!needle) return notify('Type text to find first.');
    let count = 0; const next = new Map(marksRef.current); const regex = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    for (const [number, runs] of textRuns) {
      const pageMarks = [...(next.get(number) || [])];
      for (const run of runs) if (regex.test(run.text)) {
        regex.lastIndex = 0;
        const style = { size: run.size, fontFamily: standardFontFamily(run), sourceFamily: run.family, bold: run.bold, italic: run.italic, color: '#111111' };
        pageMarks.push({ id: makeId(), type: 'replace', x: run.x / zoom, y: run.y / zoom, coverX: run.x / zoom, coverY: run.y / zoom, width: run.width / zoom, height: run.height / zoom, text: run.text.replace(regex, replacement), background: '#fff', fontSize: style.size, fontFamily: style.fontFamily, sourceFamily: style.sourceFamily, bold: style.bold, italic: style.italic, color: style.color, pdfX: run.pdfX, pdfY: run.pdfY, pdfWidth: run.pdfWidth, pdfHeight: run.pdfHeight, baselineX: run.baselineX, baselineY: run.baselineY, angle: run.angle });
        regex.lastIndex = 0; count += 1;
      }
      next.set(number, pageMarks);
    }
    if (count) { replaceMarks(next); setStatus(`Replaced ${count} text run${count === 1 ? '' : 's'}. Review and export when ready.`); }
    else notify('No matching selectable text runs found.');
  }
  function replaceMarksFromPages(number, patcher) {
    const next = new Map(marksRef.current); next.set(number, patcher(next.get(number) || [])); replaceMarks(next);
  }
  function showAnalysis() { setAnalysisOpen(true); }
  const fontAnalysis = useMemo(() => {
    const runs = [...textRuns.entries()].flatMap(([number, items]) => items.map((run) => ({ number, run })));
    const groups = new Map();
    for (const { number, run } of runs) {
      const key = `${run.fontName}|${run.family}|${run.size.toFixed(1)}|${run.bold}|${run.italic}`;
      const group = groups.get(key) || { fontName: run.fontName, family: run.family, size: run.size.toFixed(1), bold: run.bold, italic: run.italic, count: 0, pages: new Set() };
      group.count += 1; group.pages.add(number); groups.set(key, group);
    }
    return { runs: runs.length, fonts: new Set(runs.map(({ run }) => run.fontName)).size, scanned: [...Array(pageCount)].filter((_, index) => !textRuns.get(index + 1)?.length).length, groups: [...groups.values()] };
  }, [pageCount, textRuns]);

  return <div className="app-shell" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file?.type === 'application/pdf') openFile(file); }}>
    <header className="app-header">
      <a className="brand" href="#" onClick={(event) => event.preventDefault()}><span className="brand-icon"><FileText size={18} /></span><span>paper<span className="brand-pdf">pdf</span></span></a>
      <div className="document-title" title={documentState?.name || ''}>{documentState?.name || 'No document open'}</div>
      <span className="save-status">{documentState && (allMarks.length ? `${allMarks.length} unsaved edit${allMarks.length === 1 ? '' : 's'}` : 'All changes saved locally')}</span>
      <button className="button button-secondary" onClick={() => fileInputRef.current?.click()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><FolderOpen size={14} /> Open PDF</button>
      <button className="button button-primary" onClick={applyChanges} disabled={!documentState || busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Download size={14} /> Apply &amp; download</button>
      <input ref={fileInputRef} type="file" accept="application/pdf" hidden onChange={(event) => { openFile(event.target.files[0]); event.target.value = ''; }} />
      <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={(event) => { loadImage(event.target.files[0]); event.target.value = ''; }} />
    </header>

    <Toolbar mode={mode} onMode={changeMode} onSign={() => { setSignatureDraft(signatureText); setSignatureDialog(true); }} onImage={() => imageInputRef.current?.click()} onOcr={runOcrOnCurrentPage} isOcrBusy={ocrBusy} controls={{ ...controls, linkUrl: controls.linkUrl || '' }} onStyle={changeStyle} onFind={() => setFindOpen(!findOpen)} onAnalyze={showAnalysis} page={pageNumber} pageCount={pageCount} onPage={navigatePage} zoom={zoom} onZoom={(value) => setZoom(Math.max(.5, Math.min(2.3, value)))} onFit={fitPage} onDelete={deleteSelection} onUndo={undo} canUndo={currentMarks.length > 0} hasPdf={!!documentState} />

    <div className="workspace">
      <aside className="sidebar"><div className="sidebar-heading">Pages <span>{pageCount || '—'}</span></div>
        {documentState ? <div className="thumbnail-list">{Array.from({ length: pageCount }, (_, index) => <PageThumbnail key={index + 1} document={documentState.document} pageNumber={index + 1} active={pageNumber === index + 1} onClick={() => navigatePage(index + 1)} />)}</div> : <div className="sidebar-empty">Your page previews will show here.</div>}
      </aside>
      <main className="document-area">
        <section className="pdf-viewer" ref={viewerRef} onScroll={updateCurrentPage}>
          {!documentState && <div className="welcome-card"><div className="welcome-mark">▤</div><p className="eyebrow">YOUR PDF WORKSPACE</p><h1>Make room for good work.</h1><p>Read, edit text, add images, and annotate your documents. Your files stay in this browser.</p><div className="welcome-actions"><button className="button button-primary" onClick={() => fileInputRef.current?.click()}>Choose a PDF</button><button className="button button-secondary" onClick={openBlank}>＋ Blank document</button></div><span className="drop-hint">or drop a PDF anywhere in this window</span></div>}
          {documentState && <div className="page-stack">{Array.from({ length: pageCount }, (_, index) => {
            const number = index + 1;
            return <PdfPage key={`${documentState.name}-${number}-${zoom}`} document={documentState.document} pageNumber={number} zoom={zoom} marks={marks.get(number) || []} selectedId={selectedId} mode={mode} imageData={image?.data} imageAspect={image?.aspect} imageSize={controls.imageSize} style={controls} activeText={activeText} onTextRuns={rememberTextRuns} onTextStart={beginTextEdit} onTextChange={changeActiveText} onTextCommit={commitText} onTextCancel={cancelText} onAddMark={addMark} onUpdateMark={updateMark} onSelectMark={setSelectedId} onPlaceImage={placeImage} />;
          })}</div>}
          {findOpen && documentState && <div className="find-panel"><input autoFocus aria-label="Find text" placeholder="Find text" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') findText(); if (event.key === 'Escape') setFindOpen(false); }} /><button className="button button-secondary" onClick={() => findText()}>Find</button><input aria-label="Replace text" placeholder="Replace with" value={replacement} onChange={(event) => setReplacement(event.target.value)} /><button className="button button-secondary" onClick={replaceAllText}>Replace all</button><button className="icon-button" onClick={() => setFindOpen(false)} aria-label="Close search">×</button></div>}
          {toast && <div className="toast-message" role="status">{toast}</div>}
        </section>
        <footer className="statusbar"><span>{error || status || (busy ? 'Working…' : 'Ready')}</span><span>Private by design · Files stay on your device</span></footer>
      </main>
    </div>

    {signatureDialog && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSignatureDialog(false); }}><form className="dialog-card" onSubmit={(event) => {
      event.preventDefault();
      const text = signatureDraft.trim();
      if (!text) return;
      setSignatureText(text);
      setSignatureDialog(false);
      const markId = makeId();
      addMark(pageNumber, {
        id: markId,
        type: 'signature',
        x: 100,
        y: 160,
        width: 180,
        height: 48,
        fontSize: Math.max(18, controlsRef.current.size * 2),
        text,
        color: controlsRef.current.color,
        fontFamily: 'Helvetica',
        italic: true,
        sourceFamily: 'cursive',
      });
      setSelectedId(markId);
      changeMode('select');
      notify('Signature added to page! Drag to reposition.');
    }}><p className="eyebrow">SIGNATURE</p><h2>Create a typed signature</h2><input autoFocus className="dialog-input signature-input" value={signatureDraft} onChange={(event) => setSignatureDraft(event.target.value)} placeholder="Type your name" /><div className="dialog-actions"><button type="button" className="button button-secondary" onClick={() => setSignatureDialog(false)}>Cancel</button><button className="button button-primary" type="submit">Use signature</button></div></form></div>}
    {analysisOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setAnalysisOpen(false); }}><section className="dialog-card analysis-dialog"><p className="eyebrow">DOCUMENT INSIGHTS</p><h2>PDF analysis</h2><p className="dialog-copy">Font metadata and text runs are read from this PDF in your browser. The document is not uploaded.</p><div className="analysis-stats"><div><strong>{pageCount}</strong><span>Pages</span></div><div><strong>{fontAnalysis.runs}</strong><span>Selectable text runs</span></div><div><strong>{fontAnalysis.fonts}</strong><span>Distinct PDF fonts</span></div><div><strong>{fontAnalysis.scanned}</strong><span>Pages without text</span></div></div><div className="font-table-wrap"><table className="font-table"><thead><tr><th>PDF font</th><th>Family</th><th>Style</th><th>Size</th><th>Runs</th><th>Pages</th></tr></thead><tbody>{fontAnalysis.groups.map((group) => <tr key={`${group.fontName}-${group.size}-${group.bold}-${group.italic}`}><td>{group.fontName}</td><td>{group.family}</td><td>{group.bold ? 'Bold' : 'Regular'}{group.italic ? ' italic' : ''}</td><td>{group.size} pt</td><td>{group.count}</td><td>{[...group.pages].sort((a, b) => a - b).join(', ')}</td></tr>)}</tbody></table>{!fontAnalysis.groups.length && <p className="empty-analysis">Open a text PDF to inspect its fonts.</p>}</div><div className="dialog-actions"><button className="button button-primary" onClick={() => setAnalysisOpen(false)}>Done</button></div></section></div>}
  </div>;
}
