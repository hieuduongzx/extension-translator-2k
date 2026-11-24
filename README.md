# Translator2k

Chrome extension built with React + Vite + TypeScript + TailwindCSS. It bundles
**three translation features** into one extension, switchable from a tabbed popup:

1. **Dịch Web** — translate any web page (Google / Bing / AI), selection popup
   and Vietnamese dictionary.
2. **Dịch Stream** — real-time speech-to-text + translation overlay for
   videos/streams, powered by [Soniox](https://soniox.com).
3. **Dịch nhanh** — standalone quick translator in the popup for ad-hoc text.

Each feature has its own settings, reachable from a single options page with
top-level tabs for Web Translate, Dictionary, Quick Translate, and Stream
Translate.

## Features

### Dịch Web (page translation)

- Translate any page in place (`replace` mode) or alongside the original
  (`bilingual` mode)
- Providers, none requiring an API key for the basics:
  - **Google Translate** — public `translate.googleapis.com` endpoint
  - **Bing Translator** — public `bing.com/translator` endpoint
  - **Auto Free / custom AI** — shared OpenAI-compatible gateway (`auto-free`),
    pre-configured in the bundle (no key to enter), plus user-added custom
    OpenAI-compatible models
- 30 curated target languages (plus auto-detect for source language)
- Auto-translate per domain rules (always / ask / never)
- Translation cache persisted in `chrome.storage.local`
- Keyboard shortcuts: `Alt+A` to toggle full-page translation, `Alt+S` to
  translate the current selection in place
- Right-click context menu (page or selection)
- Floating "translate" icon next to selected text (toggleable, with hover delay)
- `Alt + double-click` a word (configurable to plain double-click or off) for a
  Vietnamese dictionary popup (VDict, Laban, Wiktionary, Free Dictionary)
- **YouTube Subtitles**: force YouTube captions into your target language
  (native track or YouTube auto-translate, optional auto-on), plus an in-player
  **AI** button for AI-translated (optionally bilingual) subtitle overlays

### Dịch Stream (real-time subtitles)

- Captures the active tab's audio via an offscreen document
- Streams it to Soniox for live transcription + one-way translation
- Draggable / resizable subtitle overlay rendered on the page
- Transcript or sentence display modes, speaker labels, adjustable font size and
  background opacity, auto-scroll
- Pause / resume, silence standby, and auto-pause when the tab is hidden or
  unfocused
- Requires a Soniox API key (entered in Options → Stream Translate)

## Architecture

- `src/background.ts` — shared service worker. Handles web translation, YouTube
  captions/AI subtitles, dictionary/TTS providers, and calls
  `initStreamTranslator()`.
- `src/stream/streamBackground.ts` — the Soniox stream-translator background
  logic, refactored into an `initStreamTranslator()` module. Its message
  listener is scoped to its own stream message types.
- `src/youtube/` — YouTube caption watcher (`captions.ts`), timedtext fetcher
  (`captionFetch.ts`), cue scheduling (`subtitleCues.ts`), and player overlay
  (`aiSubtitleOverlay.ts`).
- `src/popup/` — tabbed popup (`Popup.tsx` → `WebPanel` / `QuickPanel` /
  `StreamPanel`).
- `src/options/` — full-page settings (`OptionsApp.tsx` → `WebGeneralSettings`,
  `WebShortcutsSettings`, `WebServicesSettings`, `DictionarySettings`,
  `QuickGeneralSettings`, `StreamGeneralSettings`, `StreamOverlaySettings`).
- `public/offscreen.html`, `public/offscreen.js`, `public/pcm-processor.js` —
  offscreen audio capture pipeline for the stream feature.

Settings are stored per feature: web/dictionary settings under
`web-translator:settings`, quick-translate settings under
`translator2k:quickSettings` (draft in `chrome.storage.session` under
`translator2k:quickDraft`), and stream settings/secrets under
`streamTranslatorSettings` / `streamTranslatorSecrets`.

## Development

```bash
npm install
npm run dev
```

No `.env` is required. The shared gateway URL, its API key and the bundled
`auto-free` model id are baked into `src/types.ts`, so a fresh clone builds and
translates straight away.

Copy `.env.example` to `.env` only to override those values locally
(`VITE_AI_ENDPOINT`, `VITE_AI_API_KEY`, `VITE_AUTO_FREE_MODEL`). Model ids must
be published on the gateway's Models list or requests fail with
`model_not_found`.

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

This is a private build shared with a handful of people, and the shared gateway
URL and key ship inside `dist/` deliberately so nobody has to configure
anything. Anyone with the CRX can read both. If either leaks beyond the intended
group, rotate the key on the gateway and rebuild. See `SECURITY.md` for what is
and is not protected, including the user-owned custom-model and Soniox keys.

## Privacy & limitations

- The Google and Bing providers call **unofficial public endpoints**. They can
  rate-limit or change without notice. No API keys or accounts are used for
  them.
- The stream feature sends captured tab audio to **Soniox** using your own API
  key. Audio is only sent while a session is active.
- AI providers send text to the configured OpenAI-compatible endpoint.
- Automatic clipboard paste is off by default. If enabled, the Quick Translate
  draft is retained only for the current browser session.
- Selected/page text and looked-up words are sent to the chosen provider /
  dictionary sources. Nothing else is collected; there is no analytics or
  telemetry.
