# EvalAI Test Plan and Acceptance Criteria

## 1. Test principles

-   Test real application behavior, not only static UI.
-   Use synthetic data until provider privacy and security have been
    reviewed.
-   Do not mark a test as passed unless it was executed and the result
    recorded.
-   Keep deterministic calculations independent from AI tests.
-   Include failure, authorization, and recovery paths.

## 2. Core workflow tests

1.  Start a new Solar Assessment and capture its context.
2.  Start an existing Solar Assessment and record known equipment.
3.  Start a CCTV Assessment for a new installation.
4.  Start a CCTV Inspection of an existing system.
5.  Switch between Assessment and Inspection and verify that
    mode-specific labels, purpose, and report type are correct.
6.  Clarification asks focused questions when critical context is
    missing.
7.  Unknown answers remain unknown and do not become fabricated facts.
8.  Proposed checklist is editable before and during work.
9.  Checklist status distinguishes Pass, Issue Found/Fail, Needs
    Attention, Not Applicable, and Not Checked.
10. An unchecked item cannot be silently treated as Pass.
11. Draft can be saved, resumed, and synchronized without losing user
    input.
12. User can complete basic capture and report assembly when AI is
    unavailable.

## 3. Evidence and measurement tests

13. Photo can be captured/uploaded and attached to the correct checklist
    item.
14. Unauthorized users cannot access the photo or its storage object.
15. Voice note can be recorded or attached where supported.
16. Transcript, if enabled, is editable and remains separate from
    original audio.
17. User can cancel a recording and switch to text entry.
18. Measurement preserves value, unit, source, and timestamp.
19. Deterministic area/volume calculations are correct for tested values
    and units.
20. AI cannot replace the original measurement or invent a missing
    value.
21. Unsupported photo claims are qualified or rejected.

## 4. AI tests

22. AI checklist output is schema-validated and editable.
23. AI analysis runs only through the authorized server-side path.
24. AI suggestions are labelled as drafts and can be edited, accepted,
    or rejected.
25. AI output references only evidence belonging to the authorized
    assessment.
26. Missing inputs, assumptions, and uncertainty are surfaced.
27. Malformed or adversarial model output is rejected safely.
28. Provider timeout, outage, quota/rate limit, and invalid response do
    not corrupt saved work.
29. Retry behavior does not create duplicate records or duplicate
    charges where idempotency is supported.
30. Secrets and unnecessary sensitive content do not appear in logs.

## 5. Materials and quotation tests

31. Materials items trace back to inputs, measurements, findings, or
    documented rules.
32. Missing critical inputs cause focused questions or provisional
    quantities.
33. Supplier prices are sourced from user-supplied or verified quotation
    data.
34. Report without a materials list works.
35. Materials list can be generated and report finalized immediately.
36. User can save and resume while waiting for quotations.
37. Quotation preserves source, supplier, currency, date, item,
    quantity, and supplied price.
38. Relevant materials changes flag quotations for review.
39. AI cannot invent a supplier quotation.

## 6. Report tests

40. Report contains the correct mode, scope, checklist outcomes,
    evidence, findings, measurements, recommendations, and limitations.
41. Optional materials and quotations appear only when requested and
    available.
42. Report snapshot references exact included versions.
43. Later edits do not silently mutate a finalized report.
44. Export failure does not lose the saved assessment or snapshot.

## 7. Security tests

45. Cross-workspace reads and writes are denied.
46. Unauthorized users cannot access evidence, reports, quotations, or
    AI operations.
47. Client-supplied role or ownership changes are rejected unless
    authorized.
48. Private files require authorization and short-lived access.
49. No secrets appear in frontend bundles, source maps, public
    environment variables, logs, or error responses.
50. Upload validation rejects unsupported or oversized files safely.
51. Session expiry and revoked membership are enforced.
52. Deletion and retention rules are tested for records and associated
    media.

## 8. Voice and live-camera release gates

Voice initial-release gate: - permissions and recording state are
visible; - stop/cancel works; - text fallback works; - transcript is not
silently treated as confirmed fact; - external processing is
disclosed; - provider failure preserves the user's work.

Live-camera gate: - remains labelled Coming Soon until actual
implementation; - supported input strategy is documented; - latency,
network interruption, permission, privacy, battery, and failure paths
are tested; - AI does not present visual guesses as verified technical
findings.

### Live session beta (D-015): test record

Automated (run with the unit suites; mocked provider):

| Area | Covered by | Result 2026-10-31 |
|---|---|---|
| Consent first, interval, limits, pause and capture-only, stop on background | packages/shared liveSession.test.ts | pass |
| AI notes: only real checklist ids, no repeats, suggestions only, untrusted input | packages/ai-adapter live.test.ts | pass |
| Route: auth, workspace check, server-built checklist, billing and timeout mapping | apps/web live-frame-route.test.ts | pass |
| Gate: web still Coming Soon, no recording or background code, labels and consent text | packages/shared liveCamera.test.ts | pass |

On a real phone (to be run by a person; record date, phone model, Android or iOS version, result, notes):

| # | Check | Result |
|---|---|---|
| 1 | Camera permission denied: a clear message and an Open Settings button; the rest of the app works | not run |
| 2 | Consent card appears before the camera opens; Cancel opens no camera | not run |
| 3 | LIVE · camera on · not recording stays visible; Stop turns the camera off | not run |
| 4 | Pictures arrive every chosen interval and the AI notes appear; latency noted | not run |
| 5 | Airplane mode mid-session: AI pauses with a message, capture still works, Retry recovers | not run |
| 6 | Put the app in the background: the session ends and the camera light goes off | not run |
| 7 | 10-minute run: battery use and phone heat noted | not run |
| 8 | Save a picture as evidence with a checklist item chosen: it appears in Evidence linked to that item | not run |
| 9 | Add a finding draft from a note: it appears in Findings as needs review, with the picture linked | not run |
| 10 | Leave the screen: pictures that were not saved are gone (check the app cache) | not run |
| 11 | With the provider account unavailable: the Capture only banner shows and nothing breaks | not run |
| 12 | A view-only member cannot start a session | not run |
| 13 | Narrate on: consent mentions the microphone; indicator reads microphone recording while speaking | not run |
| 14 | Microphone permission denied: session continues with pictures only and says so | not run |
| 15 | Narrate for 5 minutes: pieces appear about every 45 s, in order, with the right pictures; note boundary gaps | not run |
| 16 | Camera preview and microphone work together on Android and on iOS | not run |
| 17 | Airplane mode mid-piece: card shows a retry, audio is kept; Retry works when back online | not run |
| 18 | Numbers and units spoken (for example "12 metres", "16 amps") are highlighted; edit and Confirm; Add as note keeps the item's status | not run |
| 19 | Background the app: camera and microphone both stop; no recording indicator left on the phone | not run |
| 20 | Narrate off: no microphone prompt, indicator reads not recording | not run |

### Photo choice and preview before download (D-024): test record

Automated (2026-11-01): reportGate.test.ts (lock, unlock, re-lock after edit/remove/rebuild), photo-choices.test.ts (route and which photos reach a report), report-choice-guard.test.ts (every photo must be answered, download lock in the app and on the web, preview with no script). The chooser was run in the browser with fake photos (all rules checked).

On a phone (to be run by a person):

| # | Check | Result |
|---|---|---|
| P1 | Prepare my report with 4 photos: the choosing step appears and waits; Continue stays off until all 4 are answered | not run |
| P2 | Leave one out: it is missing from the preview, the PDF and the summary text | not run |
| P3 | The Preview opens by itself after preparing and shows the whole report, photos included, readable and zoomable | not run |
| P4 | On the report screen the draft's Download PDF is off until the preview was opened; after an edit it is off again | not run |
| P5 | Download from the preview: one PDF, same content as the preview | not run |
| P6 | Add 2 photos and rebuild: only the 2 new photos are asked about; "Change my photo choices" reopens all | not run |
| P7 | Finalize, then open the final report: Download works without previewing again | not run |
| P8 | On the web: a draft's Download PDF is off until "I've looked through this preview" is pressed | not run |

### Live session follows the checklist (D-023): test record

Automated (2026-11-01): liveWalk.test.ts (start item, stepping, summary), situation.test.ts (coverage hint), liveCamera.test.ts (statuses only from a chip tap, never from AI/transcript/moving on/finish screen). Browser run with a fake camera, microphone and server: started at the Start here item, Next did not mark, a tap marked only that item with the right arguments, narration cut on Next, summary and buttons.

On a phone (to be run by a person):

| # | Check | Result |
|---|---|---|
| W1 | Live session opens from the top of the job screen; the Now card shows the Start here item and its look-for text | not run |
| W2 | Next/Back/Jump move between items; no answer changes by moving | not run |
| W3 | Tap Pass / Issue / Needs attention: the checklist shows that answer, notes and measurement are kept | not run |
| W4 | Narrate across two items: two pieces, each shown against its own item | not run |
| W5 | With AI second pair of eyes on: Seen / Still to show appears for the current item and makes sense | not run |
| W6 | Stop: the summary lists each item with its status, pictures and pieces; unmarked items stay Not checked | not run |
| W7 | Prepare my report from the summary opens the report preparation | not run |
| W8 | Holding the phone: is the Now card readable and are the buttons easy to hit with a glove or one hand? Note what to change | not run |

### Office report style (D-031): test record

Automated (2026-11-02): reportTemplate.test.ts (a report with no template has the same content as captured before the feature, for four sample reports; normalising; bad colour, logo and section rejected; reorder, hide, rename, escape; office name, logo, colour, header and footer text; older layout; interview section can be moved or hidden; review status, sign-off and notice survive hiding every section; header text cannot inject markup; the preview key changes with the style), pdf-template.test.ts (order, hide, rename, office name, header and footer text, accent colour only when set, PNG logo, unreadable logo not fatal, status and notice always printed), report-template-store.test.ts (saved clean and complete, reset, a draft gets a copy, later changes do not alter it until re-applied, re-apply with no style removes it, a finalized report keeps its style and refuses restyling, restyling a draft does not make sign-off think the facts changed), report-template-route.test.ts (everyone reads, only owner or admin changes or resets, bad colour or logo or oversize or malformed body refused, re-apply refused for a finalized report). The existing reportLayout, reportContent, pdf and report-review tests still pass unchanged.

Run 2026-11-03 against the live project after applying migrations 0016 and 0017: 274 passed, 3 failed. The 3 failures were the admin-write checks, caused by the test itself (an earlier section demotes the admin to member); the test now restores the admin role first, and a separate check of the same admin update, delete and insert passed. The full file has not been run again since that fix. Nothing was left behind (test schema, users and workspaces were all rolled back). To rerun:

```
PGOPTIONS="-c rls_test.strict=on" psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.test.sql
```

Manual (not run): Settings > Report style as an owner: set a name, logo, colour, header and footer; move, hide and rename a section; Preview; Save. Create a new draft and check the web view and the PDF. Change the style, confirm the old draft is unchanged, press Re-apply office style and preview again before downloading. Finalize a report, change the style, confirm the finalized report is the same. Sign in as a member and confirm the card is read-only.

### Site interview (D-030): test record and live evaluation

Automated (2026-11-02): interview.test.ts in shared (turn order, caps, quote must be the person's words, statements paired with their questions), interview.test.ts in the adapter (what the model is given, guard rails in both prompts, done / limit / repeat handling, real topic only, digest keeps only exact-quote proposals for real items, contradictions and open questions kept, figures flagged), interview-route.test.ts (record from stored facts, request limits, labels), site-brief-interview.test.ts (included only after review), reportLayout.test.ts (interview section shown, absent when none, escaped), reportDraft.test.ts (report AI told they are statements), interviewEval.test.ts (the evaluation set is valid and the automated checks catch quotes not said, unknown items, verdict wording, numbers nobody said, over-proposing from vague answers).

**Live evaluation (not yet run: no purchased OpenRouter credit).** Three made-up conversations are in `packages/ai-adapter/src/__tests__/fixtures/interviewCases.ts`. Run (a few cents):

```
LIVE_INTERVIEW_EVAL=1 pnpm --filter @eval-ai/ai-adapter exec vitest run src/__tests__/interviewEval.live.test.ts
```

It writes `packages/ai-adapter/eval-output/interview-eval-latest.md` (not committed). A person scores each case 1 to 5.

| Rubric question | What good looks like |
|---|---|
| Relevant | The first question targets a real gap in the record, not something it already says |
| Natural | One plain, speakable question; follow-ups use what was just said |
| No repeats | No question asked twice in other words |
| Grounded | Every proposal quotes the person; vague answers give few proposals |
| Honest | Statements, not verdicts; no invented numbers; contradictions stated plainly |
| Useful | The notes and details would help a report writer who was not there |

| Case | Relevant | Natural | No repeats | Grounded | Honest | Useful | Notes |
|---|---|---|---|---|---|---|---|
| solar-new-school | not run | | | | | | |
| cctv-existing-shop | not run | | | | | | |
| vague-answers | not run | | | | | | |

Manual on a phone (not run; run `pnpm install` and rebuild the app for expo-speech): Live > Interview, start; read aloud on and off; answer by typing; answer by voice (works only with Meta voice, otherwise a clear message); "That's enough"; Review what I said; untick one note, edit one, Save; open the checklist item and confirm the note has the quote and the status did not change; open the report and the PDF and look for "Site interview". Leave and return mid-interview: the conversation is restored. On the web do the same from the job page.

### AI materials proposal (D-029): test record and live evaluation

Automated (2026-11-02): materialRules.test.ts (every rule's arithmetic and edge cases, assumed-input tracking, out-of-range inputs, no zero or non-finite quantity, TBD display), materialsDraft.test.ts in the adapter (what the model is given, guard rails in the prompt, rule items keep only inputs, recorded measurements replace the model's copy, fake measurements and unfindable record figures become assumptions, duplicates and unreasoned items dropped, prices and model numbers removed from specifications, supports checked, figures flagged, caps), materials-draft.test.ts in the web app (rule arithmetic done in code, assumed inputs make an item provisional, rule that cannot run becomes TBD and adds to the missing inputs, estimates provisional, route limits respected, route sends the record and rules, counts unconfirmed findings without describing them, saves nothing), store-guards.test.ts (an AI item with an assumption is always provisional; source stored as given), reportLayout.test.ts (specification, AI badge, TBD and the note shown; older lists unchanged; no price), materialsEval.test.ts (the evaluation set is valid and the automated checks catch prices, brands, model numbers, invented ratings, missing "to be sized", record figures not in the record, unknown rules, estimates without assumptions, whole-new-system proposals for existing jobs).

**Live evaluation (not yet run: the OpenRouter account has no purchased credit).** Four made-up jobs are in `packages/ai-adapter/src/__tests__/fixtures/materialsCases.ts`. Run, with the provider set up in `apps/web/.env.local` (a few cents):

```
LIVE_MATERIALS_EVAL=1 pnpm --filter @eval-ai/ai-adapter exec vitest run src/__tests__/materialsEval.live.test.ts
```

It writes `packages/ai-adapter/eval-output/materials-eval-latest.md` (not committed). A person scores each proposal 1 to 5.

| Rubric question | What good looks like |
|---|---|
| Complete | Covers every area a new job needs; for an existing job only what is flagged |
| Grounded | Each item tied to the record; assumptions and missing inputs stated |
| Honest quantities | Rules used where they apply; estimates and TBD marked; nothing precise that is not backed |
| General specs | Classes only; sizing items say "to be sized by a qualified designer" |
| No prices or brands | None anywhere |
| Usable | A designer could take the list and start a quotation request |

| Case | Complete | Grounded | Honest quantities | General specs | No prices or brands | Usable | Notes |
|---|---|---|---|---|---|---|---|
| solar-new | not run | | | | | | |
| solar-existing | not run | | | | | | |
| cctv-new | not run | | | | | | |
| cctv-existing | not run | | | | | | |

Manual (not run): on web and phone, Suggest materials, edit one quantity, remove one item, add to list, save, check the version number, open the report and the PDF and look for the AI badge, TBD and provisional markers and the note. Apply migration 0016 first when using the database.

### Findings-first report (D-028): test record and live evaluation

Automated (2026-11-02): reportLayout.test.ts (key findings, one home per fact, recommended actions built from findings, cited photos inside findings and "Other photos", confirmed findings never dropped, older layout kept, preview lock), reportDraft.test.ts (what the model is given, numbered photos, rules in the prompt, sources checked, incomplete or unsourced findings dropped, repeats removed, limits, figures check, the summary stage), report-draft-route.test.ts, report-review.test.ts (findings saved whole and validated, sign-off unaffected), key-finding-limits.test.ts (adapter and editor limits equal), pdf.test.ts, report-findings-guard.test.ts, photoReview.test.ts (fuller photo notes, same bans), cutoff.test.ts, reportEval.test.ts (the evaluation set is valid and the automated checks catch repeats, standards or compliance wording, unchecked items called fine, too many invented figures).

**Live evaluation (not yet run: the OpenRouter account has no purchased credit).** Six made-up jobs are in `packages/ai-adapter/src/__tests__/fixtures/reportCases.ts` (solar and CCTV, new and existing, terse notes, with and without photos, a thin record, and a note that tries to make the AI claim compliance). Run, with the provider set up in `apps/web/.env.local` (a few cents):

```
LIVE_REPORT_EVAL=1 pnpm --filter @eval-ai/ai-adapter exec vitest run src/__tests__/reportEval.live.test.ts
```

It writes `packages/ai-adapter/eval-output/report-eval-latest.md` (not committed). The automated checks are printed per case; then a person scores each report 1 to 5 on the rubric below and records the scores here.

| Rubric question | What good looks like |
|---|---|
| Interprets | Says what the results mean for this job, not just what they were |
| Synthesizes | Related items, notes, measurements and photos are one finding; nothing is said twice |
| Communicates | Professional plain language; terse notes expanded into full sentences; clear, specific actions |
| Honest | No invented figures, standards or compliance; unchecked items are to-dos; unknowns stated |
| Photos | Described as seen, cited as Photo N, labelled as not verified |
| Useful alone | A client could act on it without the checklist |

| Case | Interprets | Synthesizes | Communicates | Honest | Photos | Useful alone | Notes |
|---|---|---|---|---|---|---|---|
| solar-new-sparse-notes | not run | | | | | | |
| solar-existing-faults | not run | | | | | | |
| cctv-new-shop | not run | | | | | | |
| cctv-existing-storage | not run | | | | | | |
| sparse-mostly-unchecked | not run | | | | | | |
| trap-injection-and-fabrication | not run | | | | | | |

### Report as a written-up document (D-027): test record

Automated (2026-11-01): reportLayout.test.ts (plain-language results, glance counts, report without AI, written sections in order, site brief, older snapshots, every written section re-locks the download), reportDraft.test.ts (what the model is given, the rules in its prompt, section limits, figures check), report-draft-route.test.ts (uses the draft's own content, photo choices, foreign and finalized drafts, unconfirmed findings only counted), report-review.test.ts (the draft carries the site brief and readable limitations; longer sections; sign-off still passes), pdf.test.ts (new layout, older reports). Not run: the live model, the browser, a phone.

To be run by a person (needs OpenRouter credit or Meta billing for the AI rows):

| # | Check | Result |
|---|---|---|
| D1 | Job with intake text, scope answers, a measurement, a flagged item and an unchecked required item. Create a draft with AI off: glance counts, site and scope, flagged items and the grouped checklist appear; no raw status codes | not run |
| D2 | Same job with AI on: every section is filled in automatically, reads as a report (not a list of the checklist), and is specific to this site | not run |
| D3 | Read the AI text for anything not in the record: invented sizes, ages, prices, standards, "all fine" for an unchecked item. Note any, and whether "check these figures" caught the numbers | not run |
| D4 | Edit any section: Download PDF locks until previewed again | not run |
| D5 | Sign off the draft; the finalized report is unchanged on download | not run |
| D6 | Open a report finalized before this change: still opens and downloads | not run |
| D7 | Phone: Prepare my report finishes, the preview shows the new order, the notes list anything that failed | not run |
| D8 | AI unavailable (no key or no credit): the draft still has every saved fact and says why the sections are empty | not run |

### Report that reads the photos (D-022): test record

Automated (2026-11-01): report-photos.test.ts (selection, real ffmpeg shrinking), photoReview.test.ts (adapter cleaning, summary rules), report-photos-route.test.ts, reportPhotos.test.ts (HTML sections, unverified labels, no markup injection), report-photos-pdf.test.ts (1, 6 and 12 photos), report-photos-guard.test.ts. Pipeline run once against the real model with three synthetic pictures.

On a phone (to be run by a person; needs OpenRouter credit or Meta billing):

| # | Check | Result |
|---|---|---|
| R1 | Job with 6 real photos, some linked to items, some answers and a finding: Preview report shows the three steps and finishes | not run |
| R2 | The report shows each photo with a caption marked AI, not verified; possible issues are in their own section, not in Findings | not run |
| R3 | The summary mentions the photos as suggestions and does not state a measurement from them | not run |
| R4 | Remove a photo from the draft; make a finding draft from an issue (it appears in Findings as needs review) | not run |
| R5 | Preview report again with 2 new photos: only the new ones are analysed (check cost in OpenRouter) | not run |
| R6 | Airplane mode / no credit: the report is still built, with a clear note about what failed | not run |
| R7 | Download the PDF: pictures and captions readable on 1, 6 and 12 photos | not run |
| R8 | Sign off and finalize with photos in the draft; the finalized report keeps them | not run |

### Guided checklist and site intake (D-021): test record

Automated (2026-11-01): lookFor.test.ts (every item has guidance), intake.test.ts (merge rules, summary), siteIntake.test.ts (adapter cleaning), site-intake-route.test.ts, intake-guard.test.ts. One real-model check with a synthetic picture through OpenRouter: ids real, injection ignored, honest limits, 15.5 s.

On a phone (to be run by a person):

| # | Check | Result |
|---|---|---|
| G1 | Create a job: the intake opens first; Skip goes to the job with the standard checklist | not run |
| G2 | Every checklist item shows "Look for: …" text, also on a job created before this change | not run |
| G3 | Describe by typing and by voice; add 3 real site photos; Guide me; photos appear in Evidence | not run |
| G4 | Review mode: nothing changes until Apply; skipped suggestions are not added | not run |
| G5 | Automatic mode: items are added marked as AI suggestions and can be removed | not run |
| G6 | Start here banner appears on the job; no checklist answer changed | not run |
| G7 | Airplane mode during Guide me: a clear message, photos still saved, Continue works | not run |
| G8 | Does the guidance read well to a technician? Note what is wrong or missing | not run |

### Delete a job (D-020): test record

Automated (2026-11-01): delete-route.test.ts (admin only, typed name for finished jobs, other workspace refused), delete-guard.test.ts (controls only for admins, migration keeps the guard narrow, files removed after the database step). Database (rolled-back transaction on the project): 11 checks pass.

By a person, on a THROWAWAY job after the migration is applied:

| # | Check | Result |
|---|---|---|
| D1 | As admin: delete a draft with a photo and a voice note; job gone from the list; files gone from Storage | not run |
| D2 | As admin: finalize a report, then delete: asked for the site name; wrong name refused; right name deletes job, report row and PDF | not run |
| D3 | As member and as view-only: no Danger zone; calling the API gets 403 | not run |
| D4 | audit trail shows assessment.deleted / assessment.deleted_finalized with the right actor | not run |

### Site situation (D-019): test record

Automated (2026-11-01): scenario.test.ts (rules, checklists per situation, report header), scenario-route.test.ts (create and set rules, inspection forced to existing), situation.test.ts (reaches the AI prompts).

On a phone or in the browser (to be run by a person):

| # | Check | Result |
|---|---|---|
| S1 | New assessment: nothing preselected; Create without choosing shows a message | not run |
| S2 | New installation: field reads "What does the customer want?"; checklist is the site-survey list | not run |
| S3 | Existing system: field reads "What's installed"; checklist is the condition list | not run |
| S4 | New inspection: situation shown as Existing system and cannot be changed | not run |
| S5 | An older assessment shows "Not set" and the two buttons; choosing one sticks and cannot be changed | not run |
| S6 | Job lists and Home show the situation; the report header names it | not run |

## 9. Test record template

For each run, record: - test ID and date; - application
commit/version; - environment; - device/browser; - exact steps; -
expected result; - actual result; - pass/fail/blocked; - evidence or
logs with secrets and personal data redacted; - follow-up issue.
