# EvalAI Decision Log

Record material product and architecture decisions here. Update affected
documents when a decision changes.

## Confirmed product direction

### D-001 --- Two primary modes

**Decision:** EvalAI must support distinct Assessment Mode and
Inspection Mode.

**Rationale:** Assessment evaluates site needs and helps plan work.
Inspection systematically checks a site or system against a checklist or
requirements and documents outcomes, defects, and corrective actions.

**Consequences:** Shared engine and evidence services, but mode-specific
prompts, checklist framing, navigation labels, and report titles.

### D-002 --- Initial workflow packs

**Decision:** Solar and CCTV are the initial workflow packs.

**Consequences:** Design reusable workflow-pack abstractions, but do not
attempt to build every industry in the initial release.

### D-003 --- Voice is an initial-release goal

**Decision:** Voice must not be presented solely as Coming Soon.

**Minimum expected behavior:** voice notes and voice input/dictation
where supported, clear recording controls, editable transcripts when
available, privacy disclosure, and text fallback.

**Constraint:** Continuous two-way spoken AI conversation depends on
verified provider/platform capability. Do not claim it works until
tested.

### D-004 --- Photo capture and user-requested photo analysis

**Decision:** Photo capture/upload is an initial-release goal. AI
analysis of submitted photos is enabled only after provider/model image
support is verified.

**Constraint:** AI visual output is a suggestion; do not present hidden
conditions or unvalidated dimensions as facts.

### D-005 --- Live camera guidance is future scope

**Decision:** Continuous live-camera AI guidance is labelled Coming Soon
until implemented and verified.

**Future decision needed:** select manual frames, periodic frames, or
provider-supported real-time video after capability testing.

### D-006 --- AI is user-directed and reviewable

**Decision:** AI analysis runs when requested, except explicit
interactive voice features. AI-generated findings remain drafts until
reviewed. Core manual capture and saved-fact report generation must work
without AI.

### D-007 --- Repository-first implementation

**Decision:** Audit the current repository and preserve working
architecture where possible. No wholesale rewrite without evidence and a
documented decision.

### D-008 --- Security-first secrets management

**Decision:** Secrets must remain server-side and must never be exposed
in frontend code, client bundles, public configuration, logs, errors, or
documentation.

### D-009 --- Reports are versioned

**Decision:** Finalized reports use immutable snapshots referencing the
exact assessment, materials, and quotation versions included.

### D-010 --- No fabricated facts or quotes

**Decision:** AI and application logic must not invent measurements,
equipment specifications, quantities, supplier prices, or quotations.
Missing critical information must be requested or clearly marked
unknown/provisional.

### D-011 --- Technology stack (Q1)

-   **Status:** Confirmed — 2026-10-28
-   **Decision:** Web: Next.js + TypeScript. Mobile: Expo React Native + TypeScript. Monorepo: pnpm. Backend: Supabase (PostgreSQL, Auth, private Storage, RLS). Hosting: Vercel. AI via secure server-side adapter.
-   **Context and evidence:** Repository audit 2026-10-28 found empty greenfield (no package.json, no src, no .git, only `eval-ai md` docs). No existing stack to preserve. User confirmed Q1 choices.
-   **Alternatives considered:** Single-app (web only) vs monorepo; Supabase vs Firebase. Chose monorepo + Supabase per docs candidate and user direction.
-   **Security/privacy impact:** Server-side Supabase service-role isolation, RLS deny-by-default, private Storage with signed URLs, Vercel env secrets server-only.
-   **Consequences:** Scaffold `pnpm-workspace.yaml`, `apps/web`, `apps/mobile`, `packages/shared`, Supabase migrations, Vercel deployment, pnpm as package manager.
-   **Documents updated:** ARCHITECTURE.md, IMPLEMENTATION_PLAN.md, REPOSITORY_AUDIT.md, FEATURE_STATUS.md.

### D-012 --- First build scope (Q2)

-   **Status:** Confirmed — 2026-10-28
-   **Decision:** Phase 1 security foundation first, then working Solar assessment workflow, followed by CCTV. Integrate real Meta AI early. Implement job creation, editable checklists, findings, photo evidence, save/resume drafts, deterministic calculations, PDF + HTML preview reports with versioned snapshots. Voice and photo analysis are initial-release; live continuous AI camera stays Coming Soon.
-   **Context and evidence:** IMPLEMENTATION_PLAN.md phases 1-6; user directed real models early, no mock AI as primary.
-   **Security/privacy impact:** Workspace-scoped RLS, private evidence, report snapshot immutability must be enforced before feature polish.
-   **Consequences:** Prioritize Solar pack; build Assessment mode first, Inspection mode shares engine; keep CCTV second; PDF generation from versioned snapshots.
-   **Documents updated:** IMPLEMENTATION_PLAN.md, FEATURE_STATUS.md, SCREEN_SPECIFICATIONS mapping.

### D-013 --- Meta AI models and security (Q3)

-   **Status:** Confirmed — 2026-10-28
-   **Decision:** Use Muse Wonder for complex reasoning/structured findings, Muse Spark for fast routine tasks, Muse Voice Transcribe for voice notes/transcription, SAM 3.1 for visual segmentation only if value proven. Verify live API model IDs, supported inputs, limits. Credentials server-side only, workspace authorization, private evidence, editable AI drafts, distinguish suggestions from verified facts. PDF + HTML versioned snapshots. No mock AI as primary; label any temporary fallback clearly.
-   **Context and evidence:** AI_AND_VOICE.md provider verification requirement; user supplied model choices.
-   **Alternatives considered:** Mock adapter only vs real integration. Chose real integration with explicit fallback labeling.
-   **Security/privacy impact:** All `AI_PROVIDER_API_KEY` server-only, adapter validates schemas, redacted logging, minimum-context prompts, user disclosure for voice/image processing.
-   **Consequences:** Build `packages/ai-adapter` with `clarifyContext`, `proposeChecklist`, `analyzeAssessment`, `draftFinding`, `transcribeAudio`, `analyzeImage`, `generateSpeech` (if verified), with timeouts/rate limits/validation; verify against live Meta API with synthetic data before marking verified.
-   **Documents updated:** AI_AND_VOICE.md, SECURITY.md, ENVIRONMENT_AND_SECRETS.md, TEST_PLAN.md.

## Open decisions

Remaining to resolve through provider verification and implementation: - Exact authentication and role/permission matrix details. - Exact Meta model IDs and verified image/audio/streaming capabilities per model. - Which voice capabilities deliver reliably per platform (web vs Expo). - Report export layout and PDF rendering choice. - Offline/sync scope. - Data retention and deletion periods. - Whether corrective-action assignment is in initial release.

## Decision template

### D-XXX --- Short title

-   **Status:** Proposed / Confirmed / Superseded
-   **Date:**
-   **Decision:**
-   **Context and evidence:**
-   **Alternatives considered:**
-   **Security/privacy impact:**
-   **Consequences:**
-   **Documents updated:**
