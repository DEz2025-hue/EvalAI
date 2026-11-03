// Saving checklist answers from a walk-through (D-025, D-026). Framework-free so web and mobile share it and it can be tested.
//
// - Each item remembers the saved version (updated_at) it last saw; that is sent as baseUpdatedAt so the server can refuse
//   a save that would overwrite a newer answer from another screen or device.
// - Saves run one at a time. An autosave and a "Next" tap for the same item can't race each other into a false conflict.
// - Each edit bumps a revision. A save clears "unsaved" only up to the revision it sent, so typing during a save stays unsaved.

export type AnswerPayload = { itemId: string; status: string; notes?: string; measuredValue?: number; measuredUnit?: string };

export type SendResult = { ok: true; updatedAt: string } | { ok: false; status: number; error: string };
export type SaveResult = { ok: true } | { ok: false; conflict: boolean; error: string };

export class AnswerSync {
  private versions = new Map<string, string | null>();
  private revs = new Map<string, number>();
  private savedRevs = new Map<string, number>();
  private queue: Promise<unknown> = Promise.resolve();
  private pending = 0;

  constructor(private send: (answer: AnswerPayload & { baseUpdatedAt: string | null }) => Promise<SendResult>) {}

  /** Start from what the server returned. Items without an answer have never been saved (null). */
  load(responses: Array<{ itemId: string; updatedAt?: string | null }>, itemIds: string[]): void {
    this.versions.clear();
    this.revs.clear();
    this.savedRevs.clear();
    for (const id of itemIds) this.versions.set(id, null);
    for (const r of responses) this.versions.set(r.itemId, r.updatedAt ?? null);
  }

  /** Call on every change to an item's answer. */
  edited(itemId: string): void {
    this.revs.set(itemId, (this.revs.get(itemId) ?? 0) + 1);
  }

  isDirty(itemId: string): boolean {
    return (this.revs.get(itemId) ?? 0) !== (this.savedRevs.get(itemId) ?? 0);
  }

  get saving(): boolean {
    return this.pending > 0;
  }

  /** After a conflict: take the answer saved elsewhere as the new starting point (the edits on screen are dropped). */
  adopt(itemId: string, updatedAt: string | null | undefined): void {
    this.versions.set(itemId, updatedAt ?? null);
    this.savedRevs.set(itemId, this.revs.get(itemId) ?? 0);
  }

  /** Save one answer. Queued behind any save already running; resolves when this one is done. */
  save(answer: AnswerPayload): Promise<SaveResult> {
    const rev = this.revs.get(answer.itemId) ?? 0;
    const snapshot = { ...answer };
    this.pending += 1;
    const run = this.queue.then(async (): Promise<SaveResult> => {
      try {
        const res = await this.send({ ...snapshot, baseUpdatedAt: this.versions.get(snapshot.itemId) ?? null });
        if (!res.ok) {
          const fail = res as Extract<SendResult, { ok: false }>; // explicit: not every app compiles with strict narrowing
          return { ok: false, conflict: fail.status === 409, error: fail.error };
        }
        this.versions.set(snapshot.itemId, res.updatedAt);
        this.savedRevs.set(snapshot.itemId, rev);
        return { ok: true };
      } catch (e) {
        return { ok: false, conflict: false, error: e instanceof Error ? e.message : String(e) };
      } finally {
        this.pending -= 1;
      }
    });
    this.queue = run;
    return run;
  }
}

/** Items whose answer is a measurement. The walk-through shows the value and unit fields for these (others can add one). */
export function needsMeasurement(title: string): boolean {
  return /measurement/i.test(title);
}
