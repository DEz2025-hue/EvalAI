import { describe, it, expect } from "vitest";
import { findNumberClaims, linkFramesToSegments, narrationNoteLine } from "../liveNarration";
import { LIVE_INITIAL, LIVE_MAX_SEGMENTS, LIVE_SEGMENT_SECONDS, liveIndicator, liveReducer, shouldAnalyze, shouldAutoCapture, shouldCloseSegment, type LiveAction } from "../liveSession";

const run = (actions: LiveAction[]) => actions.reduce(liveReducer, LIVE_INITIAL);
const running = (extra: LiveAction[] = []) => run([{ type: "open" }, { type: "accept" }, ...extra]);
const ticks = (n: number): LiveAction[] => Array.from({ length: n }, () => ({ type: "tick" as const }));

describe("linking pictures to narration pieces", () => {
  const segs = [
    { id: "a", startedAt: 1000, endedAt: 2000 },
    { id: "b", startedAt: 2100, endedAt: 3000 },
  ];
  it("puts a picture in the piece it was taken during", () => {
    expect(linkFramesToSegments(segs, [{ id: "f1", takenAt: 1500 }, { id: "f2", takenAt: 2500 }])).toEqual({ a: ["f1"], b: ["f2"] });
  });
  it("sends a picture taken in the gap, or outside, to the nearest piece", () => {
    const r = linkFramesToSegments(segs, [{ id: "gap1", takenAt: 2040 }, { id: "gap2", takenAt: 2080 }, { id: "early", takenAt: 10 }, { id: "late", takenAt: 9000 }]);
    expect(r).toEqual({ a: ["early", "gap1"], b: ["gap2", "late"] });
  });
  it("links nothing when there is no narration", () => {
    expect(linkFramesToSegments([], [{ id: "f", takenAt: 1 }])).toEqual({});
  });
});

describe("numbers and units are flagged for checking", () => {
  const checks = (t: string) => findNumberClaims(t).filter((p) => p.check).map((p) => p.text);
  it("flags digits with units and spelled-out numbers with units", () => {
    expect(checks("The cable run is 12.5 m and the fuse is 16 A, about thirty five degrees")).toEqual(["12.5 m", "16 A", "thirty five degrees"]);
  });
  it("keeps all the text, unchanged, in order", () => {
    const t = "Panel 3 has 4 mm cable. All good.";
    expect(findNumberClaims(t).map((p) => p.text).join("")).toBe(t);
  });
  it("does not flag plain words or unit letters inside words", () => {
    expect(checks("Looks fine, the main isolator is clean")).toEqual([]);
    expect(checks("5 amazing things")).toEqual([]);
  });
});

describe("narration note line", () => {
  it("is labelled as live narration and carries the text only", () => {
    expect(narrationNoteLine("  Cable is frayed ", new Date(0))).toMatch(/^\[Live narration .+\] Cable is frayed$/);
  });
});

describe("session choices", () => {
  it("narration is on and the AI is off by default", () => {
    expect(running()).toMatchObject({ narrationOn: true, aiEnabled: false });
  });
  it("the choices are kept when a new session starts", () => {
    const s = run([{ type: "set_narration", on: false }, { type: "set_ai", on: true }, { type: "open" }, { type: "accept" }, { type: "stop", reason: "user" }, { type: "open" }, { type: "accept" }]);
    expect(s).toMatchObject({ status: "running", narrationOn: false, aiEnabled: true, segmentsClosed: 0 });
  });
  it("takes pictures on the interval even when the AI is off, but only analyzes when it is on and idle", () => {
    const off = running(ticks(20));
    expect(shouldAutoCapture(off)).toBe(true);
    expect(shouldAnalyze(off)).toBe(false);
    const on = run([{ type: "set_ai", on: true }, { type: "open" }, { type: "accept" }, ...ticks(20)]);
    expect(shouldAnalyze(on)).toBe(true);
    const busy = liveReducer(on, { type: "analysis_started" });
    expect(shouldAnalyze(busy)).toBe(false);
    expect(shouldAutoCapture(busy)).toBe(false);
  });
});

describe("narration pieces", () => {
  it("closes a piece every LIVE_SEGMENT_SECONDS while narrating", () => {
    expect(shouldCloseSegment(running(ticks(LIVE_SEGMENT_SECONDS - 1)))).toBe(false);
    expect(shouldCloseSegment(running(ticks(LIVE_SEGMENT_SECONDS)))).toBe(true);
    expect(shouldCloseSegment(running(ticks(LIVE_SEGMENT_SECONDS * 2)))).toBe(true);
  });
  it("never closes a piece when narration is off or the session is not running", () => {
    const off = run([{ type: "set_narration", on: false }, { type: "open" }, { type: "accept" }, ...ticks(LIVE_SEGMENT_SECONDS)]);
    expect(shouldCloseSegment(off)).toBe(false);
    expect(shouldCloseSegment(liveReducer(running(ticks(LIVE_SEGMENT_SECONDS)), { type: "stop", reason: "user" }))).toBe(false);
  });
  it("is capped so a session cannot make unlimited pieces", () => {
    const s = running(Array.from({ length: LIVE_MAX_SEGMENTS }, () => ({ type: "segment_closed" as const })));
    expect(s.segmentsClosed).toBe(LIVE_MAX_SEGMENTS);
    expect(shouldCloseSegment({ ...s, elapsedS: LIVE_SEGMENT_SECONDS })).toBe(false);
  });
});

describe("indicator", () => {
  it("says the microphone is recording only while it is", () => {
    expect(liveIndicator({ narrationOn: true }, true)).toBe("LIVE · camera on · microphone recording");
    expect(liveIndicator({ narrationOn: true }, false)).toBe("LIVE · camera on · not recording");
    expect(liveIndicator({ narrationOn: false }, true)).toBe("LIVE · camera on · not recording");
  });
});
