import { NextResponse } from "next/server";
import { z } from "zod";
import { samSegment } from "@eval-ai/ai-adapter";
import { HIGHLIGHT_LIMITS, highlightsFromBoxes, type PhotoHighlight } from "@eval-ai/shared";
import { requireWriter } from "../../../../lib/auth";
import { aiError, aiGuard, aiRunHook, loadAssessmentFacts } from "../../../../lib/aiRoute";
import { listEvidenceLocal, updateAssessmentContextLocal } from "../../../../lib/store";
import { preparePhotos, selectReportPhotos, type PhotoChoices, type SavedPhotoHighlights, type SavedPhotoReview } from "../../../../lib/reportPhotos";

// Several photos and several SAM calls per request.
export const maxDuration = 60;

/** Photos handled per request, so each fits the minute. The screen asks again until none remain. */
const PHOTOS_PER_REQUEST = 6;

const Body = z.object({ assessmentId: z.string().min(1).max(100) });

/**
 * Outline the possible issues on the photos the person added to the report (D-041). SAM 3.1 is given the phrase the photo review wrote for each issue, and
 * only pictures and phrases the server chose. The outlines are saved with the job and a draft copies them. A photo's outlines are remade when it is reviewed again.
 */
export async function POST(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  const limited = await aiGuard(auth, "photo-highlights", 10);
  if (limited) return limited;
  try {
    const { assessmentId } = Body.parse(await req.json());
    const facts = await loadAssessmentFacts(auth.ctx, assessmentId);
    const context = facts.assessment.context;
    const review = (context.photoReview as Record<string, SavedPhotoReview> | undefined) ?? {};
    const choices = (context.photoChoices as PhotoChoices | undefined) ?? {};
    const saved = { ...((context.photoHighlights as Record<string, SavedPhotoHighlights> | undefined) ?? {}) };
    const { items: evidence } = await listEvidenceLocal(assessmentId, auth.ctx);
    const issuesOf = (id: string) => (review[id]?.possibleIssues ?? []).filter((i) => i.find?.trim()).slice(0, HIGHLIGHT_LIMITS.issuesPerPhoto);
    const todo = selectReportPhotos(evidence).chosen.filter((id) => review[id] && choices[id] === true && saved[id]?.reviewAt !== review[id].at);
    // A photo with no phrase to look for needs no picture and no call.
    for (const id of todo.filter((x) => issuesOf(x).length === 0)) saved[id] = { reviewAt: review[id].at, items: [] };
    const needed = todo.filter((id) => issuesOf(id).length > 0);
    const slice = needed.slice(0, PHOTOS_PER_REQUEST);

    const { photos: prepared, failed: unreadable } = await preparePhotos(assessmentId, evidence.filter((e) => slice.includes(e.id)), { thumbnail: false });
    const onRun = aiRunHook(auth, assessmentId);
    const failed = new Set<string>(unreadable);
    let firstError: unknown = null;
    let done = 0;
    let outlined = 0;
    const queue = [...prepared];
    const worker = async () => {
      for (let p = queue.shift(); p; p = queue.shift()) {
        const id = p.evidenceId;
        const items: PhotoHighlight[] = [];
        try {
          for (const issue of issuesOf(id)) {
            const r = await samSegment({ imageBase64: p.aiBase64, mimeType: "image/jpeg", prompt: issue.find!.trim().slice(0, 60) }, { onRun });
            items.push(...highlightsFromBoxes(issue.text, r.boxes));
          }
          saved[id] = { reviewAt: review[id].at, items };
          outlined += items.length;
          done += 1;
        } catch (e) {
          firstError ??= e;
          failed.add(id);
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);

    if (todo.length > 0 && (done > 0 || todo.length > needed.length)) await updateAssessmentContextLocal(assessmentId, { context: { photoHighlights: saved } }, auth.ctx);
    // Nothing worked and there is a reason (credit, key, rate limit): tell the person instead of an empty success.
    if (slice.length > 0 && done === 0 && firstError) throw firstError;
    return NextResponse.json({ done, outlined, failed: [...failed], remaining: Math.max(0, needed.length - slice.length), requiresHumanReview: true });
  } catch (e) {
    return aiError(e);
  }
}
