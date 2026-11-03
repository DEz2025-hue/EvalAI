# EvalAI Feature Status

**Status rule:** This file must reflect the real repository and verified
tests. The descriptions below define intended status before repository
audit; they do not prove implementation is complete.

## Planned product status

  -------------------------------------------------------------------------
  Capability                Intended status         Verification required
  ------------------------- ----------------------- -----------------------
  Authentication and        Required core           Audit current
  workspaces                                        implementation and
                                                    tenant boundaries

  Assessment Mode           Required initial        End-to-end workflow
                            release                 

  Inspection Mode           Required initial        Distinct workflow and
                            release                 report behavior

  Solar workflow pack       Initial release         Context, checklist,
                                                    evidence, reporting
                                                    tests

  CCTV workflow pack        Initial release         Context, checklist,
                                                    evidence, reporting
                                                    tests

  Editable checklists       Initial release         UI and persistence
                                                    tests

  Photo capture/upload      Initial release         Platform, storage, and
                                                    authorization tests

  AI photo analysis         Initial-release goal    Verify provider/model
                                                    image support and test
                                                    with synthetic data

  Voice notes               Initial-release goal    Verify platform
                                                    recording and secure
                                                    storage

  Voice                     Initial-release goal    Verify
  dictation/transcription   where supported         provider/platform
                                                    support, accuracy,
                                                    editing, and fallback

  Spoken AI replies         Initial-release goal if Verify
                            reliably supported      provider/platform
                                                    support and latency

  Continuous live-camera AI Coming Soon             Requires separate
  guidance                                          implementation and
                                                    release gate

  Manual measurements and   Initial release         Unit and integration
  deterministic                                     tests
  calculations                                      

  AI analysis on request    Initial release         Server-side adapter,
                                                    validation, failure
                                                    tests

  Materials schedule        Initial release         Traceability and
                                                    provisional-quantity
                                                    tests

  Supplier quotations       Initial release if in   Provenance and
                            scope of current build  stale-quote tests

  Report without materials  Initial release         End-to-end test
  list                                              

  Report                    Initial release         Immutability test
  snapshot/versioning                               

  Reusable template         Deferred                Separate product
  management across                                 decision
  industries                                        

  Smart glasses/AR          Deferred                Separate product
                                                    decision

  Automated safety          Not supported           Must not be implied by
  certification                                     reports
  -------------------------------------------------------------------------

## Actual repository audit — 2026-10-29 — Phase 2 complete

  ----------------------------------------------------------------------------------------------------------------
  Feature                        Actual state      Evidence                         Gaps
  ------------------------------ ----------------- -------------------------------- -------------------------------
  Repository inventory           Implemented+Tested pnpm monorepo + next build       Mobile Expo not yet built
                                                 15 routes + middleware 27kB,       — add expo build after web
                                                 tsc --noEmit passed,              verified
                                                 vitest suites (manual pass, EPERM
                                                 Temp sandbox workaround noted)

  Authentication/authorization   Partial→Tested   migrations 0001-0003, RLS,       Need live Supabase project for
                                                 middleware, validations,           cross-workspace e2e denial test
                                                 /api/assessments workspaceId+RLS
                                                 no secrets in client build

  Assessment Mode                Implemented      PACK_TEMPLATES, /assessments/new   Live DB resume e2e pending env
                                                 + [id] with ContextForm,          — demo fallback keeps workflow
                                                 ChecklistSummary (not_checked≠pass) walkable without DB
                                                 MeasurementsPanel, PhotoCapture,
                                                 VoiceRecorder, draft/resume via
                                                 /api/assessments + /api/checklist

  Inspection Mode                Implemented      /inspections/new + [id] page,     Same as above — shares engine
                                                 same ContextForm/Checklist/         but distinct Inspection Report
                                                 Evidence/Measurements engine,      title & certification disclaimer
                                                 distinct labels & report title

  Solar/CCTV packs               Implemented      packs.ts + both packs in UI,       Live Spark checklist proposal
                                                 editable checklist, shared engine  verified via fallback template

  Voice                          Partial         VoiceRecorder.tsx (visible mic,     Need live Voice Transcribe key
                                                 duration, stop/cancel, edit,       — device test pending
                                                 unconfirmed transcript)

  Photo analysis                 Partial         PhotoCapture.tsx + private upload   Need live image model verify
                                                 + /api/ai/analyze-image (limits)   — synthetic test pending
                                                 + SAM 3.1 optional

  Reports                        Partial→Impl.    /assessments/[id]/report +        Need Storage private bucket +
                                                 /api/reports/pdf (pdf-lib          signed URL for artifact
                                                 deterministic) + ReportActions,     + finalize immutability e2e
                                                 HTML preview via reportHtml.ts

  Secrets exposure scan          Passed          .env.example only, no AI key in    Built artifact scan after Vercel
                                                 client, adapter server-only,       deploy
                                                 build passed with no leak

  AI adapter (Wonder/Spark/Voice) Partial        Meta fetch, zod, timeouts/        Live Meta verification pending
                                                 retries/redacted, fallback         — model IDs + synthetic test
                                                 labelled

  Materials/Quotations           Implemented      0003 migration, MaterialsList,     Live stale-trigger e2e pending
                                                 QuotationReview, /api/materials/   — version bump → stale flag
                                                 quotations, stale trigger

  AI materials proposal (D-029)  Implemented      materialRules.ts (7 rules),        Live output read once on Meta
                                                 proposeMaterials, /api/ai/         (not scored by a person);
                                                 materials, web + phone review,     migration 0016 to apply
                                                 report rendering, eval set

  Office report style (D-031)    Implemented      reportTemplate.ts, 0017 migration,    Migration 0017 applied; Settings tried;
                                                 /api/report-template, Settings card,   draft and PDF in new style tried (no logo);
                                                 HTML + PDF rendering                   phone does not edit the style

  Site interview (D-030)         Implemented      interview.ts (shared), interview ops,  Live model + Meta voice not yet
                                                 /api/ai/interview(+digest), phone      tried; phone not run on a device;
                                                 InterviewSession, web                  expo-speech needs a rebuild
                                                 InterviewPanel, report section

  Deterministic calculations     Tested          measurements.test.ts +              Vitest EPERM sandbox Temp — manual
                                                 checklist.test.ts + manual node    deterministic checks PASS
                                                 tsc + build green

  Photo length estimate          Implemented     PhotoMeasureModal (mobile),        Unit-tested; UI checked on web with a
  (reference object, SAM-assisted)               /api/ai/segment, shared             synthetic photo. NOT checked on a phone,
                                                 photoMeasure.ts, D-014              against a live SAM response, or for real
                                                                                     accuracy. Always labelled an estimate.

  Findings-first report (D-027, D-028)   Implemented (web, mobile, PDF) reportHtml.ts, reportOverview.ts,   Unit, route, adapter, PDF, store and guard tests; an
                                                 keyFindings.ts, reportDraft.ts,      evaluation set of 6 made-up jobs with automated checks.
                                                 pdf.ts, /api/ai/report-draft,        The written text was NOT read on a live model (no
                                                 ReportView, KeyFindingsEditor,       purchased AI credit); not tried in the browser or on a
                                                 ReportPhotoSteps, report.tsx         phone. Web now has the photo steps.

  Photo choice + preview before download (D-024) Implemented (mobile + web gate) ReportPhotoChoices, report-preview,     Unit, route, guard tests; chooser run in the browser with
                                                 reportGate.ts, photo-choices route    fakes. WebView not seen on a phone. Lock is in the app
                                                                                      screens, not the server.

  Live session walks the checklist (D-023) Implemented (mobile) liveWalk.ts, LiveSession Now card,   Unit, guard tests and a browser run with fakes; coverage
                                                 setItemStatus, coverage hint         hint checked once with a synthetic picture. Not tried on
                                                                                      a phone.

  Simple answer fields on items (D-042)   Implemented          itemFields.ts, migration 0018,       Unit, route and browser (demo mode) tested. Phone
                                                 ItemFieldsForm, ItemFieldsMobile     form not tried on a device; migration must be
                                                                                      applied before the code is deployed.

  Project plan and Wonder review (D-039)  Implemented          projectPlan.ts, planReview.ts,       Unit, route, PDF and browser (demo mode) tested;
                                                 report-draft stage "plan",           review run live on made-up data on Wonder (503,
                                                 ProjectPlanEditor.tsx                55 s timeout, 30 s, 28 s). Not tried on a phone;
                                                                                      plan is read-only there.

  Report reads the photos (D-022)        Implemented (mobile) reportPhotos.ts, photoReview,         Unit, route, PDF and guard tested; whole pipeline run
                                                 /api/ai/report-photos, report.tsx   once with synthetic pictures (~2 cents, ~25 s).
                                                                                      Not tried on a phone or with real site photos.

  Guided checklist + site intake (D-021) Implemented (mobile) packs.ts LOOK_FOR, siteIntake,     Unit, route and guard tested; one real-model check
                                                 /api/ai/site-intake, SiteIntake.tsx  with a synthetic picture. Not tried on a phone
                                                                                      or judged by a technician. No web intake.

  Delete a job (draft or finished, D-020) Implemented  migration 0015, DELETE route,      Database rules tested in a rolled-back
                                                 mobile + web Danger zone            transaction; route and guard tested. Migration
                                                                                      NOT applied yet; UI not checked signed in.

  Site situation (new install / existing, D-019) Implemented  scenario.ts, checklistFor,       Unit and route tested. Not checked on a phone
                                                 create + job screens (mobile, web),  or against the live model; upgrade/repair
                                                 AI prompts, report header            situations not built.

  Live session (stills + narration, D-017) Beta (mobile)  LiveSession, useNarration,      Unit-tested with mocked provider. NOT
                                                 usePhoneCamera, liveSource,
                                                 liveNarration.ts, itemNotes.ts
  Live session (periodic + manual frames)  Beta (mobile)  LiveSession, usePhoneCamera,   Unit-tested with mocked provider. NOT
                                                 liveSource, /api/ai/live-frame,     verified on a phone or against the live
                                                 shared liveSession.ts, D-015        provider. Device checklist: TEST_PLAN s8.

  Meta glasses as a live frame source   Design only    FrameSource contract, D-016          Not built: Meta's toolkit is a
                                                                                         developer preview, cannot publish yet.

  Live camera guidance (real-time video, web) Coming Soon  Labelled as Coming Soon in UI  Not implemented (D-005, D-015)
  ----------------------------------------------------------------------------------------------------------------

  Phase 2 exit gate: user can complete & resume basic assessment & inspection without AI — achieved via demo fallback + Supabase-ready persistence (workspaceId+RLS when env set).

## Status vocabulary

-   **Implemented:** code exists and integrates into the application.
-   **Tested:** relevant tests have actually run successfully.
-   **Verified:** tested against the required real
    platform/provider/environment.
-   **Partial:** some required behavior exists, with known gaps.
-   **Planned:** specified but not implemented.
-   **Blocked:** cannot proceed until a dependency or decision is
    resolved.
-   **Coming Soon:** visible product placeholder for a future capability
    that is not available to users.
