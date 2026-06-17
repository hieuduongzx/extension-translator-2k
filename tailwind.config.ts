import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";

export default {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./popup.html", "./options.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Space Grotesk",
          "Segoe UI",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
      },
      colors: {
        // Per-extension brand palette. Swap this single line to retheme.
        brand: colors.teal,
      },
      boxShadow: {
        // Soft, multi-layer elevation. `card` rests; `card-hover` lifts on hover.
        card: "0 1px 2px rgba(24, 24, 27, 0.04), 0 2px 6px -1px rgba(24, 24, 27, 0.05)",
        "card-hover":
          "0 2px 4px rgba(24, 24, 27, 0.05), 0 8px 20px -6px rgba(24, 24, 27, 0.12)",
        pop: "0 12px 34px -8px rgba(24, 24, 27, 0.16), 0 4px 10px -3px rgba(24, 24, 27, 0.08)",
        // Brand-tinted glow used for primary CTAs and logo halo. Hex matches `brand-500`.
        glow: "0 10px 28px -8px rgba(20, 184, 166, 0.45)",
        "glow-sm": "0 4px 14px -4px rgba(20, 184, 166, 0.4)",
        // Deep shadow for floating elements (popup, menus)
        "float": "0 24px 48px -12px rgba(0, 0, 0, 0.25), 0 12px 24px -8px rgba(0, 0, 0, 0.15)",
        "float-light": "0 24px 48px -12px rgba(0, 0, 0, 0.12), 0 12px 24px -8px rgba(0, 0, 0, 0.08)",
      },
      animation: {
        "fade-in": "fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "fade-out": "fadeOut 0.15s ease-in forwards",
        "slide-up": "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "slide-down": "slideDown 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "scale-in": "scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "scale-out": "scaleOut 0.15s ease-in forwards",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        shimmer: "shimmer 1.6s linear infinite",
        "spin-slow": "spin 2s linear infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        fadeOut: {
          "0%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
        slideUp: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        slideDown: {
          "0%": { transform: "translateY(-6px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        scaleIn: {
          "0%": { transform: "scale(0.96)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        scaleOut: {
          "0%": { transform: "scale(1)", opacity: "1" },
          "100%": { transform: "scale(0.96)", opacity: "0" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
} satisfies Config;
