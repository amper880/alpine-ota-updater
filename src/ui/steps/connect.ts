import { h, icon, mount } from '../dom.ts';
import { errorExplanation } from '../error-view.ts';
import { locale, t } from '../../i18n/index.ts';
import { selectedBoard, selectedFirmware, sourceById, store, type PickedDevice } from '../../app/state.ts';
import { cancelFlash, forgetDevice, resetFlash, selectDevice, setShowAll, startBleScan, startFlash, stopBleScan } from '../../app/flash.ts';
import { cancelWifiFlash, expectedProfile, findWifiNode, startWifiFlash } from '../../app/wifi.ts';
import { classify, type ScannedDevice } from '../../lib/ble/candidates.ts';
import { isNativeApp } from '../../lib/platform.ts';
import { formatBytes } from '../../lib/util/format.ts';
import { loadPref, savePref } from '../../lib/util/storage.ts';

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

function kindChip(kind: string): HTMLElement | null {
  if (kind === 'other') return null;
  return h('span', { class: 'chip' }, t(`device.kind.${kind}`));
}

// ---------------------------------------------------------------- step 4

export function connectBody(): HTMLElement {
  const board = selectedBoard();
  if (!board) return h('div');
  return board.platform === 'nrf52' ? bleConnectBody(board.bleOtaName ?? '…_OTA') : wifiConnectBody();
}

/** Device list region; re-rendered on its own while scanning. */
let deviceListEl: HTMLElement | undefined;

const MAC = /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i;

/** Some platforms report the address as the name when a device advertises none. */
function displayName(d: ScannedDevice): string | undefined {
  const n = d.name.trim();
  return n && n !== d.address && !MAC.test(n) ? n : undefined;
}

/** Whether nameless devices are listed in "show all" mode (kept across re-renders). */
let showUnnamed = false;

function deviceRow(d: ScannedDevice): HTMLElement {
  const name = displayName(d);
  return h(
    'li',
    null,
    h(
      'button',
      { type: 'button', class: 'device-item', onclick: () => selectDevice(d) },
      icon('bluetooth', 18),
      h(
        'span',
        { class: 'device-text' },
        h('span', { class: ['device-name', !name && 'muted'] }, name ?? t('connect.unnamed')),
        h('span', { class: 'device-address' }, d.address),
      ),
      kindChip(classify(d)),
      h('span', { class: 'device-rssi' }, `${d.rssi} dBm`),
    ),
  );
}

function renderDeviceList(): void {
  if (!deviceListEl) return;
  const { scan } = store.get();
  const relevant = scan.devices.filter((d) => classify(d) !== 'other');
  const others = scan.showAll ? scan.devices.filter((d) => classify(d) === 'other') : [];
  const named = others.filter((d) => displayName(d));
  const unnamed = others.filter((d) => !displayName(d));
  const visible = [...relevant, ...named, ...(showUnnamed ? unnamed : [])];
  const searching = scan.status === 'scanning' ? h('p', { class: 'loading' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), t('connect.searching')) : null;
  const unnamedToggle =
    unnamed.length > 0
      ? h(
          'button',
          {
            type: 'button',
            class: 'link',
            onclick: () => {
              showUnnamed = !showUnnamed;
              renderDeviceList();
            },
          },
          showUnnamed ? t('connect.hideUnnamed') : t('connect.showUnnamed', { count: unnamed.length }),
        )
      : null;
  if (visible.length === 0) {
    mount(
      deviceListEl,
      searching ??
        (scan.devices.length > 0 || scan.error === undefined
          ? h('p', { class: 'empty' }, scan.devices.length > 0 ? t('connect.noneInUpdateMode') : t('connect.pressScan'))
          : null),
      unnamedToggle,
    );
    return;
  }
  mount(deviceListEl, h('ul', { class: 'device-list' }, visible.map(deviceRow)), unnamedToggle, searching);
}

let listSubscribed = false;

function bleConnectBody(otaName: string): HTMLElement {
  const s = store.get();
  const native = isNativeApp();
  if (!listSubscribed) {
    listSubscribed = true;
    store.select((st) => [st.scan.devices, st.scan.status, st.scan.showAll, st.locale], renderDeviceList);
  }
  deviceListEl = h('div', { class: 'device-region', 'aria-live': 'polite' });
  renderDeviceList();
  const scanning = s.scan.status === 'scanning';
  const err = s.scan.error;
  return h(
    'div',
    { class: 'step-content' },
    !native ? h('p', { class: 'callout warn' }, icon('alert'), t('connect.appOnly')) : null,
    h('h4', { class: 'field-label' }, t('connect.ble.title')),
    steps('connect.ble.step', 3, { name: otaName }),
    err && err !== 'app-only'
      ? h('div', { class: 'callout error' }, icon('alert'), h('div', null, h('p', null, t(`connect.error.${err}`)), ...errorExplanation(s.scan.errorDetail)))
      : null,
    h(
      'div',
      { class: 'actions' },
      scanning
        ? h('button', { type: 'button', class: 'btn', onclick: () => void stopBleScan() }, t('connect.stop'))
        : h('button', { type: 'button', class: 'btn primary', disabled: !native, onclick: () => void startBleScan() }, icon('bluetooth', 18), t('connect.scan')),
      h(
        'label',
        { class: 'check inline' },
        h('input', { type: 'checkbox', checked: s.scan.showAll, onchange: (e: Event) => setShowAll((e.target as HTMLInputElement).checked) }),
        t('connect.showAll'),
      ),
    ),
    deviceListEl,
  );
}

function wifiConnectBody(): HTMLElement {
  const s = store.get();
  const native = isNativeApp();
  const checking = s.scan.status === 'scanning';
  const err = s.scan.error;
  const profile = expectedProfile();
  return h(
    'div',
    { class: 'step-content' },
    !native ? h('p', { class: 'callout warn' }, icon('alert'), t('connect.appOnlyWifi')) : null,
    h('h4', { class: 'field-label' }, t('connect.wifi.title')),
    steps('connect.wifi.step', 4, { ssid: profile.ssid, url: `${profile.host}/update` }),
    h('p', { class: 'callout info' }, icon('info'), t('connect.wifi.offlineNote')),
    err && err !== 'app-only'
      ? h('div', { class: 'callout error' }, icon('alert'), h('div', null, h('p', null, t(`connect.error.${err}`, { ssid: profile.ssid })), ...errorExplanation(s.scan.errorDetail)))
      : null,
    h(
      'div',
      { class: 'actions' },
      h(
        'button',
        { type: 'button', class: 'btn primary', disabled: !native || checking, onclick: () => void findWifiNode() },
        icon('wifi', 18),
        t('connect.scan'),
      ),
      checking ? h('span', { class: 'loading' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), t('connect.wifi.checking')) : null,
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

let elapsedTimer: ReturnType<typeof setInterval> | undefined;

/** Updates the live progress elements without re-rendering the step. */
export function updateFlashProgress(): void {
  const f = store.get().flash;
  const root = document.querySelector<HTMLElement>('.flash-progress');
  if (!root || f.phase !== 'running') {
    if (elapsedTimer) clearInterval(elapsedTimer);
    elapsedTimer = undefined;
    return;
  }
  if (f.stage === 'uploading') {
    // The HTTP upload reports no progress; show the elapsed time instead.
    elapsedTimer ??= setInterval(updateFlashProgress, 1000);
    const elapsed = f.startedAt ? (Date.now() - f.startedAt) / 1000 : 0;
    const stats = root.querySelector('.flash-stats');
    if (stats) stats.textContent = t('flash.elapsed', { time: formatDuration(elapsed), size: formatBytes(f.total, locale()) });
    const stageEl = root.querySelector('.flash-stage');
    if (stageEl) stageEl.textContent = stageText(f.stage);
    return;
  }
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
  const isWifi = device.kind === 'wifi';
  const prn = loadPref<number>('prn', 32);
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
    const indeterminate = isWifi;
    return h(
      'div',
      { class: 'step-content' },
      summary,
      h(
        'div',
        { class: 'flash-progress' },
        h('div', { class: 'flash-row' }, h('span', { class: 'flash-stage' }, stageText(f.stage)), indeterminate ? null : h('span', { class: 'flash-pct' }, `${pct}%`)),
        indeterminate
          ? h('div', { class: 'progress big indeterminate', role: 'progressbar', 'aria-busy': 'true' }, h('div', { class: 'progress-fill' }))
          : h(
              'div',
              { class: 'progress big', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) },
              h('div', { class: 'progress-fill' }),
            ),
        h('p', { class: 'flash-stats fineprint' }),
      ),
      h('p', { class: 'callout info' }, icon('info'), t('flash.keepOpen')),
      h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn', onclick: isWifi ? cancelWifiFlash : cancelFlash }, t('flash.cancel'))),
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
        h('div', null, h('h4', null, t('flash.doneTitle')), h('p', null, t(isWifi ? 'flash.doneTextWifi' : 'flash.doneText', { version }))),
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
              : isWifi
                ? t('flash.unknownWifi', { reported: device.knownAs[0] ?? '?', board: board.name })
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
      ? h('div', { class: 'callout error' }, icon('alert'), h('div', null, h('p', null, t('flash.error')), ...errorExplanation(f.error)))
      : null,
    f.phase === 'cancelled' ? h('p', { class: 'callout info' }, icon('info'), t('flash.cancelled')) : null,
    confirmBox,
    cached.sourceId === 'zephcore' && !isWifi ? h('div', { class: 'callout warn' }, icon('info'), h('p', null, t('flash.zephcoreFirstBoot'))) : null,
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
          onclick: () => void (isWifi ? startWifiFlash() : startFlash(loadPref<number>('prn', 32), loadPref<boolean>('compatPackets', false))),
        },
        icon('download', 18),
        f.phase === 'idle' ? t('flash.start') : t('flash.retry'),
      ),
      h('button', { type: 'button', class: 'link', onclick: forgetDevice }, t('flash.otherDevice')),
      f.phase !== 'idle' ? h('button', { type: 'button', class: 'link', onclick: resetFlash }, t('common.dismiss')) : null,
    ),
    isWifi ? null : h(
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
      h(
        'label',
        { class: 'check inline' },
        h('input', {
          type: 'checkbox',
          checked: loadPref<boolean>('compatPackets', false),
          onchange: (e: Event) => savePref('compatPackets', (e.target as HTMLInputElement).checked),
        }),
        t('flash.compat'),
      ),
      h('p', { class: 'fineprint' }, t('flash.compatHint')),
    ),
    logPanel(),
  );
}
