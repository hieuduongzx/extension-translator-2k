/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Shared OpenAI-compatible gateway base URL (ends at `/v1`). */
  readonly VITE_AI_ENDPOINT?: string;
  /** API key for the shared gateway. */
  readonly VITE_AI_API_KEY?: string;
  /** Built-in Mistral model id on the gateway. */
  readonly VITE_MISTRAL_MODEL?: string;
  /** Built-in GPT-OSS model id on the gateway. */
  readonly VITE_GPT_OSS_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
