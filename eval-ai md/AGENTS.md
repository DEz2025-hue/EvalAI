# Instructions for AI Coding Assistants

These instructions apply to every AI coding assistant or developer
working on EvalAI.

## 1. Start with repository discovery

Before editing code:

1.  Inspect the repository tree, package manifests, lockfiles,
    application entry points, routing, current UI, database schema and
    migrations, authentication, storage, tests, build scripts, CI, and
    deployment configuration.
2.  Run the existing test, type-check, lint, and build commands when
    practical. Record commands and results.
3.  Identify the current stack and the features that already work.
4.  Create or update `REPOSITORY_AUDIT.md`, `FEATURE_STATUS.md`, and
    `IMPLEMENTATION_PLAN.md`.
5.  Reuse the current stack and working components unless there is a
    documented, evidence-based reason to change them.
6.  Do not perform a wholesale rewrite merely because a different
    framework or architecture is preferred.

If the repository is unavailable or a command cannot be run, state that
limitation. Do not invent audit results.

## 2. Read the source of truth

Read `README.md`, `PRODUCT_REQUIREMENTS.md`, `WORKFLOWS.md`,
`ARCHITECTURE.md`, `SECURITY.md`, `ENVIRONMENT_AND_SECRETS.md`,
`AI_AND_VOICE.md`, `DATA_MODEL.md`, `IMPLEMENTATION_PLAN.md`,
`TEST_PLAN.md`, `FEATURE_STATUS.md`, `REPOSITORY_AUDIT.md`, and
`DECISIONS.md` before making substantial changes.

If these documents conflict with the existing implementation, do not
silently assume either is correct. Explain the conflict, inspect the
evidence, and update the relevant decision or ask for clarification.

## 3. Security is mandatory

-   Never place private API keys, service-role credentials, database
    passwords, signing secrets, access tokens, or other sensitive values
    in frontend code, browser bundles, mobile bundles, public
    environment variables, source maps, public repositories,
    client-readable database rows, logs, error messages, or screenshots.
-   All privileged AI-provider calls must pass through a trusted
    server-side service or function.
-   Enforce authentication, workspace membership, and authorization on
    the server/database for every protected read and write. Hiding a UI
    control is not authorization.
-   Keep evidence private by default. Authorize access before generating
    short-lived media URLs.
-   Validate inputs, file uploads, and AI outputs at trust boundaries.
-   Never weaken authorization or database policies to make a demo work.
-   Do not paste real secrets into prompts, tests, documentation,
    issues, commits, or generated examples.
-   Use placeholder names such as `AI_PROVIDER_API_KEY` in
    documentation. Never include real values.
-   If a secret is found in tracked files or a client bundle, stop,
    report it without repeating the value, remove the exposure, and
    recommend rotation. Deleting a line alone does not invalidate a
    leaked credential.
-   Follow `SECURITY.md` and `ENVIRONMENT_AND_SECRETS.md`.

## 4. Product requirements that must not be lost

-   EvalAI has two primary modes: **Assessment** and **Inspection**.
-   Initial workflow packs are Solar and CCTV.
-   Both modes share sites, workspaces, evidence, measurements, AI
    services, materials planning, quotations, and reporting where
    relevant.
-   Context comes before checklist generation. Checklists must be
    editable by users.
-   Voice notes and voice interaction are initial-release goals, with
    capability and platform verification required.
-   Photo capture and user-requested photo analysis are initial-release
    goals, with provider verification required.
-   Continuous live-camera AI guidance is not part of the initial
    release; show it as Coming Soon until delivered and tested.
-   AI suggestions are drafts. Preserve source evidence and let users
    edit, accept, or reject AI suggestions.
-   Core capture, saving, deterministic calculations, and report
    assembly from saved facts must continue to work when AI is
    unavailable.
-   Reports must be generated from a versioned snapshot. Later edits
    must not silently alter a finalized report.
-   Materials and quantities must be traceable to measurements, user
    inputs, or documented rules. Supplier prices must come from supplied
    or verified quotations.

## 5. Implementation discipline

-   Make small, reviewable changes with clear scope.
-   Use typed interfaces and schema validation where the stack supports
    them.
-   Keep domain logic separate from UI components and provider-specific
    AI code.
-   Use database migrations for schema changes and include safe rollback
    notes where practical.
-   Add or update tests with each meaningful behavior change.
-   Do not replace real backend queries with mock data unless the task
    explicitly calls for a mock, and clearly label it.
-   Do not add dependencies without checking whether the existing stack
    already provides the capability.
-   Do not mark a feature complete until its acceptance criteria and
    tests are met.
-   Keep documentation synchronized with code.
-   Report changed files, commands run, test results, remaining risks,
    and known limitations at the end of each task.

## 6. Definition of done

A task is complete only when: - the requested behavior is implemented in
the actual repository; - authorization and data validation are enforced
where applicable; - loading, empty, error, and offline/provider-failure
states are considered; - tests are added or updated and actually run
where possible; - no secret or private data is exposed; - the relevant
documentation and feature status are updated; and - any untested or
provider-dependent behavior is clearly disclosed.
