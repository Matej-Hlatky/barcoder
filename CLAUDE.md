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

**Two accent tokens, and they are not interchangeable.** `--accent` is a pastel
fill and is only ever a background, with `--accent-ink` on top of it. `--focus`
is a deeper shade for outlines, focused borders and active edges. The pastel is
~1.7:1 against the page — below the 3:1 a focus indicator needs — and white on
the deep shade is 3.8:1, below the 4.5:1 text needs. Neither token can do the
other's job. `test/styles.test.js` checks the ratios.

**Everything a control positions from its padding box is derived from `--bw`,
never written literally.** Focus thickens a control's border from 1px to 2px,
and the padding box shrinks by that pixel on every side. `padding: 0 calc(17px -
var(--bw))` gives the pixel back, which is why `.downloads button` and
`.text-input` use the calc form too — but padding is not the only thing measured
from that box. The select caret is placed with `background-position: right
calc(15px - var(--bw))` for the same reason, and `.theme` cannot use the trick at
all: its thumb and icons are absolutely positioned, so it holds `--bw` at 1px and
draws its focus ring with an inset `box-shadow` instead. Anything that shifts by
exactly 1px when a control takes focus is this bug.

**Focus is drawn with the border, not an outline.** The `outline` in the
`:focus-visible` rule is transparent on purpose: it exists so forced-colors mode
still paints a ring. A control with no border on some side needs that side drawn
another way — `.group button:not(:first-child)` has no left border, because the
segmented pair shares one divider, so it gets an inset box-shadow instead.

**The options panel animates by collapsing one grid row, so the fields need
their own wrapper.** `.fields` is that wrapper; `renderSymbologyOptions` fills it
rather than the `<details>`. `interpolate-size` is Chrome-only, so `height: auto`
cannot be interpolated — `::details-content` goes `grid-template-rows: 1fr → 0fr`
instead, which animates in both engines. The open rule must also restore
`content-visibility: visible`; without it the panel stays 0px high.

**Nothing measures the option tip before placing it.** `placeTip` runs on
`beforetoggle`, when the popover is not yet laid out and its rect reads 0. Its
width is pinned in CSS so JS knows it without asking, and anchoring by `bottom`
in the lower half of the viewport removes any need for its height. Measuring on
`toggle` instead left it at the viewport origin roughly one open in five.

**The tip's scroll dismissal is armed a frame late.** Tapping the button can
itself scroll the page, and that scroll event arrives after the popover opens —
arming immediately closed the tip on the same tap.

**An open tip must be closed by every route that can take its row away.** Four
exist: scrolling, resizing, re-rendering the options, and collapsing the panel.
Only light-dismiss is free. Removing a showing popover from the document, or
hiding it under `content-visibility`, does not fire `beforetoggle`, so its
listeners stay attached and it comes back at stale coordinates — after which the
next tap on that (i) closes it instead of opening it. `closeTips()` is the single
cleanup; a new way to dismiss a row needs to call it.

**Every option needs an `info` string.** `test/symbologies.test.js` fails the
build without one. It is the text behind the (i) next to each label.

## Conventions

- Options render themselves from the schema (`type: 'number' | 'bool' | 'enum'`).
  Adding a symbology or an option means editing `src/symbologies.js` and nothing
  in `src/ui.js`.
- Every export format is a lazy chunk behind `FORMATS[].load()`.
- Theme uses the three-block cascade in `src/styles.css`: `:root`, then
  `@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) }`,
  then `:root[data-theme='dark']`. Never define a colour only inside a media
  block.
- Tap targets are at least 48px. Where the visible control is smaller — the (i),
  the theme thumb — the button keeps 48px and negative margins absorb the rest,
  so the row does not grow.
- Motion is gated on `@media (prefers-reduced-motion: no-preference)` rather
  than undone in a `reduce` block, so a newly animated property cannot escape
  the opt-out by being added in the wrong place. That means every `transition`
  lives inside that block, including the one for focus — declaring it next to
  the focus colours instead reads naturally and silently survives `reduce`.
  Theme cross-fades run at 0.5s; focus and other direct feedback at 0.15s.
- Icons are Phosphor (regular), inlined as markup in `src/icons.js`. Add a glyph
  by copying its `<path>` from `phosphor-icons/core`, not by adding a package.
- Anything that reaches `dist/` needs an entry in `THIRD-PARTY-NOTICES.md`, with
  the upstream licence text copied verbatim. Dev-only tooling stays out of that
  file on purpose — it is never redistributed.
- The payload field is `Menlo, Consolas, "DejaVu Sans Mono", ui-monospace,
  monospace`. Menlo leads because it is the one that slashes its zero by
  default; `ui-monospace` resolves to SF Mono, which does not. Neither SF Pro
  nor Helvetica Neue has a `zero` feature at all, so no text face can slash it
  and `font-variant-numeric: slashed-zero` is dead on Apple platforms.
- Downloads are named `code-symbology.ext`, with the payload's case preserved.
- Comments explain why, not what. The codebase carries about forty-five of them;
  keep it that way.

## Testing

`npm test` for unit tests, `npm run e2e` for Playwright (it rebuilds first, so
it can never run against a stale `dist/`). jsdom tests need the
`// @vitest-environment jsdom` pragma at the top of the file.

Export tests share `test/helpers.js`: `SAMPLES` (one valid payload per
symbology) and `filledArea()` (shoelace area, used to assert an export actually
encloses ink rather than drawing zero-area lines).
