import { expect, test } from "@playwright/test";

// Failure paths: invalid input is rejected with a clear error, unknown ids are 404, and AI degrades instead of inventing.
test("health probe is public and reveals nothing sensitive", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(await res.json()).toEqual({ ok: true });
});

test("creating a job validates its input", async ({ request }) => {
  const bad = await request.post("/api/assessments", { data: { mode: "assessment", pack: "nuclear", siteName: "x" } });
  expect(bad.status()).toBe(400);
  const notJson = await request.post("/api/assessments", { headers: { "content-type": "application/json" }, data: "{oops" });
  expect(notJson.status()).toBeGreaterThanOrEqual(400);
  expect(notJson.status()).toBeLessThan(500);
});

test("unknown assessments are not found", async ({ request }) => {
  const res = await request.get("/api/assessments/does-not-exist");
  expect(res.status()).toBe(404);
});

test("findings, measurements, materials and quotations validate their input", async ({ request }) => {
  const job = await (await request.post("/api/assessments", { data: { mode: "assessment", pack: "cctv", siteName: "E2E warehouse" } })).json();
  expect((await request.post("/api/findings", { data: { assessmentId: job.id, title: "ab" } })).status()).toBe(400);
  expect((await request.post("/api/measurements", { data: { assessmentId: job.id, name: "x", formula: "teleport" } })).status()).toBe(400);
  expect(
    (await request.post("/api/materials", { data: { assessmentId: job.id, items: [{ description: "Cable", quantity: 0, unit: "m", rationale: "needed", source: "rule" }] } })).status(),
  ).toBe(400);
  const quote = (unitPrice: number, currency: string) => ({
    assessmentId: job.id,
    materialsVersion: 1,
    supplier: "S",
    currency: "USD",
    items: [{ description: "Cable", quantity: 1, unit: "m", unitPrice, currency }],
  });
  expect((await request.post("/api/quotations", { data: quote(-5, "USD") })).status()).toBe(400);
  expect((await request.post("/api/quotations", { data: quote(5, "usd") })).status()).toBe(400);
});

test("sign-off requires an explicit confirmation", async ({ request }) => {
  const job = await (await request.post("/api/assessments", { data: { mode: "inspection", pack: "solar", siteName: "E2E inspection site" } })).json();
  const snap = await (await request.post("/api/reports/snapshot", { data: { assessmentId: job.id } })).json();
  const res = await request.post("/api/reports/finalize", { data: { snapshotId: snap.snapshot.id } });
  expect(res.status()).toBe(400);
});

test("AI features say they are unavailable rather than returning made-up content", async ({ request }) => {
  const job = await (await request.post("/api/assessments", { data: { mode: "assessment", pack: "solar", siteName: "E2E AI site" } })).json();
  const res = await request.post("/api/ai/clarify", { data: { assessmentId: job.id } });
  expect(res.ok()).toBe(false);
  const body = await res.json();
  expect(JSON.stringify(body)).not.toMatch(/api[_-]?key|Bearer|sk-/i);
  expect(body.error).toBeTruthy();
});
