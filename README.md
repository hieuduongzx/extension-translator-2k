# Translator2k

Chrome extension built with React + Vite + TypeScript + TailwindCSS. It bundles
**two translation features** into one extension, switchable from a tabbed popup:

1. **Dịch Web** — translate any web page (Google / Bing / AI), selection popup
   and Vietnamese dictionary.
2. **Dịch Stream** — real-time speech-to-text + translation overlay for
   videos/streams, powered by [Soniox](https://soniox.com).

Each feature has its own settings, reachable from a single options page with a
sidebar listing both functions.

## Features

### Dịch Web (page translation)

- Translate any page in place (`replace` mode) or alongside the original
  (`bilingual` mode)
- Providers, none requiring an API key for the basics:
  - **Google Translate** — public `translate.googleapis.com` endpoint
  - **Bing Translator** — public `bing.com/translator` endpoint
  - **Gemma 4 / custom AI** — OpenAI-compatible chat-completions endpoints
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
npm run dev
```

## Build

```bash
npm run build
```

Load the `dist` folder in `chrome://extensions` with Developer Mode enabled.

## Testing

```bash
npm test
```

Unit tests cover the pure logic (response parsing, batching, language-code
mapping). They run under Vitest and do not require a browser.

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
