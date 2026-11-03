// Evaluation set for the site interview (D-030). Made-up jobs and scripted conversations only. Used by an offline test (the automated checks
// work) and by the live run (interviewEval.live.test.ts), which asks the real model for the first question and for the digest of each
// conversation so a person can read them against the rubric in TEST_PLAN.md.

import type { InterviewDigest } from "../../interview";
import { quoteIsFromPerson } from "../../interview";
import { numbersIn } from "../../figures";

type Turn = { role: "ai" | "person"; text: string };

export type InterviewCase = {
  id: string;
  title: string;
  tests: string;
  record: {
    workspaceId: string;
    assessmentId: string;
    siteName: string;
    mode: "assessment" | "inspection";
    pack: "solar" | "cctv";
    scenario: "new_install" | "existing";
    goal?: string;
    siteBrief?: { goal?: string; intakeText?: string; existingEquipment?: string };
    checklist: Array<{ title: string; status: string; notes?: string; category?: string; required?: boolean }>;
    measurements: Array<{ name: string; value: number; unit: string }>;
    findingCount: number;
  };
  /** A scripted conversation (what a technician might say), for the digest. */
  turns: Turn[];
};

const base = { workspaceId: "eval", mode: "assessment" as const, findingCount: 0, measurements: [] as Array<{ name: string; value: number; unit: string }> };

export const INTERVIEW_CASES: InterviewCase[] = [
  {
    id: "solar-new-school",
    title: "New rooftop solar for a school hall; the technician talks about the building and the school day",
    tests: "A first question that targets the not-checked load audit; a digest with notes tied to real items, each quoting the technician",
    record: {
      ...base,
      assessmentId: "i1",
      siteName: "Hillside School (made up)",
      pack: "solar",
      scenario: "new_install",
      goal: "A rooftop array for the school hall",
      siteBrief: { goal: "A rooftop array for the school hall", intakeText: "Tin roof facing north, a big tree to the north west" },
      checklist: [
        { title: "Orientation, tilt, shading survey", status: "needs_attention", notes: "tree NW", category: "Site", required: true },
        { title: "Load audit — demand & operating hours", status: "not_checked", category: "Customer", required: true },
        { title: "Electrical supply — main board, earthing, spare capacity", status: "not_checked", category: "Electrical", required: true },
      ],
    },
    turns: [
      { role: "ai", text: "What runs in the hall and the nearby rooms during the school day?" },
      { role: "person", text: "Mostly lights and fans, and the office has a few computers and a printer. The kitchen has a big fridge that never goes off." },
      { role: "ai", text: "Is anything on after the school closes?" },
      { role: "person", text: "The security lights come on at night and the fridge keeps running. The caretaker says the hall is hired out on Saturdays." },
      { role: "ai", text: "Where is the main electrical board?" },
      { role: "person", text: "It's in a store room next to the hall. I didn't open it, but the door is never locked and kids can get in." },
    ],
  },
  {
    id: "cctv-existing-shop",
    title: "Existing CCTV, two cameras not working; the shop owner explains what happened",
    tests: "Notes tied to the camera and recorder items; a possible risk drafted as a finding with a quote; no invented causes",
    record: {
      ...base,
      assessmentId: "i2",
      siteName: "Main Street Hardware (made up)",
      mode: "inspection",
      pack: "cctv",
      scenario: "existing",
      goal: "Fix the cameras that stopped working",
      siteBrief: { goal: "Fix the cameras that stopped working", existingEquipment: "Eight cameras on a recorder behind the counter" },
      checklist: [
        { title: "Camera image check", status: "fail", notes: "Two cameras show no image", category: "System", required: true },
        { title: "Recorder — storage and recording days", status: "needs_attention", notes: "Keeps about a week", category: "System", required: true },
        { title: "Network & power survey", status: "not_checked", category: "System", required: true },
      ],
    },
    turns: [
      { role: "ai", text: "When did the two cameras stop working?" },
      { role: "person", text: "After the power cut last month. The yard camera and the one over the side door." },
      { role: "ai", text: "Has anyone looked at the recorder or the power for those cameras?" },
      { role: "person", text: "My nephew restarted the recorder once. The power supply for the outside cameras is in the ceiling and I don't know where." },
    ],
  },
  {
    id: "vague-answers",
    title: "A technician who gives short, vague answers",
    tests: "The digest proposes little rather than inventing; open questions are listed; nothing is quoted that was not said",
    record: {
      ...base,
      assessmentId: "i3",
      siteName: "Riverside Clinic (made up)",
      pack: "solar",
      scenario: "new_install",
      goal: "Solar for the clinic",
      checklist: [
        { title: "Load audit — demand & operating hours", status: "not_checked", category: "Customer", required: true },
        { title: "Roof / structure / mounting constraints", status: "not_checked", category: "Site", required: true },
      ],
    },
    turns: [
      { role: "ai", text: "What kind of roof does the clinic have?" },
      { role: "person", text: "Not sure, I think it's metal." },
      { role: "ai", text: "What equipment runs all day?" },
      { role: "person", text: "The usual clinic stuff." },
    ],
  },
];

const STATUS_WORDS = /\b(passes|passed|fails|failed|compliant|complies|safe|fine|satisfactory|approved)\b/i;

/** Automated checks for one digest. `problems` should be empty; `notes` are for the person reading. */
export function checkDigest(c: InterviewCase, d: InterviewDigest): { problems: string[]; notes: string[] } {
  const problems: string[] = [];
  const notes: string[] = [];
  const said = numbersIn(c.turns.filter((t) => t.role === "person").map((t) => t.text));
  const titles = new Set(c.record.checklist.map((i) => i.title));
  for (const n of d.itemNotes) {
    if (!titles.has(n.itemTitle)) problems.push(`Note for an item that is not on the checklist: ${n.itemTitle}`);
    if (!quoteIsFromPerson(n.quote, c.turns)) problems.push(`A note quotes words the person did not say: "${n.quote}"`);
    if (STATUS_WORDS.test(n.note)) problems.push(`A note sounds like a verdict: "${n.note}"`);
  }
  for (const f of d.findingDrafts) {
    if (!f.quotes.every((q) => quoteIsFromPerson(q, c.turns))) problems.push(`A finding draft quotes words the person did not say: ${f.title}`);
    if (STATUS_WORDS.test(f.description)) problems.push(`A finding draft sounds like a verdict: ${f.title}`);
  }
  for (const b of d.briefLines) if (!quoteIsFromPerson(b.quote, c.turns)) problems.push(`A detail quotes words the person did not say: ${b.label}`);
  const written = [...d.itemNotes.map((n) => n.note), ...d.findingDrafts.map((f) => f.description), ...d.briefLines.map((b) => b.value)].join(" ");
  for (const m of written.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const v = Number(m[0].replace(/,/g, ""));
    if (Number.isFinite(v) && !said.has(v) && !numbersIn(c.record).has(v)) problems.push(`A number nobody said appears in the proposals: ${m[0]}`);
  }
  if (c.id === "vague-answers" && d.itemNotes.length + d.findingDrafts.length + d.briefLines.length > 3) problems.push("Too much was proposed from vague answers");
  if (d.openQuestions.length === 0) notes.push("No open questions listed");
  if (d.unverifiedFigures.length) notes.push(`Figures flagged: ${d.unverifiedFigures.join("; ")}`);
  if (d.dropped.length) notes.push(`Left out as ungrounded: ${d.dropped.join("; ")}`);
  return { problems, notes };
}
