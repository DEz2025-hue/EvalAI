import { NextResponse } from "next/server";
import { z } from "zod";
import { draftDesignPlan, draftDesignWrite, draftReportNarrative, draftReportSummary, draftSolarPlan, draftSolarWrite, reviewAndPlan } from "@eval-ai/ai-adapter";
import { DORI_LABEL, cctvSizing, checklistGlance, cleanDesign, cleanProjectPlan, cleanSolarDesign, isDesignJob, isSolarDesignJob, keyFindingsFor, kilo, solarSizing, type DesignProposal, type ReportInput, type ReportKeyFinding, type SolarDesign } from "@eval-ai/shared";
import { requireWriter } from "../../../../lib/auth";
import { aiError, aiGuard, aiRunHook, aiWorkspaceKey, loadAssessmentFacts } from "../../../../lib/aiRoute";
import { buildReportInputFromStoredFacts, getSnapshotLocal, listEvidenceLocal, listFindingsLocal } from "../../../../lib/store";
import { buildReportPhotos, type PhotoChoices, type SavedPhotoReview } from "../../../../lib/reportPhotos";

// Writing a whole report can take most of a minute.
export const maxDuration = 60;

// snapshotId: write the report for THIS draft, so it describes exactly what the draft shows (and not photos a reviewer removed).
// stage "analyze" (default): the key findings, executive summary, site overview and open items, from the saved record.
// stage "summary": only the executive summary and open items, from the key findings as the person has edited and saved them.
// stage "plan": the senior review and project plan (D-039), from the record and the draft's saved write-up.
// A new CCTV installation gets a design proposal instead of key findings (D-034), in two requests so each fits the minute:
//   stage "analyze" answers with the camera plan (`design` holding basis, approach and areas) and `continueWith: "designWrite"`;
//   stage "designWrite" takes that plan (`design`, as drafted or edited; else the draft's saved one) and writes the rest around it.
// A new solar installation gets a solar design and sizing proposal (D-036) the same way, with `solar` in place of `design`: the plan holds
// the loads and sizing inputs, and the app works out the sizes in code between the two steps.
const Body = z.object({
  assessmentId: z.string().min(1).max(100),
  snapshotId: z.string().max(100).optional(),
  stage: z.enum(["analyze", "summary", "designWrite", "plan"]).default("analyze"),
  /** designWrite only: the plan to write around. Checked with cleanDesign like any saved design. */
  design: z.unknown().optional(),
  /** designWrite only, for a solar job: the loads and inputs to size and write around. Checked with cleanSolarDesign. */
  solar: z.unknown().optional(),
});

/**
 * Draft the written part of a report: key findings (related observations, measurements and photos combined, with what they mean and what
 * to do), an executive summary, a site overview and open items. The text is a draft: it is returned to the editor, not stored here, and a
 * person must edit and sign off the report. Findings nobody has confirmed are only counted, never described.
 */
export async function POST(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  const limited = await aiGuard(auth, "report", 10);
  if (limited) return limited;
  try {
    const { assessmentId, snapshotId, stage, design: sentPlan, solar: sentSolar } = Body.parse(await req.json());
    if (stage === "summary" && !snapshotId) return NextResponse.json({ error: "Rewriting the summary needs a report draft" }, { status: 400 });
    const facts = await loadAssessmentFacts(auth.ctx, assessmentId);

    // One source of truth: the draft's saved report content, or (with no draft yet) the same builder the draft is made with.
    let input: ReportInput;
    if (snapshotId) {
      const draft = await getSnapshotLocal(snapshotId, auth.ctx);
      if (!draft || draft.assessmentId !== assessmentId) return NextResponse.json({ error: "That report draft was not found" }, { status: 404 });
      if (draft.finalized) return NextResponse.json({ error: "A finalized report can't be rewritten — create a new draft" }, { status: 409 });
      input = draft.payload;
    } else {
      const built = (await buildReportInputFromStoredFacts(assessmentId, {}, auth.ctx)).input;
      const { items: evidence } = await listEvidenceLocal(assessmentId, auth.ctx);
      const titleById = new Map(facts.items.map((i) => [i.id, i.title]));
      const ctx = facts.assessment.context;
      // Only photos the person chose to add (D-024), as notes only: no pictures are read for this.
      const photos = await buildReportPhotos(assessmentId, evidence, ctx.photoReview as Record<string, SavedPhotoReview> | undefined, titleById, ctx.photoChoices as PhotoChoices | undefined, { thumbnails: false });
      input = { ...built, photos };
    }

    const findings = await listFindingsLocal(assessmentId, auth.ctx);
    const glance = checklistGlance(input.checklist);
    const awaiting = findings.filter((f) => f.status === "needs_review").length;
    const goal = input.siteBrief?.goal ?? (typeof input.context.goal === "string" ? input.context.goal : undefined);
    const common = {
      workspaceId: aiWorkspaceKey(auth),
      assessmentId,
      siteName: input.siteName,
      mode: input.mode,
      pack: input.pack,
      scenario: facts.scenario,
      siteBrief: input.siteBrief,
      glance: {
        total: glance.total,
        checked: glance.checked,
        pass: glance.counts.pass,
        issue: glance.counts.fail,
        needsAttention: glance.counts.needs_attention,
        notApplicable: glance.counts.not_applicable,
        notChecked: glance.counts.not_checked,
        requiredNotChecked: glance.requiredOpen.length,
      },
      limitations: input.limitations,
      findingsAwaitingReview: awaiting,
    };
    const onRun = aiRunHook(auth, assessmentId);

    const designJob = isDesignJob(input.pack, facts.scenario);
    const solarJob = isSolarDesignJob(input.pack, facts.scenario);
    if (stage === "summary" && (designJob || solarJob)) return NextResponse.json({ error: "A design proposal has no findings to rewrite the summary from. Draft the design again instead." }, { status: 400 });
    if (stage === "designWrite" && !designJob && !solarJob) return NextResponse.json({ error: "Only a new installation has a design to write up" }, { status: 400 });

    if (stage === "summary") {
      const current = keyFindingsFor(input);
      const out = await draftReportSummary({ ...common, keyFindings: current.map((f) => ({ title: f.title, priority: f.priority, observed: f.observed, meaning: f.meaning, action: f.action })) }, { onRun });
      return NextResponse.json({ ...out, draft: true, stage, label: "AI draft — review and edit before saving" });
    }

    const covers = new Map(facts.items.map((i) => [i.title, i.instructions]));
    const record = {
      ...common,
      goal: goal?.slice(0, 1000),
      checklist: input.checklist.map((c) => ({ title: c.title, status: c.status, notes: c.notes, category: c.category, required: c.required, covers: covers.get(c.title) ?? undefined, measured: c.measured, answers: c.answers, evidenceCount: c.evidenceCount })),
      findings: input.findings.map((f) => ({ title: f.title, severity: f.severity, description: f.description, uncertainty: f.uncertainty })),
      measurements: input.measurements,
      materials: input.materials ?? [],
      photos: (input.photos ?? []).map((p) => ({ id: p.evidenceId, itemTitle: p.itemTitle, caption: p.caption, observations: p.observations, possibleIssues: p.possibleIssues.map((x) => x.text), cannotTell: p.cannotTell })),
    };

    if (stage === "plan") {
      if (!snapshotId) return NextResponse.json({ error: "The project plan needs a report draft" }, { status: 400 });
      const n = input.narrative ?? {};
      const out = await reviewAndPlan(record, { summary: n.summary, openItems: n.openItems, findings: keyFindingsFor(input).map((f) => ({ title: f.title, priority: f.priority, action: f.action })), ...(n.solar ? { sizing: sizingForAi(n.solar) } : {}) }, { onRun });
      const projectPlan = cleanProjectPlan({ holds: out.holds, phases: out.phases, source: "ai", model: out.model });
      if (!projectPlan) return NextResponse.json({ error: "The AI did not produce a usable project plan. Try again." }, { status: 502 });
      return NextResponse.json({ projectPlan, droppedHolds: out.droppedHolds, unverifiedFigures: out.unverifiedFigures, draft: true, stage, label: "AI draft — review and edit before saving" });
    }

    if (solarJob && stage === "designWrite") {
      const plan = cleanSolarDesign(sentSolar ?? input.narrative?.solar);
      if (!plan) return NextResponse.json({ error: "There is no load schedule to size yet. Draft the design first." }, { status: 400 });
      const out = await draftSolarWrite(record, { basis: plan.basis, loads: plan.loads, inputs: plan.inputs, placement: plan.placement }, sizingForAi(plan), { onRun });
      // The loads and inputs stay exactly as given; only the sections written around them are added.
      const solar = cleanSolarDesign({ ...out.rest, basis: plan.basis, loads: plan.loads, inputs: plan.inputs, placement: plan.placement }) ?? plan;
      return NextResponse.json({ summary: out.summary, siteOverview: out.siteOverview, solar, keyFindings: [], missingInformation: out.missingInformation, assumptions: out.assumptions, unverifiedFigures: out.unverifiedFigures, draft: true, stage, label: "AI draft — review and edit before saving" });
    }

    if (solarJob) {
      const out = await draftSolarPlan(record, { onRun });
      const solar = cleanSolarDesign(out.plan);
      if (!solar) return NextResponse.json({ error: "The AI did not produce a usable load schedule. Try again." }, { status: 502 });
      return NextResponse.json({ solar, keyFindings: [], continueWith: "designWrite", draft: true, stage, label: "AI draft — review and edit before saving" });
    }

    if (designJob && stage === "designWrite") {
      const plan = cleanDesign(sentPlan ?? input.narrative?.design);
      if (!plan) return NextResponse.json({ error: "There is no camera plan to write up yet. Draft the design first." }, { status: 400 });
      const out = await draftDesignWrite(record, { basis: plan.basis, approach: plan.approach, areas: plan.areas, system: plan.system }, cctvSizingForAi(plan), { onRun });
      // The plan stays exactly as given; only the sections written around it are added.
      const design = cleanDesign({ ...out.rest, basis: plan.basis, approach: plan.approach, areas: plan.areas, system: plan.system }) ?? plan;
      return NextResponse.json({ summary: out.summary, siteOverview: out.siteOverview, design, keyFindings: [], missingInformation: out.missingInformation, assumptions: out.assumptions, unverifiedFigures: out.unverifiedFigures, draft: true, stage, label: "AI draft — review and edit before saving" });
    }

    if (designJob) {
      const out = await draftDesignPlan(record, { onRun });
      const design = cleanDesign({ ...out.plan, options: [], equipment: [], installation: [], openItems: [], nextSteps: [] });
      if (!design) return NextResponse.json({ error: "The AI did not produce a usable camera plan. Try again." }, { status: 502 });
      return NextResponse.json({ design, keyFindings: [], continueWith: "designWrite", draft: true, stage, label: "AI draft — review and edit before saving" });
    }

    const out = await draftReportNarrative(record, { onRun });
    // The adapter already checked every field and source; the web app's type settings just make zod's result look optional.
    const keyFindings = out.keyFindings.map((f, i) => ({ id: `f${i + 1}`, ...f, source: "ai" })) as ReportKeyFinding[];
    return NextResponse.json({ ...out, keyFindings, draft: true, stage, label: "AI draft — review and edit before saving" });
  } catch (e) {
    return aiError(e);
  }
}

/** The app's sizing as the write-up model sees it: the figures it may quote, in the units a client reads. */
function sizingForAi(plan: SolarDesign): Record<string, unknown> {
  const s = solarSizing(plan);
  return {
    systemType: plan.inputs.systemType,
    dailyEnergy: kilo(s.dailyWh, "Wh") + " per day",
    expectedPeakLoad: kilo(s.peakW, "W"),
    inverter: kilo(s.inverterW, "W") + " continuous, " + kilo(s.surgeW, "W") + " surge",
    array: `${s.panelCount} panels of ${plan.inputs.panelWatts.value} W, ${kilo(s.arrayWp, "Wp")}`,
    expectedDailyProduction: kilo(s.dailyProductionWh, "Wh") + " per day",
    battery: s.batteryNominalWh > 0 ? `${kilo(s.batteryNominalWh, "Wh")} at ${plan.inputs.batteryVoltage.value} V (${Math.round(s.batteryAh)} Ah)` : "none (grid-tied)",
    largestLoads: s.loadShares.slice(0, 4).map((l) => `${l.name}: ${Math.round(l.share * 100)}% of daily energy`),
  };
}

/** The app's CCTV sizing (D-037) as the write-up model sees it: the figures it may quote, and the cameras that fall short of their detail. */
function cctvSizingForAi(plan: DesignProposal): Record<string, unknown> {
  const z = cctvSizing(plan);
  return {
    cameras: z.totalCameras,
    bandwidth: `${Math.round(z.bandwidthMbps * 10) / 10} Mbps`,
    storage: `${Math.round(z.storageWithHeadroomTb * 10) / 10} TB for ${z.system.retentionDays.value} days (${z.drives} x ${z.system.driveTb.value} TB drives)`,
    recorder: `${z.recorderChannels} channels`,
    poe: z.switches.map((w) => `${w.area}: ${w.poeW} W on a ${w.ports}-port switch`),
    ups: `${z.upsVa} VA for ${z.system.upsMinutes.value} minutes`,
    camerasShortOfDetail: z.failing.map((c) => `${c.id} needs ${DORI_LABEL[c.detail]} at ${c.distanceM} m but reaches ${c.achieved ? DORI_LABEL[c.achieved] : "less than Detect"}`),
  };
}
