# Nassaq — Data Integrity and XLSX Validation

**Version:** 1.0 · **This is the authoritative specification for what “safe” means.**

## 1. Invariants (must never be relaxed silently)

1. Each accepted CSV field has an **approved decoded source string**. No default implicit trimming, Unicode normalization, formatting, localization, or conversion occurs.
2. Every approved `Text` cell becomes an XLSX **string cell**, regardless of how numeric/date/formula-like its content looks.
3. Every explicitly approved `Number` cell must satisfy the strict *entire-column* numeric gate. No unsafe numeric representation is accepted, and no column is partially converted.
4. Every source record is represented by one destination record; the header, when selected, occupies the first row and is always literal text.
5. No untrusted input may become an Excel formula (`f` property), hyperlink, macro, workbook relationship or external link.
6. The generated workbook is **reopened and checked** for the expected cells and types before download. A failed check prevents delivery.
7. “Preserved” means the chosen string values and supported cell types are identical after our own XLSX read-back. This cannot guarantee display formatting in every spreadsheet program, or recover already-damaged upstream CSV bytes.

## 2. Canonical data model and mapping

**Raw input:** immutable bytes held in worker during job.  
**Decoded input:** Unicode string selected by explicit encoding decision.  
**Parsed table:** position-preserving `string[][]` of records/columns.  
**Approved export:** type policy + every original string; number values constructed only after gate.  
**Workbook:** one worksheet named `Data`, rows in original order and columns in original order.

A CSV with header row maps CSV row `r` to Excel row `r`, preserving positions. A CSV without header row also maps record 1 → Excel row 1. The `firstRowIsHeader` toggle only changes which record is labeled header in UI and whether first row is excluded from data-row cap; it does not remove or rename it.

**Important empty-cell rule:** an empty CSV field is a valid empty string, distinct from `undefined` / a missing column (which is a structural blocker). Explicitly write `""` as a text value in ExcelJS. On read-back, if the XLSX library normalizes empty strings to blank cells, the browser spike must verify whether exact distinction is round-trip observable; if not, reject the selected library or clearly adjust the technical claim **before implementing**. Do not silently equate `""` with a missing CSV field. An empty string remains acceptable for a column selected as Number; it remains a text empty cell and does not get converted to 0.

## 3. Column export types

### Text — default, safe choice

- Every CSV column starts as `Text`, including header labels.
- Write `cell.value = originalString` (string) with text number format (`@`) if needed for clarity. **Do not** prefix `'` or escape formula characters with extra characters; that would modify the value. No formula object shape is permitted.
- Leading zeros, long digit sequences, phone-like values, product codes, Arabic-Indic digits, literal `=`, `+`, `-`, `@` beginnings, whitespace and newlines stay exact strings.
- A string that looks like a number remains a string. Excel display may show text indicators; this is intentional.

### Number — user-opt-in and strict

Number mode is allowed only if **every nonempty data cell in the selected column** meets all conditions:

- ASCII-only canonical decimal grammar: `^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$` (no leading `+`, group separators, exponent, whitespace, Arabic-Indic digits, leading-zero integers, date-like patterns). Empty strings remain text.
- No integers outside `Number.isSafeInteger` when the token is an integer.
- At most **15 significant decimal digits** (count from first nonzero decimal digit; for all-zero input, zero counts as one). Any `0.0000000000000001` with one nonzero digit is still subject to canonical round-trip rules below.
- `Number.isFinite(Number(token))` is true; `String(Number(token)) === token` must hold for each nonempty cell (guards lexical losses such as `1.00`, `-0`, or `0.0000001` becoming scientific notation). This rule is intentionally conservative and may reject plausible numbers.
- Reject if a token is an identifier-risk shape even if syntactically valid and user selected Number: integer digit run ≥16; optional allow only in a future expert mode after explicit product decision. Preserve those as Text in MVP.
- For accepted Number cells, write the numeric `Number(token)` with a numeric cell type; verify `typeof loadedCell.value === 'number'` and `Object.is(loadedCell.value, Number(token))`, while also retaining original approved token for audit/mismatch messages. **IEEE-754 numbers are binary floats; decimal precision beyond our conservative gate cannot be promised.**

**Column behavior:** If any value fails, list up to five first offending **positions, not full content** and keep column in Text. User can revert; no per-cell overrides in MVP. Date type is **not available**: `2026-01-02`, `01/02/26`, `03-04` stay text. All whitespace-padded digits remain text unless an explicit later feature documents safe transforms.

**Potential issue for the gate:** `String(Number('0.10')) !== '0.10'`, so it blocks numeric mode. This is intentional: the user may retain text or edit upstream. The tool is not a data cleaner.

## 4. Exactness matrix

| CSV decoded field | Default `Text` XLSX | `Number` mode result |
|---|---|---|
| `00123` | `"00123"` string | Blocked (leading zero) |
| `12345678901234567890` | Same string | Blocked (precision/length) |
| `0123456789` | Same string | Blocked |
| `٠١٢٣` | Same string | Blocked (non-ASCII grammar) |
| `03-04` | Same string | Blocked (not decimal grammar) |
| `1/2/26` | Same string | Blocked |
| `2.50` | Same string | Blocked (lexical representation changes) |
| `2.5` | Same string | `2.5` numeric |
| `-17` | Same string | `-17` numeric |
| `0.1` | Same string | `0.1` numeric; no claim of perfect decimal arithmetic |
| `=SUM(A1:A2)` | Exact literal string | Blocked |
| `+1` | Exact literal string | Blocked |
| `@username` | Exact literal string | Blocked |
| `  أحمد  ` | Exact literal string | Blocked |
| empty `""` | empty literal text cell | empty literal text cell |
| newline inside quotes | exact embedded newline string | Blocked |

**Excel limitations:** Maximum cell string length is 32,767 UTF-16 code units. Reject longer values with source record/cell position rather than truncate. Excel has sheet row/column limits much larger than MVP caps. Do not use user file name as worksheet title; use constant `Data`.

## 5. Risk detection vs transformation

Risk scanner runs **after decoding and parsing**, before export. It may flag:

- Prefix zero on decimal-looking Western/Arabic-Indic digit strings; also when `+`/country prefix suggests phone-like data.
- An all-ASCII digit sequence longer than 15 characters.
- Date-shaped tokens (examples `03-04`, `01/02/2026`), scientific notation (`1e12`), decimal separator ambiguity (`1,25` when quoted or under another delimiter).
- Formula-like input whose first character is `=`, `+`, `-`, `@`, or begins with whitespace/control characters followed by one of those symbols. Classification accounts for `\t`, `\r`, `\n` and other invisible prefixes; classification cannot establish that input is harmless.
- Mixed-direction text: informational only.

**Scanner output is explanatory only** for text columns; never mutate values or prohibit safe text export merely because the source looks dangerous. Protection is achieved by XLSX **cell typing**, not by skipping warnings.

## 6. XLSX creation rules

- Create one workbook with exactly one `Data` sheet.
- Write every row and field by index (1-based API) and preserve blank and duplicate headers.
- Text uses ExcelJS literal string values, no formula object (`{ formula: ... }`) and no `cell.hyperlink`/rich text objects derived from source.
- Treat all formulas as literal text **including** `=1+1`, `+SUM(1,2)`, `-1+2`, `@SUM(1,2)`, and whitespace/control-prefixed formula-like strings.
- Export does not autoformat numbers, dates, text content or the workbook with conditional formulas.
- Sheet style, if any, may set header bold/RTL sheet view only if it does not affect data values or correctness. RTL worksheet view is optional; mixed-direction data must remain untouched.
- Generated workbook contains no external connections, volatile formulas, macros, web links or inserted rich content.

## 7. Mandatory verification algorithm

1. Complete XLSX buffer creation successfully; **do not** offer it for download yet.
2. Re-open buffer using the browser-capable XLSX reader **within the worker**. Fail closed on any error.
3. Verify workbook has **one sheet** named `Data`, expected row/column bounds and no unexpected populated cells outside the intended rectangle. Note that library row and cell collections can omit blank values, so compare via indexed positions rather than relying solely on `actualRowCount`.
4. For each source row `r` and column `c`, compute expected cell type and value from the approved policy. Verify:
   - Text: `typeof loaded.value === 'string'` and `loaded.value === originalDecodedString` (including U+200F, whitespace, Arabic-Indic digits, zero-length value).
   - Number: primitive `number` and `Object.is(loaded.value, expectedNumber)`.
   - Empty: exact interpretation as specified in §2; never accept a missing row/column when a source field exists.
5. Fail if any cell has formula properties, external links or unexpected hyperlink types; inspect cell models and relevant workbook structures within library capability. The generator never constructs such elements; package/XML inspection is a useful supplemental release test.
6. Verify generated XLSX ZIP integrity/readability and reject malformed output.
7. Only then return `READY` and bytes. Manifest reports total source rows, data rows, columns, string cells, number cells, warning counts, verification success. On first mismatch, return `VERIFY_FAILED` with coordinates and generic reason; no sensitive content in logs.

**Verification boundary:** Read-back with the *same* library may share bugs with generation. Independently inspect workbook XML and open in real Excel/LibreOffice during release QA. This is a testable safety improvement, not a cryptographic guarantee of interoperability.

## 8. Round-trip examples

```text
Source CSV record: ["أحمد", "001234", "12345678901234567890", "03-04", "=1+1"]
Approved export types: [Text, Text, Text, Text, Text]
Loaded XLSX row: ["أحمد", "001234", "12345678901234567890", "03-04", "=1+1"]
Expected types: [string, string, string, string, string]
Expected formula objects: 0
```

```text
Source CSV records: ["Item", "Qty"], ["A", "3"], ["B", "2.5"]
Header mode: first record is header
Column 1: Text; column 2: Number
Excel header row remains ["Item", "Qty"] strings
Excel data rows: ["A", 3], ["B", 2.5]
Reject if later input has `02`, `2.00`, `١`, `3,5`, `1e3` or unsafe long integer.
```

## 9. When exactness cannot be guaranteed

- Original file was already lossy or wrongly transcoded upstream.
- User chooses the wrong single-byte encoding but confirms readable-looking output.
- Spreadsheet application applies its own visual formatting or changes file upon re-saving.
- A user explicitly converts a column to Number (numeric model differs from original string semantics even when safe by our narrow rules).
- Workbook reader/writer library has a shared defect; independent QA reduces but cannot eliminate the risk.

**Blocking response:** any demonstrated mismatch, unconfirmed ambiguous source, structural problem, unsupported representational edge or untested writer behavior must block release or export. Integrity requirements outrank release timing.
