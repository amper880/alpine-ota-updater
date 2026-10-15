/**
 * Runtime detection. The UI also runs in a plain browser during development, where the native
 * plugins (Bluetooth, HTTP without CORS) are not available.
 */
export function isNativeApp(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
