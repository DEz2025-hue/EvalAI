import { describe, it, expect } from "vitest";
import {
  LIVE_DEFAULT_INTERVAL_S,
  LIVE_INITIAL,
  LIVE_MAX_CONSECUTIVE_FAILURES,
  LIVE_MAX_FRAMES,
  LIVE_MAX_SECONDS,
  classifyLiveFailure,
  formatElapsed,
  liveReducer,
  liveStopMessage,
  shouldAutoCapture,
  type LiveAction,
  type LiveState,
} from "../liveSession";

const run = (actions: LiveAction[], from: LiveState = LIVE_INITIAL) => actions.reduce(liveReducer, from);
const running = () => run([{ type: "set_ai", on: true }, { type: "open" }, { type: "accept" }]);
const ticks = (n: number): LiveAction[] => Array.from({ length: n }, () => ({ type: "tick" as const }));

describe("consent comes first", () => {
  it("cannot start without going through consent", () => {
    expect(liveReducer(LIVE_INITIAL, { type: "accept" }).status).toBe("idle");
    expect(run([{ type: "open" }]).status).toBe("consent");
    expect(running().status).toBe("running");
  });
  it("declining returns to idle and nothing runs", () => {
    const s = run([{ type: "open" }, { type: "decline" }, ...ticks(5)]);
    expect(s.status).toBe("idle");
    expect(s.elapsedS).toBe(0);
  });
  it("starting again resets counters but keeps the chosen interval", () => {
    const s = run([{ type: "set_interval", seconds: 30 }, { type: "open" }, { type: "accept" }, ...ticks(40), { type: "frame_taken" }, { type: "stop", reason: "user" }, { type: "open" }, { type: "accept" }]);
    expect(s).toMatchObject({ status: "running", elapsedS: 0, framesCaptured: 0, intervalS: 30, stopReason: null });
  });
});

describe("interval and automatic capture", () => {
  it("only accepts the offered intervals", () => {
    expect(liveReducer(LIVE_INITIAL, { type: "set_interval", seconds: 15 }).intervalS).toBe(LIVE_DEFAULT_INTERVAL_S);
    expect(liveReducer(LIVE_INITIAL, { type: "set_interval", seconds: 10 }).intervalS).toBe(10);
  });
  it("captures on the interval, not before, and not while a request is in flight", () => {
    let s = running();
    const captureTimes: number[] = [];
    for (let i = 0; i < 61; i++) {
      s = liveReducer(s, { type: "tick" });
      if (shouldAutoCapture(s)) {
        captureTimes.push(s.elapsedS);
        s = run([{ type: "frame_taken" }, { type: "analysis_started" }], s);
      }
      // The answer arrives 5 seconds later.
      if (s.inFlight && s.elapsedS % LIVE_DEFAULT_INTERVAL_S === 5) s = liveReducer(s, { type: "analysis_ok" });
    }
    expect(captureTimes).toEqual([20, 40, 60]);
  });
  it("skips a tick while the previous answer is still pending", () => {
    const s = run([...ticks(20), { type: "analysis_started" }], running());
    expect(s.elapsedS).toBe(20);
    expect(shouldAutoCapture(s)).toBe(false);
  });
  it("with the AI enabled, does not capture automatically once it is unavailable", () => {
    const off = run([{ type: "set_ai", on: true }, { type: "open" }, { type: "accept" }, { type: "analysis_failed", kind: "unavailable", message: "no" }, ...ticks(20)]);
    expect(off.aiMode).toBe("off");
    expect(shouldAutoCapture(off)).toBe(false);
  });
});

describe("limits keep a forgotten session from running on", () => {
  it("stops after 30 minutes", () => {
    const s = run(ticks(LIVE_MAX_SECONDS), running());
    expect(s.status).toBe("stopped");
    expect(s.stopReason).toBe("time_limit");
    expect(liveReducer(s, { type: "tick" }).elapsedS).toBe(LIVE_MAX_SECONDS); // no more ticks after stopping
  });
  it("stops after 90 frames, manual ones included", () => {
    const s = run(Array.from({ length: LIVE_MAX_FRAMES }, () => ({ type: "frame_taken" as const })), running());
    expect(s.status).toBe("stopped");
    expect(s.stopReason).toBe("frame_limit");
    expect(s.framesCaptured).toBe(LIVE_MAX_FRAMES);
  });
  it("stops when the app goes to the background", () => {
    const s = run([{ type: "stop", reason: "background" }], running());
    expect(s.status).toBe("stopped");
    expect(s.stopReason).toBe("background");
    expect(liveStopMessage("background")).toMatch(/microphone are off/);
  });
  it("a stop clears any pending request", () => {
    expect(run([{ type: "analysis_started" }, { type: "stop", reason: "user" }], running()).inFlight).toBe(false);
  });
});

describe("AI trouble never ends the session", () => {
  it("pauses the AI after repeated temporary failures and resumes on retry", () => {
    let s = running();
    for (let i = 0; i < LIVE_MAX_CONSECUTIVE_FAILURES; i++) s = run([{ type: "analysis_started" }, { type: "analysis_failed", kind: "temporary", message: "slow" }], s);
    expect(s.status).toBe("running");
    expect(s.aiMode).toBe("paused");
    expect(shouldAutoCapture({ ...s, elapsedS: 20 })).toBe(false);
    s = liveReducer(s, { type: "resume_ai" });
    expect(s).toMatchObject({ aiMode: "on", consecutiveFailures: 0, aiMessage: null });
  });
  it("a success in between resets the failure count", () => {
    const s = run([{ type: "analysis_failed", kind: "temporary", message: "slow" }, { type: "analysis_ok" }, { type: "analysis_failed", kind: "temporary", message: "slow" }], running());
    expect(s.aiMode).toBe("on");
    expect(s.consecutiveFailures).toBe(1);
  });
  it("an unavailable AI (billing, sign-in) switches it off for the rest of the session, and retry does not turn it on", () => {
    const s = run([{ type: "analysis_failed", kind: "unavailable", message: "billing" }, { type: "resume_ai" }], running());
    expect(s.aiMode).toBe("off");
    expect(s.status).toBe("running");
  });
  it("classifies failures", () => {
    expect(classifyLiveFailure(503, "ai_billing")).toBe("unavailable");
    expect(classifyLiveFailure(503, "ai_config")).toBe("unavailable");
    expect(classifyLiveFailure(401)).toBe("unavailable");
    expect(classifyLiveFailure(429)).toBe("temporary");
    expect(classifyLiveFailure(504)).toBe("temporary");
    expect(classifyLiveFailure(null)).toBe("temporary");
  });
});

describe("display helpers", () => {
  it("formats elapsed time", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(65)).toBe("1:05");
    expect(formatElapsed(1800)).toBe("30:00");
  });
});
