export type AdapterConfig = {
  baseUrl: string;
  apiKey: string;
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
    wonderModel: process.env.META_WONDER_MODEL || "muse-wonder-1.0",
    sparkModel: process.env.META_SPARK_MODEL || "muse-spark-1.3",
    voiceModel: process.env.META_VOICE_MODEL || "muse-voice-transcribe-1.0",
    timeoutMs: 30000,
  };
}
