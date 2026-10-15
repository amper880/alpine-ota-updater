# Building and releasing

Alpine OTA Updater is a [Tauri 2](https://v2.tauri.app/) app. The installers are built by
**GitHub Actions**, so no Rust or Android toolchain is needed on your computer.

## Getting the installers

1. Push to `main` (GitHub Desktop: *Push origin*).
2. On github.com open the repository → **Actions** → *Build apps* → the latest run.
3. When it is green (about 15–25 minutes the first time, faster later thanks to caching),
   download the **Artifacts** at the bottom of the run page:
   - `alpine-ota-updater-windows` — `…-setup.exe` (NSIS installer) and `.msi`
   - `alpine-ota-updater-android` — `alpine-ota-updater-<version>.apk`

Artifacts are kept for 90 days. A failed run shows the error in the job's log.

### Releases

Pushing a tag `vX.Y.Z` builds both apps and publishes them as a **GitHub Release** with
generated release notes. See [DEVELOPMENT.md](DEVELOPMENT.md#releasing) for the steps.

### GitHub Actions minutes

On a free GitHub account, private repositories get 2,000 build minutes per month (Windows
runners use the quota faster than Linux). Without a payment method, builds simply stop when
the quota is used up; public repositories have no limit.

## Installing

- **Windows:** run the `…-setup.exe`. The installer is not code-signed yet, so SmartScreen
  shows *Windows protected your PC*: choose **More info → Run anyway**.
- **Android:** copy the APK to the phone (or download it there), open it and allow
  *Install unknown apps* for the file manager / browser when asked.

## Android signing key

Android only installs signed APKs and only lets an app be updated by an APK signed with the
**same key**. The workflow signs the APK with a key from the repository secrets; without
them it generates a temporary key per build, so each new APK can only be installed after
uninstalling the previous one.

Create the key once and keep a backup — losing it means users must reinstall the app.

1. Create a keystore (needs a Java `keytool`, e.g. from Android Studio's `jbr/bin` folder or
   any JDK):

   ```sh
   keytool -genkeypair -v -keystore alpine-release.jks -alias alpine -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Convert it to base64:
   - Windows PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("alpine-release.jks")) | Set-Clipboard`
   - Linux/macOS: `base64 -w0 alpine-release.jks`
3. On github.com: **Settings → Secrets and variables → Actions → New repository secret**:
   - `ANDROID_KEYSTORE_BASE64` — the base64 text
   - `ANDROID_KEYSTORE_PASSWORD` — the keystore password
   - `ANDROID_KEY_ALIAS` — `alpine`

Never commit the `.jks` file.

## Building locally (optional)

Only needed for fast iteration on the native side.

**Windows app**

1. Install [Rust](https://rustup.rs/) and the *Microsoft C++ Build Tools*
   (see Tauri's [prerequisites](https://v2.tauri.app/start/prerequisites/)).
2. In the repository folder:

   ```sh
   npm install
   npm run icons      # generates src-tauri/icons from src-tauri/icons/source.png
   npm run app:dev    # runs the app with live reload
   npm run app:build  # builds the installers into src-tauri/target/release/bundle/
   ```

**Android app** additionally needs Android Studio (SDK + NDK) and the Rust Android targets;
then `npm run android:init` once and `npm run android:dev` with a phone connected over USB.

## How the build is wired

| Piece | File |
|---|---|
| App metadata, window, bundle settings | `src-tauri/tauri.conf.json` (version comes from `package.json`) |
| Native plugins | `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml` |
| What the UI may call | `src-tauri/capabilities/default.json` (Bluetooth, HTTP to GitHub and 192.168.4.1) |
| Front-end build | `scripts/build.mjs` → `dist/` |
| CI | `.github/workflows/ci.yml` (tests), `.github/workflows/build.yml` (installers) |

The Android project (`src-tauri/gen/android`) and the icon set are generated during the build
and are not committed.
