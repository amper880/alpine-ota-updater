/**
 * Renders an ErrorInfo below a callout's headline: the translated explanation and, folded
 * away, the technical text from the OS / plugin (which is usually English).
 */
import { t } from '../i18n/index.ts';
import type { ErrorInfo } from '../lib/util/errors.ts';
import { h } from './dom.ts';

export function errorExplanation(info: ErrorInfo | undefined): HTMLElement[] {
  if (!info) return [];
  const out: HTMLElement[] = [];
  if (info.key !== 'err.unknown') out.push(h('p', null, t(info.key, info.params)));
  const detail = info.detail?.trim();
  if (detail) {
    out.push(h('details', { class: 'tech-details' }, h('summary', null, t('common.technicalDetails')), h('p', { class: 'fineprint' }, detail)));
  }
  return out;
}
