import { previewKey, type GateSnapshot } from "@eval-ai/shared";

// Which version of which draft the person has looked at (D-024). Kept in memory for the session: after the app is restarted a
// draft has to be previewed again before it can be downloaded, which is the safe direction.
const seen = new Map<string, string>();

/** Remember that this exact version of the draft was shown to the person. */
export function markPreviewed(snapshot: GateSnapshot): void {
  seen.set(snapshot.id, previewKey(snapshot));
}

export function previewedKeyFor(snapshotId: string): string | null {
  return seen.get(snapshotId) ?? null;
}
