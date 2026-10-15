//! Alpine OTA Updater — native shell.
//!
//! The user interface and the update logic live in the web front-end (`../src`). This crate
//! only hosts it and registers the native plugins it needs:
//! - `tauri-plugin-blec`: Bluetooth Low Energy (no browser blocklist, unlike Web Bluetooth)
//! - `tauri-plugin-http`: HTTP without CORS / mixed-content limits (GitHub downloads,
//!   ESP32 OTA upload to http://192.168.4.1)

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_blec::init())
        .run(tauri::generate_context!())
        .expect("error while running Alpine OTA Updater");
}
