import { apiFetch } from "./api";

type Resp = { itemId: string; status?: string; notes?: string; measuredValue?: number | string | null; measuredUnit?: string | null };

/**
 * Add a line to a checklist item's notes. The item's status and measurement are sent back exactly as they were
 * (or "not_checked" if the item had no answer yet): a note, spoken or typed, never decides Pass or Fail.
 */
export async function appendItemNote(assessmentId: string, itemId: string, line: string): Promise<void> {
  const cur = await apiFetch("/api/checklist/responses?assessmentId=" + assessmentId);
  const list = cur.ok ? (((await cur.json().catch(() => ({}))) as { responses?: Resp[] }).responses ?? []) : [];
  const existing = list.find((r) => r.itemId === itemId);
  const notes = [existing?.notes, line].filter(Boolean).join("\n").slice(0, 2000);
  const res = await apiFetch("/api/checklist/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assessmentId, responses: [{ itemId, status: existing?.status ?? "not_checked", notes, measuredValue: existing?.measuredValue, measuredUnit: existing?.measuredUnit }] }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Could not save the note");
}

export type ItemStatus = "pass" | "fail" | "needs_attention" | "not_applicable" | "not_checked";

/**
 * Set a checklist item's status, and nothing else. The item's notes and measurement are read and sent back unchanged, so
 * marking an item in the live session never drops what was already recorded. Only a person's tap may call this.
 */
export async function setItemStatus(assessmentId: string, itemId: string, status: ItemStatus): Promise<void> {
  const cur = await apiFetch("/api/checklist/responses?assessmentId=" + assessmentId);
  const list = cur.ok ? (((await cur.json().catch(() => ({}))) as { responses?: Resp[] }).responses ?? []) : [];
  const existing = list.find((r) => r.itemId === itemId);
  const res = await apiFetch("/api/checklist/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Only values the server accepts are sent back (a missing value arrives as null and would be refused).
    body: JSON.stringify({
      assessmentId,
      responses: [
        {
          itemId,
          status,
          notes: typeof existing?.notes === "string" ? existing.notes : undefined,
          measuredValue: typeof existing?.measuredValue === "number" ? existing.measuredValue : undefined,
          measuredUnit: typeof existing?.measuredUnit === "string" ? existing.measuredUnit : undefined,
        },
      ],
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Could not save the answer");
}
