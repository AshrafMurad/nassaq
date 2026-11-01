/**
 * RepairHistory (Phase 6) — undo/redo controls over the bounded, in-memory
 * transaction history, plus a polite live region for repair announcements.
 *
 * Spec: docs/05 §2 Step D2, docs/04 §1a-7.
 */

import { useTranslation } from 'react-i18next';
import { History, Redo2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RepairHistoryProps {
  confirmedTransactions: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  disabled?: boolean;
  /** Polite live-region text (applied/undone/redone announcements). */
  liveMessage: string;
}

export function RepairHistory({
  confirmedTransactions,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  disabled = false,
  liveMessage,
}: RepairHistoryProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="repair-history">
      <span
        data-testid="repair-history-count"
        className="inline-flex items-center gap-1.5 rounded-sm border border-black bg-sage px-2 py-1 text-xs font-bold text-charcoal"
      >
        <History className="size-3.5" aria-hidden="true" />
        {t('repairHistoryTitle', { count: confirmedTransactions })}
      </span>

      <Button
        variant="outline"
        size="sm"
        onClick={onUndo}
        disabled={disabled || !canUndo}
        data-testid="repair-undo"
        aria-label={t('repairUndo')}
        className="min-h-9"
      >
        <Undo2 className="size-4 shrink-0" aria-hidden="true" />
        {t('repairUndo')}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onRedo}
        disabled={disabled || !canRedo}
        data-testid="repair-redo"
        aria-label={t('repairRedo')}
        className="min-h-9"
      >
        <Redo2 className="size-4 shrink-0" aria-hidden="true" />
        {t('repairRedo')}
      </Button>

      <p role="status" aria-live="polite" className="sr-only" data-testid="repair-live-region">
        {liveMessage}
      </p>
    </div>
  );
}
