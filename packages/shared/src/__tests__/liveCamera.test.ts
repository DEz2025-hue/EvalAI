import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// Phase 7 release gate, updated by decision D-015 (2026-10-31).
// Before: live camera had to stay Coming Soon everywhere. Now the chosen pattern is "periodic and manual frames" and a
// beta exists on mobile ONLY. These tests lock what that beta may and may not do, and keep the web honest.
const root = path.join(__dirname, "../../../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
const walk = (dir: string): string[] =>
  fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)])) : [];

describe("web live session is still Coming Soon (only mobile has the beta)", () => {
  it("the web placeholder says Coming Soon, no live stream, and does not open a live camera", () => {
    const src = read("apps/web/components/LiveCameraPlaceholder.tsx");
    expect(src).toContain("Coming Soon");
    expect(src.toLowerCase()).toContain("no live stream");
    expect(src).not.toMatch(/getUserMedia.*live/i);
  });

  it("while live is off (D-038) the dashboard shows it as coming soon with Meta glasses, and the job page hides the live panel", () => {
    expect(read("apps/web/app/page.tsx")).toContain("LIVE_COMING_SOON.title");
    expect(read("apps/web/app/assessments/[id]/page.tsx")).toContain("{LIVE_CAMERA_ENABLED ? <LiveCameraPanel");
  });
});

describe("API surface", () => {
  const routes = walk(path.join(root, "apps/web/app/api")).map((p) => p.replace(/\\/g, "/"));

  it("only /api/live/status exists under /api/live; the frame route lives with the other AI routes", () => {
    for (const r of routes.filter((p) => /\/api\/live\//.test(p))) expect(r).toMatch(/\/api\/live\/status\/route\.ts$/);
    expect(routes.some((p) => /\/api\/ai\/live-frame\/route\.ts$/.test(p))).toBe(true);
  });

  it("no route claims to stream video or handle continuous camera input", () => {
    expect(routes.filter((p) => /live.*stream|continuous.*camera|\/stream\//i.test(p)).length).toBe(0);
  });

  it("the status route reports beta, the chosen pattern and that glasses are design only", () => {
    const src = read("apps/web/app/api/live/status/route.ts");
    expect(src).toContain('status: "beta"');
    expect(src).toContain("periodic_and_manual_frames");
    expect(src).toContain("design_only");
    expect(src).toContain('web: "coming_soon"');
  });

  it("the frame route is authenticated, rate limited, checks the job's workspace, and stores nothing", () => {
    const src = read("apps/web/app/api/ai/live-frame/route.ts");
    expect(src).toContain("requireWriter");
    expect(src).toContain("aiGuard");
    expect(src).toContain("loadAssessmentFacts");
    expect(src).not.toMatch(/uploadEvidence|storage\.from|\.insert\(|writeFile/);
  });
});

describe("mobile live session beta: consent, indicator, no recording, no background capture", () => {
  const session = read("apps/mobile/components/LiveSession.tsx");
  const screen = read("apps/mobile/app/assessments/[id]/live.tsx");
  const source = read("apps/mobile/lib/liveSource.ts");
  const camera = read("apps/mobile/lib/usePhoneCamera.tsx");
  const all = [session, screen, source, camera].join("\n");

  const rules = read("packages/shared/src/liveSession.ts");
  const narrationHook = read("apps/mobile/lib/useNarration.ts");

  it("is labelled Beta and the consent text says what is recorded and sent (D-017)", () => {
    expect(session).toContain('label="Beta"');
    expect(session).toContain("Before you start");
    expect(session).toContain("Video is never recorded");
    expect(session).toContain("The microphone records your voice in short pieces");
    expect(session).toContain("sent to the speech service");
    expect(session).toContain("saved privately with this job");
    expect(session).toContain("sent to the AI service"); // only when the AI option is on
    expect(session).toContain("Tell people on site");
  });

  it("shows an indicator that says when the microphone is recording, and when nothing is", () => {
    expect(session).toContain("liveIndicator(state, narration.active)");
    expect(rules).toContain("LIVE · camera on · microphone recording");
    expect(rules).toContain("LIVE · camera on · not recording");
  });

  it("narration is on by default, the AI option is off by default, and both are choices made before starting", () => {
    expect(rules).toMatch(/narrationOn: true/);
    expect(rules).toMatch(/aiEnabled: false/);
    expect(session).toContain("Narrate: on");
    expect(session).toContain("AI second pair of eyes");
  });

  it("ends the session when the app leaves the screen, and keeps the screen awake only while running", () => {
    expect(session).toContain("AppState");
    expect(session).toContain('reason: "background"');
    expect(session).toContain("activateKeepAwakeAsync");
    expect(session).toContain("deactivateKeepAwake");
  });

  it("never records video, has no background tasks, and only the narration hook touches the microphone (D-017)", () => {
    expect(all).not.toMatch(/recordAsync|startRecording|stopRecording|useMicrophonePermissions|requestMicrophonePermissions|registerTaskAsync|TaskManager/);
    // Audio APIs live in one file only, so the privacy rules can be checked in one place.
    expect(all).not.toMatch(/expo-audio|useAudioRecorder|requestRecordingPermissionsAsync/);
    expect(narrationHook).toContain("useAudioRecorder");
    expect(narrationHook).not.toMatch(/registerTaskAsync|TaskManager|staysActiveInBackground|shouldPlayInBackground/);
    const app = JSON.parse(read("apps/mobile/app.json")) as { expo: { plugins: unknown[]; ios?: { infoPlist?: Record<string, unknown> } } };
    expect(JSON.stringify(app.expo.ios?.infoPlist ?? {})).not.toContain("UIBackgroundModes");
    const cam = app.expo.plugins.find((p) => Array.isArray(p) && p[0] === "expo-camera") as [string, Record<string, unknown>] | undefined;
    expect(cam?.[1].microphonePermission).toBe(false);
    expect(cam?.[1].recordAudioAndroid).toBe(false);
  });

  it("deletes temporary pictures unless the person saves them, and the camera preview exists only while running", () => {
    expect(source).toContain("discardFile");
    expect(session).toContain("Pictures you don't save are deleted when you leave this screen.");
    expect(session).toMatch(/\{running \? \(/);
  });

  it("the microphone follows the session: stopped with it, never in the background", () => {
    expect(session).toContain("narrationRef.current.start()");
    expect(session).toContain("narrationRef.current.stop()");
    expect(session).toContain("shouldCloseSegment");
    expect(rules).toContain("LIVE_SEGMENT_SECONDS");
  });

  it("AI notes are labelled suggestions that need review, and nothing is created automatically", () => {
    expect(session).toContain("AI suggestion · needs your review");
    // Findings, notes and evidence are only created from an explicit tap.
    expect(session).toMatch(/onPress=\{\(\) => void addFinding\(card, note\)\}/);
    expect(session).toMatch(/onPress=\{\(\) => void saveFrame\(card\)\}/);
    expect(session).toMatch(/onPress=\{\(\) => void addNarrationNote\(seg\)\}/);
    expect(session).toMatch(/onPress=\{\(\) => void addNarrationFinding\(seg\)\}/);
  });

  it("spoken words never change a checklist answer: transcripts are unconfirmed, and notes keep the item's status", () => {
    expect(session).not.toMatch(/\/api\/checklist\/responses/); // the only write goes through appendItemNote
    expect(session).toContain("appendItemNote");
    expect(session).toContain("What you said never changes a checklist answer");
    expect(session).toContain("confirmed: false");
    const notes = read("apps/mobile/lib/itemNotes.ts");
    expect(notes).toContain('status: existing?.status ?? "not_checked"');
  });

  it("walking the checklist (D-023): a status is written only by a person's tap on a status chip, through setItemStatus", () => {
    // The live component never talks to the responses route itself.
    expect(session).not.toMatch(/\/api\/checklist\/responses/);
    // The single call site of markItem is a chip's onPress.
    const calls = session.match(/markItem\(/g) ?? [];
    expect(calls).toHaveLength(2); // the function definition and the chip
    expect(session).toMatch(/onPress=\{\(\) => void markItem\(st\.value\)\}/);
    expect(session).toContain("markStatus = setItemStatus");
    // Nothing that comes from the AI, a transcript, moving on or the finish screen can mark an item.
    const afterAnalysis = session.slice(session.indexOf("async function analyzeFrame"), session.indexOf("const capture = useCallback"));
    expect(afterAnalysis).not.toMatch(/markItem|markStatus|setStatuses/);
    const goTo = session.slice(session.indexOf("function goTo("), session.indexOf("async function markItem("));
    expect(goTo).not.toMatch(/markItem|markStatus|setStatuses/);
    const finish = session.slice(session.indexOf("Walk summary"), session.indexOf("OptionChips\n"));
    expect(finish).not.toMatch(/markItem|markStatus|setStatuses/);
    expect(finish).toContain("Nothing was marked for you");
  });

  it("walking the checklist: the status helper keeps notes and measurements and the item is linked automatically", () => {
    const notes = read("apps/mobile/lib/itemNotes.ts");
    expect(notes).toContain("export async function setItemStatus");
    expect(notes).toMatch(/notes: typeof existing\?\.notes === "string"/);
    expect(notes).toMatch(/measuredValue: typeof existing\?\.measuredValue === "number"/);
    // Narration is cut when the person changes item, so each piece belongs to one item.
    const goTo = session.slice(session.indexOf("function goTo("), session.indexOf("async function markItem("));
    expect(goTo).toContain("narrationRef.current.rotate()");
    // The AI's coverage hint is labelled as a suggestion.
    expect(session).toContain("(AI suggestion)");
  });

  it("the live screen loads the checklist with what to look for and starts at the Start here item", () => {
    expect(screen).toContain("startHereFor");
    expect(screen).toContain("instructions");
    expect(screen).toContain("onPrepareReport");
  });

  it("goes through the shared rules (consent first, limits, pause and capture-only)", () => {
    expect(session).toContain("liveReducer");
    expect(session).toContain("shouldAutoCapture");
    expect(session).toContain('type: "open"');
    expect(session).toContain('type: "accept"');
  });

  it("the job screen calls it a beta when it is on; while it is off (D-038) Home shows it as coming soon and the job offers the site interview", () => {
    expect(read("apps/mobile/app/assessments/[id].tsx")).toContain("Live session (beta)");
    expect(read("apps/mobile/app/assessments/[id].tsx")).toContain("Site interview");
    expect(read("apps/mobile/app/(tabs)/index.tsx")).toContain("LIVE_COMING_SOON");
  });
});

describe("the decision is recorded", () => {
  it("DECISIONS.md records the live pattern (D-015) and the glasses decision (D-016)", () => {
    const d = read("eval-ai md/DECISIONS.md");
    expect(d).toContain("D-015");
    expect(d).toContain("D-016");
    expect(d).toContain("D-017");
    expect(d.toLowerCase()).toContain("periodic");
    expect(d.toLowerCase()).toContain("glasses");
  });
});
