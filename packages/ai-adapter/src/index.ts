import { z } from "zod";

// Server-only adapter — never import in client components.
// All secrets (AI_PROVIDER_API_KEY) stay server-side. Validate I/O at trust boundary.
// Real Meta integration: Wonder (complex), Spark (fast), Voice Transcribe (audio) — verify live per D-013.

export type AiOperation = "clarifyContext" | "proposeChecklist" | "analyzeAssessment" | "draftFinding" | "draftRecommendation" | "transcribeAudio" | "generateSpeech" | "analyzeImage" | "draftReport";

export const AiDraft = z.object({
  summary: z.string(),
  observations: z.array(z.string()).default([]),
  potential_findings: z.array(z.object({ title: z.string(), severity: z.enum(["low","medium","high"]).optional(), evidence_refs: z.array(z.string()).default([]) })).default([]),
  recommendations: z.array(z.string()).default([]),
  missing_information: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  uncertainty: z.string().optional(),
  evidence_references: z.array(z.string()).default([]),
  requires_human_review: z.boolean().default(true),
});
export type AiDraft = z.infer<typeof AiDraft>;

export type AdapterConfig = {
  baseUrl: string; // AI_PROVIDER_BASE_URL
  apiKey: string;  // server-only
  wonderModel: string;
  sparkModel: string;
  voiceModel: string;
  timeoutMs: number;
};

export function getAdapterConfig(): AdapterConfig {
  const baseUrl = process.env.AI_PROVIDER_BASE_URL;
  const apiKey = process.env.AI_PROVIDER_API_KEY;
  if (!baseUrl || !apiKey) throw new Error("Missing AI_PROVIDER_BASE_URL / AI_PROVIDER_API_KEY — see .env.example (server-only)");
  return {
    baseUrl,
    apiKey,
    wonderModel: process.env.META_WONDER_MODEL || "muse-wonder",
    sparkModel: process.env.META_SPARK_MODEL || "muse-spark",
    voiceModel: process.env.META_VOICE_MODEL || "muse-voice-transcribe",
    timeoutMs: 30000,
  };
}

export async function callMetaModel(operation: AiOperation, input: unknown): Promise<AiDraft> {
  // Thin router to real implementations — keeps provider detail behind adapter
  const { wonderAnalyzeAssessment } = await import("./wonder");
  const { sparkClarifyContext, sparkProposeChecklist } = await import("./spark");
  const { voiceTranscribe } = await import("./voice");
  if (operation === "analyzeAssessment" || operation === "draftFinding" || operation === "draftRecommendation") {
    const res = await wonderAnalyzeAssessment(input as never);
    // Map Wonder output shape to AiDraft shape
    return {
      summary: res.summary,
      observations: res.observations,
      potential_findings: res.potentialFindings.map((f: { title: string; severity?: "low"|"medium"|"high"; evidenceRefs: string[] }) => ({ title: f.title, severity: f.severity, evidence_refs: f.evidenceRefs })),
      recommendations: res.recommendations,
      missing_information: res.missingInformation,
      assumptions: res.assumptions,
      uncertainty: res.uncertainty,
      evidence_references: res.evidenceReferences,
      requires_human_review: res.requiresHumanReview,
    };
  }
  if (operation === "clarifyContext") {
    const r = await sparkClarifyContext(input as never);
    return { summary: `Clarification — ${r.questions.length} questions`, observations: [], potential_findings: [], recommendations: [], missing_information: r.missingCritical, assumptions: r.assumptions, uncertainty: "medium", evidence_references: [], requires_human_review: true };
  }
  if (operation === "proposeChecklist") {
    const r = await sparkProposeChecklist(input as never);
    return { summary: `Checklist — ${r.items.length} items`, observations: r.items.map((i: { title: string }) => i.title), potential_findings: [], recommendations: [], missing_information: r.warnings, assumptions: [], uncertainty: "medium", evidence_references: [], requires_human_review: true };
  }
  if (operation === "transcribeAudio") {
    const r = await voiceTranscribe(input as never);
    return { summary: r.transcript, observations: [r.transcript], potential_findings: [], recommendations: [], missing_information: [], assumptions: ["Transcript unconfirmed until reviewed"], uncertainty: "high — speech", evidence_references: [], requires_human_review: true };
  }
  // analyzeImage, draftReport, generateSpeech — routed similarly; fallback for now
  return {
    summary: `Operation ${operation} — pending live verification`,
    observations: [],
    potential_findings: [],
    recommendations: [],
    missing_information: [`${operation} not yet verified against live Meta API`],
    assumptions: ["Labelled fallback"],
    uncertainty: "high — not verified",
    evidence_references: [],
    requires_human_review: true,
  };
}

// Re-exports for server routes that want typed helpers
export { wonderAnalyzeAssessment } from "./wonder";
export { sparkClarifyContext, sparkProposeChecklist } from "./spark";
export { voiceTranscribe } from "./voice";
export { samSegment } from "./sam";
export * from "./schemas";
export * from "./client";
