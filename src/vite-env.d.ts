/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMMA_ENDPOINT?: string;
  readonly VITE_GEMMA_API_KEY?: string;
  readonly VITE_GEMMA_MODEL?: string;
  readonly VITE_QWEN_ENDPOINT?: string;
  readonly VITE_QWEN_API_KEY?: string;
  readonly VITE_QWEN_MODEL?: string;
  readonly VITE_HY3_ENDPOINT?: string;
  readonly VITE_HY3_API_KEY?: string;
  readonly VITE_HY3_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
