import { NextResponse } from "next/server";
import { z } from "zod";
import { transcribeWav, AiAdapterError } from "@eval-ai/ai-adapter";
import { keywordsFor } from "@eval-ai/shared";
import { requireWriter } from "../../../../lib/auth";
import { aiError, aiGuard, aiRunHook, aiWorkspaceKey } from "../../../../lib/aiRoute";
import { getAssessmentLocal, verifyAssessmentWorkspace } from "../../../../lib/store";
import { toTranscribableWavChunks } from "../../../../lib/audio";
import { isOwnKey } from "../../../../lib/directUpload";
import { createServiceRoleClient } from "../../../../lib/supabase/service";

export const maxDuration = 60;

// Two ways in:
//  - { assessmentId, storageKey }  PREFERRED: the recording is already in private Storage (direct upload), so there is no request-size limit.
//  - { audioBase64, assessmentId? }  small clips only (serverless body limit) — used when direct upload is unavailable.
const Body = z.object({
  assessmentId: z.string().max(100).optional(),
  storageKey: z.string().max(300).optional(),
  audioBase64: z.string().max(5_500_000).optional(),
});

/**
 * Speech -> editable transcript. The recording is converted to mono 16 kHz WAV on the server (Meta only accepts WAV),
 * long recordings are split under the 10 minute limit, and the result is always UNCONFIRMED until a person edits and confirms it.
 */
export async function POST(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  const limited = await aiGuard(auth, "transcribe", 20);
  if (limited) return limited;
  try {
    const body = Body.parse(await req.json());
    if (!body.storageKey && !body.audioBase64) return NextResponse.json({ error: "No recording provided" }, { status: 400 });

    let bytes: Uint8Array;
    if (body.storageKey) {
      if (!body.assessmentId) return NextResponse.json({ error: "assessmentId is required with storageKey" }, { status: 400 });
      await verifyAssessmentWorkspace(auth.ctx, body.assessmentId);
      if (!isOwnKey(body.storageKey, body.assessmentId) || !body.storageKey.startsWith("voice/")) return NextResponse.json({ error: "Unknown recording" }, { status: 400 });
      const admin = createServiceRoleClient();
      if (!admin) return NextResponse.json({ error: "Recording storage is not configured on the server" }, { status: 503 });
      const { data, error } = await admin.storage.from("evidence").download(body.storageKey);
      if (error || !data) return NextResponse.json({ error: "The recording could not be found" }, { status: 404 });
      bytes = new Uint8Array(await data.arrayBuffer());
    } else {
      if (body.assessmentId) await verifyAssessmentWorkspace(auth.ctx, body.assessmentId);
      bytes = new Uint8Array(Buffer.from(body.audioBase64 as string, "base64"));
    }

    const assessment = body.assessmentId ? await getAssessmentLocal(body.assessmentId, auth.ctx) : null;
    const keywords = keywordsFor(assessment?.pack);
    const chunks = await toTranscribableWavChunks(bytes);
    const onRun = aiRunHook(auth, body.assessmentId);

    const parts: string[] = [];
    let seconds = 0;
    for (const chunk of chunks) {
      const r = await transcribeWav(chunk, { keywords }, { onRun });
      parts.push(r.transcript);
      seconds += r.durationSec ?? 0;
    }
    void aiWorkspaceKey; // workspace key is used by aiGuard
    return NextResponse.json({
      transcript: parts.join(" ").trim(),
      isUnconfirmed: true,
      durationSec: seconds,
      chunks: chunks.length,
      spokenAvailable: false,
      note: "Transcript unconfirmed — edit and confirm before saving; numbers and units need your verification",
    });
  } catch (e) {
    const res = aiError(e);
    const payload = (await res.json().catch(() => ({ error: "Transcription unavailable" }))) as { error: string };
    // Keep the typing fallback so the recorder can fall back to manual entry and the audio stays saved.
    const unsupported = e instanceof AiAdapterError && e.code === "unsupported_audio";
    return NextResponse.json({ ...payload, fallback: unsupported ? "This recording could not be read — record again or type the note" : "Use text input — the original audio is preserved", isUnconfirmed: true }, { status: res.status });
  }
}
