import { describe, it, expect } from "vitest";
import { AnswerSync, needsMeasurement, type AnswerPayload, type SendResult } from "../answerSync";

type Sent = AnswerPayload & { baseUpdatedAt: string | null };

/** A fake server: records what was sent and answers with `reply`, optionally after a manual release. */
function fakeSend(reply: (s: Sent, n: number) => SendResult = (_s, n) => ({ ok: true, updatedAt: `t${n}` })) {
  const sent: Sent[] = [];
  const gates: Array<() => void> = [];
  let hold = false;
  const send = async (s: Sent) => {
    sent.push(s);
    if (hold) await new Promise<void>((r) => gates.push(r));
    return reply(s, sent.length);
  };
  return { send, sent, holdNext: () => { hold = true; }, release: () => { hold = false; gates.splice(0).forEach((g) => g()); } };
}

describe("AnswerSync", () => {
  it("sends the version it loaded, then the version the server returned", async () => {
    const f = fakeSend();
    const s = new AnswerSync(f.send);
    s.load([{ itemId: "a", updatedAt: "t0" }], ["a", "b"]);
    s.edited("a");
    await s.save({ itemId: "a", status: "pass" });
    s.edited("a");
    await s.save({ itemId: "a", status: "fail" });
    s.edited("b");
    await s.save({ itemId: "b", status: "pass" });
    expect(f.sent.map((x) => x.baseUpdatedAt)).toEqual(["t0", "t1", null]);
  });

  it("an unedited item is not dirty; an edited one is until saved", async () => {
    const s = new AnswerSync(fakeSend().send);
    s.load([], ["a"]);
    expect(s.isDirty("a")).toBe(false);
    s.edited("a");
    expect(s.isDirty("a")).toBe(true);
    await s.save({ itemId: "a", status: "pass" });
    expect(s.isDirty("a")).toBe(false);
  });

  it("saves run one after another, so the second uses the first one's new version (no false conflict)", async () => {
    const f = fakeSend();
    const s = new AnswerSync(f.send);
    s.load([], ["a"]);
    f.holdNext();
    s.edited("a");
    const first = s.save({ itemId: "a", status: "pass" }); // autosave
    s.edited("a");
    const second = s.save({ itemId: "a", status: "pass", notes: "x" }); // "Next" tapped meanwhile
    expect(s.saving).toBe(true);
    f.release();
    await Promise.all([first, second]);
    expect(f.sent.map((x) => x.baseUpdatedAt)).toEqual([null, "t1"]);
    expect(s.saving).toBe(false);
  });

  it("typing during a save keeps the item unsaved", async () => {
    const f = fakeSend();
    const s = new AnswerSync(f.send);
    s.load([], ["a"]);
    f.holdNext();
    s.edited("a");
    const p = s.save({ itemId: "a", status: "pass" });
    s.edited("a"); // a change after the save started
    f.release();
    await p;
    expect(s.isDirty("a")).toBe(true);
  });

  it("reports a 409 as a conflict and keeps the item unsaved; adopting the latest answer clears it", async () => {
    const s = new AnswerSync(fakeSend(() => ({ ok: false, status: 409, error: "changed elsewhere" })).send);
    s.load([], ["a"]);
    s.edited("a");
    expect(await s.save({ itemId: "a", status: "pass" })).toEqual({ ok: false, conflict: true, error: "changed elsewhere" });
    expect(s.isDirty("a")).toBe(true);
    s.adopt("a", "t9");
    expect(s.isDirty("a")).toBe(false);
  });

  it("a network failure is reported, not thrown", async () => {
    const s = new AnswerSync(async () => { throw new Error("offline"); });
    s.load([], ["a"]);
    s.edited("a");
    expect(await s.save({ itemId: "a", status: "pass" })).toEqual({ ok: false, conflict: false, error: "offline" });
  });
});

describe("needsMeasurement", () => {
  it("is true for measurement items only", () => {
    expect(needsMeasurement("Measurements — area, cable runs, distances")).toBe(true);
    expect(needsMeasurement("Customer goals, budget & constraints")).toBe(false);
  });
});
