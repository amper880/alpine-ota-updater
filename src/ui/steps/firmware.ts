import { h, icon } from '../dom.ts';
import { locale, t } from '../../i18n/index.ts';
import {
  cancelDownload,
  dismissDownloadError,
  refreshFirmwareList,
  selectedSource,
  startDownload,
  store,
  useFirmware,
} from '../../app/state.ts';
import type { FirmwareOption } from '../../lib/catalog/types.ts';
import { isNativeApp } from '../../lib/platform.ts';
import { formatBytes, formatDate } from '../../lib/util/format.ts';

function progressBar(key: string): HTMLElement {
  return h(
    'div',
    { class: 'progress', dataset: { progressKey: key }, role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' },
    h('div', { class: 'progress-fill' }),
  );
}

/** Updates progress bars in place (called often; avoids re-rendering the list). */
export function updateProgressBars(): void {
  const { downloads } = store.get();
  for (const el of document.querySelectorAll<HTMLElement>('[data-progress-key]')) {
    const d = downloads[el.dataset.progressKey ?? ''];
    if (!d) continue;
    const pct = d.total ? Math.min(100, Math.round((d.received / d.total) * 100)) : 0;
    el.setAttribute('aria-valuenow', String(pct));
    (el.firstElementChild as HTMLElement).style.width = `${pct}%`;
    const label = el.parentElement?.querySelector<HTMLElement>('.progress-label');
    if (label) label.textContent = `${pct}% (${formatBytes(d.received, locale())})`;
  }
}

function row(fw: FirmwareOption, latest: boolean): HTMLElement {
  const s = store.get();
  const cached = s.cached[fw.key];
  const dl = s.downloads[fw.key];
  const selected = s.firmwareKey === fw.key;
  let action: HTMLElement;
  if (dl && !dl.error) {
    action = h(
      'div',
      { class: 'dl-active' },
      progressBar(fw.key),
      h('span', { class: 'progress-label' }, '0%'),
      h('button', { type: 'button', class: 'btn small ghost', onclick: () => cancelDownload(fw.key) }, t('firmware.cancel')),
    );
  } else if (cached) {
    action = selected
      ? h('span', { class: 'chip ok' }, icon('check', 16), t('firmware.selected'))
      : h('button', { type: 'button', class: 'btn small', onclick: () => useFirmware(fw.key) }, t('firmware.use'));
  } else {
    action = h(
      'button',
      { type: 'button', class: 'btn small primary', disabled: !isNativeApp(), onclick: () => void startDownload(fw) },
      icon('download', 16),
      t('firmware.download'),
    );
  }

  return h(
    'li',
    { class: ['fw-row', selected && 'selected'] },
    h(
      'div',
      { class: 'fw-main' },
      h(
        'div',
        { class: 'fw-title' },
        h('span', { class: 'fw-version' }, fw.version),
        latest ? h('span', { class: 'chip' }, t('firmware.latest')) : null,
        cached && !selected ? h('span', { class: 'chip ok' }, icon('check', 14), t('firmware.downloaded')) : null,
      ),
      h(
        'div',
        { class: 'fw-meta' },
        h('span', null, formatDate(fw.publishedAt, locale())),
        h('span', null, formatBytes(fw.asset.size, locale())),
        h('span', { class: 'fw-file', title: fw.asset.name }, fw.asset.name),
      ),
      dl?.error
        ? h(
            'p',
            { class: 'error-line' },
            icon('alert', 16),
            t(`download.error.${dl.error}`),
            h('button', { type: 'button', class: 'link', onclick: () => dismissDownloadError(fw.key) }, t('common.dismiss')),
          )
        : null,
      fw.notes
        ? h(
            'details',
            { class: 'notes' },
            h('summary', null, t('firmware.notes')),
            h('div', { class: 'notes-body' }, fw.notes.trim()),
            h('a', { href: fw.releaseUrl, target: '_blank', rel: 'noopener' }, t('firmware.onGitHub'), ' ', icon('external', 14)),
          )
        : null,
    ),
    h('div', { class: 'fw-action' }, action),
  );
}

export function firmwareBody(): HTMLElement {
  const s = store.get();
  const src = selectedSource();
  const r = s.releases;
  let content: HTMLElement | HTMLElement[];
  if (r.status === 'loading' || r.status === 'idle') {
    content = h('p', { class: 'loading' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), t('firmware.loading'));
  } else if (r.status === 'error') {
    content = h(
      'div',
      { class: 'callout error' },
      icon('alert'),
      h('div', null, h('p', null, t('firmware.loadError')), h('p', { class: 'fineprint' }, r.error ?? '')),
      h('button', { type: 'button', class: 'btn small', onclick: () => void refreshFirmwareList(true) }, icon('refresh', 16), t('common.retry')),
    );
  } else if (r.options.length === 0) {
    content = h('p', { class: 'empty' }, t('firmware.none', { source: src?.name ?? '' }));
  } else {
    content = h('ul', { class: 'fw-list' }, r.options.map((o, i) => row(o, i === 0)));
  }
  return h(
    'div',
    { class: 'step-content' },
    r.offlineSince
      ? h('p', { class: 'callout info' }, icon('info'), t('firmware.offline', { date: formatDate(r.offlineSince, locale()) }))
      : null,
    !isNativeApp() ? h('p', { class: 'callout warn' }, icon('alert'), t('firmware.appOnly')) : null,
    content,
    src?.notes ? h('p', { class: 'fineprint' }, src.notes) : null,
  );
}
