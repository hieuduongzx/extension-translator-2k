import { BUILTIN_PROVIDER_LABELS, type ProviderId } from "./types";

/* ────────────────────────────────────────────────────────────────────────────
   Shared SVG icon strings — used by the content-script selection popup
   (plain DOM) and re-exported as React components by the popup UI.

   Keeping every icon as a single inline SVG string keeps the extension
   offline-friendly, resolution-independent, and avoids asset-copy build steps.
   ──────────────────────────────────────────────────────────────────────────── */

const GOOGLE_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.6 16.1 18.9 13 24 13c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.5-5.2l-6.2-5.3c-2.1 1.4-4.6 2.2-7.3 2.2-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.6 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4 5.5l6.2 5.3C41 35.5 44 30.2 44 24c0-1.3-.1-2.3-.4-3.5z"/></svg>`;

const BING_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="wt-bing-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#36c5f0"/><stop offset="100%" stop-color="#0078d4"/></linearGradient></defs><path fill="url(#wt-bing-grad)" d="M5 3v22.6l6.5-2.7v-12L20 14l-3 1.3 5 2.2 6 2.5L11.5 28 5 25.7V3z"/></svg>`;

/** Built-in AI backend (Mistral Small). */
const MISTRAL_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#FF7000"/><path fill="#fff" d="M6 17V7h2.1l2 5.2L12.1 7H14.2v10h-1.9v-5.8L10.3 17H9.1l-2-5.8V17H6zm10.2 0V7H18v10h-1.8z"/></svg>`;

/** Built-in AI backend (GPT-OSS 120B). */
const GPT_OSS_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#F55036"/><path fill="#fff" d="M7 12.5 12 5l1.2 4.2L17 12.5 13.2 13.8 12 19l-1.2-5.2L7 12.5z"/></svg>`;

const CUSTOM_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0d9488" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="8" width="14" height="10" rx="2"/><circle cx="9" cy="13" r="1.5"/><circle cx="15" cy="13" r="1.5"/><path d="M12 2v4M8 18v2a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2"/></svg>`;

/** Map a provider id to an SVG icon HTML string. */
export function providerIcon(providerId: ProviderId | string): string {
  switch (providerId) {
    case "google":
      return GOOGLE_ICON_SVG;
    case "bing":
      return BING_ICON_SVG;
    case "mistral":
      return MISTRAL_ICON_SVG;
    case "gpt-oss":
      return GPT_OSS_ICON_SVG;
    default:
      return CUSTOM_ICON_SVG;
  }
}

/**
 * Re-export the display label for a provider. Used by the selection popup
 * so it doesn't duplicate the strings already defined in `types.ts`.
 */
export { BUILTIN_PROVIDER_LABELS };
