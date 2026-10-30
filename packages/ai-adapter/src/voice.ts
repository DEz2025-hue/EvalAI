import { z } from "zod";
import { getAdapterConfig } from "./config";
import { metaFetch, modelFor } from "./client";
import { TranscribeAudioInput, TranscribeAudioOutput } from "./schemas";

// Muse Voice Transcribe — audio → editable transcript (unconfirmed until reviewed)
// Verify live: check Meta docs for supported audio mime types, max duration/size, language codes

export async function voiceTranscribe(input: z.infer<typeof TranscribeAudioInput>): Promise<z.infer<typeof TranscribeAudioOutput>> {
  const cfg = getAdapterConfig();
  const validated = TranscribeAudioInput.parse(input);
  const model = modelFor("transcribeAudio", cfg);

  // Respect size limits per AI_AND_VOICE.md — reject oversized before provider call
  const approxBytes = Math.ceil((validated.audioBase64.length * 3) / 4);
  if (approxBytes > 25 * 1024 * 1024) throw new Error("Audio too large (>25MB) — split recording or use shorter note");

  const t0 = Date.now();
  const { logUsageMeta } = await import("./client"); // per-workspace rate limiting happens in the route (verified workspace id)

  try {
    const raw = await metaFetch(cfg, "/v1/audio/transcriptions", {
      model,
      audio: validated.audioBase64,
      mime_type: validated.mimeType,
      language: validated.language,
    });
    logUsageMeta({ operation: "transcribeAudio", workspaceId: "voice", model, latencyMs: Date.now() - t0, status: "ok" });

    const r = raw as Record<string, unknown>;
    const transcript = String(r.transcript ?? r.text ?? r.output ?? "");
    if (!transcript) throw new Error("Empty transcript from provider");

    // Voice transcripts are untrusted input — never auto-convert ambiguous speech to precise values; always isUnconfirmed:true until human edits
    return TranscribeAudioOutput.parse({
      transcript: transcript.trim(),
      confidence: typeof r.confidence === "number" ? r.confidence : undefined,
      isUnconfirmed: true, // must stay true until user confirms
      durationSec: typeof r.duration === "number" ? r.duration : undefined,
    });
  } catch (e) {
    // Preserve original audio reference — don't lose user's recording on transcription failure
    const msg = e instanceof Error ? e.message : String(e);
    // Return error-like object so UI can show text fallback and keep audio
    throw new Error(`Transcription unavailable: ${msg} — use text fallback; original audio preserved where supported`);
  }
}
