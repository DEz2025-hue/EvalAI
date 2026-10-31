// Photo-based length ESTIMATES.
// A flat object of known size (a sheet of paper, a card) is placed in the same plane as the thing being measured and
// photographed straight on. Its size in pixels gives millimetres per pixel; two points on the photo give the length.
// This is geometry on a single photo: no depth, no lens correction. It is an estimate, always labelled as one, and the
// gates below only reject photos where the reference itself looks tilted, rotated, tiny or unreliably detected.
// Nothing here comes from AI judgement: the optional AI step (SAM) only proposes the reference's outline.

export type PhotoReferenceId = "a4" | "letter" | "card";

export type PhotoReference = {
  id: PhotoReferenceId;
  label: string;
  widthMm: number;
  heightMm: number;
  /** Noun phrase sent to the segmentation model to find this object. */
  samPrompt: string;
  hint: string;
};

export const PHOTO_REFERENCES: Record<PhotoReferenceId, PhotoReference> = {
  a4: { id: "a4", label: "A4 paper (210 × 297 mm)", widthMm: 210, heightMm: 297, samPrompt: "sheet of paper", hint: "A flat, plain sheet works best." },
  letter: { id: "letter", label: "US Letter paper (8.5 × 11 in)", widthMm: 215.9, heightMm: 279.4, samPrompt: "sheet of paper", hint: "A flat, plain sheet works best." },
  card: { id: "card", label: "Bank or ID card (85.6 × 54 mm)", widthMm: 85.6, heightMm: 53.98, samPrompt: "credit card", hint: "Small, so keep the camera close. Best for short lengths." },
};

export function isPhotoReferenceId(v: unknown): v is PhotoReferenceId {
  return typeof v === "string" && v in PHOTO_REFERENCES;
}

/** Corners are inclusive pixel coordinates, in the same image the person sees. */
export type PixelBox = { x1: number; y1: number; x2: number; y2: number };
export type PixelPoint = { x: number; y: number };

export type PhotoCapture = {
  reference: PhotoReferenceId;
  /** How the reference outline was found: proposed by the AI and picked by the person, or marked by hand. */
  method: "sam" | "manual";
  imageW: number;
  imageH: number;
  refBox: PixelBox;
  /** AI confidence (0–1) for the reference box. Required when method is "sam". */
  confidence?: number;
  from: PixelPoint;
  to: PixelPoint;
};

// Starting limits, not yet validated against real photos. Change them only with measured evidence.
/** Largest allowed mismatch between the reference's two sides (catches tilt, rotation and bad outlines). */
export const PHOTO_MAX_REF_RATIO_ERROR = 0.05;
export const PHOTO_MIN_SAM_CONFIDENCE = 0.5;
/** The reference's long side must be at least this fraction of the image's long side (pixel precision). */
export const PHOTO_MIN_REF_FRACTION = 0.08;
/** Measured length may be at most this many times the reference's long side (perspective error grows with distance). */
export const PHOTO_MAX_TARGET_TO_REF = 10;

export function boxSizePx(b: PixelBox): { w: number; h: number } {
  return { w: b.x2 - b.x1 + 1, h: b.y2 - b.y1 + 1 };
}

/** Normalise two tapped corners (any order) into a box. */
export function boxFromCorners(a: PixelPoint, b: PixelPoint): PixelBox {
  return { x1: Math.min(a.x, b.x), y1: Math.min(a.y, b.y), x2: Math.max(a.x, b.x), y2: Math.max(a.y, b.y) };
}

/**
 * Millimetres per pixel from the reference box. The long side of the reference is matched to the box's longer side,
 * so portrait and landscape both work. ratioError is how far the two sides disagree: 0 means a perfect rectangle.
 */
export function referenceScale(ref: PhotoReference, box: PixelBox): { mmPerPx: number; ratioError: number } {
  const { w, h } = boxSizePx(box);
  const longMm = Math.max(ref.widthMm, ref.heightMm);
  const shortMm = Math.min(ref.widthMm, ref.heightMm);
  const sx = w >= h ? longMm / w : shortMm / w;
  const sy = w >= h ? shortMm / h : longMm / h;
  const mmPerPx = (sx + sy) / 2;
  return { mmPerPx, ratioError: Math.abs(sx - sy) / mmPerPx };
}

export type ReferenceCheck = { ok: true; mmPerPx: number; ratioError: number } | { ok: false; reason: string };
export type PhotoCheck = { ok: true; lengthMm: number; mmPerPx: number; ratioError: number } | { ok: false; reason: string };

const finite = (...n: number[]) => n.every((v) => typeof v === "number" && Number.isFinite(v));
const inside = (p: PixelPoint, w: number, h: number) => p.x >= 0 && p.y >= 0 && p.x <= w - 1 && p.y <= h - 1;

/**
 * Is the reference outline usable as a scale? Used live on the phone (to say "looks fine" or "retake") and by
 * checkPhotoCapture on the server, so both apply exactly the same rule.
 */
export function checkReference(c: { reference: PhotoReferenceId; method: "sam" | "manual"; imageW: number; imageH: number; refBox: PixelBox; confidence?: number }): ReferenceCheck {
  const bad = (reason: string): ReferenceCheck => ({ ok: false, reason });
  const ref = PHOTO_REFERENCES[c.reference];
  if (!ref) return bad("Unknown reference object.");
  const { imageW: W, imageH: H, refBox: b } = c;
  if (!finite(W, H, b?.x1, b?.y1, b?.x2, b?.y2) || W < 2 || H < 2) return bad("The photo measurement is incomplete — measure again.");
  if (!(b.x2 > b.x1 && b.y2 > b.y1) || b.x1 < 0 || b.y1 < 0 || b.x2 > W - 1 || b.y2 > H - 1) return bad("The reference outline isn't valid — mark it again.");

  const { w, h } = boxSizePx(b);
  if (Math.max(w, h) < PHOTO_MIN_REF_FRACTION * Math.max(W, H)) return bad("The reference is too small in the photo — move closer so it fills more of the picture.");

  if (c.method === "sam" && (typeof c.confidence !== "number" || !Number.isFinite(c.confidence) || c.confidence < PHOTO_MIN_SAM_CONFIDENCE)) {
    return bad("The AI isn't confident it found the reference — mark its corners yourself or retake the photo.");
  }

  const { mmPerPx, ratioError } = referenceScale(ref, b);
  if (ratioError > PHOTO_MAX_REF_RATIO_ERROR) {
    return bad(`The reference looks tilted or rotated (its sides don't match a flat ${ref.label.split(" (")[0]}). Lay it flat, shoot straight on, and retake.`);
  }
  return { ok: true, mmPerPx, ratioError };
}

/** Validate a capture and compute the length. The same function runs on the phone (for the readout) and on the server. */
export function checkPhotoCapture(c: PhotoCapture | undefined | null): PhotoCheck {
  const bad = (reason: string): PhotoCheck => ({ ok: false, reason });
  if (!c) return bad("The photo measurement is missing its details — measure again.");
  if (!PHOTO_REFERENCES[c.reference]) return bad("Unknown reference object.");
  if (c.method !== "sam" && c.method !== "manual") return bad("The photo measurement is incomplete — measure again.");
  const { imageW: W, imageH: H, from, to } = c;
  if (!finite(W, H, from?.x, from?.y, to?.x, to?.y) || W < 2 || H < 2) return bad("The photo measurement is incomplete — measure again.");
  if (!inside(from, W, H) || !inside(to, W, H)) return bad("The measured points are outside the photo — mark them again.");

  const rc = checkReference(c);
  if ("reason" in rc) return rc;

  const px = Math.hypot(to.x - from.x, to.y - from.y);
  if (px < 2) return bad("Pick two different points.");
  const lengthMm = px * rc.mmPerPx;
  const ref = PHOTO_REFERENCES[c.reference];
  if (lengthMm > PHOTO_MAX_TARGET_TO_REF * Math.max(ref.widthMm, ref.heightMm)) {
    return bad("That's much longer than the reference, which makes it unreliable. Use a bigger reference, measure in sections, or measure on site.");
  }
  return { ok: true, lengthMm, mmPerPx: rc.mmPerPx, ratioError: rc.ratioError };
}
