import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";

export default {
  content: ["./popup.html", "./options.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // System stack: zero network requests, no fallback flash, and full
        // Vietnamese glyph coverage on every platform.
        sans: ["Segoe UI", "system-ui", "-apple-system", "Helvetica Neue", "Arial", "sans-serif"]
      },
      colors: {
        // Per-extension brand palette. Swap this single line to retheme.
        brand: colors.teal
      },
      boxShadow: {
        // Clean-minimal elevation. Single-layer, low-alpha, never a halo.
        // `card` rests flat with a hairline shadow; `card-hover` barely lifts.
        card: "0 1px 0 0 rgba(24, 24, 27, 0.04)",
        "card-hover": "0 1px 0 0 rgba(24, 24, 27, 0.06), 0 1px 2px 0 rgba(24, 24, 27, 0.04)",
        // Used for floating menus only — kept subtle, no bloom.
        pop: "0 1px 0 0 rgba(24, 24, 27, 0.06), 0 2px 6px -2px rgba(24, 24, 27, 0.08)",
        // Floating elements (popup menus). Thin, diffuse, low-alpha.
        float:
          "0 1px 0 0 rgba(24, 24, 27, 0.06), 0 6px 24px -8px rgba(24, 24, 27, 0.10), 0 2px 6px -3px rgba(24, 24, 27, 0.06)",
        "float-light": "0 1px 0 0 rgba(24, 24, 27, 0.04), 0 6px 20px -10px rgba(24, 24, 27, 0.08)",
        // Kept for back-compat with existing `shadow-glow*` class usages, but
        // dialled down to a hairline ring — no visible halo in clean mode.
        glow: "0 0 0 0 transparent",
        "glow-sm": "0 0 0 0 transparent"
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
        "spin-slow": "spin 2s linear infinite"
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" }
        },
        fadeOut: {
          "0%": { opacity: "1" },
          "100%": { opacity: "0" }
        },
        slideUp: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" }
        },
        slideDown: {
          "0%": { transform: "translateY(-6px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" }
        },
        scaleIn: {
          "0%": { transform: "scale(0.96)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" }
        },
        scaleOut: {
          "0%": { transform: "scale(1)", opacity: "1" },
          "100%": { transform: "scale(0.96)", opacity: "0" }
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" }
        }
      },
      backdropBlur: {
        xs: "2px"
      }
    }
  },
  plugins: []
} satisfies Config;
