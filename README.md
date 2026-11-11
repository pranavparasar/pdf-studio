# PDF Studio

A browser-based PDF reader and quick editor. Read PDFs, add text annotations, draw, highlight, rotate/delete pages, extract a page, merge files, and download the edited document.

## Features
- Open and read PDF files with page navigation and zoom
- Add text annotations, freehand drawings, and rectangular highlights
- Rotate or delete the current page
- Download the current page as a separate PDF
- Merge additional PDF files into the open document
- Download the edited PDF
- Responsive desktop/mobile interface
- Local browser processing: PDF documents are not uploaded to a server

## Tech stack
HTML, CSS, JavaScript, [PDF.js](https://mozilla.github.io/pdf.js/) and [PDF-Lib](https://pdf-lib.js.org/).

## Run locally
1. Extract the ZIP.
2. Open the folder in VS Code.
3. Start a local server using VS Code Live Server, or run `python -m http.server 5500` in the project folder.
4. Visit `http://localhost:5500`.

The app loads its PDF libraries from public CDNs, so an internet connection is required to launch it. Your PDF files stay in your browser.

## Publish on GitHub Pages
1. Create a GitHub repository (for example, `pdf-studio`).
2. Upload `index.html`, `style.css`, `script.js`, `README.md`, and `LICENSE` to the repository root.
3. Go to **Settings → Pages**.
4. Under **Build and deployment**, select **Deploy from a branch**.
5. Select branch **main** and folder **/(root)**, then save.
6. GitHub will show the published website URL in the Pages settings.

## Git commands
```bash
git init
git add .
git commit -m "Initial commit: PDF Studio"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/pdf-studio.git
git push -u origin main
```
Replace `YOUR-USERNAME` with your GitHub username.

## Important limitations
- Text is added as a new annotation layer; this does not rewrite existing PDF text in place or preserve complex original layouts after text replacement.
- Highlighting is a translucent rectangular area, not automatic text selection.
- Changes are held in the working document until you click **Download PDF**.
- Password-protected, encrypted, damaged, or unusually complex PDFs may not work.
- Use a modern browser. The app needs an internet connection to load PDF.js and PDF-Lib from CDNs.

## Project structure
```text
pdf-studio/
├── index.html
├── style.css
├── script.js
├── README.md
└── LICENSE
```
