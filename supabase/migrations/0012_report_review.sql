-- 0012: report review and sign-off.
-- A draft snapshot can be edited (narrative lives in snapshot_payload.narrative) until a person reviews it and
-- finalizes it. Finalizing records who signed off, when, and any note. Finalized snapshots stay immutable
-- (guard_finalized_snapshot from 0004/0009 rejects any later UPDATE or DELETE).

alter table report_snapshots
  add column if not exists reviewed_by uuid references auth.users(id),
  add column if not exists reviewed_by_label text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

-- A finalized snapshot must carry its sign-off.
alter table report_snapshots
  drop constraint if exists report_snapshots_signoff_check;
alter table report_snapshots
  add constraint report_snapshots_signoff_check
  check (finalized = false or (reviewed_by is not null and reviewed_at is not null)) not valid;
-- NOT VALID: snapshots finalized before this migration (which had no sign-off) are left untouched;
-- every new/updated row is checked.
