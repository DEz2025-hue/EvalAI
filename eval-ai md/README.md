# EvalAI Documentation Pack

**Purpose:** This folder is the source of truth for product intent,
implementation rules, security, AI behavior, and acceptance criteria for
EvalAI.

## Read in this order

1.  [`AGENTS.md`](AGENTS.md) --- mandatory instructions for AI coding
    assistants and developers.
2.  [`PRODUCT_REQUIREMENTS.md`](PRODUCT_REQUIREMENTS.md) --- what EvalAI
    is and what users must be able to do.
3.  [`WORKFLOWS.md`](WORKFLOWS.md) --- Assessment Mode and Inspection
    Mode behavior.
4.  [`ARCHITECTURE.md`](ARCHITECTURE.md) --- target architecture and
    constraints.
5.  [`SECURITY.md`](SECURITY.md) and
    [`ENVIRONMENT_AND_SECRETS.md`](ENVIRONMENT_AND_SECRETS.md) ---
    mandatory security controls.
6.  [`AI_AND_VOICE.md`](AI_AND_VOICE.md) --- AI, voice, photos, and
    live-camera boundaries.
7.  [`DATA_MODEL.md`](DATA_MODEL.md) --- conceptual data entities and
    relationships.
8.  [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) --- staged
    delivery plan.
9.  [`TEST_PLAN.md`](TEST_PLAN.md) --- required tests and release gates.
10. [`FEATURE_STATUS.md`](FEATURE_STATUS.md) --- honest implementation
    status.
11. [`REPOSITORY_AUDIT.md`](REPOSITORY_AUDIT.md) --- findings from the
    real repository audit.
12. [`DECISIONS.md`](DECISIONS.md) --- confirmed decisions, open
    questions, and decision history.

## Critical project rules

-   Audit the existing repository before changing its architecture or
    replacing code.
-   Keep Assessment Mode and Inspection Mode as distinct user-facing
    workflows that share the same core engine.
-   Voice interaction and voice notes are planned as initial-release
    capabilities. Their exact implementation must be validated against
    available APIs, platform support, permissions, and connectivity.
-   Photo capture and user-requested photo analysis are initial-release
    goals. Provider support for image input must be verified before
    calling it operational.
-   Continuous live-camera AI guidance is a future capability and must
    be labelled **Coming Soon** until implemented and tested.
-   Never fabricate observations, measurements, equipment
    specifications, supplier prices, or test results.
-   Never expose secrets in frontend code, client bundles, public
    configuration, logs, error messages, screenshots, documentation, or
    version control.
-   Never claim a feature is complete merely because it is described in
    these documents.
-   These documents define intended behavior. The repository audit
    determines what already exists.

## Keeping the documents current

When a product or architecture decision changes, update `DECISIONS.md`
and the affected requirement documents in the same change. Keep
`FEATURE_STATUS.md` aligned with actual code and tests. Do not mark
tests as passed unless they have been run and the results recorded.
