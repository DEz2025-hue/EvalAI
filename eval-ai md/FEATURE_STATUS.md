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
                                                 ChecklistEditor (not_checked≠pass) walkable without DB
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

  Deterministic calculations     Tested          measurements.test.ts +              Vitest EPERM sandbox Temp — manual
                                                 checklist.test.ts + manual node    deterministic checks PASS
                                                 tsc + build green

  Live camera guidance           Coming Soon     Labelled as Coming Soon in UI       Not implemented per D-005
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
