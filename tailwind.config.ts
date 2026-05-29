import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";

export default {
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
        card: "0 1px 2px rgba(24, 24, 27, 0.04), 0 1px 3px rgba(24, 24, 27, 0.06)",
        pop: "0 10px 30px rgba(24, 24, 27, 0.10), 0 2px 6px rgba(24, 24, 27, 0.06)",
        // Brand-tinted glow used for primary CTAs and logo halo. Hex matches `brand-500`.
        glow: "0 10px 30px -8px rgba(20, 184, 166, 0.45)",
      },
      animation: {
        "fade-in": "fadeIn 0.18s ease-out forwards",
        "slide-up": "slideUp 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "scale-in": "scaleIn 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        scaleIn: {
          "0%": { transform: "scale(0.96)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
