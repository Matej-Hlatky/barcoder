# Barcoder — Design Spec

Date: 2026-08-25
Status: Approved, ready for implementation planning

## 1. Purpose

A mobile-first single-page app for generating linear and 2D barcodes. One text
input, a symbology picker, code-specific options with scanning-safe defaults, a
live preview, a fullscreen display mode for scanning off the phone screen, and
download in five formats.

The entire app state lives in the query string. Copying the URL and pasting it
elsewhere reproduces the exact same state.

### Non-goals

Multiple codes at once, batch or CSV input, file upload, label-sheet layout,
barcode scanning or decoding, accounts, persistence beyond the URL, analytics.

## 2. Constraints

- Mobile-first. Fast first paint on a phone over mobile data.
- Minimum runtime dependencies. No JS framework.
- Flat design, simple colors, large type, generous padding.
- Light/dark mode following the OS setting, with a manual override.
- System fonts only: `system-ui, -apple-system, "Segoe UI", "Helvetica Neue", sans-serif`.
- No cookies, no cookie banner, no third-party requests.
- Static hosting on GitHub Pages, built and deployed by GitHub Actions.

## 3. Technology decisions

| Decision | Choice | Rationale |
|---|---|---|
| Encoder | `@bwip-js/browser` v4, named imports | Standards-correct encoder for all ten symbologies. Tree-shakes to 102 KB gzip for the chosen set; renders human-readable text as vector outlines, so exports need no font. |
| SVG output | `drawingSVG()` (public export) | Verified: works with named symbology imports and preserves tree-shaking. SVG is the single source for every export. |
| UI layer | Vanilla ES modules, no framework | State is one flat object; DOM is small. Keeps the shell at ~6-8 KB gzip. |
| Loading | Shell eager, encoder + each exporter via `import()` | First paint never waits on the 102 KB encoder chunk. |
| PDF | Hand-rolled writer, ~150-200 lines | Text is already outlined and paths use only M/L/Q/Z, so no font embedding and no arc handling. A library would cost 100 KB+ gzip for one path and a page box. |
| Offline | None. No service worker, no manifest | Hashed filenames plus HTTP caching make repeat visits fast without a stale-cache failure mode. Addable later without redesign. |
| Build | esbuild + a ~40-line Node script | Bundling, minification, code splitting, hashed names. Vite's dependency tree is unjustified with no framework and no HMR need. |
| Tests | Vitest + one Playwright smoke test | Pure logic is the bulk and is cheap to unit test; canvas/blob/dialog cannot be faked in jsdom. |

### Measured bundle sizes (esbuild bundle + minify, gzip -9)

| Content | gzip |
|---|---|
| bwip-js runtime + one symbology | ~50 KB |
| bwip-js, ten symbologies + `drawingSVG` | 102 KB |
| bwip-js via the `toSVG()` barrel (no tree-shaking) | 254 KB |

Marginal cost per additional symbology after the first: ~10-13 KB gzip.
**Named imports are mandatory** — a default import (`import bwip from …`) defeats
tree-shaking and pulls in 254 KB.

## 4. Architecture

A single flat state object is the only source of truth. The query string is its
serialization. Everything else is a pure function of it.

```
state = { s: 'qrcode', t: 'hello', <non-default options...> }
           |                    |                      |
      URL (replaceState)   encode(state)        render -> SVG string
```

### URL contract

| Key | Meaning |
|---|---|
| `s` | Symbology id (from `symbologies.js`). Absent means the default. |
| `t` | The text to encode, percent-encoded. |
| others | Option keys, using the schema's own `k` names verbatim (`eclevel`, `height`, `includetext`, `margin`, ...). Present only when the value differs from the schema default. |

- **The Linear/2D group is never serialized.** It is derived from `s`, so there
  is exactly one representation of any given state.
- Booleans serialize as `1` / `0`.
- An option that is "auto" (PDF417 columns and error correction) is represented
  by absence, never by a sentinel value.
- `margin` is one UI control and one URL key; the schema maps it to both
  `paddingwidth` and `paddingheight` at encode time. A schema option may
  therefore declare a `bwip` field naming one or more encoder options; when
  omitted, `k` is used as the encoder option name directly.
- Text length is not capped by the app. Practical URL limits apply to sharing,
  and over-capacity input surfaces as an ordinary encoder error.

### Modules

| Module | Responsibility | Depends on |
|---|---|---|
| `index.html` | Shell, inlined critical CSS, inlined theme bootstrap | — |
| `src/symbologies.js` | Pure data: id, label, group, bcid, option schema | — |
| `src/state.js` | State object, defaults, `toQuery()` / `fromQuery()` | `symbologies` |
| `src/ui.js` | Renders shell and option controls from schema; binds events | `state`, `symbologies` |
| `src/encoder.js` | Lazy chunk. Named bwip-js imports + `drawingSVG()`. `encode(state) -> svg` | bwip-js |
| `src/svg.js` | `normalize(svg)`: inject width/height, prepend white background rect | — |
| `src/export/png.js`, `webp.js`, `svg.js`, `vectordrawable.js`, `pdf.js` | Lazy, one per format. `(svg) -> Blob` | `src/svg.js` |
| `src/download.js` | Blob -> `<a download>` -> revoke; filename construction | — |
| `src/dialog.js` | Fullscreen display dialog, wake lock | — |
| `src/theme.js` | OS preference, manual override, persistence | — |

`symbologies.js` being pure data is the load-bearing boundary: adding an
eleventh symbology is a data edit, with no new UI, validation, or export code.

### Data flow per keystroke

1. `input` event mutates state.
2. `history.replaceState` with the new query string, throttled to one call per
   animation frame. Always `replaceState`, never `pushState`, so typing does not
   fill the back button.
3. `encode(state)` inside `try/catch`.
4. Success: swap the SVG into the preview, clear the error region.
   Failure: show the stripped message, keep the last valid code at 40% opacity.

The preview injects the **raw** encoder SVG, sized by CSS (`width: 100%;
height: auto`, which the `viewBox` alone makes work) on the white preview card.
`normalize()` is an export-path concern only, so nothing in the preview depends
on it and the two paths cannot drift into disagreeing about geometry.

No Web Worker. Encoding measures in low single-digit milliseconds; a worker would
add message passing and a second chunk-loading path for no perceptible gain.

### Default state and switching

- A bare URL with no parameters opens **QR, empty text, all options at default**.
- Switching the Linear/2D segmented control selects that group's default
  symbology: **Code 128** for linear, **QR** for 2D.
- Switching symbology **keeps the text and the shared options** (`scale`,
  `margin`) and **drops options the new symbology does not define**. Options the
  new symbology defines but the old one did not start at their defaults.

### Hydration and robustness

On load, `fromQuery()` parses the URL. Unknown parameters are ignored,
out-of-range numbers clamp to their schema bounds, an unknown symbology falls
back to the default. A malformed URL may degrade but must never produce a blank
screen or an uncaught throw.

Only values differing from their schema default are serialized, keeping the
common URL short: `?s=qrcode&t=hello`.

## 5. Symbologies and options

Schema entry shape:

```js
{ id:'ean13', label:'EAN-13', group:'linear', bcid:'ean13',
  options:[ {k:'height', type:'number', def:10, min:5, max:50, label:'Bar height'},
            {k:'includetext', type:'bool', def:true, label:'Show text'} ] }
```

Shared by all ten: `scale` ("Size", default 3, range 1-10) and
`paddingwidth`/`paddingheight` driven by one "Margin" control (default 2, range
0-20) — the quiet zone scanners require.

| Symbology | Group | bcid | Own options (defaults) |
|---|---|---|---|
| Code 128 | linear | `code128` | Bar height (10), Show text (on) |
| Code 39 | linear | `code39` | Bar height (10), Show text (on), Add check digit (off, mod-43) |
| EAN-13 | linear | `ean13` | Bar height (10), Show text (on), Guard whitespace (on) |
| EAN-8 | linear | `ean8` | Bar height (10), Show text (on), Guard whitespace (on) |
| UPC-A | linear | `upca` | Bar height (10), Show text (on), Guard whitespace (on) |
| ITF-14 | linear | `itf14` | Bar height (10), Show text (on), Bearer bar width (4) |
| QR | 2d | `qrcode` | Error correction: L/**M**/Q/H |
| DataMatrix | 2d | `datamatrix` | Shape: **Square**/Rectangle (`format: square|rectangle`) |
| PDF417 | 2d | `pdf417` | Columns (auto, 1-30), Error correction (auto, 0-8), Compact (off) |
| Aztec | 2d | `azteccode` | Error correction % (23) |

All option names verified working against `@bwip-js/browser` 4.11.4.

Defaults are the library's scanning-safe recommendations. QR at M and Aztec at
23% survive a scuffed print or an angled phone screen without inflating the symbol.

Excluded from v1, each one schema line to add later: rotation, Code 128 `^`
escape parsing, micro-QR, explicit DataMatrix rows/columns, EAN add-ons, and
foreground/background color pickers (generic rather than code-specific, and
colored barcodes measurably hurt scan reliability).

## 6. Validation and error handling

There are no client-side validation rules. The encoder is the single authority.
Hand-written length and charset checks would be a second, drift-prone copy of
what bwip-js already knows, and would need updating for every new symbology.

bwip-js messages are already user-facing quality and need only a prefix strip:

| Raw | Shown |
|---|---|
| `bwipp.ean13badLength#6878: EAN-13 must be 12 or 13 digits` | EAN-13 must be 12 or 13 digits |
| `bwipp.code39badCharacter#10257: Code 39 must contain only digits, capital letters, spaces and the symbols -.$/+%` | Code 39 must contain only digits, capital letters, spaces and the symbols -.$/+% |
| `bwipp.datamatrixTooMuchData#25674: The input data exceeds the symbol capacity` | The input data exceeds the symbol capacity |

Strip with `/^bwipp?[.\-][\w#]*:?\s*/`.

Rules:

- **Empty input is not an error.** It is the empty state: muted placeholder in
  the preview area, download buttons disabled.
- Error text sits in an `aria-live="polite"` region directly under the input.
- **The preview never clears on error.** Typing toward a valid EAN-13 is invalid
  at every intermediate keystroke; blanking the card would strobe. The last valid
  code dims to 40% instead.
- The URL updates even on invalid input, so a shared link reproduces exactly what
  was on screen, error included.

## 7. Visual design

### Layout — single column, max-width 640px, centered on desktop

```
+-----------------------------+
| Barcoder            [ dark ]|  header + theme toggle
+-----------------------------+
| [  Linear  |  2D  ]         |  segmented control
| [ Code 128            v ]   |  native <select>
| [ ABC-123               ]   |  the one text input, large, slashed zeros
+-----------------------------+
|  |||| || ||| |  ||| ||      |  preview card, tap to enlarge
|      ABC-123                |  sticky on scroll
+-----------------------------+
| [PNG][WEBP][SVG][XML][PDF]  |  download row, wraps
+-----------------------------+
| > Options                   |  <details>, collapsed
+-----------------------------+
```

The input sits directly above the preview so the code stays visible while the
on-screen keyboard is open. The preview card is `position: sticky`, keeping the
code in view while the Options accordion is open and scrolled.

### Visual language

- 18px base type; **20px on inputs** — under 16px, iOS Safari auto-zooms on
  focus. This is functional, not aesthetic. Headings 28px.
- **The text input enables slashed zeros**, so `0` is never mistaken for `O`
  while typing or proofreading barcode data:
  `font-variant-numeric: slashed-zero tabular-nums;` with
  `font-feature-settings: "zero" 1, "tnum" 1;` as a fallback for older engines.
  Tabular figures ride along so digits align while scanning a long value by eye.
  SF Pro (iOS/macOS) supports the `zero` feature; support in Segoe UI and
  Helvetica Neue is not guaranteed, and where the feature is absent the browser
  silently renders an ordinary zero — a degradation, never a breakage. This is
  also why the input keeps the system font rather than switching to monospace:
  the requirement is legible digits, not fixed-width text.
- 20px padding, 16px gaps, every interactive target at least 48px tall.
- Flat: no shadows, no gradients. 8px radius, 1px borders, one accent color.
- Native controls throughout (`<select>`, `<input type=number>`, checkboxes) —
  faster on a phone than any custom widget, zero bytes, accessible by default.

### Theming

Seven CSS custom properties on `:root`, overridden in a
`@media (prefers-color-scheme: dark)` block and again under `[data-theme="dark"]`
so the manual toggle wins in both directions. `color-scheme` is set so native
controls and scrollbars follow.

An inline blocking script in `<head>` reads the stored preference and stamps
`data-theme` before first paint; without it, dark-mode users get a white flash on
every load.

**The barcode is always black on white**, in both themes. In dark mode the
preview sits on a white card. Inverted barcodes fail on many laser scanners;
correctness beats aesthetic consistency.

### Display dialog

Native `<dialog>` + `showModal()`, giving focus trap, Esc-to-close, and an inert
background for free.

1. Fills the viewport, **pure `#fff` regardless of theme**, code scaled to fit
   with a quiet-zone margin.
2. **Wake Lock API** requested on open, released on close, so the screen does not
   dim or sleep mid-scan. Feature-detected; absence is silent.
3. Tap anywhere, Esc, or a large close button dismisses it.

**No `requestFullscreen()`** — deliberately excluded for consistent behavior
across platforms.

**On brightness:** no browser exposes a screen-brightness API. The white backdrop
plus wake lock is the entire mechanism. On OLED the white fill genuinely raises
emitted light; on LCD it maximizes contrast. It does not override the user's
brightness slider, and UI copy must not imply that it does.

## 8. Export pipeline

### Verified properties of bwip-js SVG output

- Root carries `viewBox` only, **no `width`/`height`** — some browsers refuse to
  rasterize such an SVG through `Image`.
- **No background rect; output is transparent.**
- Only `<path>` elements, one or many (EAN-13 emits 17).
- Path commands are **M, L, Q, Z only** — no cubics, no arcs.
- Human-readable text is emitted as outlined glyph paths, not `<text>`.

### Shared normalization

`normalize(svg)` injects `width`/`height` from the `viewBox` and prepends an
explicit **white background rect**. All five formats get the white background: a
transparent barcode composited onto a dark surface fails silently, and stripping
one rect is easier than debugging a scanner that will not read a sticker.

### Formats

| Format | Method |
|---|---|
| SVG | Normalized string to Blob (`image/svg+xml;charset=utf-8`). |
| PNG / WEBP | Blob URL to `Image` to canvas to `toBlob()`. **Integer** scale factor so the longest edge clears 1024 px, capped at 4096, keeping module edges on exact pixel boundaries. WEBP is feature-detected with `toDataURL('image/webp')` and its button hidden when encoding is unsupported. Object URLs revoked after use. |
| Android VectorDrawable XML | `viewBox` to `android:viewportWidth`/`Height`, `width`/`height` in dp, each `<path d>` to `<path android:pathData>` with `android:fillColor="#FF000000"`. VectorDrawable accepts the same M/L/Q/Z subset. Background becomes an explicit rect path. |
| PDF | Hand-rolled. `1 0 0 -1 0 H cm` flips SVG's y-down axis. M to `m`, L to `l`, Z to `h`, Q to `c` via the quadratic-to-cubic lift (controls at two-thirds toward the quadratic control). Fill with `f`; PDF's nonzero rule matches SVG's default `fill-rule`. Page is code size plus a 20 pt margin, 1 SVG unit = 1 pt. No font embedding, no compression. |

Delivery is `createObjectURL` plus a synthetic `<a download>` click, then revoke.
Filename is `<symbology>-<sanitized-text>.<ext>`: the text lowercased with every
character outside `[a-z0-9]` collapsed to a single `-`, trimmed of leading and
trailing `-`, truncated to 32 characters. Text that sanitizes to nothing yields
`<symbology>.<ext>`.

Each exporter is its own dynamic import; tapping PDF is what loads the PDF code.

## 9. Build and deployment

**esbuild** as the single dev dependency for bundling: minify, `splitting: true`
for the lazy encoder and exporter chunks, hashed filenames, ES2020 target.

A ~40-line Node script inlines the critical CSS and the theme bootstrap into
`index.html` and rewrites the hashed entry path.

**All asset paths are relative** (`./assets/...`), so the GitHub Pages project
sub-path `/barcoder/` needs no base-path configuration.

**GitHub Actions**, on push to `master` (the repository's current and only
branch; the trigger follows the default branch if it is ever renamed): `actions/checkout`, `setup-node`,
`npm ci`, `npm run build`, `upload-pages-artifact`, `deploy-pages`. Permissions
`contents: read`, `pages: write`, `id-token: write`.

**No cookie banner:** no cookies, no analytics, no third-party requests, no CDN
fonts. The only stored value is the theme preference in `localStorage`, set by
explicit user action, which is outside consent scope.

## 10. Testing

**Vitest** for all pure logic:

- `state.js`: URL round-trip (`fromQuery(toQuery(s))` equals `s`) across generated
  states; non-default-only serialization; clamping; unknown-parameter tolerance;
  unknown-symbology fallback.
- `symbologies.js`: every entry has a valid bcid and every option default lies
  within its own min/max.
- Error prefix stripping across the real message samples above.
- Quadratic-to-cubic conversion against hand-computed control points.
- VectorDrawable transform: viewBox mapping, path count preserved, pathData
  matches source `d`.
- PDF writer: **xref byte offsets match actual byte positions** (the invariant
  that actually breaks), object count, trailer correctness.

**Playwright**, one smoke test for what jsdom cannot fake: load the page, type a
value, assert an SVG appears, trigger each of the five downloads and assert blob
type and non-trivial size, open and close the display dialog.

No visual snapshot tests: snapshot churn across browser and OS versions is a
recurring tax that outweighs the geometry-regression risk for ten symbologies.

## 11. Risks

| Risk | Mitigation |
|---|---|
| A default bwip-js import silently reverts tree-shaking, tripling bundle size | Assert a bundle-size ceiling in CI as part of the build script |
| Browsers without canvas WEBP encoding | Feature-detected; button hidden rather than producing a mislabeled PNG |
| Hand-rolled PDF malformed on some symbology's path output | Structural unit tests plus the Playwright download check across all ten |
| Wake Lock unsupported or rejected | Feature-detected, failure is silent; the white backdrop still works |
