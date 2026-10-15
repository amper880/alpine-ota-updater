# Alpine OTA Updater — Specification

| | |
|---|---|
| **Status** | Draft for review |
| **Version** | 0.1 (spec) |
| **Author** | Amper |
| **Date** | 2026-10-15 |

---

## 1. Overview

Alpine OTA Updater is an installable web application (PWA) that updates the firmware of
**MeshCore repeater and room server nodes** over the air:

- **nRF52-based nodes** — over **Bluetooth Low Energy (Nordic legacy DFU)**
- **ESP32-based nodes** — over **WiFi (the node's own OTA access point)**

The user receives a single link. The app runs in Chrome / Edge on desktop, Android phones
and tablets, and can be installed as a standalone app from the browser.

### 1.1 Goals

1. Select the target **device type** (board).
2. Select a **firmware source** (official MeshCore, PowerSaving, ZephCore, …) and list its
   stable releases for that board.
3. **Download** the chosen firmware once and **keep it** for later reuse (offline cache).
4. **Scan** for nodes that are in OTA/DFU mode.
5. **Flash** the selected node — via BLE or WiFi depending on the device type.

### 1.2 Non-goals (v1)

- Putting the node into OTA mode. The user does this with the `start ota` CLI command from
  their own companion app.
- Companion firmware, USB/serial flashing, bootloader updates.
- iOS / Safari support (no Web Bluetooth). Firefox is not supported either.
- Pre-release / nightly builds (planned as a later toggle, see §13).

---

## 2. Platform constraints

These browser rules shape the architecture. They are listed here so later decisions can be
traced back to them.

| # | Constraint | Consequence |
|---|---|---|
| C1 | Web Bluetooth exists only in Chromium browsers (Chrome, Edge, Opera, Samsung Internet) on desktop and Android. | Unsupported browsers get a clear notice; the WiFi path still works there where possible. |
| C2 | Web Bluetooth only lets the page pick a device through the **browser's own chooser dialog**. | The SCAN button opens the native chooser, pre-filtered to OTA-mode device names. |
| C3 | A web page cannot scan for or join WiFi networks. | For ESP32 the app shows a step-by-step guide for joining the `MeshCore-OTA` network manually, then checks reachability itself. |
| C4 | Web Bluetooth and PWA install require **HTTPS**; the ESP32 OTA server is plain **HTTP** on `192.168.4.1`. | Rely on Chrome's *Local Network Access* mixed-content exemption for private IP literals (with a permission prompt); fall back to a form-based upload (see §6.3). |
| C5 | GitHub release asset downloads do not send CORS headers. | A small **download proxy** (Cloudflare Worker) fetches assets on the app's behalf. |
| C6 | On the node's OTA WiFi there is no internet. | App shell is cached by a service worker; firmware files are cached locally **before** the user switches network. |
| C7 | Phones turn off the screen and throttle background tabs, which can break BLE transfers. | Use the Screen Wake Lock API during flashing; warn the user not to leave the page. |

---

## 3. Glossary

| Term | Meaning |
|---|---|
| **Board / device type** | A hardware target as named in firmware release assets, e.g. `RAK_4631`, `Heltec_v3`. |
| **Platform** | `nrf52` (BLE DFU) or `esp32` (WiFi OTA). Other MCUs (RP2040, STM32) have no OTA path and are hidden. |
| **Role** | Firmware role: `repeater` or `room-server`. |
| **Source** | A GitHub repository that publishes MeshCore-compatible firmware releases. |
| **DFU package** | Nordic `.zip` containing `manifest.json`, an init packet (`.dat`) and the application image (`.bin`). |
| **OTA image** | ESP32 application `.bin` (**not** the `-merged.bin` full-flash image). |

---

## 4. User flow

```
 ┌────────────┐   ┌────────────┐   ┌──────────────┐   ┌───────────┐   ┌────────────┐
 │ 1. Device  │ → │ 2. Source  │ → │ 3. Firmware  │ → │ 4. Scan / │ → │ 5. Flash & │
 │    type    │   │  & role    │   │  (download / │   │  connect  │   │   verify   │
 │            │   │            │   │   cached)    │   │           │   │            │
 └────────────┘   └────────────┘   └──────────────┘   └───────────┘   └────────────┘
```

The UI is a single page with these steps as stacked cards (mobile) or a two-column layout
(tablet/desktop). Completed steps collapse to a one-line summary and can be reopened.

### 4.1 nRF52 (BLE) path

1. User has run `start ota` on the node; it now advertises as `<BOARD>_OTA`
   (e.g. `RAK4631_OTA`, `T114_OTA`).
2. **SCAN** → native chooser filtered to the known `*_OTA` names and the bootloader name
   (`AdaDFU`). A "show all devices" option disables the filter.
3. App connects, writes the *buttonless* "enter bootloader" command to the DFU control point;
   the node reboots into the bootloader.
4. App reconnects to the bootloader (automatically if the same device object is reachable,
   otherwise via a second chooser prompt — "Connect to bootloader").
5. Legacy DFU transfer with progress, speed and ETA.
6. Bootloader validates and boots the new firmware. App shows success and a hint to check
   `ver` from the companion app.

### 4.2 ESP32 (WiFi) path

1. Firmware must already be cached (the app enforces this before showing the guide).
2. App shows the **manual connection guide** (required by the product brief):
   1. On the companion app, log in to the node and send `start ota`.
      The node replies `Started: http://192.168.4.1/update`.
   2. Open the phone/PC WiFi settings and join the open network **`MeshCore-OTA`**.
   3. If the device warns "no internet", choose *stay connected* (Android: "Keep WiFi
      connection" / "Use this network as is").
   4. Return to this app (do not close it).
3. **SCAN** → the app polls `http://192.168.4.1/` until the node answers, then shows the node
   identity (`<name> (<board>)`) when readable.
4. **Flash** → upload with progress. The node reboots on success.
5. Reminder to switch WiFi back to the normal network.

### 4.3 Safety checks before flashing

- **Board mismatch** — if the selected firmware's board does not match the detected node
  (BLE name / ESP32 identity), show a warning dialog. Flashing continues **only after explicit
  confirmation** ("I understand, flash anyway").
- **Wrong file type** — `-merged.bin` and `.uf2` files are never offered for OTA.
- **Platform mismatch** (e.g. ESP32 firmware to a BLE device) — blocked, not overridable.
- **Battery / power** reminder shown once before the first flash.

---

## 5. Functional requirements

### 5.1 Device type selection (FR-1)

- FR-1.1 Searchable list of all boards supported by MeshCore that have an OTA path
  (nRF52 or ESP32), grouped by manufacturer, with a platform badge (BLE / WiFi).
- FR-1.2 The list comes from `catalog/boards.json` (see §7.2), generated from the official
  release assets by a script and committed to the repo, so it is available offline and before
  any source is chosen.
- FR-1.3 The last selection is remembered.

### 5.2 Firmware source & role (FR-2)

- FR-2.1 Sources are defined in `catalog/sources.json` (see §7.1). Adding a source = adding
  one JSON entry, no code change.
- FR-2.2 Role selector: Repeater / Room server. Roles not published by a source for the
  board are disabled.
- FR-2.3 Sources that publish nothing for the selected board are shown disabled with a reason.

### 5.3 Firmware list & download (FR-3)

- FR-3.1 Lists **stable** releases only (`prerelease == false`, not draft), newest first,
  showing version, date and file size; release notes are expandable.
- FR-3.2 Already cached files are marked "Downloaded" and need no network.
- FR-3.3 Download shows progress; the file is verified (size, and SHA-256 when the GitHub API
  provides an asset digest) before being stored.
- FR-3.4 A **Firmware library** view lists all cached files with total storage used, and
  allows deleting single files or clearing all.
- FR-3.5 The app asks the browser for persistent storage (`navigator.storage.persist()`)
  so cached firmware is not evicted.

### 5.4 Scan & connect (FR-4)

- FR-4.1 BLE: see §4.1. WiFi: see §4.2.
- FR-4.2 The found node is shown with name, platform and (if known) detected board.
- FR-4.3 Clear error messages for: Bluetooth off, permission denied, chooser cancelled,
  node not reachable, wrong network.

### 5.5 Flash (FR-5)

- FR-5.1 Progress bar with percentage, transferred bytes, speed and ETA.
- FR-5.2 Cancel button (with a warning that the node may stay in bootloader/OTA mode — which
  is recoverable by retrying).
- FR-5.3 Screen Wake Lock held during transfer.
- FR-5.4 Detailed log panel (collapsed by default), copyable for bug reports.

### 5.6 General (FR-6)

- FR-6.1 Theme: Light / Dark / System.
- FR-6.2 Language: English / Hungarian, auto-detected from the browser, switchable; new
  languages added by dropping a JSON file into `src/i18n/locales/` (see §9.3).
- FR-6.3 Installable PWA; works offline except for listing/downloading firmware.
- FR-6.4 App version shown in the footer / About dialog, with a link to the changelog.

---

## 6. Update protocols

### 6.1 nRF52 — Nordic legacy DFU over BLE

MeshCore's nRF52 firmware (`NRF52Board::startOTAUpdate`) starts BLE advertising under
`<BOARD>_OTA` and exposes the Adafruit `BLEDfu` service (Nordic **legacy** DFU, buttonless).
The bootloader is the Adafruit nRF52 bootloader (or the OTAFIX fork), which implements the
legacy DFU protocol.

| Item | UUID |
|---|---|
| Legacy DFU service | `00001530-1212-efde-1523-785feabcd123` |
| DFU Control Point | `00001531-1212-efde-1523-785feabcd123` |
| DFU Packet | `00001532-1212-efde-1523-785feabcd123` |
| DFU Version | `00001534-1212-efde-1523-785feabcd123` |

Sequence (implemented in `src/lib/dfu/legacy-dfu.ts`, own implementation, no external lib):

1. Read DFU Version → if application mode, write `START_DFU (0x01) + APPLICATION (0x04)` to
   the control point; device reboots into the bootloader.
2. Reconnect; enable control point notifications.
3. `START_DFU` + image sizes (softdevice, bootloader, application) on the packet char.
4. `INIT_DFU_PARAMS (0x02)` start → send `.dat` init packet → `INIT_DFU_PARAMS` complete.
5. `PACKET_RECEIPT_NOTIF_REQ (0x08)` with N packets (default 8, tunable).
6. `RECEIVE_FIRMWARE_IMAGE (0x03)` → stream the `.bin` in 20-byte packets, waiting for
   receipt notifications.
7. `VALIDATE (0x04)` → `ACTIVATE_AND_RESET (0x05)`.

The `.zip` DFU package is unpacked in the browser (`fflate`) using `manifest.json`.

Known risks: some boards need specific settings (e.g. lower PRN, slower pacing) — exposed
under "Advanced" and tuned during device testing. Some devices change BLE address in
bootloader mode, hence the second-chooser fallback.

### 6.2 ESP32 — AsyncElegantOTA over WiFi

MeshCore's ESP32 firmware (`ESP32Board::startOTAUpdate`) opens an **open** soft AP
`MeshCore-OTA`, serves on `192.168.4.1:80` and uses a bundled **AsyncElegantOTA (v2)**:

| Endpoint | Purpose |
|---|---|
| `GET /` | HTML greeting with node ID |
| `GET /update/identity` | JSON `{"id":"<name> (<manufacturer>)","hardware":"ESP32"}` (no CORS header) |
| `GET /update` | Built-in upload page |
| `POST /update` | `multipart/form-data`: field `MD5` (hex MD5 of the image, **must come first**), then file field `firmware`. Responds `OK` / `FAIL` with `Access-Control-Allow-Origin: *`, then reboots. |

The app computes the MD5 locally (`spark-md5`) before upload.

### 6.3 ESP32 upload strategy (HTTPS → HTTP)

1. **Primary — direct fetch.** `fetch('http://192.168.4.1/update', { method: 'POST',
   body: formData, targetAddressSpace: 'local' })`. Chrome treats private IP literals as
   local-network requests: it shows a one-time *Local Network Access* permission prompt and
   exempts the request from mixed-content blocking. The response is readable (`ACAO: *`).
   Upload progress: XHR if permitted by the exemption, otherwise an estimated progress bar.
2. **Fallback — form post.** If (1) is blocked, the app builds a hidden HTML form targeting
   `http://192.168.4.1/update` in a new tab, attaches the cached file programmatically, and
   submits it. Chrome shows a "form is not secure" interstitial that the user confirms once.
3. **Last resort — manual.** The app offers "Save firmware file" and opens
   `http://192.168.4.1/update`, where the user picks the file.

The exact behaviour of (1) on desktop Chrome and Android Chrome is validated in milestone M4.

---

## 7. Catalog (extensibility)

### 7.1 `catalog/sources.json`

```jsonc
{
  "sources": [
    {
      "id": "official",
      "name": "MeshCore (official)",
      "repo": "meshcore-dev/MeshCore",
      "homepage": "https://github.com/meshcore-dev/MeshCore",
      "roles": {
        "repeater":    { "tagPattern": "^repeater-v(?<version>.+)$" },
        "room-server": { "tagPattern": "^room-server-v(?<version>.+)$" }
      },
      // Named groups: board, role, ext. Matched case-insensitively.
      "assetPattern": "^(?<board>.+?)_(?<role>repeater|room_server)-v[^-]+-[0-9a-f]+(?<merged>-merged)?\\.(?<ext>zip|bin)$",
      "platformByExt": { "zip": "nrf52", "bin": "esp32" },
      "exclude": ["-merged\\.bin$", "\\.uf2$", "\\.hex$"]
    },
    {
      "id": "powersaving",
      "name": "PowerSaving (IoTThinks)",
      "repo": "IoTThinks/EasySkyMesh",
      "roles": { "repeater": {}, "room-server": {} },
      "tagPattern": "^PowerSaving(?<version>.+)$",
      // ESP32 OTA image is the "-upgrade.bin"; "-freshInstall-merged.bin" is excluded.
      "assetPattern": "^(?<board>.+?)_(?<role>repeater|room_server)-PowerSaving[^-]+(-(?<variant>upgrade))?\\.(?<ext>zip|bin)$"
    },
    {
      "id": "zephcore",
      "name": "ZephCore",
      "repo": "liquidraver/ZephCore",
      "roles": { "repeater": {}, "room-server": {} },
      "tagPattern": "^(?<version>.+)-zephcore$",
      "assetPattern": "^(?<board>.+?)-(?<role>repeater|room_server|roomserver)-[0-9a-f]+\\.(?<ext>zip|bin)$"
    }
  ]
}
```

Patterns above are initial and will be finalised against the full asset lists during M1.
Notes from the current releases (2026-10):

- **Official** publishes separate tags per role (`repeater-v1.18.0`, `room-server-v1.18.0`).
  nRF52 boards ship `.zip` (DFU) + `.uf2`; ESP32 boards ship `.bin` (OTA) + `-merged.bin`.
- **PowerSaving** uses one tag per release (`PowerSaving17`); ESP32 OTA file is `-upgrade.bin`.
- **ZephCore** (Zephyr-based) uses lowercase board ids (`heltec_t114`). Its ESP32 OTA uses
  MCUboot, not ElegantOTA — **ZephCore ESP32 OTA is out of scope for v1** unless its
  mechanism proves compatible; ZephCore nRF52 `.zip` compatibility with the legacy DFU
  bootloader is verified in M3.

### 7.2 `catalog/boards.json`

```jsonc
{
  "boards": [
    {
      "id": "rak_4631",                 // normalised (lowercase) id
      "name": "RAK WisBlock 4631",
      "vendor": "RAKwireless",
      "platform": "nrf52",
      "bleOtaName": "RAK4631_OTA",
      "aliases": ["RAK_4631", "rak4631"] // per-source spellings
    }
  ]
}
```

Generated by `scripts/build-catalog.mjs` from the latest official release assets plus the
MeshCore source (`*_OTA` names), then hand-curated for display names. Boards without an OTA
path (RP2040, STM32, `.uf2`/`.hex`-only) are excluded.

---

## 8. Architecture

```
            ┌──────────────────────────── Browser (Chrome / Edge) ──────────────────────────┐
            │  Alpine OTA Updater PWA (static files from GitHub Pages)                       │
            │                                                                                │
            │  UI (Svelte) ── i18n ── theme                                                  │
            │   │                                                                            │
            │   ├─ catalog service ── api.github.com (release lists, via proxy cache) ───────┼──┐
            │   ├─ firmware cache (IndexedDB) ◄── download via proxy ────────────────────────┼──┤
            │   ├─ BLE DFU engine (Web Bluetooth) ───────────────► nRF52 node / bootloader   │  │
            │   └─ WiFi OTA engine (fetch / form) ──── http://192.168.4.1 ► ESP32 node       │  │
            │  Service worker: offline app shell                                             │  │
            └────────────────────────────────────────────────────────────────────────────────┘  │
                                                                                                │
            ┌──────────── Cloudflare Worker "alpine-ota-proxy" ────────────┐                    │
            │  GET /releases?repo=…   → cached GitHub API response (10 min) │ ◄─────────────────┘
            │  GET /asset?url=…       → streams a release asset, adds CORS  │
            │  Allow-list: repos from sources.json, github.com hosts only   │
            └───────────────────────────────────────────────────────────────┘
```

### 8.1 Tech stack

| Concern | Choice | Why |
|---|---|---|
| Build | Vite + TypeScript | Fast, standard, static output for any web server |
| UI | Svelte 5 | Small bundle, little boilerplate, easy to read |
| PWA | `vite-plugin-pwa` (Workbox) | Offline shell, install prompt, update notification |
| Storage | IndexedDB via `idb` | Large binary blobs, survives restarts |
| ZIP | `fflate` | Tiny, fast unzip for DFU packages |
| MD5 | `spark-md5` | Required by ElegantOTA |
| Proxy | Cloudflare Worker (free tier) | No server to run; can move to own server later |
| Tests | Vitest (unit), Playwright (UI smoke) | DFU protocol tested against a mock GATT |
| Lint/format | ESLint + Prettier | Consistent code |

### 8.2 Hosting

- **App:** GitHub Pages, deployed by a GitHub Actions workflow on every tag/push to `main`
  (`https://<user>.github.io/alpine-ota-updater/`). The build is plain static files, so it can
  later be copied to the own server unchanged (only the base path and proxy URL are configured
  via `.env`).
- **Proxy:** Cloudflare Worker in `proxy/`, deployed with `wrangler`. Its URL is configured
  with `VITE_PROXY_URL`. A Node/PHP equivalent can be added later for the own server.

---

## 9. UI / UX

### 9.1 Layout

- **Phone (< 640 px):** single column, stepper cards, sticky bottom action button.
- **Tablet (640–1024 px):** single wide column, larger touch targets.
- **Desktop (> 1024 px):** two columns — steps on the left, context panel (release notes,
  connection guide, log) on the right.
- Top bar: app name, Firmware library, Language, Theme, About.

### 9.2 Visual style

Clean and calm: neutral surfaces, one accent colour, generous spacing, system font stack,
large clear status states (idle / working / success / error). WCAG AA contrast in both
themes; all actions keyboard-accessible; motion reduced when `prefers-reduced-motion`.

### 9.3 Internationalisation

- Locale files: `src/i18n/locales/en.json`, `hu.json` (flat keys, ICU-style placeholders).
- English is the fallback for missing keys.
- Adding a language: copy `en.json` → `<code>.json`, translate, add to `locales/index.ts`.
  Documented in `docs/TRANSLATING.md`.

---

## 10. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance | First load < 300 kB gzipped; instant start when installed |
| Reliability | Flash never starts without a fully verified cached file |
| Privacy | No analytics, no accounts; only GitHub and the node are contacted |
| Security | Proxy only serves assets from allow-listed repos; strict CSP |
| Compatibility | Chrome/Edge ≥ 142 desktop & Android; graceful notice elsewhere |

---

## 11. Repository layout

```
alpine-ota-updater/
├─ src/
│  ├─ lib/
│  │  ├─ catalog/      # sources, boards, GitHub release parsing
│  │  ├─ cache/        # IndexedDB firmware library
│  │  ├─ dfu/          # BLE legacy DFU engine
│  │  └─ wifi/         # ESP32 ElegantOTA uploader
│  ├─ components/      # Svelte UI components
│  ├─ i18n/            # locale files + loader
│  └─ main.ts
├─ catalog/            # sources.json, boards.json
├─ proxy/              # Cloudflare Worker
├─ scripts/            # build-catalog.mjs, release helpers
├─ public/             # icons, manifest assets
├─ tests/
├─ docs/               # SPEC, ARCHITECTURE, USER_GUIDE, DEPLOYMENT, TRANSLATING, ADDING_A_SOURCE
├─ .github/workflows/  # ci.yml, deploy.yml
├─ CHANGELOG.md
├─ LICENSE (MIT)
└─ README.md
```

---

## 12. Versioning & release process

- **Semantic Versioning** (`MAJOR.MINOR.PATCH`); pre-1.0 while in development.
- **Conventional Commits** (`feat:`, `fix:`, `docs:`, `chore:` …).
- **CHANGELOG.md** in *Keep a Changelog* format, updated in each release.
- Releases are git tags `vX.Y.Z`; the version is injected into the app at build time.
- Branching: `main` is always deployable; features on short-lived branches once on GitHub.

---

## 13. Milestones

| M | Content | Exit criterion |
|---|---|---|
| M0 | Repo, spec, tooling, CI | This document approved |
| M1 | App shell, theme, i18n, catalog + release listing, proxy | Lists real releases for any board |
| M2 | Firmware download + library (cache) | Files reusable offline |
| M3 | BLE legacy DFU | Successful update on a real nRF52 node |
| M4 | WiFi OTA (all three strategies) | Successful update on a real ESP32 node (desktop + Android) |
| M5 | Polish, docs, PWA install, v1.0.0 | User guide complete, tagged release |
| Later | Pre-release toggle, own-server deployment, more sources | — |

---

## 14. Open points / risks

1. **LNA behaviour on Android Chrome** for `192.168.4.1` — verified in M4; fallbacks exist.
2. **Bootloader re-connect** after buttonless jump may need a second chooser on some boards.
3. **ZephCore** compatibility (nRF52 DFU zip, ESP32 MCUboot OTA) — verified in M3/M4.
4. **GitHub API rate limit** (60 req/h per IP unauthenticated) — mitigated by Worker caching;
   a GitHub token can be added to the Worker as a secret if needed.
5. Board naming differs between sources — handled by `aliases` in `boards.json`.
