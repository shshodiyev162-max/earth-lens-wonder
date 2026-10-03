import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        display: ["Space Grotesk", "sans-serif"],
        body: ["Inter", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        earth: {
          green: "hsl(var(--earth-green))",
          blue: "hsl(var(--earth-blue))",
          orange: "hsl(var(--earth-orange))",
          red: "hsl(var(--earth-red))",
          yellow: "hsl(var(--earth-yellow))",
        },
        space: {
          deep: "hsl(var(--space-deep))",
        },
        glow: {
          primary: "hsl(var(--glow-primary))",
          blue: "hsl(var(--glow-blue))",
        },
        // Map-page chrome (sidebar, floating pills, ribbon, dropdowns): navy in dark mode, white in light.
        panel: {
          DEFAULT: "hsl(var(--panel) / <alpha-value>)",
          raised: "hsl(var(--panel-raised) / <alpha-value>)",
          ribbon: "hsl(var(--panel-ribbon) / <alpha-value>)",
          foreground: "hsl(var(--panel-foreground) / <alpha-value>)",
          soft: "hsl(var(--panel-soft) / <alpha-value>)",
          muted: "hsl(var(--panel-muted) / <alpha-value>)",
          line: "rgb(var(--panel-line))",
          "line-strong": "rgb(var(--panel-line-strong))",
          tint: "rgb(var(--panel-tint))",
          "tint-strong": "rgb(var(--panel-tint-strong))",
          "tint-hover": "rgb(var(--panel-tint-hover))",
        },
        "accent-cyan": {
          DEFAULT: "hsl(var(--accent-cyan) / <alpha-value>)",
          soft: "hsl(var(--accent-cyan-soft) / <alpha-value>)",
        },
        tone: {
          good: "hsl(var(--tone-good) / <alpha-value>)",
          warn: "hsl(var(--tone-warn) / <alpha-value>)",
          bad: "hsl(var(--tone-bad) / <alpha-value>)",
          info: "hsl(var(--tone-info) / <alpha-value>)",
        },
        tile: "hsl(var(--tile))",
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "1" },
        },
        "page-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "rise-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "gradient-drift": {
          from: { backgroundPosition: "0% 50%" },
          to: { backgroundPosition: "100% 50%" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "float": "float 6s ease-in-out infinite",
        "pulse-glow": "pulse-glow 3s ease-in-out infinite",
        // Opacity only: a transform here would trap the map pages' fixed panels.
        "page-in": "page-in 0.35s ease-out both",
        "rise-in": "rise-in 0.4s ease-out both",
        "gradient-drift": "gradient-drift 9s ease-in-out infinite alternate",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
