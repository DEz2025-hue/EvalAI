import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWriter, storeError } from "../../../../lib/auth";
import { registerEvidenceLocal, verifyAssessmentWorkspace } from "../../../../lib/store";
import { MIN_BYTES, UPLOAD_RULES, hasValidMagic, inspectUploadedObject, isOwnKey, kindForMime, removeObject } from "../../../../lib/directUpload";

const Body = z.object({
  assessmentId: z.string().min(1).max(100),
  itemId: z.string().max(100).nullish(),
  storageKey: z.string().min(1).max(300),
  mimeType: z.string().min(3).max(100),
});

/**
 * Step 2 of a direct upload: the file is already in private Storage. Verify what was ACTUALLY stored (real
 * size, type and magic bytes, never the client's claim), delete it if it fails, then record the evidence row.
 */
export async function POST(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  if (auth.mode !== "authenticated") return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  let storageKey = "";
  try {
    const body = Body.parse(await req.json());
    await verifyAssessmentWorkspace(auth.ctx, body.assessmentId);
    if (!isOwnKey(body.storageKey, body.assessmentId)) return NextResponse.json({ error: "Unknown upload" }, { status: 400 });
    // Only now is the key proven to live under THIS caller's assessment — safe to clean it up on failure.
    storageKey = body.storageKey;
    const kind = kindForMime(body.mimeType);
    if (!kind) {
      await removeObject(storageKey);
      return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
    }
    const info = await inspectUploadedObject(body.storageKey);
    if (!info) return NextResponse.json({ error: "The file was not uploaded — try again" }, { status: 404 });
    const rules = UPLOAD_RULES[kind];
    const problem =
      info.size > rules.maxBytes ? "File too large"
      : info.size < MIN_BYTES ? "File too small or empty"
      : !hasValidMagic(info.head, body.mimeType) ? "File content does not match its declared type"
      : null;
    if (problem) {
      await removeObject(storageKey);
      return NextResponse.json({ error: problem }, { status: 400 });
    }
    const record = await registerEvidenceLocal({ assessmentId: body.assessmentId, itemId: body.itemId, storageKey: body.storageKey, mimeType: body.mimeType, sizeBytes: info.size, ctx: auth.ctx });
    return NextResponse.json({ id: record.id, storageKey: record.storageKey, itemId: record.itemId, sizeBytes: record.sizeBytes, mimeType: record.mimeType, persisted: true });
  } catch (e) {
    if (storageKey) await removeObject(storageKey).catch(() => undefined); // never leave an unregistered object behind
    return storeError(e);
  }
}
