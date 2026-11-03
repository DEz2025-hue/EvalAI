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
export { clarifyContext, proposeChecklist, analyzeAssessment, SYSTEM_GUARD, compact } from "./text";
export { draftReportNarrative, draftReportSummary, REPORT_SECTION_MAX, REPORT_ANALYST_PROMPT, REPORT_SUMMARY_PROMPT } from "./reportDraft";
export { draftDesignPlan, draftDesignWrite, DESIGN_PLAN_PROMPT, DESIGN_WRITE_PROMPT } from "./designDraft";
export { draftSolarPlan, draftSolarWrite, SOLAR_PLAN_PROMPT, SOLAR_WRITE_PROMPT } from "./solarDraft";
export { reviewAndPlan, cleanHolds, planReviewSchema, PLAN_REVIEW_PROMPT } from "./planReview";
export { proposeMaterials, cleanMaterials, MATERIALS_ANALYST_PROMPT, MATERIALS_LIMITS } from "./materialsDraft";
export type { MaterialsProposal, ProposedMaterial, RuleInputRef } from "./materialsDraft";
export { findOverlap, dropOverlaps, meaningWords } from "./checklistOverlap";
export { nextInterviewQuestion, digestInterview, InterviewTurnInput, InterviewDigestInput, INTERVIEW_QUESTION_PROMPT, INTERVIEW_DIGEST_PROMPT, INTERVIEW_AI_LIMITS } from "./interview";
export type { InterviewQuestion, InterviewDigest } from "./interview";
export { findUnverifiedFigures } from "./figures";
export { DRAFT_FINDING_LIMITS, cleanKeyFindings, withoutRepeats, sameSentence, type DraftKeyFinding } from "./keyFindings";
export { analyzeImage, IMAGE_ANALYST_PROMPT } from "./image";
export { lensesFor, lensText, LENSES, type LensTopic } from "./photoLens";
export { liveFrame, LiveFrameInput } from "./live";
export { siteIntake, SiteIntakeInput, INTAKE_MAX_IMAGES } from "./siteIntake";
export { photoReview, samPhrase, PhotoReviewInput, PHOTO_REVIEW_BATCH, PHOTO_REVIEW_VERSION } from "./photoReview";
export type { PhotoReviewItem, PhotoReviewOutput } from "./photoReview";
export type { SiteIntakeOutput } from "./siteIntake";
export type { LiveFrameOutput } from "./live";
export { voiceTranscribe, transcribeWav, inspectWav, buildTranscribeRequest, MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS } from "./voice";
export { samSegment, SamSegmentInput, parseSamBoxes, extractSamText } from "./sam";
export type { SamBox } from "./sam";

// Backwards-compatible names used by the web routes.
export { clarifyContext as sparkClarifyContext, proposeChecklist as sparkProposeChecklist, analyzeAssessment as wonderAnalyzeAssessment } from "./text";

export { probeProvider } from "./probe";
export type { ProbeCheck } from "./probe";
