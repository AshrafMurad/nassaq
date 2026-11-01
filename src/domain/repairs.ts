/**
 * Repair diff model for Nassaq (Phase 6).
 *
 * Specification: docs/04_DATA_INTEGRITY_AND_VALIDATION.md §1a
 *
 * Invariants enforced by this module:
 *  - `originalRecords` is never mutated; every application returns new arrays.
 *  - An edit is an explicit diff `{ row, col, original, proposed, source }`.
 *    `original` must equal the running effective value at apply time; any
 *    mismatch fails closed (stale edits are never silently forced).
 *  - Proposed values must respect the same caps as parsed content
 *    (≤ MAX_CELL_UTF16 UTF-16 units, within table bounds).
 *  - The effective table is always `original + approved diffs` folded in
 *    confirmation order — never a mutated copy of the originals.
 */

import { MAX_CELL_UTF16, utf16Length } from './limits';

export type EditSource = 'manual' | 'suggestion';

export interface CellEdit {
  /** 0-based record index in the parsed table. */
  row: number;
  /** 0-based column index in the parsed table. */
  col: number;
  /** Expected effective value before this edit applies (stale-diff guard). */
  original: string;
  /** User-approved replacement value. */
  proposed: string;
  source: EditSource;
}

/** Failure codes for edit validation; surfaced as localized worker errors. */
export type EditRejectionCode = 'EDIT_CONFLICT' | 'EDIT_INVALID';

export type EditValidation =
  | { ok: true }
  | { ok: false; code: EditRejectionCode; row: number; col: number };

/** A confirmed batch of edits applied as one undo/redo transaction. */
export interface EditTransaction {
  edits: CellEdit[];
}

/** Maximum number of retained undo/redo transactions (bounded memory). */
export const MAX_HISTORY_TRANSACTIONS = 50;

/**
 * True when the bounded history is full. Fail-closed policy (docs/04 §1a-7):
 * a full history refuses NEW transactions instead of silently truncating the
 * oldest ones — dropping a prefix would break the original-chained diffs and
 * force EDIT_CONFLICT on the next sync. Undo frees space; re-parse resets.
 */
export function isHistoryFull(history: RepairHistory): boolean {
  return history.approved.length >= MAX_HISTORY_TRANSACTIONS;
}

/** A validated-failure variant of `EditValidation` (ok is always false here). */
export type EditValidationFailure = Extract<EditValidation, { ok: false }>;

/**
 * Validates a single proposed edit against the current effective value and caps.
 * Pure; does not touch any table.
 */
export function validateEditProposal(
  effectiveRecords: readonly (readonly string[])[],
  edit: CellEdit,
): EditValidation {
  if (
    !Number.isInteger(edit.row) ||
    !Number.isInteger(edit.col) ||
    edit.row < 0 ||
    edit.col < 0 ||
    edit.row >= effectiveRecords.length
  ) {
    return { ok: false, code: 'EDIT_INVALID', row: edit.row, col: edit.col };
  }

  const rowRecord = effectiveRecords[edit.row];
  if (!rowRecord || edit.col >= rowRecord.length) {
    return { ok: false, code: 'EDIT_INVALID', row: edit.row, col: edit.col };
  }

  const current = rowRecord[edit.col] ?? '';
  if (current !== edit.original) {
    return { ok: false, code: 'EDIT_CONFLICT', row: edit.row, col: edit.col };
  }

  if (utf16Length(edit.proposed) > MAX_CELL_UTF16) {
    return { ok: false, code: 'EDIT_INVALID', row: edit.row, col: edit.col };
  }

  if (edit.proposed === current) {
    // A no-op edit changes nothing; treat as invalid to keep the diff list meaningful.
    return { ok: false, code: 'EDIT_INVALID', row: edit.row, col: edit.col };
  }

  return { ok: true };
}

/**
 * Folds an ordered diff list over the original records, producing a new
 * effective table. Originals are never mutated.
 *
 * Every edit is validated against the running effective value; the first
 * failure fails closed.
 */
export function applyEdits(
  originalRecords: readonly (readonly string[])[],
  edits: readonly CellEdit[],
): { ok: true; effective: string[][] } | { ok: false; failure: EditValidationFailure } {
  // Start from a defensive deep copy so even the fold result is independent.
  const effective: string[][] = originalRecords.map((row) => [...row]);

  for (const edit of edits) {
    const validation = validateEditProposal(effective, edit);
    if (!validation.ok) {
      return { ok: false, failure: validation };
    }
    effective[edit.row]![edit.col] = edit.proposed;
  }

  return { ok: true, effective };
}

/** Builds a fresh record reference, never reusing the original arrays. */
export function copyRecords(
  records: readonly (readonly string[])[],
): string[][] {
  return records.map((row) => [...row]);
}

// ---------------------------------------------------------------------------
// Bounded undo/redo transaction history (pure functions)
// ---------------------------------------------------------------------------

export interface RepairHistory {
  /** Confirmed transactions, oldest first. */
  approved: EditTransaction[];
  /** Undone transactions, most recently undone first. */
  redo: EditTransaction[];
}

export function createRepairHistory(): RepairHistory {
  return { approved: [], redo: [] };
}

/**
 * Pushes a newly confirmed transaction; clears the redo stack (standard
 * semantics). Refuses to push when the bounded history is full — see
 * `isHistoryFull` (docs/04 §1a-7 fail-closed bounding).
 */
export function pushTransaction(
  history: RepairHistory,
  edits: readonly CellEdit[],
): RepairHistory {
  if (edits.length === 0) return history;
  if (isHistoryFull(history)) return history;
  return { approved: [...history.approved, { edits: [...edits] }], redo: [] };
}

/** Undoes the latest transaction (if any) by moving it to the redo stack. */
export function undoTransaction(history: RepairHistory): RepairHistory {
  if (history.approved.length === 0) return history;
  const approved = history.approved.slice(0, -1);
  const last = history.approved[history.approved.length - 1]!;
  return { approved, redo: [last, ...history.redo] };
}

/** Re-applies the most recently undone transaction (if any). */
export function redoTransaction(history: RepairHistory): RepairHistory {
  if (history.redo.length === 0) return history;
  const [first, ...rest] = history.redo;
  return { approved: [...history.approved, first!], redo: rest };
}

/** All approved edits in confirmation order (the full desired diff list). */
export function flattenApproved(history: RepairHistory): CellEdit[] {
  const out: CellEdit[] = [];
  for (const tx of history.approved) {
    for (const edit of tx.edits) {
      out.push(edit);
    }
  }
  return out;
}

/**
 * Convenience: builds the effective table for a given history state.
 * Fails closed if any approved edit no longer matches (stale history).
 */
export function buildEffectiveTable(
  originalRecords: readonly (readonly string[])[],
  history: RepairHistory,
): { ok: true; effective: string[][] } | { ok: false; failure: EditValidationFailure } {
  return applyEdits(originalRecords, flattenApproved(history));
}
