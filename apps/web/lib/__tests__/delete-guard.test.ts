import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// Deleting a job (D-020): the delete controls exist only for owners/admins, and the migration keeps the report guard narrow.
const root = path.join(__dirname, "../../../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("delete job: who sees it and how it is protected", () => {
  it("the web card renders only for admins and the mobile card only when the role is loaded and admin", () => {
    const web = read("apps/web/components/DeleteJobCard.tsx");
    expect(web).toMatch(/if \(!loaded \|\| !isAdmin\) return null/);
    expect(read("apps/mobile/app/assessments/[id].tsx")).toContain("roleLoaded && isAdmin");
  });

  it("the route checks the role and the typed name on the server", () => {
    const route = read("apps/web/app/api/assessments/[id]/route.ts");
    expect(route).toMatch(/export async function DELETE/);
    expect(route).toContain("isAdmin(auth)");
    expect(route).toContain("hasFinalizedReport");
    expect(route).toContain("needsConfirmName");
  });

  it("the database function is admin-only, switches the guard off for one transaction, and records the deletion", () => {
    const sql = read("supabase/migrations/0015_delete_job.sql");
    expect(sql).toContain("has_workspace_role(ws, array['owner','admin'])");
    expect(sql).toContain("set_config('app.job_deletion', 'on', true)");
    expect(sql).toContain("set_config('app.job_deletion', 'off', true)");
    expect(sql).toContain("insert into audit_events");
    expect(sql).toMatch(/revoke execute on function delete_assessment\(uuid\) from public, anon/);
    // The guard still blocks a finalized delete unless the flag is on AND the caller is an admin of that workspace.
    expect(sql).toMatch(/app\.job_deletion[\s\S]*has_workspace_role\(old\.workspace_id/);
  });

  it("files are removed after the database step, not before", () => {
    const store = read("apps/web/lib/store.ts");
    const fn = store.slice(store.indexOf("export async function deleteAssessmentLocal"));
    expect(fn.indexOf('rpc("delete_assessment"')).toBeGreaterThan(-1);
    expect(fn.indexOf('rpc("delete_assessment"')).toBeLessThan(fn.indexOf('removeStorageKeys("evidence"'));
  });
});
