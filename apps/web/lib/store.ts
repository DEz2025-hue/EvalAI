import fs from "fs";
import path from "path";
import { PACK_TEMPLATES, buildReportHtml, type ReportNarrative, computeCompleteness, calculateMeasurement, quotationTotalAmount, type CompletenessResult, type FormulaId, type MeasurementInput } from "@eval-ai/shared";
import type { ReportSnapshot, ReportInput } from "@eval-ai/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

// Request store context — carried by auth.ts RequestAuth for workspace-scoped
// server operations. All fields optional: demo mode passes {}, authenticated
// mode passes { supabase, userId, workspaceId }.
export type StoreCtx = {
  supabase?: SupabaseClient;
  userId?: string;
  email?: string;
  workspaceId?: string;
  /** Caller's role in workspaceId (owner | admin | member | viewer). */
  role?: string;
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

/** Service-role features (Storage, audit trail, admin API) need the server key. */
function hasServiceRole() {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

/**
 * A request is served by the database whenever it carries a user-scoped client
 * (authenticated). Only demo-mode requests (no ctx.supabase) use the local file
 * store — an authenticated request must never silently fall back to files.
 */
function dbMode(ctx?: StoreCtx): boolean {
  return !!ctx?.supabase;
}

/**
 * Normalise Supabase/Postgrest errors (plain objects, not Errors). App-level Errors pass through
 * untouched so their user-facing messages survive. RLS denials -> Forbidden (403); unique
 * violations -> conflict (409); anything else -> DbFailure (generic 500, detail logged only).
 */
function dbError(e: unknown): Error {
  if (e instanceof Error) {
    if (/row-level security/i.test(e.message)) return new Error("Forbidden — not permitted for your role in this workspace");
    return e;
  }
  const rec = (e ?? {}) as { message?: string; code?: string };
  const msg = rec.message ?? String(e);
  if (rec.code === "42501" || /row-level security|permission denied/i.test(msg)) return new Error("Forbidden — not permitted for your role in this workspace");
  if (rec.code === "23505") {
    const conflict = new Error("Conflict — this change collided with another update; reload and retry");
    conflict.name = "DbConflict";
    return conflict;
  }
  console.error("Database error:", rec.code ?? "", msg);
  const failure = new Error("Database operation failed");
  failure.name = "DbFailure";
  return failure;
}

/** Guard for the file-store branch: unreachable for authenticated (db-mode) requests. */
function assertFileMode(ctx?: StoreCtx): void {
  if (dbMode(ctx)) throw new Error("Persistence failed for this request");
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
  if (!ctx?.supabase || !ctx.workspaceId) return; // demo/file mode only
  if (!asUuidOrNull(assessmentId)) throw new Error("Forbidden — invalid assessment id");
  const { data, error } = await ctx.supabase.from("assessments").select("workspace_id").eq("id", assessmentId).maybeSingle();
  if (error) throw dbError(error);
  // RLS hides rows from other workspaces, so "not found" and "foreign" are indistinguishable — both fail closed.
  if (!data || (data as { workspace_id: string }).workspace_id !== ctx.workspaceId) {
    throw new Error("Forbidden — assessment not found in your workspace");
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
  /** Provenance: established pack requirement, user-added, or AI-suggested (never presented as fact). */
  source?: "established" | "user" | "ai_suggested";
  rationale?: string;
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
  if (dbMode(input.ctx) && workspaceId) {
    try {
      const supabase = await clientFor(input.ctx);
      // Reuse an existing site with the same name instead of creating a duplicate per job.
      const siteName = input.siteName.trim();
      const { data: existingSite, error: findSiteErr } = await supabase.from("sites").select("id").eq("workspace_id", workspaceId).eq("name", siteName).limit(1).maybeSingle();
      if (findSiteErr) throw findSiteErr;
      let siteId: string | null = (existingSite as { id: string } | null)?.id ?? null;
      if (!siteId) {
        const { data: site, error: siteErr } = await supabase.from("sites").insert({ workspace_id: workspaceId, name: siteName, address: input.address ?? null }).select("id").single();
        if (siteErr) throw siteErr;
        siteId = (site as { id: string } | null)?.id ?? null;
      }
      const { data: assessment, error } = await supabase
        .from("assessments")
        .insert({ workspace_id: workspaceId, site_id: siteId, created_by: input.ctx?.userId, mode: input.mode, pack: input.pack, status: "draft", context: { siteName: input.siteName, goal: input.goal, existingEquipment: input.existingEquipment } })
        .select("id")
        .single();
      if (error) throw error;
      const id = assessment.id as string;
      const tpl = PACK_TEMPLATES[input.pack];
      const rows = tpl.checklist.map((title, i) => ({ assessment_id: id, title, required: i < 5, ord: i, category: i < 2 ? "Site" : "System", source: "established" }));
      const { data: inserted, error: itemsErr } = await supabase.from("checklist_items").insert(rows).select("id, title, required, ord, category, source");
      if (itemsErr) {
        await supabase.from("assessments").delete().eq("id", id); // no orphan job without its checklist
        throw itemsErr;
      }
      await auditEvent({ workspaceId, action: "assessment.created", targetType: "assessment", targetId: id, ctx: input.ctx });
      const items: ChecklistItemRecord[] = ((inserted ?? []) as Array<{ id: string; title: string; required: boolean; ord: number; category: string | null }>).map((r) => ({ id: r.id, assessmentId: id, title: r.title, required: r.required, ord: r.ord, category: r.category ?? undefined }));
      return { id, persisted: true, items };
    } catch (e) {
      throw dbError(e);
    }
  }
  assertFileMode(input.ctx);
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
  if (dbMode(ctx)) {
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
    } catch (e) { throw dbError(e); }
  }
  if (dbMode(ctx)) return null;
  const all = readJson<AssessmentRecord[]>(ASSESSMENTS_FILE, []);
  return all.find((a) => a.id === id) ?? null;
}

export async function listAssessmentsLocal(workspaceId?: string | null, ctx?: StoreCtx): Promise<AssessmentRecord[]> {
  const ws = workspaceOf(ctx, workspaceId);
  if (dbMode(ctx) && ws) {
    try {
      const supabase = await clientFor(ctx);
      const { data } = await supabase.from("assessments").select("id, workspace_id, mode, pack, status, created_at, context").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(50);
      if (data) return data.map((d) => ({ id: d.id, workspaceId: d.workspace_id, siteId: null, siteName: (d.context as Record<string, unknown>)?.siteName as string ?? "—", mode: d.mode, pack: d.pack, status: d.status, context: d.context as Record<string, unknown>, createdAt: d.created_at, updatedAt: d.created_at }));
    } catch (e) { throw dbError(e); }
  }
  assertFileMode(ctx);
  const all = readJson<AssessmentRecord[]>(ASSESSMENTS_FILE, []);
  if (workspaceId) return all.filter((a) => a.workspaceId === workspaceId);
  return all.slice(-50).reverse();
}

export async function updateAssessmentContextLocal(id: string, patch: { siteName?: string; context?: Record<string, unknown> }, ctx?: StoreCtx): Promise<boolean> {
  if (dbMode(ctx)) {
    try {
      const supabase = await clientFor(ctx);
      // Merge with stored context (file fallback merges too) — never drop existing keys.
      const { data: current, error: readErr } = await supabase.from("assessments").select("context, status").eq("id", id).maybeSingle();
      if (readErr) throw readErr;
      if (!current) return false; // not found / not visible in this workspace
      const merged = { ...((current.context as Record<string, unknown>) ?? {}), ...(patch.context ?? {}) };
      if (patch.siteName) merged.siteName = patch.siteName;
      const status = current.status === "draft" ? "in_progress" : current.status;
      const { data: updated, error } = await supabase.from("assessments").update({ context: merged, status, updated_at: new Date().toISOString() }).eq("id", id).select("id");
      if (error) throw error;
      return (updated ?? []).length > 0;
    } catch (e) { throw dbError(e); }
  }
  if (dbMode(ctx)) return false;
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
  if (dbMode(ctx) && asUuidOrNull(assessmentId)) {
    try {
      const supabase = await clientFor(ctx);
      const { data } = await supabase.from("checklist_items").select("id, title, instructions, required, ord, category, source, rationale").eq("assessment_id", assessmentId).order("ord");
      if (data?.length) return (data as DbChecklistRow[]).map((r) => toChecklistRecord(r, assessmentId));
    } catch (e) { throw dbError(e); }
  }
  if (dbMode(ctx)) return [];
  const file = path.join(DATA_DIR, `checklist_${assessmentId}.json`);
  const rows = readJson<ChecklistItemRecord[]>(file, []);
  return [...rows].sort((a, b) => a.ord - b.ord);
}

type DbChecklistRow = { id: string; title: string; instructions: string | null; required: boolean; ord: number; category: string | null; source?: string | null; rationale?: string | null };

function toChecklistRecord(r: DbChecklistRow, assessmentId: string): ChecklistItemRecord {
  return {
    id: r.id,
    assessmentId,
    title: r.title,
    instructions: r.instructions ?? undefined,
    required: r.required,
    ord: r.ord,
    category: r.category ?? undefined,
    source: (r.source as ChecklistItemRecord["source"]) ?? undefined,
    rationale: r.rationale ?? undefined,
  };
}

/**
 * Replace the editable checklist. Items carrying an existing id are UPDATED in place so
 * responses and evidence links survive; new items are inserted; omitted items are removed.
 * Database path is one atomic RPC (replace_checklist, migration 0009).
 */
export async function replaceChecklistItemsLocal(
  assessmentId: string,
  items: Array<{ id?: string; title: string; instructions?: string; required?: boolean; category?: string; source?: "established" | "user" | "ai_suggested"; rationale?: string }>,
  ctx?: StoreCtx
): Promise<{ items: ChecklistItemRecord[]; persisted: boolean }> {
  const normalized = items
    .map((it) => ({ id: it.id, title: it.title.trim(), instructions: it.instructions, required: it.required ?? false, category: it.category, source: it.source, rationale: it.rationale }))
    .filter((it) => it.title.length > 0);
  if (normalized.length === 0) throw new Error("Checklist must keep at least one item");
  await verifyAssessmentWorkspace(ctx, assessmentId);
  if (dbMode(ctx)) {
    const supabase = await clientFor(ctx);
    const payload = normalized.map((it) => ({ id: asUuidOrNull(it.id) ?? null, title: it.title, instructions: it.instructions ?? null, required: it.required, category: it.category ?? null, source: it.source ?? (asUuidOrNull(it.id) ? undefined : "user"), rationale: it.rationale ?? null }));
    const { data, error } = await supabase.rpc("replace_checklist", { p_assessment: assessmentId, p_items: payload });
    if (error) throw dbError(error);
    await auditEvent({ workspaceId: ctx?.workspaceId, action: "checklist.updated", targetType: "assessment", targetId: assessmentId, ctx });
    return { items: ((data ?? []) as DbChecklistRow[]).map((r) => toChecklistRecord(r, assessmentId)), persisted: true };
  }
  const file = path.join(DATA_DIR, `checklist_${assessmentId}.json`);
  const prev = readJson<ChecklistItemRecord[]>(file, []);
  const prevIds = new Set(prev.map((p) => p.id));
  const prevByTitle = new Map(prev.map((p) => [p.title, p.id]));
  const out: ChecklistItemRecord[] = normalized.map((it, i) => ({
    id: it.id && prevIds.has(it.id) ? it.id : prevByTitle.get(it.title) ?? `${assessmentId}_item_${i}`,
    assessmentId, title: it.title, instructions: it.instructions, required: it.required, ord: i, category: it.category, source: it.source, rationale: it.rationale,
  }));
  writeJson(file, out);
  return { items: out, persisted: false };
}

// ---- Materials ----
type MaterialRecord = { id: string; assessmentId: string; workspaceId?: string | null; description: string; specification?: string; quantity: number; unit: string; rationale: string; source: "measurement"|"finding"|"rule"|"user_input"; provisional: boolean; assumptions: string[]; findingId?: string; ord: number; listId: string; version: number };
type QuotationRecord = { id: string; assessmentId: string; workspaceId?: string | null; materialsListId: string; materialsVersion: number; supplier: string; reference?: string; date: string; currency: string; items: Array<{ description: string; quantity: number; unit: string; unitPrice: number; currency: string; taxesOrFees?: number }>; total: number; stale: boolean; reviewStatus: string; createdAt: string };

const MATERIALS_FILE = path.join(DATA_DIR, "materials.json");
const QUOTATIONS_FILE = path.join(DATA_DIR, "quotations.json");

export async function saveMaterialsLocal(assessmentId: string, items: Array<{ description: string; specification?: string; quantity: number; unit: string; rationale: string; source: "measurement"|"finding"|"rule"|"user_input"; provisional?: boolean; assumptions?: string[]; findingId?: string }>, version?: number, workspaceId?: string | null, ctx?: StoreCtx): Promise<{ ok: boolean; version: number; persisted: boolean; provisionalCount: number }> {
  void version; // client-supplied versions are ignored — the server allocates them atomically
  // Auto-mark provisional if rationale too short or assumptions empty and source is measurement/finding
  const enriched = items.map((it, idx) => ({
    ...it,
    // A client may flag an item provisional but can never clear the automatic flag.
    provisional: !!it.provisional || it.rationale.length < 10 || (!it.assumptions?.length && ["measurement", "finding"].includes(it.source)),
    assumptions: it.assumptions ?? [],
    ord: idx,
  }));
  const provisionalCount = enriched.filter((i) => i.provisional).length;
  const ws = workspaceOf(ctx, workspaceId);
  await verifyAssessmentWorkspace(ctx, assessmentId);
  if (dbMode(ctx)) {
    if (!asUuidOrNull(assessmentId)) throw new Error("Forbidden — invalid assessment id");
    const supabase = await clientFor(ctx);
    const payload = enriched.map((it) => ({ description: it.description, specification: it.specification ?? null, quantity: it.quantity, unit: it.unit, rationale: it.rationale, source: it.source, provisional: it.provisional, assumptions: it.assumptions, finding_id: asUuidOrNull(it.findingId), ord: it.ord }));
    const { data, error } = await supabase.rpc("save_materials_list", { p_assessment: assessmentId, p_items: payload });
    if (error) throw dbError(error);
    const row = (Array.isArray(data) ? data[0] : data) as { list_id: string; version: number } | null;
    if (!row) throw new Error("Materials list was not saved");
    await auditEvent({ workspaceId: ws, action: "materials.saved", targetType: "assessment", targetId: assessmentId, ctx });
    return { ok: true, version: row.version, persisted: true, provisionalCount };
  }
  assertFileMode(ctx);
  const all = readJson<MaterialRecord[]>(MATERIALS_FILE, []);
  const nextVersion = Math.max(0, ...all.filter((m) => m.assessmentId === assessmentId).map((m) => m.version)) + 1;
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
  if (dbMode(ctx)) {
    try {
      const supabase = await clientFor(ctx);
      const { data: lists } = await supabase.from("materials_lists").select("id, version").eq("assessment_id", assessmentId).order("version", { ascending: false }).limit(1);
      const list = lists?.[0];
      if (list) {
        const { data: items } = await supabase.from("materials_items").select("*").eq("list_id", list.id).order("ord");
        if (items) return items.map((it) => ({ id: it.id, assessmentId, workspaceId: null, description: it.description, specification: it.specification ?? undefined, quantity: it.quantity, unit: it.unit, rationale: it.rationale, source: it.source, provisional: it.provisional, assumptions: it.assumptions ?? [], findingId: it.finding_id ?? undefined, ord: it.ord, listId: it.list_id, version: list.version }));
      }
    } catch (e) { throw dbError(e); }
  }
  if (dbMode(ctx)) return [];
  const all = readJson<MaterialRecord[]>(MATERIALS_FILE, []);
  return all.filter((m) => m.assessmentId === assessmentId);
}

export async function getMaterialsVersionLocal(assessmentId: string, ctx?: StoreCtx): Promise<number> {
  const mats = await getMaterialsLocal(assessmentId, ctx);
  if (mats.length === 0) return 0;
  return Math.max(...mats.map((m) => m.version));
}

export async function saveQuotationLocal(input: { assessmentId: string; workspaceId?: string | null; materialsVersion: number; supplier: string; currency: string; items: Array<{ description: string; quantity: number; unit: string; unitPrice: number; currency: string; taxesOrFees?: number }>; date?: string; reference?: string; ctx?: StoreCtx }): Promise<{ ok: boolean; total: number; persisted: boolean; id: string }> {
  // Exact total from integer minor units; mixed currencies are rejected.
  const total = quotationTotalAmount(input.items, input.currency);
  const ws = workspaceOf(input.ctx, input.workspaceId);
  await verifyAssessmentWorkspace(input.ctx, input.assessmentId);
  if (dbMode(input.ctx) && ws && asUuidOrNull(input.assessmentId)) {
    try {
      const supabase = await clientFor(input.ctx);
      if (input.items.some((it) => it.currency !== input.currency)) throw new Error("All quotation lines must use the quotation currency");
      const { data: lists, error: listErr } = await supabase.from("materials_lists").select("id, version").eq("assessment_id", input.assessmentId).order("version", { ascending: false }).limit(1);
      if (listErr) throw listErr;
      const listId = (lists?.[0] as { id: string } | undefined)?.id ?? null;
      const listVersion = (lists?.[0] as { version: number } | undefined)?.version ?? input.materialsVersion;
      if (!listId) throw new Error("No materials list for this assessment — save materials first");
      const { data: q, error: qErr } = await supabase.from("quotations").insert({ workspace_id: ws, assessment_id: input.assessmentId, materials_list_id: listId, materials_version: listVersion, created_by: input.ctx?.userId, supplier: input.supplier, reference: input.reference ?? null, date: input.date ?? new Date().toISOString().slice(0,10), currency: input.currency, total }).select("id").single();
      if (qErr) throw qErr;
      const qid = q?.id as string;
      if (qid) {
        const rows = input.items.map((it) => ({ quotation_id: qid, description: it.description, quantity: it.quantity, unit: it.unit, unit_price: it.unitPrice, currency: it.currency, taxes_or_fees: it.taxesOrFees ?? null }));
        const { error: itemsErr } = await supabase.from("quotation_items").insert(rows);
        if (itemsErr) {
          await supabase.from("quotations").delete().eq("id", qid); // no half-saved quotation
          throw itemsErr;
        }
        return { ok: true, total, persisted: true, id: qid };
      }
    } catch (e) { throw dbError(e); }
  }
  assertFileMode(input.ctx);
  const all = readJson<QuotationRecord[]>(QUOTATIONS_FILE, []);
  const id = `quote_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
  all.push({ id, assessmentId: input.assessmentId, workspaceId: ws, materialsListId: `list_${input.assessmentId}_v${input.materialsVersion}`, materialsVersion: input.materialsVersion, supplier: input.supplier, reference: input.reference, date: input.date ?? new Date().toISOString().slice(0,10), currency: input.currency, items: input.items, total, stale: false, reviewStatus: "pending", createdAt: new Date().toISOString() });
  writeJson(QUOTATIONS_FILE, all);
  return { ok: true, total, persisted: false, id };
}

export async function getQuotationsLocal(assessmentId: string, ctx?: StoreCtx): Promise<QuotationRecord[]> {
  if (dbMode(ctx)) {
    try {
      const supabase = await clientFor(ctx);
      const { data: latestRows, error: latestErr } = await supabase.from("materials_lists").select("version").eq("assessment_id", assessmentId).order("version", { ascending: false }).limit(1);
      if (latestErr) throw latestErr;
      const latestVersion = (latestRows?.[0] as { version: number } | undefined)?.version ?? 0;
      const { data, error: qErr } = await supabase.from("quotations").select("id, created_at, materials_version, supplier, currency, total, stale, review_status, date, quotation_items(description, quantity, unit, unit_price, currency, taxes_or_fees)").eq("assessment_id", assessmentId).order("created_at", { ascending: false });
      if (qErr) throw qErr;
      if (data) return data.map((d) => ({ id: d.id, assessmentId, workspaceId: null, materialsListId: "", materialsVersion: d.materials_version, supplier: d.supplier, reference: undefined, date: d.date, currency: d.currency, items: ((d.quotation_items ?? []) as Array<{ description: string; quantity: number; unit: string; unit_price: number; currency: string; taxes_or_fees: number | null }>).map((it) => ({ description: it.description, quantity: it.quantity, unit: it.unit, unitPrice: it.unit_price, currency: it.currency, taxesOrFees: it.taxes_or_fees ?? undefined })), total: d.total ?? 0, stale: d.stale || d.materials_version < latestVersion, reviewStatus: d.stale || d.materials_version < latestVersion ? "stale_needs_review" : d.review_status, createdAt: d.created_at }));
    } catch (e) { throw dbError(e); }
  }
  if (dbMode(ctx)) return [];
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
  if (dbMode(ctx) && asUuidOrNull(assessmentId)) {
    try {
      const supabase = await clientFor(ctx);
      for (const r of responses) {
        if (!asUuidOrNull(r.itemId)) throw new Error(`Unknown checklist item ${r.itemId} — confirm the checklist first so items exist`);
        const { error } = await supabase.from("checklist_responses").upsert({ assessment_id: assessmentId, item_id: r.itemId, status: r.status, notes: r.notes ?? null, measured_value: r.measuredValue ?? null, measured_unit: r.measuredUnit ?? null }, { onConflict: "assessment_id,item_id" });
        if (error) throw error;
      }
      return { ok: true, persisted: true, saved: responses.length };
    } catch (e) {
      throw dbError(e);
    }
  }
  assertFileMode(ctx);
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
  if (dbMode(ctx)) {
    try {
      const supabase = await clientFor(ctx);
      const { data } = await supabase.from("checklist_responses").select("item_id, status, notes, measured_value, measured_unit").eq("assessment_id", assessmentId);
      if (data) return data.map((d) => ({ assessmentId, itemId: d.item_id, status: d.status, notes: d.notes ?? undefined, measuredValue: d.measured_value ?? undefined, measuredUnit: d.measured_unit ?? undefined, updatedAt: new Date().toISOString() }));
    } catch (e) { throw dbError(e); }
  }
  if (dbMode(ctx)) return [];
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
  if (dbMode(ctx) && asUuidOrNull(assessmentId)) {
    try {
      const supabase = await clientFor(ctx);
      const { count } = await supabase.from("report_snapshots").select("id", { count: "exact", head: true }).eq("assessment_id", assessmentId);
      if (typeof count === "number") return count + 1;
    } catch (e) { throw dbError(e); }
  }
  assertFileMode(ctx);
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
  const titleById = new Map(source.map((it) => [it.id, it.title]));
  const measurements = responses.filter((r) => r.measuredValue !== undefined).map((r) => ({
    name: titleById.get(r.itemId) ?? "Checklist item",
    value: r.measuredValue!,
    unit: r.measuredUnit ?? "",
  }));
  // Recorded measurements: value + unit + the method that produced it (never an AI estimate).
  const recorded = await listMeasurementsLocal(assessmentId, ctx);
  for (const m of recorded) {
    measurements.push({ name: m.name + (m.formula === "manual" ? " (manual entry)" : " (" + (m.method ?? m.formula) + ")"), value: m.value, unit: m.unit });
  }
  // Materials + quotations
  let materials: ReportInput["materials"] | undefined = undefined;
  let quotation: ReportInput["quotation"] | undefined = undefined;
  let materialsVersion: number | null = null;
  let materialsVersionId: string | null = null;
  let quotationVersion: number | null = null;
  let quotationVersionId: string | null = null;
  if (opts.includeMaterials) {
    const mats = await getMaterialsLocal(assessmentId, ctx);
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
    const quotes = await getQuotationsLocal(assessmentId, ctx);
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
  const allFindings = await listFindingsLocal(assessmentId, ctx);
  const confirmedFindings = allFindings.filter((f) => f.status === "confirmed").map((f) => ({
    title: f.title,
    severity: f.severity,
    description: f.description,
    uncertainty: f.uncertainty,
    evidenceCount: f.evidenceRefs.length,
    status: "confirmed",
  }));
  const awaitingReview = allFindings.filter((f) => f.status === "needs_review").length;
  const unresolved = checklist.filter((c) => c.status === "not_checked" || c.status === "fail" || c.status === "needs_attention").map((c) => `${c.title} — ${c.status}`);
  const limitations = [...(opts.limitations ?? []), ...unresolved];
  if (awaitingReview > 0) limitations.push(`${awaitingReview} finding(s) are still awaiting review and are not included in this report`);
  if (materials?.some((m) => m.provisional)) limitations.push("Provisional quantities present — verify missing inputs before procurement");
  const input: ReportInput = {
    siteName: assessment.siteName,
    mode: assessment.mode,
    pack: assessment.pack,
    context: assessment.context,
    checklist,
    findings: confirmedFindings,
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
  // Snapshots are created as DRAFTS. Finalizing is a separate step (finalizeSnapshotLocal) that needs a
  // person's sign-off and re-checks completeness and that the facts did not change since the draft.
  if (input.finalize) throw new Error("Cannot finalize directly — create a draft, review it, then sign off to finalize it");
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
    artifactKey: null, // set only after the PDF artifact is actually uploaded
    htmlPreview: "", // filled after
    createdAt: new Date().toISOString(),
    createdBy: input.ctx?.userId ?? "demo-user",
    finalized: !!input.finalize,
    immutable: true as const,
  };
  const htmlPreview = buildReportHtml(snapshot, reportInput);
  snapshot.htmlPreview = htmlPreview;
  const record: SnapshotRecord = { ...snapshot, workspaceId, payload: reportInput };
  // Try Supabase first if env
  if (dbMode(input.ctx) && workspaceId && asUuidOrNull(input.assessmentId)) {
    try {
      const supabase = await clientFor(input.ctx);
      const { data: inserted, error } = await supabase.from("report_snapshots").insert({
        id,
        workspace_id: workspaceId,
        created_by: input.ctx?.userId,
        assessment_id: input.assessmentId,
        assessment_version: versions.assessmentVersion,
        checklist_version: versions.checklistVersion,
        materials_version: versions.materialsVersion,
        quotation_version: versions.quotationVersion,
        artifact_key: snapshot.artifactKey,
        finalized: snapshot.finalized,
        html_preview: snapshot.htmlPreview,
        snapshot_payload: reportInput as unknown as never,
      }).select("assessment_version").single();
      if (error) throw error;
      // The database allocates the version atomically; trust it over the predicted value.
      snapshot.assessmentVersion = (inserted as { assessment_version: number }).assessment_version;
      await auditEvent({ workspaceId, action: input.finalize ? "snapshot.finalized" : "snapshot.drafted", targetType: "snapshot", targetId: id, ctx: input.ctx });
      await advanceStatusAfterSnapshot(input.assessmentId, !!input.finalize, input.ctx);
      return { snapshot, input: reportInput, persisted: true };
    } catch (e) {
      throw dbError(e);
    }
  }
  assertFileMode(input.ctx);
  // File fallback — enforce immutability: never overwrite finalized snapshot
  ensureDir();
  const all = readJson<SnapshotRecord[]>(SNAPSHOTS_FILE, []);
  // finalized is set on creation only; updates not allowed — create new id instead
  all.push(record);
  writeJson(SNAPSHOTS_FILE, all);
  await advanceStatusAfterSnapshot(input.assessmentId, !!input.finalize, input.ctx);
  return { snapshot, input: reportInput, persisted: false };
}

export async function getSnapshotLocal(snapshotId: string, ctx?: StoreCtx): Promise<SnapshotRecord | null> {
  if (dbMode(ctx)) {
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
          reviewedBy: data.reviewed_by ?? null,
          reviewedByLabel: data.reviewed_by_label ?? null,
          reviewedAt: data.reviewed_at ?? null,
          reviewNote: data.review_note ?? null,
          workspaceId: data.workspace_id ?? null,
          payload: (data.snapshot_payload as unknown as ReportInput) ?? ({} as ReportInput),
        };
      }
    } catch (e) { throw dbError(e); }
  }
  if (dbMode(ctx)) return null;
  const all = readJson<SnapshotRecord[]>(SNAPSHOTS_FILE, []);
  return all.find((s) => s.id === snapshotId) ?? null;
}

export async function listSnapshotsLocal(assessmentId?: string, ctx?: StoreCtx): Promise<SnapshotRecord[]> {
  if (dbMode(ctx)) {
    try {
      const supabase = await clientFor(ctx);
      if (!assessmentId && !ctx?.workspaceId) return [];
      let query = supabase.from("report_snapshots").select("*");
      query = assessmentId ? query.eq("assessment_id", assessmentId) : query.eq("workspace_id", ctx!.workspaceId!);
      const { data } = await query.order("created_at", { ascending: false }).limit(50);
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
        reviewedBy: d.reviewed_by ?? null,
        reviewedByLabel: d.reviewed_by_label ?? null,
        reviewedAt: d.reviewed_at ?? null,
        reviewNote: d.review_note ?? null,
        workspaceId: d.workspace_id ?? null,
        payload: (d.snapshot_payload as unknown as ReportInput) ?? ({} as ReportInput),
      }));
    } catch (e) { throw dbError(e); }
  }
  assertFileMode(ctx);
  const all = readJson<SnapshotRecord[]>(SNAPSHOTS_FILE, []);
  const filtered = assessmentId ? all.filter((s) => s.assessmentId === assessmentId) : all;
  return filtered.slice(-50).reverse();
}

export async function tryUploadReportArtifact(snapshotId: string, pdfBytes: Uint8Array, ctx?: StoreCtx): Promise<{ uploaded: boolean; signedUrl: string | null; error?: string }> {
  if (!hasServiceRole()) return { uploaded: false, signedUrl: null, error: "Supabase env missing — using base64 fallback" };
  try {
    // Storage + artifact bookkeeping always run privileged AFTER route-level authz.
    const supabase = await serviceClient();
    const key = `reports/${snapshotId}.pdf`;
    const { error: upErr } = await supabase.storage.from("reports").upload(key, pdfBytes, { contentType: "application/pdf", upsert: true });
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
  if (dbMode(input.ctx)) {
    if (!ws || !assessmentUuid) throw new Error("Forbidden — invalid assessment");
    if (!hasServiceRole()) throw new Error("Evidence storage is not configured on the server");
    const storage = await serviceClient(); // Storage writes are server-side only, AFTER the workspace check above
    const supabase = await clientFor(input.ctx); // the row insert runs under RLS (role-aware)
    if (input.bytes) {
      const { error: upErr } = await storage.storage.from("evidence").upload(input.storageKey, input.bytes, { contentType: input.mimeType, upsert: false });
      if (upErr) throw new Error(`Storage upload failed — ${upErr.message}`);
    }
    const { data, error } = await supabase.from("evidence_items").insert({
      workspace_id: ws,
      created_by: input.ctx?.userId,
      assessment_id: assessmentUuid,
      item_id: itemUuid,
      storage_key: input.storageKey,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
    }).select("id, captured_at").single();
    if (error) {
      if (input.bytes) await storage.storage.from("evidence").remove([input.storageKey]); // no orphaned object
      throw dbError(error);
    }
    return {
      record: { id: (data as { id: string }).id, assessmentId: input.assessmentId, itemId: input.itemId ?? null, storageKey: input.storageKey, mimeType: input.mimeType, sizeBytes: input.sizeBytes, uploadedAt: (data as { captured_at: string }).captured_at },
      persisted: true,
    };
  }
  assertFileMode(input.ctx);
  const all = readJson<EvidenceRecord[]>(EVIDENCE_FILE, []);
  const record: EvidenceRecord = { id: `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, assessmentId: input.assessmentId, itemId: input.itemId ?? null, storageKey: input.storageKey, mimeType: input.mimeType, sizeBytes: input.sizeBytes, uploadedAt: new Date().toISOString() };
  all.push(record);
  writeJson(EVIDENCE_FILE, all);
  return { record, persisted: false };
}

export async function listEvidenceLocal(assessmentId: string, ctx?: StoreCtx): Promise<{ items: EvidenceRecord[]; persisted: boolean }> {
  await verifyAssessmentWorkspace(ctx, assessmentId);
  if (dbMode(ctx) && asUuidOrNull(assessmentId)) {
    try {
      const supabase = await clientFor(ctx);
      const { data } = await supabase.from("evidence_items").select("id, assessment_id, item_id, storage_key, mime_type, size_bytes, captured_at").eq("assessment_id", assessmentId).order("captured_at", { ascending: false }).limit(100);
      if (data) return {
        items: (data as Array<{ id: string; assessment_id: string; item_id: string | null; storage_key: string; mime_type: string; size_bytes: number; captured_at: string }>).map((r) => ({ id: r.id, assessmentId, itemId: r.item_id, storageKey: r.storage_key, mimeType: r.mime_type, sizeBytes: r.size_bytes, uploadedAt: r.captured_at })),
        persisted: true,
      };
    } catch (e) { throw dbError(e); }
  }
  if (dbMode(ctx)) return { items: [], persisted: true };
  const all = readJson<EvidenceRecord[]>(EVIDENCE_FILE, []);
  return { items: all.filter((e) => e.assessmentId === assessmentId).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)), persisted: false };
}

/** Short-lived signed URL for a private evidence object. Verifies the key belongs to the assessment. */
export async function signedEvidenceUrl(assessmentId: string, storageKey: string, ctx?: StoreCtx): Promise<{ signedUrl: string | null; error?: string }> {
  await verifyAssessmentWorkspace(ctx, assessmentId);
  const { items } = await listEvidenceLocal(assessmentId, ctx);
  if (!items.some((e) => e.storageKey === storageKey)) return { signedUrl: null, error: "Unknown storage key for this assessment" };
  if (!hasServiceRole()) return { signedUrl: null, error: "Supabase env missing — file fallback has no private storage" };
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
  uncertainty?: string;
  missingInputs?: string[];
  reviewedAt?: string;
};

type DbFindingRow = { id: string; assessment_id?: string; title: string; description: string | null; severity: "low" | "medium" | "high" | null; status: string; evidence_refs: string[] | null; uncertainty: string | null; missing_inputs: string[] | null; reviewed_at: string | null; created_at: string };
const FINDING_COLS = "id, assessment_id, title, description, severity, status, evidence_refs, uncertainty, missing_inputs, reviewed_at, created_at";

function toFindingRecord(r: DbFindingRow, assessmentId: string): FindingRecord {
  return { id: r.id, assessmentId, title: r.title, description: r.description ?? undefined, severity: r.severity ?? undefined, status: r.status, evidenceRefs: r.evidence_refs ?? [], uncertainty: r.uncertainty ?? undefined, missingInputs: r.missing_inputs ?? [], reviewedAt: r.reviewed_at ?? undefined, createdAt: r.created_at };
}

const FINDINGS_FILE = path.join(DATA_DIR, "findings.json");

export async function saveFindingLocal(input: {
  assessmentId: string;
  title: string;
  description?: string;
  severity?: "low" | "medium" | "high";
  evidenceRefs?: string[];
  uncertainty?: string;
  missingInputs?: string[];
  ctx?: StoreCtx;
}): Promise<{ finding: FindingRecord; persisted: boolean }> {
  const title = input.title.trim();
  if (title.length < 3) throw new Error("Finding title must be at least 3 chars");
  const ws = workspaceOf(input.ctx, null);
  await verifyAssessmentWorkspace(input.ctx, input.assessmentId);
  if (dbMode(input.ctx)) {
    if (!ws || !asUuidOrNull(input.assessmentId)) throw new Error("Forbidden — invalid assessment");
    const supabase = await clientFor(input.ctx);
    const { data, error } = await supabase.from("findings").insert({
      assessment_id: input.assessmentId,
      title,
      description: input.description ?? null,
      severity: input.severity ?? null,
      status: "needs_review",
      evidence_refs: input.evidenceRefs ?? [],
      uncertainty: input.uncertainty ?? null,
      missing_inputs: input.missingInputs ?? [],
    }).select(FINDING_COLS).single();
    if (error) throw dbError(error);
    await auditEvent({ workspaceId: ws, action: "finding.created", targetType: "finding", targetId: (data as { id: string }).id, ctx: input.ctx });
    return { finding: toFindingRecord(data as DbFindingRow, input.assessmentId), persisted: true };
  }
  assertFileMode(input.ctx);
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
  if (dbMode(ctx)) {
    if (!asUuidOrNull(findingId)) throw new Error("Finding not found");
    const supabase = await clientFor(ctx);
    const { data: existing, error: exErr } = await supabase.from("findings").select("assessment_id").eq("id", findingId).maybeSingle();
    if (exErr) throw dbError(exErr);
    if (!existing) throw new Error("Finding not found");
    await verifyAssessmentWorkspace(ctx, (existing as { assessment_id: string }).assessment_id);
    const { data, error } = await supabase.from("findings").update({ status, reviewed_by: status === "needs_review" ? null : ctx?.userId ?? null, reviewed_at: status === "needs_review" ? null : new Date().toISOString() }).eq("id", findingId).select(FINDING_COLS).single();
    if (error) throw dbError(error);
    const row = data as DbFindingRow;
    await auditEvent({ workspaceId: ctx?.workspaceId, action: "finding." + status, targetType: "finding", targetId: findingId, ctx });
    return toFindingRecord(row, row.assessment_id ?? (existing as { assessment_id: string }).assessment_id);
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
  if (dbMode(ctx)) {
    if (!asUuidOrNull(evidenceId)) throw new Error("Evidence not found");
    const supabase = await clientFor(ctx); // RLS + role policy decide; no service role for the row
    const { data: row, error: rowErr } = await supabase.from("evidence_items").select("storage_key, assessment_id, workspace_id").eq("id", evidenceId).maybeSingle();
    if (rowErr) throw dbError(rowErr);
    if (!row) throw new Error("Evidence not found");
    const ev = row as { storage_key: string; assessment_id: string | null; workspace_id: string };
    if (ev.assessment_id !== assessmentId || ev.workspace_id !== ctx?.workspaceId) {
      throw new Error("Forbidden — evidence belongs to a different assessment");
    }
    const { error: delErr } = await supabase.from("evidence_items").delete().eq("id", evidenceId);
    if (delErr) throw dbError(delErr);
    // Best-effort storage removal — the DB row is the source of truth for listing.
    if (hasServiceRole()) {
      const admin = await serviceClient();
      const { error: storErr } = await admin.storage.from("evidence").remove([ev.storage_key]);
      if (storErr) console.error("Evidence storage removal failed", storErr.message);
    }
    await auditEvent({ workspaceId: ev.workspace_id, action: "evidence.deleted", targetType: "evidence", targetId: evidenceId, ctx });
    return { ok: true, persisted: true };
  }
  assertFileMode(ctx);
  const all = readJson<EvidenceRecord[]>(EVIDENCE_FILE, []);
  const kept = all.filter((e) => !(e.id === evidenceId && e.assessmentId === assessmentId));
  if (kept.length === all.length) throw new Error("Evidence not found");
  writeJson(EVIDENCE_FILE, kept);
  return { ok: true, persisted: false };
}

export async function auditEvent(input: { workspaceId?: string | null; action: string; targetType?: string; targetId?: string; actorId?: string; ctx?: StoreCtx }): Promise<void> {
  // Best-effort trail — never blocks the mutating operation.
  try {
    if (!hasServiceRole() || !input.workspaceId || !asUuidOrNull(input.workspaceId)) return;
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
  if (dbMode(ctx) && asUuidOrNull(workspaceId)) {
    try {
      const supabase = await clientFor(ctx);
      let q = supabase.from("audit_events").select("id, workspace_id, actor, action, target_type, target_id, created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(opts.limit ?? 100);
      const { data } = await q;
      if (data) return (data as Array<{ id: string; workspace_id: string | null; actor: string | null; action: string; target_type: string | null; target_id: string | null; created_at: string }>).map((r) => ({ id: r.id, workspaceId: r.workspace_id, actor: r.actor, action: r.action, targetType: r.target_type, targetId: r.target_id, createdAt: r.created_at }));
    } catch (e) { throw dbError(e); }
  }
  return [];
}

export type SiteRecord = { id: string; workspaceId: string | null; name: string; address?: string; createdAt: string; jobCount?: number };

export async function listSitesLocal(workspaceId: string | null | undefined, ctx?: StoreCtx): Promise<SiteRecord[]> {
  const ws = workspaceOf(ctx, workspaceId);
  if (dbMode(ctx) && ws && asUuidOrNull(ws)) {
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
    } catch (e) { throw dbError(e); }
  }
  assertFileMode(ctx);
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
  if (dbMode(ctx) && asUuidOrNull(siteId)) {
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
  if (!dbMode(ctx) || !asUuidOrNull(workspaceId)) return { members: [], myRole: null };
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
  if (dbMode(ctx)) {
    if (!asUuidOrNull(assessmentId)) return [];
    const supabase = await clientFor(ctx);
    const { data, error } = await supabase.from("findings").select(FINDING_COLS).eq("assessment_id", assessmentId).order("created_at", { ascending: false });
    if (error) throw dbError(error);
    return ((data ?? []) as DbFindingRow[]).map((r) => toFindingRecord(r, assessmentId));
  }
  const all = readJson<FindingRecord[]>(FINDINGS_FILE, []);
  return all.filter((f) => f.assessmentId === assessmentId);
}

// ---- Assessment status lifecycle: draft -> in_progress -> review -> finalized ----
export async function setAssessmentStatusLocal(id: string, status: AssessmentRecord["status"], ctx?: StoreCtx): Promise<void> {
  if (dbMode(ctx)) {
    const supabase = await clientFor(ctx);
    const { error } = await supabase.from("assessments").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw dbError(error);
    return;
  }
  const all = readJson<AssessmentRecord[]>(ASSESSMENTS_FILE, []);
  const idx = all.findIndex((a) => a.id === id);
  if (idx >= 0) {
    all[idx].status = status;
    all[idx].updatedAt = new Date().toISOString();
    writeJson(ASSESSMENTS_FILE, all);
  }
}

/** Finalizing marks the job finalized; a draft snapshot moves an in-progress job to review. */
async function advanceStatusAfterSnapshot(assessmentId: string, finalize: boolean, ctx?: StoreCtx): Promise<void> {
  try {
    if (finalize) return await setAssessmentStatusLocal(assessmentId, "finalized", ctx);
    const current = await getAssessmentLocal(assessmentId, ctx);
    if (current && (current.status === "draft" || current.status === "in_progress")) await setAssessmentStatusLocal(assessmentId, "review", ctx);
  } catch (e) {
    // The snapshot is already stored; a status update failure must not lose it.
    console.error("Status update after snapshot failed", e instanceof Error ? e.message : String(e));
  }
}

// ---- Completeness review (single source of truth for UI, API and the finalize gate) ----
export async function getCompletenessLocal(assessmentId: string, ctx?: StoreCtx): Promise<CompletenessResult> {
  await verifyAssessmentWorkspace(ctx, assessmentId);
  const assessment = await getAssessmentLocal(assessmentId, ctx);
  if (!assessment) throw new Error("Assessment not found");
  const [items, responses, evidence, findings, materials, quotations] = await Promise.all([
    getChecklistItemsLocal(assessmentId, ctx),
    getResponsesLocal(assessmentId, ctx),
    listEvidenceLocal(assessmentId, ctx),
    listFindingsLocal(assessmentId, ctx),
    getMaterialsLocal(assessmentId, ctx),
    getQuotationsLocal(assessmentId, ctx),
  ]);
  const answers = (assessment.context as { clarificationAnswers?: Record<string, unknown> }).clarificationAnswers;
  const result = computeCompleteness({
    items: items.map((i) => ({ id: i.id, title: i.title, required: i.required })),
    responses: responses.map((r) => ({ itemId: r.itemId, status: r.status, measuredValue: r.measuredValue })),
    evidenceItemIds: evidence.items.map((e) => e.itemId).filter((x): x is string => !!x),
    findings: findings.map((f) => ({ status: f.status })),
    materials: materials.length > 0 ? { count: materials.length, provisionalCount: materials.filter((m) => m.provisional).length } : null,
    quotations: quotations.map((q) => ({ stale: q.stale })),
    clarificationAnswered: !!answers && Object.keys(answers).length > 0,
  });
  if (items.length === 0) {
    result.blockers.unshift({ code: "no_checklist", reason: "The checklist has no items — confirm a checklist first", target: "checklist" });
    result.ready = false;
  }
  return result;
}

// ---- Recorded measurements (formula + inputs + result; migration 0011) ----
export type MeasurementRecord = {
  id: string;
  assessmentId: string;
  itemId: string | null;
  name: string;
  formula: FormulaId | "manual";
  method?: string;
  inputs: Record<string, unknown>;
  value: number;
  unit: string;
  note?: string;
  createdAt: string;
};

const MEASUREMENTS_FILE = path.join(DATA_DIR, "measurements.json");

type DbMeasurement = { id: string; assessment_id: string; item_id: string | null; name: string; formula: string; method: string | null; inputs: Record<string, unknown> | null; value: number; unit: string; note: string | null; created_at: string };
const MEASUREMENT_COLS = "id, assessment_id, item_id, name, formula, method, inputs, value, unit, note, created_at";

function toMeasurementRecord(r: DbMeasurement): MeasurementRecord {
  return { id: r.id, assessmentId: r.assessment_id, itemId: r.item_id, name: r.name, formula: r.formula as MeasurementRecord["formula"], method: r.method ?? undefined, inputs: r.inputs ?? {}, value: r.value, unit: r.unit, note: r.note ?? undefined, createdAt: r.created_at };
}

export async function saveMeasurementLocal(input: {
  assessmentId: string;
  itemId?: string | null;
  name: string;
  formula: FormulaId | "manual";
  inputs?: Record<string, MeasurementInput>;
  value?: number;
  unit?: string;
  note?: string;
  ctx?: StoreCtx;
}): Promise<MeasurementRecord> {
  const name = input.name.trim();
  if (!name) throw new Error("Measurement needs a name");
  await verifyAssessmentWorkspace(input.ctx, input.assessmentId);
  let value: number;
  let unit: string;
  let method: string | undefined;
  let inputs: Record<string, unknown> = {};
  if (input.formula === "manual") {
    if (input.value === undefined || !Number.isFinite(input.value)) throw new Error("Enter the measured value");
    if (!input.unit?.trim()) throw new Error("Enter the unit for a manual measurement");
    value = input.value;
    unit = input.unit.trim();
    method = "manual entry (value as measured on site)";
  } else {
    // Computed here from the entered inputs — never taken from the client or from AI.
    const calc = calculateMeasurement(input.formula, input.inputs ?? {});
    value = calc.value;
    unit = calc.unit;
    method = calc.method;
    inputs = calc.inputs;
  }
  if (dbMode(input.ctx)) {
    const supabase = await clientFor(input.ctx);
    const { data, error } = await supabase.from("measurements").insert({
      assessment_id: input.assessmentId,
      item_id: asUuidOrNull(input.itemId),
      name, formula: input.formula, method: method ?? null, inputs, value, unit, note: input.note ?? null,
      created_by: input.ctx?.userId,
    }).select(MEASUREMENT_COLS).single();
    if (error) throw dbError(error);
    await auditEvent({ workspaceId: input.ctx?.workspaceId, action: "measurement.saved", targetType: "assessment", targetId: input.assessmentId, ctx: input.ctx });
    return toMeasurementRecord(data as DbMeasurement);
  }
  const all = readJson<MeasurementRecord[]>(MEASUREMENTS_FILE, []);
  const rec: MeasurementRecord = { id: "meas_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6), assessmentId: input.assessmentId, itemId: input.itemId ?? null, name, formula: input.formula, method, inputs, value, unit, note: input.note, createdAt: new Date().toISOString() };
  all.push(rec);
  writeJson(MEASUREMENTS_FILE, all);
  return rec;
}

export async function listMeasurementsLocal(assessmentId: string, ctx?: StoreCtx): Promise<MeasurementRecord[]> {
  if (dbMode(ctx)) {
    if (!asUuidOrNull(assessmentId)) return [];
    const supabase = await clientFor(ctx);
    const { data, error } = await supabase.from("measurements").select(MEASUREMENT_COLS).eq("assessment_id", assessmentId).order("created_at", { ascending: true });
    if (error) throw dbError(error);
    return ((data ?? []) as DbMeasurement[]).map(toMeasurementRecord);
  }
  return readJson<MeasurementRecord[]>(MEASUREMENTS_FILE, []).filter((m) => m.assessmentId === assessmentId);
}

export async function deleteMeasurementLocal(assessmentId: string, measurementId: string, ctx?: StoreCtx): Promise<void> {
  await verifyAssessmentWorkspace(ctx, assessmentId);
  if (dbMode(ctx)) {
    if (!asUuidOrNull(measurementId)) throw new Error("Measurement not found");
    const supabase = await clientFor(ctx);
    const { data, error } = await supabase.from("measurements").delete().eq("id", measurementId).eq("assessment_id", assessmentId).select("id");
    if (error) throw dbError(error);
    if (!data || data.length === 0) throw new Error("Measurement not found");
    return;
  }
  const all = readJson<MeasurementRecord[]>(MEASUREMENTS_FILE, []);
  const kept = all.filter((m) => !(m.id === measurementId && m.assessmentId === assessmentId));
  if (kept.length === all.length) throw new Error("Measurement not found");
  writeJson(MEASUREMENTS_FILE, kept);
}

// ---- Report review: edit a draft's narrative, then sign off and finalize it ----
const NARRATIVE_MAX = 5000;

function cleanNarrative(n: ReportNarrative): ReportNarrative {
  const out: ReportNarrative = {};
  for (const k of ["summary", "recommendations", "notes"] as const) {
    const v = n[k];
    if (v === undefined) continue;
    if (typeof v !== "string") throw new Error("Narrative sections must be text");
    if (v.length > NARRATIVE_MAX) throw new Error("A narrative section is limited to " + NARRATIVE_MAX + " characters");
    out[k] = v.trim();
  }
  return out;
}

/** Everything in a report that comes from stored facts (excludes the human narrative). */
function factsFingerprint(input: ReportInput): string {
  const { narrative: _narrative, ...facts } = input;
  void _narrative;
  return JSON.stringify(facts);
}

async function writeDraftSnapshot(snapshotId: string, patch: { payload?: ReportInput; htmlPreview?: string; review?: { by: string | null; label: string | null; at: string; note: string | null; finalized: true } }, ctx?: StoreCtx): Promise<void> {
  if (dbMode(ctx)) {
    const supabase = await clientFor(ctx);
    const update: Record<string, unknown> = {};
    if (patch.payload) update.snapshot_payload = patch.payload as unknown as never;
    if (patch.htmlPreview !== undefined) update.html_preview = patch.htmlPreview;
    if (patch.review) {
      update.finalized = true;
      update.reviewed_by = patch.review.by;
      update.reviewed_by_label = patch.review.label;
      update.reviewed_at = patch.review.at;
      update.review_note = patch.review.note;
    }
    // finalized = false in the filter means a finalized snapshot can never be modified through this path.
    const { data, error } = await supabase.from("report_snapshots").update(update).eq("id", snapshotId).eq("finalized", false).select("id");
    if (error) throw dbError(error);
    if (!data || data.length === 0) throw new Error("This snapshot is already finalized (immutable) or was not found");
    return;
  }
  const all = readJson<SnapshotRecord[]>(SNAPSHOTS_FILE, []);
  const idx = all.findIndex((s) => s.id === snapshotId);
  if (idx < 0) throw new Error("Snapshot not found");
  if (all[idx].finalized) throw new Error("This snapshot is already finalized (immutable)");
  if (patch.payload) all[idx].payload = patch.payload;
  if (patch.htmlPreview !== undefined) all[idx].htmlPreview = patch.htmlPreview;
  if (patch.review) {
    all[idx].finalized = true;
    all[idx].reviewedBy = patch.review.by;
    all[idx].reviewedByLabel = patch.review.label;
    all[idx].reviewedAt = patch.review.at;
    all[idx].reviewNote = patch.review.note;
  }
  writeJson(SNAPSHOTS_FILE, all);
}

export async function updateSnapshotNarrativeLocal(snapshotId: string, narrative: ReportNarrative, ctx?: StoreCtx): Promise<SnapshotRecord> {
  const snap = await getSnapshotLocal(snapshotId, ctx);
  if (!snap) throw new Error("Snapshot not found");
  await verifyAssessmentWorkspace(ctx, snap.assessmentId);
  if (snap.finalized) throw new Error("This report is finalized (immutable) — create a new draft to change it");
  const payload: ReportInput = { ...snap.payload, narrative: { ...(snap.payload.narrative ?? {}), ...cleanNarrative(narrative) } };
  const htmlPreview = buildReportHtml(snap, payload);
  await writeDraftSnapshot(snapshotId, { payload, htmlPreview }, ctx);
  await auditEvent({ workspaceId: ctx?.workspaceId, action: "snapshot.edited", targetType: "snapshot", targetId: snapshotId, ctx });
  return { ...snap, payload, htmlPreview };
}

/**
 * Sign off and finalize a reviewed DRAFT. Requires: no completeness blockers, and the stored facts are
 * unchanged since the draft was created (otherwise the reviewer would be signing something they did not see).
 */
export async function finalizeSnapshotLocal(snapshotId: string, reviewNote: string | undefined, ctx?: StoreCtx): Promise<SnapshotRecord> {
  if (!ctx?.userId && dbMode(ctx)) throw new Error("Sign in required");
  const snap = await getSnapshotLocal(snapshotId, ctx);
  if (!snap) throw new Error("Snapshot not found");
  await verifyAssessmentWorkspace(ctx, snap.assessmentId);
  if (snap.finalized) throw new Error("This report is already finalized");

  const completeness = await getCompletenessLocal(snap.assessmentId, ctx);
  if (!completeness.ready) {
    throw new Error("Cannot finalize — " + completeness.blockers.length + " blocking issue(s) in the completeness review: " + completeness.blockers.map((b) => b.reason).join("; "));
  }
  const current = await buildReportInputFromStoredFacts(snap.assessmentId, { includeMaterials: snap.payload.materials !== undefined }, ctx);
  if (factsFingerprint(current.input) !== factsFingerprint(snap.payload)) {
    throw new Error("Cannot finalize — the assessment changed since this draft was created. Create a new draft, review it, then sign off.");
  }

  const note = reviewNote?.trim() ? reviewNote.trim().slice(0, 1000) : null;
  const review = { by: ctx?.userId ?? null, label: ctx?.email ?? null, at: new Date().toISOString(), note, finalized: true as const };
  const finalizedSnap: SnapshotRecord = { ...snap, finalized: true, reviewedBy: review.by, reviewedByLabel: review.label, reviewedAt: review.at, reviewNote: note };
  const htmlPreview = buildReportHtml(finalizedSnap, snap.payload);
  await writeDraftSnapshot(snapshotId, { htmlPreview, review }, ctx);
  await setAssessmentStatusLocal(snap.assessmentId, "finalized", ctx);
  await auditEvent({ workspaceId: ctx?.workspaceId, action: "snapshot.finalized", targetType: "snapshot", targetId: snapshotId, ctx });
  return { ...finalizedSnap, htmlPreview };
}
