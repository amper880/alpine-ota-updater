/**
 * Opens a web page in the system browser. Inside the app, links must go through the opener
 * plugin: the webview does not hand `target="_blank"` links to the browser by itself.
 */
import { openUrl } from '@tauri-apps/plugin-opener';
import { isNativeApp } from '../platform.ts';

export function openExternal(url: string): void {
  if (isNativeApp()) {
    openUrl(url).catch(() => window.open(url, '_blank', 'noopener'));
  } else {
    window.open(url, '_blank', 'noopener');
  }
}
