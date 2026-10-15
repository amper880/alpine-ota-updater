# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Bluetooth errors from the native plugin were shown as "undefined"; the real error text is
  now logged.
- Switching the node into the bootloader failed on real hardware with ATT error `0xFD`
  (notifications not enabled): control point notifications are now enabled before the
  buttonless jump.
- Scans ended immediately inside the update flow (the plugin's scan call returns as soon as
  scanning starts); scans now run for their full time or until stopped.
- If no bootloader is seen after the jump, the previous address is tried and checked.

### Changed

- Bluetooth connection: up to three attempts, each retry after a fresh scan for the node;
  timing and visible devices are logged.
- CI: pinned the Linux runners to Ubuntu 24.04 and moved to Node 24 based action versions.
- CI: the Android job uses the SDK preinstalled on the runner instead of
  `android-actions/setup-android`, which failed installing the removed `tools` package.

### Added

- Native log file with Bluetooth details (`%LOCALAPPDATA%\com.ampersworld.alpineota\logs` on
  Windows) for troubleshooting.

## [0.3.0] - 2026-10-15

### Changed

- **The project is now a native app (Tauri 2) for Windows and Android instead of a web app.**
  Chromium's Web Bluetooth blocklist forbids the Nordic legacy DFU service used by the nRF52
  bootloaders, so Bluetooth updates cannot work in any browser.
- Bluetooth scanning happens inside the app: nodes in update mode are listed with their mode
  (update mode / bootloader) and signal strength; a node already in bootloader mode
  (`<BOARD>_DFU`, `AdaDFU`) can be updated directly.
- After switching the node into the bootloader, the app rescans and connects to it
  automatically (same address, matching `<BOARD>_DFU` name, or strongest bootloader).
- Release lists and firmware files are fetched directly from GitHub through the native HTTP
  plugin; release lists are cached for 10 minutes.

### Added

- `src-tauri/` Rust shell with `tauri-plugin-blec` (Bluetooth) and `tauri-plugin-http`.
- GitHub Actions workflow building the Windows installer (NSIS, MSI) and a signed Android
  APK; tags publish a GitHub Release.
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

[Unreleased]: https://github.com/amper880/alpine-ota-updater/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/amper880/alpine-ota-updater/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/amper880/alpine-ota-updater/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/amper880/alpine-ota-updater/releases/tag/v0.1.0
