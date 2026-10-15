import { h, icon, mount } from '../dom.ts';
import { t } from '../../i18n/index.ts';
import { BOARDS, selectBoard, store } from '../../app/state.ts';
import type { Board } from '../../lib/catalog/types.ts';

/** Persistent elements so typing in the search box is never interrupted by re-renders. */
let searchInput: HTMLInputElement | undefined;
let listEl: HTMLElement | undefined;

function matches(b: Board, q: string): boolean {
  if (!q) return true;
  const hay = `${b.name} ${b.vendor} ${b.aliases.join(' ')} ${b.platform === 'nrf52' ? 'nrf52 bluetooth ble' : 'esp32 wifi'}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((part) => hay.includes(part));
}

export function platformBadge(platform: Board['platform']): HTMLElement {
  return h(
    'span',
    { class: ['badge', `badge-${platform}`], title: t(`platform.${platform}.long`) },
    icon(platform === 'nrf52' ? 'bluetooth' : 'wifi', 14),
    t(`platform.${platform}`),
  );
}

function renderList(query: string, selectedId?: string): void {
  if (!listEl) return;
  const found = BOARDS.filter((b) => matches(b, query));
  if (found.length === 0) {
    mount(listEl, h('p', { class: 'empty' }, t('board.none', { query })));
    return;
  }
  const groups = new Map<string, Board[]>();
  for (const b of found) groups.set(b.vendor, [...(groups.get(b.vendor) ?? []), b]);
  mount(
    listEl,
    [...groups.entries()].map(([vendor, boards]) =>
      h(
        'div',
        { class: 'board-group', role: 'group', 'aria-label': vendor },
        h('h4', { class: 'group-title' }, vendor),
        h(
          'ul',
          { class: 'board-list' },
          boards.map((b) =>
            h(
              'li',
              null,
              h(
                'button',
                {
                  type: 'button',
                  class: ['board-item', b.id === selectedId && 'selected'],
                  'aria-pressed': String(b.id === selectedId),
                  onclick: () => selectBoard(b.id),
                },
                h('span', { class: 'board-name' }, b.name),
                platformBadge(b.platform),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

export function boardBody(): HTMLElement {
  if (!searchInput) {
    searchInput = h('input', {
      type: 'search',
      class: 'search',
      autocomplete: 'off',
      spellcheck: false,
      oninput: (e: Event) => store.set({ boardQuery: (e.target as HTMLInputElement).value }),
    });
    listEl = h('div', { class: 'board-scroll' });
    store.select(
      (s) => [s.boardQuery, s.boardId, s.locale],
      ([q, id]) => renderList(q as string, id as string | undefined),
    );
  }
  searchInput.placeholder = t('board.search');
  searchInput.setAttribute('aria-label', t('board.search'));
  if (searchInput.value !== store.get().boardQuery) searchInput.value = store.get().boardQuery;
  renderList(store.get().boardQuery, store.get().boardId);
  return h(
    'div',
    { class: 'step-content' },
    h('p', { class: 'hint' }, t('board.hint')),
    h('div', { class: 'search-wrap' }, icon('search', 18), searchInput),
    listEl!,
    h('p', { class: 'fineprint' }, t('board.count', { count: BOARDS.length })),
  );
}
