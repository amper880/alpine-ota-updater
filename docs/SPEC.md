# Alpine OTA Updater — Specification

| | |
|---|---|
| **Status** | Approved; native app since v0.3.0 (see §0) |
| **Version** | 0.3 (spec) |
| **Author** | Amper |
| **Date** | 2026-10-15 |

---

## 0. Change log of this specification

| Version | Change |
|---|---|
| 0.1 | Initial draft: installable web app (PWA) on GitHub Pages with a Cloudflare download proxy. |
| 0.2 | Svelte/Vite replaced by plain TypeScript + esbuild. |
| 0.3 | **Web app replaced by a native app (Tauri 2) for Windows and Android.** Testing showed that Chromium's Web Bluetooth blocklist forbids the Nordic legacy DFU service (`00001530-…`) that the Adafruit / OTAFIX bootloaders use, so nRF52 updates are impossible from any browser. Native Bluetooth has no such restriction, and native HTTP also removes the CORS proxy and the HTTPS→HTTP problem of the ESP32 upload. iOS is postponed (needs a Mac and an Apple developer account). |
| 0.4 | Companion role (nRF52 Bluetooth companion via its bonded buttonless DFU service). macOS (universal, ad-hoc signed) and Linux (AppImage) builds added; `tauri-plugin-blec` uses btleplug there too (CoreBluetooth / BlueZ). |

---

## 1. Overview

Alpine OTA Updater is a cross-platform app (Windows and Android; iOS later) that updates the
firmware of **MeshCore repeater and room server nodes** over the air:

- **nRF52-based nodes** — over **Bluetooth Low Energy (Nordic legacy DFU)**
- **ESP32-based nodes** — over **WiFi (the node's own OTA access point)**

Users install it from the release page (Windows installer, Android APK).

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
- iOS and macOS builds (technically possible with Tauri, postponed).
- A browser version (see §0, 0.3).
- Pre-release / nightly builds (planned as a later toggle, see §13).

---

## 2. Platform constraints

| # | Constraint | Consequence |
|---|---|---|
| C1 | Chromium's Web Bluetooth **blocklist** contains the Nordic legacy DFU service `00001530-1212-efde-1523-785feabcd123`. | No browser can update nRF52 nodes → native app (Tauri) with native Bluetooth (`tauri-plugin-blec`: btleplug on Windows, macOS and Linux, Kotlin backend on Android). |
| C2 | Apps cannot join a WiFi network without extra platform permissions; joining the node's AP manually is simple and reliable. | For ESP32 the app shows a step-by-step guide for joining `MeshCore-OTA`, then checks reachability itself. |
| C3 | On the node's OTA WiFi there is no internet. Android may route traffic over mobile data instead of a WiFi without internet. | Firmware is downloaded **before** switching networks. Android: bind requests to the WiFi network (verified in M4). |
| C4 | Phones turn off the screen during long transfers. | Keep the screen on during an update (M5); warn the user not to leave the app. |
| C5 | Unauthenticated GitHub API: 60 requests per hour per IP. | Release lists are cached for 10 minutes and kept for offline use. |

## 3. Glossary

| Term | Meaning |
|---|---|
| **Board / device type** | A hardware target as named in firmware release assets, e.g. `RAK_4631`, `Heltec_v3`. |
| **Platform** | `nrf52` (BLE DFU) or `esp32` (WiFi OTA). Other MCUs (RP2040, STM32) have no OTA path and are hidden. |
| **Role** | Firmware role: `repeater`, `room-server` or `companion` (Bluetooth companion, nRF52 only). |
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

1. The user runs `start ota` on the node; it now advertises as `<BOARD>_OTA`
   (e.g. `RAK4631_OTA`, `T114_OTA`). A node already in bootloader mode (`AdaDFU` or
   `<BOARD>_DFU` with the OTAFIX bootloader) works too.
2. **SCAN** → the app scans for 12 s and lists nodes in update mode inside the app
   (application mode or bootloader). "Show all Bluetooth devices" disables the filter.
3. The user selects a node; the name is checked against the selected device type (§4.3).
4. **Start update:** if the node runs the application, the app writes the buttonless
   "enter bootloader" command, waits for the disconnect, rescans and connects to the
   bootloader (same address, else `<BOARD>_DFU`, else the strongest bootloader).
5. Legacy DFU transfer with progress, speed and ETA.
6. The bootloader validates and boots the new firmware. The app shows success and a hint to
   check `ver` from the companion app.

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
- FR-2.2 Role selector: Repeater / Room server / Companion. Roles not published for the board
  are disabled. *Companion* means `companion_radio_ble` on nRF52: the companion registers the
  buttonless DFU service for bonded clients, so the app connects (the OS pairs with the BLE
  PIN), jumps to the bootloader and runs the normal DFU. ESP32 companion firmware has no OTA
  server (`ESP32Board::startOTAUpdate` is built for repeater / room server only), and USB /
  WiFi companion builds have no BLE, so they are not offered.
- FR-2.3 Sources that publish nothing for the selected board are shown disabled with a reason.
- FR-2.4 Custom firmware file: the last entry of the source list; step 3 then offers a file
  chooser (and earlier custom files for the board) instead of a release list.
  nRF52: Nordic DFU .zip (validated with the package parser); ESP32: OTA .bin (ESP-IDF app
  image 0xE9 or MCUboot; merged images — partition table magic 0xAA50 at 0x8000 — refused).
  Stored in the library with source id `local`.

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

- FR-4.1 BLE: in-app scan list (see §4.1). WiFi: see §4.2.
- FR-4.2 Each found node shows name, mode (update mode / bootloader) and signal strength.
- FR-4.3 Clear error messages for: Bluetooth off, permission denied, node not found,
  node not reachable, wrong network.

### 5.5 Flash (FR-5)

- FR-5.1 Progress bar with percentage, transferred bytes, speed and ETA.
- FR-5.2 Cancel button (with a warning that the node may stay in bootloader/OTA mode — which
  is recoverable by retrying).
- FR-5.3 The screen stays on during the transfer (M5).
- FR-5.4 Detailed log panel (collapsed by default), copyable for bug reports.

### 5.6 General (FR-6)

- FR-6.1 Theme: Light / Dark / System.
- FR-6.2 Language: English / Hungarian / German, auto-detected from the browser, switchable; new
  languages added by dropping a JSON file into `src/i18n/locales/` (see §9.3).
- FR-6.3 Installers for Windows (NSIS/MSI) and Android (APK); works offline except for
  listing/downloading firmware.
- FR-6.4 App version shown in the footer / About dialog, with a link to the changelog.
- FR-6.5 At start-up the app compares its version with the repository's latest (non
  pre-release) GitHub release and offers the platform's installer in a dismissible banner;
  failures are silent.

---

## 6. Update protocols

### 6.1 nRF52 — Nordic legacy DFU over BLE

MeshCore's nRF52 firmware (`NRF52Board::startOTAUpdate`) starts BLE advertising under
`<BOARD>_OTA` and exposes the Adafruit `BLEDfu` service (Nordic **legacy** DFU, buttonless).
The bootloader is the Adafruit nRF52 bootloader (or the OTAFIX fork), which implements the
legacy DFU protocol and advertises as `AdaDFU` or `<BOARD>_DFU`.

| Item | UUID |
|---|---|
| Legacy DFU service | `00001530-1212-efde-1523-785feabcd123` |
| DFU Control Point | `00001531-1212-efde-1523-785feabcd123` |
| DFU Packet | `00001532-1212-efde-1523-785feabcd123` |
| DFU Version | `00001534-1212-efde-1523-785feabcd123` (`0x0001` = application mode) |

Sequence (`src/lib/dfu/legacy-dfu.ts`, own implementation, transport-agnostic):

1. Read DFU Version → if application mode, write `START_DFU (0x01) + APPLICATION (0x04)` to
   the control point; the node reboots into the bootloader (`src/lib/ble/flash-ble.ts`).
2. Rescan, connect to the bootloader, enable control point notifications.
3. `START_DFU` + image sizes (softdevice, bootloader, application) on the packet char.
4. `INIT_DFU_PARAMS (0x02)` start → send `.dat` init packet → `INIT_DFU_PARAMS` complete.
5. `PACKET_RECEIPT_NOTIF_REQ (0x08)` with N packets (default 8, adjustable under Advanced).
6. `RECEIVE_FIRMWARE_IMAGE (0x03)` → stream the `.bin` in 20-byte packets, waiting for
   receipt notifications.
7. `VALIDATE (0x04)` → `ACTIVATE_AND_RESET (0x05)`.

The `.zip` DFU package is unpacked with a small built-in ZIP reader (`DecompressionStream`).

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

### 6.3 ESP32 upload (M4)

Two OTA servers exist, depending on the firmware the node runs (`src/lib/wifi/ota-format.ts`):

| Firmware | AP / address | Identity | Upload |
|---|---|---|---|
| MeshCore, PowerSaving (AsyncElegantOTA) | `MeshCore-OTA`, 192.168.4.1 | `GET /update/identity` → `{"id":"<name> (<board>)"}` | `POST /update`, multipart (`MD5`, `firmware`), ESP-IDF app image (`0xE9`) |
| ZephCore (Zephyr + MCUboot) | `ZephCore-OTA`, 192.168.100.1 | `GET /identity` → `{"name","board"}` | `POST /upload`, raw MCUboot image (`…-update.bin`, magic `0x96f3b83d`) |

*Scan* probes both addresses at once; the server that answers decides the upload format. An
image of the other family is refused with an explanation (switching between Arduino MeshCore
and ZephCore needs a USB flash).

*Scan* = `GET http://192.168.4.1/update/identity` (falls back to `GET /`); the reported board
(`<name> (<board>)`, from `getManufacturerName()`) is fuzzily compared with the selected
board — no match means "not verifiable" and needs confirmation. *Update* computes the MD5
(`src/lib/util/md5.ts`) and posts a hand-built `multipart/form-data` body (`MD5`, then
`firmware`) through the native HTTP plugin (`src/lib/wifi/`). The upload reports no progress,
so the UI shows elapsed time. On Android, mobile data must be off during the update so traffic
uses the node's WiFi (binding to the WiFi network natively is a possible later improvement).

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
- **ZephCore** (Zephyr-based) uses Zephyr board names (`heltec_wifi_lora32_v3`), mapped with
  `boardAliases`; its ESP32 OTA images are the MCUboot-signed `…-update.bin` files, uploaded
  to its own OTA server (§6.3).

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

Generated by `scripts/build-catalog.mjs` from the MeshCore source tree (PlatformIO
`*_repeater` / `*_room_server` environments, platform from the `extends` chain, `*_OTA` BLE
names from the board classes); display names are curated in `catalog/board-overrides.json`.
ESP32 builds with `DISABLE_WIFI_OTA` (ESP32-C6 boards) are excluded. Boards without an OTA
path (RP2040, STM32, `.uf2`/`.hex`-only) are excluded.

---

## 8. Architecture

```
┌──────────────────────────── Tauri app (Windows / Android) ───────────────────────────┐
│  Web view: UI in TypeScript (src/) ── i18n ── theme                                   │
│   ├─ catalog + release listing ───── native HTTP ─────► api.github.com               │
│   ├─ firmware library (IndexedDB) ◄─ native HTTP ─────── github.com release assets   │
│   ├─ legacy DFU engine ───────────── tauri-plugin-blec ► nRF52 node / bootloader     │
│   └─ ESP32 uploader (M4) ─────────── native HTTP ─────► http://192.168.4.1/update    │
│  Rust shell (src-tauri/): registers tauri-plugin-http and tauri-plugin-blec          │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

All logic stays in TypeScript and is unit-tested with `node:test`; the Rust part only hosts the
web view and the plugins.

### 8.1 Tech stack

| Concern | Choice | Why |
|---|---|---|
| App shell | Tauri 2 (Rust) | One code base for Windows, Android (and later iOS/macOS); small installers |
| Bluetooth | `tauri-plugin-blec` (btleplug / Android Kotlin backend) | Native BLE, no browser blocklist |
| HTTP | `tauri-plugin-http` | No CORS → no proxy; plain HTTP to the ESP32 |
| UI | Plain TypeScript, small `h()` helper and observable store | Zero UI framework, tiny bundle |
| Build | esbuild (front-end), Cargo/Gradle via Tauri CLI | Fast, few dependencies |
| Storage | IndexedDB (thin own wrapper) | Large binary blobs, survives restarts |
| ZIP / MD5 | Own small implementations | No dependency |
| Tests | `node:test` (Node 22 runs TypeScript natively) | DFU protocol tested against a simulated bootloader |
| CI | GitHub Actions: tests on Linux, installers on Windows and Linux (Android) | No local Rust/Android toolchain needed |

### 8.2 Distribution

- Every push to `dev` or `main` builds the Windows installers, the macOS `.dmg`, the Linux
  `.AppImage` and the Android APK (workflow artifacts).
- A tag `vX.Y.Z` additionally publishes them as a GitHub Release.
- Android APKs are signed with a key stored in repository secrets (see `docs/BUILDING.md`).
- Windows builds are unsigned for now (SmartScreen shows a warning on first start).
- macOS builds are ad-hoc signed but not notarised (Gatekeeper: *Open Anyway* on first start).

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
| Performance | UI bundle < 300 kB; app starts in under 2 s |
| Reliability | Flash never starts without a fully verified cached file |
| Privacy | No analytics, no accounts; only GitHub and the node are contacted |
| Security | HTTP plugin limited to GitHub and 192.168.4.1; strict CSP |
| Permissions | Bluetooth (scan/connect), network; nothing else |
| Compatibility | Windows 10/11 (WebView2), Android 8+ (API 26, required by the Bluetooth plugin) |

---

## 11. Repository layout

```
alpine-ota-updater/
├─ src/                # UI and logic (TypeScript)
│  ├─ app/             # state store and actions (state.ts, flash.ts)
│  ├─ lib/
│  │  ├─ catalog/      # sources, boards, release asset matching
│  │  ├─ cache/        # IndexedDB firmware library, downloads
│  │  ├─ github/       # release lists
│  │  ├─ net/          # HTTP (native plugin)
│  │  ├─ ble/          # native BLE, device recognition, BLE update flow
│  │  ├─ dfu/          # legacy DFU protocol, DFU package parser
│  │  └─ util/         # formatting, storage, ZIP
│  ├─ ui/              # DOM rendering (header, steps, library, side panel)
│  ├─ i18n/            # locale files + loader
│  └─ styles/          # CSS (design tokens, light/dark)
├─ src-tauri/          # Rust shell, tauri.conf.json, capabilities, icon source
├─ catalog/            # sources.json, boards.json, board-overrides.json
├─ public/             # index.html, static assets
├─ scripts/            # front-end build, dev server, catalog generator
├─ tests/              # unit tests
├─ docs/               # SPEC, BUILDING, DEVELOPMENT, USER_GUIDE, TRANSLATING, ADDING_A_SOURCE
├─ .github/workflows/  # ci.yml (tests), build.yml (installers, releases)
├─ CHANGELOG.md
├─ LICENSE (MIT)
└─ README.md
```

## 12. Versioning & release process

- **Semantic Versioning** (`MAJOR.MINOR.PATCH`); pre-1.0 while in development.
- **Conventional Commits** (`feat:`, `fix:`, `docs:`, `chore:` …).
- **CHANGELOG.md** in *Keep a Changelog* format, updated in each release.
- Releases are git tags `vX.Y.Z`; `package.json` holds the version, which Tauri and the UI
  read at build time.
- Branching: `main` is always deployable; features on short-lived branches once on GitHub.

---

## 13. Milestones

| M | Content | Status |
|---|---|---|
| M0 | Repo, spec, tooling, CI | done (v0.1.0) |
| M1 | App shell, theme, i18n, catalog + release listing | done (v0.1.0) |
| M2 | Firmware download + library (cache) | done (v0.1.0) |
| M3 | BLE legacy DFU | done (v0.3.0, tested on Heltec T114 from Windows and Android) |
| M3a | Native app (Tauri), Windows + Android builds in CI | done (v0.3.0) |
| M4 | WiFi OTA for ESP32 | v0.4.0 (awaiting hardware test) |
| M5 | Polish (keep screen on, signed releases), v1.0.0 | — |
| Later | iOS/macOS, pre-release toggle, more sources | — |

## 14. Open points / risks

1. **Windows Bluetooth stack:** GATT caching and the bootloader's different handles may need
   tuning; verified with a Heltec T114 in M3a.
2. **IPC throughput:** every 20-byte DFU packet is one call from the web view to Rust. If the
   transfer is too slow, the packet loop moves into a Rust command.
3. **Android WiFi without internet** for the ESP32 upload (M4).
4. **ZephCore** compatibility (nRF52 DFU zip, ESP32 MCUboot OTA).
5. **Plugin versions:** `tauri-plugin-blec` is young; the app uses only its stable subset
   (single connected device).
