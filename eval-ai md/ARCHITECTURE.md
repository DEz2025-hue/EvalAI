# EvalAI Architecture

## 1. Architecture principle

Use the current repository's working architecture as the starting point.
The architecture below describes responsibilities and boundaries, not
permission to replace the stack without an audit.

## 2. Logical components

-   **Mobile client:** field capture, voice interactions, checklists,
    measurements, drafts, and report review.
-   **Web client:** workspace/site management, assessments and
    inspections, evidence review, quotations, and reports.
-   **Application/domain layer:** workflow state, checklist rules,
    measurements, findings, materials logic, report snapshots, and
    permissions.
-   **Trusted server layer:** privileged database operations,
    AI-provider requests, file authorization, transcription or speech
    services, and sensitive integrations.
-   **Database:** relational domain records, membership, permissions,
    workflow state, versioning, and audit events.
-   **Private object storage:** photos, audio, documents, and generated
    report files.
-   **AI provider adapter:** one controlled interface that isolates
    provider-specific APIs from the product domain.
-   **Reporting service:** deterministic assembly of reports from
    validated saved facts and versioned snapshots.

## 3. Technology decisions

React Native mobile plus a web experience is the proposed direction from
the project specification. Confirm the actual framework, routing,
package manager, backend, storage, deployment, and test setup through
repository audit.

Supabase is a candidate backend, not a mandatory choice unless the
repository and explicit project decisions confirm it. If used, apply
version-controlled migrations, private storage, server-side
authorization, and deny-by-default Row Level Security.

Meta Model API is the intended AI provider direction. Do not assume a
specific model or that image, audio, transcription, speech generation,
or streaming is supported. Verify capabilities, authentication method,
quotas, terms, data handling, and reliability with synthetic data before
enabling each feature.

## 4. Trust boundaries

-   Client to application server.
-   Application server to database.
-   Application server to private storage.
-   Application server to AI provider.
-   User-uploaded files and transcribed speech entering the domain.
-   AI-generated output entering saved application data.
-   Report exports and signed evidence links leaving the application.

Validate and authorize at every boundary. Treat user text, uploads,
OCR/transcripts, and model outputs as untrusted data.

## 5. AI provider adapter

The application should call domain operations rather than provider SDKs
directly from UI components. Possible operations: - `clarifyContext` -
`proposeChecklist` - `analyzeAssessment` - `draftFinding` -
`draftRecommendation` - `transcribeAudio` when supported -
`generateSpeech` when supported - `analyzeImage` when supported -
`draftReport`

Each operation must have a defined input schema, output schema,
authorization checks, timeout, size limits, rate limits, usage tracking,
and safe error handling. Keep provider-specific implementation behind
the adapter.

## 6. Domain versus presentation

-   UI controls must not be the only enforcement of business rules.
-   Measurements and deterministic calculations must be implemented in
    testable domain functions.
-   Checklist state and report assembly must not depend on a live AI
    call.
-   Provider responses must be validated before use.
-   Reports must use stored, versioned facts rather than regenerating
    facts from AI during export.
-   Reusable workflow pack logic should be separate from individual
    assessment responses.

## 7. Storage and versioning

Use stable identifiers and relational integrity for key entities. Keep
evidence private by default. Track assessment versions, materials-list
versions, quotation provenance, AI runs, and finalized report snapshots.

A finalized report must identify the exact versions of the assessment,
checklist/workflow pack, materials schedule, and quotation data
included.

## 8. Resilience

The app should preserve drafts and show clear synchronization state.
Implement retries only for safe operations and bound them. Avoid
duplicate writes by using idempotency where appropriate. AI provider
failure must not corrupt the assessment or prevent access to previously
saved work.

## 9. Observability

Log operational metadata such as request ID, operation type, duration,
result status, model/provider identifier where appropriate, and usage
estimates. Redact secrets and minimize personal/site data in logs. Do
not log raw audio, images, full prompts, or full model responses by
default.
