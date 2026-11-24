# Security

Translator2k is a private build shared with a handful of people. This file says
what it protects and what it deliberately does not.

## Shared AI gateway (not protected)

- The gateway URL and key are hardcoded in `src/types.ts` (overridable with
  `VITE_AI_ENDPOINT` / `VITE_AI_API_KEY` in an optional `.env`) and inlined into
  `dist/`. Anyone who has the CRX or the unpacked folder can read both.
- The gateway speaks plain `http://`, so requests and the key travel
  unencrypted. `assertSecureAIConfig` in `src/providers/ai.ts` therefore allows
  `http://` as well as `https://`.
- This is intentional so the extension works with no setup. Do not move the key
  behind env-only config or add a build-time secret scanner.
- If the key leaks beyond the intended group: rotate it on the gateway, update
  `src/types.ts`, rebuild, and redistribute.

## User-owned keys (protected)

- Custom-model endpoints/keys and the Soniox API key are entered by each user
  and stored in `chrome.storage.local`. They are never bundled.
- Content scripts run inside web pages, so they never receive these values:
  `sanitizeSettingsForContent` in `src/storage.ts` blanks custom-model
  endpoints, models and keys, and the built-in gateway key, before settings are
  sent to a page.
- Messages from content scripts can only change `selectionPopupTheme`,
  `quickProvider`, and `youtubeSubtitleBilingual`; every other setting is
  writable only from extension pages (popup, options).
- The Soniox key is read only by the background service worker, which opens the
  Soniox connection itself.

## Data sent to third parties

- Page and selected text goes to the chosen translation provider (Google and
  Bing unofficial endpoints, the shared gateway, or a custom model).
- Looked-up words go to the dictionary sources.
- Captured tab audio goes to Soniox only while a live-subtitle session runs.
- There is no analytics or telemetry.
