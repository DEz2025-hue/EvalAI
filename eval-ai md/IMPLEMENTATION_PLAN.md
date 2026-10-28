# EvalAI Implementation Plan

## Guiding rule

Do not start by rewriting the application. Audit the real repository,
identify working features, and implement in small phases. Update this
plan based on actual code and test results.

## Phase 0 --- Repository audit and decisions

-   Inventory apps, packages, routes, components, data access, database
    migrations, auth, storage, provider integrations, tests, CI, and
    deployment.
-   Run existing checks and record results.
-   Map each requirement to existing code, missing code, and uncertain
    status.
-   Identify any exposed secrets or unsafe authorization patterns
    without reproducing sensitive values.
-   Confirm framework, backend, environment strategy, and deployment.
-   Produce `REPOSITORY_AUDIT.md`, `FEATURE_STATUS.md`, and an
    evidence-based plan.

**Exit gate:** no architecture rewrite is proposed without evidence and
a documented decision.

## Phase 1 --- Security and foundation

-   Confirm authentication and workspace membership.
-   Define server-enforced roles and permission matrix.
-   Enforce tenant isolation for database, media, AI requests, quotes,
    and reports.
-   Configure private storage and authorized short-lived access.
-   Establish secret management and safe environment examples.
-   Add safe error handling and redacted operational logging.
-   Add migrations and security tests where relevant.

**Exit gate:** cross-workspace access tests pass and no secrets are
exposed in client artifacts.

## Phase 2 --- Shared assessment/inspection engine

-   Implement or complete sites and assessment records.
-   Add first-class Assessment and Inspection modes.
-   Add Solar and CCTV workflow packs.
-   Build context-first clarification and editable checklists.
-   Implement checklist statuses and draft/resume.
-   Capture observations, evidence links, and manual measurements.
-   Implement deterministic calculations and tests.
-   Ensure the same core services are reused across both modes.

**Exit gate:** a user can complete and resume a basic assessment and
inspection without AI.

## Phase 3 --- Voice and evidence

-   Implement visible microphone controls and permission handling.
-   Support voice notes and/or dictation on each target platform where
    stable.
-   Preserve original audio when supported and permitted.
-   Add editable transcript handling if transcription is verified.
-   Add text fallback and recording failure states.
-   Implement photo capture/upload and private evidence linking.
-   Verify provider image and audio capabilities with synthetic data
    before enabling provider-dependent features.

**Exit gate:** users can record or dictate observations, review text,
attach evidence, and continue manually if a voice service fails.

## Phase 4 --- AI services

-   Create a server-side provider adapter.
-   Implement context clarification and checklist proposal.
-   Implement user-requested analysis and draft
    findings/recommendations.
-   Add schema validation, evidence-reference validation, uncertainty,
    missing-input fields, and human review.
-   Add timeouts, request limits, bounded retries, and redacted usage
    metadata.
-   Test provider failure and ensure saved work remains intact.
-   Add spoken responses only if the selected provider and platform
    support a reliable implementation.

**Exit gate:** AI outputs remain drafts and unsupported claims are
rejected or clearly qualified.

## Phase 5 --- Materials and quotations

-   Implement traceable materials schedules.
-   Link items to findings, measurements, user inputs, rules, and
    assumptions.
-   Mark provisional quantities when required inputs are missing.
-   Implement save-and-resume while waiting for quotations.
-   Store quotation provenance and supplied prices.
-   Warn when a materials change may make a quote stale.

**Exit gate:** no fabricated price/quote and all provisional quantities
are clearly identified.

## Phase 6 --- Reports

-   Implement reports without a materials list.
-   Implement reports with an optional materials schedule and supplied
    quotations.
-   Assemble reports from stored facts and validated drafts.
-   Create immutable/versioned snapshots.
-   Preserve limitations and unresolved items.
-   Add export generation and failure recovery appropriate to the
    current stack.

**Exit gate:** later edits do not silently mutate finalized reports.

## Phase 7 --- Live camera future work

Keep the feature labelled Coming Soon until: - the provider's supported
image/video interaction pattern is confirmed; - the product chooses
selected frames, periodic frames, or a supported live stream; - privacy,
consent, data retention, network, latency, battery, and cost behavior
are tested; - interruptions and provider failures have safe fallbacks; -
all acceptance tests pass.

## Phase 8 --- Release hardening

-   Run unit, integration, end-to-end, platform, accessibility, and
    security tests.
-   Verify backups, restore, deletion, export, monitoring, and incident
    response.
-   Review privacy disclosures and provider terms.
-   Verify all features listed as available are actually implemented.
-   Prepare release notes and document known limitations.

## Reporting format for each implementation task

At the end of each task, report: 1. what changed; 2. files changed; 3.
commands and tests actually run; 4. test results; 5. security
implications; 6. unresolved issues; 7. updates made to feature status
and documentation.
