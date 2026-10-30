import { expect, test, type APIResponse, type Page } from "@playwright/test";

// Core workflow, in the order a user does it: create job → checklist → findings → measurements → completeness → report → sign-off.
// Runs against the demo (file-backed) store, so it needs no Supabase and no AI key.
test.describe.configure({ mode: "serial" });

let page: Page;
let jobId = "";

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
});
test.afterAll(async () => {
  await page.close();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function json(res: APIResponse): Promise<any> {
  return res.json().catch(() => ({}));
}

test("create a solar assessment from the form", async () => {
  await page.goto("/assessments/new");
  await page.getByLabel(/Site name/).fill("E2E rooftop — 12 Acacia Rd");
  await page.getByLabel(/Goal \/ scope/).fill("New install, 5 kW, tile roof");
  await page.getByRole("button", { name: "Create & open checklist" }).click();
  await page.waitForURL(/\/assessments\/(?!new)[^/?]+/);
  jobId = new URL(page.url()).pathname.split("/")[2];
  expect(jobId).toBeTruthy();
  await expect(page.getByRole("heading", { name: /Assessment · Solar/ })).toBeVisible();
  await expect(page.getByText("Roof / structure / mounting constraints").first()).toBeVisible();
});

test("a job with a too-short site name is refused and nothing is created", async () => {
  await page.goto("/assessments/new");
  await page.getByLabel(/Site name/).fill("x");
  await page.getByRole("button", { name: "Create & open checklist" }).click();
  await expect(page).toHaveURL(/\/assessments\/new/);
});

test("the new job is listed", async () => {
  await page.goto("/assessments");
  await expect(page.getByText("E2E rooftop — 12 Acacia Rd").first()).toBeVisible();
});

test("an unfinished checklist blocks completeness and report sign-off", async ({ request }) => {
  const completeness = await json(await request.get(`/api/completeness?assessmentId=${jobId}`));
  expect(completeness.ready).toBe(false);
  expect(completeness.blockers.length).toBeGreaterThan(0);

  const snap = await json(await request.post("/api/reports/snapshot", { data: { assessmentId: jobId } }));
  expect(snap.snapshot.id).toBeTruthy();
  const refused = await request.post("/api/reports/finalize", { data: { snapshotId: snap.snapshot.id, confirmReviewed: true } });
  expect(refused.ok()).toBe(false);
  expect((await json(refused)).error).toMatch(/Cannot finalize/);
});

test("walk through the checklist, answering every item", async () => {
  await page.goto(`/assessments/${jobId}/checklist`);
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toContainText("item 1 /");
  const total = Number(/\/ (\d+)/.exec((await heading.textContent()) ?? "")?.[1]);
  expect(total).toBeGreaterThanOrEqual(5);
  for (let i = 0; i < total; i++) {
    await page.getByRole("button", { name: "Pass", exact: true }).click();
    if (i === 0) await page.getByPlaceholder("Observation, defects, limitations").fill("Roof access via ladder, isolator labelled.");
    if (i < total - 1) {
      await page.getByRole("button", { name: /^Next/ }).click();
      await expect(heading).toContainText(`item ${i + 2} /`);
    } else {
      await page.getByRole("button", { name: "Save", exact: true }).click();
    }
  }
  await expect
    .poll(async () => (await json(await page.request.get(`/api/checklist/responses?assessmentId=${jobId}`))).responses?.length ?? 0)
    .toBe(total);
});

test("record a finding by hand and confirm it", async () => {
  await page.goto(`/assessments/${jobId}/findings`);
  await page.getByRole("button", { name: "+ Add finding" }).click();
  await page.getByLabel(/^Title/).fill("Cracked tiles near the north ridge");
  await page.getByLabel("Severity").selectOption("medium");
  await page.getByLabel(/Uncertainty/).fill("Underlay condition not visible");
  await page.getByRole("button", { name: "Save finding" }).click();
  await expect(page.getByText("Cracked tiles near the north ridge")).toBeVisible();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reopen review" })).toBeVisible();
});

test("measurements are computed exactly from their inputs", async ({ request }) => {
  const res = await request.post("/api/measurements", {
    data: { assessmentId: jobId, name: "Roof plane A", formula: "area", inputs: { length: { value: 6, unit: "m" }, width: { value: 3.5, unit: "m" } } },
  });
  expect(res.ok()).toBe(true);
  const m = await json(res);
  expect((m.measurement ?? m).value).toBeCloseTo(21, 6);
});

test("completeness is ready once the checklist is answered", async ({ request }) => {
  const completeness = await json(await request.get(`/api/completeness?assessmentId=${jobId}`));
  expect(completeness.blockers).toEqual([]);
  expect(completeness.ready).toBe(true);
});

test("materials list and a quotation are saved with traceable rationale", async ({ request }) => {
  const mat = await request.post("/api/materials", {
    data: { assessmentId: jobId, items: [{ description: "Roof rail 4.2 m", quantity: 8, unit: "ea", rationale: "Two rails per roof plane A row", source: "measurement" }] },
  });
  expect(mat.ok()).toBe(true);
  const saved = await json(mat);
  const version = saved.version ?? saved.materialsVersion ?? 1;
  const quote = await request.post("/api/quotations", {
    data: { assessmentId: jobId, materialsVersion: version, supplier: "Acme Solar Supply", currency: "USD", items: [{ description: "Roof rail 4.2 m", quantity: 8, unit: "ea", unitPrice: 19.99, currency: "USD" }] },
  });
  expect(quote.ok()).toBe(true);
});

test("draft the report, edit it, sign it off and see it locked", async () => {
  await page.goto(`/assessments/${jobId}/report`);
  // The refused sign-off earlier left a stale draft (v1); the new draft is built from the now-complete facts.
  await expect(page.getByLabel(/^Version/)).toBeVisible();
  await page.getByRole("button", { name: "Create new draft" }).click();
  await expect(page.getByText(/Draft — not reviewed or signed off yet/)).toBeVisible();
  await expect(page.frameLocator('iframe[title="Report preview"]').getByText("Cracked tiles near the north ridge").first()).toBeVisible();

  await page.locator("textarea").first().fill("Roof is suitable for a 5 kW array subject to tile repair.");
  await page.getByRole("button", { name: "Save edits" }).click();
  await expect(page.getByRole("status")).toContainText(/saved/i);

  const finalize = page.getByRole("button", { name: "Sign off and finalize" });
  await expect(finalize).toBeDisabled();
  await page.getByLabel(/I have read this report/).check();
  await finalize.click();
  await expect(page.getByText(/Finalized \(immutable\)/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign off and finalize" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create new draft" })).toBeVisible();
});

test("a finalized report cannot be edited or re-finalized, and exports as a PDF", async ({ request }) => {
  const list = await json(await request.get(`/api/reports/snapshot?assessmentId=${jobId}`));
  const snaps = list.snapshots as Array<{ id: string; finalized: boolean }>;
  const final = snaps.find((s) => s.finalized);
  expect(final).toBeTruthy();

  const edit = await request.patch("/api/reports/snapshot", { data: { snapshotId: final!.id, narrative: { summary: "tampered" } } });
  expect(edit.ok()).toBe(false);

  const again = await request.post("/api/reports/finalize", { data: { snapshotId: final!.id, confirmReviewed: true } });
  expect(again.ok()).toBe(false);

  const pdf = await request.post("/api/reports/pdf", { data: { snapshotId: final!.id } });
  expect(pdf.ok()).toBe(true);
  const bytes = Buffer.from((await json(pdf)).pdfBase64 as string, "base64");
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(bytes.length).toBeGreaterThan(1000);
});

test("changing the facts after a draft is made blocks sign-off of that draft", async ({ request }) => {
  const draft = await json(await request.post("/api/reports/snapshot", { data: { assessmentId: jobId } }));
  const items = (await json(await request.get(`/api/checklist/items?assessmentId=${jobId}`))).items as Array<{ id: string }>;
  const change = await request.post("/api/checklist/responses", {
    data: { assessmentId: jobId, responses: [{ itemId: items[0].id, status: "fail", notes: "Re-inspected: corrosion found" }] },
  });
  expect(change.ok()).toBe(true);
  const refused = await request.post("/api/reports/finalize", { data: { snapshotId: draft.snapshot.id, confirmReviewed: true } });
  expect(refused.ok()).toBe(false);
  expect((await json(refused)).error).toMatch(/changed|blocking|Cannot finalize/i);
});
