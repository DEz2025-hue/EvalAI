import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { THEME_LABEL, THEME_ORDER } from "../themeMode";
import { THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "../themeScript";

const read = (rel: string) => fs.readFileSync(path.join(__dirname, "../..", rel), "utf8").replace(/\r\n/g, "\n");

describe("the light / dark choice", () => {
  it("offers Device, Light and Dark, in that order", () => {
    expect(THEME_ORDER).toEqual(["system", "light", "dark"]);
    expect(THEME_LABEL).toEqual({ system: "Device", light: "Light", dark: "Dark" });
  });

  it("the startup script only ever sets an explicit light or dark, and never throws", () => {
    expect(THEME_INIT_SCRIPT).toContain(THEME_STORAGE_KEY);
    expect(THEME_INIT_SCRIPT).toMatch(/t==="light"\|\|t==="dark"/);
    expect(THEME_INIT_SCRIPT).toMatch(/^try\{.*\}catch\(e\)\{\}$/);
    // it runs as plain JavaScript in the browser: it must at least parse
    expect(() => new Function(THEME_INIT_SCRIPT)).not.toThrow();
  });

  it("the stylesheet lets an explicit choice win over the device setting in both directions", () => {
    const css = read("app/globals.css");
    expect(css).toContain(':root:not([data-theme="light"])'); // device dark, unless Light was chosen
    expect(css).toContain(':root[data-theme="dark"]'); // Dark chosen, whatever the device says
  });

  it("the page applies the saved choice before it is drawn, and the header and Settings offer the control", () => {
    const layout = read("app/layout.tsx");
    expect(layout).toContain("THEME_INIT_SCRIPT");
    // the layout runs on the server: it must not import the module that holds the client-only hook
    expect(layout).not.toContain('lib/themeMode"');
    expect(layout).toContain("suppressHydrationWarning");
    expect(read("components/AppShell.tsx")).toContain("<ThemeToggle />");
    expect(read("app/settings/page.tsx")).toContain("<ThemeSwitch />");
  });
});
