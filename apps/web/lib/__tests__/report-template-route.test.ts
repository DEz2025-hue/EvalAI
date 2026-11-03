import { describe, it, expect, vi, beforeEach } from "vitest";

let role = "owner";
vi.mock("../auth", async (orig) => {
  const real = await orig<typeof import("../auth")>();
  const auth = () => ({ mode: "authenticated", ctx: { role, userId: "u1", workspaceId: "w1" } });
  return { ...real, requireAuth: async () => ({ auth: auth() }), requireWriter: async () => ({ auth: auth() }), isAdmin: (a: { ctx: { role?: string } }) => a.ctx.role === "owner" || a.ctx.role === "admin" };
});
const save = vi.fn();
const get = vi.fn();
const reset = vi.fn();
const reapply = vi.fn();
vi.mock("../store", () => ({
  getReportTemplateLocal: (...a: unknown[]) => get(...a),
  saveReportTemplateLocal: (...a: unknown[]) => save(...a),
  resetReportTemplateLocal: (...a: unknown[]) => reset(...a),
  reapplyReportTemplateLocal: (...a: unknown[]) => reapply(...a),
}));

import { GET, PUT, DELETE } from "../../app/api/report-template/route";
import { POST as apply } from "../../app/api/reports/template-apply/route";

const put = (body: unknown) => PUT(new Request("http://x/api/report-template", { method: "PUT", body: typeof body === "string" ? body : JSON.stringify(body) }));
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

beforeEach(() => {
  role = "owner";
  for (const m of [save, get, reset, reapply]) m.mockReset();
  save.mockImplementation(async (t) => t);
  get.mockResolvedValue(null);
  reapply.mockResolvedValue({ id: "s1" });
});

describe("/api/report-template", () => {
  it("anyone in the workspace can read it; the default is returned when none is set", async () => {
    role = "viewer";
    const out = await (await GET()).json();
    expect(out.isDefault).toBe(true);
    expect(out.canEdit).toBe(false);
    expect(out.template.sections).toHaveLength(10);
  });

  it("only an owner or admin can change or reset it", async () => {
    for (const r of ["member", "viewer"]) {
      role = r;
      expect((await put({ sections: [] })).status).toBe(403);
      expect((await DELETE()).status).toBe(403);
    }
    expect(save).not.toHaveBeenCalled();
    role = "admin";
    expect((await put({ officeName: "X", sections: [] })).status).toBe(200);
    expect((await DELETE()).status).toBe(200);
  });

  it("refuses a bad colour, a logo that is not an image, a logo that is too big, and malformed bodies", async () => {
    expect((await put({ accentColor: "red", sections: [] })).status).toBe(400);
    expect((await put({ logo: "data:text/html;base64,AAAA", sections: [] })).status).toBe(400);
    expect((await put({ logo: "data:image/png;base64," + "A".repeat(460_000), sections: [] })).status).toBe(413);
    expect((await put("not json")).status).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });

  it("saves a valid style", async () => {
    const res = await put({ officeName: "Bright", logo: PNG, accentColor: "#0f172a", sections: [{ id: "summary", visible: true }] });
    expect(res.status).toBe(200);
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe("/api/reports/template-apply", () => {
  it("re-applies the style to a draft", async () => {
    const res = await apply(new Request("http://x", { method: "POST", body: JSON.stringify({ snapshotId: "snap-1" }) }));
    expect(res.status).toBe(200);
    expect(reapply).toHaveBeenCalledWith("snap-1", expect.anything());
  });

  it("a finalized report is refused", async () => {
    reapply.mockRejectedValue(new Error("This report is finalized (immutable) — create a new draft to use the current style"));
    expect((await apply(new Request("http://x", { method: "POST", body: JSON.stringify({ snapshotId: "snap-1" }) }))).status).toBe(400);
  });
});
