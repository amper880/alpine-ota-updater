# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/OWNER/alpine-ota-updater/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/OWNER/alpine-ota-updater/releases/tag/v0.1.0
