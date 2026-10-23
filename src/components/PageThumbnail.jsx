import { useEffect, useRef } from 'react';

export function PageThumbnail({ document, pageNumber, active, onClick }) {
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  useEffect(() => {
    let cancelled = false;
    async function renderThumb() {
      if (renderTaskRef.current) {
        const previousTask = renderTaskRef.current;
        previousTask.cancel();
        await previousTask.promise.catch(() => {});
        if (cancelled) return;
      }
      const page = await document.getPage(pageNumber);
      if (cancelled) return;
      const source = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(150 / source.width, 190 / source.height) });
      const canvas = canvasRef.current;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.ceil(viewport.width * ratio);
      canvas.height = Math.ceil(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const task = page.render({ canvasContext: canvas.getContext('2d'), viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null });
      renderTaskRef.current = task;
      try { await task.promise; } finally { if (renderTaskRef.current === task) renderTaskRef.current = null; }
    }
    renderThumb().catch((error) => { if (!cancelled) console.error(`Could not render thumbnail ${pageNumber}`, error); });
    return () => { cancelled = true; renderTaskRef.current?.cancel(); };
  }, [document, pageNumber]);
  return <button className={`thumbnail ${active ? 'is-active' : ''}`} onClick={onClick} aria-label={`Go to page ${pageNumber}`}><canvas ref={canvasRef} /><span>Page {pageNumber}</span></button>;
}
