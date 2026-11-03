// Standard-mode list prices (https://dev.meta.ai/docs/pricing-rate-limits). Used only for cost *estimates* in usage logs.

export type Usage = {
  promptTokens: number;
  completionTokens: number;
  /** Included in completionTokens; billed at the output rate. */
  reasoningTokens: number;
  totalTokens: number;
};

const TOKEN_PRICES_PER_MILLION: Record<string, { input: number; output: number }> = {
  "muse-spark-1.3": { input: 1.25, output: 4.25 },
  "muse-spark-1.2": { input: 1.25, output: 4.25 },
  "muse-spark-1.1": { input: 1.25, output: 4.25 },
  "muse-wonder-1.0": { input: 4.0, output: 20.0 },
};

/** Estimated USD for a token-priced call, or null when the model is not token-priced / unknown. */
export function estimateTokenCostUsd(model: string, usage: Usage): number | null {
  const p = TOKEN_PRICES_PER_MILLION[model];
  if (!p) return null;
  return (usage.promptTokens * p.input + usage.completionTokens * p.output) / 1_000_000;
}

/** Voice Transcribe: $0.18 per hour, metered in whole seconds (rounded down). */
export function estimateVoiceCostUsd(audioDurationMs: number): number {
  return (Math.floor(audioDurationMs / 1000) / 3600) * 0.18;
}

/** SAM 3.1: $2.50 per 1,000 images. */
export function estimateSamImageCostUsd(): number {
  return 2.5 / 1000;
}
