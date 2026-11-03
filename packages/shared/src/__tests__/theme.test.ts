import { describe, it, expect } from "vitest";
import { BRAND, GLASS, NEUTRAL, SHADES, STATUS, SURFACES, contrastRatio, hexToChannels, overHex, semanticColors, type SchemeName } from "../theme";

const SCHEMES: SchemeName[] = ["light", "dark"];
const AA = 4.5; // WCAG AA for normal text
const NON_TEXT = 3; // WCAG for icons, borders and large text

describe("brand colours", () => {
  it("are exactly Charcoal Black, Soft White and Pure White", () => {
    expect(BRAND).toEqual({ charcoal: "#151515", softWhite: "#F6F6F6", pureWhite: "#FDFDFD" });
  });

  it("the light page is Soft White on Pure White surfaces, the dark page is Charcoal", () => {
    expect(SURFACES.light).toEqual({ page: "#F6F6F6", surface: "#FDFDFD" });
    expect(SURFACES.dark.page).toBe("#151515");
  });

  it("the primary fill is Charcoal in light mode and Soft White in dark mode, with readable text on it", () => {
    expect(semanticColors("light").brand).toBe("#151515");
    expect(semanticColors("dark").brand).toBe("#F6F6F6");
    for (const scheme of SCHEMES) {
      const c = semanticColors(scheme);
      expect(contrastRatio(c.onBrand, c.brand)).toBeGreaterThanOrEqual(AA);
      expect(contrastRatio(c.onBrandMuted, c.brand)).toBeGreaterThanOrEqual(AA);
      expect(contrastRatio(c.textOnDark, c.heroBg)).toBeGreaterThanOrEqual(AA);
      expect(contrastRatio(c.textOnDarkMuted, c.heroBg)).toBeGreaterThanOrEqual(AA);
      expect(contrastRatio(c.heroMuted, c.heroBg)).toBeGreaterThanOrEqual(AA);
    }
  });
});

describe("the grey scale", () => {
  it("is monochrome: every step has equal red, green and blue", () => {
    for (const scheme of SCHEMES) {
      for (const shade of SHADES) {
        const hex = NEUTRAL[scheme][shade].toLowerCase();
        expect(hex.slice(1, 3) === hex.slice(3, 5) && hex.slice(3, 5) === hex.slice(5, 7), `${scheme} ${shade} ${hex}`).toBe(true);
      }
    }
  });

  it("runs from light to dark in light mode and the other way in dark mode", () => {
    for (let i = 1; i < SHADES.length; i++) {
      expect(contrastRatio(NEUTRAL.light[SHADES[i]], "#FFFFFF")).toBeGreaterThan(contrastRatio(NEUTRAL.light[SHADES[i - 1]], "#FFFFFF"));
      expect(contrastRatio(NEUTRAL.dark[SHADES[i]], "#000000")).toBeGreaterThan(contrastRatio(NEUTRAL.dark[SHADES[i - 1]], "#000000"));
    }
  });
});

describe("text is readable on every surface it appears on (WCAG AA)", () => {
  for (const scheme of SCHEMES) {
    const n = NEUTRAL[scheme];
    const { page, surface } = SURFACES[scheme];
    const glass = overHex(GLASS[scheme].fill, page);
    const glassStrong = overHex(GLASS[scheme].fillStrong, page);

    it(`${scheme}: the text steps on the page, the solid surface, the subtle fill and glass`, () => {
      for (const [name, bg] of [["page", page], ["surface", surface], ["subtle fill", n[50]], ["glass", glass], ["strong glass", glassStrong]] as const) {
        for (const shade of [500, 600, 700, 800, 900] as const) {
          expect(contrastRatio(n[shade], bg), `${scheme} text ${shade} on ${name}`).toBeGreaterThanOrEqual(AA);
        }
      }
    });

    it(`${scheme}: non-essential text (step 400, placeholders) keeps at least 3:1`, () => {
      for (const bg of [page, surface, glass]) expect(contrastRatio(n[400], bg)).toBeGreaterThanOrEqual(NON_TEXT);
    });

    it(`${scheme}: borders and glass edges are visible but quiet`, () => {
      expect(contrastRatio(n[300], page)).toBeGreaterThan(1.2);
    });
  }
});

describe("status colours stay readable and are used with an icon and a label", () => {
  for (const scheme of SCHEMES) {
    for (const family of ["red", "amber", "green"] as const) {
      it(`${scheme} ${family}: dark text on the soft tint, and the strong fill with its text`, () => {
        const s = STATUS[family][scheme];
        const text = s[800];
        expect(contrastRatio(text, s[100])).toBeGreaterThanOrEqual(AA);
        expect(contrastRatio(s[700], s[50])).toBeGreaterThanOrEqual(AA);
        const { surface } = SURFACES[scheme];
        // the "text-white on bg-<family>-600" button: the white step is the solid surface
        {
          expect(contrastRatio(surface, s[600]), `${scheme} ${family} button`).toBeGreaterThanOrEqual(scheme === "light" ? 3 : AA);
        }
      });
    }
  }
});

describe("the phone's named colours", () => {
  for (const scheme of SCHEMES) {
    it(`${scheme}: the pairs the screens use are readable`, () => {
      const c = semanticColors(scheme);
      for (const [fg, bg] of [[c.text, c.bg], [c.text, c.surface], [c.textMuted, c.bg], [c.textMuted, c.surface], [c.success, c.successSoft], [c.warning, c.warningSoft], [c.danger, c.dangerSoft], [c.info, c.infoSoft], [c.accentText, c.accentSoft]] as const) {
        expect(contrastRatio(fg, bg), `${scheme} ${fg} on ${bg}`).toBeGreaterThanOrEqual(AA);
      }
    });
  }
});

describe("helpers", () => {
  it("contrastRatio matches the known black/white value", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(contrastRatio("#151515", "#F6F6F6")).toBeGreaterThan(15);
  });

  it("overHex blends a translucent colour over a solid one", () => {
    expect(overHex("rgba(255,255,255,0.5)", "#000000")).toBe("#808080");
    expect(overHex("rgb(10, 20, 30)", "#ffffff")).toBe("#0a141e");
  });

  it("hexToChannels gives the space-separated form Tailwind needs", () => {
    expect(hexToChannels("#F6F6F6")).toBe("246 246 246");
  });
});
