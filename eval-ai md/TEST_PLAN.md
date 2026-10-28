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

## 9. Test record template

For each run, record: - test ID and date; - application
commit/version; - environment; - device/browser; - exact steps; -
expected result; - actual result; - pass/fail/blocked; - evidence or
logs with secrets and personal data redacted; - follow-up issue.
