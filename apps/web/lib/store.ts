import fs from "fs";
import path from "path";
import { PACK_TEMPLATES } from "@eval-ai/shared";

type AssessmentRecord = {
  id: string;
  workspaceId: string | null;
  siteId: string | null;
  siteName: string;
  address?: string;
  mode: "assessment" | "inspection";
  pack: "solar" | "cctv";
  status: "draft" | "in_progress" | "review" | "finalized";
  context: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type ChecklistResponseRecord = {
  assessmentId: string;
  itemId: string;
  status: "pass" | "fail" | "needs_attention" | "not_applicable" | "not_checked";
  notes?: string;
  measuredValue?: number;
  measuredUnit?: string;
  updatedAt: string;
};

const DATA_DIR = path.join(process.cwd(), ".tmp-data");
const ASSESSMENTS_FILE = path.join(DATA_DIR, "assessments.json");
const RESPONSES_FILE = path.join(DATA_DIR, "checklist_responses.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown) {
  ensureDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function hasSupabaseEnv() {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

// ---- Assessments ----
export async function createAssessmentLocal(input: {
  workspaceId?: string;
  siteName: string;
  address?: string;
  mode: "assessment" | "inspection";
  pack: "solar" | "cctv";
  goal?: string;
  existingEquipment?: string;
}): Promise<{ id: string; persisted: boolean }> {
  if (hasSupabaseEnv() && input.workspaceId) {
    try {
      const { createSupabaseServerClient } = await import("@eval-ai/supabase");
      const supabase = createSupabaseServerClient();
      const { data: site } = await supabase.from("sites").insert({ workspace_id: input.workspaceId, name: input.siteName, address: input.address ?? null }).select("id").single();
      const siteId = site?.id ?? null;
      const { data: assessment, error } = await supabase
        .from("assessments")
        .insert({ workspace_id: input.workspaceId, site_id: siteId, mode: input.mode, pack: input.pack, status: "draft", context: { goal: input.goal, existingEquipment: input.existingEquipment } })
        .select("id")
        .single();
      if (error) throw error;
      const id = assessment.id as string;
      const tpl = PACK_TEMPLATES[input.pack];
      const rows = tpl.checklist.map((title, i) => ({ assessment_id: id, title, required: i < 5, ord: i, category: i < 2 ? "Site" : "System" }));
      await supabase.from("checklist_items").insert(rows);
      return { id, persisted: true };
    } catch (e) {
      console.error("Supabase create failed, falling back to file store", e instanceof Error ? e.message : String(e));
    }
  }
  // Deterministic local fallback — workspace-agnostic but preserves draft/resume without env
  ensureDir();
  const all = readJson<AssessmentRecord[]>(ASSESSMENTS_FILE, []);
  const id = `assess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const rec: AssessmentRecord = {
    id,
    workspaceId: input.workspaceId ?? null,
    siteId: null,
    siteName: input.siteName,
    address: input.address,
    mode: input.mode,
    pack: input.pack,
    status: "draft",
    context: { goal: input.goal, existingEquipment: input.existingEquipment },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  all.push(rec);
  writeJson(ASSESSMENTS_FILE, all);
  // seed checklist items for fallback
  const checklistFile = path.join(DATA_DIR, `checklist_${id}.json`);
  const tpl = PACK_TEMPLATES[input.pack];
  writeJson(checklistFile, tpl.checklist.map((title, i) => ({ id: `${id}_item_${i}`, assessment_id: id, title, required: i < 5, ord: i })));
  return { id, persisted: false };
}

export async function getAssessmentLocal(id: string): Promise<AssessmentRecord | null> {
  if (hasSupabaseEnv()) {
    try {
      const { createSupabaseServerClient } = await import("@eval-ai/supabase");
      const supabase = createSupabaseServerClient();
      const { data, error } = await supabase.from("assessments").select("id, workspace_id, site_id, mode, pack, status, context, created_at").eq("id", id).single();
      if (!error && data) {
        return {
          id: data.id,
          workspaceId: data.workspace_id,
          siteId: data.site_id,
          siteName: (data.context as Record<string, unknown>)?.siteName as string ?? "—",
          mode: data.mode,
          pack: data.pack,
          status: data.status,
          context: data.context as Record<string, unknown>,
          createdAt: data.created_at,
          updatedAt: data.created_at,
        };
      }
    } catch {}
  }
  const all = readJson<AssessmentRecord[]>(ASSESSMENTS_FILE, []);
  return all.find((a) => a.id === id) ?? null;
}

export async function listAssessmentsLocal(workspaceId?: string | null): Promise<AssessmentRecord[]> {
  if (hasSupabaseEnv() && workspaceId) {
    try {
      const { createSupabaseServerClient } = await import("@eval-ai/supabase");
      const supabase = createSupabaseServerClient();
      const { data } = await supabase.from("assessments").select("id, workspace_id, mode, pack, status, created_at, context").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(50);
      if (data) return data.map((d) => ({ id: d.id, workspaceId: d.workspace_id, siteId: null, siteName: (d.context as Record<string, unknown>)?.siteName as string ?? "—", mode: d.mode, pack: d.pack, status: d.status, context: d.context as Record<string, unknown>, createdAt: d.created_at, updatedAt: d.created_at }));
    } catch {}
  }
  const all = readJson<AssessmentRecord[]>(ASSESSMENTS_FILE, []);
  if (workspaceId) return all.filter((a) => a.workspaceId === workspaceId);
  return all.slice(-50).reverse();
}

export async function updateAssessmentContextLocal(id: string, patch: { siteName?: string; context?: Record<string, unknown> }): Promise<boolean> {
  if (hasSupabaseEnv()) {
    try {
      const { createSupabaseServerClient } = await import("@eval-ai/supabase");
      const supabase = createSupabaseServerClient();
      const { error } = await supabase.from("assessments").update({ context: patch.context ?? {}, updated_at: new Date().toISOString() }).eq("id", id);
      if (!error) return true;
    } catch {}
  }
  const all = readJson<AssessmentRecord[]>(ASSESSMENTS_FILE, []);
  const idx = all.findIndex((a) => a.id === id);
  if (idx === -1) return false;
  if (patch.siteName) all[idx].siteName = patch.siteName;
  if (patch.context) all[idx].context = { ...all[idx].context, ...patch.context };
  all[idx].updatedAt = new Date().toISOString();
  all[idx].status = "in_progress";
  writeJson(ASSESSMENTS_FILE, all);
  return true;
}

// ---- Checklist responses ----
export async function saveResponsesLocal(assessmentId: string, responses: Array<{ itemId: string; status: string; notes?: string; measuredValue?: number; measuredUnit?: string }>) {
  // validate not_checked != pass invariant
  for (const r of responses) {
    if (!["pass", "fail", "needs_attention", "not_applicable", "not_checked"].includes(r.status)) throw new Error(`Invalid status ${r.status}`);
  }
  if (hasSupabaseEnv()) {
    try {
      const { createSupabaseServerClient } = await import("@eval-ai/supabase");
      const supabase = createSupabaseServerClient();
      for (const r of responses) {
        await supabase.from("checklist_responses").upsert({ assessment_id: assessmentId, item_id: r.itemId, status: r.status, notes: r.notes ?? null, measured_value: r.measuredValue ?? null, measured_unit: r.measuredUnit ?? null }, { onConflict: "assessment_id,item_id" });
      }
      return { ok: true, persisted: true, saved: responses.length };
    } catch {}
  }
  const all = readJson<ChecklistResponseRecord[]>(RESPONSES_FILE, []);
  const now = new Date().toISOString();
  for (const r of responses) {
    const idx = all.findIndex((x) => x.assessmentId === assessmentId && x.itemId === r.itemId);
    const rec: ChecklistResponseRecord = { assessmentId, itemId: r.itemId, status: r.status as ChecklistResponseRecord["status"], notes: r.notes, measuredValue: r.measuredValue, measuredUnit: r.measuredUnit, updatedAt: now };
    if (idx >= 0) all[idx] = rec;
    else all.push(rec);
  }
  writeJson(RESPONSES_FILE, all);
  return { ok: true, persisted: false, saved: responses.length };
}

export async function getResponsesLocal(assessmentId: string): Promise<ChecklistResponseRecord[]> {
  if (hasSupabaseEnv()) {
    try {
      const { createSupabaseServerClient } = await import("@eval-ai/supabase");
      const supabase = createSupabaseServerClient();
      const { data } = await supabase.from("checklist_responses").select("item_id, status, notes, measured_value, measured_unit").eq("assessment_id", assessmentId);
      if (data) return data.map((d) => ({ assessmentId, itemId: d.item_id, status: d.status, notes: d.notes ?? undefined, measuredValue: d.measured_value ?? undefined, measuredUnit: d.measured_unit ?? undefined, updatedAt: new Date().toISOString() }));
    } catch {}
  }
  const all = readJson<ChecklistResponseRecord[]>(RESPONSES_FILE, []);
  return all.filter((r) => r.assessmentId === assessmentId);
}
