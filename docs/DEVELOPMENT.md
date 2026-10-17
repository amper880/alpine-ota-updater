# Development

## Requirements

- Node.js **22.18+** (TypeScript files run natively in tests and scripts)
- For the native app: see [BUILDING.md](BUILDING.md) (Rust, Tauri prerequisites). CI builds the
  installers, so this is optional.

## Commands

| Command | Purpose |
|---|---|
| `npm install` | Install the build tools and the Tauri JS packages |
| `npm run dev` | UI dev server on <http://localhost:5173> with rebuild on save (used by `tauri dev`) |
| `npm run build` | Front-end build into `dist/` (packaged by Tauri) |
| `npm run typecheck` | TypeScript type check |
| `npm test` | Unit tests (`node:test`) |
| `npm run check` | Type check + tests + build |
| `npm run catalog -- <MeshCore checkout>` | Regenerate `catalog/boards.json` |
| `npm run icons` | Generate the app icons from `src-tauri/icons/source.png` |
| `npm run app:dev` / `app:build` | Run / build the Windows app |
| `npm run android:init` / `android:dev` / `android:build` | Android project, dev run, APK |

In a plain browser (`npm run dev`) the UI works for layout and release listing; downloads and
Bluetooth need the native app.

## Architecture

The UI and all update logic are plain TypeScript without a UI framework. esbuild bundles them
into one JS and one CSS file; Tauri (`src-tauri/`) hosts them in a native window and provides
Bluetooth (`tauri-plugin-blec`) and HTTP (`tauri-plugin-http`).

```
src/
├─ main.ts               entry point: theme, language, layout, service worker registration
├─ app/
│  ├─ store.ts           tiny observable store (select + subscribe)
│  ├─ state.ts           application state and actions (select board, download, …)
│  └─ flash.ts           Bluetooth scan and update actions
├─ lib/                  logic without DOM access (unit-tested)
│  ├─ catalog/           types + matching of release assets to board/role (match.ts)
│  ├─ github/            release list loading (GitHub API, 10-minute cache, offline copy)
│  ├─ net/               HTTP through the native plugin
│  ├─ ble/               native BLE (blec), device recognition, the BLE update flow
│  ├─ cache/             IndexedDB firmware library, download + verification
│  ├─ dfu/               Nordic legacy DFU protocol, DFU package parser
│  ├─ util/              formatting, safe localStorage, ZIP reader
│  ├─ platform.ts        native app or plain browser
│  └─ config.ts          build-time constants
├─ ui/                   DOM rendering
│  ├─ dom.ts             h() element helper and inline SVG icons
│  ├─ header.ts, aside.ts, library.ts
│  └─ steps/             the five steps of the update flow
├─ i18n/                 t() + locales/*.json
└─ styles/main.css       design tokens (light/dark) and all styles
src-tauri/               Rust shell: plugins, tauri.conf.json, capabilities, icon source
catalog/                 boards.json (generated), board-overrides.json, sources.json
scripts/                 front-end build, dev server, catalog generator
tests/                   unit tests
```

### Data flow

1. `catalog/boards.json` and `catalog/sources.json` are bundled into the app.
2. Choosing a board + source + role calls `refreshFirmwareList()`, which loads the source's
   releases (`lib/github/releases.ts`) and filters them with `findFirmware()`
   (`lib/catalog/match.ts`).
3. *Download* streams the release asset through the native HTTP plugin, checks size and
   SHA-256, and stores the Blob in IndexedDB (`lib/cache/`). The library survives restarts
   and works offline.
4. *Scan* lists nodes in update mode (`lib/ble/`); *Start update* runs `flashOverNativeBle()`,
   which drives `runLegacyDfu()` (`lib/dfu/`) over the native BLE transport.
5. UI regions subscribe to the parts of the state they display (`store.select`) and re-render
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

## Branches

- `dev` — work in progress. Every push builds the Windows installers and the APK
  (*Actions → Build apps → run → Artifacts*) without publishing a release.
- `main` — tested, releasable code. Changes reach it by merging `dev` (or a pull request
  from `dev`); releases are tagged on `main`.

Other branches can be built on demand with *Actions → Build apps → Run workflow*.

## Releasing

1. Merge `dev` into `main` and switch to `main`.
2. Move the *Unreleased* entries in `CHANGELOG.md` under a new version heading with the date.
3. Bump `version` in `package.json` (used by the app, the installers and the footer), then
   run `npm install` so `package-lock.json` follows.
4. Commit: `chore(release): vX.Y.Z`, then tag: `git tag vX.Y.Z`.
5. Push the commit and the tag (GitHub Desktop: *Repository → Push*, tags are pushed with it).
   The *Build apps* workflow then publishes a GitHub Release with the installers.

## Testing the Bluetooth update without hardware

`tests/dfu.test.ts` runs the DFU protocol against a simulated bootloader. For the full UI
flow, a fake `window.__TAURI_INTERNALS__` that answers the `plugin:blec|…` commands with a
simulated node (application mode → bootloader) can be injected with Playwright's
`addInitScript`. Real hardware is still needed to validate timing and the Windows/Android
Bluetooth stacks.
