import { getAdapterConfig } from "./config";
import { AiAdapterError, metaRequest } from "./client";
import { reportRun, type CallOptions } from "./chat";
import { estimateVoiceCostUsd } from "./pricing";
import { TranscribeAudioInput, TranscribeAudioOutput } from "./schemas";
import { z } from "zod";

// Muse Voice Transcribe — POST /v1/asr/transcribe (multipart: "request" JSON + "audio" WAV).
// https://dev.meta.ai/docs/api-reference/voice/transcribe

export const MAX_AUDIO_BYTES = 32 * 1024 * 1024;
export const MAX_AUDIO_SECONDS = 600;

export type WavInfo = { channels: number; sampleRate: number; bitsPerSample: number; durationSec: number; dataBytes: number };

/** Parse a RIFF/WAVE header. Throws a clear error for anything Muse Voice Transcribe will reject. */
export function inspectWav(bytes: Uint8Array): WavInfo {
  const bad = (m: string) => new AiAdapterError(m, "unsupported_audio");
  if (bytes.length < 44) throw bad("Audio is too short to be a WAV file");
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") throw bad("Audio must be a WAV file — convert other formats first");
  let offset = 12;
  let fmt: { format: number; channels: number; rate: number; bits: number } | null = null;
  let dataBytes = 0;
  while (offset + 8 <= bytes.length) {
    const id = tag(offset);
    const size = dv.getUint32(offset + 4, true);
    if (id === "fmt ") fmt = { format: dv.getUint16(offset + 8, true), channels: dv.getUint16(offset + 10, true), rate: dv.getUint32(offset + 12, true), bits: dv.getUint16(offset + 22, true) };
    if (id === "data") {
      dataBytes = Math.min(size, bytes.length - offset - 8); // streamed WAVs may declare a larger size than present
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (!fmt) throw bad("WAV header has no format chunk");
  if (fmt.format !== 1) throw bad("WAV must be uncompressed PCM");
  if (fmt.channels !== 1) throw bad("WAV must be mono");
  if (fmt.bits !== 16) throw bad("WAV must be 16-bit");
  if (fmt.rate !== 16000 && fmt.rate !== 24000) throw bad("WAV sample rate must be 16 kHz or 24 kHz");
  const durationSec = dataBytes / (fmt.rate * (fmt.bits / 8) * fmt.channels);
  return { channels: fmt.channels, sampleRate: fmt.rate, bitsPerSample: fmt.bits, durationSec, dataBytes };
}

export function buildTranscribeRequest(model: string, keywords?: string[], languageBias?: string[], mode = "ENDPOINTING") {
  return { model, audioEncoding: "WAV", mode, ...(keywords?.length ? { keywords } : {}), ...(languageBias?.length ? { languageBias } : {}) };
}

export async function transcribeWav(wav: Uint8Array, opts: { keywords?: string[]; languageBias?: string[] } = {}, options?: CallOptions): Promise<z.infer<typeof TranscribeAudioOutput>> {
  const cfg = getAdapterConfig();
  const oc = cfg.ops.transcribeAudio;
  if (wav.length > MAX_AUDIO_BYTES) throw new AiAdapterError("Audio is larger than 32 MB — split the recording", "unsupported_audio");
  const info = inspectWav(wav);
  if (info.durationSec > MAX_AUDIO_SECONDS) throw new AiAdapterError("Audio is longer than 10 minutes — split the recording", "unsupported_audio");

  const form = new FormData();
  form.append("request", new Blob([JSON.stringify(buildTranscribeRequest(oc.model, opts.keywords, opts.languageBias, process.env.AI_VOICE_MODE || "ENDPOINTING"))], { type: "application/json" }));
  form.append("audio", new Blob([wav as BlobPart], { type: "audio/wav" }), "recording.wav");

  const t0 = Date.now();
  try {
    const res = await metaRequest(cfg, "/asr/transcribe", { form, accept: "application/json" }, { timeoutMs: oc.timeoutMs, ...options?.request });
    const r = res.data as { transcript?: string; audioDurationMs?: number; turns?: unknown[] } | null;
    const transcript = (r?.transcript ?? "").trim();
    const audioMs = typeof r?.audioDurationMs === "number" ? r.audioDurationMs : Math.round(info.durationSec * 1000);
    await reportRun(options?.onRun, { operation: "transcribeAudio", model: oc.model, status: "ok", latencyMs: Date.now() - t0, audioDurationMs: audioMs, estimatedCostUsd: estimateVoiceCostUsd(audioMs) });
    if (!transcript) throw new AiAdapterError("No speech was detected in the recording", "invalid_response");
    // Voice transcripts are untrusted input: always unconfirmed until a person reviews them.
    return TranscribeAudioOutput.parse({ transcript, isUnconfirmed: true, durationSec: audioMs / 1000, turnCount: r?.turns?.length });
  } catch (e) {
    if (!(e instanceof AiAdapterError && e.message.startsWith("No speech"))) {
      await reportRun(options?.onRun, { operation: "transcribeAudio", model: oc.model, status: "error", errorCode: e instanceof AiAdapterError ? e.code : "unknown", latencyMs: Date.now() - t0 });
    }
    throw e;
  }
}

/** Base64 convenience wrapper. The audio must already be a supported WAV (see inspectWav). */
export async function voiceTranscribe(input: z.infer<typeof TranscribeAudioInput>, options?: CallOptions) {
  const v = TranscribeAudioInput.parse(input);
  const approx = Math.ceil((v.audioBase64.length * 3) / 4);
  if (approx > MAX_AUDIO_BYTES) throw new AiAdapterError("Audio is larger than 32 MB — split the recording", "unsupported_audio");
  return transcribeWav(new Uint8Array(Buffer.from(v.audioBase64, "base64")), { keywords: v.keywords, languageBias: v.languageBias }, options);
}
