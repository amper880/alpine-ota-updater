import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const dir = new URL('../src/i18n/locales/', import.meta.url);
const load = (f: string) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')) as Record<string, string>;
const en = load('en.json');

test('every locale has exactly the English keys', () => {
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json') && x !== 'en.json')) {
    const other = load(f);
    const missing = Object.keys(en).filter((k) => !(k in other));
    const extra = Object.keys(other).filter((k) => !(k in en));
    assert.deepEqual(missing, [], `${f} is missing keys`);
    assert.deepEqual(extra, [], `${f} has unknown keys`);
  }
});

test('placeholders match between locales', () => {
  const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json') && x !== 'en.json')) {
    const other = load(f);
    for (const k of Object.keys(en)) assert.equal(ph(other[k] ?? ''), ph(en[k]), `${f}: ${k}`);
  }
});
