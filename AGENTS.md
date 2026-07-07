# AGENTS.md

Shared guidance for any AI agent (or human contributor) working on this repo.

## Standard commands

Run these before declaring a task done. They are the source of truth.

| Task          | Command                | Notes                                                |
| ------------- | ---------------------- | ---------------------------------------------------- |
| Typecheck     | `npm run build`        | `tsc --noEmit` then `vite build`; both must pass.    |
| Lint          | `npm run lint`         | `eslint . --max-warnings 0` — zero warnings allowed. |
| Auto-fix lint | `npm run lint:fix`     | ESLint `--fix`; pair with a `format` after.          |
| Format check  | `npm run format:check` | Prettier check across `src/**` + root configs.       |
| Format write  | `npm run format`       | Prettier write.                                      |
| Tests         | `npm test`             | `vitest run` (pure logic, no browser needed).        |
| Dev server    | `npm run dev`          | Vite + CRX dev build.                                |

## Pre-commit hook

Husky + lint-staged runs `eslint --fix` + `prettier --write` on staged files.
If you bypass it (`git commit --no-verify`), run `npm run lint && npm test`
manually before pushing.

## Secrets

- Never commit `.env`. Build-time AI endpoint + API keys come from
  `import.meta.env.VITE_*` (see `.env.example`, typed in
  `src/vite-env.d.ts`).
- The historical hardcoded key in `src/types.ts` has been removed; if any key
  was ever committed, rotate it on the provider side and follow the
  `git filter-repo` recipe in `README.md#security`.

## Architecture quick map

- `src/background.ts` — MV3 service worker. Handles web translation,
  dictionary/TTS, and calls `initStreamTranslator()`.
- `src/stream/streamBackground.ts` — Soniox live-subtitle background logic
  (state + session + message routing). The page-side overlay renderer lives in
  `src/stream/overlay/render.ts` (kept self-contained because it is shipped to
  the page via `chrome.scripting.executeScript({ func })`).
- `src/providers/` — pluggable translation providers (google / bing / ai /
  dictionary / wiktionary / laban / vdict / googleTts).
- `src/content/` — in-page engine, selection/dictionary popups, batching,
  DOM walker.
- `src/popup/` + `src/options/` — React UIs.

## Testing notes

- Tests are pure-logic under Vitest (Node env). Anything touching
  `chrome.*` should either be exercised via regex-extractable helpers (see
  `parseBootstrapTokens` in `bing.ts`) or stub `chrome.storage` in the test
  fixture (see `cache.test.ts`).
- When you add a provider, export the parsing/smallest-testable units as named
  exports so tests can target them without network.

## Code style

- ESLint flat config: `eslint.config.js`. Prettier: `.prettierrc.json`.
- Prefer `type` imports for types (`import { type Foo } from ...`).
- Unused params/vars prefixed with `_` are allowed.
- `console.log` is lint-warned; use `console.warn`/`console.error` for
  runtime diagnostics.
