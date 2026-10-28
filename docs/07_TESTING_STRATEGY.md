# Nassaq — Testing Strategy and Acceptance Matrix

**Version:** 1.0 · **Test principle:** validate **actual downloaded XLSX cell values and types**, not just UI previews.

## 1. Test levels and tools

| Layer | Tool | Purpose | Release bar |
|---|---|---|---|
| Pure-domain unit | Vitest | Numeric safety gate, risk detector, filename sanitizer, expected comparison, state transitions | All invariant tests pass |
| Import integration | Vitest + browser-capable adapter or browser tests | Bytes→decode→parse→typed workbook→read-back with synthetic fixtures | Every fixture passes without silent alteration |
| Browser end-to-end | Playwright | Choose/drag file, review options, generate, download, inspect workbook | Core successful and rejected workflows green |
| Browser/privacy audit | Playwright + DevTools | Worker path, network requests, no storage, object URL cleanup, cancellation | No file data network transmission |
| Compatibility/manual | Chrome, Edge, Firefox, Safari on maintained OS versions | Actual XLSX opening, RTL, web worker performance, file download behavior | Smoke pass in every target browser |
| Security | Unit + E2E + dependency review | Formula injection, HTML injection, hostile filename, size/resource limits | No high-severity uncontrolled regression |

**Fixture policy:** synthetic names and phone-like identifiers only; no real payroll/customer records. Binary fixtures checked into `tests/fixtures` together with expected decoded strings and policy metadata. Use a fixture generator only as a test tool, not application source code.

## 2. Example fixtures with precise expected results

All data below is conceptual fixture content; expected workbook cell type in Text mode is **string**, even when Excel would typically infer a number/date.

| Fixture | Source | Expected output |
|---|---|---|
| `arabic-utf8-bom.csv` | UTF-8+BOM: `الاسم,الهاتف\nأحمد,001234\n` | A2=`أحمد`, B2=`001234`, both strings; BOM absent from A1 |
| `arabic-utf8-no-bom.csv` | `name,city\nSara,جدة\n` | B2=`جدة` literal string; encoding review when non-ASCII BOM-less |
| `arabic-windows-1256.csv` | Windows-1256 bytes encoding `محمد` | Wrong strict UTF-8 blocked; manual Windows-1256 yields `محمد` |
| `arabic-iso-8859-6.csv` | ISO-8859-6 byte fixture | Manual ISO-8859-6 matches expected Arabic code points |
| `leading-zeros.csv` | `code\n00073\n` | A2=`00073` string; Number selection fails |
| `long-id.csv` | `id\n12345678901234567890\n` | exact 20-digit string; Number fails |
| `arabic-indic.csv` | `count\n٠٠١٢٣\n` | Unicode digits preserved exactly as text |
| `sku-date.csv` | `sku\n03-04\n` | A2=`03-04` string, never a Date |
| `mixed-direction.csv` | `label\nسجل-ABC 001\n` | Exact string data; preview isolated with dir auto |
| `quoted-comma.csv` | `name,note\n"أحمد","جدة, السعودية"\n` | B2=`جدة, السعودية`, 2 columns |
| `quoted-quote.csv` | `note\n"He said ""ok"""\n` | A2=`He said "ok"` string |
| `multiline.csv` | `note\n"سطر 1\nسطر 2"\n` | A2 contains literal newline; 1 data row |
| `semicolon.csv` | `id;name\n0005;Ali\n` | 2 columns under `;` |
| `tab.csv` | `id\tname\n0005\tAli\n` | 2 columns under Tab |
| `pipe.csv` | `id|name\n0005|Ali\n` | 2 columns under Pipe |
| `formula.csv` | `cell\n=1+1\n` | A2 exact text, `formula === undefined` |
| `formula-prefixes.csv` | quoted `=SUM(1,2)`, `+SUM(1,2)`, `-1+2`, `@SUM(1,2)`, `\t=1+1` | All text; no computed formula |
| `html-string.csv` | `name\n"<img src=x onerror=alert(1)>"\n` | Display as text only; no script or image load |
| `whitespace.csv` | `note\n"  نص  "\n` | Spaces and literal content preserved |
| `empty-values.csv` | `a,b,c\n1,,3\n` | B2 exactly empty text, not null/0; validated by XLSX read-back |
| `numeric-valid.csv` | `q\n2\n-17\n2.5\n` | If column Number opted-in: numeric 2, -17, 2.5 |
| `numeric-invalid.csv` | `q\n2\n02\n` | Number mode refused for entire column |
| `numeric-lexical.csv` | `q\n0.10\n` | Number mode refused; string kept |
| `uneven.csv` | `a,b\nx\n` | Full export blocked with row index |
| `broken-quote.csv` | `a,b\n"unfinished,b\n` | Block with parsing error; no download |
| `empty.csv` | zero bytes | Refuse before parsing |
| `header-only.csv` | `name,phone\n` | Refuse “No data rows” |
| `zip-masquerading.csv` | XLSX/ZIP bytes renamed `.csv` | Refuse incompatible/binary file |

Additional fixtures: terminal newlines `a\n`, `a\n\n`, CRLF and CR; embedded null; Unicode normalization precomposed vs decomposed; Arabic joining and bidi marks `U+200E/U+200F`; duplicate headers; blank header fields; literal U+FFFD; malformed UTF-8 byte sequence; wrong/manual encoding selection; delimiter ties/one-column file; 32,767 vs 32,768 UTF-16 units; limits at/above 2 MiB, 10,000 rows, 50 columns, 100,000 cells.

## 3. Test expectations at precise cell level

**Core assertion helper (conceptual):** For each `r,c`, obtain loaded worksheet cell by index and compare to expected typed value. For expected `Text` cells, assert primitive `string` and Unicode exact equality (including zero-length, right-to-left marks and trailing spaces). For expected `Number` cells, assert primitive `number` and `Object.is()` equality. Also assert `.formula` is unset, `.hyperlink` is unset, sheet count is 1, sheet name is `Data`, no unexpected occupied cells and workbook opens in Excel and LibreOffice.

**Negative test:** intercept `READY` generation with one tampered read-back cell. Verification must throw `VERIFY_FAILED`, and the UI must expose **no** download button/Blob URL. Another negative test simulates worker crash: show translated error and allow reset, not a success screen.

**Concurrency tests:** Select file A, then file B during processing; delayed completion for A is ignored; only file B can produce output. Cancel during XLSX build terminates worker and revokes previous URLs. Re-select same input succeeds.

## 4. Unit test matrix

| Module | Cases |
|---|---|
| `decode` | Strict UTF-8 valid/invalid, BOM stripping at absolute offset zero only, legacy decoder selection, undecodable bytes, no replacement decoding |
| `delimiter` | Comma/semicolon/tab/pipe, quoted delimiters, multiline, one-column/ties, quoted escapes, invalid samples |
| `parser-contract` | `dynamicTyping:false`, header duplicates, blank fields, full-row width checks, intentional blank lines, terminal newline rules |
| `riskRules` | Leading zeros, long IDs, date shapes, scientific tokens, formula prefixes with whitespace, bidi script info |
| `numericPolicy` | ASCII decimal only, 15 significant digits, safe integers, `String(Number(token)) === token`, full-column all-or-nothing, blank cell remains text |
| `limits` | Exact upper bounds and +1 boundaries, oversize early reject, workbook cell length |
| `filename` | Path traversal, XSS-like name, control/bidi override chars, empty basename |
| `verifyWorkbook` | Types, content, dimensions, formula properties, mismatch rejection, empty string vs missing |
| `workerProtocol` | Job ID stale result, phase errors, cancellation, no PII in error strings |
| `localization` | Required strings exist in AR+EN; dir and locale agree |

Prefer table-driven tests for deterministic rules. Test CSV parsing and XLSX verification **through vendor adapter** in browser-style tests; mocks are insufficient for the central integrity guarantee.

## 5. End-to-end workflows

1. **Happy Arabic:** upload UTF-8 BOM file, confirm inferred comma, inspect preview, generate, intercept download, read workbook, assert Arabic and `00073` exact strings, no formulas.
2. **Legacy decode:** upload Windows-1256 fixture, choose Windows-1256, compare preview to verified workbook. Change encoding midway; old ready result disappears.
3. **Semicolon with embedded delimiter:** select correct separator, verify unchanged quoted content in XLSX.
4. **Number opt-in:** all numeric canonical cells convert to number; if later row `02`, show blocking column error; reverting Text succeeds with exact `02`.
5. **Formula and XSS:** `=1+1` displays and exports literally; `<script>`-shaped content neither runs nor opens external request.
6. **Header/no header:** toggles change labels and row counts only; all original rows exported, CSV record-to-XLSX row mapping unchanged.
7. **Refusal paths:** oversize file, invalid UTF-8, malformed quote, bad row widths, too many rows, too long cell, header-only; no resulting download.
8. **Privacy:** intercept all outgoing requests after app load; unique CSV sentinel never appears. Verify no localStorage/IndexedDB persistence of content.
9. **Recovery:** change source after error, cancel work, switch language during review; UI state is not corrupted.
10. **A11y:** keyboard-only selection and download, accessible error focus, dir auto for mixed-script content.

## 6. Cross-browser and performance matrix

| Browser | Parse/worker | Download/read-back | RTL/accessibility | Required |
|---|---|---|---|---|
| Chrome current desktop | Yes | Yes | Yes | Yes |
| Edge current desktop | Yes | Yes | Yes | Yes |
| Firefox current desktop | Yes | Yes | Yes | Yes |
| Safari current desktop (16.4+ baseline) | Yes | Yes | Yes | Yes |
| Android/iOS modern browsers | Light smoke only | Attempt ≤100 KiB fixture | Visual | Best effort |

**Resource/performance fixtures:** typical 20 KiB/200 rows, 500 KiB/5,000 rows, and worst allowed combinations bounded by all caps. Log test timing and peak visible memory **in local test reports only**; never auto-upload customer data/metrics. Worker must keep click/reset interaction functional while busy. If worst-case browser becomes unstable, adjust **documented caps** and repeat all boundary tests. Do not use vendor claims (“gigabyte parsing”) to justify our small ExcelJS workbook limits.

## 7. Continuous integration gate

A proposed minimal CI job on each PR: clean install with lockfile; typecheck; linter; Vitest; Playwright Chromium smoke; production build; license/dependency audit; check no forbidden backend/telemetry deps. Cross-browser Firefox/WebKit nightly or release gate; verify first-party asset paths on static preview. Upload synthetic test reports only; no real CSV fixture data.

## 8. Exit and defect severity

**Blocker:** data alteration, formula evaluation, unsafe external call, incomplete download, broken AR/EN flow, unverified workbook, wrong numeric conversion. **High:** browser crash on documented max files, inaccessible primary action, encoding silently misselected. **Medium:** risk banner false positive, long visual cell clipping with access intact. No known Blocker/High unreviewed defects on public release. Any integrity discrepancy becomes a regression fixture.

**Note:** Library behavior for zero-length text cells, worker XLSX load and workbook representation is validated in the phase-0 spike; if the selected library fails exact requirements, development does not proceed until the adapter/library decision is revised in all docs.

**Phase 0 evidence:** `tests/phase0/` passed 5 Node integration cases and 15
Chromium/Firefox/WebKit cases, including exact downloaded text/empty-cell values,
ZIP CRC/XML inspection, offline active-worker processing and large synthetic
fixtures. Compact results are in `tests/phase0/evidence/`; see `PHASE_0_REPORT.md`.
These feasibility tests do not replace later product-flow tests, real Chrome/Edge/
Safari and Excel/LibreOffice QA, memory profiling, or release privacy/CSP checks.
