import { z } from "zod";
import { getAdapterConfig } from "./config";
import { AiAdapterError } from "./client";
import { situationHint } from "./situation";
import { chatJson, type CallOptions } from "./chat";
import { reportDraftSchema, reportSummarySchema } from "./jsonSchemas";
import { DraftReportInput, DraftReportOutput, DraftSummaryInput } from "./schemas";
import { SYSTEM_GUARD, compact } from "./text";
import { findUnverifiedFigures } from "./figures";
import { capText, cleanKeyFindings, sentencesOf, withoutRepeats } from "./keyFindings";

// The report write-up (D-027, D-028). The AI turns the saved record into a few KEY FINDINGS (interpret, synthesize, communicate) plus a
// short executive summary, site overview and open items. Everything is a draft for a person to edit and sign off.

export { capText } from "./keyFindings";

/** Longest text kept for each written section. The same limits the report editor and the save route enforce (NARRATIVE_SECTIONS in shared). */
export const REPORT_SECTION_MAX = { summary: 5000, siteOverview: 5000, openItems: 5000 } as const;

const blank = (s: unknown) => (typeof s === "string" ? s.trim() : "");
const list = (a: unknown) => (Array.isArray(a) ? a : []).map(blank).filter(Boolean).slice(0, 20);

/** The rules for the findings analysis. Exported so tests can check the guard rails are present. */
export const REPORT_ANALYST_PROMPT =
  " You are the analyst writing a professional site report for the client from the technician's saved record of the visit: checklist results and notes, measurements, confirmed findings, the site brief, and descriptions of the photos. " +
  "Your job is to INTERPRET the evidence, SYNTHESIZE it into a few technical findings, and COMMUNICATE them clearly. " +
  "Interpret: work out what the recorded results, notes and photos imply for this job and for the client's decision. " +
  "Synthesize: combine related observations (several checklist items, a note, a measurement and the photos that show the same thing) into ONE finding instead of repeating them across findings. Each piece of evidence has one main home; refer to it elsewhere only briefly. Aim for 3 to 8 findings, highest priority first; use more only when the record truly holds more distinct issues. Include every confirmed finding. " +
  "Communicate: plain professional third-person language in complete sentences. Technicians' notes are often terse (for example 'tree NW, rust edge'): expand them into proper sentences without adding facts that are not in the record. " +
  "key_findings: each has a title; a priority (high = safety, damage, or something that blocks the work; medium = should be fixed or confirmed before or during the work; low = minor; info = context for the reader); " +
  "observed = what was recorded or can be seen, as facts, citing photos as 'Photo 2'; " +
  "meaning = what it implies and why it matters, which MAY draw on general technical knowledge of the trade, written as general explanation (for example 'an unbonded metal frame can become live in a fault') and never as a claim about this site beyond the data; " +
  "action = one concrete next step, worded as check, confirm, repair, or have a qualified person assess, never as a verdict. " +
  "Give each finding its sources: item_titles (checklist item titles exactly as supplied), photo_numbers (the number of each photo in photoNotes), measurement_names, and finding_titles (confirmed findings exactly as supplied). A finding with no source is not allowed unless its priority is info. " +
  "summary: 120 to 220 words for a busy reader: what was assessed (siteBrief and situation), the overall picture, the top priorities and the main next step. For the overall picture give the number of items checked out of the total and how many required items are still not checked, exactly as supplied, in one plain sentence; do not read out every count in the glance. Do NOT repeat the text of the findings; say what they add up to. " +
  "site_overview: one or two short paragraphs on the site and scope from siteBrief. Do not repeat the checklist, and do not repeat any sentence or fact already stated in the summary: if the summary says where the board is or how the roof is reached, say something new here or keep it short. " +
  "open_items: what is unknown or still to do (unchecked items, limits noted at intake, how many findings still await review, provisional materials, assumptions you made). Do not restate findings or repeat sentences from the summary. " +
  "Each sentence appears in only one of summary, site_overview and open_items. " +
  "missing_information: the few facts that would most improve the report. assumptions: assumptions you made (normally none). " +
  "Rules: never add site facts, measurements, sizes, capacities, ages, counts, prices or compliance statements that are not in the data. Do not name standards, codes or clause numbers. Use numbers only as supplied (glance, measurements, notes). " +
  "An item that is Not Checked has not been checked: never describe it as fine or done; mention it only as something still to do. Word it as something still to be carried out ('the load audit is still to be carried out'), never as 'complete the missing' or 'finish' an audit, which suggests it was started. Not applicable means it does not apply on this site. " +
  "Do not use the words 'compliance', 'compliant' or 'complies' at all, even to say something was not assessed; say 'not assessed' instead. " +
  "findingsAwaitingReview is only a count of findings nobody has confirmed: say how many are waiting and never guess what they say. " +
  "covers on a checklist item says what that item is about. It is guidance, not something that was observed. " +
  "situation says whether this is a new installation (what the recorded site conditions mean for the work) or an existing system (its recorded condition). " +
  "siteBrief.interview holds what the person said when interviewed about the job. These are STATEMENTS, not verified facts: you may use them, written as 'the client reported' or 'it was said that', but never as confirmed, and never to change or contradict a checklist outcome or a measurement. " +
  "photoNotes are UNVERIFIED descriptions an AI wrote from the job's photos. You may use them in a finding's observed text, saying 'Photo 2 appears to show' or 'the photos suggest', and you should recommend that a qualified person check any possible issue in them. " +
  "Never present a photo note as a confirmed finding, never use one to change or contradict a checklist outcome, and never state a measurement, count or rating that comes from a photo.";

/** The rules for rewriting the summary from findings the person has already edited. */
export const REPORT_SUMMARY_PROMPT =
  " You are finishing a professional site report. The keyFindings are final: the person has edited them, so treat them as authoritative and do not contradict or re-argue them. " +
  "summary: 120 to 220 words for a busy reader: what was assessed (siteBrief and situation), the overall picture, the top priorities and the main next step. For the overall picture give the number of items checked out of the total and how many required items are still not checked, exactly as supplied, in one plain sentence; do not read out every count in the glance. Do NOT repeat the text of the findings; say what they add up to. " +
  "open_items: what is unknown or still to do (limitations, unchecked items, limits noted at intake, how many findings still await review). Do not restate findings or repeat sentences from the summary. Do not use the words 'compliance', 'compliant' or 'complies'. " +
  "Rules: never add site facts, measurements, sizes, capacities, ages, counts, prices or compliance statements that are not in the data. Do not name standards, codes or clause numbers. Use numbers only as supplied. " +
  "An item that is Not Checked has not been checked: never describe it as fine or done. findingsAwaitingReview is only a count: say how many are waiting and never guess what they say. Plain professional third-person language.";

export async function draftReportNarrative(input: z.input<typeof DraftReportInput>, options?: CallOptions) {
  const v = DraftReportInput.parse(input);
  const cfg = getAdapterConfig();
  // Photos are cited by their number in this list; the evidence id is how a number is turned back into the photo.
  const photoNotes = v.photos.map((p, i) => ({ number: i + 1, itemTitle: p.itemTitle, caption: p.caption, observations: p.observations, possibleIssues: p.possibleIssues, cannotTell: p.cannotTell }));
  const facts = { siteBrief: v.siteBrief ?? {}, glance: v.glance, checklist: v.checklist, confirmedFindings: v.findings, findingsAwaitingReview: v.findingsAwaitingReview, measurements: v.measurements, limitations: v.limitations, materials: v.materials, photoNotes };
  const { data } = await chatJson(
    cfg,
    "draftReport",
    {
      system: SYSTEM_GUARD + REPORT_ANALYST_PROMPT,
      user: JSON.stringify({
        task: "draftReport",
        siteName: v.siteName,
        mode: v.mode,
        pack: v.pack,
        situation: situationHint(v.scenario),
        goal: v.goal,
        siteBrief: compact(facts.siteBrief),
        glance: facts.glance,
        checklist: compact(v.checklist),
        confirmedFindings: compact(v.findings),
        findingsAwaitingReview: v.findingsAwaitingReview,
        measurements: compact(v.measurements),
        limitations: compact(v.limitations),
        materials: compact(v.materials),
        photoNotes: compact(photoNotes),
      }),
      schemaName: "report_draft",
      schema: reportDraftSchema(),
    },
    options,
  );
  const raw = data as Record<string, unknown> & { key_findings?: unknown; missing_information?: unknown; assumptions?: unknown };
  const { findings, dropped } = cleanKeyFindings(raw.key_findings, {
    items: v.checklist.map((c) => c.title),
    photoIds: v.photos.map((p) => p.id ?? ""),
    measurements: v.measurements.map((m) => m.name),
    findings: v.findings.map((f) => f.title),
  });
  // The findings are the primary home of every fact: the summary and open items must not re-tell them.
  const told = findings.flatMap((f) => [f.observed, f.meaning, f.action].flatMap(sentencesOf));
  const summary = capText(withoutRepeats(blank(raw.summary), told), REPORT_SECTION_MAX.summary);
  if (!summary) throw new AiAdapterError("The AI did not produce a summary", "invalid_response");
  const siteOverview = capText(withoutRepeats(blank(raw.site_overview), told), REPORT_SECTION_MAX.siteOverview);
  const openItems = capText(withoutRepeats(blank(raw.open_items), told), REPORT_SECTION_MAX.openItems);
  // D-010: flag any figure with a unit, % or amount that is not in the facts the model was given.
  const written = [summary, siteOverview, openItems, ...findings.flatMap((f) => [f.observed, f.meaning, f.action])].join("\n\n");
  const unverifiedFigures = findUnverifiedFigures(written, [facts, v.siteName, v.goal]);
  return DraftReportOutput.parse({ summary, siteOverview, keyFindings: findings, droppedFindings: dropped, openItems, missingInformation: list(raw.missing_information), assumptions: list(raw.assumptions), unverifiedFigures, requiresHumanReview: true });
}

/** Rewrite the executive summary and open items from the findings as they stand now (after the person's edits). */
export async function draftReportSummary(input: z.input<typeof DraftSummaryInput>, options?: CallOptions) {
  const v = DraftSummaryInput.parse(input);
  const cfg = getAdapterConfig();
  const facts = { siteBrief: v.siteBrief ?? {}, glance: v.glance, keyFindings: v.keyFindings, limitations: v.limitations, findingsAwaitingReview: v.findingsAwaitingReview };
  const { data } = await chatJson(
    cfg,
    "draftReport",
    {
      system: SYSTEM_GUARD + REPORT_SUMMARY_PROMPT,
      user: JSON.stringify({
        task: "draftReportSummary",
        siteName: v.siteName,
        mode: v.mode,
        pack: v.pack,
        situation: situationHint(v.scenario),
        siteBrief: compact(facts.siteBrief),
        glance: facts.glance,
        keyFindings: compact(v.keyFindings),
        limitations: compact(v.limitations),
        findingsAwaitingReview: v.findingsAwaitingReview,
      }),
      schemaName: "report_summary",
      schema: reportSummarySchema(),
    },
    options,
  );
  const raw = data as Record<string, unknown>;
  const told = v.keyFindings.flatMap((f) => [f.observed, f.meaning, f.action].flatMap(sentencesOf));
  const summary = capText(withoutRepeats(blank(raw.summary), told), REPORT_SECTION_MAX.summary);
  if (!summary) throw new AiAdapterError("The AI did not produce a summary", "invalid_response");
  const openItems = capText(withoutRepeats(blank(raw.open_items), told), REPORT_SECTION_MAX.openItems);
  const unverifiedFigures = findUnverifiedFigures([summary, openItems].join("\n\n"), [facts, v.siteName]);
  return { summary, openItems, unverifiedFigures, requiresHumanReview: true as const };
}
