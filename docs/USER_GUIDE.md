# User guide

Alpine OTA Updater updates the firmware of MeshCore **repeaters** and **room servers** without
a cable.

## What you need

- Chrome or Edge on a computer or an Android phone/tablet.
  iPhone and iPad are not supported for Bluetooth updates.
- Admin access to the node from your companion app (to send `start ota`).

## Install the app (optional)

Open the link in Chrome/Edge and choose **Install app** (address bar icon on desktop,
*Add to home screen* on Android). The installed app also starts without internet.

## Updating a node

1. **Device type** — search for and select the node's hardware. The badge shows whether it is
   updated over **Bluetooth** (nRF52) or **WiFi** (ESP32).
2. **Firmware source** — choose the role (*Repeater* / *Room server*) and the firmware family
   (official MeshCore, PowerSaving, ZephCore …).
3. **Firmware** — pick a version and press **Download**. The file is checked and stored on
   your device; next time it is available immediately, even offline. Already downloaded
   versions show *Downloaded* and a **Use this** button.
4. **Connect to the node** — follow the on-screen guide:
   - *Bluetooth:* send `start ota` from the companion app; the node appears as `<BOARD>_OTA`.
   - *WiFi:* send `start ota`, then join the open WiFi network **MeshCore-OTA** with this
     device and return to the app.
5. **Update** — the firmware is sent to the node, which restarts with the new version.

> WiFi updates (ESP32) are being implemented; Bluetooth updates (nRF52) work from version 0.2.

### Bluetooth update in detail

1. Press **Scan**. The browser opens its own device list, showing only nodes in update mode.
   Select the node and press **Pair** (no PIN is needed).
2. Step 4 shows the node's name and whether it matches the selected device type. If it does
   not match, the update only starts after you tick *I understand, update anyway*.
3. Press **Start update**. The app restarts the node into its bootloader, reconnects and
   sends the firmware. If the bootloader cannot be reached automatically, press
   **Select bootloader** and pick the device (usually called `AdaDFU`).
4. When *Update complete* appears, the node restarts with the new firmware.

If an update is interrupted, the node stays in update mode (bootloader). Start the update
again; the app connects to the bootloader directly.

## Firmware library

The **Firmware library** button in the header lists all downloaded files with their size.
Delete files you no longer need there.

## Troubleshooting

| Problem | What to do |
|---|---|
| "This browser has no Bluetooth support" | Use Chrome or Edge on a computer or Android. |
| The release list does not load | Check the internet connection. If you were online before, the last list is shown offline. |
| Download fails | Try again; the file is verified and never stored if it is incomplete. |
| The node is not in the Bluetooth list | Send `start ota` again (OTA mode ends when the node restarts); move closer; on Windows, remove the node from *Settings → Bluetooth & devices* if it was paired before. |
| The update stops or fails repeatedly | Open *Advanced* and set *Packets per confirmation* to 4 or 1, then try again. Copy the log from *Details* when reporting a problem. |
