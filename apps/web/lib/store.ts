import fs from "fs";
import path from "path";
import { PACK_TEMPLATES, buildReportHtml } from "@eval-ai/shared";
import type { ReportSnapshot, ReportInput } from "@eval-ai/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

// Request store context — carried by auth.ts RequestAuth for workspace-scoped
// server operations. All fields optional: demo mode passes {}, authenticated
// mode passes { supabase, userId, workspaceId }.
export type StoreCtx = {
  supabase?: SupabaseClient;
  userId?: string;
  workspaceId?: string;
};

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

// ---- Context-aware client resolution ----
// Authenticated routes pass their request ctx (user-scoped client, RLS enforced).
// Anything without a ctx falls back to the service-role client (demo/admin path).
async function serviceClient(): Promise<SupabaseClient> {
  const { createSupabaseServerClient } = await import("@eval-ai/supabase");
  return createSupabaseServerClient();
}

async function clientFor(ctx?: StoreCtx): Promise<SupabaseClient> {
  if (ctx?.supabase) return ctx.supabase;
  return serviceClient();
}

function workspaceOf(ctx?: StoreCtx, fallback?: string | null): string | null {
  return ctx?.workspaceId ?? fallback ?? null;
}

/** Non-uuid ids (demo `assess_…`, synthetic `${id}_item_${i}`) can never satisfy uuid FKs — link assessment-level instead. */
export function asUuidOrNull(v: string | null | undefined): string | null {
  if (!v) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : null;
}

/** Throw 403-style error when an assessment is outside the request workspace. Demo/file mode skips. */
export async function verifyAssessmentWorkspace(ctx: StoreCtx | undefined, assessmentId: string): Promise<void> {
  if (!ctx?.supabase || !ctx.workspaceId) return;
  if (!asUuidOrNull(assessmentId)) return; // file-fallback ids have no Supabase row to check
  const { data } = await ctx.supabase.from("assessments").select("workspace_id").eq("id", assessmentId).single();
  if (data && (data as { workspace_id: string }).workspace_id !== ctx.workspaceId) {
    throw new Error("Forbidden — assessment belongs to a different workspace");
  }
}

export type ChecklistItemRecord = {
  id: string;
  assessmentId: string;
  title: string;
  instructions?: string;
  required: boolean;
  ord: number;
  category?: string;
};

// ---- Assessments ----
export async function createAssessmentLocal(input: {
  workspaceId?: string;
  siteName: string;
  address?: string;
  mode: "assessment" | "inspection";
  pack: "solar" | "cctv";
  goal?: string;
  existingEquipment?: string;
  ctx?: StoreCtx;
}): Promise<{ id: string; persisted: boolean; items: ChecklistItemRecord[] }> {
  const workspaceId = workspaceOf(input.ctx, input.workspaceId);
  if (hasSupabaseEnv() && workspaceId) {
    try {
      const supabase = await clientFor(input.ctx);
      const { data: site } = await supabase.from("sites").insert({ workspace_id: workspaceId, name: input.siteName, address: input.address ?? null }).select("id").single();
      const siteId = site?.id ?? null;
      const { data: assessment, error } = await supabase
        .from("assessments")
        .insert({ workspace_id: workspaceId, site_id: siteId, mode: input.mode, pack: input.pack, status: "draft", context: { siteName: input.siteName, goal: input.goal, existingEquipment: input.existingEquipment } })
        .select("id")
        .single();
      if (error) throw error;
      const id = assessment.id as string;
      const tpl = PACK_TEMPLATES[input.pack];
      const rows = tpl.checklist.map((title, i) => ({ assessment_id: id, title, required: i < 5, ord: i, category: i < 2 ? "Site" : "System" }));
      const { data: inserted, error: itemsErr } = await supabase.from("checklist_items").insert(rows).select("id, title, required, ord, category");
      if (itemsErr) throw itemsErr;
      await auditEvent({ workspaceId, action: "assessment.created", targetType: "assessment", targetId: id, ctx: input.ctx });
      const items: ChecklistItemRecord[] = ((inserted ?? []) as Array<{ id: string; title: string; required: boolean; ord: number; category: string | null }>).map((r) => ({ id: r.id, assessmentId: id, title: r.title, required: r.required, ord: r.ord, category: r.category ?? undefined }));
      return { id, persisted: true, items };
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
  const seeded: ChecklistItemRecord[] = tpl.checklist.map((title, i) => ({ id: `${id}_item_${i}`, assessmentId: id, title, required: i < 5, ord: i, category: i < 2 ? "Site" : "System" }));
  writeJson(checklistFile, seeded);
  return { id, persisted: false, items: seeded };
}

export async function getAssessmentLocal(id: string, ctx?: StoreCtx): Promise<AssessmentRecord | null> {
  if (hasSupabaseEnv()) {
    try {
      const supabase = await clientFor(ctx);
      const { data, error } = await supabase.from("assessments").select("id, workspace_id, site_id, mode, pack, status, context, created_at").eq("id", id).single();
      if (!error && data) {
        return {
          id: data.id,
          workspaceId: data.workspace_id,
          siteId: data.site_id,
          siteName: (data.context as Record<string, unknown>)?.siteName as string ?? (data.context as Record<string, unknown>)?.goal as string ?? "—",
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

export async function listAssessmentsLocal(workspaceId?: string | null, ctx?: StoreCtx): Promise<AssessmentRecord[]> {
  const ws = workspaceOf(ctx, workspaceId);
  if (hasSupabaseEnv() && ws) {
    try {
      const supabase = await clientFor(ctx);
      const { data } = await supabase.from("assessments").select("id, workspace_id, mode, pack, status, created_at, context").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(50);
      if (data) return data.map((d) => ({ id: d.id, workspaceId: d.workspace_id, siteId: null, siteName: (d.context as Record<string, unknown>)?.siteName as string ?? "—", mode: d.mode, pack: d.pack, status: d.status, context: d.context as Record<string, unknown>, createdAt: d.created_at, updatedAt: d.created_at }));
    } catch {}
  }
  const all = readJson<AssessmentRecord[]>(ASSESSMENTS_FILE, []);
  if (workspaceId) return all.filter((a) => a.workspaceId === workspaceId);
  return all.slice(-50).reverse();
}

export async function updateAssessmentContextLocal(id: string, patch: { siteName?: string; context?: Record<string, unknown> }, ctx?: StoreCtx): Promise<boolean> {
  if (hasSupabaseEnv()) {
    try {
      const supabase = await clientFor(ctx);
      // Merge with stored context (file fallback merges too) — never drop existing keys.
      const { data: current } = await supabase.from("assessments").select("context").eq("id", id).single();
      const merged = { ...((current?.context as Record<string, unknown>) ?? {}), ...(patch.context ?? {}) };
      if (patch.siteName) merged.siteName = patch.siteName;
      const { error } = await supabase.from("assessments").update({ context: merged, updated_at: new Date().toISOString() }).eq("id", id);
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

// ---- Checklist items (editable per assessment) ----
export async function getChecklistItemsLocal(assessmentId: string, ctx?: StoreCtx): Promise<ChecklistItemRecord[]> {
  if (hasSupabaseEnv() && asUuidOrNull(assessmentId)) {
    try {
      const supabase = await clientFor(ctx);
      const { data } = await supabase.from("checklist_items").select("id, title, instructions, required, ord, category").eq("assessment_id", assessmentId).order("ord");
      if (data?.length) return (data as Array<{ id: string; title: string; instructions: string | null; required: boolean; ord: number; category: string | null }>).map((r) => ({ id: r.id, assessmentId, title: r.title, instructions: r.instructions ?? undefined, required: r.required, ord: r.ord, category: r.category ?? undefined }));
    } catch {}
  }
  const file = path.join(DATA_DIR, `checklist_${assessmentId}.json`);
  const rows = readJson<ChecklistItemRecord[]>(file, []);
  return [...rows].sort((a, b) => a.ord - b.ord);
}

export async function replaceChecklistItemsLocal(
  assessmentId: string,
  items: Array<{ title: string; instructions?: string; required?: boolean; category?: string }>,
  ctx?: StoreCtx
): Promise<{ items: ChecklistItemRecord[]; persisted: boolean }> {
  const normalized = items
    .map((it) => ({ title: it.title.trim(), instructions: it.instructions, required: it.required ?? false, category: it.category }))
    .filter((it) => it.title.length > 0);
  if (normalized.length === 0) throw new Error("Checklist must keep at least one item");
  await verifyAssessmentWorkspace(ctx, assessmentId);
  if (hasSupabaseEnv() && asUuidOrNull(assessmentId)) {
    try {
      const supabase = await clientFor(ctx);
      const { error: delErr } = await supabase.from("checklist_items").delete().eq("assessment_id", assessmentId);
      if (delErr) throw delErr;
      const rows = normalized.map((it, i) => ({ assessment_id: assessmentId, title: it.title, instructions: it.instructions ?? null, required: it.required, ord: i, category: it.category ?? null }));
      const { data: inserted, error: insErr } = await supabase.from("checklist_items").insert(rows).select("id, title, instructions, required, ord, category");
      if (insErr) throw insErr;
      // Drop orphaned responses for removed items so stale ids never reappear
      const keepIds = new Set(((inserted ?? []) as Array<{ id: string }>).map((r) => r.id));
      if (keepIds.size > 0) {
        const { data: existing } = await supabase.from("checklist_responses").select("item_id").eq("assessment_id", assessmentId);
        const stale = ((existing ?? []) as Array<{ item_id: string }>).map((r) => r.item_id).filter((id) => !keepIds.has(id));
        if (stale.length > 0) await supabase.from("checklist_responses").delete().eq("assessment_id", assessmentId).in("item_id", stale);
      }
      const out: ChecklistItemRecord[] = ((inserted ?? []) as Array<{ id: string; title: string; instructions: string | null; required: boolean; ord: number; category: string | null }>).map((r) => ({ id: r.id, assessmentId, title: r.title, instructions: r.instructions ?? undefined, required: r.required, ord: r.ord, category: r.category ?? undefined }));
      return { items: out, persisted: true };
    } catch (e) {
      console.error("Supabase checklist replace failed, falling back to file store", e instanceof Error ? e.message : String(e));
    }
  }
  const file = path.join(DATA_DIR, `checklist_${assessmentId}.json`);
  const prev = readJson<ChecklistItemRecord[]>(file, []);
  const prevByTitle = new Map(prev.map((p) => [p.title, p.id]));
  const out: ChecklistItemRecord[] = normalized.map((it, i) => ({ id: prevByTitle.get(it.title) ?? `${assessmentId}_item_${i}`, assessmentId, title: it.title, instructions: it.instructions, required: it.required, ord: i, category: it.category }));
  writeJson(file, out);
  return { items: out, persisted: false };
}

// ---- Materials ----
type MaterialRecord = { id: string; assessmentId: string; workspaceId?: string | null; description: string; specification?: string; quantity: number; unit: string; rationale: string; source: "measurement"|"finding"|"rule"|"user_input"; provisional: boolean; assumptions: string[]; findingId?: string; ord: number; listId: string; version: number };
type QuotationRecord = { id: string; assessmentId: string; workspaceId?: string | null; materialsListId: string; materialsVersion: number; supplier: string; reference?: string; date: string; currency: string; items: Array<{ description: string; quantity: number; unit: string; unitPrice: number; currency: string; taxesOrFees?: number }>; total: number; stale: boolean; reviewStatus: string; createdAt: string };

const MATERIALS_FILE = path.join(DATA_DIR, "materials.json");
const QUOTATIONS_FILE = path.join(DATA_DIR, "quotations.json");

export async function saveMaterialsLocal(assessmentId: string, items: Array<{ description: string; specification?: string; quantity: number; unit: string; rationale: string; source: "measurement"|"finding"|"rule"|"user_input"; provisional?: boolean; assumptions?: string[]; findingId?: string }>, version?: number, workspaceId?: string | null, ctx?: StoreCtx): Promise<{ ok: boolean; version: number; persisted: boolean; provisionalCount: number }> {
  const nextVersion = (version ?? 0) + 1;
  // Auto-mark provisional if rationale too short or assumptions empty and source is measurement/finding
  const enriched = items.map((it, idx) => ({
    ...it,
    provisional: it.provisional ?? (it.rationale.length < 10 || (!it.assumptions?.length && ["measurement","finding"].includes(it.source))),
    assumptions: it.assumptions ?? [],
    ord: idx,
  }));
  const provisionalCount = enriched.filter((i) => i.provisional).length;
  const ws = workspaceOf(ctx, workspaceId);
  await verifyAssessmentWorkspace(ctx, assessmentId);
  if (hasSupabaseEnv() && ws) {
    try {
      const supabase = await clientFor(ctx);
      const { data: list } = await supabase.from("materials_lists").insert({ assessment_id: assessmentId, workspace_id: ws, version: nextVersion }).select("id").single();
      const listId = list?.id as string;
      if (listId) {
        for (const it of enriched) await supabase.from("materials_items").insert({ list_id: listId, description: it.description, specification: it.specification ?? null, quantity: it.quantity, unit: it.unit, rationale: it.rationale, source: it.source, provisional: it.provisional, assumptions: it.assumptions, finding_id: it.findingId ?? null, ord: it.ord });
        return { ok: true, version: nextVersion, persisted: true, provisionalCount };
      }
    } catch {}
  }
  const all = readJson<MaterialRecord[]>(MATERIALS_FILE, []);
  for (const it of enriched) {
    all.push({ id: `mat_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, assessmentId, workspaceId: ws, description: it.description, specification: it.specification, quantity: it.quantity, unit: it.unit, rationale: it.rationale, source: it.source, provisional: !!it.provisional, assumptions: it.assumptions ?? [], findingId: it.findingId, ord: it.ord, listId: `list_${assessmentId}_v${nextVersion}`, version: nextVersion });
  }
  writeJson(MATERIALS_FILE, all);
  // Mark existing quotations stale when materials change
  const quotes = readJson<QuotationRecord[]>(QUOTATIONS_FILE, []);
  for (const q of quotes) if (q.assessmentId === assessmentId) { q.stale = true; q.reviewStatus = "stale_needs_review"; }
  writeJson(QUOTATIONS_FILE, quotes);
  return { ok: true, version: nextVersion, persisted: false, provisionalCount };
}

export async function getMaterialsLocal(assessmentId: string, ctx?: StoreCtx): Promise<MaterialRecord[]> {
  if (hasSupabaseEnv()) {
    try {
      const supabase = await clientFor(ctx);
      const { data: lists } = await supabase.from("materials_lists").select("id, version").eq("assessment_id", assessmentId).order("version", { ascending: false }).limit(1);
      const list = lists?.[0];
      if (list) {
        const { data: items } = await supabase.from("materials_items").select("*").eq("list_id", list.id).order("ord");
        if (items) return items.map((it) => ({ id: it.id, assessmentId, workspaceId: null, description: it.description, specification: it.specification ?? undefined, quantity: it.quantity, unit: it.unit, rationale: it.rationale, source: it.source, provisional: it.provisional, assumptions: it.assumptions ?? [], findingId: it.finding_id ?? undefined, ord: it.ord, listId: it.list_id, version: list.version }));
      }
    } catch {}
  }
  const all = readJson<MaterialRecord[]>(MATERIALS_FILE, []);
  return all.filter((m) => m.assessmentId === assessmentId);
}

export async function getMaterialsVersionLocal(assessmentId: string): Promise<number> {
  const mats = await getMaterialsLocal(assessmentId);
  if (mats.length === 0) return 0;
  return Math.max(...mats.map((m) => m.version));
}

export async function saveQuotationLocal(input: { assessmentId: string; workspaceId?: string | null; materialsVersion: number; supplier: string; currency: string; items: Array<{ description: string; quantity: number; unit: string; unitPrice: number; currency: string; taxesOrFees?: number }>; date?: string; reference?: string; ctx?: StoreCtx }): Promise<{ ok: boolean; total: number; persisted: boolean; id: string }> {
  const total = input.items.reduce((s, it) => s + it.quantity * it.unitPrice + (it.taxesOrFees ?? 0), 0);
  const ws = workspaceOf(input.ctx, input.workspaceId);
  await verifyAssessmentWorkspace(input.ctx, input.assessmentId);
  if (hasSupabaseEnv() && ws && asUuidOrNull(input.assessmentId)) {
    try {
      const supabase = await clientFor(input.ctx);
      const { data: lists } = await supabase.from("materials_lists").select("id").eq("assessment_id", input.assessmentId).order("version", { ascending: false }).limit(1);
      const listId = lists?.[0]?.id ?? null;
      if (!listId) throw new Error("No materials list for this assessment — save materials first");
      const { data: q, error: qErr } = await supabase.from("quotations").insert({ workspace_id: ws, assessment_id: input.assessmentId, materials_list_id: listId, materials_version: input.materialsVersion, supplier: input.supplier, reference: input.reference ?? null, date: input.date ?? new Date().toISOString().slice(0,10), currency: input.currency, total }).select("id").single();
      if (qErr) throw qErr;
      const qid = q?.id as string;
      if (qid) { for (const it of input.items) await supabase.from("quotation_items").insert({ quotation_id: qid, description: it.description, quantity: it.quantity, unit: it.unit, unit_price: it.unitPrice, currency: it.currency, taxes_or_fees: it.taxesOrFees ?? null }); return { ok: true, total, persisted: true, id: qid }; }
    } catch {}
  }
  const all = readJson<QuotationRecord[]>(QUOTATIONS_FILE, []);
  const id = `quote_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
  all.push({ id, assessmentId: input.assessmentId, workspaceId: ws, materialsListId: `list_${input.assessmentId}_v${input.materialsVersion}`, materialsVersion: input.materialsVersion, supplier: input.supplier, reference: input.reference, date: input.date ?? new Date().toISOString().slice(0,10), currency: input.currency, items: input.items, total, stale: false, reviewStatus: "pending", createdAt: new Date().toISOString() });
  writeJson(QUOTATIONS_FILE, all);
  return { ok: true, total, persisted: false, id };
}

export async function getQuotationsLocal(assessmentId: string, ctx?: StoreCtx): Promise<QuotationRecord[]> {
  if (hasSupabaseEnv()) {
    try {
      const supabase = await clientFor(ctx);
      const { data } = await supabase.from("quotations").select("id, materials_version, supplier, currency, total, stale, review_status, date, quotation_items(description, quantity, unit, unit_price, currency, taxes_or_fees)").eq("assessment_id", assessmentId).order("created_at", { ascending: false });
      if (data) return data.map((d) => ({ id: d.id, assessmentId, workspaceId: null, materialsListId: "", materialsVersion: d.materials_version, supplier: d.supplier, reference: undefined, date: d.date, currency: d.currency, items: ((d.quotation_items ?? []) as Array<{ description: string; quantity: number; unit: string; unit_price: number; currency: string; taxes_or_fees: number | null }>).map((it) => ({ description: it.description, quantity: it.quantity, unit: it.unit, unitPrice: it.unit_price, currency: it.currency, taxesOrFees: it.taxes_or_fees ?? undefined })), total: d.total ?? 0, stale: d.stale, reviewStatus: d.review_status, createdAt: "" }));
    } catch {}
  }
  const all = readJson<QuotationRecord[]>(QUOTATIONS_FILE, []);
  return all.filter((q) => q.assessmentId === assessmentId);
}

// ---- Checklist responses ----
export async function saveResponsesLocal(assessmentId: string, responses: Array<{ itemId: string; status: string; notes?: string; measuredValue?: number; measuredUnit?: string }>, ctx?: StoreCtx) {
  // validate not_checked != pass invariant
  for (const r of responses) {
    if (!["pass", "fail", "needs_attention", "not_applicable", "not_checked"].includes(r.status)) throw new Error(`Invalid status ${r.status}`);
  }
  await verifyAssessmentWorkspace(ctx, assessmentId);
  if (hasSupabaseEnv() && asUuidOrNull(assessmentId)) {
    try {
      const supabase = await clientFor(ctx);
      for (const r of responses) {
        if (!asUuidOrNull(r.itemId)) throw new Error(`Unknown checklist item ${r.itemId} — confirm the checklist first so items exist`);
        const { error } = await supabase.from("checklist_responses").upsert({ assessment_id: assessmentId, item_id: r.itemId, status: r.status, notes: r.notes ?? null, measured_value: r.measuredValue ?? null, measured_unit: r.measuredUnit ?? null }, { onConflict: "assessment_id,item_id" });
        if (error) throw error;
      }
      return { ok: true, persisted: true, saved: responses.length };
    } catch (e) {
      console.error("Supabase responses save failed, falling back to file store", e instanceof Error ? e.message : String(e));
    }
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

export async function getResponsesLocal(assessmentId: string, ctx?: StoreCtx): Promise<ChecklistResponseRecord[]> {
  if (hasSupabaseEnv()) {
    try {
      const supabase = await clientFor(ctx);
      const { data } = await supabase.from("checklist_responses").select("item_id, status, notes, measured_value, measured_unit").eq("assessment_id", assessmentId);
      if (data) return data.map((d) => ({ assessmentId, itemId: d.item_id, status: d.status, notes: d.notes ?? undefined, measuredValue: d.measured_value ?? undefined, measuredUnit: d.measured_unit ?? undefined, updatedAt: new Date().toISOString() }));
    } catch {}
  }
  const all = readJson<ChecklistResponseRecord[]>(RESPONSES_FILE, []);
  return all.filter((r) => r.assessmentId === assessmentId);
}

// ---- Report snapshots — Phase 6: immutable, versioned, deterministic assembly ----
export type SnapshotRecord = ReportSnapshot & {
  workspaceId: string | null;
  payload: ReportInput;
};

const SNAPSHOTS_FILE = path.join(DATA_DIR, "report_snapshots.json");

async function nextAssessmentVersion(assessmentId: string, ctx?: StoreCtx): Promise<number> {
  if (hasSupabaseEnv() && asUuidOrNull(assessmentId)) {
    try {
      const supabase = await clientFor(ctx);
      const { count } = await supabase.from("report_snapshots").select("id", { count: "exact", head: true }).eq("assessment_id", assessmentId);
      if (typeof count === "number") return count + 1;
    } catch {}
  }
  const all = readJson<SnapshotRecord[]>(SNAPSHOTS_FILE, []);
  const counts = all.filter((s) => s.assessmentId === assessmentId).length;
  return counts + 1;
}

export async function buildReportInputFromStoredFacts(
  assessmentId: string,
  opts: { includeMaterials?: boolean; limitations?: string[] } = {},
  ctx?: StoreCtx
): Promise<{ input: ReportInput; assessment: AssessmentRecord; versions: { assessmentVersion: number; checklistVersion: string; materialsVersion: number | null; quotationVersion: number | null; materialsVersionId: string | null; quotationVersionId: string | null } }> {
  const assessment = await getAssessmentLocal(assessmentId, ctx);
  if (!assessment) throw new Error(`Assessment ${assessmentId} not found`);
  const responses = await getResponsesLocal(assessmentId, ctx);
  // Build checklist from STORED items (builder edits included) + stored responses.
  // Template is only a fallback when nothing was ever stored (legacy/demo rows).
  const storedItems = await getChecklistItemsLocal(assessmentId, ctx);
  const tpl = PACK_TEMPLATES[assessment.pack];
  const source = storedItems.length > 0
    ? storedItems.map((it) => ({ id: it.id, title: it.title }))
    : tpl.checklist.map((title, i) => ({ id: `${assessmentId}_item_${i}`, title }));
  const checklist = source.map(({ id, title }) => {
    const r = responses.find((x) => x.itemId === id);
    return { title, status: r?.status ?? "not_checked", notes: r?.notes };
  });
  // Measurements from responses that have measured values
  const measurements = responses.filter((r) => r.measuredValue !== undefined).map((r) => ({
    name: r.itemId,
    value: r.measuredValue!,
    unit: r.measuredUnit ?? "",
  }));
  // Materials + quotations
  let materials: ReportInput["materials"] | undefined = undefined;
  let quotation: ReportInput["quotation"] | undefined = undefined;
  let materialsVersion: number | null = null;
  let materialsVersionId: string | null = null;
  let quotationVersion: number | null = null;
  let quotationVersionId: string | null = null;
  if (opts.includeMaterials) {
    const mats = await getMaterialsLocal(assessmentId);
    if (mats.length > 0) {
      const v = Math.max(...mats.map((m) => m.version));
      materialsVersion = v;
      materialsVersionId = `list_${assessmentId}_v${v}`;
      materials = mats.filter((m) => m.version === v).map((m) => ({
        description: m.description,
        quantity: m.quantity,
        unit: m.unit,
        rationale: m.rationale,
        provisional: m.provisional,
      }));
    } else {
      // No materials yet — report without list: keep undefined, caller can warn
      materials = undefined;
      materialsVersion = null;
    }
    const quotes = await getQuotationsLocal(assessmentId);
    if (quotes.length > 0) {
      // Pick latest non-stale if possible, otherwise latest
      const sorted = [...quotes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const picked = sorted.find((q) => !q.stale) ?? sorted[0];
      quotation = { supplier: picked.supplier, total: picked.total, currency: picked.currency };
      quotationVersion = picked.materialsVersion;
      quotationVersionId = picked.materialsListId;
    }
  }
  // Limitations: derived from not_checked/failed items + caller limitations + missing inputs
  const unresolved = checklist.filter((c) => c.status === "not_checked" || c.status === "fail" || c.status === "needs_attention").map((c) => `${c.title} — ${c.status}`);
  const limitations = [...(opts.limitations ?? []), ...unresolved];
  if (materials?.some((m) => m.provisional)) limitations.push("Provisional quantities present — verify missing inputs before procurement");
  const input: ReportInput = {
    siteName: assessment.siteName,
    mode: assessment.mode,
    pack: assessment.pack,
    context: assessment.context,
    checklist,
    findings: [], // findings derived from AI drafts would be stored separately; keep empty for deterministic fallback
    measurements,
    materials,
    quotation: quotation ?? null,
    limitations,
  };
  const assessmentVersion = await nextAssessmentVersion(assessmentId, ctx);
  const checklistVersion = `v${responses.length > 0 ? 1 : 0}-${responses.length}items`;
  return { input, assessment, versions: { assessmentVersion, checklistVersion, materialsVersion, quotationVersion, materialsVersionId, quotationVersionId } };
}

export async function createReportSnapshotLocal(input: {
  assessmentId: string;
  workspaceId?: string | null;
  includeMaterials?: boolean;
  limitations?: string[];
  finalize?: boolean;
  ctx?: StoreCtx;
}): Promise<{ snapshot: ReportSnapshot; input: ReportInput; persisted: boolean }> {
  const { input: reportInput, assessment, versions } = await buildReportInputFromStoredFacts(input.assessmentId, {
    includeMaterials: input.includeMaterials ?? false,
    limitations: input.limitations,
  }, input.ctx);
  const workspaceId = workspaceOf(input.ctx, input.workspaceId ?? assessment.workspaceId);
  await verifyAssessmentWorkspace(input.ctx, input.assessmentId);
  // uuid PK in report_snapshots — randomUUID works for Supabase AND file fallback.
  const id = (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `snap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 4)}`) as string;
  const snapshot: ReportSnapshot = {
    id,
    assessmentId: input.assessmentId,
    assessmentVersion: versions.assessmentVersion,
    checklistVersion: versions.checklistVersion,
    materialsVersionId: versions.materialsVersionId,
    materialsVersion: versions.materialsVersion,
    quotationVersionId: versions.quotationVersionId,
    quotationVersion: versions.quotationVersion,
    artifactKey: input.finalize ? `reports/${id}.pdf` : null,
    htmlPreview: "", // filled after
    createdAt: new Date().toISOString(),
    createdBy: "demo-user",
    finalized: !!input.finalize,
    immutable: true as const,
  };
  const htmlPreview = buildReportHtml(snapshot, reportInput);
  snapshot.htmlPreview = htmlPreview.slice(0, 20000);
  const record: SnapshotRecord = { ...snapshot, workspaceId, payload: reportInput };
  // Try Supabase first if env
  if (hasSupabaseEnv() && workspaceId && asUuidOrNull(input.assessmentId)) {
    try {
      const supabase = await clientFor(input.ctx);
      await auditEvent({ workspaceId, action: input.finalize ? "snapshot.finalized" : "snapshot.drafted", targetType: "snapshot", targetId: id, ctx: input.ctx });
      const { error } = await supabase.from("report_snapshots").insert({
        id,
        workspace_id: workspaceId,
        assessment_id: input.assessmentId,
        assessment_version: versions.assessmentVersion,
        checklist_version: versions.checklistVersion,
        materials_version: versions.materialsVersion,
        quotation_version: versions.quotationVersion,
        artifact_key: snapshot.artifactKey,
        finalized: snapshot.finalized,
        html_preview: snapshot.htmlPreview,
        snapshot_payload: reportInput as unknown as never,
      });
      if (!error) return { snapshot, input: reportInput, persisted: true };
      console.error("Supabase snapshot insert failed", error.message);
    } catch (e) {
      console.error("Supabase snapshot fallback", e instanceof Error ? e.message : String(e));
    }
  }
  // File fallback — enforce immutability: never overwrite finalized snapshot
  ensureDir();
  const all = readJson<SnapshotRecord[]>(SNAPSHOTS_FILE, []);
  // finalized is set on creation only; updates not allowed — create new id instead
  all.push(record);
  writeJson(SNAPSHOTS_FILE, all);
  return { snapshot, input: reportInput, persisted: false };
}

export async function getSnapshotLocal(snapshotId: string, ctx?: StoreCtx): Promise<SnapshotRecord | null> {
  if (hasSupabaseEnv()) {
    try {
      const supabase = await clientFor(ctx);
      const { data } = await supabase.from("report_snapshots").select("*").eq("id", snapshotId).single();
      if (data) {
        return {
          id: data.id,
          assessmentId: data.assessment_id,
          assessmentVersion: data.assessment_version,
          checklistVersion: data.checklist_version ?? "v1",
          // No materials_list_id column exists — version ints only; ids live in the payload/file record.
          materialsVersionId: null,
          materialsVersion: data.materials_version ?? null,
          quotationVersionId: null,
          quotationVersion: data.quotation_version ?? null,
          artifactKey: data.artifact_key ?? null,
          htmlPreview: data.html_preview ?? "",
          createdAt: data.created_at,
          createdBy: data.created_by ?? "supabase-user",
          finalized: !!data.finalized,
          immutable: true as const,
          workspaceId: data.workspace_id ?? null,
          payload: (data.snapshot_payload as unknown as ReportInput) ?? ({} as ReportInput),
        };
      }
    } catch {}
  }
  const all = readJson<SnapshotRecord[]>(SNAPSHOTS_FILE, []);
  return all.find((s) => s.id === snapshotId) ?? null;
}

export async function listSnapshotsLocal(assessmentId?: string, ctx?: StoreCtx): Promise<SnapshotRecord[]> {
  if (hasSupabaseEnv() && assessmentId) {
    try {
      const supabase = await clientFor(ctx);
      const { data } = await supabase.from("report_snapshots").select("*").eq("assessment_id", assessmentId).order("created_at", { ascending: false }).limit(50);
      if (data) return data.map((d) => ({
        id: d.id,
        assessmentId: d.assessment_id,
        assessmentVersion: d.assessment_version,
        checklistVersion: d.checklist_version ?? "v1",
        materialsVersionId: null,
        materialsVersion: d.materials_version ?? null,
        quotationVersionId: null,
        quotationVersion: d.quotation_version ?? null,
        artifactKey: d.artifact_key ?? null,
        htmlPreview: d.html_preview ?? "",
        createdAt: d.created_at,
        createdBy: d.created_by ?? "supabase-user",
        finalized: !!d.finalized,
        immutable: true as const,
        workspaceId: d.workspace_id ?? null,
        payload: (d.snapshot_payload as unknown as ReportInput) ?? ({} as ReportInput),
      }));
    } catch {}
  }
  const all = readJson<SnapshotRecord[]>(SNAPSHOTS_FILE, []);
  const filtered = assessmentId ? all.filter((s) => s.assessmentId === assessmentId) : all;
  return filtered.slice(-50).reverse();
}

export async function tryUploadReportArtifact(snapshotId: string, pdfBytes: Uint8Array, ctx?: StoreCtx): Promise<{ uploaded: boolean; signedUrl: string | null; error?: string }> {
  if (!hasSupabaseEnv()) return { uploaded: false, signedUrl: null, error: "Supabase env missing — using base64 fallback" };
  try {
    // Storage + artifact bookkeeping always run privileged AFTER route-level authz.
    const supabase = await serviceClient();
    const key = `reports/${snapshotId}.pdf`;
    const { error: upErr } = await supabase.storage.from("reports").upload(key, pdfBytes, { contentType: "application/pdf", upsert: false });
    if (upErr) return { uploaded: false, signedUrl: null, error: upErr.message };
    // Update snapshot artifact_key when upload succeeds — except on finalized
    // snapshots, where the immutability trigger rejects updates (the key was
    // already set at creation time for finalized snapshots, so nothing to do).
    const { data: snap } = await supabase.from("report_snapshots").select("finalized").eq("id", snapshotId).single();
    if (!snap || !(snap as { finalized: boolean }).finalized) {
      await supabase.from("report_snapshots").update({ artifact_key: key }).eq("id", snapshotId);
    }
    // Also update file fallback if exists
    const all = readJson<SnapshotRecord[]>(SNAPSHOTS_FILE, []);
    const idx = all.findIndex((s) => s.id === snapshotId);
    if (idx >= 0) { all[idx].artifactKey = key; writeJson(SNAPSHOTS_FILE, all); }
    const { data: signed } = await supabase.storage.from("reports").createSignedUrl(key, 60 * 60); // 1h
    return { uploaded: true, signedUrl: signed?.signedUrl ?? null };
  } catch (e) {
    return { uploaded: false, signedUrl: null, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---- Evidence (private storage + evidence_items rows, item linkage preserved) ----
export type EvidenceRecord = {
  id: string;
  assessmentId: string;
  itemId: string | null;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
};

const EVIDENCE_FILE = path.join(DATA_DIR, "evidence.json");

export async function saveEvidenceLocal(input: {
  assessmentId: string;
  itemId?: string | null;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  bytes?: Uint8Array;
  ctx?: StoreCtx;
}): Promise<{ record: EvidenceRecord; persisted: boolean }> {
  const ws = workspaceOf(input.ctx, null);
  await verifyAssessmentWorkspace(input.ctx, input.assessmentId);
  // File-fallback/demo ids can never satisfy uuid FKs — link assessment-level, still listable.
  const itemUuid = asUuidOrNull(input.itemId);
  const assessmentUuid = asUuidOrNull(input.assessmentId);
  if (hasSupabaseEnv() && ws && assessmentUuid) {
    const supabase = await serviceClient(); // privileged AFTER route-level membership check
    if (input.bytes) {
      const { error: upErr } = await supabase.storage.from("evidence").upload(input.storageKey, input.bytes, { contentType: input.mimeType, upsert: false });
      if (upErr) throw new Error(`Storage upload failed — ${upErr.message}`);
    }
    const { data, error } = await supabase.from("evidence_items").insert({
      workspace_id: ws,
      assessment_id: assessmentUuid,
      item_id: itemUuid,
      storage_key: input.storageKey,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
    }).select("id, captured_at").single();
    if (error) throw error;
    return {
      record: { id: (data as { id: string }).id, assessmentId: input.assessmentId, itemId: input.itemId ?? null, storageKey: input.storageKey, mimeType: input.mimeType, sizeBytes: input.sizeBytes, uploadedAt: (data as { captured_at: string }).captured_at },
      persisted: true,
    };
  }
  const all = readJson<EvidenceRecord[]>(EVIDENCE_FILE, []);
  const record: EvidenceRecord = { id: `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, assessmentId: input.assessmentId, itemId: input.itemId ?? null, storageKey: input.storageKey, mimeType: input.mimeType, sizeBytes: input.sizeBytes, uploadedAt: new Date().toISOString() };
  all.push(record);
  writeJson(EVIDENCE_FILE, all);
  return { record, persisted: false };
}

export async function listEvidenceLocal(assessmentId: string, ctx?: StoreCtx): Promise<{ items: EvidenceRecord[]; persisted: boolean }> {
  await verifyAssessmentWorkspace(ctx, assessmentId);
  if (hasSupabaseEnv() && asUuidOrNull(assessmentId)) {
    try {
      const supabase = await clientFor(ctx);
      const { data } = await supabase.from("evidence_items").select("id, assessment_id, item_id, storage_key, mime_type, size_bytes, captured_at").eq("assessment_id", assessmentId).order("captured_at", { ascending: false }).limit(100);
      if (data) return {
        items: (data as Array<{ id: string; assessment_id: string; item_id: string | null; storage_key: string; mime_type: string; size_bytes: number; captured_at: string }>).map((r) => ({ id: r.id, assessmentId, itemId: r.item_id, storageKey: r.storage_key, mimeType: r.mime_type, sizeBytes: r.size_bytes, uploadedAt: r.captured_at })),
        persisted: true,
      };
    } catch {}
  }
  const all = readJson<EvidenceRecord[]>(EVIDENCE_FILE, []);
  return { items: all.filter((e) => e.assessmentId === assessmentId).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)), persisted: false };
}

/** Short-lived signed URL for a private evidence object. Verifies the key belongs to the assessment. */
export async function signedEvidenceUrl(assessmentId: string, storageKey: string, ctx?: StoreCtx): Promise<{ signedUrl: string | null; error?: string }> {
  await verifyAssessmentWorkspace(ctx, assessmentId);
  const { items } = await listEvidenceLocal(assessmentId, ctx);
  if (!items.some((e) => e.storageKey === storageKey)) return { signedUrl: null, error: "Unknown storage key for this assessment" };
  if (!hasSupabaseEnv()) return { signedUrl: null, error: "Supabase env missing — file fallback has no private storage" };
  try {
    const supabase = await serviceClient(); // privileged AFTER membership + key-ownership checks
    const { data, error } = await supabase.storage.from("evidence").createSignedUrl(storageKey, 60 * 15); // 15 min
    if (error) throw error;
    return { signedUrl: data?.signedUrl ?? null };
  } catch (e) {
    return { signedUrl: null, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---- Findings (reviewed AI drafts + manual findings; never auto-verified) ----
export type FindingRecord = {
  id: string;
  assessmentId: string;
  title: string;
  description?: string;
  severity?: "low" | "medium" | "high";
  status: string;
  evidenceRefs: string[];
  createdAt: string;
};

const FINDINGS_FILE = path.join(DATA_DIR, "findings.json");

export async function saveFindingLocal(input: {
  assessmentId: string;
  title: string;
  description?: string;
  severity?: "low" | "medium" | "high";
  evidenceRefs?: string[];
  ctx?: StoreCtx;
}): Promise<{ finding: FindingRecord; persisted: boolean }> {
  const title = input.title.trim();
  if (title.length < 3) throw new Error("Finding title must be at least 3 chars");
  const ws = workspaceOf(input.ctx, null);
  await verifyAssessmentWorkspace(input.ctx, input.assessmentId);
  if (hasSupabaseEnv() && ws && asUuidOrNull(input.assessmentId)) {
    try {
      const supabase = await clientFor(input.ctx);
      const { data, error } = await supabase.from("findings").insert({
        assessment_id: input.assessmentId,
        title,
        severity: input.severity ?? null,
        status: "needs_review",
        evidence_refs: input.evidenceRefs ?? [],
      }).select("id, status, created_at").single();
      if (error) throw error;
      return {
        finding: { id: (data as { id: string }).id, assessmentId: input.assessmentId, title, description: input.description, severity: input.severity, status: (data as { status: string }).status, evidenceRefs: input.evidenceRefs ?? [], createdAt: (data as { created_at: string }).created_at },
        persisted: true,
      };
    } catch (e) {
      console.error("Supabase finding save failed, falling back to file store", e instanceof Error ? e.message : String(e));
    }
  }
  const all = readJson<FindingRecord[]>(FINDINGS_FILE, []);
  const finding: FindingRecord = { id: `find_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, assessmentId: input.assessmentId, title, description: input.description, severity: input.severity, status: "needs_review", evidenceRefs: input.evidenceRefs ?? [], createdAt: new Date().toISOString() };
  all.push(finding);
  writeJson(FINDINGS_FILE, all);
  return { finding, persisted: false };
}

const FINDING_STATUSES = ["needs_review", "confirmed", "rejected"] as const;

export async function updateFindingStatusLocal(findingId: string, status: string, ctx?: StoreCtx): Promise<FindingRecord> {
  if (!FINDING_STATUSES.includes(status as (typeof FINDING_STATUSES)[number])) {
    throw new Error(`Invalid finding status ${status} — expected needs_review, confirmed, or rejected`);
  }
  if (hasSupabaseEnv() && asUuidOrNull(findingId)) {
    try {
      const supabase = await clientFor(ctx);
      const { data: existing } = await supabase.from("findings").select("assessment_id").eq("id", findingId).single();
      if (existing) await verifyAssessmentWorkspace(ctx, (existing as { assessment_id: string }).assessment_id);
      const { data, error } = await supabase.from("findings").update({ status }).eq("id", findingId).select("id, assessment_id, title, severity, status, evidence_refs, created_at").single();
      if (error) throw error;
      const { data: parent } = await supabase.from("assessments").select("workspace_id").eq("id", (data as { assessment_id: string }).assessment_id).single();
      await auditEvent({ workspaceId: (parent as { workspace_id: string } | null)?.workspace_id ?? ctx?.workspaceId, action: `finding.${status}`, targetType: "finding", targetId: findingId, ctx });
      const r = data as { id: string; assessment_id: string; title: string; severity: "low" | "medium" | "high" | null; status: string; evidence_refs: string[]; created_at: string };
      return { id: r.id, assessmentId: r.assessment_id, title: r.title, severity: r.severity ?? undefined, status: r.status, evidenceRefs: r.evidence_refs ?? [], createdAt: r.created_at };
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Forbidden")) throw e;
      console.error("Supabase finding update failed, falling back to file store", e instanceof Error ? e.message : String(e));
    }
  }
  const all = readJson<FindingRecord[]>(FINDINGS_FILE, []);
  const idx = all.findIndex((f) => f.id === findingId);
  if (idx === -1) throw new Error("Finding not found");
  all[idx].status = status;
  writeJson(FINDINGS_FILE, all);
  return all[idx];
}

export async function deleteEvidenceLocal(assessmentId: string, evidenceId: string, ctx?: StoreCtx): Promise<{ ok: boolean; persisted: boolean }> {
  await verifyAssessmentWorkspace(ctx, assessmentId);
  if (hasSupabaseEnv() && asUuidOrNull(evidenceId)) {
    const supabase = await serviceClient(); // privileged AFTER membership check
    const { data: row } = await supabase.from("evidence_items").select("storage_key, assessment_id").eq("id", evidenceId).single();
    if (!row) throw new Error("Evidence not found");
    if ((row as { assessment_id: string }).assessment_id !== assessmentId && asUuidOrNull(assessmentId)) {
      throw new Error("Forbidden — evidence belongs to a different assessment");
    }
    const key = (row as { storage_key: string }).storage_key;
    const { error: delErr } = await supabase.from("evidence_items").delete().eq("id", evidenceId);
    if (delErr) throw delErr;
    // Best-effort storage removal — the DB row is the source of truth for listing.
    const { error: storErr } = await supabase.storage.from("evidence").remove([key]);
    if (storErr) console.error("Evidence storage removal failed", storErr.message);
    const { data: parent } = await supabase.from("assessments").select("workspace_id").eq("id", assessmentId).single();
    await auditEvent({ workspaceId: (parent as { workspace_id: string } | null)?.workspace_id ?? ctx?.workspaceId, action: "evidence.deleted", targetType: "evidence", targetId: evidenceId, ctx });
    return { ok: true, persisted: true };
  }
  const all = readJson<EvidenceRecord[]>(EVIDENCE_FILE, []);
  const kept = all.filter((e) => !(e.id === evidenceId && e.assessmentId === assessmentId));
  if (kept.length === all.length) throw new Error("Evidence not found");
  writeJson(EVIDENCE_FILE, kept);
  return { ok: true, persisted: false };
}

export async function auditEvent(input: { workspaceId?: string | null; action: string; targetType?: string; targetId?: string; actorId?: string; ctx?: StoreCtx }): Promise<void> {
  // Best-effort trail — never blocks the mutating operation.
  try {
    if (!hasSupabaseEnv() || !input.workspaceId || !asUuidOrNull(input.workspaceId)) return;
    const supabase = await serviceClient();
    await supabase.from("audit_events").insert({
      workspace_id: input.workspaceId,
      actor: asUuidOrNull(input.actorId) ?? asUuidOrNull(input.ctx?.userId) ?? null,
      action: input.action,
      target_type: input.targetType ?? null,
      target_id: asUuidOrNull(input.targetId),
    });
  } catch (e) {
    console.error("Audit write failed", e instanceof Error ? e.message : String(e));
  }
}

export type AuditRecord = { id: string; workspaceId: string | null; actor: string | null; action: string; targetType: string | null; targetId: string | null; createdAt: string };

export async function listAuditLocal(workspaceId: string, opts: { assessmentId?: string; limit?: number } = {}, ctx?: StoreCtx): Promise<AuditRecord[]> {
  if (hasSupabaseEnv() && asUuidOrNull(workspaceId)) {
    try {
      const supabase = await clientFor(ctx);
      let q = supabase.from("audit_events").select("id, workspace_id, actor, action, target_type, target_id, created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(opts.limit ?? 100);
      const { data } = await q;
      if (data) return (data as Array<{ id: string; workspace_id: string | null; actor: string | null; action: string; target_type: string | null; target_id: string | null; created_at: string }>).map((r) => ({ id: r.id, workspaceId: r.workspace_id, actor: r.actor, action: r.action, targetType: r.target_type, targetId: r.target_id, createdAt: r.created_at }));
    } catch {}
  }
  return [];
}

export type SiteRecord = { id: string; workspaceId: string | null; name: string; address?: string; createdAt: string; jobCount?: number };

export async function listSitesLocal(workspaceId: string | null | undefined, ctx?: StoreCtx): Promise<SiteRecord[]> {
  const ws = workspaceOf(ctx, workspaceId);
  if (hasSupabaseEnv() && ws && asUuidOrNull(ws)) {
    try {
      const supabase = await clientFor(ctx);
      const { data } = await supabase.from("sites").select("id, workspace_id, name, address, created_at").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(100);
      if (data) {
        const sites = (data as Array<{ id: string; workspace_id: string; name: string; address: string | null; created_at: string }>);
        const { data: jobs } = await supabase.from("assessments").select("site_id").eq("workspace_id", ws);
        const counts = new Map<string, number>();
        for (const j of ((jobs ?? []) as Array<{ site_id: string | null }>)) if (j.site_id) counts.set(j.site_id, (counts.get(j.site_id) ?? 0) + 1);
        return sites.map((s) => ({ id: s.id, workspaceId: s.workspace_id, name: s.name, address: s.address ?? undefined, createdAt: s.created_at, jobCount: counts.get(s.id) ?? 0 }));
      }
    } catch {}
  }
  // File fallback: derive sites from stored assessments
  const all = readJson<AssessmentRecord[]>(ASSESSMENTS_FILE, []);
  const seen = new Map<string, SiteRecord>();
  for (const a of all) {
    if (ws && a.workspaceId !== ws) continue;
    if (!a.siteId && !a.siteName) continue;
    const key = a.siteId ?? `name:${a.siteName}`;
    const prev = seen.get(key);
    if (prev) prev.jobCount = (prev.jobCount ?? 0) + 1;
    else seen.set(key, { id: a.siteId ?? key, workspaceId: a.workspaceId, name: a.siteName, address: a.address, createdAt: a.createdAt, jobCount: 1 });
  }
  return [...seen.values()];
}

export async function renameSiteLocal(siteId: string, name: string, ctx?: StoreCtx): Promise<{ ok: boolean }> {
  const clean = name.trim();
  if (clean.length < 2 || clean.length > 100) throw new Error("Site name must be 2–100 chars");
  if (hasSupabaseEnv() && asUuidOrNull(siteId)) {
    const supabase = await clientFor(ctx);
    const { data: existing } = await supabase.from("sites").select("workspace_id").eq("id", siteId).single();
    if (!existing) throw new Error("Site not found");
    if (ctx?.workspaceId && (existing as { workspace_id: string }).workspace_id !== ctx.workspaceId) {
      throw new Error("Forbidden — site belongs to a different workspace");
    }
    const { error } = await supabase.from("sites").update({ name: clean }).eq("id", siteId);
    if (error) throw error;
    return { ok: true };
  }
  throw new Error("Site rename needs a persisted site — connect Supabase");
}

export type MemberRecord = { workspaceId: string; userId: string; email?: string; role: string; createdAt: string };

async function myRole(ctx: StoreCtx | undefined, workspaceId: string): Promise<string | null> {
  if (!ctx?.supabase || !ctx.userId) return null;
  const { data } = await ctx.supabase.from("workspace_memberships").select("role").eq("workspace_id", workspaceId).eq("user_id", ctx.userId).single();
  return (data as { role: string } | null)?.role ?? null;
}

export async function listMembersLocal(workspaceId: string, ctx?: StoreCtx): Promise<{ members: MemberRecord[]; myRole: string | null }> {
  if (!hasSupabaseEnv() || !asUuidOrNull(workspaceId)) return { members: [], myRole: null };
  const supabase = await clientFor(ctx);
  const role = await myRole(ctx, workspaceId);
  const { data, error } = await supabase.from("workspace_memberships").select("user_id, role, created_at").eq("workspace_id", workspaceId).order("created_at");
  if (error) throw error;
  return { members: ((data ?? []) as Array<{ user_id: string; role: string; created_at: string }>).map((m) => ({ workspaceId, userId: m.user_id, role: m.role, createdAt: m.created_at })), myRole: role };
}

export async function setMemberRoleLocal(workspaceId: string, userId: string, role: "owner" | "admin" | "member" | "viewer", ctx?: StoreCtx): Promise<{ ok: boolean }> {
  if (!ctx?.userId) throw new Error("Sign in required");
  const mine = await myRole(ctx, workspaceId);
  if (mine !== "owner" && mine !== "admin") throw new Error("Forbidden — owners/admins only");
  const userClient = await clientFor(ctx);
  const { data: target } = await userClient.from("workspace_memberships").select("role").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
  const targetRole = (target as { role: string } | null)?.role;
  if (!targetRole) throw new Error("That user is not a member of this workspace");
  // Only owners may grant, change, or revoke ownership — admins cannot escalate themselves or others.
  if ((role === "owner" || targetRole === "owner") && mine !== "owner") throw new Error("Forbidden — only owners can grant or change the owner role");
  if (targetRole === "owner" && role !== "owner") {
    const { data: owners } = await userClient.from("workspace_memberships").select("user_id").eq("workspace_id", workspaceId).eq("role", "owner");
    if (((owners ?? []) as unknown[]).length <= 1) throw new Error("Cannot demote the last owner");
  }
  const supabase = await serviceClient(); // privileged AFTER role + owner checks
  const { error } = await supabase.from("workspace_memberships").update({ role }).eq("workspace_id", workspaceId).eq("user_id", userId);
  if (error) throw error;
  await auditEvent({ workspaceId, action: `member.role:${role}`, targetType: "user", targetId: userId, ctx });
  return { ok: true };
}

export async function removeMemberLocal(workspaceId: string, userId: string, ctx?: StoreCtx): Promise<{ ok: boolean }> {
  if (!ctx?.userId) throw new Error("Sign in required");
  const mine = await myRole(ctx, workspaceId);
  if (mine !== "owner" && mine !== "admin") throw new Error("Forbidden — owners/admins only");
  const supabase = await clientFor(ctx);
  const { data: owners } = await supabase.from("workspace_memberships").select("user_id").eq("workspace_id", workspaceId).eq("role", "owner");
  const ownerIds = ((owners ?? []) as Array<{ user_id: string }>).map((o) => o.user_id);
  if (ownerIds.includes(userId)) {
    if (mine !== "owner") throw new Error("Forbidden — only owners can remove an owner");
    if (ownerIds.length <= 1) throw new Error("Cannot remove the last owner");
  }
  const admin = await serviceClient(); // privileged AFTER role + owner checks
  const { error } = await admin.from("workspace_memberships").delete().eq("workspace_id", workspaceId).eq("user_id", userId);
  if (error) throw error;
  await auditEvent({ workspaceId, action: "member.removed", targetType: "user", targetId: userId, ctx });
  return { ok: true };
}

export async function inviteMemberLocal(workspaceId: string, email: string, role: "admin" | "member" | "viewer", ctx?: StoreCtx): Promise<{ ok: boolean; userId: string }> {
  const clean = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) throw new Error("Invalid email");
  if (!ctx?.userId) throw new Error("Sign in required");
  const mine = await myRole(ctx, workspaceId);
  if (mine !== "owner" && mine !== "admin") throw new Error("Forbidden — owners/admins only");
  const admin = await serviceClient(); // privileged AFTER role check
  // Resolve an existing account by email (paginated scan stays small for team sizes)
  let targetId: string | null = null;
  let page = 1;
  for (let i = 0; i < 10 && !targetId; i++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    const found = data?.users?.find((u: { email?: string }) => u.email?.toLowerCase() === clean);
    if (found) targetId = found.id;
    if (!data?.users?.length || (data.users.length < 100)) break;
    page++;
  }
  if (!targetId) throw new Error("No account for that email yet — ask them to sign up first, then invite");
  const { data: existing } = await admin.from("workspace_memberships").select("user_id").eq("workspace_id", workspaceId).eq("user_id", targetId).single();
  if (existing) throw new Error("That user is already a member");
  const { error } = await admin.from("workspace_memberships").insert({ workspace_id: workspaceId, user_id: targetId, role });
  if (error) throw error;
  await auditEvent({ workspaceId, action: `member.invited:${role}`, targetType: "user", targetId, ctx });
  return { ok: true, userId: targetId };
}

export async function listFindingsLocal(assessmentId: string, ctx?: StoreCtx): Promise<FindingRecord[]> {
  if (hasSupabaseEnv() && asUuidOrNull(assessmentId)) {
    try {
      const supabase = await clientFor(ctx);
      const { data } = await supabase.from("findings").select("id, title, severity, status, evidence_refs, created_at").eq("assessment_id", assessmentId).order("created_at", { ascending: false });
      if (data) return (data as Array<{ id: string; title: string; severity: "low" | "medium" | "high" | null; status: string; evidence_refs: string[]; created_at: string }>).map((r) => ({ id: r.id, assessmentId, title: r.title, severity: r.severity ?? undefined, status: r.status, evidenceRefs: r.evidence_refs ?? [], createdAt: r.created_at }));
    } catch {}
  }
  const all = readJson<FindingRecord[]>(FINDINGS_FILE, []);
  return all.filter((f) => f.assessmentId === assessmentId);
}
