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

**Update 2026-10-31:** resolved by D-015 (periodic and manual frames, mobile beta). Real-time video remains Coming Soon.

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

### D-014 --- Measuring from a photo with a reference object (estimate only)

-   **Status:** Confirmed — 2026-10-30
-   **Decision:** Mobile can estimate a length from a photo. A flat object of known size (A4, US Letter, bank/ID card) in the same plane gives the scale; the person taps both ends of what they want to measure. SAM 3.1 only proposes the reference object's outline (the person confirms it); a hand-marked outline works when AI is unavailable. The length is computed from recorded pixel geometry, never by an AI model. Every such value is labelled "photo estimate, not verified".
-   **Context and evidence:** No Meta model measures: the Meta model list and SAM docs describe only pixel-space boxes and masks, with no depth, 3D or real-world size. AI_AND_VOICE.md requires separate validation before any photo-assisted measurement is treated as trusted. AR (ARCore) measuring is planned separately as the primary device-assisted option.
-   **Alternatives considered:** Asking Muse Spark for dimensions (rejected: a guess); AR only (needs a development build and a physical-device accuracy test first).
-   **Security/privacy impact:** The segmentation prompt is chosen on the server from the reference type; photos are sent inline (no file storage) through the existing AI guard (rate limit, daily cap, usage log). The server re-verifies the capture and recomputes the length before saving.
-   **Consequences:** Gates (starting values, NOT yet validated on real photos): reference sides must agree within 5% (catches tilt and rotation), reference at least 8% of the photo's long side, AI confidence at least 0.5, measured length at most 10x the reference's long side. Accuracy has not been measured; do not quote one. The SAM response format comes from Meta's docs and has not been checked against a live response (provider billing was not set up); the parser fails safe to "no outlines".
-   **Documents updated:** AI_AND_VOICE.md, FEATURE_STATUS.md.

### D-015 --- Live session: periodic and manual frames (beta, mobile first)

-   **Status:** Confirmed — 2026-10-31. Resolves the "future decision needed" in D-005.
-   **Decision:** A live session is a camera preview plus a still picture sent to Muse Spark every 10, 20 or 30 seconds (default 20) or when the person taps Capture. It is not video. Built on the mobile app first (phone camera, works in Expo Go) and labelled **Beta**; the web live session stays Coming Soon. The person picks which checklist item they are looking at; the AI returns up to a few short notes, each a suggestion that needs review.
-   **Context and evidence:** Meta's model list has no real-time video model, and Muse Spark takes images; AI_AND_VOICE.md section 6 lists the three possible patterns. The owner chose periodic plus manual frames and mobile first.
-   **Alternatives considered:** Manual frames only (not really live); provider real-time video (none exists); web first (the phone camera is where site work happens).
-   **Security/privacy impact:** A consent step comes before any frame is sent. A LIVE · camera on · not recording indicator is always visible. No recording and no background capture: leaving the app ends the session. Frames are temporary files, deleted unless the person saves one as evidence, and the server route stores and logs nothing from the image (usage metadata only, through ai_runs). Limits: 30 minutes and 90 pictures per session, one AI request at a time, 8 requests per minute per workspace, plus the daily cost cap. View-only members cannot start a session.
-   **Consequences:** The AI never changes a checklist status, never creates a finding or evidence on its own, and never gives measurements; those need an explicit tap. If the AI is unavailable (provider billing, offline, repeated errors) the session continues capture-only. **Not yet verified:** the real camera, battery and heat, latency on mobile data, and live AI quality (the provider account had no billing, so only mocked provider tests exist). It stays Beta until the device checklist in TEST_PLAN.md section 8 is run and recorded.
-   **Documents updated:** AI_AND_VOICE.md, SECURITY.md, TEST_PLAN.md, FEATURE_STATUS.md.

### D-016 --- Meta glasses as a future live frame source (design only)

-   **Status:** Confirmed — 2026-10-31.
-   **Decision:** Meta glasses (target: Ray-Ban Meta Gen 1/2) are not built yet. The live session takes its pictures from a FrameSource (apps/mobile/lib/liveSource.ts); the phone camera is the first source and the glasses would be a second one with the same contract, so the session screen does not change.
-   **Context and evidence (checked 2026-10-31):** Meta's Wearables Device Access Toolkit (v1.0.x) offers native iOS and Android SDKs that stream the glasses camera into a phone app, with photo capture inside the stream; microphone and speaker work over Bluetooth. It is still a developer preview: store submissions are "coming soon" with no date, unpublished apps run through Developer Mode on your own glasses, and standalone photo capture and audio in the stream are flagged experimental and not for production. Meta's documentation does not mention React Native. The community Expo package (expo-meta-wearables-dat) is built on SDK 0.6, has only been verified on Ray-Ban Meta, is untested with the New Architecture this app requires, and gives JavaScript only frame metadata, not pixels, so it cannot feed pictures to the AI. Meta Ray-Ban Display glasses can also run Web Apps (an HTML page on the lens). Meta's acceptable use policy restricts using the sensors in sensitive places and recording without consent.
-   **Alternatives considered:** The community package (rejected above); building the glasses source now (blocked: no way to publish, needs a development build); a display-glasses web page (only for Ray-Ban Display, which is not the glasses in use).
-   **Security/privacy impact:** The same consent, indicator and no-background rules apply. Recording or analysing people at a customer site needs their consent; Meta's recording light must never be covered.
-   **Consequences:** Planned path: a small custom Kotlin Expo module over Meta's official mwdat-camera SDK, taking an in-stream still every N seconds, in a development build with Developer Mode for internal testing only. To check on real glasses before building: stream stability and session length, whether the stream survives the phone screen locking (the live session ends when the app leaves the screen), the stills' resolution and latency, battery on the glasses and phone, whether the glasses' microphone already works for voice notes through the Bluetooth route, and the exact Meta AI app and firmware versions required. Revisit when Meta opens store submissions.
-   **Documents updated:** AI_AND_VOICE.md, FEATURE_STATUS.md.

### D-017 --- Live session narration (audio in short pieces, transcribed)

-   **Status:** Confirmed — 2026-10-31. Amends D-015, which said a live session never records.
-   **Decision:** A live session may also record the person's voice. Narration is on by default and can be turned off before starting. Audio is recorded in pieces of about 45 seconds; each piece is uploaded privately with the job (as voice notes are today), transcribed by Muse Voice Transcribe, and shown as an editable, **unconfirmed** transcript. Pictures keep being taken on the interval (they are what the narration points at) and each transcript is linked to the pictures taken while it was said, by time. The camera AI ("AI second pair of eyes") becomes an option that is **off by default**; when on, it behaves exactly as in D-015. Video is still never recorded.
-   **Context and evidence:** The owner wants to talk through the job rather than read AI notes. Meta has no real-time video model and Muse Spark does not take audio, so narration goes through the existing transcription route (no server change). Recording video clips with narration (extracting audio and frames on the server) was deferred to a separate feasibility spike.
-   **Security/privacy impact:** Consent text names the microphone, the speech service and private storage, and warns that other people's voices may be picked up. The indicator reads LIVE · camera on · microphone recording while the microphone is on, and "not recording" otherwise. The microphone is used only by apps/mobile/lib/useNarration.ts, starts only after consent, and stops with the session: Stop, the app leaving the screen, 30 minutes, 90 pictures, or leaving the screen. No background recording. Audio that has not uploaded is deleted from the phone when the person leaves the screen. Transcripts are never logged by the server beyond the existing usage record.
-   **Consequences:** Spoken words never change a checklist answer: the person confirms the text, then chooses "Add as note on the item" (the item's status is sent back unchanged) or "Add as finding draft" (needs review). Numbers with units are highlighted to check. The recorder restarts at each piece boundary, so a fraction of a second of speech can fall between pieces. Audio pieces are kept with the job; deleting them is not built. **Not verified:** microphone and camera together on a real phone, boundary gaps, real transcription (provider billing was off), battery.
-   **Documents updated:** AI_AND_VOICE.md, SECURITY.md, TEST_PLAN.md, FEATURE_STATUS.md.

### D-018 --- Temporary test route through a third-party gateway (removed)

-   **Status:** Superseded and removed — 2026-11-03 (see D-032).
-   **What it was:** While Meta billing was not set up, the adapter could reach Muse Spark through a gateway that resold it, for synthetic-data tests only. It had no voice transcription and no SAM.
-   **Why it is gone:** Meta billing works, the gateway added a second set of keys, addresses and error handling, and a gateway passes content on to a third party. The adapter now talks only to Meta's own API.

### D-019 --- Site situation: new installation or existing system

-   **Status:** Confirmed — 2026-11-01.
-   **Decision:** Every job records the situation at the site in context.scenario (no migration: assessments.context is JSON). Two values to start: **new_install** (nothing installed yet; survey the site and plan the work) and **existing** (a system is already installed; check what is there and its condition). An inspection is always **existing**; the server enforces this. An assessment must choose when it is created; older assessments have none ("not set") and can set it once from the job screen. Each situation starts from its own checklist: a site-survey list for new installations, today's condition list for existing systems and for jobs with no situation (checklistFor in packages/shared/src/packs.ts). Changing the situation later does not rewrite the checklist.
-   **Context and evidence:** WORKFLOWS.md already asked context to capture the new/existing/upgrade/repair/mixed scenario, but the app did not, and the single template assumed equipment already existed ("Existing panels — count, rating, condition"), which never applies to a new installation. The owner chose two situations to start and a different checklist for each.
-   **Security/privacy impact:** The situation is read from the stored job on the server and sent to the AI as one short line; a client cannot override it. It is not personal data.
-   **Consequences:** Clarification, checklist suggestions, analysis, report drafts and live-session notes are framed for the situation (new: judge the site and what to build; existing: judge condition). The report header names it. The field "Existing equipment" becomes "What's installed" or "What does the customer want?". Upgrade, repair and mixed situations are not separate values yet (pick Existing and say so in the goal); a structured equipment inventory is a follow-up.
-   **Documents updated:** WORKFLOWS.md, DATA_MODEL.md, FEATURE_STATUS.md, TEST_PLAN.md.

### D-020 --- Deleting a job, including one with a finalized report

-   **Status:** Confirmed — 2026-11-01. Migration 0015 written and rolled-back tested; **not applied until the owner confirms**.
-   **Decision:** Owners and admins can delete a job permanently, draft or finished, from the job screen (mobile and web). A job with a finalized report also needs the site name typed back; the server checks that as well as the app. Members and view-only people do not see the option and the server refuses them. Deleting removes the job and everything it owns (checklist, responses, evidence rows, findings, measurements, materials, quotations, report snapshots) and then its files (evidence bucket, report PDFs).
-   **Context and evidence:** There was no way to delete a job. Finalized report snapshots are protected by guard_finalized_snapshot() (D-… Phase 6 gate), so an ordinary delete of a finished job fails. The owner chose to allow deleting finished jobs with safeguards, owners and admins only (the database already had the "admins delete assessments" rule).
-   **How the guard stays narrow:** delete_assessment(p_id) is SECURITY DEFINER, refuses anyone who is not an owner/admin of the job's workspace (same message for not found, other workspace, or not an admin), sets a flag for that one transaction, deletes, clears the flag and writes an audit_events row (assessment.deleted or assessment.deleted_finalized, no job content). The guard allows a finalized-snapshot delete only while that flag is on AND the caller is an admin of the snapshot's workspace. Every edit of a finalized snapshot, and every other delete, stays blocked. Tested in a rolled-back transaction: direct delete blocked, other-workspace admin refused, viewer refused, admin succeeds, other workspace untouched, flag off afterwards, two audit rows.
-   **Security/privacy impact:** Files are removed after the database step succeeds, so a failed step never leaves rows pointing at missing files; a failed file removal leaves private, orphaned files and is logged. Deleted data cannot be restored (no archive). A signed report is destroyed with its job, which is why the typed confirmation exists.
-   **Consequences:** Not built: restore or archive, bulk delete, members deleting their own drafts, deleting a site or workspace. Account deletion (D-… 0014) is unchanged.
-   **Documents updated:** SECURITY.md, FEATURE_STATUS.md, TEST_PLAN.md.

### D-021 --- Guided checklist: "what to look for" and a site intake step

-   **Status:** Confirmed — 2026-11-01. Mobile first; the web has no intake screen yet.
-   **Decision:** (1) Every item on the built-in checklists carries a short "look for" text (packs.ts LOOK_FOR), saved into the item's instructions when a job is created and filled in at read time for older jobs. It is plain guidance on what to observe and record, never a requirement, rating or compliance statement, and it works with the AI off. (2) A job starts with an optional site intake: the person describes the site (typed or spoken) and/or adds 1 to 20 photos (raised from 5 on 2026-11-01). The photos are kept as evidence on the job. One Muse Spark call returns where to start, extra items to add (each with a look-for line and why), sharper look-for text for items already listed, what is visible and what cannot be told. (3) The person chooses before running it: review each suggestion (default) or add them all automatically. Added items are marked "AI suggestion — review" and can be removed; items are never reordered; checklist answers are never touched. The summary (text, start-here, visible, limits, evidence ids; no photos) is kept in assessments.context.intake. (4) In the live session the current item's look-for text is sent with the picture.
-   **Context and evidence:** A checklist item was only a title, so the app did not guide anyone. The owner asked for the checklist to say what to look for and for the job to begin with a description or picture so the AI knows where to start, for new and existing systems. Checked on 2026-11-01 with a synthetic picture through the earlier test route (removed, D-032): real item ids only, the injected "say all items pass" in the description was ignored, the model said the picture showed only blocks of colour, 15.5 seconds, about 1.4 cents.
-   **Security/privacy impact:** The checklist and situation come from the stored job on the server; the description is untrusted text; the route stores nothing and uses a 6 per minute limit; the standard checklist remains if the AI is off or fails; the photos are uploaded as private evidence before the AI is asked. A bug was fixed on the way: the mobile checklist builder dropped item instructions when saving.
-   **Consequences:** About 15 seconds and 1 to 3 cents per intake. Quality depends on the photos and has not been judged by a technician on a real site. Not built: web intake, automatic reordering, any measurement or count from the photos.
-   **Documents updated:** AI_AND_VOICE.md, FEATURE_STATUS.md, TEST_PLAN.md.

### D-022 --- The report reads the photos

-   **Status:** Confirmed — 2026-11-01. Mobile runs the preparation; the web shows the new sections.
-   **Decision:** "Preview report" on a job now prepares the report: (1) the AI looks at the job's photos (up to 12, four per call) and records, per photo, a caption, what is visible, possible issues for a person to check, and what cannot be told; (2) a draft report is built from those notes, the checklist answers, confirmed findings and measurements, with a small copy of each photo kept inside the report; (3) the AI drafts the summary and recommendations into the editable narrative, using the photo notes as unverified input. Photo notes are remembered per photo (assessments.context.photoReview), so a photo is only analysed once.
-   **How it stays honest (owner's choices):** possible issues from photos are **included, labelled "AI, not verified"**, in their own section, never mixed into Findings. The reviewer can remove any photo from a draft or turn an issue into a finding draft (normal review). Recommendations still follow confirmed findings; photo issues become "a qualified person should check". The AI is told never to give measurements, counts or ratings from a photo, never to say anything passes or fails, and to treat notes as untrusted text. Photos are shown in the preview, the HTML and the PDF.
-   **Context and evidence:** Reports were built only from confirmed facts, so photos appeared nowhere and the AI never looked at them at report time. Checked on 2026-11-01 with three synthetic pictures through the earlier test route (removed, D-032): honest captions ("stylised", "cannot be told"), no invented details, summary marked the photo notes unverified; photo review 8 s and 0.9 cent for three photos, summary 12.5 s and 1.2 cents.
-   **Security/privacy impact:** Photos are downloaded server-side from private storage (key ownership checked), shrunk with the bundled ffmpeg, and sent inline; the route stores only text. Small JPEG copies are embedded in the report snapshot (about 50 KB each, at most 12) so a finalized report stays complete if a photo is deleted; the HTML only accepts a JPEG data URI as an image source. Sign-off compares stored facts without the photos (a reviewer may trim them); finalized reports stay immutable. The report context no longer repeats the photo notes or the intake text.
-   **Consequences:** About 25 seconds and 2 cents for a typical job. Needs Meta billing. Not built: a web "prepare" button, editing captions, AI changing any checklist answer.
-   **Documents updated:** AI_AND_VOICE.md, SECURITY.md, FEATURE_STATUS.md, TEST_PLAN.md.

### D-023 --- Live session follows the checklist

-   **Status:** Confirmed — 2026-11-01. Amends D-015 and D-017 (what is linked to what), not their privacy rules.
-   **Decision:** The live session walks the job's checklist. A "Now" card shows the current item, its look-for text and progress; the walk starts at the Start here item from the site intake, otherwise the first Not Checked item. Pictures, narration pieces and AI notes are linked to the current item automatically; a narration piece is cut whenever the person changes item, so each piece belongs to exactly one item. The person can mark the current item (Pass, Issue, Needs attention, N/A, or back to Not checked) with one tap, and move with Back, Next or Jump to. With "AI second pair of eyes" on, each AI look also returns what it saw of the item's look-for text and what is still to show. When the session stops, a summary lists each item's status, pictures and narration pieces, and offers Back to the job and Prepare my report.
-   **Guard rules (owner-visible):** a status is written only by the person's tap on a status chip, through setItemStatus, which sends back the item's notes and measurement unchanged. Moving between items never marks anything; the AI, transcripts, the coverage hint and the finish screen never mark anything; an unmarked item stays Not Checked. The coverage hint is labelled an AI suggestion.
-   **Context and evidence:** The live screen had a loose "what are you looking at?" picker at the bottom, so nothing told the person what to look at next and marking an item meant leaving live mode. Checked with a synthetic picture through the earlier test route (removed, D-032): the hint came back honest (nothing seen from an unclear picture, the four parts still to show), 6.8 s, about half a cent.
-   **Consequences:** The Live session button now sits at the top of the job screen. Not built: voice commands such as "next", the AI moving on or marking an item, a web live session. Not verified on a phone.
-   **Documents updated:** AI_AND_VOICE.md, FEATURE_STATUS.md, TEST_PLAN.md.

### D-024 --- Photos by the person's choice, and a real preview before any download

-   **Status:** Confirmed — 2026-11-01. Amends D-022 (photos no longer go into a report automatically).
-   **Decision:** (1) After the AI has looked at the photos, the person answers for each one: **Add to report** or **Leave out**. Continue waits for every answer; "Add all" and "Leave all out" are shortcuts. Answers are kept per photo (assessments.context.photoChoices), so a rebuild only asks about new photos, and "Change my photo choices" reopens them. A photo with no answer, or "Leave out", is not in the report, not in the summary the AI drafts, and its possible issues are not either. (2) After "Prepare my report" the app opens a **Preview** of the finished document: the same stored report HTML the PDF is built from, shown full screen with script disabled. (3) A draft's **Download PDF is locked until that exact version has been previewed**; saving edits, removing a photo or rebuilding makes the earlier look stale and locks it again. Finalized reports download straight away. The web report page applies the same rule with an "I've looked through this preview" confirmation under its inline preview.
-   **Context and evidence:** The owner did not want AI photo notes in a report unless the person said yes, and did not want people downloading a report over and over to find out what it looks like.
-   **Honest limits:** the lock is a rule of the app's screens, not a server lock: the PDF route still produces a PDF on request. The preview is the HTML version of the report (the PDF has the same sections and content, with its own page layout). The previewed state lives in memory, so after the app restarts a draft has to be previewed again.
-   **Documents updated:** AI_AND_VOICE.md, FEATURE_STATUS.md, TEST_PLAN.md.

### D-025 --- One place to record checklist answers, with rules and versions on the server

-   **Status:** Confirmed — 2026-11-01.
-   **Decision:** (1) Answers are recorded only in the checklist walk-through (web and mobile). The job page shows a read-only summary (progress, required items still to do, each item's status) whose items open the walk-through at that item; the walk-through otherwise opens at the first item not checked yet. The inline answer editors on the job pages are removed. (2) The API enforces the answer rules the screens show (`responseProblem` in packages/shared): a measured value needs a unit, and Not Applicable on a required item needs a reason. Answers for items not on the job's checklist are refused. (3) A save sends every answer in one statement, so a batch is saved whole or not at all, and records a real `updated_at`. A screen sends back the `updated_at` it loaded (`baseUpdatedAt`); if the stored answer is newer, the save is refused (409) and the person can load the latest answer instead of silently overwriting someone else's. (4) Template items carry their own required flag and group (`TEMPLATE_ITEM` in packs.ts) instead of "the first five are required"; only items that may not exist on a site (batteries "if present") are optional.
-   **Context and evidence:** A checklist review found five screens recording answers with three rule sets, job-page editors that put stale copies back over answers saved in the walk-through, and required flags decided by position.
-   **Honest limits:** the version check reads the stored times and then writes, so two saves landing in the same instant can still both pass; closing that needs a database function. Callers that merge into the latest answer themselves (field-capture notes) send no version and are not checked. Existing jobs keep the required flags they were created with. The "needs a measurement" check still finds measurement items by title; a per-item flag needs a new column.
-   **Documents updated:** FEATURE_STATUS.md.

### D-026 --- The checklist walk-through: guidance, jump list, autosave, photo per item

-   **Status:** Confirmed — 2026-11-01. Builds on D-021 and D-025.
-   **Decision:** Web and mobile walk-throughs work the same way. Each item shows its "Look for" text, where it came from (added by you, AI suggestion) and why. An "All items" list jumps to any item, filtered by all, not checked, or required and not checked. Answers save on their own about 1.5 seconds after the last change and always before moving to another item (Previous, Next, the list, Finish, or leaving the screen); a small label says Saved, Saving… or Not saved yet, and there are no "Saved" pop-ups. An answer that doesn't meet the rules yet waits rather than failing while typing; the rule is shown when the person moves on. Saves for the same job run one at a time (`AnswerSync` in packages/shared), so an autosave and a tap can't trip the stale-answer check against each other. Measurement fields appear on measurement items, or after "Add a measurement". "Add a photo to this item" uploads with that item's id. Both builders can switch an item between required and optional, edit its "Look for" text, and ask the AI for suggestions; removing any item says that its answer goes with it.
-   **Honest limits:** autosave needs a connection; offline answers stay on screen only. The web page warns before closing with an unsaved answer; mobile saves on back navigation but not if the app is killed. The walk-through doesn't show how many photos an item already has.
-   **Documents updated:** FEATURE_STATUS.md.

### D-027 --- The report is a written-up document built from the whole record, not the checklist echoed back

-   **Status:** Confirmed — 2026-11-01. Builds on D-010, D-022 and D-024. **Amended by D-028** (the AI writes key findings instead of six prose sections, and may use labelled general knowledge).
-   **Decision:** (1) **Layout.** A report reads: executive summary, report at a glance (counts from the saved checklist), site and scope (purpose, address, existing equipment, constraints, what was described at intake, answered scope questions), what was found by area, issues and risks (confirmed findings plus items flagged during the checklist), recommended next steps, photos, materials, open items and limitations, then appendices with the full checklist (grouped by area, plain-language results, notes, measurements, photo counts) and measurements. Raw status codes never appear. (2) **Facts.** The report input now carries each item's category, required flag, measurement and photo count, and a `siteBrief` with the intake text and scope answers. Limitations say what is missing in words; an item marked as an issue is listed under issues, not as a limitation. (3) **Without AI** the report still has the glance counts, the grouped findings and all appendices; only the prose sections are left out. (4) **With AI** one call writes seven sections (summary, site and scope, what was found by area, issues and risks, next steps, open items; reviewer notes stay the person's). It runs automatically when a draft is created on web and mobile, is saved into the draft, and the person edits it before sign-off. (5) **What the AI may do:** group, connect and explain the recorded facts in plain language, say why a flagged item matters where that follows from what was recorded, and propose next steps worded as "check / confirm / have a qualified person assess" — including from flagged checklist items, not only confirmed findings. **What it may not do (D-010 stands):** add conditions, causes, ages, sizes, capacities, counts, prices, standards, codes or compliance statements that are not in the data; describe an unchecked item as fine; describe a finding nobody has confirmed (it is only counted); treat a photo note or a template's "look for" text as an observation. (6) **Numbers guard.** Any figure with a unit, a percentage or an amount in the AI text that is not in the facts it was given is listed above the editor as "check these figures". (7) The AI is given the draft's own saved report content, so it sees exactly what the report shows, with the photo choices of D-024 applied.
-   **Context and evidence:** The report body was `title | raw status | notes` per checklist item, limitations repeated the checklist, intake and scope answers never reached the report, and the AI saw only checklist rows with "use ONLY" and "recommendations must follow from confirmed findings", so its text echoed the table or said no action was supported.
-   **Honest limits:** how the text reads depends on the live model and was not judged: two live tries on 2026-11-01 with made-up site data (a cut-off at `medium` reasoning, a finished answer at `low`, whose text was not saved) used up the test credit, so the output was never read; the default is now `low`; the figures check catches invented numbers with units, not wrong reasoning or unitless counts; the sign-off check now also treats a change in an item's photo count as a changed fact; older finalized reports are rebuilt with the new layout when downloaded (their content is unchanged); web does not run the photo analysis and photo-choice steps (mobile only).
-   **Documents updated:** AI_AND_VOICE.md, FEATURE_STATUS.md, TEST_PLAN.md.

### D-028 --- Findings-first report: interpret, synthesize, communicate

-   **Status:** Confirmed — 2026-11-02. Amends D-027 (the AI latitude, the layout, and where photo statements appear).
-   **Decision:** (1) **The report is built around key findings.** The AI turns the whole record into a few technical findings: related checklist items, notes, measurements and photos are combined into one finding each, with *observed* (facts, photos cited as "Photo N"), *what it means* (interpretation) and a *recommended action*, plus a priority (high, medium, low, info) and its sources (checked against the real report; unknown sources are removed; a finding with no real source is dropped unless it is only for information). The executive summary says what the findings add up to and does not repeat them; sentences repeated between the summary, open items and the findings are removed. The recommended actions table is built from the findings' actions, so nothing is told twice. (2) **Latitude.** "What it means" may use general technical knowledge of the trade, written as general explanation and marked in the report as interpretation. Still forbidden: site facts, measurements, sizes, capacities, ages, counts, prices or compliance statements that are not in the data; naming standards, codes or clause numbers; describing an unchecked item as fine; describing a finding nobody has confirmed (only the count is sent). (3) **Photos** are worked into the findings that cite them, shown as small pictures on the finding with the AI's description marked not verified; photos no finding cites go in an "Other photos" section. The photo reader now writes fuller descriptions (apparent condition, installation, surroundings, readable labels, qualitative only). Web gets the same photo steps as the phone (look, then Add or Leave out for each photo). (4) **People stay in charge.** Findings are drafted automatically when a draft is created, edited as cards (title, priority, observed, meaning, action, confirmed), can be added or removed, and "Rewrite summary from my findings" rewrites the summary and open items from the edited findings. A confirmed finding (reviewed content) is never dropped from the report. Findings are part of the narrative, so they are not "stored facts" in the sign-off check, and any change to them re-locks the PDF download until previewed. (5) **Without AI** the report still shows key findings, built only from the confirmed findings and the items marked Issue or Needs attention (no interpretation added). Older reports keep their layout.
-   **Context and evidence:** The AI-written report read thin and repetitive: six prose sections re-narrated the same checklist rows, nothing tied a statement to its evidence so related observations were never combined, the rules limited the model to restating the record, and photo notes were short captions in a separate section.
-   **Honest limits:** how the wording reads was judged only by me on the first live run on Meta (2026-11-03), not by a person scoring it; an evaluation set of six made-up jobs with automated checks is in the repo. "What it means" is model-written general knowledge: a draft for a qualified person to check, and the disclaimer stays. The figures check catches invented numbers with units, not wrong reasoning. Photo statements are AI readings of a picture. Findings cite sources by checklist item title, so renaming an item after a draft is made leaves the old title in the finding.
-   **Documents updated:** AI_AND_VOICE.md, FEATURE_STATUS.md, TEST_PLAN.md.

### D-029 --- AI-proposed materials: the AI proposes, code calculates, the person decides

-   **Status:** Confirmed — 2026-11-02. Builds on D-010 (no invented quantities or prices; traceable; provisional marking).
-   **Decision:** (1) **"Suggest materials with AI"** reads the whole job record (site brief, situation, checklist results and notes, measurements, confirmed findings, the photo notes the person chose, limitations, and the materials already on the list) and returns a **draft**: a design basis (what system it assumes, from the record or its own assumption), the facts still missing ("add these and run again"), and materials grouped by area. For a new installation it proposes the full set for the pack (solar: modules, inverter, mounting, DC and AC cable, protection, earthing, monitoring, storage only if asked, consumables; CCTV: cameras, recorder and storage, network and PoE, cable and containment, mounts, power, signage). For an existing system it proposes only repair or replacement parts for what the findings and checklist flag. Nothing is saved by the AI call. (2) **Quantities: rules plus labelled estimates.** Each item has a method. *Rule*: the AI names one of the documented rules and its inputs; **code does the arithmetic**. An input claimed to be a recorded measurement is replaced by the recorded value (and becomes an assumption if no such measurement exists or its unit differs); a figure claimed to be from the record must appear in it, or it is an assumption; the AI's own number for a rule item is ignored. *Estimate*: the AI gives a number; always provisional, with its assumption. *Unknown*: stored as 1 with a "Quantity to be determined" marker and shown as TBD, in the screens and in the report. (3) **Documented rules** (`MATERIAL_RULES`, version 1, in packages/shared/src/materialRules.ts, unit tested): modules by target size (round up of kW ÷ module watts; 450 W class assumed); modules by usable area (round down of area ÷ (2.2 m² × 1.10)); cable for a measured run ((run × 1.05 sag + 2 m terminations) × conductors); module clamps (4 per module); CCTV storage (cameras × 4 Mbps × 86 400 s × days ÷ 8 ÷ 10⁶, +20% headroom, 30 days assumed); recorder channels (next of 4, 8, 16, 32, 64); PoE ports (cameras plus the larger of 2 or 20%, next of 8, 16, 24, 48). They are **starting allowances, not standards or design calculations**. Any input that was assumed (not recorded) makes the item provisional. (4) **Specifications are general classes** to be confirmed ("UV-resistant solar DC cable, 4 mm² class"). No brand, model, manufacturer or part number (a price or a model-number pattern in a specification is removed); anything sized by a calculation (breakers, fuses, cable cross-section for a current, inverter rating, battery capacity) says "to be sized by a qualified designer". **Nothing is priced**; prices still come only from real quotations. (5) **Provenance.** New source value `ai_suggested` (migration 0016 extends the check on `materials_items.source`). The server keeps an AI item provisional when it has any assumption. The rationale keeps the rule's explanation ("12 modules = 5 kW × 1000 ÷ 450 W, rounded up (rule pv_modules_by_target v1)"). Supports (checklist items, findings, measurements) are kept only if they exist in the record. (6) **Review.** Web and phone show the draft with keep or remove per item, an editable specification and quantity (a person's number replaces TBD and is noted; the item stays provisional until confirmed), assumptions, and a note when a figure in the text is not in the record. "Add to list" then the existing Save creates the next version through `/api/materials`, which marks earlier quotations stale as before. (7) **Report.** Materials rows show the specification, an "AI suggestion" badge, provisional and TBD markers and one note: proposed from recorded measurements and general rules; provisional or TBD quantities must be confirmed; not a quotation and not a design. The new fields are set only when they apply, so earlier reports are unchanged.
-   **Context and evidence:** The Materials screen was entirely manual (prompts to add one item at a time) although its text promised "generate from findings/measurements". PRODUCT_REQUIREMENTS §9 and WORKFLOWS §7 already require provenance, assumptions and provisional marking.
-   **Alternatives considered:** Letting the AI state quantities (rejected: invented quantities, D-010). Rules only, no AI estimates (rejected by the user: too many items would be left blank). Brand or model recommendations (rejected: unverifiable, and not the app's call).
-   **Security/privacy impact:** Same as the report: only the saved record and the photo notes the person chose are sent; findings nobody has confirmed are counted, never described; nothing is stored by the AI call.
-   **Honest limits:** how the proposals read has not been judged on a live model (first live run on Meta on 2026-11-03 was read but not scored by a person); an evaluation set of four made-up jobs with automated checks is in the repo and in the repo. The rules are allowances, and a qualified designer must size and verify the system. Specifications come from the model's general knowledge and can be wrong: they are drafts to confirm. Estimates for items with no rule are the model's guess and stay provisional.
-   **Documents updated:** DATA_MODEL.md, AI_AND_VOICE.md, FEATURE_STATUS.md, TEST_PLAN.md.

### D-030 --- Site interview: a turn-based conversation that feeds the report

-   **Status:** Confirmed — 2026-11-02. Builds on D-003 (voice only as far as it is reliably available), D-017 and D-023 (spoken words never change a checklist status) and D-010 (nothing invented).
-   **Decision:** (1) **Live gets an Interview mode** beside the camera walk (kept, still beta). The AI reads the saved record and asks **one question at a time**; the person answers by **typing or by voice** (voice uses Meta transcription; when it is unavailable the screen says so and offers typing). The question can be **read aloud with the phone's or browser's own speech engine** (no provider text-to-speech exists). It is **turn-based, not a live call**, and the screen says so. (2) **Asking.** Each question comes from `interviewTurn`: it must not ask what the record or an earlier answer already says, prefers required items still Not Checked and vague or conflicting notes, and may say it has enough. Code ends the interview at 12 questions or 40 turns, and treats a question that is the same as an earlier one in other words as "enough". The conversation is kept with the job (`assessments.context.interview`, validated, no migration). (3) **Reading it.** When the person ends the interview, `interviewDigest` proposes: notes for checklist items, finding drafts, site-brief details, contradictions with the record, and open questions. **Every proposal must quote the person's exact words** (the AI's own words do not count; case and punctuation are ignored); a proposal with no such quote, or for an item that is not on the checklist, is dropped. Figures with a unit that nobody said are flagged. (4) **Nothing is applied automatically.** The person unticks, edits or accepts each proposal. An accepted note is appended to the item with the quote and **the item's status and measurement are sent back unchanged**; an accepted finding is created as a draft needing review; accepted details and open questions are saved on the interview. Statements are never recorded as measurements. (5) **Report.** Once reviewed, the interview appears under Site and scope as "Site interview — statements, not verified facts" (details, questions and answers, what was left open), in the web view, the PDF and the phone preview, and the report AI is told these are statements it may cite as reported but never as confirmed and never against a checklist outcome. Older reports and interviews that were not reviewed are unchanged.
-   **Context and evidence:** The checklist captures what is seen, not why, how the site is used, or what the customer wants. Follow-up questions get information a form does not. The existing live session handles frames and one-way narration; there was no conversation, no stored turns and no text-to-speech.
-   **Alternatives considered:** A real-time voice call (rejected: needs provider streaming and text-to-speech that are not available or verified). Letting the AI fill in checklist answers from the conversation (rejected: D-023). Hiding the camera walk (rejected by the user: it works in beta).
-   **Security/privacy impact:** Only the saved record and the conversation text are sent (unconfirmed findings are not described); voice answers are kept as private evidence, as other voice notes are. The stored interview is validated and size-limited.
-   **Honest limits:** how the questions and proposals read has not been judged on a live model (first live run on Meta on 2026-11-03 was read by me, not scored by a person; a phone has not been tried): an evaluation set of three made-up conversations with automated checks is in the repo. The "same question" and "same item" checks compare meaningful words and can miss a heavily reworded repeat. Spoken replies use the device voice and may sound flat or be unavailable. A person can still say something untrue; the report labels it as a statement.
-   **Documents updated:** AI_AND_VOICE.md, FEATURE_STATUS.md, TEST_PLAN.md.

### D-031 --- Office report style: how a report looks, never what it says

-   **Status:** Confirmed — 2026-11-02. Builds on D-009 (finalized reports are immutable) and D-024 (the PDF is downloaded only after the exact draft was previewed).
-   **Decision:** (1) **One style per workspace**: office name, a PNG or JPEG logo (under about 200 KB), an accent colour, header text, footer text, and for each of ten sections (summary, site and scope, site interview, key findings, recommended actions, photos, materials, open items, checklist appendix, measurements appendix) whether it shows, its position and an optional heading of the office's own. Everyone in the workspace reads it; **only owners and admins change it** (checked in the route and by database policy, migration 0017). (2) **It changes presentation only.** The review status or sign-off, the reviewer notes and the important notice are **not sections** and are always printed, even if every section is hidden. The text of a report, its findings and its sign-off facts are untouched. (3) **A copy goes into each draft** when the draft is made (`ReportInput.template`), so changing the style later never alters a draft that exists or a finalized report. A draft can be restyled with "Re-apply office style"; a finalized report is refused. (4) The template is **not part of the "stored facts" check at sign-off** (changing how a report looks does not make it stale) but **is part of the preview lock**: a restyled draft must be previewed again before its PDF can be downloaded. (5) **Same style in the web view, the PDF and the phone preview** (the phone uses the stored HTML). A report with no style is byte-for-byte the content it was before (tested against captured output). (6) Safety: a colour must be `#rrggbb`; a logo must be a base64 PNG or JPEG; headings, header and footer text are escaped; a logo that cannot be read is left out of the PDF rather than stopping it. (7) Edited on the web (Settings, with a live preview using sample text); the phone shows reports in the style but does not edit it.
-   **Context and evidence:** Header, footer, section order and headings were literals in the HTML builder and again in the PDF builder, and workspaces had no settings. Offices have their own reporting style.
-   **Alternatives considered:** Applying the current style when a report is viewed (rejected: it would change finalized reports). Letting the AI learn a layout from an uploaded sample report (later; needs a live model to check). Free-form HTML templates (rejected: injection risk and no guarantee the notice stays).
-   **Honest limits:** the PDF is drawn by hand with standard fonts, so a custom typeface is not possible and some characters are replaced; the logo is shown at a fixed small size; colour applies to headings and the title only. Migration 0017 is applied to the live project and its database test passed (2026-11-03). On 2026-11-03 the Settings card was tried in a browser as an owner: preview (office name, footer, renamed heading, hidden section; notice and status always printed), save, reload and reset all worked against the database. Also on 2026-11-03, on a real draft report of the live project: Re-apply office style, the stored HTML and the PDF all showed the style (office name, header, footer, accent colour, a renamed and moved section, hidden sections; sign-off and important notice kept), and removing the style and re-applying restored the draft to its earlier headings. Also on 2026-11-03: a logo (a GIF, an oversized PNG, an SVG, a web address, an injected script and a bad colour are all refused, by the card and by the server; a valid PNG shows in the preview, the stored report and the PDF); the card for a person who cannot edit (shown read-only, with the fields disabled and no Save, reset or logo controls; checked by faking the can-edit answer, not with a second account); and a finalized report on a throwaway job (changing the workspace style left its stored HTML byte-for-byte identical and its PDF in the old style; re-applying the style and editing the narrative were refused; a new draft used the new style). That test found a bug: see TEST_PLAN.md. Not yet tried: the phone preview.
-   **Documents updated:** FEATURE_STATUS.md, TEST_PLAN.md.

### D-032 --- Meta's own API is the only AI provider

-   **Status:** Confirmed — 2026-11-03. Supersedes D-018.
-   **Decision:** All third-party gateway code, settings, error messages, tests and documentation were removed. The adapter reads `META_API_KEY` (and optional `META_BASE_URL`); the older `AI_PROVIDER_API_KEY` / `AI_PROVIDER_BASE_URL` pair still works as a fallback. There is no provider switch any more, model ids are used as given, and voice and SAM are never refused for being on the wrong provider.
-   **Context and evidence:** On 2026-11-03 Meta billing worked: the live interview, materials and report evaluations ran on `muse-spark-1.3`, and Muse Voice Transcribe transcribed a synthetic spoken clip correctly (4 s).
-   **Security/privacy impact:** Customer content goes only to Meta, under the standard-model rule (Contributor models are still refused). One fewer outside party holds keys or content.
-   **Consequences:** The credit-shortfall handling in the adapter (retry within a smaller budget, a special billing message) is gone; a billing error now always means Meta billing. Old env files that still hold the removed settings are ignored.
-   **Documents updated:** AI_AND_VOICE.md, TEST_PLAN.md, FEATURE_STATUS.md, .env.example.

### D-033 --- Monochrome identity, Liquid Glass surfaces and skeleton loading

-   **Status:** Confirmed — 2026-11-03 (foundation built; screens are being moved over in batches).
-   **Decision:** (1) **Palette:** Charcoal Black `#151515`, Soft White `#F6F6F6`, Pure White `#FDFDFD`, as a grey scale in a light and a dark scheme that follow the device setting. Light: Soft White page, Pure White surfaces, Charcoal text and primary buttons. Dark: Charcoal page, translucent glass surfaces, Soft White text, and the primary button inverts. The old slate, teal, sky and indigo accents all map to the grey scale. (2) **Status colours stay functional** (pass, issue, needs attention) and always come with an icon and a text label; nothing else is coloured. (3) **Liquid Glass:** translucent fills with backdrop blur, a light edge, large rounded corners. Web: `.glass`, `.glass-bar`, `.glass-sheet`, `.card`. Phone: `GlassSurface` (Apple's glass on iOS 26 and later, a frosted blur on older iPhones and the web, a near-opaque solid on Android and when "Reduce Transparency" is on). Long lists and checklist rows stay near-opaque for readability. (4) **Loading is a skeleton:** placeholders in the shape of the content, a slow pulse (still when motion is reduced), announced once to screen readers ("Loading…"). Spinners remain only inside a button while it saves. (5) **One source of truth:** `packages/shared/src/theme.ts`; the web reads the same values as CSS variables in `apps/web/app/globals.css` and a test fails if they drift; a contrast test checks every text and surface pair in both schemes (WCAG AA). (6) **Not changed:** generated reports and PDFs keep their own print look (D-031).
-   **Context and evidence:** The app was a light slate/teal theme with "Loading…" text and spinners, and no dark mode.
-   **Honest limits:** Apple's native glass cannot be seen on a Windows machine: the web and the phone's web build were checked in a browser (light and dark); the real glass needs an iPhone on iOS 26 after a rebuild with expo-glass-effect and expo-blur. On the phone, a switch between light and dark remounts the screens (the colour objects are rewritten in place), so a screen loses transient state at that moment. Buttons and form fields on the web now follow utility classes (for example `text-xs`), which the old stylesheet silently overrode.
-   **Documents updated:** SCREEN_SPECIFICATIONS.md, TEST_PLAN.md.

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
