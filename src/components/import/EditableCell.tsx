/**
 * EditableCell (Phase 6) — per-cell edit affordance inside the preview table.
 *
 * The user must explicitly confirm every value change (PR-06 / docs/04 §1a):
 *  - Idle: renders the escaped, direction-isolated value plus an "edit" button.
 *  - Editing: a labelled MULTILINE textarea with immediate re-validation
 *    feedback (32,767 UTF-16 cap; no-op detection). Embedded newlines are
 *    preserved exactly — confirming never silently strips them. Ctrl+Enter
 *    confirms, Escape cancels. Confirm stages a manual diff via
 *    `onConfirmEdit`; the authoritative re-validation happens in the worker.
 *  - Focus returns to the edit affordance after confirm/cancel (docs/05 §7).
 *  - Small icon controls keep a ≥44px hit area via an invisible inset
 *    pseudo-element on coarse pointers (docs/05 §7 touch targets).
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Pencil, X } from 'lucide-react';
import { MAX_CELL_UTF16 } from '@/domain/limits';
import type { CellEdit } from '@/domain/repairs';

interface EditableCellProps {
  /** 0-based record index in the parsed table. */
  row: number;
  /** 0-based column index. */
  col: number;
  /** Current effective value shown in the preview cell. */
  value: string;
  /** Whether this cell has a confirmed (applied) edit — green badge. */
  isEdited: boolean;
  /** Whether this cell has a staged (pending) edit — amber badge. */
  isStaged: boolean;
  onConfirmEdit: (edit: CellEdit) => void;
  disabled?: boolean;
}

export function EditableCell({
  row,
  col,
  value,
  isEdited,
  isStaged,
  onConfirmEdit,
  disabled = false,
}: EditableCellProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  /** Set before leaving edit mode; focus restores after the re-render. */
  const restoreFocusRef = useRef(false);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (!editing && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      editButtonRef.current?.focus();
    }
  }, [editing]);

  const ariaLabel = t('repairEditCell', { row: row + 1, col: col + 1 });

  const startEditing = () => {
    setDraft(value);
    setError(null);
    setEditing(true);
  };

  const stopEditing = () => {
    // Focus is restored in the post-render effect (the idle affordance is
    // not mounted yet during this event handler).
    restoreFocusRef.current = true;
    setEditing(false);
    setError(null);
  };

  const confirm = () => {
    if (draft === value) {
      setError(t('repairEditUnchanged'));
      return;
    }
    if (draft.length > MAX_CELL_UTF16) {
      setError(t('repairEditTooLong'));
      return;
    }
    onConfirmEdit({
      row,
      col,
      original: value,
      proposed: draft,
      source: 'manual',
    });
    stopEditing();
  };

  if (editing) {
    return (
      <div className="space-y-1.5">
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              confirm();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              stopEditing();
            }
          }}
          rows={Math.min(6, Math.max(2, draft.split('\n').length))}
          disabled={disabled}
          aria-label={ariaLabel}
          data-testid={`cell-input-${row}-${col}`}
          className="neo-control neo-focus w-full min-w-0 resize-y rounded-sm border-2 border-black bg-white px-2 py-1 font-mono text-xs leading-5 text-charcoal"
        />
        <p className="text-[10px] text-muted-foreground">
          {t('repairEditConfirmHint')}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={confirm}
            disabled={disabled}
            title={t('repairEditSave')}
            aria-label={t('repairEditSave')}
            data-testid={`cell-confirm-${row}-${col}`}
            className="control-feedback neo-focus relative flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-sm border-2 border-black bg-yellow text-black hover:bg-yellow before:absolute before:-inset-2.5 before:content-[''] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={stopEditing}
            title={t('repairEditCancel')}
            aria-label={t('repairEditCancel')}
            data-testid={`cell-cancel-${row}-${col}`}
            className="control-feedback neo-focus relative flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-sm border-2 border-black bg-white text-charcoal hover:bg-sage/40 before:absolute before:-inset-2.5 before:content-[''] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        {error && (
          <p role="alert" className="text-[11px] font-bold text-red-700">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-1">
      <div className="min-w-0 flex-1 whitespace-pre-wrap break-all">
        {value === '' ? (
          <span className="italic text-muted-foreground select-none">
            {t('emptyCellLabel')}
          </span>
        ) : (
          <bdi dir="auto">{value}</bdi>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {isEdited && (
          <span
            data-testid={`cell-edited-${row}-${col}`}
            className="rounded bg-green-700 px-1 py-0.5 text-[10px] font-bold text-white"
          >
            {t('repairEditedBadge')}
          </span>
        )}
        {isStaged && (
          <span
            data-testid={`cell-staged-${row}-${col}`}
            className="rounded bg-amber-500 px-1 py-0.5 text-[10px] font-bold text-black"
          >
            {t('repairStagedBadge')}
          </span>
        )}
        <button
          ref={editButtonRef}
          type="button"
          onClick={startEditing}
          disabled={disabled}
          aria-label={ariaLabel}
          title={ariaLabel}
          data-testid={`cell-edit-${row}-${col}`}
          className="control-feedback neo-focus relative flex size-6 cursor-pointer items-center justify-center rounded-sm border border-black bg-white text-charcoal hover:bg-sage/40 before:absolute before:-inset-2.5 before:content-[''] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Pencil className="size-3" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
