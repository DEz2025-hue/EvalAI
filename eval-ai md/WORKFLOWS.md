# EvalAI Workflows

## 1. Assessment and Inspection are separate modes

Both modes use the same domain engine, but the starting intent,
checklist framing, findings, and report title must reflect the selected
mode. Do not implement them as two names for an identical screen.

## 2. Shared lifecycle

1.  **Start:** choose workspace, site, mode, workflow pack, purpose, and
    scope.
2.  **Context:** collect new/existing/upgrade/repair/mixed scenario,
    equipment already present, requested outcome, constraints, and known
    measurements.
3.  **Clarify:** ask targeted questions when missing information
    materially affects the checklist, safety, or recommendations. Record
    unknowns instead of guessing.
4.  **Checklist:** propose or load a suitable checklist. Validate its
    structure. Let the user edit, add, reorder, or remove
    assessment-specific items.
5.  **Capture:** record checklist status, notes, photos, voice notes,
    files, measurements, and links to evidence.
6.  **Analyze:** only when requested, submit the minimum authorized
    context needed to the AI service. Return structured drafts with
    assumptions, missing information, and uncertainty.
7.  **Review:** inspect incomplete items, contradictions, missing
    evidence, and unsupported AI statements.
8.  **Deliverable:** produce a report, optionally a materials list, and
    optionally supplied supplier quotations.
9.  **Finalize:** generate a snapshot and preserve the exact versions
    included.

## 3. Assessment Mode details

Assessment Mode helps answer: "What is here, what is needed, and what
should happen next?"

-   Identify project goals and existing conditions.
-   Ask context-specific questions.
-   Suggest an editable assessment checklist.
-   Record observations and measurements.
-   Identify potential gaps, constraints, and options.
-   Draft recommendations and a traceable materials schedule when
    requested.
-   State limitations and identify measurements or professional checks
    still required.

Solar examples: load demand and operating hours, existing
panels/inverter/batteries, wiring condition, roof or mounting
constraints, known equipment ratings, and measurements.

CCTV examples: camera count and locations, coverage goals, existing
cameras, recorder, network, power, cabling, and retention requirements
where relevant.

These are context examples, not universal mandatory questions.

## 4. Inspection Mode details

Inspection Mode helps answer: "What was checked, what was found, and
what action is required?"

-   Define the inspection scope and applicable requirements.
-   Work through the checklist systematically.
-   Record a status for every relevant item.
-   Attach evidence and measurements to the exact item.
-   Document defect severity or priority only when the evidence and
    agreed classification support it.
-   Record corrective actions, responsible party, and follow-up status
    where included in the implemented scope.
-   Keep unchecked items visible.
-   Produce an inspection report with evidence and limitations.

A checklist item may be marked Pass only when it has actually been
checked and the available evidence supports that status. A photo alone
does not prove that hidden wiring, electrical performance, or compliance
requirements have been satisfied.

## 5. Voice workflow

-   User explicitly starts recording or activates voice input.
-   App requests microphone permission only when needed and explains
    why.
-   Show a clear recording state, elapsed time where appropriate, and a
    stop/cancel control.
-   Save the original audio where supported and permitted.
-   If transcription is used, keep the original audio separate from the
    transcript.
-   Display transcript as editable, unconfirmed text.
-   Let the user attach it to a site, assessment, checklist item, or
    finding.
-   Confirm before converting ambiguous speech into a technical value,
    status, or final finding.
-   If voice services fail, allow typing or saving an audio note for
    later.
-   Never leave the microphone recording invisibly.

## 6. Photo workflow

-   Capture or select an image.
-   Validate file type and size.
-   Upload to private storage.
-   Link it to the correct workspace and relevant assessment/checklist
    item.
-   Preserve original image and metadata needed for provenance, subject
    to privacy settings.
-   User explicitly requests AI analysis.
-   Display AI output as a suggestion with uncertainty and a reference
    to the source image.
-   Let the user edit, accept, or reject findings.
-   Do not infer hidden conditions or present visual estimates as
    verified measurements.

## 7. Materials and quotation path

After assessment review: - User may generate a report without a
materials list; or - request a materials schedule.

After the schedule is generated: - **Generate report now:** include the
current schedule if requested, clearly marking provisional items. -
**Wait for quotations:** save the workflow and schedule version, allow
the user to return later, enter supplier quotes, and resume.

A quotation must retain supplier/source, date, currency, items,
quantities, prices, applicable taxes/fees when supplied, validity where
stated, and attachments where supported. If the list changes, mark
affected quotations for review.

## 8. Offline and provider failure behavior

The app must communicate whether changes are saved locally,
synchronized, or still pending. Do not claim cloud AI or remote report
generation works offline unless specifically implemented and tested.

If the AI provider fails, times out, or rejects a request: - preserve
the user's work; - show a safe, understandable error; - offer retry when
appropriate; - keep manual capture, deterministic calculations, and
report assembly from saved facts available; - do not create fabricated
AI results.

## 9. Live camera

Continuous live-camera AI guidance is future scope. The UI may show
Coming Soon, but must not imply the feature is active. A future
implementation must define whether it processes selected frames,
periodic frames, or a live stream, and must pass privacy, latency,
connectivity, provider capability, safety, and acceptance tests before
release.
