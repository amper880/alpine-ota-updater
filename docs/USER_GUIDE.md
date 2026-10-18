# User guide

Alpine OTA Updater updates the firmware of MeshCore **repeaters** and **room servers** without
a cable.

## What you need

- A computer with Bluetooth — Windows 10/11, macOS 10.15 or newer, or a 64-bit Linux
  desktop with BlueZ — or an Android phone/tablet (Android 8 or newer).
- Admin access to the node from your companion app (to send `start ota`).

## Installing

- **Windows:** run `Alpine OTA Updater_<version>_x64-setup.exe`. If SmartScreen shows
  *Windows protected your PC*, choose **More info → Run anyway** (the installer is not
  code-signed yet).
- **macOS:** open `Alpine OTA Updater_<version>_universal.dmg` and drag the app into
  *Applications*. The app is not notarised by Apple, so the first start is blocked: open
  **System Settings → Privacy & Security**, scroll down and choose **Open Anyway** (older
  macOS: right-click the app → **Open**). On first scan, allow Bluetooth access; for ESP32
  updates, also allow *local network* access when asked.
- **Linux:** make `Alpine OTA Updater_<version>_amd64.AppImage` executable (file manager:
  *Properties → Allow executing*, or `chmod +x`) and run it. Bluetooth
  needs the BlueZ service running (`systemctl status bluetooth`); no root rights are needed.
- **Android:** open `alpine-ota-updater-<version>.apk` on the phone and allow installing
  apps from that source when asked. On first scan, allow the Bluetooth (*Nearby devices*)
  permission.

## Updating a node

1. **Device type** — search for and select the node's hardware. The badge shows whether it is
   updated over **Bluetooth** (nRF52) or **WiFi** (ESP32).
2. **Firmware source** — choose the role (*Repeater* / *Room server* / *Companion*) and the firmware family
   (official MeshCore, PowerSaving, ZephCore …).
3. **Firmware** — pick a version and press **Download**. The file is checked and stored on
   your device; next time it is available immediately, even offline. Already downloaded
   versions show *Downloaded* and a **Use this** button.
4. **Connect to the node** — follow the on-screen guide (details below).
5. **Update** — the firmware is sent to the node, which restarts with the new version.

### Bluetooth update (nRF52)

1. Send `start ota` from the companion app. The node appears as `<BOARD>_OTA`
   (e.g. `T114_OTA`). A node already in bootloader mode (`AdaDFU` or `<BOARD>_DFU`) can be
   updated directly.
2. Press **Scan**. Nodes in update mode appear in the list with their signal strength;
   *Show all Bluetooth devices* lists everything nearby.
3. Select the node. If its name does not match the selected device type, the update only
   starts after you tick *I understand, update anyway*.
4. Press **Start update**. The app restarts the node into its bootloader, reconnects and
   sends the firmware. Keep the device close and the app open.
5. When *Update complete* appears, the node restarts with the new firmware.

If an update is interrupted, the node stays in bootloader mode. Scan again, select it (now
shown as *Bootloader*) and start the update again.

### Companion update (nRF52, Bluetooth)

The *Companion* role is the Bluetooth companion radio (`companion_radio_ble`). It can only be
updated over the air on nRF52 boards; ESP32 companion firmware and the USB companion have no
over-the-air update, use USB for those.

1. Disconnect the MeshCore app from the companion (close the app or turn off Bluetooth on the
   phone) — the companion accepts one connection at a time.
2. Pair the companion with this device once. The companion only shows its update service to
   paired devices. **Windows:** *Settings → Bluetooth & devices → Add device*. **Android:** the
   PIN is asked at the first update. The PIN is on the node's display; without a display it is
   `123456` unless you changed it.
3. Press **Scan** and select `MeshCore-<name>`. Its name does not tell the board, so tick
   *I understand, update anyway* after checking that you selected the right device type.
4. Press **Start update**. The app switches the companion into its bootloader
   (`<BOARD>_DFU` or `AdaDFU`) and sends the firmware, as for repeaters.

If the app reports that the companion has no Bluetooth update service, that firmware version
lacks it (older MeshCore companions and other firmware families); update it over USB once.

### WiFi update (ESP32)

1. Download the firmware first — the node's WiFi has no internet.
2. Send `start ota` from the companion app. The node opens an open WiFi network:
   **MeshCore-OTA** (MeshCore, PowerSaving) or **ZephCore-OTA** (ZephCore).
3. Connect this device to that network. If it warns that the network has no internet,
   choose to stay connected. On a phone, turn off mobile data for the duration of the update.
4. Return to the app and press **Scan**. The node shows up as `<name> (<board>)`; the board is
   compared with the selected device type.
5. Press **Start update**. The upload takes a few seconds to a minute; the node answers *OK*
   and restarts.
6. Reconnect to your normal WiFi.

### Switching between MeshCore and ZephCore

- **nRF52 (Bluetooth):** the update itself works across families, but on its first start
  ZephCore checks the stored settings and may **reformat the storage** when it does not
  recognise them — node name, admin password, radio settings and possibly the identity can be
  reset. Only switch on a node you can reach and reconfigure. The app shows this warning
  whenever a ZephCore firmware is sent over Bluetooth.
- **ESP32 (WiFi):** the two families use different OTA servers and image formats; the app
  refuses cross-family uploads. Switch once over USB.

## Firmware library

The **Firmware library** button in the header lists all downloaded files with their size.
Delete files you no longer need there.

## Troubleshooting

| Problem | What to do |
|---|---|
| The release list does not load | Check the internet connection. If you were online before, the last list is shown offline. |
| Download fails | Try again; the file is verified and never stored if it is incomplete. |
| *No node answers* | Check that this device is connected to **MeshCore-OTA** / **ZephCore-OTA** and mobile data is off; send `start ota` again if the node restarted. |
| *This node runs MeshCore, but the selected file is a ZephCore image* (or the other way round) | Over WiFi a node can only be updated within the same firmware family. Pick a firmware from the matching source, or switch families once over USB. |
| The node is not in the list | Send `start ota` again (OTA mode ends when the node restarts); move closer; on Windows, remove the node from *Settings → Bluetooth & devices* if it was paired before. |
| The node cannot be connected | Copy the log from *Details*. On Windows also send the newest file from `%LOCALAPPDATA%\com.ampersworld.alpineota\logs` (paste the path into Explorer's address bar). |
| The update stops or fails repeatedly | Open *Advanced* and set *Packets per confirmation* to 4 or 1, then try again. Copy the log from *Details* when reporting a problem. |
