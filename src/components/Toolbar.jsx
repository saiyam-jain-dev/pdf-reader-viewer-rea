import { useState, useEffect } from 'react';
import {
  MousePointer2,
  Type,
  PenLine,
  Highlighter,
  Strikethrough,
  Pencil,
  Square,
  Circle,
  Minus,
  Eraser,
  Image as ImageIcon,
  Link as LinkIcon,
  CheckSquare,
  ScanText,
  Search,
  BarChart2,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Bold,
  Italic,
} from 'lucide-react';

export function Toolbar({
  mode,
  onMode,
  onSign,
  onImage,
  onOcr,
  isOcrBusy,
  controls,
  onStyle,
  onFind,
  onAnalyze,
  page,
  pageCount,
  onPage,
  zoom,
  onZoom,
  onFit,
  onDelete,
  onUndo,
  canUndo,
  hasPdf,
}) {
  const [activeTab, setActiveTab] = useState('edit');

  useEffect(() => {
    if (['select', 'text'].includes(mode)) {
      setActiveTab('edit');
    } else if (['highlight', 'strike', 'draw', 'rectangle', 'ellipse', 'line', 'whiteout'].includes(mode)) {
      setActiveTab('annotate');
    } else if (['image', 'link', 'form'].includes(mode)) {
      setActiveTab('insert');
    }
  }, [mode]);

  function handleTabChange(tab) {
    setActiveTab(tab);
    if (tab === 'edit') {
      if (!['select', 'text'].includes(mode)) onMode('select');
    } else if (tab === 'annotate') {
      if (!['highlight', 'strike', 'draw', 'rectangle', 'ellipse', 'line', 'whiteout'].includes(mode)) {
        onMode('highlight');
      }
    } else if (tab === 'insert') {
      if (!['image', 'link', 'form'].includes(mode)) {
        onMode('form');
      }
    }
  }

  return (
    <div className="toolbar-wrap">
      <div className="toolbar-top-row">
        <div className="toolbar-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'edit'}
            className={`tab-button ${activeTab === 'edit' ? 'is-active' : ''}`}
            onClick={() => handleTabChange('edit')}
          >
            <Type size={13} />
            <span>Edit</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'annotate'}
            className={`tab-button ${activeTab === 'annotate' ? 'is-active' : ''}`}
            onClick={() => handleTabChange('annotate')}
          >
            <Highlighter size={13} />
            <span>Annotate</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'insert'}
            className={`tab-button ${activeTab === 'insert' ? 'is-active' : ''}`}
            onClick={() => handleTabChange('insert')}
          >
            <CheckSquare size={13} />
            <span>Insert & Forms</span>
          </button>
        </div>
      </div>

      <nav className="toolbar" aria-label="PDF tools">
        {/* TAB 1: EDIT */}
        {activeTab === 'edit' && (
          <>
            <div className="tool-group">
              <button
                className={`tool-button ${mode === 'select' ? 'is-active' : ''}`}
                onClick={() => onMode('select')}
                title="Select and click any text or object directly to edit"
                disabled={!hasPdf}
              >
                <MousePointer2 size={15} />
                <span>Select & Edit</span>
              </button>
              <button
                className={`tool-button ${mode === 'text' ? 'is-active' : ''}`}
                onClick={() => onMode('text')}
                title="Click anywhere to add text"
                disabled={!hasPdf}
              >
                <Type size={15} />
                <span>Add text</span>
              </button>
              <button
                className="tool-button"
                onClick={onOcr}
                title="Scan this page with Tesseract OCR to recognize text"
                disabled={!hasPdf || isOcrBusy}
              >
                <ScanText size={15} />
                <span>{isOcrBusy ? 'Scanning…' : 'OCR Page'}</span>
              </button>
            </div>

            <div className="tool-group style-tools" aria-label="Text formatting">
              <select
                data-text-style
                aria-label="Font family"
                value={controls.fontFamily}
                onChange={(event) => onStyle('fontFamily', event.target.value)}
                disabled={!hasPdf}
              >
                <option value="Helvetica">Helvetica (Sans-Serif)</option>
                <option value="TimesRoman">Times (Serif)</option>
                <option value="Courier">Courier (Monospace)</option>
              </select>
              <label className="style-control size-control" title="Font size in pt">
                <span>Size</span>
                <input
                  data-text-style
                  type="number"
                  min="1"
                  max="200"
                  step="0.5"
                  value={controls.size}
                  onChange={(event) => onStyle('size', Number(event.target.value))}
                  disabled={!hasPdf}
                />
              </label>
              <button
                data-text-style
                className={`format-button ${controls.bold ? 'is-active' : ''}`}
                onClick={() => onStyle('bold', !controls.bold)}
                aria-pressed={controls.bold}
                disabled={!hasPdf}
                title="Bold"
              >
                <Bold size={13} />
              </button>
              <button
                data-text-style
                className={`format-button ${controls.italic ? 'is-active' : ''}`}
                onClick={() => onStyle('italic', !controls.italic)}
                aria-pressed={controls.italic}
                disabled={!hasPdf}
                title="Italic"
              >
                <Italic size={13} />
              </button>
              <label className="style-control color-control" title="Text ink color">
                <span>Color</span>
                <input
                  data-text-style
                  type="color"
                  value={controls.color}
                  onChange={(event) => onStyle('color', event.target.value)}
                  disabled={!hasPdf}
                />
              </label>
            </div>
          </>
        )}

        {/* TAB 2: ANNOTATE */}
        {activeTab === 'annotate' && (
          <>
            <div className="tool-group">
              <button
                className={`tool-button ${mode === 'highlight' ? 'is-active' : ''}`}
                onClick={() => onMode('highlight')}
                title="Highlight text or area"
                disabled={!hasPdf}
              >
                <Highlighter size={15} />
                <span>Highlight</span>
              </button>
              <button
                className={`tool-button ${mode === 'strike' ? 'is-active' : ''}`}
                onClick={() => onMode('strike')}
                title="Strikethrough"
                disabled={!hasPdf}
              >
                <Strikethrough size={15} />
                <span>Strike</span>
              </button>
              <button
                className={`tool-button ${mode === 'draw' ? 'is-active' : ''}`}
                onClick={() => onMode('draw')}
                title="Freehand drawing / pencil"
                disabled={!hasPdf}
              >
                <Pencil size={15} />
                <span>Draw</span>
              </button>
              <button
                className={`tool-button ${mode === 'whiteout' ? 'is-active' : ''}`}
                onClick={() => onMode('whiteout')}
                title="Whiteout eraser"
                disabled={!hasPdf}
              >
                <Eraser size={15} />
                <span>Whiteout</span>
              </button>
            </div>

            <div className="tool-group">
              <button
                className={`tool-button ${mode === 'rectangle' ? 'is-active' : ''}`}
                onClick={() => onMode('rectangle')}
                title="Draw rectangle"
                disabled={!hasPdf}
              >
                <Square size={15} />
                <span>Rectangle</span>
              </button>
              <button
                className={`tool-button ${mode === 'ellipse' ? 'is-active' : ''}`}
                onClick={() => onMode('ellipse')}
                title="Draw ellipse / circle"
                disabled={!hasPdf}
              >
                <Circle size={15} />
                <span>Ellipse</span>
              </button>
              <button
                className={`tool-button ${mode === 'line' ? 'is-active' : ''}`}
                onClick={() => onMode('line')}
                title="Draw straight line"
                disabled={!hasPdf}
              >
                <Minus size={15} />
                <span>Line</span>
              </button>
            </div>

            <div className="tool-group style-tools">
              <label className="style-control color-control" title="Annotation / shape stroke color">
                <span>Color</span>
                <input
                  data-text-style
                  type="color"
                  value={controls.color}
                  onChange={(event) => onStyle('color', event.target.value)}
                  disabled={!hasPdf}
                />
              </label>
              <label className="style-control size-control" title="Stroke width">
                <span>Stroke</span>
                <input
                  data-text-style
                  type="number"
                  min="1"
                  max="30"
                  step="1"
                  value={controls.size}
                  onChange={(event) => onStyle('size', Number(event.target.value))}
                  disabled={!hasPdf}
                />
              </label>
            </div>
          </>
        )}

        {/* TAB 3: INSERT & FORMS */}
        {activeTab === 'insert' && (
          <>
            <div className="tool-group">
              <button
                className={`tool-button ${mode === 'image' ? 'is-active' : ''}`}
                onClick={onImage}
                title="Insert an image"
                disabled={!hasPdf}
              >
                <ImageIcon size={15} />
                <span>Image</span>
              </button>
              <select
                aria-label="Image starting size"
                value={controls.imageSize}
                onChange={(event) => onStyle('imageSize', Number(event.target.value))}
                disabled={!hasPdf}
              >
                <option value="90">Size S</option>
                <option value="140">Size M</option>
                <option value="220">Size L</option>
              </select>
              <button className="tool-button" onClick={onSign} title="Create signature" disabled={!hasPdf}>
                <PenLine size={15} />
                <span>Sign</span>
              </button>
            </div>

            <div className="tool-group">
              <button
                className={`tool-button ${mode === 'link' ? 'is-active' : ''}`}
                onClick={() => onMode('link')}
                title="Insert clickable web link"
                disabled={!hasPdf}
              >
                <LinkIcon size={15} />
                <span>Link</span>
              </button>
              {mode === 'link' && (
                <input
                  className="compact-input link-url"
                  aria-label="Link URL"
                  value={controls.linkUrl}
                  onChange={(event) => onStyle('linkUrl', event.target.value)}
                  placeholder="https://example.com"
                />
              )}
            </div>

            <div className="tool-group">
              <button
                className={`tool-button ${mode === 'form' ? 'is-active' : ''}`}
                onClick={() => onMode('form')}
                title="Insert interactive form field"
                disabled={!hasPdf}
              >
                <CheckSquare size={15} />
                <span>Form Field</span>
              </button>
              <select
                aria-label="Form field type"
                value={controls.fieldType}
                onChange={(event) => onStyle('fieldType', event.target.value)}
                disabled={!hasPdf}
              >
                <option value="text">Text field</option>
                <option value="checkbox">Checkbox</option>
                <option value="radio">Radio</option>
                <option value="dropdown">Dropdown</option>
              </select>
              <input
                className="compact-input field-name"
                aria-label="Field name"
                placeholder="Field name"
                value={controls.fieldName}
                onChange={(event) => onStyle('fieldName', event.target.value)}
                disabled={!hasPdf}
              />
              <input
                className="compact-input field-value"
                aria-label="Field default value"
                placeholder="Default"
                value={controls.fieldValue}
                onChange={(event) => onStyle('fieldValue', event.target.value)}
                disabled={!hasPdf}
              />
            </div>
          </>
        )}

        <div className="toolbar-spacer" />

        {/* PERSISTENT ACTIONS (ALWAYS VISIBLE ACROSS ALL TABS) */}
        <div className="tool-group nav-tools">
          <button className="icon-button" onClick={onUndo} disabled={!canUndo} title="Undo last edit (Ctrl+Z)">
            <Undo2 size={16} />
          </button>
          <button className="icon-button" onClick={onDelete} disabled={!hasPdf} title="Delete selected object (Del)">
            <Trash2 size={16} />
          </button>
          <button className="tool-button" onClick={onFind} disabled={!hasPdf} title="Find and replace text (Ctrl+F)">
            <Search size={15} />
            <span>Find</span>
          </button>
          <button className="tool-button" onClick={onAnalyze} disabled={!hasPdf} title="Document Insights & Font Analysis">
            <BarChart2 size={15} />
            <span>Analyze</span>
          </button>

          <span className="nav-separator" />

          <button className="icon-button" onClick={() => onPage(page - 1)} disabled={!hasPdf || page <= 1} title="Previous page">
            <ChevronLeft size={16} />
          </button>
          <input
            className="page-input"
            aria-label="Current page"
            type="number"
            min="1"
            max={pageCount || 1}
            value={pageCount ? page : ''}
            onChange={(event) => onPage(Number(event.target.value))}
            disabled={!hasPdf}
          />
          <span className="page-total">/ {pageCount || '—'}</span>
          <button className="icon-button" onClick={() => onPage(page + 1)} disabled={!hasPdf || page >= pageCount} title="Next page">
            <ChevronRight size={16} />
          </button>

          <span className="nav-separator" />

          <button className="icon-button" onClick={() => onZoom(zoom - 0.15)} disabled={!hasPdf} title="Zoom out">
            <ZoomOut size={16} />
          </button>
          <span className="zoom-value">{Math.round(zoom * 100)}%</span>
          <button className="icon-button" onClick={() => onZoom(zoom + 0.15)} disabled={!hasPdf} title="Zoom in">
            <ZoomIn size={16} />
          </button>
          <button className="icon-button" onClick={onFit} disabled={!hasPdf} title="Fit to width">
            <Maximize2 size={16} />
          </button>
        </div>
      </nav>
    </div>
  );
}
