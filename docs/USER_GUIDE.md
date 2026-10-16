# User guide

Alpine OTA Updater updates the firmware of MeshCore **repeaters** and **room servers** without
a cable.

## What you need

- A Windows 10/11 PC with Bluetooth, or an Android phone/tablet (Android 8 or newer).
- Admin access to the node from your companion app (to send `start ota`).

## Installing

- **Windows:** run `Alpine OTA Updater_<version>_x64-setup.exe`. If SmartScreen shows
  *Windows protected your PC*, choose **More info → Run anyway** (the installer is not
  code-signed yet).
- **Android:** open `alpine-ota-updater-<version>.apk` on the phone and allow installing
  apps from that source when asked. On first scan, allow the Bluetooth (*Nearby devices*)
  permission.

## Updating a node

1. **Device type** — search for and select the node's hardware. The badge shows whether it is
   updated over **Bluetooth** (nRF52) or **WiFi** (ESP32).
2. **Firmware source** — choose the role (*Repeater* / *Room server*) and the firmware family
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
