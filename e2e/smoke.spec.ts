import { expect, test } from "@playwright/test";

const PAGES: Array<[string, RegExp]> = [
  ["/", /EvalAI|Assessments|Inspections/i],
  ["/assessments", /Assessments/i],
  ["/inspections", /Inspections/i],
  ["/sites", /Sites/i],
  ["/reports", /Reports/i],
  ["/templates", /Templates|Solar/i],
  ["/team", /Team|Members/i],
  ["/settings", /Settings/i],
  ["/help", /Help/i],
  ["/assessments/new", /Site name/],
  ["/inspections/new", /Site name/],
  ["/auth/sign-in", /Sign in/i],
];

test.describe("every main screen renders", () => {
  for (const [path, text] of PAGES) {
    test(path, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const res = await page.goto(path);
      expect(res?.status(), `${path} status`).toBeLessThan(400);
      await expect(page.locator("body")).toContainText(text);
      expect(errors, `${path} page errors`).toEqual([]);
    });
  }
});
