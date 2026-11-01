/**
 * Suggestion engine for Nassaq (Phase 6).
 *
 * Specification: docs/04_DATA_INTEGRITY_AND_VALIDATION.md §5a
 *
 * Invariants enforced by this module:
 *  - Suggestions are optional proposals derived purely from the cell's own
 *    value; no information is invented and no external knowledge is used.
 *  - `safe` = mechanical and lossless (bijective transform or canonical
 *    equivalence); `ambiguous` = requires user judgment (may lose characters
 *    or change meaning). Classification is fixed per catalog entry.
 *  - Risk classes without a mechanical, judgment-free fix (LEADING_ZERO,
 *    LONG_NUMBER, DATE_SHAPED, FORMULA_LIKE, MIXED_DIRECTION) produce **no**
 *    proposal: they are already safe as literal text.
 *  - Suggestions never apply themselves; they are passive data for the UI.
 */

import { MAX_CELL_UTF16, utf16Length } from './limits';

export type SuggestionKind =
  | 'TRIM_SURROUNDING_WHITESPACE'
  | 'ARABIC_INDIC_TO_ASCII_DIGITS'
  | 'NFC_NORMALIZE'
  | 'DECIMAL_COMMA_TO_DOT'
  | 'SCIENTIFIC_TO_DECIMAL';

export type SuggestionClassification = 'safe' | 'ambiguous';

export interface SuggestionItem {
  /** Stable identity: `${row}:${col}:${kind}`. */
  id: string;
  /** 0-based record index. */
  row: number;
  /** 0-based column index. */
  col: number;
  kind: SuggestionKind;
  classification: SuggestionClassification;
  original: string;
  proposed: string;
}

export interface SuggestionSet {
  /** Bounded list of the first suggestions in scan order. */
  items: SuggestionItem[];
  /** Total suggestions across the whole effective table (may exceed list). */
  total: number;
}

export const SUGGESTION_LIST_LIMIT = 50;

/** Maximum exponent magnitude considered for exact scientific expansion. */
const MAX_EXPANSION_EXPONENT = 400;

const DECIMAL_COMMA = /^-?\d+,\d+$/;
const SCIENTIFIC = /^-?\d+(?:\.\d+)?[eE][+-]?\d+$/;
const SURROUNDING_WHITESPACE = /^\s|\s$/;
const PLAIN_DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;

const ARABIC_INDIC_DIGITS = /[\u0660-\u0669]/;

function mapArabicIndicToAscii(value: string): string {
  return value.replace(/[\u0660-\u0669]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x0660 + 0x30),
  );
}

/**
 * Expands a scientific-notation token into its exact plain decimal spelling.
 * Returns null when the token is not exactly expandable within resource bounds.
 */
export function expandScientific(token: string): string | null {
  const m = /^(-?)([0-9]+)(?:\.([0-9]+))?[eE]([+-]?[0-9]+)$/.exec(token);
  if (!m) return null;

  const sign = m[1] ?? '';
  const intPart = m[2] ?? '';
  const fracPart = m[3] ?? '';
  const exp = Number(m[4]);
  if (!Number.isInteger(exp) || Math.abs(exp) > MAX_EXPANSION_EXPONENT) {
    return null;
  }

  const digits = intPart + fracPart;
  // All-zero values gain nothing from expansion; skip rather than propose "-0".
  if (!/[1-9]/.test(digits)) return null;

  const pointPos = intPart.length + exp;
  let out: string;
  if (pointPos <= 0) {
    out = '0.' + '0'.repeat(-pointPos) + digits;
  } else if (pointPos >= digits.length) {
    out = digits + '0'.repeat(pointPos - digits.length);
  } else {
    out = digits.slice(0, pointPos) + '.' + digits.slice(pointPos);
  }

  // Normalize the plain decimal spelling without changing its value.
  if (out.includes('.')) {
    out = out.replace(/0+$/, '');
    out = out.replace(/\.$/, '');
  }
  const negative = sign === '-';
  const [rawInt, rawFrac] = out.split('.');
  let intDigits = (rawInt ?? '').replace(/^0+(?=[0-9])/, '');
  if (intDigits === '') intDigits = '0';
  const fracClean = rawFrac ?? '';

  let candidate = fracClean !== '' ? `${intDigits}.${fracClean}` : intDigits;
  if (negative && candidate !== '0') candidate = `-${candidate}`;

  if (!PLAIN_DECIMAL.test(candidate)) return null;
  return candidate;
}

interface RawProposal {
  kind: SuggestionKind;
  classification: SuggestionClassification;
  proposed: string;
}

/**
 * Computes all catalog proposals for a single cell value.
 * Pure; every proposal is derivable from `value` alone.
 */
export function proposeForValue(value: string): RawProposal[] {
  if (value === '') return [];

  const proposals: RawProposal[] = [];

  // 1. Surrounding whitespace — ambiguous: loses characters, irreversible.
  if (SURROUNDING_WHITESPACE.test(value)) {
    const trimmed = value.trim();
    if (trimmed !== '' && trimmed !== value) {
      proposals.push({
        kind: 'TRIM_SURROUNDING_WHITESPACE',
        classification: 'ambiguous',
        proposed: trimmed,
      });
    }
  }

  // 2. Arabic-Indic → ASCII digits — safe: bijective mechanical mapping.
  if (ARABIC_INDIC_DIGITS.test(value)) {
    const mapped = mapArabicIndicToAscii(value);
    if (mapped !== value) {
      proposals.push({
        kind: 'ARABIC_INDIC_TO_ASCII_DIGITS',
        classification: 'safe',
        proposed: mapped,
      });
    }
  }

  // 3. NFC normalization — safe: canonical equivalence, no information loss.
  const nfc = value.normalize('NFC');
  if (nfc !== value) {
    proposals.push({
      kind: 'NFC_NORMALIZE',
      classification: 'safe',
      proposed: nfc,
    });
  }

  // 4. Decimal comma → dot — ambiguous: could be a thousands separator.
  if (DECIMAL_COMMA.test(value)) {
    const dotted = value.replace(',', '.');
    if (dotted !== value) {
      proposals.push({
        kind: 'DECIMAL_COMMA_TO_DOT',
        classification: 'ambiguous',
        proposed: dotted,
      });
    }
  }

  // 5. Scientific notation expansion — ambiguous: representation judgment.
  if (SCIENTIFIC.test(value)) {
    const expanded = expandScientific(value);
    if (
      expanded !== null &&
      expanded !== value &&
      utf16Length(expanded) <= MAX_CELL_UTF16
    ) {
      proposals.push({
        kind: 'SCIENTIFIC_TO_DECIMAL',
        classification: 'ambiguous',
        proposed: expanded,
      });
    }
  }

  return proposals;
}

/**
 * Generates the bounded suggestion set over the effective table.
 * The header row (if any) is never scanned; suggestions target data cells.
 */
export function generateSuggestions(
  records: readonly (readonly string[])[],
  firstRowIsHeader: boolean,
  limit: number = SUGGESTION_LIST_LIMIT,
): SuggestionSet {
  const items: SuggestionItem[] = [];
  let total = 0;
  const startRow = firstRowIsHeader ? 1 : 0;

  for (let r = startRow; r < records.length; r++) {
    const row = records[r];
    if (!row) continue;

    for (let c = 0; c < row.length; c++) {
      const value = row[c] ?? '';
      const proposals = proposeForValue(value);
      for (const p of proposals) {
        if (items.length < limit) {
          items.push({
            id: `${r}:${c}:${p.kind}`,
            row: r,
            col: c,
            kind: p.kind,
            classification: p.classification,
            original: value,
            proposed: p.proposed,
          });
        }
        total++;
      }
    }
  }

  return { items, total };
}
