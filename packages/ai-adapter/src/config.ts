// Per-operation model registry for the Meta Model API (https://dev.meta.ai/docs/models).
// Every operation names its model, reasoning effort and token budget in one place.

export type Operation =
  | "clarifyContext"
  | "proposeChecklist"
  | "analyzeAssessment"
  | "analyzeImage"
  | "draftReport"
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

export type AdapterConfig = {
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

export function buildAdapterConfig(env: Env): AdapterConfig {
  const baseUrl = env.AI_PROVIDER_BASE_URL;
  const apiKey = env.AI_PROVIDER_API_KEY;
  if (!baseUrl || !apiKey) throw new Error("Missing AI_PROVIDER_BASE_URL / AI_PROVIDER_API_KEY — see .env.example (server-only)");

  const spark = assertStandardModel(env.META_SPARK_MODEL || DEFAULT_MODELS.spark);
  const voice = assertStandardModel(env.META_VOICE_MODEL || DEFAULT_MODELS.voice);
  const sam = assertStandardModel(env.META_SAM_MODEL || DEFAULT_MODELS.sam);
  // Optional per-operation override, e.g. AI_MODEL_ANALYZE=muse-wonder-1.0 to trial Wonder for analysis only.
  const pick = (override: string | undefined, fallback: string) => (override ? assertStandardModel(override) : fallback);
  const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : d);

  return {
    baseUrl: baseUrl.replace(/\/+$/, "").replace(/\/v1$/, ""),
    apiKey,
    ops: {
      clarifyContext: { model: pick(env.AI_MODEL_CLARIFY, spark), reasoningEffort: effort(env.AI_EFFORT_CLARIFY, "low"), maxCompletionTokens: num(env.AI_MAX_TOKENS_CLARIFY, 4000), timeoutMs: 45_000 },
      proposeChecklist: { model: pick(env.AI_MODEL_CHECKLIST, spark), reasoningEffort: effort(env.AI_EFFORT_CHECKLIST, "medium"), maxCompletionTokens: num(env.AI_MAX_TOKENS_CHECKLIST, 8000), timeoutMs: 55_000 },
      analyzeAssessment: { model: pick(env.AI_MODEL_ANALYZE, spark), reasoningEffort: effort(env.AI_EFFORT_ANALYZE, "high"), maxCompletionTokens: num(env.AI_MAX_TOKENS_ANALYZE, 16000), timeoutMs: 55_000 },
      analyzeImage: { model: pick(env.AI_MODEL_IMAGE, spark), reasoningEffort: effort(env.AI_EFFORT_IMAGE, "low"), maxCompletionTokens: num(env.AI_MAX_TOKENS_IMAGE, 4000), timeoutMs: 45_000 },
      draftReport: { model: pick(env.AI_MODEL_REPORT, spark), reasoningEffort: effort(env.AI_EFFORT_REPORT, "medium"), maxCompletionTokens: num(env.AI_MAX_TOKENS_REPORT, 8000), timeoutMs: 55_000 },
      transcribeAudio: { model: voice, timeoutMs: 60_000 },
      segment: { model: sam, timeoutMs: 45_000 },
    },
  };
}

export function getAdapterConfig(): AdapterConfig {
  return buildAdapterConfig(process.env as Env);
}
