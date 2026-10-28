# Nassaq — Security and Privacy Threat Model

**Version:** 1.0 · **Threat surface:** hostile local CSV bytes, XLSX output, browser runtime and third-party dependencies. This is a static app, but not automatically a safe app.

## 1. Data flow and privacy promise

User-selected file bytes enter via the browser's File API and pass to an in-page Web Worker for decoding, parsing and XLSX generation. The verified workbook returns to the same page for a browser-triggered download. **No application upload service, API route, database, login, telemetry or file-content logging exists.** The hosting provider naturally receives normal page requests (IP, user agent and static asset requests) and may keep its own logs. Avoid falsely claiming the website makes **zero network requests**; claim specifically that **user CSV contents are never transmitted**.

**Retention:** bytes, decoded strings, preview, temporary workbook and generated download URL are ephemeral in memory during the browser tab session. Reset/new file/close should release references and terminate worker; JavaScript cannot guarantee operating-system memory is instantly overwritten. No `localStorage`, IndexedDB, cookie or service-worker cache of data. Do not store previous file names or previews.

**Allowed network:** first-party app HTML, CSS, JS, fonts/assets and optional explicitly clicked outbound documentation/repository links. **Disallowed:** requests incorporating a file's contents, metadata, cell values, generated XLSX, preview or user-generated filename, whether to same-origin or third parties. Never use remote CDN library/font code at runtime; bundle dependencies during build.

## 2. Threat table with required control

| Threat | Likelihood/impact | Countermeasure | Test |
|---|---|---|---|
| CSV formula injection | High / high | Always ExcelJS string value for Text; prohibit formula object; validate reloaded cell type/formula absence | `=`, `+`, `-`, `@` cases in exported XLSX |
| XSS via CSV value or file name | Medium / high | React escaped text; never `innerHTML`, unsafe Markdown, raw SVG data injection | `<img onerror=...>` string visible, never executed |
| Malformed or hostile CSV parser input | Medium / medium | Size/count/cell-length bounds; worker abort; block malformed quote/width errors | Fuzzed quotes, large lines, mismatch cases |
| Memory exhaustion/browser hang | Medium / high | 2 MiB + 10k/50/100k caps; worker-only CPU; one active job; cancellation | Worst-case fixtures, browser task responsiveness |
| Silent wrong legacy encoding | Medium / high | Strict UTF-8 + preview + manual legacy choice/confirmation; no replacement decode | Byte fixtures; wrong encoding review |
| XLSX serialization bug | Medium / high | Re-open generated buffer; compare every cell/type; independent XML/office QA | Tamper/mismatch injected tests |
| PII leakage via errors/logs | Medium / high | Log codes/coordinates only; no row contents/file names in telemetry | Console, network and exception audit |
| Unsafe output file name | Medium / low | Strip path separators/control/bidi overrides; safe fallback | Malicious file name tests |
| Untrusted dependency / supply chain | Medium / high | Lockfile, license inventory, pinned versions, reviews/audits, no remote script | CI audit and lockfile review |
| Malicious browser extension / infected device | Out of app control | Document boundary; cannot promise defense against local compromised environment | Honest privacy text |

## 3. Spreadsheet formula injection protection

OWASP documents risks with spreadsheet-compatible exports when values become executable formulas. Nassaq generates **XLSX**, not an unprotected CSV. For every untrusted `Text` value—even one beginning with tabs, line breaks, spaces or `=+-@`—write an actual **text cell**, not a formula, and verify read-back as a string. Do not prefix a single quote, strip the initial symbol, or export an ExcelJS `{ formula }` object. A value such as `=1+1` must remain `"=1+1"`, not calculate to `2`. Numeric opt-in gate rejects formula-like tokens; blank is string.

Safe construction is stronger than simply escaping a CSV formula prefix because XLSX encodes cell type. Nevertheless open files in current Excel and LibreOffice during release QA to confirm behavior. Never enable external links, macros, DDE-like functions or user-provided rich text. [OWASP reference](https://owasp.github.io/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/07-Injection/21-CSV_Injection).

## 4. HTML rendering and file naming

Render preview via React text nodes, no `dangerouslySetInnerHTML`, no `eval`, no dynamic code, no CSV-derived URL/href. Use `<bdi dir="auto">` to isolate mixed scripts without changing underlying data. Display filename as escaped text. Generate output filename by removing path separators (`/`, `\`), control characters, bidi override controls, reserved punctuation and hidden dot-only basenames, then limit length and append `-nassaq.xlsx`. Fall back to `nassaq-export.xlsx`; never construct an HTML attribute string manually.

**Export metadata:** no full original file path (browser already restricts), no personal information in workbook properties by default. Constant sheet title `Data`. Do not embed internal debug traces or source CSV inside workbook as a hidden sheet.

## 5. Resource limits and worker isolation

- Check `File.size` **before** reading. Refuse >2 MiB; no partial truncation. Detect likely binary/ZIP signatures and NUL-rich inputs.
- Enforce data rows ≤10,000; columns ≤50; data cells ≤100,000; cell text ≤32,767 UTF-16 code units; invalid CSV structure blocks export.
- Use `jobId` and single worker. On cancel, terminate worker and revoke any old object URL; don't accept stale work completion.
- Include error boundary around decoding, parsing, workbook write and workbook load; catch `RangeError`, `TypeError` and other exceptions into safe messages. Can't fully prevent a browser tab crash under memory pressure; benchmark worst case and reduce limits if necessary.
- Main page never evaluates a CSV as JavaScript or HTML. Worker separation is a responsiveness boundary, **not** a complete security sandbox against a compromised dependency.

## 6. Content Security Policy, transport, dependencies

A recommended **deployment header**, subject to Vite/shadcn and target hosting validation:

```text
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests
```

This is a **starting policy**: validate in production preview, then remove `'unsafe-inline'` for styles and unnecessary `blob:` allowances if build supports it. No third-party upload destinations; CSP limits destinations but does **not prove** local-only processing on its own. Add `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, HTTPS and sensible permissions policy if host supports headers. Avoid `Cross-Origin-*` policies that break worker/Blob downloads until tested.

Dependency checks in implementation phase:

1. Lock exact direct/dependency versions via committed lockfile; run clean install in CI.
2. Inspect ExcelJS license (MIT) and dependency tree; audit known vulnerabilities. A warning about a transitive dependency is not proof of exploitable risk in browser, but unresolved *high/critical reachable* issues block release or require a written risk decision and tested patch.
3. Check all chosen libs' current license terms; do not assume `xlsx` on public npm is the current SheetJS CE build.
4. No `postinstall` downloads of executable binaries or dynamic runtime CDN scripts unless thoroughly reviewed and documented.
5. Use static hosting only; disable accidental file/API processing endpoints.

## 7. Demonstrating that contents are not uploaded

**Release test:** In Playwright, intercept all `fetch`, `XMLHttpRequest`, beacon and outgoing browser requests while loading app and processing a synthetic CSV containing a unique sentinel string. Assert no outgoing request body, query, path or headers include sentinel, CSV bytes, generated workbook or original filename. Because JS could send encoded/fragmented data, supplement with code and dependency audit of all network APIs—not just a string scan. Run in an offline browser context **after** first-party assets load and successfully process a test CSV. Examine service worker registration and storage to ensure nothing persists.

**Product proof:** Expose a nontechnical “How privacy works” explanation and link open source code. Do not promise cryptographic proof merely from a UI claim. If hosting provider metrics are enabled, assess whether they collect personal metadata; no in-app analytics in MVP.

## 8. Incident handling and disclosure

Before release, create a `SECURITY.md` with a private reporting channel (project maintainer-selected). No user content should be automatically attached to reports. A failure to verify XLSX is an integrity/security incident, not a “minor warning.” Revoke/download-block, reproduce using synthetic fixture, patch, test across browsers, and publish a release note if any exported data could have been altered.

**Privacy policy minimum:** What local data enters browser, no file uploads/storage, hosting logs caveat, outbound GitHub links caveat, cookies/analytics statement, browser/device limitations, contact for security/privacy questions, revision date. Avoid absolute statements beyond technical evidence.

## 9. Release security gate

No executable formula values, no unreviewed outgoing content calls, no XSS on hostile strings, no failed byte decoding permitted silently, no partial file exports, 100% XLSX round-trip fixture pass, documented memory/load behavior, dependency inventory reviewed, CSP active and tested, privacy policy agrees with actual implementation.
