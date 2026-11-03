import { describe, it, expect } from "vitest";
import { LOOK_FOR, PACK_TEMPLATES, TEMPLATE_ITEM, checklistFor, lookForFor, templateItemMeta, type PackId } from "../packs";

// Guided checklist (D-021): every template item says what to look for, in plain observation terms.
const packs = Object.keys(PACK_TEMPLATES) as PackId[];
const allTitles = packs.flatMap((p) => [...checklistFor(p, "existing"), ...checklistFor(p, "new_install")]);

describe("what to look for", () => {
  it("every item of every template list has guidance", () => {
    const missing = [...new Set(allTitles)].filter((t) => !lookForFor(t));
    expect(missing).toEqual([]);
  });

  it("there is no guidance for titles that are not on any list (no dead entries)", () => {
    const used = new Set(allTitles);
    expect(Object.keys(LOOK_FOR).filter((t) => !used.has(t))).toEqual([]);
  });

  it("guidance is short, plain, and never states a result or a requirement", () => {
    for (const [title, text] of Object.entries(LOOK_FOR)) {
      expect(text.length, title).toBeGreaterThan(40);
      expect(text.length, title).toBeLessThanOrEqual(400);
      expect(text, title).not.toMatch(/\b(complies|compliant|passes|certified|must be|is required)\b/i);
    }
  });

  it("new-installation items do not tell the person to inspect existing equipment", () => {
    for (const pack of packs) {
      for (const title of checklistFor(pack, "new_install")) {
        expect(lookForFor(title), title).not.toMatch(/\bexisting\b/i);
      }
    }
  });

  it("items a person typed themselves have none", () => {
    expect(lookForFor("My own item")).toBeUndefined();
    expect(lookForFor("  Site access, safety & isolation points ")).toBeTruthy();
  });
});

describe("required flag and group per template item", () => {
  it("every template item has its own required flag and group, and there are no dead entries", () => {
    expect([...new Set(allTitles)].filter((t) => !templateItemMeta(t))).toEqual([]);
    const used = new Set(allTitles);
    expect(Object.keys(TEMPLATE_ITEM).filter((t) => !used.has(t))).toEqual([]);
  });

  it("required is not decided by position: items late in a list can be required, and 'if present' items are optional", () => {
    expect(templateItemMeta("Limitations & follow-up checks needed")?.required).toBe(true);
    expect(templateItemMeta("Batteries — type, capacity, condition (if present)")?.required).toBe(false);
    expect(templateItemMeta("My own item")).toBeUndefined();
  });
});
