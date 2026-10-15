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

> Steps 4–5 (scanning and updating) are being implemented; version 0.1 covers steps 1–3.

## Firmware library

The **Firmware library** button in the header lists all downloaded files with their size.
Delete files you no longer need there.

## Troubleshooting

| Problem | What to do |
|---|---|
| "This browser has no Bluetooth support" | Use Chrome or Edge on a computer or Android. |
| The release list does not load | Check the internet connection. If you were online before, the last list is shown offline. |
| Download fails | Try again; the file is verified and never stored if it is incomplete. |
