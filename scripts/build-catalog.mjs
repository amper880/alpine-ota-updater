#!/usr/bin/env node
/**
 * Generates catalog/boards.json from a local checkout of the MeshCore source tree.
 *
 * Usage:
 *   git clone --depth 1 https://github.com/meshcore-dev/MeshCore.git /tmp/meshcore
 *   node scripts/build-catalog.mjs /tmp/meshcore
 *
 * How it works:
 *   - Every `[env:<Board>_repeater]` / `[env:<Board>_room_server]` section in the PlatformIO
 *     files is a firmware image that MeshCore publishes in its releases. nRF52
 *     `[env:<Board>_companion_radio_ble]` sections add the "companion" role (ESP32 companion
 *     firmware has no OTA path).
 *   - The `extends` chain tells us the platform (nrf52_base / esp32_base / ...).
 *   - nRF52 boards advertise a BLE name like "RAK4631_OTA" after `start ota`; it is read from
 *     the board class in the variant directory.
 *   - ESP32 builds with DISABLE_WIFI_OTA, and platforms without an OTA path (RP2040, STM32),
 *     are skipped.
 *
 * Display names and vendors are derived heuristically; curated overrides live in
 * catalog/board-overrides.json and always win.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.argv[2];
if (!root || !existsSync(join(root, 'platformio.ini'))) {
  console.error('Usage: node scripts/build-catalog.mjs <path-to-MeshCore-checkout>');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const outFile = join(here, '..', 'catalog', 'boards.json');
const overridesFile = join(here, '..', 'catalog', 'board-overrides.json');

/** Minimal PlatformIO ini parser: returns Map<sectionName, {key: value}> plus source file. */
function parseIni(file, sections) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  let current = null;
  let lastKey = null;
  for (const raw of lines) {
    const line = raw.replace(/\s;.*$/, '');
    if (/^\s*[;#]/.test(raw) || line.trim() === '') continue;
    const sec = line.match(/^\[([^\]]+)\]\s*$/);
    if (sec) {
      current = { __file: file };
      sections.set(sec[1].trim(), current);
      lastKey = null;
      continue;
    }
    if (!current) continue;
    const kv = line.match(/^([A-Za-z0-9_.]+)\s*=\s*(.*)$/);
    if (kv && !/^\s/.test(line)) {
      lastKey = kv[1];
      current[lastKey] = kv[2].trim();
    } else if (lastKey && /^\s/.test(line)) {
      current[lastKey] += '\n' + line.trim();
    }
  }
}

const sections = new Map();
parseIni(join(root, 'platformio.ini'), sections);
for (const dir of readdirSync(join(root, 'variants'))) {
  const f = join(root, 'variants', dir, 'platformio.ini');
  if (existsSync(f)) parseIni(f, sections);
}

/** Resolve a key through the `extends` chain (first definition wins). */
function resolve(name, key, depth = 0) {
  const s = sections.get(name);
  if (!s || depth > 20) return undefined;
  if (s[key] !== undefined) return s[key];
  if (s.extends) {
    for (const parent of s.extends.split(/[,\n]/).map((p) => p.trim()).filter(Boolean)) {
      const v = resolve(parent.replace(/^env:/, ''), key, depth + 1) ?? resolve(parent, key, depth + 1);
      if (v !== undefined) return v;
    }
  }
  return undefined;
}

/** Chain of section names an env extends from (including itself). */
function chain(name, acc = [], depth = 0) {
  if (depth > 20 || acc.includes(name)) return acc;
  acc.push(name);
  const s = sections.get(name);
  if (s?.extends) for (const p of s.extends.split(/[,\n]/).filter((x) => x.trim())) chain(p.trim(), acc, depth + 1);
  return acc;
}

/** Expand ${section.key} references (one level is enough for build_flags). */
function expand(text, depth = 0) {
  if (!text || depth > 10) return text ?? '';
  return text.replace(/\$\{([^.}]+)\.([^}]+)\}/g, (_, sec, key) => expand(resolve(sec, key), depth + 1));
}

function platformOf(envName) {
  const names = chain(envName);
  if (names.some((n) => /^nrf52/.test(n))) return 'nrf52';
  if (names.some((n) => /^esp32/.test(n))) return 'esp32';
  if (names.some((n) => /^rp2040/.test(n))) return 'rp2040';
  if (names.some((n) => /^stm32/.test(n))) return 'stm32';
  return 'other';
}

function bleOtaName(envName) {
  const flags = expand(resolve(envName, 'build_flags'));
  const dirs = [...flags.matchAll(/-I\s*variants\/([A-Za-z0-9_.-]+)/g)].map((m) => m[1]);
  for (const d of dirs) {
    const dir = join(root, 'variants', d);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir)) {
      if (!/\.(h|cpp)$/.test(f)) continue;
      const m = readFileSync(join(dir, f), 'utf8').match(/"([A-Za-z0-9_.-]+_OTA)"/);
      if (m) return m[1];
    }
  }
  return undefined;
}

const VENDORS = [
  [/^rak/i, 'RAKwireless'],
  [/^(heltec|wsl)/i, 'Heltec'],
  [/^(lilygo|tbeam|t_beam|t-echo)/i, 'LILYGO'],
  [/^thinknode/i, 'Elecrow ThinkNode'],
  [/^(xiao|wio|sensecap|t1000e)/i, 'Seeed Studio'],
  [/^station_g/i, 'B&Q Consulting'],
  [/^gat562/i, 'GAT-IoT'],
  [/^ikoka/i, 'ikoka'],
  [/^muzi|^r1neo/i, 'muzi works'],
  [/^ebyte/i, 'Ebyte'],
  [/^m5stack/i, 'M5Stack'],
  [/^waveshare/i, 'Waveshare'],
  [/^tenstar/i, 'Tenstar'],
  [/^minewsemi/i, 'Minewsemi'],
  [/^meshadventurer/i, 'MeshAdventurer'],
  [/^(nano_g2|nano-g2)/i, 'B&Q Consulting'],
];

function vendorOf(id) {
  for (const [re, v] of VENDORS) if (re.test(id)) return v;
  return 'Other';
}

function prettify(id) {
  return id
    .replace(/_/g, ' ')
    .replace(/\bsx(\d{4})\b/gi, 'SX$1')
    .replace(/\b(v\d)\b/gi, (m) => m.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lowercase alphanumeric key used to match board names across sources. */
const keyOf = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const boards = new Map();
for (const name of sections.keys()) {
  const env = name.match(/^env:(.+?)_(repeater|room_server|companion_radio_ble)$/i);
  if (!env) continue;
  const [, base, roleRaw] = env;
  const r = roleRaw.toLowerCase();
  const role = r === 'repeater' ? 'repeater' : r === 'room_server' ? 'room-server' : 'companion';
  const envName = name;
  const platform = platformOf(envName);
  if (platform !== 'nrf52' && platform !== 'esp32') continue;
  // Companion firmware has no WiFi OTA on ESP32; on nRF52 it offers buttonless BLE DFU.
  if (role === 'companion' && platform !== 'nrf52') continue;
  const flags = expand(resolve(envName, 'build_flags'));
  if (platform === 'esp32' && /DISABLE_WIFI_OTA/.test(flags)) continue;

  const key = keyOf(base);
  const entry =
    boards.get(key) ??
    {
      id: key,
      name: prettify(base),
      vendor: vendorOf(base),
      platform,
      aliases: [],
      roles: [],
    };
  if (!entry.aliases.includes(base)) entry.aliases.push(base);
  if (!entry.roles.includes(role)) entry.roles.push(role);
  if (platform === 'nrf52' && !entry.bleOtaName) {
    const ota = bleOtaName(envName);
    if (ota) entry.bleOtaName = ota;
  }
  boards.set(key, entry);
}

const overrides = existsSync(overridesFile) ? JSON.parse(readFileSync(overridesFile, 'utf8')) : {};
for (const [key, o] of Object.entries(overrides.boards ?? {})) {
  const b = boards.get(key);
  if (!b) {
    console.warn(`override for unknown board "${key}" ignored`);
    continue;
  }
  Object.assign(b, o, { aliases: [...new Set([...(b.aliases ?? []), ...(o.aliases ?? [])])] });
}

const list = [...boards.values()]
  .map((b) => ({ ...b, roles: b.roles.sort() }))
  .sort((a, b) => a.vendor.localeCompare(b.vendor) || a.name.localeCompare(b.name));

writeFileSync(
  outFile,
  JSON.stringify({ generated: new Date().toISOString().slice(0, 10), source: 'meshcore-dev/MeshCore', boards: list }, null, 2) + '\n',
);
const n = list.filter((b) => b.platform === 'nrf52').length;
console.log(`wrote ${list.length} boards (${n} nRF52, ${list.length - n} ESP32) to ${outFile}`);
const missing = list.filter((b) => b.platform === 'nrf52' && !b.bleOtaName).map((b) => b.id);
if (missing.length) console.warn('nRF52 boards without BLE OTA name:', missing.join(', '));
