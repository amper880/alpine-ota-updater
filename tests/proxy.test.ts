import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, type Env } from '../proxy/src/worker.ts';
import sourcesJson from '../catalog/sources.json' with { type: 'json' };

const env: Env = {
  ALLOWED_REPOS: 'meshcore-dev/MeshCore,IoTThinks/EasySkyMesh,liquidraver/ZephCore',
  ALLOWED_ORIGINS: 'https://amper.github.io',
};

const req = (path: string, origin = 'https://amper.github.io') =>
  new Request(`https://proxy.test${path}`, { headers: { Origin: origin } });

function withFetch(fn: (url: string) => Response, body: () => Promise<void>) {
  const orig = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    return fn(url);
  }) as typeof fetch;
  return body().finally(() => (globalThis.fetch = orig)).then(() => calls);
}

test('wrangler allow-list covers every source repo', async () => {
  const { readFileSync } = await import('node:fs');
  const toml = readFileSync(new URL('../proxy/wrangler.toml', import.meta.url), 'utf8');
  for (const s of sourcesJson.sources) assert.ok(toml.includes(s.repo), `${s.repo} missing in wrangler.toml`);
});

test('rejects repositories outside the allow-list', async () => {
  const res = await handle(req('/releases?repo=evil/repo'), env);
  assert.equal(res.status, 403);
});

test('rejects unsafe asset names', async () => {
  const res = await handle(req('/asset?repo=meshcore-dev/MeshCore&tag=x&name=../../etc'), env);
  assert.equal(res.status, 400);
});

test('releases are trimmed and CORS is echoed for allowed origins', async () => {
  const gh = [
    {
      tag_name: 'repeater-v1.18.0',
      name: 'Repeater 1.18.0',
      published_at: '2026-10-15T00:00:00Z',
      prerelease: false,
      draft: false,
      body: 'notes',
      html_url: 'https://github.com/x',
      author: { login: 'someone' },
      assets: [{ name: 'RAK_4631_repeater-v1.18.0-81dbae5.zip', size: 123, digest: 'sha256:ab', url: 'u' }],
    },
  ];
  let res!: Response;
  const calls = await withFetch(
    () => new Response(JSON.stringify(gh), { status: 200 }),
    async () => {
      res = await handle(req('/releases?repo=meshcore-dev/MeshCore'), env);
    },
  );
  assert.equal(calls[0], 'https://api.github.com/repos/meshcore-dev/MeshCore/releases?per_page=40');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://amper.github.io');
  const body = await res.json();
  assert.deepEqual(body[0].assets[0], { name: 'RAK_4631_repeater-v1.18.0-81dbae5.zip', size: 123, digest: 'sha256:ab' });
  assert.equal(body[0].author, undefined);
});

test('unknown origins get no CORS header', async () => {
  const res = await handle(req('/health', 'https://other.example'), env);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), null);
});

test('asset requests are mapped to the GitHub download URL', async () => {
  let res!: Response;
  const calls = await withFetch(
    () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Length': '3' } }),
    async () => {
      res = await handle(req('/asset?repo=meshcore-dev/MeshCore&tag=repeater-v1.18.0&name=RAK_4631_repeater-v1.18.0-81dbae5.zip'), env);
    },
  );
  assert.equal(calls[0], 'https://github.com/meshcore-dev/MeshCore/releases/download/repeater-v1.18.0/RAK_4631_repeater-v1.18.0-81dbae5.zip');
  assert.equal(res.status, 200);
  assert.equal(new Uint8Array(await res.arrayBuffer()).length, 3);
});
