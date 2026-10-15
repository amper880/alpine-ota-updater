/**
 * The step trail: five waypoints from device type to flashing. Completed steps collapse to a
 * one-line summary and can be reopened.
 */
import { h, icon } from '../dom.ts';
import { t } from '../../i18n/index.ts';
import { openStep, progressStep, reopenStep, selectedBoard, selectedFirmware, selectedSource, store } from '../../app/state.ts';
import { boardBody, platformBadge } from './board.ts';
import { sourceBody } from './source.ts';
import { firmwareBody, updateProgressBars } from './firmware.ts';
import { connectBody, flashBody, matchChip, updateFlashProgress } from './connect.ts';

interface StepDef {
  n: number;
  title: string;
  summary: () => (Node | string)[] | null;
  body: () => HTMLElement;
}

function defs(): StepDef[] {
  const s = store.get();
  return [
    {
      n: 1,
      title: t('step.board'),
      summary: () => {
        const b = selectedBoard();
        return b ? [b.name, platformBadge(b.platform)] : null;
      },
      body: boardBody,
    },
    {
      n: 2,
      title: t('step.source'),
      summary: () => {
        const src = selectedSource();
        return src ? [`${src.name}, ${t(`role.${s.role}`).toLowerCase()}`] : null;
      },
      body: sourceBody,
    },
    {
      n: 3,
      title: t('step.firmware'),
      summary: () => {
        const fw = selectedFirmware();
        return fw ? [fw.version] : null;
      },
      body: firmwareBody,
    },
    {
      n: 4,
      title: t('step.connect'),
      summary: () => (s.device ? [s.device.name, matchChip(s.device)] : null),
      body: connectBody,
    },
    { n: 5, title: t('step.flash'), summary: () => null, body: flashBody },
  ];
}

function renderTrail(root: HTMLElement): void {
  const s = store.get();
  const progress = progressStep(s);
  const open = openStep(s);
  root.replaceChildren(
    ...defs().map((d) => {
      const state = d.n < progress ? 'done' : d.n === progress ? 'current' : 'locked';
      const isOpen = d.n === open && d.n <= progress;
      const summary = state === 'done' && !isOpen ? d.summary() : null;
      const headId = `step-${d.n}-title`;
      return h(
        'section',
        { class: ['step', `is-${state}`, isOpen && 'is-open'], 'aria-labelledby': headId },
        h('div', { class: 'marker', 'aria-hidden': 'true' }, state === 'done' ? icon('check', 16) : String(d.n)),
        h(
          'div',
          { class: 'step-main' },
          h(
            'header',
            { class: 'step-head' },
            h(
              'h3',
              { id: headId, class: 'step-title' },
              h('span', { class: 'sr-only' }, t('step.label', { n: d.n })),
              d.title,
            ),
            summary ? h('div', { class: 'step-summary' }, ...summary) : null,
            state === 'done' && !isOpen && s.flash.phase !== 'running'
              ? h('button', { type: 'button', class: 'link change', onclick: () => reopenStep(d.n) }, t('common.change'))
              : null,
            state === 'done' && isOpen && s.openStep !== undefined
              ? h('button', { type: 'button', class: 'link change', onclick: () => reopenStep(undefined) }, t('common.close'))
              : null,
          ),
          isOpen ? d.body() : null,
        ),
      );
    }),
  );
  updateProgressBars();
  updateFlashProgress();
}

export function renderSteps(root: HTMLElement): void {
  store.select(
    (s) => [
      s.locale,
      s.boardId,
      s.role,
      s.sourceId,
      s.firmwareKey,
      s.openStep,
      s.releases,
      s.cached,
      Object.entries(s.downloads)
        .map(([k, d]) => `${k}:${d.error ?? ''}`)
        .join('|'),
      s.device,
      s.scan.error,
      s.scan.status,
      s.scan.showAll,
      s.flash.phase,
      s.flash.stage,
      s.flash.log.length,
    ],
    () => renderTrail(root),
  );
  store.select((s) => s.downloads, updateProgressBars);
  store.select((s) => [s.flash.sent, s.flash.total], updateFlashProgress);
}
