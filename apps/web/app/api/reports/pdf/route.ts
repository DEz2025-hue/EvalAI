import { NextResponse } from "next/server";
import { z } from "zod";
import { buildReportPdf } from "../../../../lib/pdf";
import { buildReportHtml } from "@eval-ai/shared";

const Body = z.object({
  assessmentId: z.string(),
  mode: z.enum(["assessment", "inspection"]).default("assessment"),
  pack: z.enum(["solar", "cctv"]).default("solar"),
  siteName: z.string().default("Site demo"),
  context: z.record(z.unknown()).default({}),
  checklist: z.array(z.object({ title: z.string(), status: z.string(), notes: z.string().optional() })).default([]),
  measurements: z.array(z.object({ name: z.string(), value: z.number(), unit: z.string() })).default([]),
  findings: z.array(z.object({ title: z.string(), severity: z.string().optional() })).default([]),
  materials: z.array(z.object({ description: z.string(), quantity: z.number(), unit: z.string(), rationale: z.string(), provisional: z.boolean().optional() })).optional(),
  quotation: z.object({ supplier: z.string(), total: z.number(), currency: z.string() }).nullable().optional(),
  limitations: z.array(z.string()).default([]),
  finalize: z.boolean().default(false),
});

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());
    const snapshot = {
      id: `snap-${Date.now().toString(36)}`,
      assessmentId: body.assessmentId,
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
      context: body.context,
      checklist: body.checklist,
      measurements: body.measurements,
      findings: body.findings,
      materials: body.materials,
      quotation: body.quotation ?? null,
      limitations: body.limitations,
    };

    const pdfBytes = await buildReportPdf(snapshot as never, input as never);
    const html = buildReportHtml(snapshot as never, input as never);

    // In production: upload pdfBytes to private storage.buckets.reports with key reports/${snapshot.id}.pdf, then return signed URL
    // For now, return pdf as base64 + html preview — deterministic, no AI
    const base64 = Buffer.from(pdfBytes).toString("base64");

    return NextResponse.json({
      snapshot,
      htmlPreview: html.slice(0, 20000), // truncated
      pdfBase64: base64,
      pdfBytes: pdfBytes.length,
      artifactKey: `reports/${snapshot.id}.pdf`,
      note: "Deterministic PDF from versioned snapshot — later edits create new snapshots, never mutate finalized reports. Store to private Storage + signed URL in production.",
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
