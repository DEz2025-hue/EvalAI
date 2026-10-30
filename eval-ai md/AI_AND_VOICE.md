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
validation before it can be treated as trusted.

## 6. Live camera status

Continuous live-camera AI guidance is **Coming Soon**. Do not expose a
working-state label until the feature is implemented and tested.

A future implementation must choose and document one of these
patterns: - user manually captures frames and requests analysis; - app
periodically submits selected frames during a guided session; -
provider-supported real-time audio/video session.

Do not assume these patterns have equivalent provider support or cost.
Validate frame rate, latency, data retention, network use, battery use,
camera permissions, interruption handling, privacy, and safe fallback.

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
| Optional segmentation | `sam-3.1` | Raw records only; masks are never measurements |
| Not used | Muse Wonder (preview, ~3-5x cost, evaluate later), Muse Image, any `*-contributor` model | Contributor models let Meta train on content and forbid personal data — refused by the app |

No Meta text-to-speech exists; spoken replies would use the device's own speech engine.

### Rules the code enforces
Standard models only; inline media only (no Files API, so Zero Data Retention stays possible); no temperature overrides; schema-constrained JSON; evidence ids limited to real ones; retry only 429/500/503 (never 504 or timeouts); every transcript and AI draft is unconfirmed until a person reviews it; usage is logged per workspace (`ai_runs`) with an optional daily cap (`AI_DAILY_COST_CAP_USD`).

### Go-live runbook
1. Meta dashboard: complete billing for the team (the 402 response links to the billing page).
2. Environment (server only): `AI_PROVIDER_API_KEY`, `AI_PROVIDER_BASE_URL=https://api.meta.ai`, and the versioned model ids from `.env.example`. Unversioned ids (`muse-spark`) are mapped automatically but should be corrected.
3. Sign in as an owner/admin and open `/api/ai/health` (free): configured models must all exist in the catalog.
4. Open `/api/verify/provider`: every check must pass (structured JSON, image input, voice). Record failures with the provider error code.
5. Deploy preview: confirm the transcription function includes the ffmpeg binary and stays within the function size limit; record a 30 second voice note on web and on a phone and confirm the transcript.
6. Read Meta's AI Developer Legal Center terms (retention, abuse monitoring, regions) and decide whether Zero Data Retention is required before the first paying customer.
7. Set `AI_DAILY_COST_CAP_USD` to a conservative value; watch `ai_runs` for the first week (cost per job, p95 latency, error codes).

### Still to do after billing works
Build the evaluation set (about 30 synthetic solar/CCTV cases, including fabricated-evidence and prompt-injection traps) and use it to confirm the reasoning-level defaults and decide whether Muse Wonder is worth offering for deep review. Implement the SAM record parser from a real response.
