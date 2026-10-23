# Paper PDF

A local-first PDF reader and editor built with React, Vite, PDF.js, and pdf-lib. Open a document in your browser, make edits and annotations, and export a separate edited copy.

## Features

- Open PDFs from your device, drag and drop a file, or create a blank page.
- Read and navigate page thumbnails; search for text and replace matching runs.
- Select text to replace it in place. The editor reads each run's font hints, size, weight, style, direction, color, and position, and loads those values into the toolbar for that selection.
- Add styled text, typed signatures, links, and interactive form fields.
- Insert PNG and JPEG images, then move, resize, or remove them.
- Highlight, strike through, draw freehand, add shapes and lines, or cover a region with whiteout.
- Undo the last page edit, zoom, fit a page, inspect PDF font metadata, and export an edited copy.

## Run locally

Requirements: Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite (the default is `http://localhost:5173`). For a production build, run:

```sh
npm run build
npm run preview
```

## Project layout

- `src/App.jsx` coordinates document state and editor actions.
- `src/components/Toolbar.jsx` contains the tool and style controls.
- `src/components/PdfPage.jsx` renders PDF pages, selection, inline text editing, and annotations.
- `src/components/PageThumbnail.jsx` renders navigation previews.
- `src/hooks/usePdfDocument.js` manages PDF loading and blank-document creation.
- `src/lib/pdfEngine.js` handles PDF.js text analysis and pdf-lib export.

## Notes

- Text editing requires selectable text. Scanned pages need OCR before their text can be selected.
- When replacing text, the affected page is rebuilt from a high-resolution render with the original text area removed before the replacement is drawn. This removes the old page text from the exported page, but flattens that page and can affect forms, links, and selection. Replaced pages with patterned or colored backgrounds may need a better-matched cover color.
- PDF export uses the closest available standard PDF font. An embedded custom font may not match exactly.
- Most added text and annotations are flattened into the exported page. Form fields remain interactive and links remain clickable.
- PDF files are processed in the browser and are not uploaded by this app.
