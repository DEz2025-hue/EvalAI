/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}", "./app/globals.css"],
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
