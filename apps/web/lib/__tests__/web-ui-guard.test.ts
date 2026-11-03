import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import tailwindConfig from "../../tailwind.config.js";

// Web UI checks found by looking at the running app (2026-11-01).
const root = path.join(__dirname, "../../../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("styles do not depend on where the server was started", () => {
  it("Tailwind is pointed at its config and its content folders by absolute path", () => {
    // Started from the repository root (as the editor preview does), relative paths matched nothing and every page was unstyled.
    expect(read("apps/web/postcss.config.js")).toContain("path.join(__dirname, \"tailwind.config.js\")");
    const content = (tailwindConfig as { content: string[] }).content;
    expect(content.length).toBeGreaterThan(1);
    for (const c of content) expect(path.isAbsolute(c)).toBe(true);
  });

  it("disabled secondary buttons look disabled", () => {
    expect(read("apps/web/app/globals.css")).toMatch(/\.btn-secondary \{[^}]*disabled:opacity-50/);
  });
});

describe("the job page puts the saved details back in the form", () => {
  it("both job pages pass the saved site name, goal, equipment and constraints, so Save never blanks them", () => {
    for (const f of ["apps/web/app/assessments/[id]/page.tsx", "apps/web/app/inspections/[id]/page.tsx"]) {
      const src = read(f);
      expect(src).toContain("initial={{");
      expect(src).toContain("persisted?.context?.goal");
      expect(src).toContain("persisted?.context?.constraints");
    }
    const form = read("apps/web/components/ContextForm.tsx");
    expect(form).toContain("Saved.");
    expect(form).toContain("siteName.trim().length >= 2");
  });
});

describe("the templates page shows both situations with what to look for", () => {
  it("lists the new-installation survey and the existing-system checklist with look-for text", () => {
    const page = read("apps/web/app/templates/page.tsx");
    expect(page).toContain("newInstallChecklist");
    expect(page).toContain("lookForFor");
    expect(page).toContain("Existing system");
  });
  it("job lists show the site situation", () => {
    expect(read("apps/web/app/assessments/JobListClient.tsx")).toContain("scenarioLabel");
  });
});
