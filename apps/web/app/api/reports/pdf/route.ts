import { NextResponse } from "next/server";
import { z } from "zod";
import { buildReportPdf } from "../../../../lib/pdf";
import { buildReportHtml } from "@eval-ai/shared";
import { getSnapshotLocal, buildReportInputFromStoredFacts, tryUploadReportArtifact, verifyAssessmentWorkspace } from "../../../../lib/store";
import { requireAuth, storeError } from "../../../../lib/auth";

const Body = z.object({
  assessmentId: z.string().optional(),
  snapshotId: z.string().optional(),
  mode: z.enum(["assessment", "inspection"]).default("assessment"),
  pack: z.enum(["solar", "cctv"]).default("solar"),
  siteName: z.string().default("Site demo"),
  context: z.record(z.unknown()).default({}),
  checklist: z.array(z.object({ title: z.string(), status: z.string(), notes: z.string().optional() })).optional(),
  measurements: z.array(z.object({ name: z.string(), value: z.number(), unit: z.string() })).optional(),
  findings: z.array(z.object({ title: z.string(), severity: z.string().optional() })).optional(),
  materials: z.array(z.object({ description: z.string(), quantity: z.number(), unit: z.string(), rationale: z.string(), provisional: z.boolean().optional() })).optional(),
  quotation: z.object({ supplier: z.string(), total: z.number(), currency: z.string() }).nullable().optional(),
  limitations: z.array(z.string()).optional(),
  finalize: z.boolean().default(false),
  includeMaterials: z.boolean().optional(),
});

export async function POST(req: Request) {
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  try {
    const body = Body.parse(await req.json());

    // Prefer snapshotId — deterministic assembly from stored facts, immutable version
    if (body.snapshotId) {
      const snap = await getSnapshotLocal(body.snapshotId, auth.ctx);
      if (snap) await verifyAssessmentWorkspace(auth.ctx, snap.assessmentId);
      if (!snap) return NextResponse.json({ error: `Snapshot ${body.snapshotId} not found` }, { status: 404 });
      const html = buildReportHtml(snap as never, snap.payload as never);
      const pdfBytes = await buildReportPdf(snap as never, snap.payload as never);
      const base64 = Buffer.from(pdfBytes).toString("base64");
      // Attempt private Storage upload; failure does NOT lose snapshot — return base64 fallback
      let storage: { uploaded: boolean; signedUrl: string | null; error?: string } = { uploaded: false, signedUrl: null };
      try {
        storage = await tryUploadReportArtifact(snap.id, pdfBytes);
      } catch (e) {
        storage = { uploaded: false, signedUrl: null, error: e instanceof Error ? e.message : String(e) };
      }
      return NextResponse.json({
        snapshot: snap,
        htmlPreview: html.slice(0, 20000),
        pdfBase64: base64,
        pdfBytes: pdfBytes.length,
        artifactKey: snap.artifactKey ?? `reports/${snap.id}.pdf`,
        signedUrl: storage.signedUrl,
        storageUploaded: storage.uploaded,
        storageError: storage.error ?? null,
        note: snap.finalized ? "Finalized (immutable) — later edits create new snapshots" : "Draft snapshot — finalize to make immutable. Export failure does not lose snapshot.",
      });
    }

    // Legacy / direct path: if assessmentId present without snapshotId, assemble from stored facts
    if (body.assessmentId) {
      await verifyAssessmentWorkspace(auth.ctx, body.assessmentId);
      const assembled = await buildReportInputFromStoredFacts(body.assessmentId, {
        includeMaterials: body.includeMaterials ?? !!body.materials,
        limitations: body.limitations,
      }, auth.ctx);
      const snapshot = {
        id: `snap-${Date.now().toString(36)}`,
        assessmentId: body.assessmentId,
        assessmentVersion: assembled.versions.assessmentVersion,
        checklistVersion: assembled.versions.checklistVersion,
        materialsVersion: assembled.versions.materialsVersion,
        materialsVersionId: assembled.versions.materialsVersionId,
        quotationVersion: assembled.versions.quotationVersion,
        quotationVersionId: assembled.versions.quotationVersionId,
        createdAt: new Date().toISOString(),
        createdBy: "demo-user",
        finalized: body.finalize,
        immutable: true as const,
      };
      const html = buildReportHtml(snapshot as never, assembled.input as never);
      const pdfBytes = await buildReportPdf(snapshot as never, assembled.input as never);
      const base64 = Buffer.from(pdfBytes).toString("base64");
      // For legacy path we do not persist snapshot automatically — caller should use /api/reports/snapshot for versioned persistence
      return NextResponse.json({
        snapshot,
        input: assembled.input,
        htmlPreview: html.slice(0, 20000),
        pdfBase64: base64,
        pdfBytes: pdfBytes.length,
        artifactKey: `reports/${snapshot.id}.pdf`,
        note: "Deterministic PDF from versioned snapshot assembled from stored facts — use /api/reports/snapshot POST to persist and finalize",
      });
    }

    // Fallback: use provided body input directly (for synthetic tests) — still versioned snapshot
    const snapshot = {
      id: `snap-${Date.now().toString(36)}`,
      assessmentId: body.assessmentId ?? `adhoc-${Date.now().toString(36)}`,
      assessmentVersion: 1,
      checklistVersion: "v1",
      materialsVersion: body.materials ? 1 : null,
      materialsVersionId: body.materials ? `mat-${body.assessmentId}` : null,
      quotationVersion: body.quotation ? 1 : null,
      quotationVersionId: body.quotation ? `quote-${body.assessmentId}` : null,
      createdAt: new Date().toISOString(),
      createdBy: "demo-user",
      finalized: body.finalize,
      immutable: true as const,
    };
    const input = {
      siteName: body.siteName,
      mode: body.mode,
      pack: body.pack,
      context: body.context ?? {},
      checklist: body.checklist ?? [],
      measurements: body.measurements ?? [],
      findings: body.findings ?? [],
      materials: body.materials,
      quotation: body.quotation ?? null,
      limitations: body.limitations ?? [],
    };
    const pdfBytes = await buildReportPdf(snapshot as never, input as never);
    const html = buildReportHtml(snapshot as never, input as never);
    const base64 = Buffer.from(pdfBytes).toString("base64");
    return NextResponse.json({
      snapshot,
      htmlPreview: html.slice(0, 20000),
      pdfBase64: base64,
      pdfBytes: pdfBytes.length,
      artifactKey: `reports/${snapshot.id}.pdf`,
      note: "Adhoc snapshot — prefer assessmentId-based assembly for versioned persistence",
    });
  } catch (e) {
    return storeError(e);
  }
}

// GET supports ?snapshotId=xxx for fetching snapshot payload + html
export async function GET(req: Request) {
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const url = new URL(req.url);
  const snapshotId = url.searchParams.get("snapshotId");
  if (!snapshotId) return NextResponse.json({ error: "snapshotId required" }, { status: 400 });
  try {
    const snap = await getSnapshotLocal(snapshotId, auth.ctx);
    if (!snap) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await verifyAssessmentWorkspace(auth.ctx, snap.assessmentId);
    return NextResponse.json({ snapshot: snap, payload: snap.payload });
  } catch (e) {
    return storeError(e);
  }
}
