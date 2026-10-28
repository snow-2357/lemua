# Lemua — Project Context

Lemua is a simple mobile reading app built with Expo and React Native. It lets a
reader import EPUB files, keep them in a local library, and read their chapters.
The project is being developed as a lightweight, modular app with a warm,
eye-friendly interface.

## Current features

- Import EPUB files through the system document picker.
- Copy imported EPUBs into the app's persistent document storage and parse their
  metadata and chapters.
- Restore the library after app restarts using a local JSON manifest.
- Prevent duplicate EPUB imports using file fingerprints and normalized
  title/author metadata; remove a saved book and its local EPUB from the tile's
  options.
- Read EPUBs as a continuous sequence of swipeable, screen-sized pages, with
  chapters loaded on demand, page progress, restored per-book reading positions,
  completion percentages, and EPUB table-of-contents navigation.
- Generate English page narration locally with the Kokoro INT8 ONNX model,
  the bundled warm voice embedding, and on-device phonemization. The phonemizer
  model adds roughly 62 MB to the install; Kokoro requires a native development
  build and does not run in Expo Go.
- Keep generated native page WAVs on-device in book/chapter folders and reuse
  them when the same page text and speech speed are played again.
- Normalize unsupported punctuation and symbols before Kokoro phonemization;
  symbol-only text produces a short silent WAV rather than a character error.
- Continue narration automatically through readable pages and chapters,
  advancing the reader as each page finishes and stopping at the end of the book.
- During native reading, pre-generate and cache audio for up to five upcoming
  text pages sequentially, loading the next EPUB chapter when needed and
  refreshing the lookahead as the reader turns pages.
- Keep browser speech available in the web preview; native Android and iOS use
  Kokoro.
- Display embedded EPUB illustrations in their reading order as their chapters
  are loaded.
- Search the library and browse books in a horizontal shelf.
- Show the most recently opened book in the "Currently reading" section.
- Use distinct decorative marks and a rotating, muted cover-color palette.
- Edit and locally persist the profile name; its first letter appears in the
  profile avatar and library header.
- Switch between light and dark appearance from the profile page; the selected
  theme is stored locally and applies across the library, profile, and reader.
- Use short, underscore-cleaned titles on book tiles and covers.
- Keep the audio preview card and import card in the library UI.

## Main app structure

- `App.tsx` — switches between the library, profile, and reader screens.
- `src/screens/LibraryScreen.tsx` — library layout and search results.
- `src/screens/ProfileScreen.tsx` — profile name editor.
- `src/screens/ReaderScreen.tsx` — EPUB reading view and chapter controls.
- `src/components/` — reusable library, book cover, profile, and audio UI.
- `src/hooks/useLibraryController.ts` — import, open, and recent-book behavior.
- `src/services/epubReader.ts` — copies and parses EPUB files.
- `src/services/libraryStorage.ts` — saves/restores book metadata in
  `library.json`.
- `src/services/profileStorage.ts` — saves/restores the profile name in
  `profile.json`.
- `src/services/themeStorage.ts` and `src/context/ThemeContext.tsx` — persist and
  provide the app-wide light/dark theme.
- `src/services/bookMarks.ts` and `src/services/bookColors.ts` — stable visual
  identifiers for saved books.
- `src/utils/bookTitle.ts` — cleans underscores and limits displayed tile-title
  length.
- `src/styles/` — screen and component styles.

## Local data

Book metadata and the profile name are stored in the app's document directory.
Imported EPUB copies are also kept there, under the `books` directory. This is
on-device storage, not cloud sync; uninstalling the app may remove its data.

## Not implemented yet

- Profile editing currently covers the display name only. There is no account or
  cloud profile.
- Device-level persistence and reading behavior should be verified on Android
  and iOS; a successful JavaScript bundle does not replace that runtime test.

## Useful checks

Run these from the `mobileapp` directory:

```sh
npm run lint
npx tsc --noEmit
npx expo export --platform android
```
