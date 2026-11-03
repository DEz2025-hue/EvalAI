const path = require("path");

// Absolute paths: Tailwind resolves relative globs against the folder the server was started from. Started from the
// repository root (as the editor preview does) the old "./app/**" globs matched nothing and every page came out unstyled.
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [path.join(__dirname, "app/**/*.{js,ts,jsx,tsx,mdx}"), path.join(__dirname, "components/**/*.{js,ts,jsx,tsx,mdx}"), path.join(__dirname, "app/globals.css")],
  safelist: ["bg-brand-600", "bg-brand-700", "hover:bg-brand-700"],
  theme: {
    extend: {
      colors: {
        brand: { 50: "#f0fdf4", 600: "#16a34a", 700: "#15803d", 900: "#14532d" },
        ink: "#0f172a",
        muted: "#64748b",
      },
    },
  },
  plugins: [],
};
