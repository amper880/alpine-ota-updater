/**
 * Alpine OTA Updater — entry point.
 */
import { detectLocale, setLocale, t } from './i18n/index.ts';
import { refreshCached, refreshFirmwareList, store, type Theme } from './app/state.ts';
import { APP_VERSION, REPO_URL } from './lib/config.ts';
import { extLink, h, icon } from './ui/dom.ts';
import { checkForAppUpdate, dismissAppUpdate } from './app/app-update.ts';
import { openExternal } from './lib/net/open.ts';
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
          extLink(`${REPO_URL}/blob/main/CHANGELOG.md`, t('footer.changelog')),
          h('span', null, t('footer.author')),
          h('span', null, t('footer.license')),
        ),
      ),
  );
}

/** "New version available" banner below the header. */
function renderUpdateBanner(root: HTMLElement): void {
  store.select(
    (s) => [s.appUpdate, s.locale],
    () => {
      const u = store.get().appUpdate;
      root.hidden = !u;
      if (!u) return root.replaceChildren();
      root.replaceChildren(
        h(
          'div',
          { class: 'update-inner' },
          icon('download', 18),
          h('p', null, h('strong', null, t('update.available', { version: u.version })), ' ', h('span', null, t('update.hint'))),
          h(
            'div',
            { class: 'update-actions' },
            h('button', { type: 'button', class: 'btn small primary', onclick: () => openExternal(u.downloadUrl) }, t('update.download')),
            extLink(u.releaseUrl, t('update.whatsNew')),
            h('button', { type: 'button', class: 'link', onclick: dismissAppUpdate }, t('update.later')),
          ),
        ),
      );
    },
  );
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
  const updateBanner = h('div', { class: 'update-banner', role: 'status', hidden: true });
  const steps = h('div', { class: 'trail' });
  const aside = h('aside', { class: 'side', 'aria-label': t('summary.title') });
  const footer = h('footer', { class: 'footer' });
  const dialog = h('dialog', { class: 'dialog' });

  app.replaceChildren(
    header,
    updateBanner,
    h(
      'main',
      { class: 'layout' },
      h('div', { class: 'intro' }, h('h1', null, t('intro.title')), h('p', null, t('intro.lead'))),
      steps,
      aside,
    ),
    footer,
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
  renderUpdateBanner(updateBanner);

  void refreshCached();
  void checkForAppUpdate();
  if (initial.boardId && initial.sourceId) void refreshFirmwareList();
}

start();
