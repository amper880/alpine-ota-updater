import { h, icon } from './dom.ts';
import { locale, t } from '../i18n/index.ts';
import { BOARDS, SOURCES, removeAllCached, removeCached, setLibraryOpen, store } from '../app/state.ts';
import { formatBytes, formatDate } from '../lib/util/format.ts';

let confirmClear = false;

export function renderLibrary(dialog: HTMLDialogElement): void {
  dialog.addEventListener('close', () => {
    confirmClear = false;
    setLibraryOpen(false);
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  store.select(
    (s) => [s.libraryOpen, s.cached, s.locale],
    () => {
      const s = store.get();
      const items = Object.values(s.cached);
      const total = items.reduce((a, f) => a + f.size, 0);
      dialog.replaceChildren(
        h(
          'div',
          { class: 'dialog-inner' },
          h(
            'header',
            { class: 'dialog-head' },
            h('h2', null, t('library.title')),
            h('button', { type: 'button', class: 'btn ghost icon-only', 'aria-label': t('common.close'), onclick: () => dialog.close() }, icon('x')),
          ),
          h('p', { class: 'hint' }, t('library.hint')),
          items.length === 0
            ? h('p', { class: 'empty' }, t('library.empty'))
            : h(
                'ul',
                { class: 'lib-list' },
                items.map((f) =>
                  h(
                    'li',
                    { class: 'lib-row' },
                    h(
                      'div',
                      { class: 'lib-main' },
                      h('span', { class: 'lib-board' }, BOARDS.find((b) => b.id === f.boardId)?.name ?? f.boardId),
                      h(
                        'span',
                        { class: 'lib-meta' },
                        `${SOURCES.find((x) => x.id === f.sourceId)?.name ?? f.sourceId} ${f.version}, ${t(`role.${f.role}`).toLowerCase()}`,
                      ),
                      h('span', { class: 'lib-meta' }, `${formatBytes(f.size, locale())}, ${t('library.downloadedOn', { date: formatDate(f.downloadedAt, locale()) })}`),
                    ),
                    h(
                      'button',
                      { type: 'button', class: 'btn ghost icon-only danger', 'aria-label': t('library.delete'), title: t('library.delete'), onclick: () => void removeCached(f.key) },
                      icon('trash', 18),
                    ),
                  ),
                ),
              ),
          items.length
            ? h(
                'footer',
                { class: 'dialog-foot' },
                h('span', { class: 'fineprint' }, t('library.total', { size: formatBytes(total, locale()) })),
                h(
                  'button',
                  {
                    type: 'button',
                    class: ['btn small', confirmClear ? 'danger-solid' : 'danger'],
                    onclick: (e: Event) => {
                      if (!confirmClear) {
                        confirmClear = true;
                        (e.currentTarget as HTMLButtonElement).textContent = t('library.clearConfirm');
                        (e.currentTarget as HTMLButtonElement).className = 'btn small danger-solid';
                        return;
                      }
                      confirmClear = false;
                      void removeAllCached();
                    },
                  },
                  t('library.clear'),
                ),
              )
            : null,
        ),
      );
      if (s.libraryOpen && !dialog.open) dialog.showModal();
      if (!s.libraryOpen && dialog.open) dialog.close();
    },
  );
}
