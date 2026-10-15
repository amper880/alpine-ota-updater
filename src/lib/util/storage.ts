/**
 * localStorage wrapper that never throws (private mode, blocked storage, previews).
 * Only used for small per-device preferences.
 */
const PREFIX = 'alpine-ota:';

export function loadPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function savePref(key: string, value: unknown): void {
  try {
    if (value === undefined) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* ignore: preferences are a convenience */
  }
}
