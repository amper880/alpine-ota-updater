/**
 * Android: route the app's requests over WiFi while it talks to a node's OTA access point.
 * That network has no internet, so Android keeps mobile data as the default and requests to
 * 192.168.4.1 / 192.168.100.1 would time out. Native command `bind_wifi` (src-tauri/src/lib.rs).
 * Elsewhere, or when the command is missing, this does nothing.
 */
type Internals = { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };

function internals(): Internals | undefined {
  return (globalThis as { __TAURI_INTERNALS__?: Internals }).__TAURI_INTERNALS__;
}

/**
 * Returns whether the app's traffic is now bound to WiFi; undefined where binding does not
 * apply (desktop, browser).
 */
export async function bindToWifi(enable: boolean): Promise<boolean | undefined> {
  const tauri = internals();
  if (!tauri || !/android/i.test(globalThis.navigator?.userAgent ?? '')) return undefined;
  try {
    return (await tauri.invoke('bind_wifi', { enable })) === true;
  } catch {
    return false;
  }
}

/** Runs `fn` with the traffic bound to WiFi, then releases the binding (GitHub needs internet). */
export async function withWifiBinding<T>(fn: (bound: boolean | undefined) => Promise<T>): Promise<T> {
  const bound = await bindToWifi(true);
  try {
    return await fn(bound);
  } finally {
    if (bound) await bindToWifi(false);
  }
}
