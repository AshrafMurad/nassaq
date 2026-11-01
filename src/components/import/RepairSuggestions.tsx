/**
 * RepairSuggestions (Phase 6, paginated) — localized, bounded suggestion
 * list with server(paged)-side pagination.
 *
 * Spec: docs/05 §2 Step D2, docs/04 §5a.
 * Every suggestion is passive: it changes nothing until staged here and
 * confirmed in the staged-diff preview. Severity/classification is conveyed
 * by icon + text, never color alone.
 *
 * Phase 6 follow-up:
 *  - The worker holds the FULL suggestion list; this list renders one
 *    bounded page (PAGE_SIZE) fetched via GET_SUGGESTIONS, with Previous/
 *    Next controls and an explicit "Showing X–Y of Z" count.
 *  - The stage button toggles: staged items offer "Remove from review".
 *  - Original/proposed values render with visible whitespace markers so
 *    trim-style diffs are actually comparable.
 */

import { useTranslation } from 'react-i18next';
import {
  ShieldCheck,
  HelpCircle,
  Ban,
  Plus,
  Undo2,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { columnIndexToLetter } from './DataPreviewTable';
import { DiffValueText } from './DiffValueText';
import type { SuggestionItem, SuggestionKind } from '@/domain/suggestions';

/** Suggestions rendered per page (bounded, predictable list height). */
export const SUGGESTION_PAGE_SIZE = 10;

interface RepairSuggestionsProps {
  /** Suggestions for the CURRENT page (worker-sliced window). */
  suggestions: SuggestionItem[] | null;
  /** Total suggestions in the effective table (all pages). */
  total: number;
  /** 0-based page index into the full suggestion list. */
  page: number;
  /** Bumped whenever the effective table changes (resets to page 0). */
  version: number;
  isLoadingPage: boolean;
  /** Rejected suggestion ids. */
  rejected: ReadonlySet<string>;
  /** Staged cell keys (`row:col`) to reflect stage state per item. */
  stagedKeys: ReadonlySet<string>;
  onStage: (suggestion: SuggestionItem) => void;
  onUnstage: (row: number, col: number) => void;
  onReject: (suggestion: SuggestionItem) => void;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}

export function RepairSuggestions({
  suggestions,
  total,
  page,
  version,
  isLoadingPage,
  rejected,
  stagedKeys,
  onStage,
  onUnstage,
  onReject,
  onPageChange,
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

  if (total === 0) {
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

  const pageCount = Math.max(1, Math.ceil(total / SUGGESTION_PAGE_SIZE));
  const pageItems = (suggestions ?? []).filter((s) => !rejected.has(s.id));
  const rangeStart = page * SUGGESTION_PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, (page + 1) * SUGGESTION_PAGE_SIZE);
  const hasPrev = page > 0;
  const hasNext = page < pageCount - 1;

  return (
    <div className="space-y-2" data-testid="repair-suggestions-panel" aria-busy={isLoadingPage}>
      <p className="text-xs text-muted-foreground" data-testid="repair-suggestions-total">
        {t('repairSuggestionsTotal', { shown: `${rangeStart}–${rangeEnd}`, total })}
      </p>

      {suggestions === null || isLoadingPage ? (
        <p
          role="status"
          className="flex items-center gap-2 text-xs text-muted-foreground"
          data-testid="repair-suggestions-loading"
        >
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          {t('repairLoadingSuggestions')}
        </p>
      ) : pageItems.length === 0 ? (
        <p role="status" className="text-xs text-muted-foreground">
          {t('repairNoSuggestions')}
        </p>
      ) : (
        <ul
          className="space-y-2"
          aria-label={t('repairSuggestionListLabel')}
          data-testid="repair-suggestion-list"
          key={version}
        >
          {pageItems.map((s) => {
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
                    <DiffValueText value={s.original} />
                  </div>
                  <div className="rounded-sm border border-black/20 bg-yellow/30 p-1.5">
                    <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      {t('repairProposed')}
                    </span>
                    <DiffValueText value={s.proposed} />
                  </div>
                </div>

                <div className="mt-2 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={disabled}
                    onClick={() =>
                      staged ? onUnstage(s.row, s.col) : onStage(s)
                    }
                    data-testid={
                      staged
                        ? `repair-unstage-${s.id}`
                        : `repair-stage-${s.id}`
                    }
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
      )}

      {pageCount > 1 && (
        <nav
          className="flex items-center justify-between gap-2 pt-1"
          aria-label={t('repairPaginationLabel')}
          data-testid="repair-pagination"
        >
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || !hasPrev || isLoadingPage}
            onClick={() => onPageChange(page - 1)}
            data-testid="repair-page-prev"
            className="min-h-9"
          >
            <ChevronLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
            {t('repairPrevPage')}
          </Button>
          <span className="text-xs font-bold tabular-nums text-charcoal" data-testid="repair-page-status">
            {t('repairPageStatus', { page: page + 1, count: pageCount })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || !hasNext || isLoadingPage}
            onClick={() => onPageChange(page + 1)}
            data-testid="repair-page-next"
            className="min-h-9"
          >
            {t('repairNextPage')}
            <ChevronRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
          </Button>
        </nav>
      )}
    </div>
  );
}
