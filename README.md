# Alpine OTA Updater

Over-the-air firmware updater app for **MeshCore** repeater and room server nodes, for
**Windows** and **Android**.

- **nRF52** nodes are updated over **Bluetooth** (Nordic legacy DFU)
- **ESP32** nodes are updated over **WiFi** (the node's `MeshCore-OTA` access point)
- Firmware from several sources (official MeshCore, PowerSaving, ZephCore); new sources are
  added in [`catalog/sources.json`](catalog/sources.json)
- Downloaded firmware is verified, kept on the device and reused, even offline
- Works on phone, tablet and desktop; light / dark theme; English and Hungarian

> **Status: v0.3.0.** The app now runs natively (Tauri 2) because browsers block the
> Bluetooth service nRF52 bootloaders use. Device selection, firmware download, the offline
> library and Bluetooth updates are implemented and await testing on hardware; WiFi updates
> for ESP32 are next. See the [specification](docs/SPEC.md#13-milestones).

## Download

Installers are built by GitHub Actions on every push: **Actions → Build apps → Artifacts**,
and attached to each [release](../../releases). See [docs/BUILDING.md](docs/BUILDING.md).

## Development

```sh
npm install
npm run dev        # UI in the browser at http://localhost:5173 (Bluetooth/downloads need the app)
npm run check      # type check + tests + front-end build
npm run app:dev    # the native app (needs Rust, see docs/BUILDING.md)
```

## Documentation

| Document | Content |
|---|---|
| [User guide](docs/USER_GUIDE.md) | Installing the app and updating a node |
| [Specification](docs/SPEC.md) | Requirements, protocols, architecture, milestones |
| [Building](docs/BUILDING.md) | CI builds, installers, Android signing, local builds |
| [Development](docs/DEVELOPMENT.md) | Project structure, commands, conventions, releasing |
| [Adding a firmware source](docs/ADDING_A_SOURCE.md) | Extending the source list |
| [Translating](docs/TRANSLATING.md) | Adding a UI language |
| [Changelog](CHANGELOG.md) | Release history |

## License

[MIT](LICENSE) © 2026 Amper
