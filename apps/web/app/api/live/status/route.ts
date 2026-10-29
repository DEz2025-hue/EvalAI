import { NextResponse } from "next/server";

// Phase 7 — Live camera remains Coming Soon. This endpoint documents the gate
// and proves no working live-stream is exposed. Any future live implementation
// must pass the gate below and add a real streaming/frame route.

export async function GET() {
  const frameAnalysis = !!process.env.AI_PROVIDER_API_KEY;
  return NextResponse.json({
    status: "coming_soon",
    feature: "continuous live-camera AI guidance",
    available: false,
    message: "Live camera guidance is Coming Soon — not a working feature until provider, privacy, and reliability gate passes. Manual single-frame capture + suggestion-only analysis is available in the app today.",
    manualFrameCapture: {
      available: true,
      analysisAvailable: frameAnalysis,
      how: "In-app Live camera panel: explicit Start opens preview only (never recorded), Capture sends one frame to /api/ai/analyze-image (suggestion, requiresHumanReview), optional save to private evidence.",
      analysisNote: frameAnalysis ? "AI_PROVIDER_API_KEY is set — frame analysis active." : "AI_PROVIDER_API_KEY not set — frames can be captured and saved as evidence, analysis returns a labelled fallback.",
    },
    gate: {
      required: [
        "provider supported image/video interaction pattern confirmed (docs + synthetic data)",
        "product chooses one of: selected frames (manual capture), periodic frames, or provider live stream — documented in DECISIONS.md",
        "privacy & consent: camera/mic permission asked only when needed, visible active indicator, no background recording, disclosure of external processing/retention",
        "data retention & storage: frame/audio retention policy documented, private storage, short-lived signed URLs only after authz",
        "network / latency / battery / cost measured and bounded",
        "interruption & provider failure have safe fallbacks (preserve work, show safe error, retry, manual fallback)",
        "all TEST_PLAN.md §8 live-camera acceptance tests pass",
      ],
      decision_needed: "D-005 future pattern choice",
      docs: ["eval-ai md/AI_AND_VOICE.md §6", "eval-ai md/SECURITY.md §6", "eval-ai md/TEST_PLAN.md §8"],
    },
    alternatives_today: [
      "Capture/upload photo → private Storage → user requests /api/ai/analyze-image (suggestion, with uncertainty/limitations, requiresHumanReview=true)",
    ],
  });
}
