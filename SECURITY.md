# Security Policy — Nassaq (نسّق)

Nassaq is a client-side, browser-only tool designed to safeguard data integrity and confidentiality when preparing CSV files for spreadsheet software like Microsoft Excel.

## 1. Security Architecture & Threat Model

- **No Remote Processing:** Selected CSV files and generated XLSX workbooks are processed solely within an in-memory Web Worker in the user's browser. No file contents, cell values, filenames, or metadata are ever transmitted to any remote server or third-party service.
- **Strict Content Security Policy (CSP):** Disallows untrusted scripts, connections, and iframe embedding.
- **Formula Injection Defense:** All unverified values are exported as literal Excel text cells (`@`), never as executable spreadsheet formulas (`=`, `+`, `-`, `@`).
- **Post-Generation Verification:** Every generated workbook is re-read by the worker before download is permitted. If even a single cell differs in value or type from canonical parsed records, the export fails closed and the download is blocked.
- **Zero Local Persistence:** No customer file data is stored in `localStorage`, `IndexedDB`, or cookies.

## 2. Reporting a Vulnerability

We take data integrity and security vulnerabilities seriously. A failure of workbook read-back verification or any silent mutation of cell values is treated as a high-severity security incident.

If you believe you have discovered a vulnerability (such as formula execution, unexpected outbound network transmission, XSS, or silent cell truncation/corruption):

1. **Do NOT open a public GitHub issue.**
2. Report the vulnerability privately via [GitHub Security Advisories](https://github.com/AshrafMurad/nassaq/security/advisories/new).
3. **Synthetic Data Only:** Under no circumstances should real personal, payroll, financial, or confidential records be attached to reports. Please reproduce the issue using a minimal synthetic CSV fixture.

## 3. What to Include in Your Report

To help us triage and resolve the issue quickly, please include:
- A clear description of the vulnerability and its potential impact.
- The minimal **synthetic** CSV file that reproduces the issue.
- Browser name, version, and operating system.
- Exact steps to reproduce.
- Expected behavior vs. observed behavior.

## 4. Response Process

- We will acknowledge receipt of your report within 48 hours.
- We will investigate and confirm the reproduction with a synthetic test fixture.
- If verified, a fix and regression tests will be developed, tested cross-browser (Chromium, Firefox, WebKit), and deployed.
- A public security advisory will be published crediting the reporter if desired.
