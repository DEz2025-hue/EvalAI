const path = require("path");

// Point Tailwind at its config explicitly. Without this it looks in the folder the server was started from, so a server
// started from the repository root (as the editor preview does) loaded no config at all and every page came out unstyled.
module.exports = {
  plugins: { tailwindcss: { config: path.join(__dirname, "tailwind.config.js") }, autoprefixer: {} },
};
