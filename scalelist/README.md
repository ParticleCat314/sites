# Scale Compendium

Interactive reference of scale types: notation (sheetmusiccard/VexFlow), degree
formula, semitone steps, keyboard map, piano playback with note highlighting,
any tonic, eleven color themes.

## Develop

```sh
npm install
npm run build      # typecheck (tsc) + bundle (esbuild) -> dist/app.js
npm run watch      # rebuild bundle on change (no typecheck)
npm run typecheck  # tsc only
```

Serve the directory over HTTP — `python3 -m http.server` is enough — and open
it. `file://` still renders, but the service worker (and therefore offline use)
only registers over `http://localhost` or HTTPS.

## Putting it on a phone

```sh
npm run build:offline:piano   # offline/ — one self-contained 10.8 MB page
npm run build:offline         # same without the samples (2.1 MB, no offline audio)
cd offline && python3 -m http.server 8000
```

Open `http://<this-machine>:8000/` on the phone and use Add to Home Screen.
Serve `offline/`, not the repo root, for anything that has to survive without a
network.

**Use a port you have not served this app from before.** An iOS home-screen web
app keeps its storage — HTTP cache and service worker — keyed by origin, and
neither deleting the icon nor re-adding it clears that. Serving a new build at
an origin the phone already knows can therefore keep launching the old
document, which is how you end up staring at unstyled HTML. A fresh port is a
fresh origin. The alternative is Settings → Safari → Advanced → Website Data →
delete the entry.

Each build prints a timestamp at the very top of the page in plain markup, so
it survives any styling failure. If the phone does not show the timestamp from
the build you just served, it is serving something cached and the problem is
storage, not code.

The reason there are two builds: an iOS home-screen web app runs in its own
storage partition, so the service worker cache it relies on starts out empty
and only fills once the *installed* app has been launched with a network. Until
then Safari falls back to its HTTP cache, and a page whose CSS and JS are
separate files renders as bare unstyled HTML. `offline/index.html` has no
subresources at all — styles, fonts, bundle, music fonts and (with
`--with-piano`) the samples are inlined — so the document alone is the whole
app and there is nothing left to fail. Verified by loading it with every
network request except the document itself blocked: 79 cards, notation and
playback all still work.

## Offline / PWA

The app installs to a home screen and runs with no network:

- `manifest.webmanifest` + `icons/` — install metadata and icons
- `sw.js` — precaches the app shell (HTML, CSS, bundle, fonts, icons) on
  install and serves it cache-first
- `fonts/` — self-hosted text fonts and VexFlow's Bravura/Academico, so nothing
  is fetched from Google Fonts or jsDelivr at runtime
- Piano samples are the one exception: ~4 MB on `smpldsnds.github.io`, cached by
  the service worker as they are fetched. They arrive on the first Play, or via
  the "Save piano for offline use" button in the footer.

Navigations are network-first with a cache fallback: a stale cached document is
the worst failure mode this app has, because it can point at asset URLs that no
longer exist and leaves the user no way to force a refresh. Other shell files
are served cache-first and revalidated in the background, so a new build reaches
an existing visitor on their second load. Bump `VERSION` in
`sw.js` to drop the old cache outright, and add any new shell file to its
`SHELL` list.

Only the sampler's mezzo-forte velocity layer is loaded (62 files instead of
303, ~4 MB instead of ~20 MB); playback velocity is pinned inside that layer's
range and volume rides the output gain instead.

## Layout

- `index.html` — static shell
- `styles.css` — styling; themes are variable blocks under `[data-theme=…]`,
  phone layout lives in the `max-width: 640px` block at the end
- `src/offline.ts` — service worker registration, sample download control,
  theme-color sync
- `scripts/build-offline.mjs` — builds the self-contained `offline/` copy
- `src/data.ts` — scale catalog (spelled with tonic C) and category colors
- `src/theory.ts` — note parsing, letter-true transposition, degrees, intervals, MIDI
- `src/notation.ts` — stave rendering + playback via sheetmusiccard
- `src/vendor/sheetmusiccard/` — vendored copy of `../sheetmusiccard/src` (VexFlow wrapper: theming, playback, highlighting)
- `src/keyboard.ts` — one-octave keyboard map
- `src/themes.ts` — theme picker + localStorage persistence
- `src/main.ts` — page build, root picker, search filter

`c-scale-compendium.html` is the original single-file version, kept for reference.
