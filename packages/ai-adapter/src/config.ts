// Per-operation model registry for the Meta Model API (https://dev.meta.ai/docs/models).
// Every operation names its model, reasoning effort and token budget in one place.

export type Operation =
  | "clarifyContext"
  | "proposeChecklist"
  | "analyzeAssessment"
  | "analyzeImage"
  | "liveFrame"
  | "siteIntake"
  | "photoReview"
  | "draftReport"
  | "proposeMaterials"
  | "interview"
  | "transcribeAudio"
  | "segment";

export type ReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export type OperationConfig = {
  model: string;
  /** Not used by Voice Transcribe / SAM. Muse Spark always reasons ("none" is rejected by the API). */
  reasoningEffort?: ReasoningEffort;
  /** Reasoning tokens count against this limit, so keep it generous. */
  maxCompletionTokens?: number;
  timeoutMs: number;
};

/** Meta's own Model API is the only provider. The field stays so health and probe results say which one answered. */
export type AiProvider = "meta";

export type AdapterConfig = {
  provider: AiProvider;
  baseUrl: string;
  apiKey: string;
  ops: Record<Operation, OperationConfig>;
};

export const DEFAULT_MODELS = {
  spark: "muse-spark-1.3",
  wonder: "muse-wonder-1.0",
  voice: "muse-voice-transcribe-1.0",
  sam: "sam-3.1",
} as const;

/**
 * Older configs used unversioned ids ("muse-spark"); the API answers those with 404 model_not_found.
 * They are mapped to the real ids so an existing environment keeps working.
 */
const LEGACY_ALIASES: Record<string, string> = {
  "muse-spark": DEFAULT_MODELS.spark,
  "muse-wonder": DEFAULT_MODELS.wonder,
  "muse-voice-transcribe": DEFAULT_MODELS.voice,
  "muse-voice": DEFAULT_MODELS.voice,
  sam: DEFAULT_MODELS.sam,
  "sam-3": DEFAULT_MODELS.sam,
};

const warned = new Set<string>();

/**
 * Customer data (site photos, addresses, names) must never go to a Contributor-mode model: those variants let
 * Meta train on the content and forbid personal/confidential data. Standard models only.
 */
export function assertStandardModel(id: string): string {
  const trimmed = id.trim();
  if (!trimmed) throw new Error("Empty AI model id");
  if (/-contributor$/i.test(trimmed)) {
    throw new Error(`Model "${trimmed}" is a Contributor-mode model (content may be used for training) and is not allowed for customer data. Use the Standard model id.`);
  }
  const mapped = LEGACY_ALIASES[trimmed];
  if (mapped) {
    if (!warned.has(trimmed)) {
      warned.add(trimmed);
      console.warn(`AI model id "${trimmed}" is not a valid Meta model id; using "${mapped}". Update your environment.`);
    }
    return mapped;
  }
  return trimmed;
}

const EFFORTS: ReasoningEffort[] = ["minimal", "low", "medium", "high", "xhigh", "max"];

function effort(value: string | undefined, fallback: ReasoningEffort): ReasoningEffort {
  const v = (value ?? "").trim().toLowerCase() as ReasoningEffort;
  return EFFORTS.includes(v) ? v : fallback;
}

type Env = Record<string, string | undefined>;

const clean = (v: string | undefined) => (v ?? "").trim();

/**
 * The key and address for Meta's Model API: `META_API_KEY` and optional `META_BASE_URL` (default https://api.meta.ai).
 * The older pair (`AI_PROVIDER_API_KEY` / `AI_PROVIDER_BASE_URL`) still works as a fallback.
 */
function resolveProvider(env: Env): { apiKey: string; rawBase: string } {
  const apiKey = clean(env.META_API_KEY) || clean(env.AI_PROVIDER_API_KEY);
  const rawBase = clean(env.META_BASE_URL) || clean(env.AI_PROVIDER_BASE_URL) || (apiKey ? "https://api.meta.ai" : "");
  return { apiKey, rawBase };
}

/** Is the AI provider set up on this server (a key, and a valid configuration)? */
export function isAiConfigured(env: Env = process.env as Env): boolean {
  try {
    buildAdapterConfig(env);
    return true;
  } catch {
    return false;
  }
}

export function buildAdapterConfig(env: Env): AdapterConfig {
  const { apiKey, rawBase } = resolveProvider(env);
  if (!rawBase || !apiKey) throw new Error("Missing META_API_KEY (or the older AI_PROVIDER_API_KEY) — see .env.example (server-only)");
  if (!/^https?:\/\//i.test(rawBase)) throw new Error("The AI provider address must be a web address starting with https:// (is the API key in the wrong line of the env file?)");
  const baseUrl = rawBase.trim().replace(/\/+$/, "").replace(/\/v1$/, "");

  const named = (id: string) => assertStandardModel(id);
  const spark = named(env.META_SPARK_MODEL || DEFAULT_MODELS.spark);
  const voice = assertStandardModel(env.META_VOICE_MODEL || DEFAULT_MODELS.voice);
  const sam = assertStandardModel(env.META_SAM_MODEL || DEFAULT_MODELS.sam);
  // Optional per-operation override, e.g. AI_MODEL_ANALYZE=muse-wonder-1.0 to trial Wonder for analysis only.
  const pick = (override: string | undefined, fallback: string) => (override ? named(override) : fallback);
  const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : d);

  return {
    provider: "meta",
    baseUrl,
    apiKey,
    ops: {
      clarifyContext: { model: pick(env.AI_MODEL_CLARIFY, spark), reasoningEffort: effort(env.AI_EFFORT_CLARIFY, "low"), maxCompletionTokens: num(env.AI_MAX_TOKENS_CLARIFY, 4000), timeoutMs: 45_000 },
      proposeChecklist: { model: pick(env.AI_MODEL_CHECKLIST, spark), reasoningEffort: effort(env.AI_EFFORT_CHECKLIST, "medium"), maxCompletionTokens: num(env.AI_MAX_TOKENS_CHECKLIST, 8000), timeoutMs: 55_000 },
      analyzeAssessment: { model: pick(env.AI_MODEL_ANALYZE, spark), reasoningEffort: effort(env.AI_EFFORT_ANALYZE, "high"), maxCompletionTokens: num(env.AI_MAX_TOKENS_ANALYZE, 16000), timeoutMs: 55_000 },
      analyzeImage: { model: pick(env.AI_MODEL_IMAGE, spark), reasoningEffort: effort(env.AI_EFFORT_IMAGE, "low"), maxCompletionTokens: num(env.AI_MAX_TOKENS_IMAGE, 4000), timeoutMs: 45_000 },
      // Live session frames: one small still every few seconds, so keep it fast and cheap.
      liveFrame: { model: pick(env.AI_MODEL_LIVE, spark), reasoningEffort: effort(env.AI_EFFORT_LIVE, "low"), maxCompletionTokens: num(env.AI_MAX_TOKENS_LIVE, 2000), timeoutMs: 30_000 },
      // Site intake: one call at the start of a job from a description and a few photos.
      // Low reasoning: with up to 20 photos, medium reasoning can spend the whole token budget thinking and leave no answer.
      siteIntake: { model: pick(env.AI_MODEL_INTAKE, spark), reasoningEffort: effort(env.AI_EFFORT_INTAKE, "low"), maxCompletionTokens: num(env.AI_MAX_TOKENS_INTAKE, 8000), timeoutMs: 60_000 },
      // Photo review for the report: a few photos per call.
      photoReview: { model: pick(env.AI_MODEL_PHOTOS, spark), reasoningEffort: effort(env.AI_EFFORT_PHOTOS, "low"), maxCompletionTokens: num(env.AI_MAX_TOKENS_PHOTOS, 7000), timeoutMs: 55_000 },
      draftReport: { model: pick(env.AI_MODEL_REPORT, spark), reasoningEffort: effort(env.AI_EFFORT_REPORT, "low"), maxCompletionTokens: num(env.AI_MAX_TOKENS_REPORT, 12000), timeoutMs: 58_000 },
      // Materials: one call that reads the whole record. Low reasoning keeps the answer inside the token budget; quantities are computed by code afterwards.
      proposeMaterials: { model: pick(env.AI_MODEL_MATERIALS, spark), reasoningEffort: effort(env.AI_EFFORT_MATERIALS, "low"), maxCompletionTokens: num(env.AI_MAX_TOKENS_MATERIALS, 10000), timeoutMs: 58_000 },
      // Site interview: one short question per call (fast), or one digest of the whole conversation at the end.
      interview: { model: pick(env.AI_MODEL_INTERVIEW, spark), reasoningEffort: effort(env.AI_EFFORT_INTERVIEW, "low"), maxCompletionTokens: num(env.AI_MAX_TOKENS_INTERVIEW, 5000), timeoutMs: 55_000 },
      transcribeAudio: { model: voice, timeoutMs: 60_000 },
      segment: { model: sam, timeoutMs: 45_000 },
    },
  };
}

export function getAdapterConfig(): AdapterConfig {
  return buildAdapterConfig(process.env as Env);
}
