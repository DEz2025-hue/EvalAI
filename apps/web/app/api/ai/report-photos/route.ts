import { NextResponse } from "next/server";
import { z } from "zod";
import { photoReview, PHOTO_REVIEW_BATCH } from "@eval-ai/ai-adapter";
import { requireAuth, requireWriter } from "../../../../lib/auth";
import { aiError, aiGuard, aiRunHook, loadAssessmentFacts } from "../../../../lib/aiRoute";
import { listEvidenceLocal, updateAssessmentContextLocal } from "../../../../lib/store";
import { preparePhotos, selectReportPhotos, type PhotoChoices, type SavedPhotoReview } from "../../../../lib/reportPhotos";

// Several photos per request: batches run in parallel, so allow the full serverless time.
export const maxDuration = 60;

const Body = z.object({ assessmentId: z.string().min(1).max(100), force: z.boolean().default(false) });

/**
 * The photos the AI has looked at, for the "choose photos for the report" step (D-024): caption, what it saw, possible issues,
 * a small picture, and the person's answer so far (null = not answered). Nothing here is sent to the AI.
 */
export async function GET(req: Request) {
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  try {
    const assessmentId = new URL(req.url).searchParams.get("assessmentId") ?? "";
    if (!assessmentId) return NextResponse.json({ error: "assessmentId required" }, { status: 400 });
    const facts = await loadAssessmentFacts(auth.ctx, assessmentId);
    const { items: evidence } = await listEvidenceLocal(assessmentId, auth.ctx);
    const review = (facts.assessment.context.photoReview as Record<string, SavedPhotoReview> | undefined) ?? {};
    const choices = (facts.assessment.context.photoChoices as PhotoChoices | undefined) ?? {};
    const ids = selectReportPhotos(evidence).chosen.filter((id) => review[id]);
    const { photos: pics } = await preparePhotos(assessmentId, evidence.filter((e) => ids.includes(e.id)), { aiCopy: false, thumbnailSide: 320 });
    const thumbs = new Map(pics.map((p) => [p.evidenceId, p.thumbnail]));
    const titleById = new Map(facts.items.map((i) => [i.id, i.title]));
    return NextResponse.json({
      photos: ids.map((id) => {
        const r = review[id];
        const itemId = r.itemId ?? evidence.find((e) => e.id === id)?.itemId ?? null;
        return { evidenceId: id, caption: r.caption, observations: r.observations, possibleIssues: r.possibleIssues, cannotTell: r.cannotTell, itemTitle: itemId ? titleById.get(itemId) ?? null : null, thumbnail: thumbs.get(id) || null, choice: typeof choices[id] === "boolean" ? choices[id] : null };
      }),
    });
  } catch (e) {
    return aiError(e);
  }
}

/**
 * Look at the job's photos for the report (D-022). Results are UNVERIFIED suggestions: captions, what is visible, and
 * possible issues for a person to check. Photos already reviewed are not sent again unless `force` is set. The server
 * decides which photos, which checklist answers and which situation go to the AI; the phone only names the job.
 */
export async function POST(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  const limited = await aiGuard(auth, "report-photos", 4);
  if (limited) return limited;
  try {
    const { assessmentId, force } = Body.parse(await req.json());
    const facts = await loadAssessmentFacts(auth.ctx, assessmentId);
    const { items: evidence } = await listEvidenceLocal(assessmentId, auth.ctx);
    const { chosen, skipped } = selectReportPhotos(evidence);
    const saved = { ...((facts.assessment.context.photoReview as Record<string, SavedPhotoReview> | undefined) ?? {}) };
    const todoIds = chosen.filter((id) => force || !saved[id]);
    const cached = chosen.length - todoIds.length;
    if (todoIds.length === 0) return NextResponse.json({ analyzed: 0, cached, skipped, failed: [], total: chosen.length });

    const { photos: prepared, failed: unreadable } = await preparePhotos(assessmentId, evidence.filter((e) => todoIds.includes(e.id)), { thumbnail: false });
    const byItem = new Map(facts.responses.map((r) => [r.itemId, r]));
    const checklist = facts.items.map((it) => ({ id: it.id, title: it.title, status: byItem.get(it.id)?.status ?? "not_checked", notes: byItem.get(it.id)?.notes }));
    const goal = typeof facts.assessment.context.goal === "string" ? facts.assessment.context.goal : undefined;
    const onRun = aiRunHook(auth, assessmentId);

    const batches: Array<typeof prepared> = [];
    for (let i = 0; i < prepared.length; i += PHOTO_REVIEW_BATCH) batches.push(prepared.slice(i, i + PHOTO_REVIEW_BATCH));
    const failed = new Set<string>(unreadable);
    let firstError: unknown = null;
    let analyzed = 0;
    const now = new Date().toISOString();
    const queue = [...batches];
    const worker = async () => {
      for (let batch = queue.shift(); batch; batch = queue.shift()) {
        try {
          const out = await photoReview(
            { mode: facts.assessment.mode, pack: facts.assessment.pack, scenario: facts.scenario, goal, checklist, photos: batch.map((p) => ({ evidenceId: p.evidenceId, itemId: p.itemId, imageBase64: p.aiBase64, mimeType: "image/jpeg" })) },
            { onRun },
          );
          for (const p of out.photos) {
            saved[p.evidenceId] = { ...p, itemId: batch.find((b) => b.evidenceId === p.evidenceId)?.itemId ?? null, at: now };
            analyzed += 1;
          }
          out.notAnalyzed.forEach((id) => failed.add(id));
        } catch (e) {
          firstError ??= e;
          batch.forEach((p) => failed.add(p.evidenceId));
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);

    if (analyzed > 0) await updateAssessmentContextLocal(assessmentId, { context: { photoReview: saved } }, auth.ctx);
    // Nothing worked and there is a reason (credit, key, rate limit): tell the person instead of an empty success.
    if (analyzed === 0 && firstError) throw firstError;
    return NextResponse.json({ analyzed, cached, skipped, failed: [...failed], total: chosen.length });
  } catch (e) {
    return aiError(e);
  }
}
