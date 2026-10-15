import { h } from './dom.ts';
import { locale, t } from '../i18n/index.ts';
import { selectedBoard, selectedFirmware, selectedSource, store } from '../app/state.ts';
import { formatBytes } from '../lib/util/format.ts';

function item(label: string, value: Node | string | null): HTMLElement {
  return h('div', { class: 'sum-item' }, h('dt', null, label), h('dd', null, value ?? h('span', { class: 'muted' }, '—')));
}

export function renderAside(root: HTMLElement): void {
  store.select(
    (s) => [s.locale, s.boardId, s.sourceId, s.role, s.firmwareKey, s.cached, s.releases],
    () => {
      const s = store.get();
      const board = selectedBoard();
      const src = selectedSource();
      const fw = selectedFirmware();
      const cachedCount = Object.keys(s.cached).length;
      const cachedBytes = Object.values(s.cached).reduce((a, f) => a + f.size, 0);
      root.replaceChildren(
        h(
          'div',
          { class: 'panel' },
          h('h2', { class: 'panel-title' }, t('summary.title')),
          h(
            'dl',
            { class: 'summary' },
            item(t('step.board'), board ? board.name : null),
            item(t('summary.method'), board ? t(`platform.${board.platform}.long`) : null),
            item(t('summary.source'), src ? `${src.name}, ${t(`role.${s.role}`).toLowerCase()}` : null),
            item(t('step.firmware'), fw ? fw.version : null),
          ),
        ),
        h(
          'div',
          { class: 'panel quiet' },
          h('h2', { class: 'panel-title' }, t('library.title')),
          h('p', null, cachedCount ? t('library.summary', { count: cachedCount, size: formatBytes(cachedBytes, locale()) }) : t('library.empty')),
        ),
      );
    },
  );
}
