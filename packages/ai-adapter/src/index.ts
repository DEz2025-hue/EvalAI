// Server-only adapter for the Meta Model API — never import in client components.
// Secrets (AI_PROVIDER_API_KEY) stay on the server. Every operation validates input and output at the trust boundary,
// and every result is a DRAFT for a person to review.

export * from "./schemas";
export * from "./config";
export * from "./pricing";
export { AiAdapterError, checkRateLimit, metaRequest, normalizeUsage, redact } from "./client";
export type { AiErrorCode, RequestOptions } from "./client";
export { chatJson, reportRun } from "./chat";
export type { AiRunRecord, RunHook, CallOptions, ContentPart, JsonSchema } from "./chat";
export { clarifyContext, proposeChecklist, analyzeAssessment, draftReportNarrative, SYSTEM_GUARD, compact } from "./text";
export { analyzeImage } from "./image";
export { voiceTranscribe, transcribeWav, inspectWav, buildTranscribeRequest, MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS } from "./voice";
export { samSegment, SamSegmentInput } from "./sam";

// Backwards-compatible names used by the web routes.
export { clarifyContext as sparkClarifyContext, proposeChecklist as sparkProposeChecklist, analyzeAssessment as wonderAnalyzeAssessment } from "./text";
