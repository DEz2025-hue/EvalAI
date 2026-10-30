import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWriter, storeError } from "../../../../lib/auth";
import { verifyAssessmentWorkspace } from "../../../../lib/store";
import { createServiceRoleClient } from "../../../../lib/supabase/service";
import { MIN_BYTES, UPLOAD_RULES, kindForMime, newStorageKey } from "../../../../lib/directUpload";

const Body = z.object({
  assessmentId: z.string().min(1).max(100),
  fileName: z.string().min(1).max(200),
  mimeType: z.string().min(3).max(100),
  sizeBytes: z.number().int().min(1),
});

/**
 * Step 1 of a direct upload: authorize, then hand back a one-time signed URL so the browser/app sends the
 * file straight to private Storage (no serverless body-size limit). The server decides the storage key.
 */
export async function POST(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  // Demo mode or no storage: tell the client to use the small-file multipart route instead.
  if (auth.mode !== "authenticated" || !createServiceRoleClient()) return NextResponse.json({ fallback: true, error: "Direct upload is not available here" }, { status: 501 });
  try {
    const body = Body.parse(await req.json());
    await verifyAssessmentWorkspace(auth.ctx, body.assessmentId);
    const kind = kindForMime(body.mimeType);
    if (!kind) return NextResponse.json({ error: "File type " + body.mimeType + " is not allowed" }, { status: 400 });
    const rules = UPLOAD_RULES[kind];
    if (body.sizeBytes > rules.maxBytes) return NextResponse.json({ error: "File too large (limit " + Math.round(rules.maxBytes / 1048576) + "MB)" }, { status: 413 });
    if (body.sizeBytes < MIN_BYTES) return NextResponse.json({ error: "File too small or empty" }, { status: 400 });

    const storageKey = newStorageKey(kind, body.assessmentId, body.fileName);
    const admin = createServiceRoleClient()!;
    const { data, error } = await admin.storage.from("evidence").createSignedUploadUrl(storageKey);
    if (error || !data) throw new Error("Could not prepare the upload");
    return NextResponse.json({ storageKey, token: data.token, path: data.path ?? storageKey, signedUrl: data.signedUrl, kind });
  } catch (e) {
    return storeError(e);
  }
}
