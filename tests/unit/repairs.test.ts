/**
 * Unit tests for the repair diff model (docs/07 §4 `repairs` row).
 *
 * Guarantees (docs/04 §1a):
 *  - apply/revert purity: originalRecords are never mutated; effective tables
 *    are new arrays.
 *  - Stale-original diffs fail closed with EDIT_CONFLICT.
 *  - Out-of-bounds / over-cap / no-op proposals fail with EDIT_INVALID.
 *  - Undo/redo consistency: the effective table is always rebuilt from
 *    originals + the remaining approved diffs, in confirmation order.
 *  - History is bounded (MAX_HISTORY_TRANSACTIONS) and redo clears on push.
 */

import { describe, it, expect } from 'vitest';
import {
  applyEdits,
  validateEditProposal,
  buildEffectiveTable,
  createRepairHistory,
  pushTransaction,
  undoTransaction,
  redoTransaction,
  flattenApproved,
  MAX_HISTORY_TRANSACTIONS,
  type CellEdit,
} from '@/domain/repairs';

function edit(
  row: number,
  col: number,
  original: string,
  proposed: string,
  source: CellEdit['source'] = 'suggestion',
): CellEdit {
  return { row, col, original, proposed, source };
}

describe('repairs: applyEdits purity and fail-closed validation', () => {
  const original = [
    ['name', 'code'],
    ['أحمد', '00073'],
    ['  سارة  ', '03-04'],
  ];

  it('applies diffs without mutating the original table', () => {
    const snapshot = JSON.parse(JSON.stringify(original));
    const result = applyEdits(original, [edit(1, 1, '00073', '73')]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effective[1]![1]).toBe('73');
    expect(result.effective[1]![0]).toBe('أحمد');
    // Originals remain byte-identical
    expect(original).toEqual(snapshot);
    // And are not the same array references
    expect(result.effective).not.toBe(original);
    expect(result.effective[0]).not.toBe(original[0]);
  });

  it('rejects a stale diff whose original no longer matches (EDIT_CONFLICT)', () => {
    const result = applyEdits(original, [edit(1, 1, 'WRONG', '73')]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toMatchObject({
      ok: false,
      code: 'EDIT_CONFLICT',
      row: 1,
      col: 1,
    });
  });

  it('rejects a diff applied to an earlier value, not the running effective one', () => {
    // Second edit must match the FIRST edit's proposed value (sequential fold).
    const result = applyEdits(original, [
      edit(1, 1, '00073', '73'),
      edit(1, 1, '00073', '74'),
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('EDIT_CONFLICT');
  });

  it('allows sequential edits to the same cell when originals chain correctly', () => {
    const result = applyEdits(original, [
      edit(1, 1, '00073', '73'),
      edit(1, 1, '73', '74'),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effective[1]![1]).toBe('74');
  });

  it('rejects out-of-bounds coordinates with EDIT_INVALID', () => {
    const negative = applyEdits(original, [edit(-1, 0, 'name', 'x')]);
    expect(negative.ok).toBe(false);
    if (!negative.ok) expect(negative.failure.code).toBe('EDIT_INVALID');

    const pastRows = applyEdits(original, [edit(99, 0, 'name', 'x')]);
    expect(pastRows.ok).toBe(false);
    if (!pastRows.ok) expect(pastRows.failure.code).toBe('EDIT_INVALID');

    const pastCols = applyEdits(original, [edit(1, 9, '00073', 'x')]);
    expect(pastCols.ok).toBe(false);
    if (!pastCols.ok) expect(pastCols.failure.code).toBe('EDIT_INVALID');
  });

  it('rejects proposals exceeding the 32,767 UTF-16 unit cap with EDIT_INVALID', () => {
    const tooLong = 'x'.repeat(32_768);
    const result = applyEdits(original, [edit(1, 0, 'أحمد', tooLong)]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.code).toBe('EDIT_INVALID');
  });

  it('accepts a proposal at exactly 32,767 UTF-16 units', () => {
    const maxLen = 'x'.repeat(32_767);
    const result = applyEdits(original, [edit(1, 0, 'أحمد', maxLen)]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.effective[1]![0]).toHaveLength(32_767);
  });

  it('rejects a no-op proposal (proposed equals current effective value)', () => {
    const result = applyEdits(original, [edit(1, 0, 'أحمد', 'أحمد')]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.code).toBe('EDIT_INVALID');
  });

  it('preserves formula-like proposals as plain values (no interpretation here)', () => {
    const result = applyEdits(original, [edit(2, 1, '03-04', '=SUM(A1:A2)')]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effective[2]![1]).toBe('=SUM(A1:A2)');
  });
});

describe('repairs: validateEditProposal (single-diff gate)', () => {
  const records = [['a'], ['b']];

  it('accepts a valid diff', () => {
    expect(validateEditProposal(records, edit(1, 0, 'b', 'c'))).toEqual({ ok: true });
  });

  it('rejects mismatched original as EDIT_CONFLICT', () => {
    const v = validateEditProposal(records, edit(1, 0, 'zzz', 'c'));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.code).toBe('EDIT_CONFLICT');
  });
});

describe('repairs: bounded undo/redo history consistency', () => {
  const original = [
    ['h1', 'h2'],
    ['a', 'b'],
    ['c', 'd'],
  ];

  it('undo restores the effective table to the pre-transaction state', () => {
    let h = createRepairHistory();
    h = pushTransaction(h, [edit(1, 0, 'a', 'A')]);
    h = pushTransaction(h, [edit(2, 1, 'd', 'D')]);

    let built = buildEffectiveTable(original, h);
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.effective[1]![0]).toBe('A');
      expect(built.effective[2]![1]).toBe('D');
    }

    h = undoTransaction(h);
    built = buildEffectiveTable(original, h);
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.effective[1]![0]).toBe('A');
      expect(built.effective[2]![1]).toBe('d');
    }

    h = undoTransaction(h);
    built = buildEffectiveTable(original, h);
    expect(built.ok).toBe(true);
    if (built.ok) expect(built.effective).toEqual(original);
  });

  it('redo re-applies the most recently undone transaction', () => {
    let h = createRepairHistory();
    h = pushTransaction(h, [edit(1, 0, 'a', 'A')]);
    h = pushTransaction(h, [edit(1, 1, 'b', 'B')]);

    h = undoTransaction(h);
    h = redoTransaction(h);

    const built = buildEffectiveTable(original, h);
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.effective[1]![0]).toBe('A');
      expect(built.effective[1]![1]).toBe('B');
    }
    expect(flattenApproved(h)).toHaveLength(2);
  });

  it('pushing a new transaction clears the redo stack', () => {
    let h = createRepairHistory();
    h = pushTransaction(h, [edit(1, 0, 'a', 'A')]);
    h = undoTransaction(h);
    expect(h.redo).toHaveLength(1);

    h = pushTransaction(h, [edit(2, 0, 'c', 'C')]);
    expect(h.redo).toHaveLength(0);
    expect(flattenApproved(h)).toEqual([edit(2, 0, 'c', 'C')]);
  });

  it('undo/redo on an empty history is a no-op', () => {
    const h = createRepairHistory();
    expect(undoTransaction(h)).toBe(h);
    expect(redoTransaction(h)).toBe(h);
  });

  it('refuses to exceed the transaction cap (fail-closed, no silent truncation)', () => {
    let h = createRepairHistory();
    // Chained edits: each transaction builds on the previous proposed value,
    // so the retained history must stay contiguous for syncs to validate.
    h = pushTransaction(h, [edit(1, 0, 'a', 'v0')]);
    for (let i = 0; i < MAX_HISTORY_TRANSACTIONS - 1; i++) {
      h = pushTransaction(h, [edit(1, 0, `v${i}`, `v${i + 1}`)]);
    }
    expect(h.approved).toHaveLength(MAX_HISTORY_TRANSACTIONS);

    // At cap: a new transaction is refused (fail-closed) instead of dropping
    // the oldest link, which would break the chain on the next sync.
    const snapshot = JSON.parse(JSON.stringify(h));
    h = pushTransaction(h, [edit(1, 0, `v${MAX_HISTORY_TRANSACTIONS - 1}`, 'final')]);
    expect(h.approved).toHaveLength(MAX_HISTORY_TRANSACTIONS);
    expect(h).toEqual(snapshot);

    // Undo frees space; pushing works again and clears the redo stack.
    h = undoTransaction(h);
    h = pushTransaction(h, [edit(1, 0, `v${MAX_HISTORY_TRANSACTIONS - 2}`, 'final')]);
    expect(h.approved).toHaveLength(MAX_HISTORY_TRANSACTIONS);
    expect(h.redo).toHaveLength(0);

    // The retained chain still folds to a consistent effective table.
    const built = buildEffectiveTable(original, h);
    expect(built.ok).toBe(true);
    if (built.ok) expect(built.effective[1]![0]).toBe('final');
  });

  it('ignores empty transactions', () => {
    const h = createRepairHistory();
    expect(pushTransaction(h, [])).toBe(h);
  });
});
