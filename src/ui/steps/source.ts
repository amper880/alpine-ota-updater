import { h, icon } from '../dom.ts';
import { t } from '../../i18n/index.ts';
import { LOCAL_SOURCE, SOURCES, selectRole, selectSource, selectedBoard, store } from '../../app/state.ts';
import { sourceSupportsPlatform } from '../../lib/catalog/match.ts';
import { ROLES } from '../../lib/catalog/types.ts';

export function sourceBody(): HTMLElement {
  const s = store.get();
  const board = selectedBoard();
  return h(
    'div',
    { class: 'step-content' },
    h('h4', { class: 'field-label', id: 'role-label' }, t('source.role')),
    h(
      'div',
      { class: 'seg role-seg', role: 'radiogroup', 'aria-labelledby': 'role-label' },
      ROLES.map((role) => {
        const available = !board || board.roles.includes(role);
        return h(
          'button',
          {
            type: 'button',
            role: 'radio',
            'aria-checked': String(s.role === role),
            class: s.role === role ? 'on' : '',
            disabled: !available,
            title: available ? '' : role === 'companion' && board?.platform === 'esp32' ? t('source.companionEsp32') : t('source.roleUnavailable'),
            onclick: () => selectRole(role),
          },
          t(`role.${role}`),
        );
      }),
    ),
    board?.platform === 'esp32' ? h('p', { class: 'fineprint' }, t('source.companionEsp32')) : null,
    h('h4', { class: 'field-label', id: 'source-label' }, t('source.firmware')),
    h(
      'div',
      { class: 'source-list', role: 'radiogroup', 'aria-labelledby': 'source-label' },
      SOURCES.map((src) => {
        const ok = !board || sourceSupportsPlatform(src, board.platform);
        const selected = s.sourceId === src.id;
        return h(
          'button',
          {
            type: 'button',
            role: 'radio',
            'aria-checked': String(selected),
            class: ['source-card', selected && 'selected'],
            disabled: !ok,
            onclick: () => selectSource(src.id),
          },
          h('span', { class: 'radio-dot', 'aria-hidden': 'true' }),
          h(
            'span',
            { class: 'source-text' },
            h('span', { class: 'source-name' }, src.name),
            h('span', { class: 'source-desc' }, t(`sourceDesc.${src.id}`) !== `sourceDesc.${src.id}` ? t(`sourceDesc.${src.id}`) : src.description ?? ''),
            !ok ? h('span', { class: 'source-warn' }, icon('info', 14), t('source.platformUnsupported')) : null,
            h('span', { class: 'source-repo' }, src.repo),
          ),
        );
      }),
      h(
        'button',
        {
          type: 'button',
          role: 'radio',
          'aria-checked': String(s.sourceId === LOCAL_SOURCE),
          class: ['source-card', s.sourceId === LOCAL_SOURCE && 'selected'],
          onclick: () => selectSource(LOCAL_SOURCE),
        },
        h('span', { class: 'radio-dot', 'aria-hidden': 'true' }),
        h(
          'span',
          { class: 'source-text' },
          h('span', { class: 'source-name' }, t('local.sourceName')),
          h('span', { class: 'source-desc' }, t('local.sourceDesc')),
        ),
      ),
    ),
    h('p', { class: 'fineprint' }, t('source.extend')),
  );
}
