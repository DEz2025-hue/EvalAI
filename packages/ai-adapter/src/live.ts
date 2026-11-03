import { z } from "zod";
import { ScenarioField, situationHint } from "./situation";
import { getAdapterConfig } from "./config";
import { chatJson, type CallOptions } from "./chat";
import { liveFrameSchema } from "./jsonSchemas";
import { SYSTEM_GUARD, compact } from "./text";

// One frame from a live session (Muse Spark vision). Notes are SUGGESTIONS for a person to review: never a verified
// measurement, count, rating, pass/fail or compliance result. Only checklist ids that were sent can come back.

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_NOTES = 4;
const MAX_NOTE_CHARS = 300;

export const LiveFrameInput = z.object({
  imageBase64: z.string().min(1),
  mimeType: z.string().default("image/jpeg"),
  mode: z.enum(["assessment", "inspection"]).optional(),
  pack: z.string().max(40).optional(),
  /** New installation or existing system, from the stored job. */
  scenario: ScenarioField,
  /** The job's checklist as the server knows it. */
  checklist: z.array(z.object({ id: z.string().min(1).max(100), title: z.string().max(300), status: z.string().max(40) })).max(200).default([]),
  /** What to look for on the item the person is looking at (D-021). Only sent for that one item. */
  currentLookFor: z.string().max(800).optional(),
  /** The item the person says they are looking at, if any. */
  currentItemId: z.string().max(100).optional(),
  /** The last few notes already shown, so the AI doesn't repeat itself. */
  previousNotes: z.array(z.string().max(400)).max(5).default([]),
});

export type LiveFrameOutput = {
  notes: Array<{ id: string; text: string; confidence: "low" | "medium" | "high"; checklistItemId: string | null }>;
  betterShotTip: string | null;
  /** Checklist-guided hint (D-023): what the picture showed of the item's look-for text, and what is still to show. */
  seen: string[];
  stillToShow: string[];
  limitations: string[];
  uncertainty: "low" | "medium" | "high";
  requiresHumanReview: true;
};

const hintList = (v: unknown): string[] => (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim().slice(0, 120)).slice(0, 6);
const level = (v: unknown): "low" | "medium" | "high" => (v === "low" || v === "medium" || v === "high" ? v : "low");
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export async function liveFrame(input: unknown, options?: CallOptions): Promise<LiveFrameOutput> {
  const v = LiveFrameInput.parse(input);
  if (!IMAGE_MIMES.has(v.mimeType)) throw new Error("Unsupported image type " + v.mimeType + " — use JPEG, PNG or WebP");
  const cfg = getAdapterConfig();
  const { data } = await chatJson(
    cfg,
    "liveFrame",
    {
      system:
        SYSTEM_GUARD +
        " This is ONE still picture from a live site visit, taken every few seconds. Give up to 3 short, specific observations that matter for the checklist, saying only what is visible." +
        " Never state dimensions, quantities, ratings, ages, or hidden conditions as facts, and never say an item passes, fails or is compliant: a person decides that. Do not repeat anything in previousNotes." +
        " If currentLookFor is given, check what is visible against it: list under seen the parts of it that this picture shows, and under still_to_show the parts it does not show yet (short phrases). Leave both empty when currentLookFor is empty. If the picture is dark, blurry, too far away or too close, say so briefly in better_shot_tip, otherwise leave it empty. checklist_item_id must be an id from the checklist, or empty when a note is not about one item. List what you cannot tell from this picture under limitations.",
      user: [
        { type: "text", text: JSON.stringify({ task: "liveFrame", mode: v.mode ?? "", pack: v.pack ?? "", situation: situationHint(v.scenario), checklist: compact(v.checklist), currentItemId: v.currentItemId ?? "", currentLookFor: v.currentLookFor ?? "", previousNotes: compact(v.previousNotes) }) },
        { type: "image_url", image_url: { url: "data:" + v.mimeType + ";base64," + v.imageBase64 } },
      ],
      schemaName: "live_frame",
      schema: liveFrameSchema(),
    },
    options,
  );
  const raw = data as { notes?: Array<{ text?: unknown; confidence?: unknown; checklist_item_id?: unknown }>; better_shot_tip?: unknown; seen?: unknown; still_to_show?: unknown; limitations?: unknown; uncertainty?: unknown };
  const knownIds = new Set(v.checklist.map((c) => c.id));
  const seen = new Set(v.previousNotes.map(norm));
  const notes: LiveFrameOutput["notes"] = [];
  for (const n of Array.isArray(raw.notes) ? raw.notes : []) {
    const text = typeof n?.text === "string" ? n.text.trim().slice(0, MAX_NOTE_CHARS) : "";
    if (!text || seen.has(norm(text))) continue;
    seen.add(norm(text));
    const id = typeof n.checklist_item_id === "string" && knownIds.has(n.checklist_item_id) ? n.checklist_item_id : null;
    notes.push({ id: globalThis.crypto.randomUUID(), text, confidence: level(n.confidence), checklistItemId: id });
    if (notes.length >= MAX_NOTES) break;
  }
  const tip = typeof raw.better_shot_tip === "string" ? raw.better_shot_tip.trim().slice(0, 200) : "";
  const limitations = (Array.isArray(raw.limitations) ? raw.limitations : []).filter((l): l is string => typeof l === "string" && l.trim().length > 0).slice(0, 6);
  return {
    notes,
    betterShotTip: tip || null,
    // Only meaningful when the item has look-for text; otherwise the model is told to leave them empty and they are dropped here too.
    seen: v.currentLookFor ? hintList(raw.seen) : [],
    stillToShow: v.currentLookFor ? hintList(raw.still_to_show) : [],
    limitations: [...limitations, "Live notes are suggestions from a single still, not verified findings or measurements"],
    uncertainty: ["low", "medium", "high"].includes(String(raw.uncertainty)) ? (raw.uncertainty as "low" | "medium" | "high") : "high",
    requiresHumanReview: true,
  };
}
