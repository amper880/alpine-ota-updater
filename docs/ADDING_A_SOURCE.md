# Adding a firmware source

Firmware sources are listed in [`catalog/sources.json`](../catalog/sources.json). A source is
any GitHub repository that publishes MeshCore-compatible repeater / room server builds as
release assets.

## Steps

1. Add an entry to `catalog/sources.json` (fields below).
2. Add the repository (`owner/name`) to `ALLOWED_REPOS` in `proxy/wrangler.toml` and redeploy
   the proxy (`npm run proxy:deploy`). The proxy refuses repositories that are not listed.
3. Optional: add a translated description as `sourceDesc.<id>` to every file in
   `src/i18n/locales/`. Without it, the English `description` from the JSON is shown.
4. Add a test case to `tests/match.test.ts` with a few real asset names from the source.
5. `npm run check`, commit, push.

## Fields

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Short unique id, lowercase (`"powersaving"`). Stored with downloaded files — do not change later. |
| `name` | yes | Display name. |
| `description` | no | One sentence shown under the name. |
| `repo` | yes | GitHub `owner/name`. |
| `homepage` | no | Link for more information. |
| `tagPattern` | no | Regex a release tag must match. Use when every release contains all roles. |
| `roleTags` | no | Per-role tag regexes, e.g. `{ "repeater": "^repeater-v" }`. Use when the source publishes a separate release per role. Takes precedence over `tagPattern`. |
| `versionPattern` | no | Regex with a named group `version` that extracts the version from the tag. Default: the whole tag. |
| `assetPattern` | yes | Regex matched against asset file names (case-insensitive). Named groups: `board`, `role`, `ext` (required), `merged` (if present the file is skipped), `variant` (informational). |
| `exclude` | no | List of regexes; matching asset names are ignored. |
| `platforms` | yes | Which platforms' OTA images are supported: `"nrf52"` (`.zip` DFU packages), `"esp32"` (`.bin` app images). |
| `notes` | no | Extra note shown under the firmware list. |

### How assets are matched

- `role` may be written `repeater`, `room_server`, `roomserver` or `room-server`.
- `board` is compared with the board's id and aliases after removing everything except
  letters and digits and lowercasing (`Heltec_t114` = `heltec-t114` = `heltect114`).
  If a source uses a completely different name for a board, add that spelling to the board's
  `aliases` via `catalog/board-overrides.json` and regenerate the catalog.
- `.zip` → nRF52 (Bluetooth DFU), `.bin` → ESP32 (WiFi OTA). `.uf2`, `.hex` and
  `-merged.bin` files are never used for over-the-air updates.
- Only stable releases (not draft, not pre-release) are listed.

## Example

```json
{
  "id": "example",
  "name": "Example Fork",
  "repo": "someone/MeshCore-fork",
  "tagPattern": "^v",
  "versionPattern": "^v(?<version>.+)$",
  "assetPattern": "^(?<board>.+?)_(?<role>repeater|room_server)-v[^-]+(?<merged>-merged)?\\.(?<ext>zip|bin)$",
  "platforms": ["nrf52", "esp32"]
}
```
