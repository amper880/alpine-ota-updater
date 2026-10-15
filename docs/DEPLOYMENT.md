# Deployment

Alpine OTA Updater has two parts:

| Part | What it is | Where it runs (default) |
|---|---|---|
| **App** | Static files (HTML, JS, CSS) built into `dist/` | GitHub Pages |
| **Download proxy** | Small Cloudflare Worker that fetches firmware from GitHub releases (see [SPEC §2, C5](SPEC.md#2-platform-constraints)) | Cloudflare Workers (free plan) |

Both are free. Users only ever get the app link, e.g. `https://<your-user>.github.io/alpine-ota-updater/`.

> HTTPS is required: browsers only allow Bluetooth and app installation on secure pages.
> GitHub Pages and Cloudflare Workers both provide HTTPS automatically.

---

## 1. Publish the repository to GitHub

With **GitHub Desktop**:

1. *File → Add local repository…* → select the `alpine-ota-updater` folder.
2. Click **Publish repository**. Public or private both work (GitHub Pages on a private
   repository needs a paid GitHub plan).

## 2. Deploy the download proxy (Cloudflare Worker)

One-time preparation:

1. Create a free account at <https://dash.cloudflare.com/sign-up>.
2. Install **Node.js 22 or newer** from <https://nodejs.org>.
3. Open a terminal in the repository folder and run `npm install`.

Configure and deploy:

1. Open `proxy/wrangler.toml` and set `ALLOWED_ORIGINS` to your GitHub Pages origin, e.g.
   `"https://amper.github.io"` (no path, no trailing slash). `"*"` works for testing but lets
   any website use your proxy.
2. Log in to Cloudflare (opens a browser window): `npx wrangler@4 login`
3. Deploy: `npm run proxy:deploy`
4. Wrangler prints the worker URL, e.g. `https://alpine-ota-proxy.<account>.workers.dev`.
   Check it: opening `<worker-url>/health` must show `ok`.

Optional — higher GitHub API rate limit (useful with many users):

```sh
npx wrangler@4 secret put GITHUB_TOKEN --config proxy/wrangler.toml
```

Use a fine-grained GitHub token with **no permissions** (public data only).

## 3. Turn on GitHub Pages

In the repository on github.com:

1. **Settings → Pages → Build and deployment → Source:** select **GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables → New repository variable:**
   - Name: `ALPINE_PROXY_URL`
   - Value: the worker URL from step 2 (without trailing slash)
3. Push to `main` (or run the *Deploy to GitHub Pages* workflow manually under **Actions**).

After a minute the app is live at `https://<your-user>.github.io/alpine-ota-updater/`.
Every push to `main` redeploys it automatically; installed apps show an "update available"
notice.

## 4. Moving to your own server later

The app is plain static files, so any HTTPS web server works:

```sh
ALPINE_PROXY_URL=https://your-proxy.example npm run build   # Windows PowerShell: $env:ALPINE_PROXY_URL="..."; npm run build
```

Copy the contents of `dist/` to the web server. The app works from any sub-path.

The proxy can stay on Cloudflare, or be replaced by any server that implements the same two
routes (`/releases`, `/asset`) — see `proxy/src/worker.ts` for the exact behaviour. If the
app and the proxy share the same origin, set `ALPINE_PROXY_URL` to a path such as `/proxy`.

## Updating the device list

`catalog/boards.json` is generated from the MeshCore source code. When MeshCore adds new
boards:

```sh
git clone --depth 1 https://github.com/meshcore-dev/MeshCore.git ../MeshCore
npm run catalog -- ../MeshCore
```

Review the diff, adjust display names in `catalog/board-overrides.json` if needed, rerun,
then commit.
