# Development

## Requirements

- Node.js **22.18+** (TypeScript files run natively in tests and the dev server)
- Chrome or Edge for testing Bluetooth (`localhost` counts as a secure context)

## Commands

| Command | Purpose |
|---|---|
| `npm install` | Install the build tools (esbuild, TypeScript) |
| `npm run dev` | Dev server on <http://localhost:5173> with rebuild on save and a built-in proxy at `/proxy` |
| `npm run build` | Production build into `dist/` (reads `ALPINE_PROXY_URL`, `ALPINE_REPO_URL`) |
| `npm run preview` | Serve `dist/` locally |
| `npm run typecheck` | TypeScript type check |
| `npm test` | Unit tests (`node:test`) |
| `npm run check` | Type check + tests + build |
| `npm run catalog -- <MeshCore checkout>` | Regenerate `catalog/boards.json` |
| `npm run proxy:deploy` | Deploy the Cloudflare Worker |

## Architecture

The app is written in plain TypeScript without a UI framework and has **no runtime
dependencies**. esbuild bundles it into one JS and one CSS file (~70 kB uncompressed).

```
src/
├─ main.ts               entry point: theme, language, layout, service worker registration
├─ app/
│  ├─ store.ts           tiny observable store (select + subscribe)
│  └─ state.ts           application state and all actions (select board, download, …)
├─ lib/                  logic without DOM access (unit-tested)
│  ├─ catalog/           types + matching of release assets to board/role (match.ts)
│  ├─ github/            release list loading (proxy → GitHub API → offline copy)
│  ├─ cache/             IndexedDB firmware library, download + verification
│  ├─ util/              formatting, safe localStorage
│  └─ config.ts          build-time constants
├─ ui/                   DOM rendering
│  ├─ dom.ts             h() element helper and inline SVG icons
│  ├─ header.ts, aside.ts, library.ts
│  └─ steps/             the five steps of the update flow
├─ i18n/                 t() + locales/*.json
├─ styles/main.css       design tokens (light/dark) and all styles
└─ sw.ts                 service worker (offline app shell)
catalog/                 boards.json (generated), board-overrides.json, sources.json
proxy/                   Cloudflare Worker (download proxy)
scripts/                 build, dev server, catalog generator, icon renderer
tests/                   unit tests
```

### Data flow

1. `catalog/boards.json` and `catalog/sources.json` are bundled into the app.
2. Choosing a board + source + role calls `refreshFirmwareList()`, which loads the source's
   releases (`lib/github/releases.ts`) and filters them with `findFirmware()`
   (`lib/catalog/match.ts`).
3. *Download* streams the asset through the proxy, checks size and SHA-256, and stores the
   Blob in IndexedDB (`lib/cache/`). The library survives restarts and works offline.
4. UI regions subscribe to the parts of the state they display (`store.select`) and re-render
   only when those parts change.

### Rendering approach

Each region (header, steps, side panel, library dialog) owns a root element and rebuilds its
children with `h()` when its selected state changes. Elements that must keep focus while
typing (the device search box) are created once and reused.

## Conventions

- **Language:** code, comments and documentation in English; UI text only in `src/i18n/locales/`.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) — `feat:`, `fix:`,
  `docs:`, `refactor:`, `test:`, `chore:`.
- **Versioning:** [SemVer](https://semver.org/). Pre-1.0 while features are being added.
- **Changelog:** update `CHANGELOG.md` under *Unreleased* with every user-visible change.

## Releasing

1. Move the *Unreleased* entries in `CHANGELOG.md` under a new version heading with the date.
2. Bump `version` in `package.json` (shown in the app footer).
3. Commit: `chore(release): vX.Y.Z`, then tag: `git tag vX.Y.Z`.
4. Push the commit and the tag (GitHub Desktop: *Repository → Push*, tags are pushed with it).
