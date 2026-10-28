# EvalAI Product Requirements

## 1. Product vision

EvalAI is a site-assessment and inspection platform that helps
individuals and teams understand site conditions, follow structured
checklists, capture evidence, record measurements, document findings,
plan materials, optionally attach supplier quotations, and produce
professional reports.

The product should help technicians collect the right information while
on site, not merely write a report after the visit.

## 2. Initial workflow packs

-   **Solar:** new installations, existing systems, upgrades, repairs,
    and mixed projects.
-   **CCTV:** new installations, existing systems, upgrades, repairs,
    and mixed projects.

The core engine must be reusable so additional industries can be added
later without creating separate applications for each industry. Do not
build every industry in the initial release.

## 3. Two primary modes

### Assessment Mode --- evaluate and plan

Purpose: - understand the job, requested outcome, constraints, and
existing conditions; - ask clarifying questions before proposing a
checklist; - identify information and measurements still needed; -
evaluate evidence and potential needs; - develop findings,
recommendations, and a traceable optional materials schedule; - generate
an assessment report.

### Inspection Mode --- check and verify

Purpose: - inspect a site or system against a defined checklist, scope,
specification, or user-provided requirements; - record item-by-item
outcomes, observations, measurements, photos, and voice notes; -
document defects, unknowns, missing evidence, and corrective actions; -
distinguish checked items from items not checked; - generate an
inspection report.

Inspection Mode must not imply formal certification or regulatory
approval unless a separately authorized and validated process is
explicitly implemented.

## 4. Shared capabilities

Both modes should reuse: - user authentication and individual/team
workspaces; - workspace membership and role-based permissions; - sites
and job context; - versioned workflow packs and editable checklists; -
evidence capture and linking; - voice notes and voice interaction where
supported; - measurements and deterministic calculations; -
user-requested AI analysis; - findings, recommendations, and corrective
actions; - optional materials lists and supplier quotations; - draft
saving and resume; - report generation from a versioned snapshot; -
audit events and access controls.

## 5. Core user journeys

1.  Create or open a workspace and site.
2.  Start an Assessment or Inspection and choose Solar or CCTV.
3.  Describe purpose, scope, scenario, existing equipment, and
    constraints.
4.  Answer focused clarification questions; explicitly record unknowns.
5.  Review and edit the proposed checklist.
6.  Complete checklist items and attach observations, evidence, voice
    notes, and measurements.
7.  Request AI analysis when useful; review, edit, accept, or reject
    suggestions.
8.  Review completeness, unresolved questions, and limitations.
9.  Choose a report without materials, or request a materials schedule.
10. If a materials schedule is requested, either generate the report now
    or save and return after obtaining supplier quotations.
11. Review and finalize a report tied to exact versions of the
    assessment and any included materials/quotes.

## 6. Checklist outcomes

Support the following semantic outcomes, adapting labels to the UI: -
Pass - Issue Found / Fail - Needs Attention - Not Applicable - Not
Checked

An item must not be marked Pass simply because no issue was observed in
incomplete evidence. "Not Checked" and "Unknown" must remain
distinguishable from "Pass."

## 7. Evidence requirements

Support photos, text notes, voice notes/audio where stable and
supported, uploaded files where permitted, and manual measurements. Link
evidence to the relevant assessment, checklist item, finding, or
corrective action.

Preserve original evidence and provenance. AI analysis must not silently
overwrite the user's original observation or measurement.

## 8. Voice and camera requirements

### Initial-release goals

-   Voice notes can be recorded or attached where the target platform
    supports it.
-   Voice input can be used to dictate observations and interact with
    the workflow.
-   Transcription is editable and clearly marked as machine-generated
    until confirmed.
-   Spoken AI responses should be enabled if a suitable, verified
    implementation is available.
-   Photos can be captured or uploaded and linked to a relevant item.
-   Users can request analysis of a photo when the provider and model
    have been verified for image input.

### Future capability

-   Continuous live-camera AI guidance is labelled **Coming Soon** until
    the provider, streaming/frame strategy, mobile permissions, privacy
    behavior, latency, reliability, and acceptance tests have been
    validated.

## 9. Materials and quotations

A materials schedule is not a supplier quotation. Each item should
include description, specification, quantity and unit, rationale,
source/provenance, related findings or measurements, assumptions, and
verification status.

Quantities must derive from verified measurements, explicit user inputs,
deterministic calculations, or documented rules. If critical inputs are
missing, ask questions or mark the quantity provisional. Do not invent
exact quantities, prices, supplier availability, or quotations.

When a materials list changes after a quotation is attached, flag the
quote for review because it may no longer match the current list.

## 10. Reports

Reports may include: - site and job context; - scope and
assessment/inspection mode; - workflow pack and checklist outcomes; -
findings, recommendations, and corrective actions; - evidence references
and measurements; - assumptions, missing information, and limitations; -
optional materials schedule; - supplier quotation information only when
supplied and checked; - review/approval details and report version.

Finalized reports must refer to a stable snapshot. Later changes to the
live assessment must not silently change an already finalized report.

## 11. Non-goals for the initial release

-   Continuous live-camera AI guidance.
-   Smart glasses or augmented reality.
-   Treating unvalidated photo-based dimensions as verified
    measurements.
-   A supplier marketplace or unverified live price scraping.
-   Automated safety certification or replacement of qualified
    professional judgment.
-   Every possible industry workflow.
-   Advanced enterprise billing unless separately approved.

## 12. Product quality principles

-   Context before checklist.
-   Evidence before conclusions.
-   Unknown is better than fabricated.
-   Human review for AI-generated findings and recommendations.
-   Reliable manual workflow when AI is unavailable.
-   Clear distinction between planned, implemented, tested, and verified
    capabilities.
-   Accessible, usable interfaces on supported mobile and web platforms.
