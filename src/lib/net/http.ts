/**
 * HTTP client. In the app, requests go through the native HTTP plugin, which has no CORS or
 * mixed-content restrictions (GitHub release assets, http://192.168.4.1 on the node's WiFi).
 * In a plain browser (UI development only) the normal fetch is used.
 */
import { fetch as nativeFetch } from '@tauri-apps/plugin-http';
import { isNativeApp } from '../platform.ts';

export const USER_AGENT = 'alpine-ota-updater';

export function httpFetch(input: string, init: RequestInit & { maxRedirections?: number } = {}): Promise<Response> {
  if (isNativeApp()) {
    const headers = new Headers(init.headers);
    if (!headers.has('User-Agent')) headers.set('User-Agent', USER_AGENT);
    return nativeFetch(input, { maxRedirections: 10, ...init, headers });
  }
  return fetch(input, init);
}
