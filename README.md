# Nassaq (نسّق) — Safe CSV to Excel Converter

<p align="center">
  <strong>نسّق: حوّل ملفات CSV إلى Excel بأمان تام ودون تغيير أي قيمة في متصفحك.</strong><br>
  <em>Convert CSV to Excel without changing a single value — leading zeros, Arabic text, and identifiers stay exactly as written.</em>
</p>

---

## 1. What is Nassaq?

**Nassaq (نسّق)** is a free, open-source, browser-only CSV-to-XLSX converter designed with Arabic and English data integrity at its core.

When standard spreadsheet software like Excel opens a CSV file directly, it often silently mutates the data:
- Stripping leading zeros from phone numbers and national IDs (`00073` becomes `73`).
- Truncating long 16+ digit identifiers into scientific notation (`12345678901234567890` becomes `1.23457E+19`).
- Corrupting Arabic text due to mismatched encoding (Windows-1256 vs. UTF-8).
- Converting dates and SKUs (`03-04` becomes `March 4th`).
- Risking CSV formula injection attacks (`=`, `+`, `-`, `@` prefixes).

**Nassaq solves this permanently.** Every cell is exported as an explicit Excel text cell by default. After generating the workbook, an off-thread Web Worker reloads the XLSX file and verifies every single cell, value, type, and dimension before allowing download.

---

## 2. Who is it for?

Nassaq is built for anyone working with sensitive, structured Arabic and English tabular data:
- **Administrators & HR Professionals:** Preserving employee IDs, phone numbers, and Arabic names.
- **Accountants & Finance Teams:** Protecting reference numbers, transaction codes, and invoice IDs.
- **Schools & Universities:** Preserving student identifiers, academic records, and grades.
- **Small Businesses & Data Analysts:** Cleanly formatting export files without software lock-in or cloud leaks.

---

## 3. How to Use

1. **Open the Website:** Visit the static web application in any modern browser.
2. **Select or Drop CSV:** Choose your `.csv` or `.txt` file (up to 2 MiB).
3. **Verify Encoding & Separator:** Check the detected text encoding (UTF-8, Windows-1256, ISO-8859-6) and column separator (comma, semicolon, tab, pipe).
4. **Review Sample & Risks:** Inspect the first 20 records in the interactive preview table with bidirectional isolation (`<bdi>`). Review any flagged risks (leading zeros, long IDs, formula-like prefixes).
5. **Set Column Types:** Columns default to **Keep as text (recommended)**. Optionally select **Convert to number** for columns that satisfy strict numeric validation.
6. **Create & Download Verified Excel:** Click **Create safe Excel**. The worker generates the XLSX, reloads it, verifies 100% round-trip fidelity, and presents the **Download XLSX** button.

---

## 4. Privacy & Security Promise

- **100% Client-Side Processing:** All decoding, parsing, and XLSX generation runs inside a dedicated Web Worker on your local computer.
- **Zero File Uploads:** No file contents, cell values, filenames, or workbooks are ever transmitted across the network.
- **Zero Analytics & Trackers:** Nassaq contains no telemetry, tracking cookies, analytics, or advertising scripts.
- **Ephemeral Session Memory:** Data resides strictly in browser tab memory. Resetting or closing the tab completely wipes all data from memory. Nothing is persisted to `localStorage` or `IndexedDB`.
- **Transparency & Boundaries:** The static website host (e.g., Cloudflare Pages, GitHub Pages) logs standard HTTP asset requests (IP address and browser User-Agent) when the initial application files load. Nassaq cannot protect against a compromised operating system or hostile browser extensions.

---

## 5. Input Limits

To guarantee performance and stability within browser memory limits:
- **Maximum File Size:** 2 MiB
- **Maximum Data Rows:** 10,000 rows
- **Maximum Columns:** 50 columns
- **Maximum Data Cells:** 100,000 cells
- **Maximum Cell Text Length:** 32,767 UTF-16 code units (Excel cell limit)
- **Files per Batch:** 1 file at a time

Files exceeding these bounds are safely rejected with clear explanations.

---

## 6. Known Limitations

- **Severely Corrupted Files:** If a file was saved with an incompatible encoding and saved over, missing bytes cannot always be reconstructed.
- **Text-First Design:** Date inference and custom locale currency parsing are intentionally omitted in the MVP to guarantee zero accidental modification.
- **Input Format:** Only CSV and delimited TXT files are accepted for import (no direct Excel-to-Excel editing).

---

## 7. Development Prerequisites & Scripts

### Prerequisites
- Node.js `^24.0.0`
- npm `^10.0.0`

### Setup
```bash
git clone https://github.com/AshrafMurad/nassaq.git
cd nassaq
npm ci
```

### Documented Scripts
- `npm run dev`: Starts the local Vite development server.
- `npm run typecheck`: Runs strict TypeScript verification (`tsc --noEmit`).
- `npm run test:unit`: Runs all unit and invariant test suites via Vitest.
- `npm run build`: Compiles production static assets into `dist/`.
- `npm run preview`: Serves the static production build locally at `http://127.0.0.1:4173`.
- `npm run test:e2e`: Runs end-to-end Playwright tests across Chromium, Firefox, and WebKit.

---

## 8. License & Community

- **License:** Licensed under the [MIT License](./LICENSE).
- **Contributing:** See [CONTRIBUTING.md](./CONTRIBUTING.md) for code standards and testing guidelines.
- **Security Inquiries:** See [SECURITY.md](./SECURITY.md) for vulnerability reporting.
- **Documentation:** Full technical specifications and architecture ADRs are available in the [`docs/`](./docs/) directory.
