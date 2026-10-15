# Alpine OTA Updater

Over-the-air firmware updater for **MeshCore** repeater and room server nodes, right from the
browser.

- **nRF52** nodes are updated over **Bluetooth** (Nordic legacy DFU)
- **ESP32** nodes are updated over **WiFi** (the node's `MeshCore-OTA` access point)
- Firmware from several sources (official MeshCore, PowerSaving, ZephCore); new sources are
  added in [`catalog/sources.json`](catalog/sources.json)
- Downloaded firmware is verified, kept on the device and reused, even offline
- Works on phone, tablet and desktop; installable as an app; light / dark theme; English and
  Hungarian

> **Status: v0.2.0.** Device selection, firmware download, the offline firmware library and
> Bluetooth updates of nRF52 nodes are implemented. WiFi updates of ESP32 nodes are next
> (milestone M4 in the [specification](docs/SPEC.md#13-milestones)).

## Requirements

- Chrome or Edge on a computer or Android. iOS/Safari and Firefox have no Web Bluetooth.
- The node must be in OTA mode: send `start ota` to it from your companion app.

## Quick start (development)

```sh
npm install
npm run dev        # http://localhost:5173, includes a local download proxy
npm run check      # type check + tests + production build
```

## Documentation

| Document | Content |
|---|---|
| [User guide](docs/USER_GUIDE.md) | How to update a node |
| [Specification](docs/SPEC.md) | Requirements, protocols, architecture, milestones |
| [Development](docs/DEVELOPMENT.md) | Project structure, commands, conventions, releasing |
| [Deployment](docs/DEPLOYMENT.md) | GitHub Pages + Cloudflare Worker setup, own server |
| [Adding a firmware source](docs/ADDING_A_SOURCE.md) | Extending the source list |
| [Translating](docs/TRANSLATING.md) | Adding a UI language |
| [Changelog](CHANGELOG.md) | Release history |

## License

[MIT](LICENSE) © 2026 Amper
