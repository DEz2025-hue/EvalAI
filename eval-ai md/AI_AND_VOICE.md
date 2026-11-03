# AI, Voice, Photos, and Live Camera

## 1. General AI principles

AI is an assistant to the technician, not the authoritative source of
site facts. AI outputs must be reviewable, traceable, and clearly marked
as drafts until confirmed.

-   Never invent measurements, equipment specifications, defects,
    compliance results, supplier prices, or quotations.
-   State assumptions, uncertainty, missing inputs, and limitations.
-   Preserve original observations, audio, measurements, and evidence.
-   Let users edit, accept, or reject AI-generated content.
-   Use AI only when requested, except for explicitly approved
    user-facing voice interactions.
-   Keep deterministic calculations separate from generative model
    output.
-   Continue core capture and saved-fact report assembly when AI is
    unavailable.

## 2. Provider capability verification

The intended provider direction is Meta Model API, but implementation
must verify the actual account and selected model. Do not assume support
for image inputs, audio inputs, transcription, speech generation,
streaming, or continuous video.

Before enabling each capability: 1. inspect current provider
documentation and account access; 2. test with synthetic, non-sensitive
data; 3. validate request and response formats; 4. measure latency,
failure rates, and usage; 5. review terms, privacy, retention, and
external processing; 6. implement limits, error handling, and fallback;
7. record the result in `FEATURE_STATUS.md` and `DECISIONS.md`.

## 3. Initial-release voice behavior

Voice is a planned initial-release capability, not merely a future
placeholder.

Required product behavior: - user can explicitly start and stop voice
input or recording; - recording state is visible; - microphone
permission is requested only when necessary; - spoken observations can
be attached to a site, assessment, inspection, checklist item, or
finding; - transcription, if enabled, remains editable and unconfirmed
until reviewed; - original audio is preserved where supported and
permitted; - user can cancel or discard a recording; - user can switch
to typing when voice is unavailable; - the interface communicates errors
and saving/sync status.

Spoken AI replies and continuous two-way voice conversation should be
implemented for the initial release only if the selected provider and
platform can support them reliably within the project's verified
constraints. If not, ship useful voice input and saved voice notes
first, document the gap, and do not pretend real-time conversation is
working.

## 4. Voice data and technical safeguards

-   Treat speech transcripts as untrusted user input.
-   Never convert ambiguous speech into a precise technical value
    without confirmation.
-   Preserve units and ask follow-up questions when values could be
    misheard.
-   Do not mark checklist items Pass solely because a voice statement
    says they passed; use the user's explicit status action and
    applicable evidence.
-   Avoid logging raw audio or full transcripts by default.
-   Disclose external processing and retention behavior.
-   Never record in the background without clear, lawful, user-visible
    behavior.

## 5. Initial-release photo behavior

-   Capture or upload photos.
-   Attach photos to the correct workspace, site, assessment/inspection,
    and checklist item.
-   Store evidence privately.
-   Let the user request AI analysis of a photo.
-   Validate image input support before enabling provider analysis.
-   Return findings as suggestions linked to the source image.
-   Display uncertainty and identify when the image is insufficient.
-   Preserve the original image and user notes.

AI must not claim to see details that are not visible, infer hidden
wiring conditions, or present a visual estimate as a verified
measurement. Any photo-assisted measurement feature requires separate
validation before it can be treated as trusted. The mobile "Measure from a
photo" feature (DECISIONS.md D-014) scales from a reference object of known
size, is always labelled a photo estimate, and its accuracy has not been
validated.

## 6. Live camera status

Real-time (continuous video) live-camera AI guidance is **Coming Soon**. A live
session using periodic and manual frames (D-015) is in **Beta** on the mobile
app only (section 6.1). Do not expose a working-state label for anything that
has not been implemented and tested.

A future implementation must choose and document one of these
patterns: - user manually captures frames and requests analysis; - app
periodically submits selected frames during a guided session; -
provider-supported real-time audio/video session.

Do not assume these patterns have equivalent provider support or cost.
Validate frame rate, latency, data retention, network use, battery use,
camera permissions, interruption handling, privacy, and safe fallback.

### 6.1 Live session beta (periodic and manual frames)

-   The phone shows a camera preview. A still is taken every 10, 20 or 30
    seconds, or when the person taps Capture. Video is never recorded.
-   Narration (D-017, on by default): the microphone records the person's
    voice in pieces of about 45 seconds. Each piece is saved privately with the
    job, transcribed, and shown as an editable, unconfirmed transcript linked
    by time to the pictures taken while it was said. Numbers and units are
    highlighted to check. Spoken words never change a checklist answer; the
    person confirms the text and chooses to add it as a note on the item or as
    a finding draft.
-   "AI second pair of eyes" (off by default): the stills are also sent to the
    AI, as described below.
-   A consent step comes first; a LIVE · camera on · microphone recording (or
    "not recording") indicator is always visible; the session, camera and
    microphone end when the app leaves the screen, after 30 minutes, or after
    90 pictures.
-   Each AI note is a suggestion that needs review. The AI never changes a
    checklist status, creates a finding or evidence, or gives a measurement.
    Saving a picture or adding a finding draft needs an explicit tap.
-   If the AI is unavailable the session continues capture-only.
-   Frames go to the provider inline, are not stored or logged by the server,
    and are temporary files on the phone that are deleted unless saved.
-   Status: implemented, unit tested with mocked provider responses, **not yet
    verified on a device or against the live provider**.

### 6.2 Meta glasses

Design only (D-016). Glasses would be another frame source for the same session.
Meta's toolkit is a developer preview and apps using it cannot be published yet.

## 7. Structured AI operations

Candidate domain operations: - `clarifyContext` - `proposeChecklist` -
`analyzeAssessment` - `draftFinding` - `draftRecommendation` -
`transcribeAudio` - `generateSpeech` - `analyzeImage` - `draftReport`

Only enable operations supported by the selected provider and tested
implementation. Each operation needs schema validation, request limits,
timeouts, bounded retries, authorization, provenance, and safe failure
behavior.

## 8. AI output structure

Where practical, require structured fields such as: - `summary` -
`observations` - `potential_findings` - `recommendations` -
`missing_information` - `assumptions` - `uncertainty` -
`evidence_references` - `requires_human_review`

The application must validate every field and verify that referenced
evidence belongs to the current authorized assessment. Do not persist
arbitrary model output as trusted domain state.

## 9. Failure and fallback

If the provider is unavailable, the request is rejected, or a limit is
reached: - keep all saved user work; - show a useful error without
internal details or secrets; - permit retry when safe; - retain manual
workflow functionality; - do not create fake or cached output that
appears to be new analysis; - record redacted diagnostics.


## 10. Provider facts and go-live runbook (verified 2026-10-30)

**Status: code complete, NOT yet verified live.** The provider key works, but every inference call returned `402 billing_not_configured` because billing was not set up on the Meta team. Until billing is enabled the app degrades gracefully: AI buttons show "AI assistance is not available yet" and every manual workflow keeps working.

### Models in use (Meta Model API, base `https://api.meta.ai/v1`)
| Use | Model | Notes |
|---|---|---|
| Clarify, checklist suggestions, analysis, photo analysis, report draft | `muse-spark-1.3` | Reasoning level and token budget set per operation (`packages/ai-adapter/src/config.ts`) |
| Voice notes | `muse-voice-transcribe-1.0` | WAV only (mono 16-bit, 16/24 kHz, 10 min, 32 MB); the server converts webm/m4a |
| Marks on report photos (D-041), and the reference object for photo measuring | `sam-3.1` | Boxes only; never findings or measurements |
| Senior review and project plan (D-039) | `muse-wonder-1.0` | Falls back to Spark on 429 or 503; `AI_MODEL_PLAN`, `AI_EFFORT_PLAN` (default low), `AI_MAX_TOKENS_PLAN`, 55 s |
| Not used | Muse Image, any `*-contributor` model | Contributor models let Meta train on content and forbid personal data — refused by the app |

No Meta text-to-speech exists; spoken replies would use the device's own speech engine.

### Rules the code enforces
Standard models only; inline media only (no Files API, so Zero Data Retention stays possible); no temperature overrides; schema-constrained JSON; evidence ids limited to real ones; retry only 429/500/503 (never 504 or timeouts); every transcript and AI draft is unconfirmed until a person reviews it; usage is logged per workspace (`ai_runs`) with an optional daily cap (`AI_DAILY_COST_CAP_USD`).

### Go-live runbook
1. Meta dashboard: complete billing for the team (the 402 response links to the billing page).
2. Environment (server only, in `apps/web/.env.local`): `META_API_KEY`, and the versioned model ids from `.env.example`. Restart the web server after changing it. The older `AI_PROVIDER_API_KEY` / `AI_PROVIDER_BASE_URL` pair still works. Unversioned model ids (`muse-spark`) are mapped automatically but should be corrected. Billing and configuration errors say the provider is Meta, and `/api/verify/provider` and `/api/ai/health` report which provider they tested. A $15 consumer plan is not necessarily the Model API billing: the 402 `billing_not_configured` links to the team billing page that matters.
3. Sign in as an owner/admin and open `/api/ai/health` (free): configured models must all exist in the catalog.
4. Open `/api/verify/provider`: every check must pass (structured JSON, image input, voice). Record failures with the provider error code.
5. Deploy preview: confirm the transcription function includes the ffmpeg binary and stays within the function size limit; record a 30 second voice note on web and on a phone and confirm the transcript.
6. Read Meta's AI Developer Legal Center terms (retention, abuse monitoring, regions) and decide whether Zero Data Retention is required before the first paying customer.
7. Set `AI_DAILY_COST_CAP_USD` to a conservative value; watch `ai_runs` for the first week (cost per job, p95 latency, error codes).

### Answers cut off by the token limit
Reasoning tokens count against `max_completion_tokens`, so a reasoning model can spend the whole budget thinking and leave no answer ("The AI returned an unusable answer"). `chatJson` now retries a cut-off call once with the reasoning effort stepped down to `low` (an effort already at `low` stays) and 50% more room. The cut-off call is logged as `truncated` and counted in spend. If the retry is cut off too, the person sees "The AI ran out of room before finishing. Try again, or use fewer photos." Site intake now defaults to `low` effort and 8000 tokens (`AI_EFFORT_INTAKE`, `AI_MAX_TOKENS_INTAKE`). The server log names the case for an unusable answer: cut off, empty, or not valid JSON.

### The report write-up (D-027, D-028)
**D-028 changed what `draftReport` writes.** It now returns a few KEY FINDINGS (each: title, priority, observed, what it means, recommended action, and its sources) plus an executive summary, a site overview and open items, instead of six prose sections. The prompt asks it to interpret the evidence, synthesize related items, notes, measurements and photos into one finding each, and communicate in professional language (expanding terse notes into full sentences without adding facts). "What it means" may use general technical knowledge of the trade as general explanation; it still may not add site facts, figures, standards, clause numbers or compliance statements, and the rules below about unchecked items, unconfirmed findings and unverified photo notes are unchanged. The server checks every source the model names against the real report (item titles, photo numbers turned back into evidence ids, measurement names, confirmed finding titles), drops incomplete findings and findings with no real source, removes sentences repeated between the summary or open items and the findings, caps lengths, and lists figures that are not in the data. A second small call (`stage: "summary"`) rewrites the summary and open items from findings the person has edited. Photo notes are fuller (caption of about two sentences, up to ten observations with apparent condition and readable labels, qualitative only) and are cited in the findings as "Photo N". The text below describes the first version (D-027) and still applies to the data sent and the guard rails.

`draftReport` first wrote the prose of a report: summary, site and scope, what was found by area, issues and risks, next steps, and open items (about 12000 tokens at most, `AI_MAX_TOKENS_REPORT`; reasoning effort `low` by default, `AI_EFFORT_REPORT`: writing up recorded facts needs little reasoning, and a first live try at `medium` was cut off by the token limit while `low` finished in about 12 seconds on roughly 3900 tokens — one run each, the first possibly limited by low account credit). It is given the same content the report shows (checklist with area, required flag, measurement and photo count; confirmed findings; measurements; limitations; materials; the site brief with intake text and scope answers; counts taken from the checklist; the person's chosen photo notes) and is run automatically when a draft is created. It may group, connect and explain the recorded facts and propose next steps worded as things to check, confirm or have a qualified person assess. It may not add conditions, causes, ages, sizes, capacities, counts, prices, standards or compliance claims that are not in the data, call an unchecked item fine, describe a finding nobody has confirmed (only how many are waiting is sent), or treat a photo note or a template's "look for" text as an observation. Any figure with a unit, a percentage or an amount in its text that is not in the data is listed for the reviewer to check. Everything it writes is a draft the person edits and signs off.

### Site interview (D-030)

Two operations share `AI_MODEL_INTERVIEW`, `AI_EFFORT_INTERVIEW` (default low) and `AI_MAX_TOKENS_INTERVIEW` (default 5000, 55 s): `POST /api/ai/interview` returns the next question (or "enough"), and `POST /api/ai/interview/digest` turns the finished conversation into proposals. Both build the record from stored facts and save nothing; the screen stores the conversation with the job through the normal job update. Questions are read aloud with `expo-speech` on the phone and `speechSynthesis` in the browser, never with a provider voice. Answers by voice reuse the voice note recorder and `/api/ai/transcribe` (Meta; if transcription is unavailable the screen falls back to typing). Every digest proposal carries an exact quote from the person, checked in code.

### Materials proposals (D-029)

`POST /api/ai/materials` (writers only, rate limited) calls the `proposeMaterials` operation (`AI_MODEL_MATERIALS`, `AI_EFFORT_MATERIALS` default low, `AI_MAX_TOKENS_MATERIALS` default 10000, 58 s). The model gets the whole record, the existing list and the documented rules as data. It chooses items, a method for each quantity (rule, estimate or unknown) and, for a rule, the rule id and inputs. The adapter replaces measurement inputs with the recorded values, turns unfindable "record" figures into assumptions, drops duplicates of the existing list and items without a reason, removes prices and model numbers from specifications, keeps only supports that exist in the record, and flags figures in the text that are not in the record. The route then runs the rule arithmetic in code (`applyRule`) and returns a draft; nothing is saved. Prices are never produced.

### Photos in a report are the person's choice (D-024)
Each analysed photo is added to the report or left out by the person's explicit answer; unanswered photos stay out. The report is previewed in full before a draft can be downloaded.

### Live session follows the checklist (D-023)
The live session shows the current checklist item and what to look for, links pictures, narration and AI notes to it, and lets the person mark it with a tap. The AI may add a suggestion of what it saw of the look-for text and what is still to show; it never marks an item or moves on.

### Report photos (D-022)
When a report is prepared the AI describes each photo and lists possible issues to check. These notes are unverified: shown in their own labelled sections, never as findings, never changing an answer. The summary is drafted with them as unverified input.

### Site intake (D-021)
A job can start with a description and up to twenty photos (with more than eight, the AI copies are 768 px instead of 1024 px so one request stays under the server body limit). The AI suggests where to start, extra items and a sharper look-for text; it never fills in checklist answers, and the person either reviews each suggestion or lets them be added (marked as AI suggestions). Photos are saved as evidence first; only small copies go to the AI.

### Still to do after billing works
Build the evaluation set (about 30 synthetic solar/CCTV cases, including fabricated-evidence and prompt-injection traps) and use it to confirm the reasoning-level defaults and decide whether Muse Wonder is worth offering for deep review. Implement the SAM record parser from a real response.
