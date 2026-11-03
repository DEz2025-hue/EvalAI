# EvalAI Security and Privacy Requirements

Security requirements are release gates, not optional enhancements.

## 1. Secrets and credentials

-   Never expose private keys, service-role keys, database credentials,
    access tokens, signing keys, or other secrets in frontend code or
    client bundles.
-   Never place secrets in variables intended to be public, such as
    `EXPO_PUBLIC_*`, `NEXT_PUBLIC_*`, or other framework-specific public
    prefixes.
-   Store secrets only in approved server-side environment configuration
    or a managed secret store.
-   Use separate credentials for local development, testing, staging,
    and production.
-   Apply least privilege, rotation, and revocation procedures.
-   Never commit real `.env` files. Commit only a safe `.env.example`
    containing names and placeholder descriptions, never real values.
-   Never return a secret to a client as part of an API response.
-   Never include secrets in logs, exception messages, analytics events,
    support screenshots, generated documentation, or AI prompts.
-   If exposure is suspected, revoke or rotate the credential and
    investigate logs and distribution paths. Removing it from the
    current file is not sufficient.

## 2. Frontend configuration

Frontend configuration may contain only values intended to be public,
such as a public application identifier or public endpoint, and only
where the platform design requires them. A value being stored in an
environment file does not make it secret or safe: if bundled into the
client, users may be able to recover it.

All privileged provider calls must be proxied through an authenticated
server-side service. Never call a privileged AI API directly from
browser or mobile code.

## 3. Authentication and authorization

-   Authenticate protected operations.
-   Enforce workspace membership and role permissions server-side and,
    where applicable, at the database layer.
-   Check authorization for reads, writes, uploads, downloads, AI
    analysis, report exports, supplier quotations, and signed URL
    creation.
-   Deny access by default.
-   Do not trust workspace IDs, record IDs, role names, or ownership
    claims supplied by the client without checking them.
-   Prevent privilege escalation and cross-workspace access.
-   UI visibility is not a security boundary.

## 4. File and evidence security

-   Store evidence in private storage.
-   Validate MIME type, extension, file size, and file content where
    feasible.
-   Generate short-lived signed URLs only after authorization.
-   Prevent users from guessing or accessing other workspaces' file
    paths.
-   Define retention and deletion behavior for original photos, audio,
    transcripts, documents, and report exports.
-   Avoid unnecessary location metadata and provide appropriate privacy
    disclosure.

## 5. AI security

-   Send only the minimum authorized data needed for the requested
    operation.
-   Verify provider data handling, retention, training usage, supported
    modalities, and account settings before sending real customer data.
-   Treat model output as untrusted. Validate schemas, bounds, allowed
    fields, and references before persistence or rendering.
-   Do not allow model output to issue arbitrary database commands,
    execute code, change permissions, or bypass validation.
-   Protect against prompt injection in uploaded documents, OCR,
    transcripts, and user-provided content.
-   Clearly label generated content as a draft until reviewed.
-   Redact sensitive content from logs and analytics.

## 6. Voice and camera privacy

-   Request microphone and camera permissions only when needed.
-   Show clear recording and camera-active indicators.
-   Provide stop/cancel controls.
-   Do not record audio or video in the background without explicit,
    lawful, user-visible behavior.
-   Explain when audio, images, transcripts, or frames are sent to an
    external AI provider.
-   Do not retain live media longer than required by the disclosed
    product behavior and configured retention policy.
-   Provide text or manual alternatives when voice services are
    unavailable.
-   Real-time video live camera remains unavailable. The live session beta
    (periodic and manual frames, mobile only, D-015) must keep to these rules:
    consent before any frame is sent; a visible camera-on indicator; no
    video recording and no background capture; audio narration (D-017) only
    through apps/mobile/lib/useNarration.ts, after consent, with a visible
    microphone indicator, stopped with the session, saved privately like voice
    notes, transcripts unconfirmed until the person confirms them; frames sent inline and never stored
    or logged by the server unless the person saves one; temporary pictures
    deleted on leaving the screen; session limits and rate limits; view-only
    members cannot start it. Privacy and technical behaviour on real devices is
    still to be validated (TEST_PLAN.md section 8).

-   Deleting a job is permanent and destructive (D-020): owners and admins only, enforced by the database function and the route; a job with a finalized report needs the site name typed back; the deletion is audited without job content; files are removed only after the database step succeeds.

-   Report photos (D-022): small copies of job photos are embedded in report snapshots so they survive deletion of the original; they are downloaded server-side with ownership checks, shown only as JPEG data URIs, and removed with the job when a job is deleted.

## 7. Upload and API controls

-   Enforce authentication, authorization, payload limits, timeouts,
    rate limits, and request validation.
-   Restrict allowed file types and safely process files.
-   Use CSRF protections where applicable to the web architecture.
-   Apply secure headers and production-safe error responses.
-   Do not expose stack traces, internal paths, provider payloads, or
    secrets to end users.

## 8. Data lifecycle

Before production launch, document: - what data is collected and why; -
where data is stored and processed; - retention periods; - deletion and
export workflows; - backup and restore process; - incident response and
credential rotation; - third-party AI processing disclosures; - access
and audit review.

## 9. Required security tests

-   User A cannot read or modify User B's private records without
    permission.
-   One workspace cannot access another workspace's assessments, media,
    quotes, or reports.
-   Client requests cannot escalate roles or transfer ownership without
    authorization.
-   Private storage cannot be accessed through permanent public links.
-   Expired or unauthorized signed URLs fail as expected.
-   Secrets do not appear in built client assets, source maps, logs,
    error responses, or repository history.
-   Malformed uploads and invalid AI outputs are rejected safely.
-   Provider outage does not expose data or corrupt saved work.
