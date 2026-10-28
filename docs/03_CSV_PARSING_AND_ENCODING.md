# Nassaq — CSV Parsing and Arabic Encoding

**Version:** 1.0 · **Critical invariant:** decoding/parsing must not silently alter or replace source field values.

## 1. Meaning of safe import

CSV has **bytes**, not embedded authoritative metadata for character encoding or column types. CSV field syntax (separators and quotes) is not part of cell content; decoding and parsing derive strings from bytes. All exact-preservation claims apply to the **user-approved decoded field strings**, not necessarily to the original byte sequence or visually rendered glyphs. Repair of already-garbled text cannot be guaranteed.

Do not strip whitespace, convert Arabic-Indic numerals (`٠١٢٣٤٥٦٧٨٩`) into Western digits, force Unicode normalization, or guess dates. The first row can be marked as headers for display purposes but is written to XLSX verbatim.

## 2. Supported encodings

| Encoding | Support | Decision rules |
|---|---|---|
| UTF-8 BOM (`EF BB BF`) | Automatic | Strip **one leading file BOM** from stream metadata, do not expose as a data cell; decode remaining bytes as strict UTF-8 |
| UTF-8 without BOM | Default candidate | Use `TextDecoder('utf-8', {fatal:true})`; passing validity alone is **not certainty** if another encoding is plausible |
| Windows-1256 | Explicit user-select | Legacy Arabic Windows files; decode through browser `TextDecoder('windows-1256', {fatal:true})` |
| ISO-8859-6 | Explicit user-select | Some older Arabic files; manual review; not interchangeable with Windows-1256 |
| UTF-16 LE/BE, UTF-32, UTF-7, CP864, unknown | Not MVP | Reject with a clear explanation (or separate future enhancement); do not reinterpret as arbitrary UTF-8 |

Encoding candidates are previewed without upload. `TextDecoder` supports Windows-1256/ISO-8859-6 in modern browsers. Its `fatal:true` throws on malformed byte sequences where the mapping detects one; **single-byte legacy decoders can still decode an incorrect file into believable nonsense**. The browser has no perfect encoding oracle.

**Manual encoding policy:** If UTF-8 BOM exists, preselect UTF-8 and show it as BOM-confirmed. For BOM-less bytes:

1. If strict UTF-8 succeeds, preselect UTF-8 and show preview; if non-ASCII bytes exist, require a review/confirmation click (not a blocking modal when user proceeds naturally). ASCII-only files are byte-identical under supported encodings for the ASCII range; no separate encoding action required.
2. If strict UTF-8 fails, do **not** replace malformed characters or silently switch. Show error guidance and available manual Windows-1256/ISO-8859-6 previews. User must select/confirm encoding before export.
3. If selected legacy decoder cannot decode due to byte errors, report failure; never fall back invisibly.
4. On selecting a new encoding, repeat decoding, delimiter detection, parse, all issue classifications and preview from **original raw bytes**, not previously decoded strings.
5. Preserve U+FFFD only when the byte sequence genuinely encodes U+FFFD in an otherwise valid encoding; never generate replacement characters as a recovery tactic.

If a file is already corrupted (`Ø£Ø­Ù…Ø¯` rather than `أحمد` in its actual decoded data), notify that Nassaq cannot conclusively restore lost upstream information. Never automatically “fix” it.

## 3. Delimiter and line ending selection

MVP delimiters: `,`, `;`, horizontal tab (`\t`), and pipe (`|`). Newlines: `\r\n`, `\n`, `\r`; newline **inside a quoted field** is data. A field may contain an escaped double quote encoded as `""`. Always use quote-aware Papa Parse, not naïve `split(',')` or `split('\n')`.

**Propose delimiter deterministically:** For each candidate on a sample of up to 30 **logical records** (not 30 physical lines), parse with `header:false`, `dynamicTyping:false`, `skipEmptyLines:false`, `comments:false`, `fastMode:false`. Reject candidates with quote parse errors. Rank by consistent field count across sampled nonempty records, then number of multi-column records. If top candidates tie, all candidates yield one column, or sample has too few records, mark **review required** and do not claim detection accuracy. Never assume comma because it is the library fallback if inference fails. Display the chosen character visibly (`Tab` label, etc.). Re-run **full parse** after selection.

**Quoting examples:**

```csv
name,note,sku
"أحمد","مدينة: جدة, السعودية","03-04"
"Sara","Said ""hello"" yesterday",000012
"خالد","سطر أول
سطر ثان",A-1
```

This is three data records (plus header), despite the embedded newline. Expected `note` values include the comma and actual newline; the quote syntax becomes content `Said "hello" yesterday`.

## 4. CSV parse configuration and structural rules

- Use Papa Parse with **arrays of string fields**: `header:false`, `dynamicTyping:false`, `transform:undefined`, `transformHeader:undefined`, `skipEmptyLines:false`, `comments:false`, chosen explicit delimiter, normal quote rules. Keep parser errors and their row positions.
- Empty between delimiters (`a,,c`) means middle **empty string** (`""`); not missing/null. Missing columns (`a,b` in a 3-column record) are structural errors, not filled silently.
- Preserve whitespace-only fields and fully blank **intentional** records; do not activate `skipEmptyLines:'greedy'`.
- An optional line terminator on the final record is **not** an additional empty record. Determine from raw decoded stream plus parser behavior; remove only a parser-generated phantom final empty record (if present) attributable to exactly the terminal record separator; do **not** discard a genuine intentionally blank record. Cover `a\n`, `a\n\n`, `a\r\n`, and a quoted trailing newline in fixtures.
- A zero-row or header-only CSV: export permitted only when a valid tabular structure exists with at least one data row (MVP decision); explain “No data rows found”. Header mode toggle must not change underlying data.
- Determine column width using first parsed record; require each full row's field count to equal it. A one-column CSV is allowed **after explicit delimiter confirmation**. Reject 0 columns and >50 columns; reject >10,000 data rows or >100,000 data cells.
- Duplicate/blank column headers are allowed: they remain **positional** cells, and column selectors use `A`, `B`, `C` plus original header label. Never map rows into JavaScript objects keyed by header strings.
- Detect NUL/binary content early. Do not accept zipped `.xlsx` as `.csv` and do not parse Unicode replacement outputs from incompatible binary files.
- Do not treat lines starting `#` or `//` as comments.

## 5. Risk classification (detect, don't change)

| Example decoded cell | Classification | Output in default Text mode |
|---|---|---|
| `أحمد` / `Sara - جدة` | Arabic/mixed scripts | Same code points |
| `٠٠٧٧` / `0077` | Leading-zero candidate | String stays `٠٠٧٧` / `0077` |
| `0123456789` | Phone/identifier risk, not proof of phone | Exact text |
| `12345678901234567890` | Excel numeric precision risk | Exact text |
| `03-04`, `1/2/26` | Date-shaped / product code | Exact text |
| `1,25` | Possible regional decimal formatting | Exact text |
| `1e12` | Scientific-looking value | Exact text |
| `=1+1`, `+SUM(A1:A2)`, `-CMD`, `@name` | Formula-prefix warning | Literal Excel text; never formula |
| `  x  ` | Significant whitespace | Exactly `  x  ` |
| `""` (empty field) | Empty string | XLSX explicit empty text cell as defined in integrity spec |

Risk tags are heuristics and **should not claim a true semantic type**. Counts must be deterministic, computed on the full accepted data. Samples only aid review; preview is not evidence of full-file validity.

## 6. Large-file and failure behavior

Read ≤2 MiB into a worker via a transferable `ArrayBuffer`. Decode and parse off-thread; report `PROGRESS` phase changes. Stop parsing as soon as any row/column/cell-count/length cap fails (stream/chunk callbacks where suitable). Ignore stale worker results using `jobId`. UI can cancel/reset; worker is terminated. The browser may still hit memory limits; report a safe error and allow a smaller-file retry—never auto-upload elsewhere.

**Blocking parse codes:** `DECODE_FAILED` (include chosen encoding only), `MALFORMED_CSV` (missing closing quote etc.), `COLUMN_COUNT_MISMATCH` (CSV row 1-based), `LIMIT_EXCEEDED`, `CELL_TOO_LONG` (1-based row/column), `UNSUPPORTED_FILE`. Unknown/ambiguous detection is `review`, not error, until user confirms.

## 7. Concrete expected cases

```text
Raw UTF-8 bytes for:  name,phone\nأحمد,00123\n
Decode: UTF-8; delimiter: comma; header: yes
CSV data row 2, col 2 = "00123" (string)
Excel row 2, col 2 = "00123" as text
```

```text
Input: id;note\n12345678901234567890;"ملاحظة; ثانية"\n
Delimiter: semicolon
Cells: ["12345678901234567890", "ملاحظة; ثانية"]
Never convert first field to a JS Number
```

```text
Input: code,value\n03-04,=1+1\n
Output: text `03-04` and text `=1+1`
Formula cell count = 0
```

## 8. Acceptance tests

- Golden bytes from UTF-8 BOM, UTF-8 without BOM, Windows-1256 and ISO-8859-6 decode to expected literal strings only with the correct selected encoding.
- Invalid UTF-8 cannot export as if replacement decoding were correct.
- Arabic-Indic digits, long IDs, quotes, multiline cells, blank cells and whitespace are unchanged in exported XLSX.
- Semicolon/tab/pipe and tie cases require correct candidate/confirmation handling.
- Malformed quote, uneven rows, unexpected binary, too many cells or excessively long cell show location and block output.

**References:** [MDN TextDecoder](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder), [MDN fatal decode behavior](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder/fatal), [MDN supported encodings](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder/encoding), [Papa Parse configuration](https://www.papaparse.com/docs).
