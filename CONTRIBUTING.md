# Contributing to Nassaq (نسّق)

Thank you for your interest in contributing to Nassaq! Nassaq is a free, open-source tool dedicated to data integrity when converting CSV files to Excel for Arabic and English users.

## 1. Principles and Rules

Before submitting code, please review [`AGENTS.md`](./AGENTS.md) and [`docs/04_DATA_INTEGRITY_AND_VALIDATION.md`](./docs/04_DATA_INTEGRITY_AND_VALIDATION.md):

1. **Never Silently Modify User Data:** No trimming, whitespace reduction, case folding, Unicode normalization, date inference, or unapproved numeric coercion.
2. **Text by Default:** All CSV columns export as literal Excel text cells unless the user explicitly opts into `Number` for a column that satisfies strict numeric safety criteria.
3. **Synthetic Fixtures Only:** **NEVER** commit, upload, or attach real personal, customer, student, or payroll data to issues, pull requests, or tests. All test cases must use synthetic, fictive values.
4. **Browser-Only Architecture:** Nassaq runs 100% in the browser. Do not add backend servers, APIs, databases, authentication, remote telemetry, or third-party CDN runtime dependencies.
5. **Bilingual Support:** All UI text must be available in both Arabic (`src/i18n/ar.ts`) and English (`src/i18n/en.ts`). Arabic is the default locale.

## 2. Development Setup

### Prerequisites
- Node.js `^24.0.0`
- npm `^10.0.0`

### Setup Steps
```bash
# Clone the repository
git clone https://github.com/AshrafMurad/nassaq.git
cd nassaq

# Install dependencies strictly from lockfile
npm ci

# Start local development server
npm run dev
```

## 3. Available Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Starts Vite dev server |
| `npm run typecheck` | Strict TypeScript verification (`tsc --noEmit`) |
| `npm run test:unit` | Runs Vitest unit & domain test suites |
| `npm run build` | Builds static production assets to `dist/` |
| `npm run preview` | Serves production build locally |
| `npm run test:e2e` | Builds and runs Playwright cross-browser tests |

## 4. Pull Request Workflow

1. Create a focused branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   # or
   git checkout -b fix/your-bugfix-name
   ```
2. Write unit tests for any changed domain invariants in `tests/unit/`.
3. If changing UI or workflow, add Playwright tests in `tests/e2e/`.
4. Ensure all checks pass locally:
   ```bash
   npm run typecheck
   npm run test:unit
   npm run build
   npx playwright test
   ```
5. Follow Conventional Commits format (e.g., `feat: ...`, `fix: ...`, `docs: ...`, `test: ...`).
6. Submit a PR describing the change, the synthetic test cases tested, and the integrity/privacy verification.
