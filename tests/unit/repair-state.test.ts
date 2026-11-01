/**
 * Unit tests for the app-level repair state transitions (docs/07 §4).
 *
 * Phase 6 follow-up regressions:
 *  - confirmSingleEdit applies ONLY the manually confirmed edit as its own
 *    transaction; unrelated staged suggestions stay pending (docs/04 §1a-3).
 *  - rejectSuggestion withdraws a staged diff derived from that suggestion
 *    while leaving manually staged edits untouched.
 *  - Staging/unstaging never touches confirmed history; undo/redo reorder
 *    confirmed transactions only.
 */

import { describe, it, expect } from 'vitest';
import {
  createRepairState,
  stageEdit,
  stageSuggestion,
  unstageCell,
  clearStaged,
  confirmStaged,
  confirmSingleEdit,
  rejectSuggestion,
  undo,
  redo,
  approvedEdits,
  confirmedCount,
  stagedCount,
  historyFull,
} from '@/app/repair-state';
import { MAX_HISTORY_TRANSACTIONS, type CellEdit } from '@/domain/repairs';
import type { SuggestionItem } from '@/domain/suggestions';

function manualEdit(
  row: number,
  col: number,
  original: string,
  proposed: string,
): CellEdit {
  return { row, col, original, proposed, source: 'manual' };
}

function suggestion(
  row: number,
  col: number,
  original: string,
  proposed: string,
): SuggestionItem {
  return {
    id: `${row}:${col}:TRIM_SURROUNDING_WHITESPACE`,
    row,
    col,
    kind: 'TRIM_SURROUNDING_WHITESPACE',
    classification: 'ambiguous',
    original,
    proposed,
  };
}

describe('repairState: confirmSingleEdit isolation', () => {
  it('confirms only the manual edit and leaves staged suggestions pending', () => {
    let state = createRepairState();
    state = stageSuggestion(state, suggestion(1, 1, '  00073  ', '00073'));

    const edited = confirmSingleEdit(
      state,
      manualEdit(1, 2, 'padded', 'note'),
    );

    // The manual edit became its own transaction...
    expect(confirmedCount(edited)).toBe(1);
    expect(approvedEdits(edited)).toEqual([
      { row: 1, col: 2, original: 'padded', proposed: 'note', source: 'manual' },
    ]);
    // ...while the staged suggestion stays untouched and pending.
    expect(stagedCount(edited)).toBe(1);
    expect(Object.values(edited.staged)[0]?.row).toBe(1);
    expect(Object.values(edited.staged)[0]?.col).toBe(1);
  });

  it('refuses (fail-closed) when the bounded history is full', () => {
    let state = createRepairState();
    for (let i = 0; i < MAX_HISTORY_TRANSACTIONS; i++) {
      state = confirmSingleEdit(state, manualEdit(0, 0, 'a', `a${i}`));
    }
    expect(historyFull(state)).toBe(true);

    const refused = confirmSingleEdit(state, manualEdit(0, 0, 'a0', 'b'));
    expect(refused).toBe(state);
    expect(confirmedCount(refused)).toBe(MAX_HISTORY_TRANSACTIONS);
  });
});

describe('repairState: rejectSuggestion withdraws staged diffs', () => {
  it('removes the staged diff derived from the rejected suggestion', () => {
    let state = createRepairState();
    const s = suggestion(1, 1, '  00073  ', '00073');
    state = stageSuggestion(state, s);
    expect(stagedCount(state)).toBe(1);

    const rejected = rejectSuggestion(state, s.id);
    expect(stagedCount(rejected)).toBe(0);
    expect(rejected.rejected.has(s.id)).toBe(true);
    // Rejecting never changes confirmed history.
    expect(confirmedCount(rejected)).toBe(0);
  });

  it('leaves a manually staged edit at the same cell untouched', () => {
    let state = createRepairState();
    state = stageEdit(state, manualEdit(1, 1, '  00073  ', '73'));
    const s = suggestion(1, 1, '  00073  ', '00073');

    const rejected = rejectSuggestion(state, s.id);
    expect(stagedCount(rejected)).toBe(1);
    expect(Object.values(rejected.staged)[0]?.source).toBe('manual');
  });

  it('rejecting an unstaged suggestion changes nothing but the rejected set', () => {
    const state = createRepairState();
    const s = suggestion(2, 0, '  x  ', 'x');

    const rejected = rejectSuggestion(state, s.id);
    expect(rejected.rejected.has(s.id)).toBe(true);
    expect(stagedCount(rejected)).toBe(0);
    expect(rejected.history).toBe(state.history);
  });
});

describe('repairState: staging never mutates confirmed history', () => {
  it('undo/redo operate only on confirmed transactions', () => {
    let state = createRepairState();
    state = stageSuggestion(state, suggestion(1, 1, '  a  ', 'a'));
    const bulk = confirmStaged(state);
    expect(confirmedCount(bulk)).toBe(1);
    expect(stagedCount(bulk)).toBe(0);

    const undone = undo(bulk);
    expect(confirmedCount(undone)).toBe(0);
    expect(approvedEdits(undone)).toEqual([]);

    const redone = redo(undone);
    expect(confirmedCount(redone)).toBe(1);
    expect(approvedEdits(redone)).toHaveLength(1);
  });

  it('unstageCell and clearStaged only affect the staging area', () => {
    let state = createRepairState();
    state = stageSuggestion(state, suggestion(1, 1, '  a  ', 'a'));
    state = stageSuggestion(state, suggestion(1, 2, '  b  ', 'b'));

    const unstaged = unstageCell(state, 1, 1);
    expect(stagedCount(unstaged)).toBe(1);

    const cleared = clearStaged(unstaged);
    expect(stagedCount(cleared)).toBe(0);
    expect(confirmedCount(cleared)).toBe(0);
  });

  it('confirmStaged refuses when the history is full (no silent truncation)', () => {
    let state = createRepairState();
    for (let i = 0; i < MAX_HISTORY_TRANSACTIONS; i++) {
      state = confirmSingleEdit(state, manualEdit(0, 0, 'a', `a${i}`));
    }
    state = stageSuggestion(state, suggestion(1, 1, '  a  ', 'a'));

    const refused = confirmStaged(state);
    expect(refused).toBe(state);
    expect(stagedCount(refused)).toBe(1);
  });
});
