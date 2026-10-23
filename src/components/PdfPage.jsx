import { useCallback, useEffect, useRef, useState } from 'react';
import { readTextRuns } from '../lib/pdfEngine.js';

const uid = () => globalThis.crypto?.randomUUID?.() || `mark-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function PdfPage({ document, pageNumber, zoom, marks, selectedId, mode, imageData, imageAspect, imageSize, style, activeText, onTextRuns, onTextStart, onTextChange, onTextCommit, onTextCancel, onAddMark, onUpdateMark, onSelectMark, onPlaceImage }) {
  const pageRef = useRef(null);
  const baseCanvasRef = useRef(null);
  const overlayRef = useRef(null);
  const pointerHandledRef = useRef(false);
  const renderTaskRef = useRef(null);
  const [layout, setLayout] = useState(null);
  const stableOnTextRuns = useCallback((number, runs) => onTextRuns(number, runs), [onTextRuns]);

  useEffect(() => {
    let cancelled = false;
    async function renderPage() {
      if (renderTaskRef.current) {
        const previousTask = renderTaskRef.current;
        previousTask.cancel();
        await previousTask.promise.catch(() => {});
        if (cancelled) return;
      }
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: zoom });
      if (cancelled) return;
      const canvas = baseCanvasRef.current;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.ceil(viewport.width * ratio);
      canvas.height = Math.ceil(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const task = page.render({ canvasContext: canvas.getContext('2d'), viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null });
      renderTaskRef.current = task;
      try { await task.promise; } finally { if (renderTaskRef.current === task) renderTaskRef.current = null; }
      if (cancelled) return;
      const runs = await readTextRuns(page, viewport);
      stableOnTextRuns(pageNumber, runs);
      setLayout({ width: viewport.width, height: viewport.height, runs });
    }
    renderPage().catch((error) => { if (!cancelled) console.error(`Could not render page ${pageNumber}`, error); });
    return () => { cancelled = true; renderTaskRef.current?.cancel(); };
  }, [document, pageNumber, zoom, stableOnTextRuns]);

  useEffect(() => {
    if (!layout || !overlayRef.current) return;
    const canvas = overlayRef.current;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.ceil(layout.width * ratio);
    canvas.height = Math.ceil(layout.height * ratio);
    canvas.style.width = `${layout.width}px`;
    canvas.style.height = `${layout.height}px`;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (const mark of marks) {
      const x = mark.x * zoom * ratio;
      const y = mark.y * zoom * ratio;
      const width = (mark.width || 0) * zoom * ratio;
      const height = (mark.height || 0) * zoom * ratio;
      context.save();
      if (mark.type === 'highlight') { context.fillStyle = 'rgba(245,200,60,.42)'; context.fillRect(x, y, width, height); }
      if (mark.type === 'whiteout') { context.fillStyle = mark.background || '#fff'; context.fillRect(x, y, width, height); }
      if (mark.type === 'replace') {
        const family = mark.cssFamily || mark.sourceFamily || 'Arial, sans-serif';
        context.font = `${mark.italic ? 'italic ' : ''}${mark.bold ? 'bold ' : 'normal '}${(mark.fontSize || 12) * zoom * ratio}px ${family}`;
        const coverWidth = Math.max(width, context.measureText(mark.text || '').width + 4 * zoom * ratio);
        context.fillStyle = mark.background || '#fff';
        context.fillRect((mark.coverX ?? mark.x) * zoom * ratio, (mark.coverY ?? mark.y) * zoom * ratio, coverWidth, height);
      }
      if (mark.type === 'text' || mark.type === 'replace' || mark.type === 'signature') {
        if (mark.text) {
          const family = mark.type === 'signature' ? 'cursive' : (mark.cssFamily || mark.sourceFamily || 'Arial, sans-serif');
          context.fillStyle = mark.color || '#111111';
          context.font = `${mark.italic ? 'italic ' : ''}${mark.bold ? 'bold ' : 'normal '}${(mark.fontSize || 12) * zoom * ratio}px ${family}`;
          context.textBaseline = 'alphabetic';
          const textBaselineY = mark.baselineOffset !== undefined
            ? y + mark.baselineOffset * zoom * ratio
            : y + Math.min(height - 2, (mark.fontSize || 12) * 0.9) * zoom * ratio;
          context.fillText(mark.text, x, textBaselineY);
        }
      }
      if (mark.type === 'draw') {
        context.strokeStyle = mark.color || '#273b30'; context.lineWidth = (mark.lineWidth || 2) * zoom * ratio; context.lineCap = 'round'; context.beginPath();
        mark.points.forEach((point, index) => index ? context.lineTo(point.x * zoom * ratio, point.y * zoom * ratio) : context.moveTo(point.x * zoom * ratio, point.y * zoom * ratio)); context.stroke();
      }
      if (mark.type === 'rectangle') { context.strokeStyle = mark.color; context.lineWidth = 2 * zoom * ratio; context.strokeRect(x, y, width, height); }
      if (mark.type === 'ellipse') { context.strokeStyle = mark.color; context.lineWidth = 2 * zoom * ratio; context.beginPath(); context.ellipse(x + width / 2, y + height / 2, Math.abs(width / 2), Math.abs(height / 2), 0, 0, Math.PI * 2); context.stroke(); }
      if (mark.type === 'strike') { context.strokeStyle = mark.color; context.lineWidth = 2 * zoom * ratio; context.beginPath(); context.moveTo(x, y + height / 2); context.lineTo(x + width, y + height / 2); context.stroke(); }
      if (mark.type === 'line') { context.strokeStyle = mark.color; context.lineWidth = 2 * zoom * ratio; context.beginPath(); context.moveTo(x, y); context.lineTo(x + width, y + height); context.stroke(); }
      if (mark.type === 'image' && mark.data) {
        const image = new Image(); image.onload = () => { context.drawImage(image, x, y, width, height); if (mark.id === selectedId) drawSelection(context, x, y, width, height, ratio); }; image.src = mark.data;
      }
      if (mark.type === 'link') { context.strokeStyle = '#3976ba'; context.strokeRect(x, y, width, height); context.fillStyle = '#3976ba'; context.font = `${10 * zoom * ratio}px sans-serif`; context.fillText(mark.url, x, y + height * .7, Math.max(width, 50)); }
      if (mark.type === 'field') { context.fillStyle = 'rgba(236,245,236,.7)'; context.strokeStyle = '#6b8c74'; context.fillRect(x, y, width, height); context.strokeRect(x, y, width, height); context.fillStyle = '#333'; context.font = `${10 * zoom * ratio}px sans-serif`; context.fillText(mark.fieldType === 'checkbox' ? '□' : mark.label, x, y + height * .7, Math.max(width, 30)); }
      if (mark.id === selectedId && mark.type !== 'image') drawSelection(context, x, y, width, height, ratio);
      context.restore();
    }
  }, [layout, marks, selectedId, zoom]);

  function drawSelection(context, x, y, width, height, ratio, isImage) {
    context.save();
    context.strokeStyle = '#2563eb';
    context.lineWidth = 1.5 * ratio;
    context.setLineDash([]);
    context.strokeRect(x, y, width, height);

    if (isImage) {
      const handleSize = 8 * ratio;
      const corners = [
        [x, y],
        [x + width, y],
        [x, y + height],
        [x + width, y + height],
      ];
      for (const [cx, cy] of corners) {
        context.fillStyle = '#ffffff';
        context.beginPath();
        context.arc(cx, cy, handleSize / 2, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = '#2563eb';
        context.lineWidth = 2 * ratio;
        context.stroke();
      }
    }
    context.restore();
  }

  function pointFromEvent(event) {
    const rect = overlayRef.current.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom };
  }

  function handlePointerMove(event) {
    if (!overlayRef.current || !layout) return;
    if (['draw', 'highlight', 'whiteout', 'rectangle', 'ellipse', 'line', 'strike'].includes(mode)) {
      overlayRef.current.style.cursor = 'crosshair';
      return;
    }
    if (mode === 'text') {
      overlayRef.current.style.cursor = 'text';
      return;
    }
    if (mode === 'image' && imageData) {
      overlayRef.current.style.cursor = 'copy';
      return;
    }

    const point = pointFromEvent(event);
    const hit = [...marks].reverse().find((mark) =>
      point.x >= mark.x - 4 && point.x <= mark.x + (mark.width || 0) + 4 &&
      point.y >= mark.y - 4 && point.y <= mark.y + (mark.height || 0) + 4
    );

    if (hit) {
      if (hit.type === 'replace' || hit.type === 'text') {
        overlayRef.current.style.cursor = 'text';
      } else if (hit.type === 'image') {
        const isCorner = Math.abs(point.x - (hit.x + hit.width)) < 18 && Math.abs(point.y - (hit.y + hit.height)) < 18;
        overlayRef.current.style.cursor = isCorner ? 'nwse-resize' : 'move';
      } else {
        overlayRef.current.style.cursor = 'pointer';
      }
      return;
    }

    const textHit = layout.runs.find((run) =>
      point.x * zoom >= run.x - 3 && point.x * zoom <= run.x + run.width + 3 &&
      point.y * zoom >= run.y - 3 && point.y * zoom <= run.y + run.height + 3
    );

    overlayRef.current.style.cursor = textHit ? 'text' : 'default';
  }

  function handlePointerDown(event) {
    if (!layout || event.button !== 0 || event.target.closest('.inline-text-editor, .save-inline-edit')) return;
    pointerHandledRef.current = true;
    setTimeout(() => { pointerHandledRef.current = false; }, 120);
    const point = pointFromEvent(event);

    if (mode === 'select' || mode === 'edit') {
      // 1. Direct interaction with existing marks (images, text, shapes)
      const hit = [...marks].reverse().find((mark) => point.x >= mark.x - 4 && point.x <= mark.x + (mark.width || 0) + 4 && point.y >= mark.y - 4 && point.y <= mark.y + (mark.height || 0) + 4);
      if (hit) {
        if (hit.type === 'replace' || hit.type === 'text') {
          event.preventDefault();
          onTextStart(pageNumber, {
            ...hit,
            isNew: false,
            text: hit.text,
            x: hit.x,
            y: hit.y,
            width: hit.width,
            height: hit.height,
            size: hit.fontSize,
            family: hit.fontFamily,
            cssFamily: hit.cssFamily,
            bold: hit.bold,
            italic: hit.italic,
            color: hit.color,
          });
          return;
        }

        onSelectMark(hit.id);
        event.preventDefault();
        overlayRef.current.setPointerCapture(event.pointerId);
        const start = { ...point, x0: hit.x, y0: hit.y, width0: hit.width, height0: hit.height };
        const resize = hit.type === 'image' && Math.abs(point.x - (hit.x + hit.width)) < 18 && Math.abs(point.y - (hit.y + hit.height)) < 18;
        const move = (nextEvent) => {
          const next = pointFromEvent(nextEvent);
          onUpdateMark(pageNumber, hit.id, resize
            ? { width: Math.max(20, start.width0 + next.x - start.x), height: Math.max(20, start.height0 + next.y - start.y) }
            : { x: start.x0 + next.x - start.x, y: start.y0 + next.y - start.y });
        };
        const finish = () => {
          overlayRef.current?.removeEventListener('pointermove', move);
          overlayRef.current?.removeEventListener('pointerup', finish);
        };
        overlayRef.current.addEventListener('pointermove', move);
        overlayRef.current.addEventListener('pointerup', finish, { once: true });
        return;
      }

      // 2. Direct click on underlying selectable PDF text
      const hits = layout.runs.filter((run) =>
        point.x * zoom >= run.x - 3 &&
        point.x * zoom <= run.x + run.width + 3 &&
        point.y * zoom >= run.y - 3 &&
        point.y * zoom <= run.y + run.height + 3
      ).sort((a, b) => a.width * a.height - b.width * b.height);

      if (hits[0]) {
        event.preventDefault();
        onSelectMark(null);
        onTextStart(pageNumber, hits[0]);
        return;
      }

      // 3. Clicked empty space
      onSelectMark(null);
      return;
    }

    if (mode === 'text') { event.preventDefault(); onTextStart(pageNumber, { isNew: true, x: point.x, y: point.y, width: 280, height: 48, size: style.size, family: style.fontFamily, bold: style.bold, italic: style.italic, text: '' }); return; }
    if (mode === 'image' && imageData) { onPlaceImage(pageNumber, point); return; }
    if (mode === 'link') { onAddMark(pageNumber, { id: uid(), type: 'link', ...point, width: 150, height: 24, url: style.linkUrl }); return; }
    if (mode === 'form') {
      const small = style.fieldType === 'checkbox' || style.fieldType === 'radio';
      onAddMark(pageNumber, { id: uid(), type: 'field', fieldType: style.fieldType, ...point, width: small ? 22 : 180, height: small ? 22 : 34, name: `${style.fieldName || 'field'}_${pageNumber}_${marks.length + 1}`, label: style.fieldName || 'field', value: style.fieldValue });
      return;
    }
    if (mode === 'signature') { window.dispatchEvent(new CustomEvent('paper-signature-place', { detail: { pageNumber, point } })); return; }

    if (!['highlight', 'draw', 'whiteout', 'rectangle', 'ellipse', 'line', 'strike'].includes(mode)) return;
    event.preventDefault(); overlayRef.current.setPointerCapture(event.pointerId);
    const mark = mode === 'draw'
      ? { id: uid(), type: mode, points: [point], color: style.color, lineWidth: Math.max(1, style.size * .16) }
      : { id: uid(), type: mode, ...point, width: 0, height: 0, color: style.color };
    onAddMark(pageNumber, mark);
    const move = (nextEvent) => {
      const next = pointFromEvent(nextEvent);
      if (mode === 'draw') onUpdateMark(pageNumber, mark.id, (current) => ({ points: [...current.points, next] }));
      else onUpdateMark(pageNumber, mark.id, { width: next.x - point.x, height: next.y - point.y });
    };
    const finish = () => {
      overlayRef.current?.removeEventListener('pointermove', move);
      overlayRef.current?.removeEventListener('pointerup', finish);
      onUpdateMark(pageNumber, mark.id, (current) => current && current.width < 0 ? { x: current.x + current.width, width: Math.abs(current.width) } : {});
      onUpdateMark(pageNumber, mark.id, (current) => current && current.height < 0 ? { y: current.y + current.height, height: Math.abs(current.height) } : {});
    };
    overlayRef.current.addEventListener('pointermove', move); overlayRef.current.addEventListener('pointerup', finish, { once: true });
  }

  function handleDoubleClick(event) {
    if (!layout || event.button !== 0 || event.target.closest('.inline-text-editor, .save-inline-edit')) return;
    const point = pointFromEvent(event);
    const hit = [...marks].reverse().find((mark) => point.x >= mark.x - 4 && point.x <= mark.x + (mark.width || 0) + 4 && point.y >= mark.y - 4 && point.y <= mark.y + (mark.height || 0) + 4);
    if (hit) return;
    const hitRun = layout.runs.find((run) => point.x * zoom >= run.x - 3 && point.x * zoom <= run.x + run.width + 3 && point.y * zoom >= run.y - 3 && point.y * zoom <= run.y + run.height + 3);
    if (hitRun) return;

    onTextStart(pageNumber, {
      isNew: true,
      x: point.x,
      y: point.y,
      width: 260,
      height: 48,
      size: style.size,
      family: style.fontFamily,
      bold: style.bold,
      italic: style.italic,
      text: '',
    });
  }

  function handleCanvasClick(event) {
    if (pointerHandledRef.current) { pointerHandledRef.current = false; return; }
    if (!layout || event.target.closest('.inline-text-editor')) return;
    const point = pointFromEvent(event);
    if (mode === 'text') onTextStart(pageNumber, { isNew: true, x: point.x, y: point.y, width: 280, height: 48, size: style.size, family: style.fontFamily, bold: style.bold, italic: style.italic, text: '' });
    else if (mode === 'image' && imageData) onPlaceImage(pageNumber, point);
    else if (mode === 'link') onAddMark(pageNumber, { id: uid(), type: 'link', ...point, width: 150, height: 24, url: style.linkUrl });
    else if (mode === 'form') {
      const small = style.fieldType === 'checkbox' || style.fieldType === 'radio';
      onAddMark(pageNumber, { id: uid(), type: 'field', fieldType: style.fieldType, ...point, width: small ? 22 : 180, height: small ? 22 : 34, name: `${style.fieldName || 'field'}_${pageNumber}_${marks.length + 1}`, label: style.fieldName || 'field', value: style.fieldValue });
    } else if (mode === 'signature') window.dispatchEvent(new CustomEvent('paper-signature-place', { detail: { pageNumber, point } }));
    else if (mode === 'highlight' || mode === 'whiteout' || mode === 'rectangle' || mode === 'ellipse' || mode === 'line' || mode === 'strike') {
      onAddMark(pageNumber, { id: uid(), type: mode, ...point, width: 70, height: 18, color: style.color });
    } else if (mode === 'draw') onAddMark(pageNumber, { id: uid(), type: 'draw', points: [point, { x: point.x + 1, y: point.y + 1 }], color: style.color, lineWidth: Math.max(1, style.size * .16) });
  }

  const editingThisPage = activeText?.pageNumber === pageNumber;
  const editingBox = activeText?.run;
  return <div className="pdf-page" ref={pageRef} style={layout ? { width: layout.width, height: layout.height } : undefined} data-page={pageNumber} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onDoubleClick={handleDoubleClick} onClick={handleCanvasClick}>
    <canvas ref={baseCanvasRef} className="page-canvas" />
    <canvas ref={overlayRef} className="marks-canvas" />
    {editingThisPage && editingBox && <>
      <input className="inline-text-editor" aria-label={editingBox.isNew ? 'Add PDF text' : 'Edit PDF text'} value={activeText.value}
        onChange={(event) => onTextChange(activeText.key, event.target.value)}
        onBlur={(event) => { if (!event.relatedTarget?.closest?.('[data-text-style]') && !event.relatedTarget?.closest?.('.save-inline-edit')) onTextCommit(activeText.key); }}
        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); onTextCommit(activeText.key); } if (event.key === 'Escape') { event.preventDefault(); onTextCancel(activeText.key); } }}
        style={{ left: editingBox.x * zoom, top: editingBox.y * zoom, width: Math.max((editingBox.width + 12) * zoom, 60), height: Math.max(editingBox.height * zoom, activeText.style.size * 1.25 * zoom), fontFamily: activeText.style.sourceFamily || (activeText.style.fontFamily === 'TimesRoman' ? 'serif' : activeText.style.fontFamily === 'Courier' ? 'monospace' : 'Arial, sans-serif'), fontSize: `${activeText.style.size * zoom}px`, fontWeight: activeText.style.bold ? 700 : 400, fontStyle: activeText.style.italic ? 'italic' : 'normal', color: activeText.style.color, direction: activeText.style.direction, transform: `rotate(${editingBox.angle || 0}deg)` }} autoFocus />
      <button type="button" className="save-inline-edit" aria-label="Save text edit" title="Save this text edit"
        style={{ left: editingBox.x * zoom, top: (editingBox.y + Math.max(editingBox.height, activeText.style.size * 1.25)) * zoom + 5 }}
        onPointerDown={(event) => event.preventDefault()} onClick={(event) => { event.stopPropagation(); onTextCommit(activeText.key); }}>✓</button>
    </>}
  </div>;
}
