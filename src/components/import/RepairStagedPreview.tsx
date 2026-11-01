/**
 * RepairStagedPreview (Phase 6) — diff preview before explicit confirmation.
 *
 * Spec: docs/05 §2 Step D2, docs/04 §1a-3.
 * Shows every staged original-vs-proposed diff with an affected-cell count.
 * Nothing reaches the worker until "Confirm and apply edits" is pressed.
 */

import { useTranslation } from 'react-i18next';
import { CheckCheck, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { columnIndexToLetter } from './DataPreviewTable';
import { DiffValueText } from './DiffValueText';
import type { CellEdit } from '@/domain/repairs';

interface RepairStagedPreviewProps {
  staged: CellEdit[];
  onConfirm: () => void;
  onClear: () => void;
  onUnstage: (edit: CellEdit) => void;
  disabled?: boolean;
}

export function RepairStagedPreview({
  staged,
  onConfirm,
  onClear,
  onUnstage,
  disabled = false,
}: RepairStagedPreviewProps) {
  const { t } = useTranslation();

  if (staged.length === 0) {
    return null;
  }

  return (
    <div
      className="rounded-sm border-2 border-black bg-yellow/20 p-3"
      data-testid="repair-staged-preview"
    >
      <p className="text-sm font-bold text-charcoal" data-testid="repair-affected-count">
        {t('repairAffectedCount', { count: staged.length })}
      </p>

      <p className="mt-1 text-xs font-bold text-charcoal">{t('repairStagedHeading')}</p>

      <ul className="mt-1 divide-y divide-black/10" data-testid="repair-staged-list">
        {staged.map((edit) => (
          <li
            key={`${edit.row}:${edit.col}`}
            data-testid={`repair-staged-${edit.row}-${edit.col}`}
            className="flex flex-wrap items-center gap-2 py-1.5 text-xs"
          >
            <span className="rounded bg-charcoal px-1.5 py-0.5 font-bold text-white">
              {t('repairCellRef', {
                row: edit.row + 1,
                col: columnIndexToLetter(edit.col),
              })}
            </span>
            <span className="text-muted-foreground line-through">
              <DiffValueText value={edit.original} />
            </span>
            <span aria-hidden="true">→</span>
            <span className="font-bold text-charcoal">
              <DiffValueText value={edit.proposed} />
            </span>
            <button
              type="button"
              onClick={() => onUnstage(edit)}
              disabled={disabled}
              aria-label={t('repairUnstage')}
              data-testid={`repair-unstage-${edit.row}-${edit.col}`}
              className="control-feedback neo-focus ms-auto flex size-6 cursor-pointer items-center justify-center rounded-sm border border-black bg-white text-charcoal hover:bg-sage/40 disabled:opacity-50"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={disabled}
          onClick={onConfirm}
          data-testid="repair-confirm-staged"
          className="min-h-10 cursor-pointer border-2 border-black bg-yellow font-extrabold text-black shadow-hard hover:bg-yellow active:bg-charcoal active:text-yellow"
        >
          <CheckCheck className="size-4 shrink-0" aria-hidden="true" />
          {t('repairConfirmStaged')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={onClear}
          data-testid="repair-clear-staged"
          className="min-h-10"
        >
          <Trash2 className="size-4 shrink-0" aria-hidden="true" />
          {t('repairClearStaged')}
        </Button>
      </div>
    </div>
  );
}
