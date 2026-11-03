const path = require("path");

// Colours read CSS variables (apps/web/app/globals.css, generated from packages/shared/src/theme.ts), so light and dark mode need no
// per-class variants. The old slate, teal, sky and indigo classes all map to the monochrome grey scale; red, amber and green stay as
// functional status colours. `white` is the solid surface (Pure White in light mode), and `page` is the page behind everything.
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
const rgb = (name) => `rgb(var(${name}) / <alpha-value>)`;
const scale = (family) => Object.fromEntries(SHADES.map((s) => [s, rgb(`--c-${family}-${s}`)]));

// Absolute paths: Tailwind resolves relative globs against the folder the server was started from. Started from the
// repository root (as the editor preview does) the old "./app/**" globs matched nothing and every page came out unstyled.
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [path.join(__dirname, "app/**/*.{js,ts,jsx,tsx,mdx}"), path.join(__dirname, "components/**/*.{js,ts,jsx,tsx,mdx}"), path.join(__dirname, "app/globals.css")],
  theme: {
    extend: {
      colors: {
        white: rgb("--c-white"),
        page: rgb("--c-page"),
        slate: scale("slate"),
        teal: scale("slate"),
        sky: scale("slate"),
        indigo: scale("slate"),
        red: scale("red"),
        amber: scale("amber"),
        green: scale("green"),
      },
      borderColor: { DEFAULT: rgb("--c-slate-200") },
      ringColor: { DEFAULT: rgb("--c-slate-400") },
    },
  },
  plugins: [],
};
