import { describe, it, expect, vi, beforeEach } from "vitest";

// Deleting a job (D-020): owners and admins only; a finished job needs the site name typed back.
let role: string | null = "admin";
const getDeletionInfo = vi.fn();
const deleteAssessmentLocal = vi.fn();
const verifyAssessmentWorkspace = vi.fn();

vi.mock("../auth", () => ({
  requireWriter: async () => {
    if (role === null) return { error: new Response(JSON.stringify({ error: "Forbidden — your role is read-only in this workspace" }), { status: 403 }) };
    return { auth: { mode: "authenticated", ctx: { role, workspaceId: "w1" } } };
  },
  requireAuth: async () => ({ auth: { mode: "authenticated", ctx: { role, workspaceId: "w1" } } }),
  isAdmin: (a: { ctx: { role?: string } }) => a.ctx.role === "owner" || a.ctx.role === "admin",
  storeError: (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: /forbidden/i.test(msg) ? 403 : /not found/i.test(msg) ? 404 : 400 });
  },
}));
vi.mock("../store", () => ({
  getAssessmentLocal: async () => null,
  getResponsesLocal: async () => [],
  getChecklistItemsLocal: async () => [],
  updateAssessmentContextLocal: async () => true,
  verifyAssessmentWorkspace: (...a: unknown[]) => verifyAssessmentWorkspace(...a),
  getDeletionInfo: (...a: unknown[]) => getDeletionInfo(...a),
  deleteAssessmentLocal: (...a: unknown[]) => deleteAssessmentLocal(...a),
}));

import { DELETE } from "../../app/api/assessments/[id]/route";

const del = (body?: unknown) => DELETE(new Request("http://x/api/assessments/a1", { method: "DELETE", body: body === undefined ? undefined : JSON.stringify(body) }), { params: { id: "a1" } });

beforeEach(() => {
  role = "admin";
  getDeletionInfo.mockReset();
  deleteAssessmentLocal.mockReset();
  verifyAssessmentWorkspace.mockReset();
  verifyAssessmentWorkspace.mockResolvedValue(undefined);
  deleteAssessmentLocal.mockResolvedValue({ deleted: true, hadFinalizedReport: false });
});

describe("DELETE /api/assessments/[id]", () => {
  it("an admin deletes a draft without typing anything", async () => {
    getDeletionInfo.mockResolvedValue({ siteName: "12 Acacia Rd", hasFinalizedReport: false });
    const res = await del();
    expect(res.status).toBe(200);
    expect(deleteAssessmentLocal).toHaveBeenCalledTimes(1);
  });

  it("owners can delete too", async () => {
    role = "owner";
    getDeletionInfo.mockResolvedValue({ siteName: "S", hasFinalizedReport: false });
    expect((await del()).status).toBe(200);
  });

  it("members and view-only people cannot, and nothing is looked up or deleted", async () => {
    role = "member";
    expect((await del()).status).toBe(403);
    role = null;
    expect((await del()).status).toBe(403);
    expect(getDeletionInfo).not.toHaveBeenCalled();
    expect(deleteAssessmentLocal).not.toHaveBeenCalled();
  });

  it("a job with a finalized report needs the site name typed back (case and spaces ignored)", async () => {
    getDeletionInfo.mockResolvedValue({ siteName: "12 Acacia Rd", hasFinalizedReport: true });
    const none = await del();
    expect(none.status).toBe(400);
    expect(((await none.json()) as { needsConfirmName?: boolean }).needsConfirmName).toBe(true);
    expect((await del({ confirmName: "wrong name" })).status).toBe(400);
    expect(deleteAssessmentLocal).not.toHaveBeenCalled();
    deleteAssessmentLocal.mockResolvedValue({ deleted: true, hadFinalizedReport: true });
    const ok = await del({ confirmName: "  12 acacia rd " });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { hadFinalizedReport: boolean }).hadFinalizedReport).toBe(true);
  });

  it("an unknown job is a 404 and a job from another workspace is refused before anything else", async () => {
    getDeletionInfo.mockResolvedValue(null);
    expect((await del()).status).toBe(404);
    verifyAssessmentWorkspace.mockRejectedValue(new Error("Forbidden — assessment not found in your workspace"));
    expect((await del()).status).toBe(403);
    expect(deleteAssessmentLocal).not.toHaveBeenCalled();
  });

  it("a failed delete is reported and does not claim success", async () => {
    getDeletionInfo.mockResolvedValue({ siteName: "S", hasFinalizedReport: false });
    deleteAssessmentLocal.mockRejectedValue(new Error("Forbidden — only an owner or admin can delete a job"));
    const res = await del();
    expect(res.status).toBe(403);
    expect(((await res.json()) as { ok?: boolean }).ok).toBeUndefined();
  });
});
