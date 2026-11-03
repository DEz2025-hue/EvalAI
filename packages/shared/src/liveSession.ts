// Live session rules (periodic + manual frames, decision D-015).
// A live session is NOT a video stream: the camera shows a preview and a still is taken every few seconds (or on tap).
// Video is never recorded. Since D-017 the person can also narrate: audio is recorded in short pieces while the session
// runs and transcribed. Stills can optionally go to the AI for a reviewable suggestion. This file holds the rules as a pure state
// machine so they can be tested without a phone; the app drives it with a 1-second clock.

/**
 * Live camera guidance is switched off for now (D-038): the phone's camera walk, the web live camera panel and the frame route are
 * hidden or refuse requests, and the dashboards say it is coming with Meta glasses. The site interview stays. Set to true to bring it back.
 */
export const LIVE_CAMERA_ENABLED = false;

/** What the dashboards say while live guidance is off. */
export const LIVE_COMING_SOON = {
  title: "Live guidance with Meta glasses",
  message:
    "Coming soon: walk the site hands-free with Meta AI glasses. The AI will see what you see, guide you through the checklist item by item and capture photos and notes for your review as you go.",
} as const;

export const LIVE_INTERVALS_S = [10, 20, 30] as const;
export const LIVE_DEFAULT_INTERVAL_S = 20;
/** Hard limits so a forgotten session can't run (or cost) forever. */
export const LIVE_MAX_SECONDS = 30 * 60;
export const LIVE_MAX_FRAMES = 90;
/** After this many temporary AI failures in a row the AI pauses until the person retries. */
export const LIVE_MAX_CONSECUTIVE_FAILURES = 2;
/** Narration is recorded in pieces this long (the transcription limit is far higher; short pieces upload and show up quickly). */
export const LIVE_SEGMENT_SECONDS = 45;
export const LIVE_MAX_SEGMENTS = Math.ceil(LIVE_MAX_SECONDS / LIVE_SEGMENT_SECONDS);

export type LiveStatus = "idle" | "consent" | "running" | "stopped";
export type LiveStopReason = "user" | "background" | "time_limit" | "frame_limit" | "camera_error";
/** on: AI looks at frames. paused: temporary trouble, the person can retry. off: unavailable (e.g. provider billing), capture-only. */
export type LiveAiMode = "on" | "paused" | "off";

export type LiveState = {
  status: LiveStatus;
  intervalS: number;
  elapsedS: number;
  /** Frames taken, manual and automatic. */
  framesCaptured: number;
  /** AI answers received. */
  framesAnalyzed: number;
  /** At most one AI request at a time. */
  inFlight: boolean;
  consecutiveFailures: number;
  aiMode: LiveAiMode;
  aiMessage: string | null;
  stopReason: LiveStopReason | null;
  /** The person wants to narrate (microphone on while running). Chosen before starting, kept between sessions. */
  narrationOn: boolean;
  /** Stills also go to the AI ("second pair of eyes"). Off by default. */
  aiEnabled: boolean;
  /** Narration pieces closed so far. */
  segmentsClosed: number;
};

export const LIVE_INITIAL: LiveState = {
  status: "idle",
  intervalS: LIVE_DEFAULT_INTERVAL_S,
  elapsedS: 0,
  framesCaptured: 0,
  framesAnalyzed: 0,
  inFlight: false,
  consecutiveFailures: 0,
  aiMode: "on",
  aiMessage: null,
  stopReason: null,
  narrationOn: true,
  aiEnabled: false,
  segmentsClosed: 0,
};

/** What carries over from one session to the next: the person's choices, not the counters. */
const keepChoices = (s: LiveState) => ({ intervalS: s.intervalS, narrationOn: s.narrationOn, aiEnabled: s.aiEnabled });

export type LiveAction =
  | { type: "open" }
  | { type: "accept" }
  | { type: "decline" }
  | { type: "set_interval"; seconds: number }
  | { type: "set_narration"; on: boolean }
  | { type: "set_ai"; on: boolean }
  | { type: "segment_closed" }
  | { type: "tick" }
  | { type: "frame_taken" }
  | { type: "analysis_started" }
  | { type: "analysis_ok" }
  | { type: "analysis_failed"; kind: "unavailable" | "temporary"; message: string }
  | { type: "resume_ai" }
  | { type: "stop"; reason: LiveStopReason }
  | { type: "reset" };

export function liveReducer(s: LiveState, a: LiveAction): LiveState {
  switch (a.type) {
    case "open":
      return s.status === "idle" || s.status === "stopped" ? { ...LIVE_INITIAL, ...keepChoices(s), status: "consent" } : s;
    case "decline":
      return s.status === "consent" ? { ...s, status: "idle" } : s;
    case "accept":
      // The consent step is the only way in, so frames are never sent before it was shown.
      return s.status === "consent" ? { ...LIVE_INITIAL, ...keepChoices(s), status: "running" } : s;
    case "set_interval":
      return (LIVE_INTERVALS_S as readonly number[]).includes(a.seconds) ? { ...s, intervalS: a.seconds } : s;
    case "set_narration":
      return { ...s, narrationOn: a.on };
    case "set_ai":
      return { ...s, aiEnabled: a.on };
    case "segment_closed":
      return s.status === "running" ? { ...s, segmentsClosed: s.segmentsClosed + 1 } : s;
    case "tick": {
      if (s.status !== "running") return s;
      const elapsedS = s.elapsedS + 1;
      return elapsedS >= LIVE_MAX_SECONDS ? { ...s, elapsedS, status: "stopped", stopReason: "time_limit", inFlight: false } : { ...s, elapsedS };
    }
    case "frame_taken": {
      if (s.status !== "running") return s;
      const framesCaptured = s.framesCaptured + 1;
      return framesCaptured >= LIVE_MAX_FRAMES ? { ...s, framesCaptured, status: "stopped", stopReason: "frame_limit" } : { ...s, framesCaptured };
    }
    case "analysis_started":
      return s.status === "running" ? { ...s, inFlight: true } : s;
    case "analysis_ok":
      return { ...s, inFlight: false, framesAnalyzed: s.framesAnalyzed + 1, consecutiveFailures: 0, aiMessage: null, aiMode: s.aiMode === "paused" ? "on" : s.aiMode };
    case "analysis_failed": {
      if (a.kind === "unavailable") return { ...s, inFlight: false, aiMode: "off", aiMessage: a.message };
      const consecutiveFailures = s.consecutiveFailures + 1;
      return consecutiveFailures >= LIVE_MAX_CONSECUTIVE_FAILURES
        ? { ...s, inFlight: false, consecutiveFailures, aiMode: "paused", aiMessage: a.message }
        : { ...s, inFlight: false, consecutiveFailures, aiMessage: a.message };
    }
    case "resume_ai":
      return s.aiMode === "paused" ? { ...s, aiMode: "on", consecutiveFailures: 0, aiMessage: null } : s;
    case "stop":
      return s.status === "running" || s.status === "consent" ? { ...s, status: "stopped", stopReason: a.reason, inFlight: false } : s;
    case "reset":
      return { ...LIVE_INITIAL, ...keepChoices(s) };
  }
}

/** Should the clock take an automatic still now? On the interval, within the limits. If the AI is enabled, only while it is on and idle. */
export function shouldAutoCapture(s: LiveState): boolean {
  if (s.status !== "running" || s.elapsedS <= 0 || s.elapsedS % s.intervalS !== 0 || s.framesCaptured >= LIVE_MAX_FRAMES) return false;
  return s.aiEnabled ? s.aiMode === "on" && !s.inFlight : true;
}

/** Should this still be sent to the AI? Only when the person turned "second pair of eyes" on, and it is working and idle. */
export function shouldAnalyze(s: LiveState): boolean {
  return s.status === "running" && s.aiEnabled && s.aiMode === "on" && !s.inFlight;
}

/** Close the current narration piece now? Every LIVE_SEGMENT_SECONDS of the session, while narrating, within the piece limit. */
export function shouldCloseSegment(s: LiveState): boolean {
  return s.status === "running" && s.narrationOn && s.elapsedS > 0 && s.elapsedS % LIVE_SEGMENT_SECONDS === 0 && s.segmentsClosed < LIVE_MAX_SEGMENTS;
}

/** The always-visible indicator text. The camera is on for the whole session; the microphone only when narrating. */
export function liveIndicator(s: Pick<LiveState, "narrationOn">, micActive: boolean): string {
  return s.narrationOn && micActive ? "LIVE · camera on · microphone recording" : "LIVE · camera on · not recording";
}

/**
 * Billing, configuration and sign-in problems won't fix themselves mid-session, so the AI switches off for the rest of it.
 * Everything else (network, timeouts, rate limits, server errors) is treated as temporary.
 */
export function classifyLiveFailure(status: number | null | undefined, code?: string | null): "unavailable" | "temporary" {
  if (code === "ai_billing" || code === "ai_config") return "unavailable";
  if (status === 401 || status === 402 || status === 403) return "unavailable";
  return "temporary";
}

export function liveStopMessage(reason: LiveStopReason | null): string {
  switch (reason) {
    case "background":
      return "Stopped because the app left the screen. Camera and microphone are off.";
    case "time_limit":
      return "Stopped after 30 minutes. Start again if you need more time.";
    case "frame_limit":
      return "Stopped after 90 frames. Start again if you need more.";
    case "camera_error":
      return "Stopped because the camera stopped working.";
    default:
      return "Session stopped. Camera and microphone are off.";
  }
}

export function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ---- AI notes -------------------------------------------------------------------------------

export type LiveConfidence = "low" | "medium" | "high";
export type LiveNote = {
  id: string;
  text: string;
  confidence: LiveConfidence;
  /** A real checklist item the note relates to, if any. Checked on the server. */
  checklistItemId: string | null;
};
export type LiveFrameResult = { notes: LiveNote[]; betterShotTip: string | null; seen?: string[]; stillToShow?: string[]; limitations: string[]; uncertainty: LiveConfidence };
