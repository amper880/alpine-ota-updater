import { h, icon } from '../dom.ts';
import { t } from '../../i18n/index.ts';
import { selectedBoard } from '../../app/state.ts';

export const hasWebBluetooth = (): boolean => typeof navigator !== 'undefined' && 'bluetooth' in navigator;

function steps(prefix: string, count: number, params?: Record<string, string>): HTMLElement {
  const items: HTMLElement[] = [];
  for (let i = 1; i <= count; i++) items.push(h('li', null, t(`${prefix}.${i}`, params)));
  return h('ol', { class: 'guide' }, items);
}

export function connectBody(): HTMLElement {
  const board = selectedBoard();
  if (!board) return h('div');
  const isBle = board.platform === 'nrf52';
  return h(
    'div',
    { class: 'step-content' },
    isBle && !hasWebBluetooth() ? h('p', { class: 'callout warn' }, icon('alert'), t('connect.noBluetooth')) : null,
    h('h4', { class: 'field-label' }, isBle ? t('connect.ble.title') : t('connect.wifi.title')),
    isBle
      ? steps('connect.ble.step', 3, { name: board.bleOtaName ?? '…_OTA' })
      : steps('connect.wifi.step', 4, { ssid: 'MeshCore-OTA', url: 'http://192.168.4.1/update' }),
    !isBle ? h('p', { class: 'callout info' }, icon('info'), t('connect.wifi.offlineNote')) : null,
    h(
      'div',
      { class: 'actions' },
      h('button', { type: 'button', class: 'btn primary', disabled: true }, icon(isBle ? 'bluetooth' : 'wifi', 18), t('connect.scan')),
      h('span', { class: 'fineprint' }, t('connect.comingSoon')),
    ),
  );
}

export function flashBody(): HTMLElement {
  return h('div', { class: 'step-content' }, h('p', { class: 'hint' }, t('flash.comingSoon')));
}
