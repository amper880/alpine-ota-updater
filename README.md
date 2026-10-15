# Alpine OTA Updater

Over-the-air firmware updater for **MeshCore** repeater and room server nodes — right from the browser.

- **nRF52** nodes are updated over **Bluetooth** (Nordic legacy DFU)
- **ESP32** nodes are updated over **WiFi** (the node's `MeshCore-OTA` access point)
- Firmware from multiple sources: official MeshCore, PowerSaving, ZephCore — and easy to extend
- Downloaded firmware is kept locally and reused, even offline
- Works on phone, tablet and desktop; light / dark theme; English and Hungarian

> **Status:** early development — see [docs/SPEC.md](docs/SPEC.md) for the specification.

## Requirements

- Chrome or Edge (desktop or Android). iOS/Safari and Firefox do not support Web Bluetooth.
- The node must already be in OTA mode: send `start ota` to it from your companion app.

## Documentation

| Document | Content |
|---|---|
| [docs/SPEC.md](docs/SPEC.md) | Product and technical specification |
| [CHANGELOG.md](CHANGELOG.md) | Release history |

More documents (user guide, deployment, translating, adding a firmware source) follow as the
features are implemented.

## License

[MIT](LICENSE) © 2026 Amper
