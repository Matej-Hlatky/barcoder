# Barcoder

Mobile-first barcode generator. Type a value, pick a symbology, get a code you
can display fullscreen or download as PNG, WEBP, SVG, Android VectorDrawable
XML, or PDF.

The whole app state lives in the query string — copy the URL to share the exact
code you are looking at.

## Symbologies

**Linear:** Code 128, Code 39, EAN-13, EAN-8, UPC-A, ITF-14

**2D:** QR, DataMatrix, PDF417, Aztec

Each one exposes its own options with sensible defaults. Options that differ
from their default appear in the URL; a default is simply absent.

## Development

    npm install
    npm test          # unit tests (vitest)
    npm run build     # writes dist/
    npm run e2e       # Playwright smoke tests (builds first, runs against dist/)

No framework and one runtime dependency: `@bwip-js/browser`, loaded as a lazy
chunk so the shell paints before the encoder arrives. `npm run build` fails if
the entry bundle exceeds 12 KB gzip or the encoder chunk exceeds 115 KB.

### Layout

    src/symbologies.js   symbology + option schema (pure data)
    src/state.js         query string <-> state
    src/encoder.js       bwip-js wrapper, lazy-loaded
    src/svg.js           viewBox and fillable path extraction
    src/export/          one module per download format, each lazy-loaded
    src/ui.js            DOM construction from the schema
    src/main.js          wiring
    test/                unit tests
    e2e/                 Playwright smoke tests

## Deployment

`.github/workflows/deploy.yml` builds and publishes `dist/` to GitHub Pages on
every push to `main`. It needs Pages enabled for the repository with
**Source: GitHub Actions** (Settings → Pages). The build is relative-path only,
so it works from a project subpath such as `/barcoder/`.

## Design documents

- Spec: `docs/superpowers/specs/2026-08-25-barcoder-design.md`
- Plan: `docs/superpowers/plans/2026-08-25-barcoder.md`

## License

MIT — see `LICENSE`.

Everything Barcoder ships is MIT too: the bundled encoder (`@bwip-js/browser`
and the BWIPP PostScript inside it) and the inlined Phosphor icons. Their
notices are in `THIRD-PARTY-NOTICES.md`, which travels with any copy.
