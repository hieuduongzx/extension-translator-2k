// Flat config (ESLint v9). Keeps the rules lenient enough to run on an
// existing codebase without a huge reformat, while catching real bugs:
// unused vars, hook deps, forbidden `any` in new code, etc. Prettier owns
// formatting; this config just disables the conflicting style rules.

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "*.zip",
      "public/offscreen.js",
      "public/pcm-processor.js",
      "scripts/**",
      ".agents/**",
      ".claude/**",
      ".kilo/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: [
      "src/**/*.{ts,tsx}",
      "vite.config.ts",
      "vitest.config.ts",
      "tailwind.config.ts",
      "postcss.config.js"
    ],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2022,
        sourceType: "module"
      },
      globals: {
        chrome: "readonly",
        window: "readonly",
        document: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        AbortController: "readonly",
        BroadcastChannel: "readonly",
        ResizeObserver: "readonly",
        MutationObserver: "readonly",
        localStorage: "readonly",
        navigator: "readonly",
        fetch: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        CustomEvent: "readonly",
        Element: "readonly",
        HTMLElement: "readonly",
        Node: "readonly",
        DOMRect: "readonly",
        Selection: "readonly",
        DataTransfer: "readonly",
        KeyboardEvent: "readonly",
        MouseEvent: "readonly",
        PointerEvent: "readonly",
        MessageEvent: "readonly",
        FileReader: "readonly",
        Audio: "readonly",
        MediaQueryList: "readonly",
        ShadowRoot: "readonly",
        getComputedStyle: "readonly",
        "import.meta": "readonly"
      }
    },
    plugins: {
      react,
      "react-hooks": reactHooks
    },
    settings: {
      react: { version: "18.3" }
    },
    rules: {
      // Hook deps catch real bugs.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Let Prettier own braces.
      curly: ["warn", "all"],
      // Allow unused function args prefixed with `_`.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_"
        }
      ],
      // Don't break existing code that leans on `as`, but flag naked `any`.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "inline-type-imports" }
      ],
      // Prefer early returns so deeply nested listener handlers stay readable.
      "no-fallthrough": "error",
      // Keep `console.warn` for runtime diagnostics in the extension; drop
      // stray `console.log` debug calls.
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "smart"],
      "prefer-const": "error"
    }
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off"
    }
  },
  {
    files: ["src/content/selectionPopup.ts", "src/content/dictionaryPopup.ts", "src/stream/**"],
    // These files build large innerHTML strings intentionally; the rule is noisy there.
    rules: {
      "no-console": "off"
    }
  },
  prettier
);
