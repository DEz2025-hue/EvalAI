import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { GLASS, NEUTRAL, SHADES, STATUS, SURFACES, hexToChannels, type SchemeName } from "@eval-ai/shared";

// The web gets the design tokens as CSS variables; the phone reads them from the shared file. They must not drift apart.
const css = fs.readFileSync(path.join(__dirname, "../../app/globals.css"), "utf8").replace(/\r\n/g, "\n");

/** The text of a block that starts with `opener` (the opening brace is the last character of the match). */
function block(opener: RegExp): string {
  const m = opener.exec(css);
  if (!m) throw new Error("block not found: " + opener);
  let depth = 1;
  let i = m.index + m[0].length;
  const start = i;
  for (; i < css.length && depth > 0; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") depth--;
  }
  return css.slice(start, i - 1);
}

const declared = (text: string) => Object.fromEntries([...text.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

function expectedFor(scheme: SchemeName): Record<string, string> {
  const e: Record<string, string> = {
    "--c-page": hexToChannels(SURFACES[scheme].page),
    "--c-white": hexToChannels(SURFACES[scheme].surface),
  };
  for (const s of SHADES) e[`--c-slate-${s}`] = hexToChannels(NEUTRAL[scheme][s]);
  for (const fam of ["red", "amber", "green"] as const) for (const s of SHADES) e[`--c-${fam}-${s}`] = hexToChannels(STATUS[fam][scheme][s]);
  const g = GLASS[scheme];
  Object.assign(e, { "--glass-fill": g.fill, "--glass-fill-strong": g.fillStrong, "--glass-edge": g.edge, "--glass-highlight": g.highlight, "--glass-shadow": g.shadow, "--glass-blur": `${g.blur}px`, "--glass-saturate": String(g.saturate) });
  return e;
}

describe("CSS variables match the shared design tokens", () => {
  const light = declared(block(/:root \{/));
  const darkAuto = declared(block(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \{/));
  const darkManual = declared(block(/:root\[data-theme="dark"\] \{/));

  it("light mode", () => {
    for (const [name, value] of Object.entries(expectedFor("light"))) expect(light[name], name).toBe(value);
  });

  it("dark mode follows the device setting", () => {
    for (const [name, value] of Object.entries(expectedFor("dark"))) expect(darkAuto[name], name).toBe(value);
  });

  it("a manual dark theme (data-theme) has the same values as the automatic one", () => {
    expect(darkManual).toEqual(darkAuto);
  });
});

describe("the stylesheet keeps what the app and its tests rely on", () => {
  it("has glass classes with solid fallbacks for browsers without backdrop-filter and for reduced transparency", () => {
    for (const cls of [".glass", ".glass-bar", ".glass-sheet", ".card"]) expect(css).toContain(cls);
    expect(css).toMatch(/@supports not \(\(backdrop-filter/);
    expect(css).toMatch(/@media \(prefers-reduced-transparency: reduce\)/);
  });

  it("has a skeleton class that stops animating when motion is reduced", () => {
    expect(css).toMatch(/\.skeleton \{/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.skeleton \{ animation: none; \}/);
  });

  it("no longer uses the old teal focus colour or hard-coded slate hex values", () => {
    expect(css).not.toMatch(/teal-/);
    expect(css).not.toMatch(/#0f172a|#f8fafc|#64748b/i);
  });
});
