/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        // Existing semantic tokens (kept so shadcn primitives keep working)
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
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          border: "hsl(var(--sidebar-border))",
          muted: "hsl(var(--sidebar-muted))",
          item: "hsl(var(--sidebar-item))",
          "item-hover": "hsl(var(--sidebar-item-hover))",
        },

        // Vault palette — CSS-var backed so light/dark can swap via :root class
        "surface": "var(--v-surface)",
        "surface-dim": "var(--v-surface)",
        "surface-container-lowest": "var(--v-surface-container-lowest)",
        "surface-container-low": "var(--v-surface-container-low)",
        "surface-container": "var(--v-surface-container)",
        "surface-container-high": "var(--v-surface-container-high)",
        "surface-container-highest": "var(--v-surface-container-highest)",
        "surface-variant": "var(--v-surface-container-highest)",
        "on-surface": "var(--v-on-surface)",
        "on-background": "var(--v-on-surface)",
        "on-surface-variant": "var(--v-on-surface-variant)",
        "outline": "var(--v-outline)",
        "outline-variant": "var(--v-outline-variant)",
        "vault-primary": "var(--v-primary)",
        "primary-container": "var(--v-primary-container)",
        "on-primary-fixed": "var(--v-on-primary-fixed)",
        "tertiary": "var(--v-tertiary)",
        "error-container": "var(--v-error-container)",
        "on-error": "var(--v-on-error)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        headline: ["Inter", "sans-serif"],
        body: ["Inter", "sans-serif"],
        label: ["Inter", "sans-serif"],
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
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%, 60%": { transform: "translateX(-6px)" },
          "40%, 80%": { transform: "translateX(6px)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        shake: "shake 0.4s ease-in-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
