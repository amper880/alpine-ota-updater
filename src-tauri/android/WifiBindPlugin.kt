// Copied into the generated Android project by CI (see .github/workflows/build.yml).
//
// Binds the app's network traffic to the WiFi network. A node's OTA access point has no
// internet, so Android keeps mobile data as the default network and the app's requests to
// 192.168.4.1 / 192.168.100.1 never reach the node (they time out), while the browser may
// still work. bindProcessToNetwork() also covers the Rust HTTP client's sockets.
package com.ampersworld.alpineota

import android.app.Activity
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class BindArgs {
    var enable: Boolean = false
}

@TauriPlugin
class WifiBindPlugin(private val activity: Activity) : Plugin(activity) {
    @Command
    fun bind(invoke: Invoke) {
        val args = invoke.parseArgs(BindArgs::class.java)
        val cm = activity.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        var bound = false
        if (args.enable) {
            @Suppress("DEPRECATION")
            val wifi = cm.allNetworks.firstOrNull {
                cm.getNetworkCapabilities(it)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
            }
            if (wifi != null) bound = cm.bindProcessToNetwork(wifi)
        } else {
            cm.bindProcessToNetwork(null)
        }
        val result = JSObject()
        result.put("bound", bound)
        invoke.resolve(result)
    }
}
