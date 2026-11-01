/**
 * RepairSuggestions (Phase 6) — localized, bounded suggestion list.
 *
 * Spec: docs/05 §2 Step D2, docs/04 §5a.
 * Every suggestion is passive: it changes nothing until staged here and
 * confirmed in the staged-diff preview. Severity/classification is conveyed
 * by icon + text, never color alone.
 */

import { useTranslation } from 'react-i18next';
import { ShieldCheck, HelpCircle, Ban, Plus, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { columnIndexToLetter } from './DataPreviewTable';
import type { SuggestionItem, SuggestionKind } from '@/domain/suggestions';

interface RepairSuggestionsProps {
  suggestions: SuggestionItem[];
  /** Total suggestions in the effective table (may exceed list). */
  total: number;
  /** Rejected suggestion ids. */
  rejected: ReadonlySet<string>;
  /** Staged cell keys (`row:col`) to reflect stage state per item. */
  stagedKeys: ReadonlySet<string>;
  onStage: (suggestion: SuggestionItem) => void;
  onReject: (suggestion: SuggestionItem) => void;
  disabled?: boolean;
}

export function RepairSuggestions({
  suggestions,
  total,
  rejected,
  stagedKeys,
  onStage,
  onReject,
  disabled = false,
}: RepairSuggestionsProps) {
  const { t } = useTranslation();

  const kindLabel = (kind: SuggestionKind): string => {
    switch (kind) {
      case 'TRIM_SURROUNDING_WHITESPACE': return t('repairKindTrimWhitespace');
      case 'ARABIC_INDIC_TO_ASCII_DIGITS': return t('repairKindArabicDigits');
      case 'NFC_NORMALIZE': return t('repairKindNfc');
      case 'DECIMAL_COMMA_TO_DOT': return t('repairKindDecimalComma');
      case 'SCIENTIFIC_TO_DECIMAL': return t('repairKindScientific');
      default: return kind;
    }
  };

  const visible = suggestions.filter((s) => !rejected.has(s.id));

  if (visible.length === 0) {
    return (
      <p
        role="status"
        data-testid="repair-no-suggestions"
        className="text-xs text-muted-foreground"
      >
        {t('repairNoSuggestions')}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground" data-testid="repair-suggestions-total">
        {t('repairSuggestionsTotal', { shown: visible.length, total })}
      </p>
      <ul
        className="space-y-2"
        aria-label={t('repairSuggestionListLabel')}
        data-testid="repair-suggestion-list"
      >
        {visible.map((s) => {
          const staged = stagedKeys.has(`${s.row}:${s.col}`);
          const classificationLabel =
            s.classification === 'safe'
              ? t('repairSafeBadge')
              : t('repairAmbiguousBadge');

          return (
            <li
              key={s.id}
              data-testid={`repair-suggestion-${s.id}`}
              className="rounded-sm border border-black/30 bg-white p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-charcoal px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {t('repairCellRef', { row: s.row + 1, col: columnIndexToLetter(s.col) })}
                </span>
                <span className="text-xs font-bold text-charcoal">
                  {kindLabel(s.kind)}
                </span>
                <span
                  data-testid={`repair-suggestion-class-${s.id}`}
                  className="inline-flex items-center gap-1 rounded border border-black bg-sage px-1.5 py-0.5 text-[10px] font-bold text-charcoal"
                >
                  {s.classification === 'safe' ? (
                    <ShieldCheck className="size-3" aria-hidden="true" />
                  ) : (
                    <HelpCircle className="size-3" aria-hidden="true" />
                  )}
                  {classificationLabel}
                </span>
              </div>

              <div className="mt-2 grid gap-1.5 text-xs sm:grid-cols-2">
                <div className="rounded-sm border border-black/20 bg-muted/30 p-1.5">
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    {t('repairOriginal')}
                  </span>
                  <bdi dir="auto" className="whitespace-pre-wrap break-all">
                    {s.original === '' ? t('emptyCellLabel') : s.original}
                  </bdi>
                </div>
                <div className="rounded-sm border border-black/20 bg-yellow/30 p-1.5">
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    {t('repairProposed')}
                  </span>
                  <bdi dir="auto" className="whitespace-pre-wrap break-all">
                    {s.proposed === '' ? t('emptyCellLabel') : s.proposed}
                  </bdi>
                </div>
              </div>

              <div className="mt-2 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={() => onStage(s)}
                  data-testid={`repair-stage-${s.id}`}
                  className="min-h-9"
                >
                  {staged ? (
                    <>
                      <Undo2 className="size-4 shrink-0" aria-hidden="true" />
                      {t('repairUnstage')}
                    </>
                  ) : (
                    <>
                      <Plus className="size-4 shrink-0" aria-hidden="true" />
                      {t('repairStage')}
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={() => onReject(s)}
                  data-testid={`repair-reject-${s.id}`}
                  className="min-h-9"
                >
                  <Ban className="size-4 shrink-0" aria-hidden="true" />
                  {t('repairReject')}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
