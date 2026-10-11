import type { Config } from "tailwindcss";

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        raised: v("raised"),
        overlay: v("overlay"),
        line: v("border"),
        "line-strong": v("border-strong"),
        ink: v("text"),
        muted: v("text-muted"),
        faint: v("text-faint"),
        signal: v("signal"),
        ai: v("ai"),
        change: v("change"),
        verified: v("verified"),
        alert: v("alert"),
        human: v("human"),
      },
      fontFamily: {
        sans: ["var(--font-geist)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
        serif: ["var(--font-newsreader)", "ui-serif", "Georgia", "serif"],
      },
      fontSize: {
        "2xs": ["11px", { lineHeight: "16px", letterSpacing: "0.08em" }],
      },
      borderRadius: { card: "10px", input: "8px" },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        pulseDot: {
          "0%,100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: ".55", transform: "scale(1.35)" },
        },
        sweep: { to: { transform: "rotate(360deg)" } },
        rise: { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: {
        pulseDot: "pulseDot 2.4s ease-in-out infinite",
        sweep: "sweep 2.2s ease-out 1",
        rise: "rise .2s ease-out both",
      },
    },
  },
  plugins: [],
};
export default config;
