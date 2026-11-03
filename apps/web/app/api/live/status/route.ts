import { NextResponse } from "next/server";
import { isAiConfigured } from "@eval-ai/ai-adapter";
import { LIVE_CAMERA_ENABLED, LIVE_COMING_SOON, LIVE_DEFAULT_INTERVAL_S, LIVE_INTERVALS_S, LIVE_MAX_FRAMES, LIVE_MAX_SECONDS } from "@eval-ai/shared";

// Live session status and release gate (D-015). Live is NOT video: the phone shows a camera preview and takes a still
// every few seconds (or on tap); each still goes to /api/ai/live-frame for a reviewable suggestion. This endpoint is the
// only /api/live route; the frame route lives under /api/ai with the other AI operations.

export async function GET() {
  const frameAnalysis = isAiConfigured();
  // Live guidance is off for now (D-038): say so, and that it is coming with Meta glasses.
  if (!LIVE_CAMERA_ENABLED) {
    return NextResponse.json({ status: "coming_soon", available: false, platforms: { mobile: "coming_soon", web: "coming_soon", glasses: "coming_soon" }, title: LIVE_COMING_SOON.title, message: LIVE_COMING_SOON.message, decision: "D-038" });
  }
  return NextResponse.json({
    status: "beta",
    feature: "live session: periodic and manual frames (not video)",
    available: true,
    platforms: { mobile: "beta", web: "coming_soon", glasses: "design_only" },
    message:
      "Live session is in beta on the mobile app. A camera preview shows on the phone with a still every few seconds (or when you tap Capture). You can narrate: your voice is recorded in short pieces and transcribed into notes you review (D-017). Optionally the stills also go to the AI for suggestions. Video is never recorded, and pictures are not kept unless you save one. Web live session and Meta glasses are not available yet.",
    pattern: {
      chosen: "periodic_and_manual_frames",
      decision: "D-015",
      frameRoute: "/api/ai/live-frame",
      intervalSeconds: LIVE_INTERVALS_S,
      defaultIntervalSeconds: LIVE_DEFAULT_INTERVAL_S,
      limits: { maxMinutes: LIVE_MAX_SECONDS / 60, maxFrames: LIVE_MAX_FRAMES, requestsInFlight: 1, requestsPerMinutePerWorkspace: 8 },
    },
    frameAnalysis: {
      configured: frameAnalysis,
      note: frameAnalysis ? "AI provider key is set. Image analysis has been checked with synthetic pictures on Meta's own API; not yet verified on a phone." : "No AI provider key: the session works as capture-only.",
    },
    gate: [
      { requirement: "pattern chosen and documented", state: "done", note: "D-015" },
      { requirement: "provider interaction confirmed with synthetic data", state: "partly_done", note: "Image analysis and voice transcription were checked with synthetic data on Meta's own API (2026-11-03); the phone recording format is not verified." },
      { requirement: "privacy and consent: consent step, visible LIVE indicator, no background capture, disclosure of external processing", state: "implemented_pending_device_test" },
      { requirement: "retention: frames sent inline, never stored or logged unless the person saves one", state: "implemented" },
      { requirement: "network, latency, battery and cost bounded", state: "limits_implemented_latency_and_battery_pending_device_test", note: "Interval, 30 minute and 90 frame limits, one request at a time, rate limit and daily cap." },
      { requirement: "interruption and provider failure have safe fallbacks", state: "implemented_and_unit_tested", note: "Capture-only mode, pause and retry, stop on background." },
      { requirement: "TEST_PLAN section 8 acceptance tests", state: "automated_parts_pass_device_checklist_pending" },
    ],
    glasses: {
      state: "design_only",
      decision: "D-016",
      note: "Meta glasses would be a second frame source for the same session. Not built: Meta's toolkit is a developer preview and apps using it can't be published yet.",
    },
    docs: ["eval-ai md/AI_AND_VOICE.md section 6", "eval-ai md/SECURITY.md section 6", "eval-ai md/TEST_PLAN.md section 8", "eval-ai md/DECISIONS.md D-015, D-016"],
  });
}
