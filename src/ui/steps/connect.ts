import { h, icon } from '../dom.ts';
import { locale, t } from '../../i18n/index.ts';
import { selectedBoard, selectedFirmware, sourceById, store, type PickedDevice } from '../../app/state.ts';
import { cancelFlash, forgetDevice, pickBootloaderNow, resetFlash, scanBle, startFlash } from '../../app/flash.ts';
import { hasWebBluetooth } from '../../lib/dfu/web-bluetooth.ts';
import { formatBytes } from '../../lib/util/format.ts';
import { loadPref, savePref } from '../../lib/util/storage.ts';

export { hasWebBluetooth };

function steps(prefix: string, count: number, params?: Record<string, string>): HTMLElement {
  const items: HTMLElement[] = [];
  for (let i = 1; i <= count; i++) items.push(h('li', null, t(`${prefix}.${i}`, params)));
  return h('ol', { class: 'guide' }, items);
}

/** Chip showing whether the picked node matches the selected device type. */
export function matchChip(d: PickedDevice): HTMLElement {
  const cls = d.match === 'match' ? 'chip ok' : 'chip warn';
  return h('span', { class: cls }, icon(d.match === 'match' ? 'check' : 'alert', 14), t(`device.match.${d.match}`));
}

// ---------------------------------------------------------------- step 4

export function connectBody(): HTMLElement {
  const board = selectedBoard();
  if (!board) return h('div');
  return board.platform === 'nrf52' ? bleConnectBody(board.bleOtaName ?? '…_OTA') : wifiConnectBody();
}

function bleConnectBody(otaName: string): HTMLElement {
  const s = store.get();
  const supported = hasWebBluetooth();
  return h(
    'div',
    { class: 'step-content' },
    !supported ? h('p', { class: 'callout warn' }, icon('alert'), t('connect.noBluetooth')) : null,
    h('h4', { class: 'field-label' }, t('connect.ble.title')),
    steps('connect.ble.step', 3, { name: otaName }),
    s.scanError ? h('p', { class: 'callout error' }, icon('alert'), h('div', null, t('connect.scanError'), h('p', { class: 'fineprint' }, s.scanError))) : null,
    h(
      'div',
      { class: 'actions' },
      h('button', { type: 'button', class: 'btn primary', disabled: !supported, onclick: () => void scanBle(false) }, icon('bluetooth', 18), t('connect.scan')),
      h('button', { type: 'button', class: 'link', disabled: !supported, onclick: () => void scanBle(true) }, t('connect.showAll')),
    ),
    h('p', { class: 'fineprint' }, t('connect.ble.chooserHint')),
  );
}

function wifiConnectBody(): HTMLElement {
  return h(
    'div',
    { class: 'step-content' },
    h('h4', { class: 'field-label' }, t('connect.wifi.title')),
    steps('connect.wifi.step', 4, { ssid: 'MeshCore-OTA', url: 'http://192.168.4.1/update' }),
    h('p', { class: 'callout info' }, icon('info'), t('connect.wifi.offlineNote')),
    h(
      'div',
      { class: 'actions' },
      h('button', { type: 'button', class: 'btn primary', disabled: true }, icon('wifi', 18), t('connect.scan')),
      h('span', { class: 'fineprint' }, t('connect.wifiComingSoon')),
    ),
  );
}

// ---------------------------------------------------------------- step 5

/** The mismatch confirmation survives re-renders but resets for each new device. */
let confirmedFor: string | undefined;
/** Whether the log panel is expanded (kept across re-renders). */
let logOpen = false;

function stageText(stage: string | undefined): string {
  return stage ? t(`flash.stage.${stage}`) : '';
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s} s`;
}

/** Updates the live progress elements without re-rendering the step. */
export function updateFlashProgress(): void {
  const f = store.get().flash;
  const root = document.querySelector<HTMLElement>('.flash-progress');
  if (!root || f.phase !== 'running') return;
  const pct = f.total ? Math.floor((f.sent / f.total) * 100) : 0;
  const bar = root.querySelector<HTMLElement>('.progress');
  bar?.setAttribute('aria-valuenow', String(pct));
  const fill = root.querySelector<HTMLElement>('.progress-fill');
  if (fill) fill.style.width = `${pct}%`;
  const pctEl = root.querySelector('.flash-pct');
  if (pctEl) pctEl.textContent = `${pct}%`;
  const stats = root.querySelector('.flash-stats');
  if (stats) {
    const elapsed = f.startedAt ? (Date.now() - f.startedAt) / 1000 : 0;
    const speed = elapsed > 0.5 ? f.sent / elapsed : 0;
    const eta = speed > 0 ? (f.total - f.sent) / speed : 0;
    const parts = [`${formatBytes(f.sent, locale())} / ${formatBytes(f.total, locale())}`];
    if (speed > 0) parts.push(t('flash.speed', { speed: formatBytes(speed, locale()) }), t('flash.eta', { time: formatDuration(eta) }));
    stats.textContent = parts.join('   ');
  }
  const stageEl = root.querySelector('.flash-stage');
  if (stageEl) stageEl.textContent = stageText(f.stage);
}

function logPanel(): HTMLElement | null {
  const { log } = store.get().flash;
  if (log.length === 0) return null;
  const text = log.join('\n');
  return h(
    'details',
    { class: 'log', open: logOpen, ontoggle: (e: Event) => (logOpen = (e.target as HTMLDetailsElement).open) },
    h('summary', null, t('flash.log')),
    h('pre', { class: 'log-body' }, text),
    h(
      'button',
      {
        type: 'button',
        class: 'link',
        onclick: (e: Event) => {
          void navigator.clipboard?.writeText(text).then(() => ((e.target as HTMLElement).textContent = t('flash.logCopied')));
        },
      },
      t('flash.copyLog'),
    ),
  );
}

export function flashBody(): HTMLElement {
  const s = store.get();
  const board = selectedBoard();
  const fw = selectedFirmware();
  const cached = s.firmwareKey ? s.cached[s.firmwareKey] : undefined;
  const device = s.device;
  if (!board || !device || !cached) return h('div', { class: 'step-content' }, h('p', { class: 'hint' }, t('flash.notReady')));
  if (confirmedFor !== device.id) confirmedFor = undefined;

  const f = s.flash;
  const prn = loadPref<number>('prn', 8);
  const needsConfirm = device.match !== 'match';
  const version = fw?.version ?? cached.version;
  const sourceName = sourceById(cached.sourceId)?.name ?? cached.sourceId;

  const summary = h(
    'dl',
    { class: 'flash-summary' },
    h('div', null, h('dt', null, t('flash.firmware')), h('dd', null, `${sourceName} ${version}`)),
    h('div', null, h('dt', null, t('flash.node')), h('dd', null, device.name, ' ', matchChip(device))),
  );

  if (f.phase === 'running') {
    const pct = f.total ? Math.floor((f.sent / f.total) * 100) : 0;
    return h(
      'div',
      { class: 'step-content' },
      summary,
      f.stage === 'pick-bootloader'
        ? h(
            'div',
            { class: 'callout warn' },
            icon('bluetooth'),
            h('div', null, h('p', null, t('flash.pickBootloader')), h('p', { class: 'fineprint' }, t('flash.pickBootloaderHint'))),
            h('button', { type: 'button', class: 'btn small primary', onclick: () => void pickBootloaderNow() }, t('flash.selectBootloader')),
          )
        : null,
      h(
        'div',
        { class: 'flash-progress' },
        h('div', { class: 'flash-row' }, h('span', { class: 'flash-stage' }, stageText(f.stage)), h('span', { class: 'flash-pct' }, `${pct}%`)),
        h(
          'div',
          { class: 'progress big', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) },
          h('div', { class: 'progress-fill' }),
        ),
        h('p', { class: 'flash-stats fineprint' }),
      ),
      h('p', { class: 'callout info' }, icon('info'), t('flash.keepOpen')),
      h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn', onclick: cancelFlash }, t('flash.cancel'))),
      logPanel(),
    );
  }

  if (f.phase === 'done') {
    return h(
      'div',
      { class: 'step-content' },
      h(
        'div',
        { class: 'result ok' },
        icon('check', 28),
        h('div', null, h('h4', null, t('flash.doneTitle')), h('p', null, t('flash.doneText', { version }))),
      ),
      h(
        'div',
        { class: 'actions' },
        h('button', { type: 'button', class: 'btn primary', onclick: forgetDevice }, t('flash.another')),
      ),
      logPanel(),
    );
  }

  const confirmBox = needsConfirm
    ? h(
        'div',
        { class: 'callout warn' },
        icon('alert'),
        h(
          'div',
          null,
          h(
            'p',
            null,
            device.match === 'mismatch'
              ? t('flash.mismatch', { name: device.name, boards: device.knownAs.join(', '), board: board.name })
              : t('flash.unknown', { name: device.name, board: board.name }),
          ),
          h(
            'label',
            { class: 'check' },
            h('input', {
              type: 'checkbox',
              checked: confirmedFor === device.id,
              onchange: (e: Event) => {
                confirmedFor = (e.target as HTMLInputElement).checked ? device.id : undefined;
                const btn = document.querySelector<HTMLButtonElement>('.start-flash');
                if (btn) btn.disabled = !confirmedFor;
              },
            }),
            t('flash.confirm'),
          ),
        ),
      )
    : null;

  return h(
    'div',
    { class: 'step-content' },
    summary,
    f.phase === 'error'
      ? h('div', { class: 'callout error' }, icon('alert'), h('div', null, h('p', null, t('flash.error')), h('p', { class: 'fineprint' }, f.error ?? '')))
      : null,
    f.phase === 'cancelled' ? h('p', { class: 'callout info' }, icon('info'), t('flash.cancelled')) : null,
    confirmBox,
    f.phase === 'idle' ? h('p', { class: 'hint' }, t('flash.before')) : null,
    h(
      'div',
      { class: 'actions' },
      h(
        'button',
        {
          type: 'button',
          class: 'btn primary start-flash',
          disabled: needsConfirm && confirmedFor !== device.id,
          onclick: () => void startFlash(loadPref<number>('prn', 8)),
        },
        icon('download', 18),
        f.phase === 'idle' ? t('flash.start') : t('flash.retry'),
      ),
      h('button', { type: 'button', class: 'link', onclick: () => void scanBle(false) }, t('flash.otherDevice')),
      f.phase !== 'idle' ? h('button', { type: 'button', class: 'link', onclick: resetFlash }, t('common.dismiss')) : null,
    ),
    h(
      'details',
      { class: 'advanced' },
      h('summary', null, t('flash.advanced')),
      h(
        'label',
        { class: 'field' },
        h('span', null, t('flash.prn')),
        h('input', {
          type: 'number',
          min: '0',
          max: '64',
          value: String(prn),
          onchange: (e: Event) => {
            const v = Math.max(0, Math.min(64, Number((e.target as HTMLInputElement).value) || 0));
            savePref('prn', v);
          },
        }),
      ),
      h('p', { class: 'fineprint' }, t('flash.prnHint')),
    ),
    logPanel(),
  );
}
