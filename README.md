# Translator2k

Chrome extension built with React + Vite + TypeScript + TailwindCSS. It bundles
**three translation features** into one extension, switchable from a tabbed popup:

1. **Dịch Web** — translate any web page (Google / Bing / AI), selection popup
   and Vietnamese dictionary.
2. **Dịch Stream** — real-time speech-to-text + translation overlay for
   videos/streams, powered by [Soniox](https://soniox.com).
3. **Dịch nhanh** — standalone quick translator in the popup for ad-hoc text.

Each feature has its own settings, reachable from a single options page with a
sidebar listing all three functions.

## Features

### Dịch Web (page translation)

- Translate any page in place (`replace` mode) or alongside the original
  (`bilingual` mode)
- Providers, none requiring an API key for the basics:
  - **Google Translate** — public `translate.googleapis.com` endpoint
  - **Bing Translator** — public `bing.com/translator` endpoint
  - **Mistral Small / GPT-OSS 120B / custom AI** — shared OpenAI-compatible gateway
- 31 curated target languages
- Auto-translate per domain rules (always / ask / never)
- Translation cache persisted in `chrome.storage.local`
- Keyboard shortcut: `Alt+A` to toggle translation
- Right-click context menu (page or selection)
- Floating "translate" icon next to selected text (toggleable)
- Double-click a word for a Vietnamese dictionary popup

### Dịch Stream (real-time subtitles)

- Captures the active tab's audio via an offscreen document
- Streams it to Soniox for live transcription + one-way translation
- Draggable / resizable subtitle overlay rendered on the page
- Transcript or sentence display modes, speaker labels, adjustable font size and
  background opacity, auto-scroll
- Pause / resume and auto-pause when the tab is hidden
- Requires a Soniox API key (entered in Options → Dịch Stream)

## Architecture

- `src/background.ts` — shared service worker. Handles web translation, the
  dictionary/TTS providers, and calls `initStreamTranslator()`.
- `src/stream/streamBackground.ts` — the Soniox stream-translator background
  logic, refactored into an `initStreamTranslator()` module. Its message
  listener is scoped to its own `STREAM_*`/`TOGGLE_TRANSLATION` message types.
- `src/popup/` — tabbed popup (`Popup.tsx` → `WebPanel` / `StreamPanel`).
- `src/options/` — full-page settings with a sidebar (`OptionsApp.tsx` →
  `WebSettings` / `StreamSettings`).
- `public/offscreen.html`, `public/offscreen.js`, `public/pcm-processor.js` —
  offscreen audio capture pipeline for the stream feature.

Settings are stored separately per feature: web settings under
`web-translator:settings`, stream settings under `streamTranslatorSettings`.

## Development

```bash
npm install
cp .env.example .env   # fill in VITE_AI_* (gateway endpoint + key) then build
npm run dev
```

Without `.env` the extension still builds, but the built-in AI backends will
fail until the shared gateway endpoint and API key are set.

## Build

```bash
npm run build
```

Load the `dist` folder in `chrome://extensions` with Developer Mode enabled.

## Testing & linting

```bash
npm test          # vitest run (pure logic, no browser)
npm run lint       # eslint, fails on any warning
npm run format     # prettier write
```

A Husky pre-commit hook runs `lint-staged` (eslint --fix + prettier) on staged
files automatically.

## Security

Built-in AI backends use a self-hosted gateway. Endpoint + API key come from
`import.meta.env.VITE_AI_*` at build time (see `.env.example`). **Never commit
`.env`.** If a key was ever committed to git history:

```bash
# install once: npm i -g git-filter-repo
git filter-repo --invert-paths --path .env --path src/types.ts
git push --force-with-lease origin
# rotate the leaked key on the provider side too
```

## Privacy & limitations

- The Google and Bing providers call **unofficial public endpoints**. They can
  rate-limit or change without notice. No API keys or accounts are used for
  them.
- The stream feature sends captured tab audio to **Soniox** using your own API
  key. Audio is only sent while a session is active.
- AI providers send text to the configured OpenAI-compatible endpoint.
- Selected/page text and looked-up words are sent to the chosen provider /
  dictionary sources. Nothing else is collected; there is no analytics or
  telemetry.
