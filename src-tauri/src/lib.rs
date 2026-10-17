//! Alpine OTA Updater — native shell.
//!
//! The user interface and the update logic live in the web front-end (`../src`). This crate
//! only hosts it and registers the native plugins it needs:
//! - `tauri-plugin-blec`: Bluetooth Low Energy (no browser blocklist, unlike Web Bluetooth)
//! - `tauri-plugin-http`: HTTP without CORS / mixed-content limits (GitHub downloads,
//!   ESP32 OTA upload to http://192.168.4.1)
//! - `tauri-plugin-opener`: opens web links (changelog, release pages) in the system browser
//! - `tauri-plugin-log`: writes native logs (including Bluetooth details) to the app's log
//!   folder, e.g. `%LOCALAPPDATA%\com.ampersworld.alpineota\logs` on Windows

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                // The plugin's command layer logs every write (one line per DFU packet).
                .level_for("tauri_plugin_blec", log::LevelFilter::Warn)
                .build(),
        )
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_blec::init())
        .run(tauri::generate_context!())
        .expect("error while running Alpine OTA Updater");
}
