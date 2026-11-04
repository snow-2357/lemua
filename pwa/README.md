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

Open a book and press play in the bottom audio card to listen from the current
page. Text is grouped into sentence-aware passages, with a shorter opening
passage to reduce startup time and larger subsequent passages for natural phrasing.
Speech inference runs in a Web Worker so model execution does not block the
reader. Audio is scheduled on a continuous Web Audio timeline while a single
background producer prepares more. Lookahead adapts to generation time (20–60
seconds, capped at four decoded passages); cached audio bypasses the worker queue.
Generated passages are saved in IndexedDB using text/voice/speed keys and reused
independently of pagination or chapter position. Inference runs
in the browser using ONNX Runtime Web; no application server is used. On first
use, the browser downloads the model, voice pack, and metadata (about 120 MB
total) from the project's Hugging Face repository and saves them in IndexedDB on
this device. Later launches reuse those saved files. An internet connection is
required for the initial download; browser storage can still be cleared or
evicted by the browser.

The PWA currently uses the bundled `tone_warm` voice with English (US)
phonemization. Speech is generated when playback starts and is not uploaded.
First-use download/model startup and devices that cannot synthesize faster than
playback can still cause waiting; the card reports loading/buffering without
covering or disabling the reader. Pause and stop remain available during loading.
Pausing stops playback but continues saving approximately the next 1,000 words
from the paused passage (or to chapter end). The final passage is completed rather
than split mid-sentence, so the word count can slightly exceed 1,000. This larger
lookahead is stored as WAVs in IndexedDB, not decoded into memory; the four-passage
playback limit still applies. Resuming prioritizes cached playback over a distant
prefetch, and repeated pauses at the same position do not extend the word window.
Stopping, leaving the reader, or changing chapter cancels obsolete queued work;
an inference already executing may finish before the worker handles cancellation.
Page following is opt-in through **Follow text**. Manual page buttons turn it off,
so you can browse independently while listening.

## Checks

```sh
npm run lint
npm run build
```

For browser-based EPUB regression tests, run the development server and open
`/tests/epub.html`. The tests use the browser's real HTML/XML parsers and generated
EPUB fixtures, including 135 chapters distributed across shared XHTML files.

Open `/tests/narration.html` for narration grouping, cache, cancellation,
bounded-buffer, pause/resume, error, and continuous-scheduling regressions.
`/tests/narration-ui.html` is an interactive fixture using delayed, silent audio
instead of downloading the model, for checking that page navigation and audio
controls remain available during generation.
