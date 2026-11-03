import type { ReportFindingBasis, ReportInput, ReportNarrative } from "./report";
import { scenarioFor } from "./scenario";

// The project plan in a report (D-039): what must be settled before work starts, and how the project then runs, phase by phase.
// Every new draft gets a standard plan built here from the record, so a report has one even when the AI is unavailable. A Muse Wonder review may
// replace it with one fitted to the job. Either way it is a draft for a person to edit and sign off. No dates or durations: nothing recorded supports them.

export type ProjectPlanHold = {
  title: string;
  priority: "high" | "medium";
  /** Why this stops or changes the work, including any conflict in the record. */
  why: string;
  action: string;
  basis: ReportFindingBasis[];
};

export type ProjectPlanPhase = {
  name: string;
  goal: string;
  tasks: string[];
  /** Who carries it out, by role. */
  owner: string;
  /** The evidence that shows the phase is finished. */
  doneWhen: string;
  /** The next phase may not start until this one is signed off. */
  holdPoint: boolean;
};

export type ProjectPlan = {
  holds: ProjectPlanHold[];
  phases: ProjectPlanPhase[];
  source: "standard" | "ai";
  /** The model that drafted an AI plan. */
  model?: string;
};

export const PROJECT_PLAN_LIMITS = { holds: 12, phases: 10, tasks: 12, title: 160, why: 800, action: 500, name: 100, goal: 400, task: 300, owner: 80, doneWhen: 300, basis: 12, ref: 200, model: 60 } as const;

const OPEN_STATUSES = new Set(["not_checked"]);
const PROBLEM_STATUSES = new Set(["fail", "needs_attention"]);

type PhaseSeed = Omit<ProjectPlanPhase, "tasks"> & { tasks: string[] };

function installPhases(pack: ReportInput["pack"]): PhaseSeed[] {
  const solar = pack === "solar";
  return [
    {
      name: "Close the survey gaps",
      goal: "Have every fact the final design depends on.",
      tasks: solar
        ? ["Record roof dimensions, pitch, orientation and usable area", "Record shading through the day", "Measure the cable routes between array, inverter and board", "Confirm each load's power and hours", "Agree which loads must run during an outage, and for how long"]
        : ["Confirm each camera position and what it must show", "Measure the cable routes back to the recorder", "Confirm power and network at the recorder and switch locations", "Agree recording and retention needs with the client"],
      owner: "Surveyor",
      doneWhen: "Every required survey item has a recorded result.",
      holdPoint: true,
    },
    {
      name: "Make the site ready",
      goal: "Remove anything unsafe or unsuitable before equipment is chosen or fitted.",
      tasks: solar
        ? ["Have a qualified electrician inspect the supply, board and earthing, and carry out any remedial work", "Have the roof structure and fixing points assessed", "Confirm the equipment location is dry, ventilated and accessible"]
        : ["Have a qualified electrician inspect the supply and earthing", "Confirm the mounting surfaces and the equipment location are suitable"],
      owner: "Qualified electrician",
      doneWhen: "Inspection and test results are on file and remedial work is closed.",
      holdPoint: true,
    },
    {
      name: "Final design and quotation",
      goal: "Turn the proposal into a design and a price the client can approve.",
      tasks: [solar ? "Finalize the load schedule, system sizes, single-line diagram and protection" : "Finalize the camera schedule, system sizes and network layout", "Prepare the bill of materials", "Prepare the quotation from supplier prices"],
      owner: "Designer",
      doneWhen: "The client has approved the final design and the quotation in writing.",
      holdPoint: true,
    },
    {
      name: "Approvals and procurement",
      goal: "Have permission and equipment in hand before work starts.",
      tasks: ["Confirm the approvals the job needs and keep the written approvals", "Order equipment against the approved bill of materials", "Check deliveries against the order"],
      owner: "Project lead",
      doneWhen: "Approvals are on file and all equipment has been checked in.",
      holdPoint: false,
    },
    {
      name: "Installation",
      goal: "Build the approved design.",
      tasks: solar
        ? ["Fit mounting and panels", "Fit inverter and batteries", "Run and terminate DC and AC cabling, isolation and protection", "Install earthing and bonding"]
        : ["Fit cameras and mounts", "Run and terminate cabling", "Fit recorder, switches and backup power"],
      owner: "Installation team",
      doneWhen: "The installation matches the approved design, or changes are recorded.",
      holdPoint: false,
    },
    {
      name: "Testing and commissioning",
      goal: "Show that the system is safe and works as designed.",
      tasks: solar
        ? ["Carry out and record electrical tests", "Commission the inverter and batteries", "Test the changeover and the agreed backup loads", "Set up and check remote monitoring"]
        : ["Carry out and record electrical and network tests", "Check each camera view against the detail it must give", "Confirm recording and retention work"],
      owner: "Qualified electrician",
      doneWhen: "Test results are recorded and a qualified person has signed them.",
      holdPoint: true,
    },
    {
      name: "Handover",
      goal: "Leave the client able to run the system.",
      tasks: ["Give the client the documents and as-built records", "Show the client how to use and monitor the system", "Agree the maintenance schedule"],
      owner: "Project lead",
      doneWhen: "The client has signed the handover.",
      holdPoint: false,
    },
  ];
}

function existingSystemPhases(): PhaseSeed[] {
  return [
    { name: "Close the inspection gaps", goal: "Have a result for everything that must be checked.", tasks: ["Confirm the system's current condition and records"], owner: "Inspector", doneWhen: "Every required item has a recorded result.", holdPoint: true },
    { name: "Make safe", goal: "Deal with anything unsafe first.", tasks: ["Isolate or protect anything found unsafe until it is repaired"], owner: "Qualified electrician", doneWhen: "Unsafe conditions are isolated or repaired, and this is recorded.", holdPoint: true },
    { name: "Scope and quote the work", goal: "Agree what will be repaired or replaced.", tasks: ["List the repairs and replacements", "Prepare the quotation from supplier prices"], owner: "Project lead", doneWhen: "The client has approved the scope and the quotation in writing.", holdPoint: true },
    { name: "Carry out the work", goal: "Complete the approved scope.", tasks: ["Carry out the approved repairs and replacements", "Record any change to the agreed scope"], owner: "Installation team", doneWhen: "The approved scope is complete.", holdPoint: false },
    { name: "Retest and hand over", goal: "Show that the problems are fixed.", tasks: ["Retest what was repaired and record the results", "Give the client the updated records and the maintenance schedule"], owner: "Qualified electrician", doneWhen: "Results are recorded and the client has signed the handover.", holdPoint: false },
  ];
}

/** The standard plan for a report, built only from the job's type and its saved checklist. */
export function buildProjectPlan(input: Pick<ReportInput, "pack" | "mode" | "context" | "checklist">): ProjectPlan {
  const install = scenarioFor(input.mode, input.context?.scenario) === "new_install";
  const phases = install ? installPhases(input.pack) : existingSystemPhases();
  const rows = input.checklist ?? [];
  const open = rows.filter((r) => r.required && (OPEN_STATUSES.has(r.status) || r.status === "not_applicable"));
  const problems = rows.filter((r) => PROBLEM_STATUSES.has(r.status));
  phases[0].tasks = [...open.map((r) => `Complete: ${r.title}`), ...phases[0].tasks];
  phases[1].tasks = [...problems.map((r) => `Resolve: ${r.title}`), ...phases[1].tasks];
  const holds: ProjectPlanHold[] = [
    ...problems.map((r): ProjectPlanHold => ({
      title: r.title,
      priority: r.status === "fail" ? "high" : "medium",
      why: r.notes?.trim() || "Marked as a problem during the checklist.",
      action: "Resolve this and record the result before the work depends on it.",
      basis: [{ kind: "item", ref: r.title }],
    })),
    ...open.map((r): ProjectPlanHold => ({
      title: r.title,
      priority: "medium",
      why: r.notes?.trim() || "A required item with no result yet.",
      action: "Complete this check and record the result.",
      basis: [{ kind: "item", ref: r.title }],
    })),
  ];
  return cleanProjectPlan({ holds, phases, source: "standard" }) as ProjectPlan;
}

const text = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Checks a plan field by field. Returns null when it has no usable phases, which removes a saved plan. */
export function cleanProjectPlan(raw: unknown): ProjectPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const L = PROJECT_PLAN_LIMITS;
  const phases: ProjectPlanPhase[] = (Array.isArray(r.phases) ? r.phases : [])
    .map((p): ProjectPlanPhase => {
      const o = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
      return {
        name: text(o.name, L.name),
        goal: text(o.goal, L.goal),
        tasks: (Array.isArray(o.tasks) ? o.tasks : []).map((t) => text(t, L.task)).filter(Boolean).slice(0, L.tasks),
        owner: text(o.owner, L.owner),
        doneWhen: text(o.doneWhen, L.doneWhen),
        holdPoint: o.holdPoint === true,
      };
    })
    .filter((p) => p.name)
    .slice(0, L.phases);
  if (phases.length === 0) return null;
  const holds: ProjectPlanHold[] = (Array.isArray(r.holds) ? r.holds : [])
    .map((h): ProjectPlanHold => {
      const o = (h && typeof h === "object" ? h : {}) as Record<string, unknown>;
      const basis = (Array.isArray(o.basis) ? o.basis : [])
        .map((b) => (b && typeof b === "object" ? (b as Record<string, unknown>) : {}))
        .filter((b) => b.kind === "item" || b.kind === "photo" || b.kind === "measurement" || b.kind === "finding")
        .map((b) => ({ kind: b.kind as ReportFindingBasis["kind"], ref: text(b.ref, L.ref) }))
        .filter((b) => b.ref)
        .slice(0, L.basis);
      return { title: text(o.title, L.title), priority: o.priority === "high" ? "high" : "medium", why: text(o.why, L.why), action: text(o.action, L.action), basis };
    })
    .filter((h) => h.title)
    .sort((a, b) => (a.priority === b.priority ? 0 : a.priority === "high" ? -1 : 1))
    .slice(0, L.holds);
  const model = text(r.model, L.model);
  return { holds, phases, source: r.source === "ai" ? "ai" : "standard", ...(model ? { model } : {}) };
}

/** The line printed under the plan's heading, saying where it came from. */
export function projectPlanNote(plan: ProjectPlan): string {
  return plan.source === "ai"
    ? `Drafted by AI${plan.model ? ` (${plan.model})` : ""} from the saved record, for a qualified person to confirm. It has no dates or durations until the survey and approvals are done.`
    : "The standard project sequence for this kind of job, with this job's open items added, for a qualified person to confirm. It has no dates or durations until the survey and approvals are done.";
}

/** Does the report hold any written analysis, or a finding a person confirmed? A report without either is only the saved facts, so signing it off needs a deliberate choice. */
export function hasWriteUp(narrative: ReportNarrative | undefined, confirmedFindings = 0): boolean {
  const n = narrative ?? {};
  return !!(confirmedFindings > 0 || n.summary?.trim() || n.keyFindings?.length || n.design || n.solar || n.observations?.trim() || n.issues?.trim());
}
