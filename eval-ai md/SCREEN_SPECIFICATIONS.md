# EvalAI Screen Specifications

**Document status:** Product and implementation specification  
**Applies to:** Mobile application and web application  
**Audience:** AI coding assistants, product/design, frontend, backend, QA, and security reviewers  
**Important:** This document defines intended behavior. It does not assert that a screen or capability already exists in the repository. Audit the current codebase before implementation and record actual status in `FEATURE_STATUS.md`.

## 1. Purpose

This document defines the expected screens, pages, navigation, content, interactions, data behavior, failure states, accessibility expectations, and acceptance criteria for EvalAI. Use it with `AGENTS.md`, `PRODUCT_REQUIREMENTS.md`, `WORKFLOWS.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`, `SECURITY.md`, `ENVIRONMENT_AND_SECRETS.md`, `AI_AND_VOICE.md`, and `TEST_PLAN.md`.

The goal is not to create two separate products. Mobile and web are two interfaces over the same authorized records, workflow rules, and backend services. Each platform should use interaction patterns suitable for its form factor.

## 2. Mandatory implementation instructions

Before changing code:

1. Inspect the repository, package manifests, routes, navigation, screens, shared components, theme/tokens, data models, backend functions, migrations, authentication, storage, and tests.
2. Identify which screens already exist, their actual routes, and whether they use real data or placeholders. Do not infer implementation status from filenames alone.
3. Preserve working behavior and established conventions unless a documented requirement justifies a change.
4. Update `REPOSITORY_AUDIT.md` and `FEATURE_STATUS.md` with verified findings. Mark unknowns as unknown; do not invent implementation details.
5. Implement incrementally, using existing reusable components where appropriate. Avoid rewriting the application from scratch without evidence that this is necessary.

During implementation:

- Do not create dead-end pages or decorative controls that do nothing.
- Do not use mock data in production workflows where real backend queries are expected. If development fixtures are necessary, label and isolate them.
- Every route must have authorization checks at the data/API layer, not only hidden navigation.
- Every form must validate input and explain errors in plain language.
- Every data-driven page must support loading, empty, error, and success states; where relevant also support offline, permission-denied, stale-data, and partial-save states.
- Do not claim that an AI operation, upload, save, or report generation succeeded until the server confirms success.
- Do not expose private keys, service-role credentials, model-provider secrets, privileged tokens, or server-only environment variables in mobile bundles, browser bundles, source maps, client-readable configuration, API responses, logs, or error messages. Sensitive model calls must pass through an authorized server-side boundary.
- The client may contain only intentionally public configuration. Treat all client-bundled variables as visible to the user.
- Never fabricate inspection findings, measurements, supplier quotes, provider capabilities, or completion status.
- AI output is a draft until a user reviews and accepts it. Preserve provenance and uncertainty.
- Keep report snapshots versioned and immutable after finalization; later edits must not silently alter an existing finalized report.
- Do not include a functioning live-camera AI guidance workflow in the initial release. Label it “Coming Soon” if shown, and ensure it cannot be mistaken for a working feature.

## 3. Product modes

### 3.1 Assessment Mode

Assessment Mode helps a technician understand a site, system, need, or proposed job. It collects context, captures evidence and measurements, identifies missing information, supports user-requested AI analysis, and helps prepare findings, recommendations, optional materials, and an assessment report.

### 3.2 Inspection Mode

Inspection Mode helps a technician verify a site or system against a defined scope, checklist, or requirements. It emphasizes item-by-item checks, evidence, statuses, defects, limitations, corrective actions, and an inspection report.

### 3.3 Shared behavior

Both modes use the same underlying evidence, identity, workspace, permissions, checklist, AI adapter, materials, quotation, and reporting services where appropriate. Do not fork or duplicate the data model just because the user selected a different mode. Store the selected mode and the relevant workflow state explicitly.

Initial workflow packs are **Solar** and **CCTV**. The architecture should permit future workflow packs without implying that every industry is already supported.

## 4. Global information architecture

Actual route names must follow the repository's routing conventions. The following route labels are conceptual, not prescribed URL strings.

### Mobile primary navigation

Recommended primary destinations:

- **Home:** assigned work, recent jobs, resumable drafts, and key actions.
- **Jobs:** assessments and inspections list, search, and filters.
- **Create:** start a new assessment or inspection.
- **Reports:** reports the current user is authorized to access.
- **Profile / Settings:** account, workspace, preferences, privacy, and help.

If the existing app uses tabs, a drawer, or another navigation pattern, audit it first and retain it if it works well. Do not add every destination to the bottom tab bar if this harms usability on small screens.

### Web primary navigation

Recommended desktop shell:

- Persistent left navigation with workspace identity.
- Main content region with page title, contextual actions, and breadcrumbs where useful.
- Workspace/job context clearly visible when viewing an individual job.
- Account/profile controls and notifications in a consistent global location.
- Responsive collapse behavior for tablet and narrow browser windows.

Recommended destinations:

- Dashboard
- Assessments
- Inspections
- Reports
- Team and workspace management, only for authorized roles
- Settings

Do not expose administration options to unauthorized users. Route protection must be enforced by the server/data layer as well as the UI.

## 5. Shared screen rules and design system

### 5.1 Visual hierarchy

- Use a consistent typography scale, spacing scale, icon set, border treatment, and color tokens.
- Establish a clear page title, supporting context, primary action, secondary actions, and content hierarchy.
- Use status text and icons in addition to color. Do not rely on color alone to communicate pass/fail or severity.
- Avoid excessive nested cards, decorative gradients, and large empty hero sections in dense operational screens.
- Prefer clear, readable forms and evidence views over ornamental layouts.
- Keep labels, dates, quantities, units, and status names consistent across mobile and web.

### 5.2 Responsive behavior

- Mobile layouts must be touch-friendly and usable one-handed where practical.
- Web layouts may use side-by-side panels and wider tables where they improve work efficiency.
- On small screens, convert wide tables into stacked records or provide safe horizontal scrolling with clear affordances.
- Keep primary actions visible without obscuring form content or evidence.
- Support text resizing and system accessibility settings.
- Do not make essential functionality hover-only; mobile has no hover.

### 5.3 Common interaction patterns

- Show confirmation before destructive or irreversible actions.
- For unsaved changes, warn before navigation and provide a recovery path where possible.
- Use optimistic UI only when rollback and failure feedback are reliable. Otherwise wait for server confirmation.
- Make save state clear: saving, saved, unsaved changes, failed to save, or pending sync.
- Use explicit labels on buttons; avoid ambiguous labels such as “OK” when a meaningful action name is possible.
- Use a consistent date/time format and clearly label measurement units.
- Provide keyboard focus states on web and accessible names for controls.

### 5.4 Universal states

Each relevant screen must define:

- **Loading:** skeleton or progress indicator, without flashing misleading empty-state content.
- **Empty:** explain why there is no content and offer a relevant next action if permitted.
- **Error:** concise message, safe retry action, and no secret/internal stack trace.
- **Permission denied:** explain lack of access without leaking the existence or contents of restricted records.
- **Offline / connection loss:** show whether local work is saved, queued, or at risk; do not claim server sync succeeded.
- **Partial completion:** identify which steps are complete and which remain.
- **Success:** confirmation tied to a real server result.

## 6. Mobile screen specifications

### M01. Sign In

**Purpose:** Authenticate an existing user.

**Content and layout:** App identity, email/username field according to the existing authentication system, password field if password auth is supported, show/hide password control, sign-in button, password-recovery link, and links to privacy/help where available.

**Interactions:** Validate required fields; submit; show progress; prevent duplicate submissions; show safe authentication errors; navigate to the intended authorized destination after success.

**Data/security:** Use the existing supported auth provider. Never log credentials or tokens. Do not reveal whether an account exists in a way that creates account-enumeration risk. Do not implement custom password storage.

**States:** Empty form, validation errors, invalid credentials, rate-limited request, network failure, session already active, success.

**Acceptance criteria:** A valid user can sign in; invalid attempts do not leak secrets; loading and error states are visible; successful sign-in routes to an authorized screen.

### M02. Invitation / Account Setup (if supported)

**Purpose:** Let an invited user activate an account and join the correct workspace.

**Content:** Invitation context, verified inviter/workspace information where safe, account setup fields required by the auth system, terms/privacy links, and completion action.

**Rules:** Invitation tokens are validated server-side, expire according to policy, and cannot be reused outside their intended scope. Do not create public registration if the product's actual access model is invitation-only; confirm this during repository audit.

**Acceptance criteria:** Valid invitations work once within policy; expired, revoked, or invalid invitations show safe guidance; workspace membership is not client-assigned without server authorization.

### M03. Password Recovery

**Purpose:** Start account recovery using the configured identity provider.

**Content:** Email/identifier input, submit action, return-to-sign-in link, and neutral confirmation.

**Acceptance criteria:** Input is validated; confirmation does not unnecessarily reveal account existence; provider errors are handled safely.

### M04. Workspace Selection (if user belongs to multiple workspaces)

**Purpose:** Select the workspace in which the user intends to work.

**Content:** Authorized workspaces, role/context where useful, and selection action.

**Rules:** Only memberships confirmed by the backend are displayed. Workspace switching must refresh all workspace-scoped data and invalidate stale cached selections.

**Acceptance criteria:** Switching workspaces cannot show records from the previous workspace; unauthorized workspace IDs are rejected server-side.

### M05. Home Dashboard

**Purpose:** Give a fast overview of current work and allow the user to resume tasks.

**Content:** Greeting or workspace context, “New Assessment” and “New Inspection” actions, assigned/recent jobs, drafts needing attention, recently updated reports, and sync/connection status where applicable.

**Interactions:** Open a job, filter or navigate to jobs, start a workflow, resume a draft, open a report.

**Data:** Use real, permission-scoped backend queries. Counts must be derived from actual records and access rules.

**States:** New user with no jobs, loading, connection failure, jobs assigned, unsynced work.

**Acceptance criteria:** All dashboard cards lead to useful destinations; data is authorized and current enough for its label; no fake counts or fake activity.

### M06. Jobs List

**Purpose:** Find assessments and inspections and understand their current state.

**Content:** Search, filters (mode, workflow pack, status, assignee/date where supported), list records, status, site/client label where permitted, last update, and create action.

**Interactions:** Search, filter, sort where supported, open job, resume draft, refresh, and create.

**States:** No jobs, no filter matches, loading, request failure, stale/offline list.

**Acceptance criteria:** Filters combine predictably; opening a job checks permission; empty and no-match states are distinct; list rows do not expose private data beyond the user's access.

### M07. Create Job / Choose Mode

**Purpose:** Start the correct workflow.

**Content:** Two clear choices: **Assessment** and **Inspection**. Explain the difference briefly. Include a workflow-pack selection for Solar or CCTV, and an action to continue.

**Behavior:** Preserve the selected mode and pack through the next steps. Do not silently switch modes after the user begins. If changing mode is allowed later, explain what changes and require confirmation where data could be affected.

**Acceptance criteria:** The selected mode and pack are saved to the draft/job; the two modes remain distinct in labels and report type; unsupported packs are not presented as working.

### M08. Site and Job Context

**Purpose:** Collect the information needed to tailor the workflow.

**Content:** Job name/reference if applicable, site name/address or location description, client/site contact fields only if required, system type, work type (new, existing, upgrade, repair, or mixed), scope/goal, known equipment, access constraints, and relevant notes. Avoid requesting unnecessary personal information.

**Solar context examples:** Existing/new installation, loads and usage, panels/inverter/batteries, known wiring, measurements, and constraints.

**CCTV context examples:** Existing/new installation, camera count/types if known, coverage goals, recorder, network, power, cabling, and constraints.

**Interactions:** Save draft, continue, go back, and ask for AI clarification when the user explicitly requests help.

**Rules:** Make optional fields clear. Units must be explicit. Do not invent defaults for material technical facts. Explain why a critical missing input is needed.

**Acceptance criteria:** Required fields are validated; draft is recoverable; mode-specific context is preserved; data is scoped to the active workspace.

### M09. AI Clarification Questions

**Purpose:** Ask only the follow-up questions needed to make a useful checklist or analysis.

**Content:** Questions in plain language, relevant answer controls, optional “I don't know” or “Not available” where appropriate, and back/continue actions.

**Behavior:** AI-generated questions are a proposal. User answers are editable. Avoid repeated questions when the answer already exists in saved context. Show why a required technical input matters when helpful.

**Security/reliability:** Send only necessary context to the server-side AI adapter. Validate structured output. If AI is unavailable, allow manual continuation with a basic checklist or clearly state what cannot be generated.

**Acceptance criteria:** Questions relate to the selected mode and Solar/CCTV pack; unknown values are not converted into invented facts; answers persist when navigating away.

### M10. Proposed Checklist Review

**Purpose:** Let the user review and customize the checklist before fieldwork.

**Content:** Grouped checklist items, item description, required/optional indicator, editable item text where permitted, add/remove/reorder controls where supported, and confirm checklist action.

**Behavior:** Show the source or rationale for AI-suggested items when available. Distinguish standard/template items from AI-suggested items. Warn before removing required items. Save a checklist version when confirmed.

**Acceptance criteria:** User can review before confirming; confirmed checklist is saved; subsequent edits are versioned or audited according to the data model; no claim of compliance/certification is made merely because a checklist exists.

### M11. Active Job Overview

**Purpose:** Serve as the home screen for a selected assessment or inspection.

**Content:** Job name, mode, workflow pack, site context, status, completion progress, current checklist summary, missing required information, evidence/notes summary, and clear next action.

**Actions:** Continue checklist, capture evidence, review findings, request AI analysis when permitted, view materials, and view/generate report according to workflow state.

**Acceptance criteria:** Progress is computed from saved workflow data, not decorative percentages; user can resume the correct step; finalization actions are gated by required checks.

### M12. Checklist Item / Observation

**Purpose:** Record the result for one checklist item.

**Content:** Item title and instructions, status choices, observation text, measurement fields and units if applicable, evidence list, add photo, add note, voice-note action, save action, and next/previous item navigation.

**Supported statuses:** Pass, Issue Found/Fail, Needs Attention, Not Applicable, Not Checked. Keep exact terminology consistent across platforms and define any mapping in the shared domain model.

**Behavior:** Selecting a status should not erase evidence or notes. Not Applicable may request a reason if required by the workflow. Not Checked must remain distinct from Pass. Measurements require unit and validation rules.

**Acceptance criteria:** Status and notes persist; invalid measurements are rejected with explanation; evidence is linked to the correct item; the user can move between items without losing unsaved work.

### M13. Photo Capture and Evidence Review

**Purpose:** Capture or attach evidence and link it to the correct job/item.

**Content:** Camera launch, gallery/file selection where supported, capture preview, retake/remove before upload, caption/description, item association, upload progress, and upload result.

**AI behavior:** Photo analysis is user-initiated. Present AI observations as tentative drafts with uncertainty and limitations. Never treat AI visual measurement as authoritative without a validated method and user confirmation.

**Privacy/security:** Request device permissions only when needed. Explain why access is needed. Validate file type/size on the server; use private storage and short-lived access links. Do not put sensitive evidence in public storage or public URLs.

**Acceptance criteria:** User can preview and associate evidence; upload failures are recoverable; successful upload is confirmed by the server; removing a local preview does not falsely imply a previously uploaded file was deleted.

### M14. Voice Input and Voice Notes

**Purpose:** Let technicians speak observations or interact by voice without requiring typing for every entry.

**Initial-release target:** Voice capture and saved voice notes are intended for the initial release. Exact transcription and spoken-response capabilities must be verified against the chosen platform/provider before being promised as universally available.

**Content:** Record/stop control, recording indicator and duration, playback, save/discard, association with job/checklist item, optional transcription with editable text if supported, and clear permission/privacy explanation.

**Behavior:** Preserve the original audio when voice-note storage is enabled. Treat transcription as a separate derived artifact. Users must be able to correct or discard transcription. Do not record in the background without explicit, visible consent.

**Failure cases:** Microphone denied, interrupted recording, unsupported format, upload failure, transcription unavailable, AI provider outage, and low-confidence transcription.

**Acceptance criteria:** Recording state is visible; saved audio is linked to the intended record; transcription does not overwrite original audio; errors do not claim a recording or transcription was saved when it was not.

### M15. Measurements and Technical Inputs

**Purpose:** Capture numeric observations required by a workflow.

**Content:** Named measurement, numeric value, unit, optional instrument/source, date/time, notes, and validation hints. Show expected range only when it comes from a defined rule or reliable configured specification.

**Behavior:** Preserve raw entered values and units. Any conversions must be deterministic, tested, and visible. If data is estimated, mark it as an estimate and capture its source.

**Acceptance criteria:** Invalid values are blocked or flagged; conversions are tested; missing critical measurements are surfaced during completeness review; AI cannot silently overwrite a technician-entered value.

### M16. AI Analysis and Findings Review

**Purpose:** Let the user explicitly request AI assistance and review the results.

**Content:** Analysis scope, context/evidence included, progress, generated findings/recommendations, links to supporting evidence, assumptions, missing inputs, uncertainty, and actions to accept, edit, reject, or rerun.

**Behavior:** Do not run expensive analysis automatically on every upload. The user initiates analysis. Display only results returned and validated by the server. Preserve provenance and distinguish user-entered facts from AI suggestions. Never invent a provider-backed fact or present unverified AI advice as a certified engineering decision.

**Failure cases:** Provider timeout, quota/rate limit, invalid model output, missing context, network interruption, and partial results.

**Acceptance criteria:** AI results are schema-validated; users can edit/accept/discard drafts; unsupported claims are flagged or omitted; a provider failure does not destroy the assessment; retry behavior avoids accidental duplicate records.

### M17. Completeness Review

**Purpose:** Show what is ready and what is missing before final analysis or reporting.

**Content:** Completed items, unchecked items, required missing measurements, unresolved findings, missing evidence, optional warnings, and links to fix each issue.

**Behavior:** Differentiate hard blockers from warnings. Permit report generation without a materials list where policy allows. Do not mark Not Checked as complete unless the workflow explicitly defines it as an accepted exception.

**Acceptance criteria:** Each warning links to the relevant field/item; blockers have clear reasons; completion summary matches persisted data.

### M18. Materials List Review

**Purpose:** Review a proposed materials/equipment list traceable to findings, measurements, and rules.

**Content:** Item name/specification, quantity, unit, reason/source, linked finding or calculation, provisional flag, and missing assumptions. Prices must appear only when based on verified supplier quotes or other explicitly authorized, sourced data.

**Behavior:** Distinguish required items from optional recommendations. Mark quantities provisional when critical information is missing. Editing a material or technical input may invalidate related quantities or quotes and should trigger recalculation/review.

**Acceptance criteria:** Each item has a traceable rationale; unsupported prices are not invented; missing inputs are visible; materials can be omitted from the report when requested.

### M19. Supplier Quotes (if enabled)

**Purpose:** Capture or review quotes and associate them with the correct material-list version.

**Content:** Supplier identity, quote reference/date/expiry, currency, line-item mapping, quantities, taxes/fees if provided, total, attachment, and review status.

**Behavior:** Do not scrape or invent prices. Preserve quote source and version. Warn when the material list changes after a quote was received or when the quote expires. Quote entry may be manual if supplier integrations are not implemented.

**Acceptance criteria:** Quote values are traceable to source documents/entries; stale quotes are visibly flagged; no stale quote is silently presented as current.

### M20. Report Preview and Generation

**Purpose:** Review and generate an assessment or inspection report from saved data.

**Content:** Report type, site/job context, scope, checklist outcomes, findings, evidence, measurements, recommendations, limitations, and optional materials/quotes. Show draft/final status and version information.

**Behavior:** Provide “Generate without materials list” when supported. Generate from a versioned snapshot. Show generation progress and only confirm success after the report is persisted. Make finalization consequences clear.

**Acceptance criteria:** Report contents match the selected snapshot; optional materials can be omitted; generation errors are recoverable; finalized versions do not mutate when the job is edited later.

### M21. Report Detail and Sharing

**Purpose:** View an authorized report and share/export it through supported mechanisms.

**Content:** Report preview, version/date, status, download/export/share actions only where implemented, and change history where authorized.

**Security:** Verify access on each request. Use short-lived signed links for private files. Avoid public links by default. Record meaningful share/export events where required by policy.

**Acceptance criteria:** Only authorized users can view/export; links expire according to policy; an older finalized version remains accessible according to retention and permissions.

### M22. Notifications and Activity (if supported)

**Purpose:** Help users find assignments, changes, and workflow events.

**Content:** Notification list, read/unread state, timestamp, related job, and safe navigation target.

**Acceptance criteria:** Notifications reveal only authorized information; links re-check permissions; empty/error states exist. Do not show a notification feature as working if no notification service exists.

### M23. Profile, Preferences, Privacy, and Help

**Purpose:** Manage the signed-in user's personal settings and understand data handling.

**Content:** Profile details supported by the backend, preferences, sign out, privacy/data handling information, help/support entry, and accessibility preferences if implemented.

**Rules:** Do not expose workspace administration to ordinary users. Account deletion/export or retention controls should be offered only when the backend policy supports them and the action is implemented safely.

**Acceptance criteria:** Settings persist to the correct account; sign-out clears sensitive local state; privacy information is accurate to actual provider/storage behavior.

## 7. Web page specifications

### W01. Sign In and Account Recovery

Use the same identity rules as mobile. Adapt layout to desktop without weakening validation or security. Never embed credentials or private keys in the page. Ensure error messages, keyboard navigation, focus management, and password-manager compatibility work.

### W02. Workspace Shell and Dashboard

**Layout:** Global navigation, workspace context, page header, primary actions, summary panels, recent jobs, assignments, and report activity as authorized.

**Behavior:** Dashboard figures come from real scoped data. Search/navigation must be keyboard accessible. On smaller windows, collapse navigation without hiding essential actions.

**Acceptance criteria:** User can reach core workflows quickly; every metric is traceable to a query or defined calculation; unauthorized data is never included.

### W03. Assessments Register

**Purpose:** Search and manage assessment records.

**Layout:** Page title, create action, search, filters, sortable table or responsive list, status, site, owner/assignee where authorized, last update, and pagination or incremental loading.

**Behavior:** Filters and sort order are reflected consistently. Row actions must respect permissions. Bulk actions, if any, require explicit selection and confirmation.

**Acceptance criteria:** Empty and no-match states differ; large lists remain usable; direct record URLs enforce access checks.

### W04. Inspections Register

Use the register behavior from W03 but label records and actions as inspections. Preserve inspection-specific statuses and workflow. Do not silently combine assessment and inspection semantics in a way that makes report type or requirements unclear. Shared filters/components are encouraged.

### W05. Create Job and Context Wizard

**Purpose:** Create an assessment or inspection through a clear sequence.

**Layout:** Step indicator, mode selection, Solar/CCTV workflow-pack selection, site/job context form, save draft, back/continue, and exit behavior.

**Behavior:** Persist progress between steps. Validate current step before advancing. Clearly indicate optional versus required fields. Preserve draft when the user exits, where supported.

**Acceptance criteria:** User can resume a saved wizard; selected mode and pack remain correct; validation messages identify the field and expected correction.

### W06. Clarification and Checklist Builder

**Purpose:** Review AI clarification questions and the proposed checklist in a spacious editing interface.

**Layout:** Main content area for questions/items, context panel or summary, and a clear review/confirm action. Use split panes only where screen width supports them.

**Behavior:** Users can edit answers and permitted checklist items. Clearly label AI suggestions and required items. Show a safe fallback if the provider is unavailable.

**Acceptance criteria:** Changes persist; checklist confirmation creates a saved version; AI output is validated before rendering; no hidden required items are added without explanation.

### W07. Job Workspace Overview

**Purpose:** Provide a central view of a selected job.

**Layout:** Job header with mode/status, site summary, progress, tabs or sections for checklist, evidence, findings, materials, and reports, plus contextual actions.

**Behavior:** Tabs navigate within the same job. The selected job context remains visible. Changes to workflow status are server-confirmed. Finalization is not available to users without permission.

**Acceptance criteria:** Each section displays the same persisted job; progress matches saved records; restricted actions are hidden and also blocked server-side.

### W08. Checklist and Observation Workspace

**Purpose:** Review and edit checklist results efficiently.

**Layout:** Checklist navigation/list on one side and selected item details on the other where practical. Show status, instructions, observations, measurements, evidence thumbnails, and save state.

**Behavior:** Selecting another item does not discard unsaved changes. Keyboard navigation is supported without trapping focus. Status changes and edits are saved with clear confirmation.

**Acceptance criteria:** Not Checked remains distinct from Pass; evidence and observations stay linked to the correct item; validation rules match mobile.

### W09. Evidence Gallery and Viewer

**Purpose:** Review photos/files and their context.

**Layout:** Gallery or evidence list, filters by item/type if supported, preview panel/modal, metadata/caption, linked checklist item, and upload state.

**Behavior:** Use private file access. Do not expose permanent public storage URLs. If evidence is deleted or detached, confirm consequences and preserve audit history as required.

**Acceptance criteria:** Only authorized users can load files; viewer supports keyboard and accessible labels; failed loads have retry; evidence provenance remains visible.

### W10. AI Analysis and Findings Workspace

**Purpose:** Request analysis and manage suggested findings on a larger screen.

**Layout:** Analysis request controls, included-context summary, findings list, detail pane, supporting evidence, assumptions/missing data, uncertainty, and accept/edit/reject actions.

**Behavior:** Analysis is user-initiated. Keep AI drafts visually distinct from accepted findings. Show provider errors and retry options. Do not allow unvalidated model output to directly execute privileged actions or write arbitrary database fields.

**Acceptance criteria:** AI outputs are validated server-side; each accepted finding records provenance and user action; unsupported claims are not silently treated as facts.

### W11. Completeness and Quality Review

**Purpose:** Check readiness before report generation or submission.

**Layout:** Completion summary, blockers, warnings, missing fields, links to correct each issue, and next action.

**Behavior:** Recompute from persisted data. Distinguish required blockers from advisory warnings. Do not falsely claim technical compliance or certification.

**Acceptance criteria:** Every blocker can be traced to a requirement or rule; fixing an issue updates the summary; the report action follows configured readiness rules.

### W12. Materials and Quantity Review

**Purpose:** Review technical material recommendations and their traceability.

**Layout:** Table with description/specification, quantity/unit, source/rationale, linked finding/calculation, provisional flag, and price/source only when supported by verified data.

**Behavior:** Recalculate or flag stale quantities when inputs change. Allow materials to be omitted from reports where requested. Keep manual overrides auditable.

**Acceptance criteria:** No invented prices; provisional quantities are labeled; each recommendation has a source/rationale; edits persist and affect quote validity where relevant.

### W13. Supplier Quote Review (if enabled)

**Purpose:** Enter and compare supplier quotations associated with a specific materials version.

**Layout:** Quote metadata, supplier, line-item comparison, currency, totals, attachments, expiry/status, and material-list version reference.

**Behavior:** Quotes must have source and timestamp. Mark quote stale if materials/specifications change. Avoid treating blank or estimated prices as verified quotes.

**Acceptance criteria:** Totals are calculated deterministically; currency is explicit; quote provenance and stale state are visible.

### W14. Report Builder and Preview

**Purpose:** Generate and review a report before finalization.

**Layout:** Report preview, section navigation, version/status, optional materials inclusion, generate/save/finalize actions according to permissions, and warnings.

**Behavior:** Build report content from a versioned saved snapshot. Finalizing must create an immutable version or follow the repository's equivalent versioning design. Changes after finalization create a new draft/version rather than mutating the old report.

**Acceptance criteria:** Preview matches generated artifact; report without materials is supported when selected; generation and finalization errors are visible; snapshots are stable.

### W15. Report Library and Report Detail

**Purpose:** Search, open, compare, and export authorized report versions.

**Layout:** Search/filter list, report type, site/job, version, status, created date, owner where authorized, and report detail/preview.

**Behavior:** Export/download only after permission checks. Use expiring private links. Keep report version and snapshot metadata visible. Do not imply a report is signed, certified, or approved unless that status exists and has been granted by an authorized actor.

**Acceptance criteria:** Search results are scoped; direct URLs are protected; exported file corresponds to the selected version; errors are recoverable.

### W16. Team and Workspace Management (authorized roles only)

**Purpose:** Manage workspace membership and role assignments if the product supports these functions.

**Content:** Members, invitations, role descriptions, membership state, and permitted actions.

**Security:** Server verifies authority for every change. Users cannot promote themselves, assign arbitrary workspace IDs, or invite members beyond their permissions. Avoid showing secrets or provider credentials in settings.

**Acceptance criteria:** Role changes are server-validated and audited where required; revoked members lose access; unauthorized users cannot reach data through direct API calls.

### W17. Workspace Settings and Integrations (if supported)

**Purpose:** Configure supported workspace preferences and integrations.

**Rules:** Only settings actually supported by backend code may be shown as operational. Provider credentials must be managed server-side or through a secure secret manager, never displayed again after submission. Do not return secret values to the browser.

**Acceptance criteria:** UI reflects persisted configuration; permission checks are enforced; secrets are masked and cannot be retrieved from client responses; changes are auditable where required.

### W18. Activity and Notifications (if supported)

**Purpose:** Review meaningful job/workspace events.

**Content:** Event type, timestamp, actor where authorized, related record, and navigation link.

**Rules:** Events must be based on actual persisted activity. Do not fabricate history. Filter event payloads to prevent sensitive data leakage.

**Acceptance criteria:** Links re-check access; unauthorized details are omitted; empty/error states exist.

### W19. Profile, Privacy, Help, and Sign Out

**Purpose:** Manage user settings and access trustworthy support/privacy information.

**Behavior:** Save preferences to the correct account; sign out and clear sensitive client state; accurately explain retention, deletion, export, AI-provider processing, and evidence storage according to actual policy. Do not promise privacy controls that have not been implemented.

**Acceptance criteria:** Sign-out works; private cached data is cleared or protected; privacy content is accurate and approved.

## 8. Shared workflow and cross-platform behavior

1. A user creates an Assessment or Inspection and selects Solar or CCTV.
2. The user records site context and saves a draft.
3. If needed, the user requests AI clarification; the questions and answers are editable.
4. The user reviews and confirms the proposed checklist.
5. The technician records checklist statuses, notes, measurements, photos, and voice notes.
6. The user explicitly requests AI analysis; suggestions are reviewed and accepted, edited, or rejected.
7. The system checks completeness and identifies missing inputs.
8. The user optionally reviews a materials list and supplier quotes when supported.
9. The user generates a report with or without materials as allowed.
10. The report is generated from a versioned snapshot and remains stable after finalization.

Mobile and web must read and write the same underlying records. If offline editing is implemented, define conflict handling, pending-sync indicators, and recovery. Do not imply offline write support unless it exists and is tested.

## 9. AI and voice requirements for screens

- AI operations are user-directed, not automatically triggered by every photo or edit.
- Only send the minimum necessary context to the AI service.
- AI requests go through a server-side adapter; the client must not contain model-provider secrets.
- Validate response schemas and allowed fields before saving or rendering.
- Label AI-generated text as a suggestion until accepted by the user.
- Show assumptions, missing inputs, uncertainty, and relevant evidence links when available.
- Keep original technician-entered data and media separate from AI-derived text.
- Voice notes are an initial-release goal. Transcription and spoken AI replies depend on verified platform/provider capabilities and must have graceful fallbacks.
- Continuous live-camera AI guidance is future scope and must be visibly marked “Coming Soon” if shown.
- Provider outages must not prevent users from reviewing or saving already captured observations, where the core application is available.

## 10. Security and privacy requirements for all screens

1. **No secrets in frontend:** Never put private API keys, service-role keys, database admin credentials, signing secrets, or privileged tokens in mobile/web source, bundled environment variables, source maps, browser-accessible config, or client responses.
2. **Server-side authorization:** Every read/write/download/model request must validate identity, workspace membership, record scope, and action permission server-side.
3. **Private evidence:** Store evidence privately; issue short-lived signed URLs only after authorization. Do not expose storage credentials.
4. **Safe logging:** Redact tokens, passwords, private media, unnecessary personal data, and sensitive prompt content from logs and error reports.
5. **Input/file validation:** Validate file size/type and structured inputs on the server. Never trust client MIME types or model output alone.
6. **Tenant isolation:** Do not rely solely on UI filtering. Test cross-workspace record, attachment, report, and search access.
7. **Privacy transparency:** Explain microphone/camera/file permissions at point of use and accurately document provider processing and retention.
8. **Deletion and retention:** Follow the product's approved retention policy. Do not claim deletion or export succeeded until confirmed by the backend.
9. **Safe errors:** User-facing errors must not reveal internal stack traces, secret values, database schema, or private record existence.
10. **Auditability:** Record important permission, membership, finalization, export, and configuration changes where the product's policy requires it.

## 11. Accessibility and usability

- Provide labels and accessible names for all inputs, buttons, status indicators, and evidence controls.
- Ensure keyboard operation and visible focus on web.
- Support screen readers and logical focus order on mobile and web.
- Do not rely on color alone for status/severity.
- Use clear, plain-language error messages and preserve user-entered values after recoverable errors.
- Respect text scaling and avoid clipped controls at larger font sizes.
- Provide sufficient touch target sizes on mobile.
- Ensure dialogs have clear titles, dismissal behavior, and focus management.
- Add captions or text alternatives for meaningful media where appropriate.

## 12. Acceptance checklist for every screen

A screen is not complete until the relevant items below are verified:

- [ ] Purpose and authorized user roles are documented.
- [ ] Route/navigation entry and exit paths work.
- [ ] Layout is responsive for the target platform.
- [ ] All visible controls have real actions or are clearly marked unavailable/Coming Soon.
- [ ] Real data is loaded and saved through the correct service; no accidental production mocks.
- [ ] Loading, empty, error, and success states work.
- [ ] Permission-denied behavior is safe.
- [ ] Form validation and recoverable error behavior work.
- [ ] Unsaved changes and draft recovery are handled.
- [ ] Keyboard/screen-reader/accessibility basics are checked.
- [ ] No secret is included in frontend code, responses, logs, or bundles.
- [ ] AI output is validated and clearly labeled when applicable.
- [ ] Cross-platform data consistency is tested where applicable.
- [ ] Automated tests cover critical behavior and authorization.
- [ ] `FEATURE_STATUS.md` accurately reflects implementation status.

## 13. Required implementation sequence

Use this sequence unless repository evidence supports a safer alternative:

1. Audit current routes, screens, components, styling, data access, auth, storage, and tests.
2. Map existing screens to the IDs in this document. Record existing routes and status in `FEATURE_STATUS.md`.
3. Identify design-system gaps and consolidate shared tokens/components without breaking existing flows.
4. Fix security, tenant isolation, and data persistence issues before polishing screens that depend on them.
5. Implement or refine the shared job model and workflow transitions.
6. Build/refine mobile screens in coherent user journeys, preserving draft recovery.
7. Build/refine web pages using the same data and authorization rules.
8. Add voice workflows and evidence handling according to verified device/provider support.
9. Add AI analysis, materials, quotes, and versioned reporting with graceful failure handling.
10. Run unit, integration, UI, accessibility, and security tests. Update docs to match what is actually implemented.

Do not implement every screen as a single large change. Deliver tested vertical slices, such as creating a job → saving context → checklist → evidence → review, before expanding to secondary administration screens.

## 14. Repository mapping table

Complete this table after inspecting the actual repository. Do not guess route names or mark a screen complete without evidence.

| Screen ID | Actual route/file/component | Current status | Data source | Gaps / next action |
|---|---|---|---|---|
| M01–M04 | To be audited | Unknown until audit | To be audited | Map authentication and workspace flows |
| M05–M10 | To be audited | Unknown until audit | To be audited | Map dashboard, job creation, context, and checklist setup |
| M11–M18 | To be audited | Unknown until audit | To be audited | Map active job, evidence, voice, measurements, AI, and materials |
| M19–M23 | To be audited | Unknown until audit | To be audited | Map quotes, reports, notifications, and settings |
| W01–W06 | To be audited | Unknown until audit | To be audited | Map web shell, registers, wizard, and checklist builder |
| W07–W13 | To be audited | Unknown until audit | To be audited | Map job workspace, evidence, AI, completeness, materials, and quotes |
| W14–W19 | To be audited | Unknown until audit | To be audited | Map reporting, workspace administration, activity, and profile |

## 15. Definition of done

The screen-specification work is complete when the repository has been audited and each planned screen has been mapped to an existing implementation, an agreed change, or an explicitly deferred item. The UI work is complete only when interactions, real data, permission checks, error states, accessibility, and tests are verified. A polished screenshot alone is not proof that a screen works.
