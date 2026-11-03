import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ffmpegBinary } from "./audio";
import { isOwnKey } from "./directUpload";
import { createServiceRoleClient } from "./supabase/service";
import type { EvidenceRecord } from "./store";
import type { ReportPhoto } from "@eval-ai/shared";

// Photos for the report (decision D-022): the job's pictures are shrunk twice, a larger copy for the AI to look at and a
// small copy that is kept inside the report. The originals are never changed.

/** Most photos one report carries (cost, time and report size). */
export const REPORT_PHOTO_LIMIT = 12;
// Large enough that a nameplate or breaker label photographed close up can still be read (D-035).
export const AI_PHOTO_SIDE = 1600;
export const REPORT_PHOTO_SIDE = 640;
const SHRINK_TIMEOUT_MS = 20_000;
const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type PreparedPhoto = {
  evidenceId: string;
  itemId: string | null;
  capturedAt: string;
  /** Larger copy for the AI (base64 JPEG, no prefix). */
  aiBase64: string;
  /** Small copy kept in the report (data URI). */
  thumbnail: string;
};

/** Image evidence only, oldest first, at most `limit`. `skipped` counts the images that did not fit. */
export function selectReportPhotos(items: Array<Pick<EvidenceRecord, "id" | "mimeType" | "uploadedAt">>, limit = REPORT_PHOTO_LIMIT): { chosen: string[]; skipped: number } {
  const images = items.filter((e) => IMAGE_MIMES.has(e.mimeType)).sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
  return { chosen: images.slice(0, limit).map((e) => e.id), skipped: Math.max(0, images.length - limit) };
}

/** ffmpeg arguments that fit a picture inside maxSide x maxSide (never enlarging it) and save it as a JPEG. */
export function shrinkArgs(inFile: string, outFile: string, maxSide: number, quality: number): string[] {
  return ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", inFile, "-vf", `scale='min(${maxSide},iw)':'min(${maxSide},ih)':force_original_aspect_ratio=decrease`, "-frames:v", "1", "-q:v", String(quality), outFile];
}

function run(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "ignore"], windowsHide: true });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("The photo took too long to prepare"));
    }, SHRINK_TIMEOUT_MS);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error("Photo preparation is not available: " + e.message));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error("This photo could not be read"));
    });
  });
}

/** Shrink one picture to a JPEG that fits maxSide. Throws if it cannot be read. */
export async function shrinkImage(input: Uint8Array, maxSide: number, quality: number): Promise<Uint8Array> {
  if (input.length < 100) throw new Error("This photo is empty");
  const id = randomUUID();
  const inFile = path.join(os.tmpdir(), `evalai-photo-${id}.in`);
  const outFile = path.join(os.tmpdir(), `evalai-photo-${id}.jpg`);
  try {
    fs.writeFileSync(inFile, input);
    await run(ffmpegBinary(), shrinkArgs(inFile, outFile, maxSide, quality));
    return new Uint8Array(fs.readFileSync(outFile));
  } finally {
    for (const f of [inFile, outFile]) {
      try {
        fs.rmSync(f, { force: true });
      } catch {
        /* temp file already gone */
      }
    }
  }
}

const toBase64 = (b: Uint8Array) => Buffer.from(b).toString("base64");

/** Download the chosen evidence images from private storage and make both copies. Photos that can't be read are left out. */
export async function preparePhotos(assessmentId: string, items: EvidenceRecord[], opts: { aiCopy?: boolean; thumbnail?: boolean; thumbnailSide?: number } = {}): Promise<{ photos: PreparedPhoto[]; failed: string[] }> {
  const admin = createServiceRoleClient();
  if (!admin) return { photos: [], failed: items.map((e) => e.id) };
  const wantAi = opts.aiCopy !== false;
  const wantThumb = opts.thumbnail !== false;
  const photos: PreparedPhoto[] = [];
  const failed: string[] = [];
  const queue = [...items];
  const worker = async () => {
    for (let e = queue.shift(); e; e = queue.shift()) {
      try {
        if (!isOwnKey(e.storageKey, assessmentId) || !e.storageKey.startsWith("evidence/")) throw new Error("Unknown file");
        const { data, error } = await admin.storage.from("evidence").download(e.storageKey);
        if (error || !data) throw new Error("File not found");
        const bytes = new Uint8Array(await data.arrayBuffer());
        const [ai, thumb] = await Promise.all([wantAi ? shrinkImage(bytes, AI_PHOTO_SIDE, 5) : Promise.resolve(new Uint8Array()), wantThumb ? shrinkImage(bytes, opts.thumbnailSide ?? REPORT_PHOTO_SIDE, 8) : Promise.resolve(new Uint8Array())]);
        photos.push({ evidenceId: e.id, itemId: e.itemId, capturedAt: e.uploadedAt, aiBase64: wantAi ? toBase64(ai) : "", thumbnail: wantThumb ? "data:image/jpeg;base64," + toBase64(thumb) : "" });
      } catch {
        failed.push(e.id);
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  photos.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  return { photos, failed };
}

/** What is remembered per photo under assessments.context.photoReview (written by /api/ai/report-photos). */
export type SavedPhotoReview = {
  evidenceId: string;
  caption: string;
  observations: string[];
  possibleIssues: Array<{ text: string; confidence: "low" | "medium" | "high" }>;
  cannotTell: string[];
  itemId: string | null;
  at: string;
  /** The PHOTO_REVIEW_VERSION that made this review. Missing on reviews made before versions existed (treated as 1). */
  v?: number;
};

/** The person's answer per photo: true = add to the report, false = leave out. A photo with no answer is NOT in the report. */
export type PhotoChoices = Record<string, boolean>;

/** Photos that were looked at by the AI and have not been answered yet (the person has to say add or leave out). */
export function unansweredPhotos(evidence: Array<Pick<EvidenceRecord, "id" | "mimeType" | "uploadedAt">>, review: Record<string, unknown> | undefined, choices: PhotoChoices | undefined): string[] {
  return selectReportPhotos(evidence).chosen.filter((id) => review?.[id] && typeof choices?.[id] !== "boolean");
}

/**
 * The photos for a report draft: every image that was looked at AND that the person chose to add (D-024), with its small copy.
 * A photo whose picture can't be read still keeps its text. Reviewers can take photos out of a draft afterwards.
 */
export async function buildReportPhotos(
  assessmentId: string,
  evidence: EvidenceRecord[],
  review: Record<string, SavedPhotoReview> | undefined,
  titleByItemId: Map<string, string>,
  choices?: PhotoChoices,
  /** `thumbnails: false` skips reading and shrinking the pictures: enough when only the notes are needed (the AI write-up). */
  opts: { thumbnails?: boolean } = {},
): Promise<ReportPhoto[]> {
  if (!review) return [];
  const { chosen } = selectReportPhotos(evidence);
  const withReview = chosen.filter((id) => review[id] && choices?.[id] === true);
  if (withReview.length === 0) return [];
  const prepared = opts.thumbnails === false ? { photos: [] as PreparedPhoto[] } : await preparePhotos(assessmentId, evidence.filter((e) => withReview.includes(e.id)), { aiCopy: false });
  const thumbs = new Map(prepared.photos.map((p) => [p.evidenceId, p.thumbnail]));
  return withReview.map((id) => {
    const r = review[id];
    const itemId = r.itemId ?? evidence.find((e) => e.id === id)?.itemId ?? null;
    return {
      evidenceId: id,
      caption: r.caption,
      itemTitle: itemId ? titleByItemId.get(itemId) : undefined,
      observations: r.observations,
      possibleIssues: r.possibleIssues,
      cannotTell: r.cannotTell,
      thumbnail: thumbs.get(id) || undefined,
    };
  });
}
