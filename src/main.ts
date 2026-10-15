/**
 * Alpine OTA Updater — entry point.
 */
import { detectLocale, setLocale, t } from './i18n/index.ts';
import { refreshCached, refreshFirmwareList, store, type Theme } from './app/state.ts';
import { APP_VERSION, IS_DEV, REPO_URL } from './lib/config.ts';
import { h, icon } from './ui/dom.ts';
import { renderHeader } from './ui/header.ts';
import { renderSteps } from './ui/steps/index.ts';
import { renderAside } from './ui/aside.ts';
import { renderLibrary } from './ui/library.ts';

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#101a1f' : '#eef2f3');
}

function renderFooter(root: HTMLElement): void {
  store.select(
    (s) => s.locale,
    () =>
      root.replaceChildren(
        h(
          'div',
          { class: 'footer-inner' },
          h('span', null, t('footer.version', { version: APP_VERSION })),
          REPO_URL ? h('a', { href: REPO_URL, target: '_blank', rel: 'noopener' }, t('footer.source')) : null,
          REPO_URL ? h('a', { href: `${REPO_URL}/blob/main/CHANGELOG.md`, target: '_blank', rel: 'noopener' }, t('footer.changelog')) : null,
          h('span', null, t('footer.license')),
        ),
      ),
  );
}

function renderUpdateToast(root: HTMLElement, onReload: () => void): void {
  store.select(
    (s) => [s.updateReady, s.locale],
    ([ready]) =>
      root.replaceChildren(
        ...(ready
          ? [
              h(
                'div',
                { class: 'toast', role: 'status' },
                icon('refresh', 18),
                h('span', null, t('update.ready')),
                h('button', { type: 'button', class: 'btn small primary', onclick: onReload }, t('update.reload')),
              ),
            ]
          : []),
      ),
  );
}

function registerServiceWorker(): () => void {
  let waiting: ServiceWorker | null = null;
  if (IS_DEV || !('serviceWorker' in navigator)) return () => location.reload();
  navigator.serviceWorker
    .register('./sw.js')
    .then((reg) => {
      const track = (w: ServiceWorker | null) => {
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) {
            waiting = w;
            store.set({ updateReady: true });
          }
        });
      };
      if (reg.waiting && navigator.serviceWorker.controller) {
        waiting = reg.waiting;
        store.set({ updateReady: true });
      }
      reg.addEventListener('updatefound', () => track(reg.installing));
    })
    .catch(() => undefined);
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
  return () => waiting?.postMessage('skipWaiting');
}

function start(): void {
  const initial = store.get();
  const loc = detectLocale(initial.locale || undefined);
  setLocale(loc);
  store.set({ locale: loc });
  store.select((s) => s.locale, (l) => setLocale(l));
  store.select((s) => s.theme, applyTheme);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(store.get().theme));

  const app = document.getElementById('app')!;
  const header = h('header', { class: 'topbar' });
  const steps = h('div', { class: 'trail' });
  const aside = h('aside', { class: 'side', 'aria-label': t('summary.title') });
  const footer = h('footer', { class: 'footer' });
  const toast = h('div', { class: 'toast-host', 'aria-live': 'polite' });
  const dialog = h('dialog', { class: 'dialog' });

  app.replaceChildren(
    header,
    h(
      'main',
      { class: 'layout' },
      h('div', { class: 'intro' }, h('h1', null, t('intro.title')), h('p', null, t('intro.lead'))),
      steps,
      aside,
    ),
    footer,
    toast,
    dialog,
  );
  // Intro text depends on locale.
  store.select(
    (s) => s.locale,
    () => {
      const intro = app.querySelector('.intro')!;
      intro.replaceChildren(h('h1', null, t('intro.title')), h('p', null, t('intro.lead')));
      aside.setAttribute('aria-label', t('summary.title'));
    },
  );

  renderHeader(header);
  renderSteps(steps);
  renderAside(aside);
  renderLibrary(dialog);
  renderFooter(footer);
  const reload = registerServiceWorker();
  renderUpdateToast(toast, reload);

  void refreshCached();
  if (initial.boardId && initial.sourceId) void refreshFirmwareList();
}

start();
