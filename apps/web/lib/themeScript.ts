// Plain constants (no React), so the server-rendered page layout can import them. The hook that uses them is in themeMode.ts.

export const THEME_STORAGE_KEY = "eval-ai-theme";

/**
 * Runs before the page is drawn (it is inlined in the document head), so a saved choice never flashes the wrong colours.
 * Only an explicit light or dark sets data-theme; "system" leaves it off and the stylesheet follows the device.
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
