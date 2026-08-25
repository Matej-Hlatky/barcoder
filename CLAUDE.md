# Barcoder — working notes

A vanilla-ES-module SPA. No framework, one runtime dependency. Read the spec at
`docs/superpowers/specs/2026-08-25-barcoder-design.md` before changing behaviour
— it is the authority on the URL contract and the visual rules.

## Invariants that are easy to break

**Import bwip-js by name, never as a default.** `src/encoder.js` imports the ten
symbology functions plus `drawingSVG` individually. A default import defeats
tree-shaking and takes the encoder chunk from ~100 KB to ~254 KB gzip.
`npm run build` fails above 115 KB, so this shows up as a failed build.

**The vector exporters must use `fillPathsOf()`, never the raw `d` attributes.**
bwip-js draws linear bars as zero-area *stroked* polylines. Filling those paints
nothing — PDF and VectorDrawable exports came out blank for all six linear
symbologies until `src/svg.js` learned to widen strokes into rectangles. 2D
symbologies are filled polygons and never showed the bug, so always check a
linear symbology when touching an exporter.

**`src/export/pdf.js` converts to bytes with `charCodeAt(i) & 0xff`, not
`TextEncoder`.** PDF xref entries are string offsets; a multi-byte encoding
shifts every one of them and corrupts the file. `toPdf` is ASCII-only today and
a test enforces that — if you ever embed user text in the document, change the
conversion in the same commit.

**`history.replaceState`, never `pushState`.** Typing must not fill the back
stack.

**Defaults are absent from the URL.** `toQuery` omits any value equal to its
schema default, and `fromQuery` fills defaults back in. So state must always
carry an explicit value for every option whose `def` is not `null` — dropping a
key instead falls through to bwip-js's own default and the URL stops round-
tripping. `def: null` means "auto", and absence is the correct representation.

**`src/symbologies.js` is pure data and its option objects are shared by
reference** (`barHeight`, `showText`, `guard` appear in several symbologies).
Never mutate an option object; derive instead.

**Validation lives in the encoder.** There is no hand-written input validation.
`encode()` lets bwip-js throw and strips the `bwipp:`-style prefix from the
message. Do not add a parallel validation path.

## Conventions

- Options render themselves from the schema (`type: 'number' | 'bool' | 'enum'`).
  Adding a symbology or an option means editing `src/symbologies.js` and nothing
  in `src/ui.js`.
- Every export format is a lazy chunk behind `FORMATS[].load()`.
- Theme uses the three-block cascade in `src/styles.css`: `:root`, then
  `@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) }`,
  then `:root[data-theme='dark']`. Never define a colour only inside a media
  block.
- Tap targets are at least 48px.
- Comments explain why, not what. The codebase carries about twenty of them;
  keep it that way.

## Testing

`npm test` for unit tests, `npm run e2e` for Playwright (it rebuilds first, so
it can never run against a stale `dist/`). jsdom tests need the
`// @vitest-environment jsdom` pragma at the top of the file.

Export tests share `test/helpers.js`: `SAMPLES` (one valid payload per
symbology) and `filledArea()` (shoelace area, used to assert an export actually
encloses ink rather than drawing zero-area lines).
