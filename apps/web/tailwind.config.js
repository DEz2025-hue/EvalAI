/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
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
