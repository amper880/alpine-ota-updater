# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.1] - 2026-10-23

### Added

- Bluetooth: if the firmware transfer fails (e.g. *Timed out waiting for packet receipt*), the
  app reconnects to the bootloader, which stays in DFU mode, and starts over once with 20-byte
  packets and a receipt every 8 packets. The log shows how many bytes had been sent.
- Factory bootloaders are recognised: the Heltec stock bootloader name (`HT-n5262G-OTA` for the
  T096) is listed as *Bootloader* and matched to the board, and every bootloader is identified
  by its Device Information firmware revision (logged). For factory (non-OTAFIX) bootloaders
  the update uses 20-byte packets and a receipt every 8 packets, shows a note before the start
  and, if it fails, points to the OTAFIX bootloader.
- German translation (*Deutsch* in the language menu; picked automatically on German systems).
- *Custom firmware file* as the last firmware source: a DFU package (.zip, nRF52) or an OTA
  image (.bin, ESP32) can be picked from disk. It is checked (.uf2 / merged images / non-DFU
  zips are refused with an explanation), stored in the firmware library as *Custom file* and
  used like a downloaded release; for ESP32 its format also picks the WiFi guide (MeshCore or
  ZephCore).
- App update check: at start-up the app asks GitHub for the latest release and, when it is
  newer than the running version, shows a banner with *Download* (the installer for this
  platform: `.exe`, `.dmg`, `.AppImage` or `.apk`), *What's new* and *Later* (hides it until a
  still newer version appears). Offline or failed checks stay silent.

### Changed

- Removed leftovers of the original web-app concept (stale local web build, ignores and
  comments about the download proxy, Web Bluetooth and the service worker).

## [0.5.0] - 2026-10-19

### Added

- *Companion* role: the Bluetooth companion firmware of nRF52 boards (`companion_radio_ble`;
  MeshCore and ZephCore) can be updated. The companion's DFU service needs pairing, so the
  connection guide explains it, and a missing pairing or update service is reported clearly.
  ESP32 / USB companions have no over-the-air update and are not offered. The board catalog
  now includes companion-only nRF52 boards (96 boards).
- macOS app (universal `.dmg` for Apple silicon and Intel, ad-hoc signed) and a Linux
  `.AppImage`, built by CI next to Windows and Android and attached to
  releases. macOS asks for Bluetooth and local network access (`src-tauri/Info.plist`).

### Changed

- Footer: the *Source code* link is gone; *Changelog* now always points to the project
  repository's `CHANGELOG.md`, followed by *Author: Amper & Claude*.
- The Windows app starts maximised.
- The device type list shows one board per row (two columns were hard to scan on tablets).

### Fixed

- Error messages are fully translated: texts from the operating system or the Bluetooth / HTTP
  plugins (e.g. *no bluetooth adapters found*) are recognised and shown in the app's
  language, with the original text folded under *Technical details*.
- Web links (changelog, release pages on GitHub) open in the system browser via
  `tauri-plugin-opener` instead of relying on the webview's handling of `target="_blank"`.

## [0.4.0] - 2026-10-16

### Added

- WiFi updates for ESP32 nodes (M4): *Scan* finds the node at `http://192.168.4.1`
  (ElegantOTA identity, e.g. `Rooftop (Heltec V3)`) and compares the reported board with the
  selected device type; *Start update* uploads the image with its MD5 through the native HTTP
  plugin and waits for the node's `OK`. Elapsed time is shown during the upload.
- ZephCore on ESP32: its MCUboot `…-update.bin` images are listed (Zephyr board names such as
  `heltec_wifi_lora32_v3` are mapped to the catalog via `boardAliases`), and the app talks
  to ZephCore's own OTA server (`ZephCore-OTA`, `http://192.168.100.1`, raw `POST /upload`).
  *Scan* probes both MeshCore and ZephCore addresses; an image of the wrong family is refused
  with an explanation.
- Source options `otaVariants`, `boardAliases`, `wifiOta` and the `flavor` asset group
  (`docs/ADDING_A_SOURCE.md`).
- MD5 implementation and multipart builder with unit tests.
- App icon and installer branding: the Alpine logo is now the Windows app and installer icon,
  the NSIS/MSI installer header, sidebar and banner images, and the Android launcher icon
  (adaptive, with a themed monochrome variant). Sources in `assets/brand/`,
  `src-tauri/icons/` and `src-tauri/installer/`; `npm run brand` regenerates them.
- Warning before sending ZephCore over Bluetooth: switching from Arduino MeshCore may reset
  the node's stored settings on ZephCore's first start.

### Changed

- Bluetooth: default packets per confirmation raised from 8 to 32 (tested on Windows and
  Android, ~25 % faster).
- WiFi guide: advice to turn off mobile data on phones during the update.
- Bluetooth list with *Show all Bluetooth devices*: each entry shows its address under the
  name (devices with the same name can be told apart); devices that advertise no name are
  collapsed behind *Show N devices without a name*.

## [0.3.0] - 2026-10-16

Tested on hardware: Heltec T114 updated over Bluetooth from Windows 11 and an Android tablet.

### Changed

- **The project is now a native app (Tauri 2) for Windows and Android instead of a web app.**
  Chromium's Web Bluetooth blocklist forbids the Nordic legacy DFU service used by the nRF52
  bootloaders, so Bluetooth updates cannot work in any browser.
- Bluetooth scanning happens inside the app: nodes in update mode are listed with their mode
  (update mode / bootloader) and signal strength; a node already in bootloader mode
  (`<BOARD>_DFU`, `AdaDFU`) can be updated directly.
- After the buttonless jump (with control point notifications enabled first, as the DFU
  service requires), the app rescans and connects to the bootloader automatically (same
  address, matching `<BOARD>_DFU` name, strongest bootloader, or the previous address).
- Bluetooth connection: up to three attempts, each retry after a fresh scan; errors from the
  native plugin are shown in full, with timing.
- Release lists and firmware files are fetched directly from GitHub through the native HTTP
  plugin; release lists are cached for 10 minutes.
- Minimum Android version: 8.0 (API 26), required by `tauri-plugin-blec`.

### Added

- `src-tauri/` Rust shell with `tauri-plugin-blec` (Bluetooth), `tauri-plugin-http` and
  `tauri-plugin-log` (native log file, e.g. `%LOCALAPPDATA%\com.ampersworld.alpineota\logs`).
- DFU packets sized to the negotiated MTU (up to 244 bytes instead of 20, ~4–5× faster);
  Android requests the largest MTU; *Advanced → Compatibility mode* forces 20-byte packets.
  The log shows packet size and transfer speed.
- GitHub Actions workflow building the Windows installer (NSIS, MSI) and a signed Android
  APK on Ubuntu 24.04 with the preinstalled Android SDK; tags publish a GitHub Release.
- `docs/BUILDING.md`: getting installers, Android signing key, local builds.

### Removed

- Web deployment: GitHub Pages workflow, Cloudflare Worker download proxy, service worker and
  web manifest, Web Bluetooth code.

## [0.2.0] - 2026-10-15

### Added

- Bluetooth updates for nRF52 nodes (Nordic legacy DFU, Adafruit / OTAFIX bootloader):
  device scan via the browser chooser filtered to `<BOARD>_OTA` names, automatic switch from
  the application into the bootloader, reconnection (with a manual bootloader pick as
  fallback), firmware transfer with packet receipt flow control, validation and activation.
- Update step with progress, speed and remaining time, cancel, detailed log with copy button,
  and an advanced setting for packets per confirmation.
- Device check: warns when the node's Bluetooth name does not match the selected device type
  and only continues after explicit confirmation.
- Screen wake lock and leave-page warning while an update is running.
- ZIP reader based on the native `DecompressionStream` (no dependency) and DFU package parser.
- Unit tests for the DFU protocol against a simulated bootloader and for package parsing.

## [0.1.0] - 2026-10-15

### Added

- Step-by-step update flow: device type, firmware source and role, firmware version;
  connection guides for Bluetooth (nRF52) and WiFi (ESP32) nodes.
- Device catalog with 88 boards (43 nRF52, 45 ESP32) generated from the MeshCore source
  (`scripts/build-catalog.mjs`), with curated display names.
- Firmware sources: official MeshCore, PowerSaving (IoTThinks), ZephCore (nRF52 only),
  configurable in `catalog/sources.json`.
- Release listing (stable releases only) with release notes; offline copy of the last list.
- Firmware download through the proxy with size and SHA-256 verification, stored in
  IndexedDB; firmware library dialog to review and delete files.
- Download proxy as a Cloudflare Worker with repository allow-list and edge caching of
  release lists; the same code runs in the local dev server.
- Light, dark and system theme; English and Hungarian UI with pluggable locale files.
- Responsive layout for phone, tablet and desktop; installable PWA with offline app shell and
  update notification.
- Unit tests for asset matching, the proxy and locale completeness.
- GitHub Actions workflows for CI and GitHub Pages deployment.
- Documentation: specification, user guide, development, deployment, adding a source,
  translating.

[Unreleased]: https://github.com/amper880/alpine-ota-updater/compare/v0.5.1...HEAD
[0.5.1]: https://github.com/amper880/alpine-ota-updater/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/amper880/alpine-ota-updater/compare/v0.4.0-beta...v0.5.0
[0.4.0]: https://github.com/amper880/alpine-ota-updater/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/amper880/alpine-ota-updater/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/amper880/alpine-ota-updater/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/amper880/alpine-ota-updater/releases/tag/v0.1.0
