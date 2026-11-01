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

## Checks

```sh
npm run lint
npm run build
```
