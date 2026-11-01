/**
 * DiffValueText (Phase 6 follow-up) — renders a cell value for repair
 * comparisons with surrounding whitespace and line breaks made visible.
 *
 * Display only: the underlying value is never modified. Leading/trailing
 * space/tab characters are shown as visible glyph chips so an ambiguous
 * "looks identical" diff (e.g. a trim suggestion) can actually be judged;
 * embedded newlines inside the value render as real breaks plus an ↵ chip.
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

const WHITESPACE_GLYPHS: Record<string, string> = {
  ' ': '␣',
  '\t': '⇥',
  '\n': '↵',
  '\r': '↵',
};

function isMarkerWhitespace(char: string): boolean {
  return char in WHITESPACE_GLYPHS;
}

export function DiffValueText({ value }: { value: string }) {
  const { t } = useTranslation();

  if (value === '') {
    return (
      <span className="italic text-muted-foreground select-none">
        {t('emptyCellLabel')}
      </span>
    );
  }

  let start = 0;
  while (start < value.length && isMarkerWhitespace(value[start]!)) start++;
  let end = value.length;
  while (end > start && isMarkerWhitespace(value[end - 1]!)) end--;

  const lead = value.slice(0, start);
  const core = value.slice(start, end);
  const trail = value.slice(end);

  const renderMarkers = (chars: string, keyPrefix: string): ReactNode[] =>
    [...chars].map((char, i) => (
      <span
        key={`${keyPrefix}-${i}`}
        aria-label={t('whitespaceIndicator')}
        title={t('whitespaceIndicator')}
        className="inline-flex min-w-4 justify-center rounded bg-charcoal/10 px-0.5 font-mono text-[10px] leading-4 text-charcoal"
      >
        {WHITESPACE_GLYPHS[char] ?? char}
      </span>
    ));

  return (
    <span className="break-all font-mono text-xs" dir="auto">
      {renderMarkers(lead, 'lead')}
      <bdi className="whitespace-pre-wrap">{core}</bdi>
      {renderMarkers(trail, 'trail')}
    </span>
  );
}
