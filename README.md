# Paper PDF

A local browser PDF editor based on the Sejda PDF editor workflow observed by REA (capture evidence `ev_4e24f6e24628b5b53bcb72efa363d927843f6bf3d926b60c10d384adc71aeed9`). It keeps processing in your browser.

## Run
Serve this folder over HTTP with `py -m http.server 8000`, then visit http://127.0.0.1:8000. The first load fetches PDF.js and pdf-lib from public CDNs.

## Tools
Open a PDF or start a blank document. Use Edit text to click selectable text and replace or delete it. Add text, typed signatures, images, links, text/checkbox/radio/dropdown form fields, highlights, strike-through, pen strokes, rectangles, ellipses, and lines. Search and replace text runs, choose fonts and colors, move or resize inserted images, whiteout regions, undo, and export an edited copy.

Text replacement and whiteout are visual overlays. They do not securely remove the original PDF content or preserve the exact original font/background. Scanned text needs OCR. New form fields are interactive PDF fields; many other edits are flattened into the saved copy.
