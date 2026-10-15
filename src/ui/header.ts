import { h, icon } from './dom.ts';
import { LOCALES, t } from '../i18n/index.ts';
import { setLibraryOpen, setLocalePref, setTheme, store, type Theme } from '../app/state.ts';

/** Brand mark: a ridge line with a radio wave above the summit. */
export function brandMark(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 40 40');
  svg.setAttribute('width', '34');
  svg.setAttribute('height', '34');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('brand-mark');
  svg.innerHTML =
    '<path class="bm-ridge" d="M3 33 L14 17 L19 23 L25 12 L37 33 Z"/>' +
    '<path class="bm-snow" d="M25 12 L21.4 18.6 L23.6 17.6 L25 19.2 L26.6 17.4 L28.6 18.6 Z"/>' +
    '<path class="bm-wave" d="M20.5 6.5a6.5 6.5 0 0 1 9 0M17.5 3.5a10.5 10.5 0 0 1 15 0" fill="none"/>';
  return svg;
}

const THEMES: { id: Theme; icon: string }[] = [
  { id: 'light', icon: 'sun' },
  { id: 'dark', icon: 'moon' },
  { id: 'system', icon: 'auto' },
];

export function renderHeader(root: HTMLElement): void {
  store.select(
    (s) => ({ theme: s.theme, locale: s.locale, count: Object.keys(s.cached).length }),
    ({ theme, locale, count }) => {
      root.replaceChildren(
        h(
          'div',
          { class: 'topbar-inner' },
          h('a', { class: 'brand', href: './', 'aria-label': t('app.name') }, brandMark(), h('span', { class: 'brand-name' }, t('app.name'))),
          h(
            'nav',
            { class: 'top-actions', 'aria-label': t('header.settings') },
            h(
              'button',
              { class: 'btn ghost lib-btn', type: 'button', onclick: () => setLibraryOpen(true), title: t('library.title') },
              icon('library'),
              h('span', { class: 'lib-label' }, t('library.title')),
              count > 0 ? h('span', { class: 'count' }, count) : null,
            ),
            h(
              'label',
              { class: 'select-wrap', title: t('header.language') },
              h('span', { class: 'sr-only' }, t('header.language')),
              h(
                'select',
                { class: 'lang', onchange: (e: Event) => setLocalePref((e.target as HTMLSelectElement).value) },
                LOCALES.map((l) => h('option', { value: l.code, selected: l.code === locale }, l.name)),
              ),
            ),
            h(
              'div',
              { class: 'seg theme-seg', role: 'radiogroup', 'aria-label': t('header.theme') },
              THEMES.map((th) =>
                h(
                  'button',
                  {
                    type: 'button',
                    role: 'radio',
                    'aria-checked': String(theme === th.id),
                    title: t(`theme.${th.id}`),
                    class: theme === th.id ? 'on' : '',
                    onclick: () => setTheme(th.id),
                  },
                  icon(th.icon, 18),
                  h('span', { class: 'sr-only' }, t(`theme.${th.id}`)),
                ),
              ),
            ),
          ),
        ),
      );
    },
  );
}
