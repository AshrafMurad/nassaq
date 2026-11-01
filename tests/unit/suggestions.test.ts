/**
 * Unit tests for the suggestion engine (docs/07 §4 `suggestions` row).
 *
 * Guarantees (docs/04 §5a):
 *  - Classification is fixed per catalog: NFC + Arabic-Indic digit mapping
 *    are `safe`; trimming, decimal-comma rewrite and scientific expansion
 *    are `ambiguous`.
 *  - No invented data: every proposal is derivable from the cell value alone.
 *  - No proposals for LEADING_ZERO / LONG_NUMBER / DATE_SHAPED /
 *    FORMULA_LIKE / MIXED_DIRECTION-only values (already safe as text).
 *  - The list is bounded (50 items) while `total` reports the real count.
 *  - Header rows are never scanned.
 */

import { describe, it, expect } from 'vitest';
import {
  proposeForValue,
  generateSuggestions,
  SUGGESTION_LIST_LIMIT,
} from '@/domain/suggestions';

describe('suggestions: proposeForValue classification', () => {
  it('proposes surrounding-whitespace trim as ambiguous', () => {
    const p = proposeForValue('  نص  ');
    expect(p).toContainEqual({
      kind: 'TRIM_SURROUNDING_WHITESPACE',
      classification: 'ambiguous',
      proposed: 'نص',
    });
  });

  it('proposes Arabic-Indic → ASCII digit mapping as safe (bijective)', () => {
    const p = proposeForValue('٠٠١٢٣');
    expect(p).toContainEqual({
      kind: 'ARABIC_INDIC_TO_ASCII_DIGITS',
      classification: 'safe',
      proposed: '00123',
    });
  });

  it('maps only Arabic-Indic digits and leaves other characters intact', () => {
    const p = proposeForValue('لهاتف ٠٥٥٥');
    const digit = p.find((x) => x.kind === 'ARABIC_INDIC_TO_ASCII_DIGITS');
    expect(digit?.proposed).toBe('لهاتف 0555');
  });

  it('proposes NFC normalization as safe (canonical equivalence)', () => {
    // Arabic alef + combining hamza above composes to U+0623 under NFC.
    const decomposed = '\u0627\u0654';
    const precomposed = '\u0623';
    expect(decomposed.normalize('NFC')).toBe(precomposed);
    const p = proposeForValue(decomposed);
    expect(p).toContainEqual({
      kind: 'NFC_NORMALIZE',
      classification: 'safe',
      proposed: precomposed,
    });

    // Latin pair too: e + combining acute → é.
    const latin = '\u0065\u0301';
    expect(proposeForValue(latin)).toContainEqual({
      kind: 'NFC_NORMALIZE',
      classification: 'safe',
      proposed: '\u00E9',
    });
  });

  it('proposes decimal comma → dot as ambiguous', () => {
    const p = proposeForValue('1,25');
    expect(p).toContainEqual({
      kind: 'DECIMAL_COMMA_TO_DOT',
      classification: 'ambiguous',
      proposed: '1.25',
    });
  });

  it('proposes exact scientific expansion as ambiguous', () => {
    expect(proposeForValue('1e3')).toContainEqual({
      kind: 'SCIENTIFIC_TO_DECIMAL',
      classification: 'ambiguous',
      proposed: '1000',
    });
    expect(proposeForValue('1.5e2')).toContainEqual({
      kind: 'SCIENTIFIC_TO_DECIMAL',
      classification: 'ambiguous',
      proposed: '150',
    });
    expect(proposeForValue('-2.5e-2')).toContainEqual({
      kind: 'SCIENTIFIC_TO_DECIMAL',
      classification: 'ambiguous',
      proposed: '-0.025',
    });
    expect(proposeForValue('1.230e1')).toContainEqual({
      kind: 'SCIENTIFIC_TO_DECIMAL',
      classification: 'ambiguous',
      proposed: '12.3',
    });
  });

  it('never proposes a value that loses information for safe kinds', () => {
    // Safe proposals must be reversible: digit mapping and NFC are bijective/
    // canonical; verify a round-trip restores the original.
    const value = '٠١٢٣';
    const p = proposeForValue(value).find(
      (x) => x.kind === 'ARABIC_INDIC_TO_ASCII_DIGITS',
    );
    expect(p).toBeDefined();
    const back = p!.proposed.replace(/[0-9]/g, (d) =>
      String.fromCharCode(d.charCodeAt(0) - 0x30 + 0x0660),
    );
    expect(back).toBe(value);
  });

  it('produces NO value-rewrite proposal for values that are safe as text (docs/04 §5a)', () => {
    const textSafe = [
      '00073', // LEADING_ZERO
      '+966555000111', // phone-like LEADING_ZERO
      '12345678901234567890', // LONG_NUMBER
      '03-04', // DATE_SHAPED
      '01/02/2026', // DATE_SHAPED
      '=1+1', // FORMULA_LIKE
      '+SUM(A1)', // FORMULA_LIKE
      '-1+2', // FORMULA_LIKE
      '@SUM(1,2)', // FORMULA_LIKE
    ];
    for (const v of textSafe) {
      expect(proposeForValue(v), `expected no proposals for ${JSON.stringify(v)}`)
        .toEqual([]);
    }
    // Control-prefixed formula-like input may offer ONLY the ambiguous trim
    // (tab/space at either end is documented surrounding whitespace); no
    // value-rewrite proposal may exist for it.
    const p = proposeForValue('\t=1+1');
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({
      kind: 'TRIM_SURROUNDING_WHITESPACE',
      classification: 'ambiguous',
      proposed: '=1+1',
    });
  });

  it('proposes nothing for empty cells or whitespace-only cells', () => {
    expect(proposeForValue('')).toEqual([]);
    expect(proposeForValue('   ')).toEqual([]);
  });

  it('stays within the 32,767 cap for pathological exponents (no proposal)', () => {
    // 1e40000 would expand beyond the cap; must not propose.
    const p = proposeForValue(`1e${40_000}`);
    expect(p).toEqual([]);
  });

  it('can emit multiple proposals for one cell, each independently classified', () => {
    const p = proposeForValue(' ٠١٢٣ ');
    const kinds = p.map((x) => x.kind).sort();
    expect(kinds).toEqual([
      'ARABIC_INDIC_TO_ASCII_DIGITS',
      'TRIM_SURROUNDING_WHITESPACE',
    ]);
  });
});

describe('suggestions: generateSuggestions over tables', () => {
  it('scans data rows only (header never scanned)', () => {
    const records = [
      ['  Header  ', 'col'],
      ['clean', 'clean'],
    ];
    const set = generateSuggestions(records, true);
    expect(set.total).toBe(0);
    expect(set.items).toEqual([]);
  });

  it('reports 0-based coordinates of flagged cells with stable ids', () => {
    const records = [
      ['col'],
      ['  padded  '],
      ['٠١٢'],
    ];
    const set = generateSuggestions(records, true);
    expect(set.total).toBe(2);
    const trim = set.items.find((i) => i.kind === 'TRIM_SURROUNDING_WHITESPACE');
    const digits = set.items.find((i) => i.kind === 'ARABIC_INDIC_TO_ASCII_DIGITS');
    expect(trim).toMatchObject({ row: 1, col: 0, original: '  padded  ', proposed: 'padded' });
    expect(digits).toMatchObject({ row: 2, col: 0, original: '٠١٢', proposed: '012' });
    expect(trim?.id).toBe('1:0:TRIM_SURROUNDING_WHITESPACE');
  });

  it('honors no-header mode by scanning row 0', () => {
    const records = [['  x  ']];
    const set = generateSuggestions(records, false);
    expect(set.total).toBe(1);
    expect(set.items[0]).toMatchObject({ row: 0, col: 0 });
  });

  it('bounds items at the list limit while reporting the true total', () => {
    const records: string[][] = [['col']];
    for (let i = 0; i < SUGGESTION_LIST_LIMIT + 7; i++) {
      records.push([`  v${i}  `]);
    }
    const set = generateSuggestions(records, true);
    expect(set.total).toBe(SUGGESTION_LIST_LIMIT + 7);
    expect(set.items).toHaveLength(SUGGESTION_LIST_LIMIT);
  });

  it('never mutates the input table', () => {
    const records = [['col'], ['  padded  ']];
    const snapshot = JSON.parse(JSON.stringify(records));
    generateSuggestions(records, true);
    expect(records).toEqual(snapshot);
  });
});
