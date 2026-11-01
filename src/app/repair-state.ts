/**
 * Repair state (Phase 6) — pure state transitions for the repair workflow.
 *
 * Spec: docs/04_DATA_INTEGRITY_AND_VALIDATION.md §1a, docs/05 §2 Step D2.
 *
 * The UI stages explicit diffs (from suggestions or manual cell edits),
 * confirms them (per cell or bulk), and reorders confirmed transactions via
 * undo/redo. Nothing here mutates tables; the effective table lives in the
 * worker as immutable originals + the approved diff list, re-synced with the
 * complete diff list on every confirmation (APPLY_EDITS).
 */

import type { CellEdit, RepairHistory } from '@/domain/repairs';
import {
  createRepairHistory,
  pushTransaction,
  undoTransaction,
  redoTransaction,
  flattenApproved,
  isHistoryFull,
} from '@/domain/repairs';
import type { SuggestionItem } from '@/domain/suggestions';

export interface RepairState {
  /** Bounded confirmed-transaction history (undo/redo). */
  history: RepairHistory;
  /** Staged edits awaiting explicit bulk confirmation, keyed `row:col`. */
  staged: Record<string, CellEdit>;
  /** Rejected suggestion ids; filtered from the visible list. */
  rejected: ReadonlySet<string>;
}

export function createRepairState(): RepairState {
  return {
    history: createRepairHistory(),
    staged: {},
    rejected: new Set<string>(),
  };
}

export function stageEdit(state: RepairState, edit: CellEdit): RepairState {
  const key = `${edit.row}:${edit.col}`;
  return { ...state, staged: { ...state.staged, [key]: edit } };
}

/** Converts a suggestion into a staged diff proposal. */
export function stageSuggestion(
  state: RepairState,
  suggestion: SuggestionItem,
): RepairState {
  return stageEdit(state, {
    row: suggestion.row,
    col: suggestion.col,
    original: suggestion.original,
    proposed: suggestion.proposed,
    source: 'suggestion',
  });
}

export function unstageCell(
  state: RepairState,
  row: number,
  col: number,
): RepairState {
  const key = `${row}:${col}`;
  if (!(key in state.staged)) return state;
  const staged = { ...state.staged };
  delete staged[key];
  return { ...state, staged };
}

export function clearStaged(state: RepairState): RepairState {
  if (Object.keys(state.staged).length === 0) return state;
  return { ...state, staged: {} };
}

/**
 * Confirms every staged edit as one transaction (bulk apply).
 * Refuses (fail-closed) when the bounded history is full; the caller must
 * surface the full-history state and offer undo. The caller then syncs
 * `approvedEdits(state)` to the worker.
 */
export function confirmStaged(state: RepairState): RepairState {
  const edits = Object.values(state.staged);
  if (edits.length === 0) return state;
  if (isHistoryFull(state.history)) return state;
  return {
    ...state,
    history: pushTransaction(state.history, edits),
    staged: {},
    // Rejected suggestions stay rejected until a re-parse clears them.
  };
}

/**
 * Confirms ONE manually typed edit as its own undo/redo transaction,
 * leaving unrelated staged suggestions pending (Phase 6 follow-up fix:
 * a per-cell confirm must never bulk-apply the staging area).
 * Refuses (fail-closed) when the bounded history is full.
 */
export function confirmSingleEdit(state: RepairState, edit: CellEdit): RepairState {
  if (isHistoryFull(state.history)) return state;
  return {
    ...state,
    history: pushTransaction(state.history, [edit]),
  };
}

export function historyFull(state: RepairState): boolean {
  return isHistoryFull(state.history);
}

/**
 * Explicitly rejects a suggestion; the effective table never changes.
 * If that suggestion was staged for review, the staged diff is withdrawn
 * too (Phase 6 follow-up fix: rejecting must not leave a pending edit
 * behind in the confirmation list). Manually staged edits at the same cell
 * are left untouched.
 */
export function rejectSuggestion(state: RepairState, id: string): RepairState {
  const [rowStr, colStr] = id.split(':');
  const key = `${rowStr}:${colStr}`;
  const stagedEdit = state.staged[key];
  const withdrawStaged =
    stagedEdit !== undefined && stagedEdit.source === 'suggestion';

  const rejected = new Set(state.rejected);
  rejected.add(id);

  if (!withdrawStaged) {
    if (state.rejected.has(id)) return state;
    return { ...state, rejected };
  }

  const staged = { ...state.staged };
  delete staged[key];
  return { ...state, staged, rejected };
}

export function undo(state: RepairState): RepairState {
  if (state.history.approved.length === 0) return state;
  return { ...state, history: undoTransaction(state.history) };
}

export function redo(state: RepairState): RepairState {
  if (state.history.redo.length === 0) return state;
  return { ...state, history: redoTransaction(state.history) };
}

/** The complete approved diff list, in confirmation order (worker sync). */
export function approvedEdits(state: RepairState): CellEdit[] {
  return flattenApproved(state.history);
}

export function confirmedCount(state: RepairState): number {
  return state.history.approved.length;
}

export function stagedCount(state: RepairState): number {
  return Object.keys(state.staged).length;
}

/** Discards everything (re-parse, cancel, reset). */
export function clearRepairs(): RepairState {
  return createRepairState();
}
