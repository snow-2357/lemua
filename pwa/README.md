# Lemua

Lemua is a Vite-powered Progressive Web App. The production build includes a
web app manifest and a service worker that precaches the app shell and static
build assets for offline launches.

## Run locally

```sh
npm install
npm run dev
```

The service worker is enabled in production builds, not the Vite development
server. To test the installable build locally:

```sh
npm run build
npm run preview
```

Open the preview over `localhost` (or deploy it over HTTPS) to test installation.
On iPhone or iPad, open the deployed site in Safari, tap **Share**, then **Add
to Home Screen**. The app icon and standalone display are configured for iOS.

## Library

The library starts empty and contains only EPUBs that you import.
Use **Add an EPUB from Files** to import a book. Imported books and their
chapter text are saved in IndexedDB on this device. The reader currently
displays extracted chapter text; original EPUB styling and images are not
rendered.

Chapter boundaries use the EPUB table of contents, including anchors when several
chapters share one XHTML file. Sections follow the EPUB spine's reading order;
readable files are not discarded just because the contents omits them. Without a
table of contents, repeated top-level headings provide chapter boundaries.
Short chapters and readable front/back matter are retained. Previously imported
books are rebuilt from their saved EPUB when opened after a parser update, so no
re-import is required. The old chapter's opening paragraph is used to relocate
the reader where possible, with pagination restarting at that chapter's first page.

## On-device narration

Open a book and press the play button in the reader's bottom audio card to read
the current chapter aloud paragraph by paragraph while the reader stays visible.
Speech inference runs in a Web Worker so model execution does not block the
reader. While a paragraph plays, the next four passages are queued for
background generation and saved in IndexedDB; playback follows the saved
chapter order, and cached passages are reused on later listens. Inference runs
in the browser using ONNX Runtime Web; no application server is used. On first
use, the browser downloads the model, voice pack, and metadata (about 120 MB
total) from the project's Hugging Face repository and saves them in IndexedDB on
this device. Later launches reuse those saved files. An internet connection is
required for the initial download; browser storage can still be cleared or
evicted by the browser.

The PWA currently uses the bundled `tone_warm` voice with English (US)
phonemization. Speech is generated when playback starts and is not uploaded.

## Checks

```sh
npm run lint
npm run build
```

For browser-based EPUB regression tests, run the development server and open
`/tests/epub.html`. The tests use the browser's real HTML/XML parsers and generated
EPUB fixtures, including 135 chapters distributed across shared XHTML files.
