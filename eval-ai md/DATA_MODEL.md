# EvalAI Conceptual Data Model

This is a conceptual model. Inspect the current database and application
types before creating or changing tables. Reuse existing entities where
they already meet the requirements.

## 1. Core entities

### User and workspace

-   **User/Profile:** account identity and non-sensitive profile
    settings.
-   **Workspace:** individual or team working area.
-   **WorkspaceMembership:** user, workspace, role, invitation and
    membership status.
-   **AuditEvent:** security- and workflow-relevant actions with minimal
    necessary metadata.

### Site and workflow

-   **Site:** location/site label, customer or organization reference
    where appropriate, and authorized metadata.
-   **WorkflowPack:** Solar, CCTV, and future domain definitions.
-   **WorkflowPackVersion:** immutable version of checklist defaults,
    question schema, and rules.
-   **Assessment:** a work record with site, mode, workflow pack,
    status, scope, context, and ownership.
-   **AssessmentVersion:** versioned snapshot of assessment facts and
    state.

### Checklist and evidence

-   **ChecklistItem:** assessment-specific editable item, order,
    category, and required/optional status.
-   **ChecklistResponse:** status, notes, author, timestamps, and
    reviewed state.
-   **EvidenceItem:** private media/file metadata, owner workspace,
    media type, storage key, capture time, and provenance.
-   **EvidenceRelationship:** links evidence to assessment, checklist
    item, finding, measurement, or corrective action.
-   **Observation:** original user-entered or transcribed observation.
-   **Finding:** possible or confirmed issue with severity/priority only
    when supported, evidence links, review state, and provenance.
-   **Recommendation:** proposed next action linked to findings or
    context.
-   **CorrectiveAction:** action, status, and follow-up fields if
    included in scope.
-   **Measurement:** value, unit, type, source, timestamp, and notes.
-   **CalculationRecord:** formula identifier/version, inputs, units,
    result, and provenance.

### AI and voice

-   **AIRun:** operation, provider/model identifier, schema/prompt
    version, status, duration, safe error code, and usage metadata.
-   **AIDraft:** validated structured result, assumptions, missing data,
    uncertainty, source references, and review status.
-   **VoiceAsset:** original audio storage reference and metadata where
    audio retention is enabled.
-   **Transcript:** text linked to the original audio, transcription
    provenance, confidence where available, and user-confirmed state.

Do not store raw secrets or unnecessary provider credentials in these
entities.

### Materials, quotations, and reports

-   **MaterialsList:** parent record and version.
-   **MaterialsListItem:** description, specification, quantity/unit,
    rationale, source inputs, assumptions, verification state, and
    linked findings.
-   **Supplier:** supplier details supplied or verified by the user.
-   **Quotation:** supplier, source, reference, date, currency, validity
    where stated, attachment, and review status.
-   **QuotationItem:** item description, quantity, unit, price, and
    stated taxes/fees.
-   **ReportSnapshot:** immutable reference to the assessment version
    and included materials/quotation versions, generated artifact
    location, finalization metadata, and report version.

## 2. Data integrity rules

-   Use stable IDs, foreign keys, timestamps, and explicit
    ownership/tenant relationships.
-   Enforce workspace boundaries on every protected operation.
-   Avoid storing critical relational integrity only inside unvalidated
    JSON.
-   Keep versioned workflow definitions separate from individual
    assessment responses.
-   Preserve original measurements and units when derived calculations
    are added.
-   Link findings to evidence and source inputs whenever possible.
-   Keep AI drafts separate from confirmed user facts.
-   Finalized reports reference exact versions.
-   A changed materials list should trigger review of potentially stale
    quotations.

## 3. Suggested assessment states

Choose exact enum values after inspecting existing code. Semantically
support: - draft - context_incomplete - checklist_ready - in_progress -
review_required - ready_to_report - awaiting_quotations - finalized -
archived

Do not let a client bypass state transitions simply by sending a state
string.

## 4. Suggested review states

For AI drafts and findings, consider: - draft - needs_review -
accepted - edited_and_accepted - rejected

For checklist responses, distinguish Pass, Issue Found/Fail, Needs
Attention, Not Applicable, and Not Checked.

## 5. Privacy and retention

Define which media is retained, who can access it, how deletion
propagates, and whether transcript deletion also removes original audio.
Keep private storage references inaccessible without authorization.
Retain only the data necessary for product functionality and disclosed
audit requirements.
