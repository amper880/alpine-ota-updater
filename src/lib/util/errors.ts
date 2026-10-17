/**
 * Turns anything thrown into readable text. Tauri plugin commands reject with plain strings
 * (the Rust error's Display text), not Error objects.
 */
export function errorMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || err.name;
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  try {
    return JSON.stringify(err) ?? String(err);
  } catch {
    return String(err);
  }
}

/**
 * A failure described for the user: an i18n key (+ parameters) and, optionally, the
 * technical text behind it (often English, from the OS or a plugin). Stored in app state
 * instead of plain text, so the message follows a language switch.
 */
export interface ErrorInfo {
  key: string;
  params?: Record<string, string | number>;
  /** Raw technical text; shown only under "Technical details". */
  detail?: string;
}

/** Error with a translatable message. `message` stays English for the log. */
export class UserError extends Error {
  readonly key: string;
  readonly params?: Record<string, string | number>;
  readonly detail?: string;
  constructor(key: string, message: string, opts: { params?: Record<string, string | number>; detail?: string } = {}) {
    super(message);
    this.name = 'UserError';
    this.key = key;
    this.params = opts.params;
    this.detail = opts.detail;
  }
}

/**
 * Known texts of the operating system's Bluetooth / network stacks and the Tauri plugins,
 * mapped to i18n keys. Checked in order; the first match wins.
 */
const NATIVE_PATTERNS: [RegExp, string][] = [
  [/no (bluetooth )?adapters? (were |was )?found|adapter ?not ?found|no bluetooth adapter|bluetooth adapter.*(missing|unavailable)/i, 'err.ble.noAdapter'],
  [/powered ?off|bluetooth is (turned )?off|radio is (turned )?off|adapter is (turned )?off/i, 'err.ble.off'],
  [/permission|access is denied|not authori[sz]ed|unauthori[sz]ed/i, 'err.ble.permission'],
  [/error sending request|dns|failed to lookup|name resolution|connection refused|connection reset|network is unreachable|no route to host|failed to fetch|networkerror|tcp connect|os error 1006[01]|os error 11[01]\b/i, 'err.network'],
  [/timed? ?out|timeout/i, 'err.timeout'],
  [/not connected|device not found|no such device|disconnected|connection (failed|lost)|gatt|0x8065/i, 'err.ble.connection'],
  [/quota|no space|disk full/i, 'err.storage'],
  [/\bHTTP (\d{3})\b/i, 'err.http'],
];

/** Maps a raw message to an i18n key, or undefined when it is not recognised. */
export function classifyMessage(message: string): Pick<ErrorInfo, 'key' | 'params'> | undefined {
  for (const [re, key] of NATIVE_PATTERNS) {
    const m = re.exec(message);
    if (m) return key === 'err.http' ? { key, params: { status: m[1] } } : { key };
  }
  return undefined;
}

const CODE_KEYS: Record<string, Record<string, string>> = {
  BleError: { permission: 'err.ble.permission', 'adapter-off': 'err.ble.off' },
  DfuError: { status: 'err.dfu.status', timeout: 'err.dfu.timeout', aborted: 'err.cancelled' },
};

/**
 * Turns anything thrown into an ErrorInfo. Unrecognised errors get `fallbackKey`
 * (default "err.unknown", which the UI shows as technical details only).
 */
export function toErrorInfo(err: unknown, fallbackKey = 'err.unknown'): ErrorInfo {
  if (err instanceof UserError) return { key: err.key, params: err.params, detail: err.detail };
  const raw = errorMessage(err);
  const name = err instanceof Error ? err.name : '';
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
  const byCode = CODE_KEYS[name]?.[code];
  if (byCode) return { key: byCode, detail: raw };
  if (name === 'DfuPackageError') return { key: 'err.dfu.package', detail: raw };
  const known = classifyMessage(raw);
  if (known) return { ...known, detail: raw };
  if (name === 'DfuError' && code === 'transport') return { key: 'err.dfu.transport', detail: raw };
  return { key: fallbackKey, detail: raw };
}
