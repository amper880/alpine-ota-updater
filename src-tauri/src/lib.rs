//! Alpine OTA Updater — native shell.
//!
//! The user interface and the update logic live in the web front-end (`../src`). This crate
//! only hosts it and registers the native plugins it needs:
//! - `tauri-plugin-blec`: Bluetooth Low Energy (no browser blocklist, unlike Web Bluetooth)
//! - `tauri-plugin-http`: HTTP without CORS / mixed-content limits (GitHub downloads,
//!   ESP32 OTA upload to http://192.168.4.1)
//! - `tauri-plugin-opener`: opens web links (changelog, release pages) in the system browser
//! - `wifi_bind` (below, Android only): sends the ESP32 OTA requests over the node's WiFi even
//!   though it has no internet and mobile data is on
//! - `tauri-plugin-log`: writes native logs (including Bluetooth details) to the app's log
//!   folder, e.g. `%LOCALAPPDATA%\com.ampersworld.alpineota\logs` on Windows

mod wifi_bind {
    //! Android: binds the process to the WiFi network for the OTA upload (Kotlin side:
    //! `src-tauri/android/WifiBindPlugin.kt`). Elsewhere the command does nothing.
    use tauri::{
        plugin::{Builder, TauriPlugin},
        Manager, Runtime,
    };

    pub struct WifiBind<R: Runtime>(
        #[cfg(target_os = "android")] tauri::plugin::PluginHandle<R>,
        #[cfg(not(target_os = "android"))] std::marker::PhantomData<R>,
    );

    #[cfg(target_os = "android")]
    #[derive(serde::Serialize)]
    struct BindArgs {
        enable: bool,
    }

    #[cfg(target_os = "android")]
    #[derive(serde::Deserialize)]
    struct BindResult {
        bound: bool,
    }

    /// Returns whether the app now sends its traffic over WiFi only.
    #[tauri::command]
    pub async fn bind_wifi<R: Runtime>(app: tauri::AppHandle<R>, enable: bool) -> Result<bool, String> {
        #[cfg(target_os = "android")]
        {
            let state = app.state::<WifiBind<R>>();
            let r: BindResult = state.0.run_mobile_plugin("bind", BindArgs { enable }).map_err(|e| e.to_string())?;
            Ok(r.bound)
        }
        #[cfg(not(target_os = "android"))]
        {
            let _ = (app, enable);
            Ok(false)
        }
    }

    pub fn init<R: Runtime>() -> TauriPlugin<R> {
        Builder::new("wifi-bind")
            .setup(|app, api| {
                #[cfg(target_os = "android")]
                let handle = api.register_android_plugin("com.ampersworld.alpineota", "WifiBindPlugin")?;
                #[cfg(not(target_os = "android"))]
                let handle = {
                    let _ = api;
                    std::marker::PhantomData
                };
                app.manage(WifiBind::<R>(handle));
                Ok(())
            })
            .build()
    }
}

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
        .plugin(wifi_bind::init())
        .invoke_handler(tauri::generate_handler![wifi_bind::bind_wifi])
        .run(tauri::generate_context!())
        .expect("error while running Alpine OTA Updater");
}
