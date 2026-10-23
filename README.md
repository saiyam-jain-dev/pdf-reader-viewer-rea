# PDF Reader & Viewer REA

A lightweight PDF reader and editor that runs in your browser. Open a PDF from your device, make common edits and annotations, then download an edited copy.

## Features

- **Open and read:** Choose a PDF or drag and drop one into the window. Start a one-page blank document when you want to create a PDF from scratch.
- **Edit text:** Click selectable PDF text to replace or delete it. Add new text with font, size, color, bold, and italic options. Find text and replace matching text runs across the document.
- **Add and manage images:** Insert PNG or JPEG images, choose a starting size, move or resize them, and delete selected images.
- **Sign and link:** Place a typed signature or add a clickable web link to a page.
- **Add form fields:** Place text fields, checkboxes, radio buttons, or dropdowns, with a field name and default text where applicable.
- **Annotate and draw:** Highlight, strike through, draw freehand, add rectangles, ellipses, and lines, or cover an area with whiteout.
- **Navigate and review:** Browse page thumbnails, jump between pages, search, zoom in or out, fit a page to the viewer, undo the last edit on a page, and delete a selected item.
- **Export:** Apply edits and download a separate `-edited.pdf` copy.

## Getting started

The app is a static website. It does not need a build step or package installation.

1. Install Python 3 if it is not already available.
2. Open a terminal in this folder.
3. Start a local web server:

   ```sh
   python -m http.server 8000
   ```

   On Windows, `py -m http.server 8000` also works.

4. Open [http://127.0.0.1:8000](http://127.0.0.1:8000) in a modern browser.
5. Choose a PDF, drop one into the page, or select **Blank document**.

The first page load downloads PDF.js and pdf-lib from jsDelivr, so an internet connection is required to load the editor. After that, PDF files are processed in the browser and are not uploaded by this app.

## Editing a PDF

1. Select a tool from the toolbar.
2. For **Edit text**, click text in the PDF, change it in the dialog, then choose **Apply**. Use **Delete text** in the dialog to cover the selected text.
3. For **Text** or **Sign**, place the item on the page and enter its contents. For **Image**, choose a PNG or JPEG, then click the page to place it.
4. Use **Select** to move items. Click an item and choose **Delete** to remove it. Use **Undo** to remove the last edit on the current page.
5. Choose **Apply changes & download** to save an edited copy.

## Editing notes and limitations

- Text editing works with selectable text in the PDF. Scanned pages are images and need OCR before their text can be selected.
- Replaced or deleted text is covered with a white overlay. Whiteout also covers content visually; neither operation securely removes the original text or image data from the PDF.
- Replacement text uses an available standard font and may not match the original font, spacing, or background exactly. Review the exported copy, especially on colored or patterned pages.
- Most added text, signatures, images, drawings, and annotations are flattened into the exported page. Added form fields remain interactive; links are exported as PDF links.
- Image insertion accepts PNG and JPEG files.
- Editing starts from the original PDF each time you open it. Download the edited copy to keep your changes.
