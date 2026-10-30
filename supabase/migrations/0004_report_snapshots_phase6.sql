-- Phase 6: report snapshots hardening — immutability, finalized, checklist_version, html preview, payload
-- Extends 0001 report_snapshots with Phase 6 requirements (versioned immutable snapshots, no silent mutation)

alter table report_snapshots
  add column if not exists finalized boolean not null default false,
  add column if not exists checklist_version text not null default 'v1',
  add column if not exists html_preview text,
  add column if not exists snapshot_payload jsonb not null default '{}'::jsonb;

-- Ensure existing rows have finalized false

-- Immutability guard: finalized snapshots must not be updated or deleted via trigger
create or replace function guard_finalized_snapshot() returns trigger as $$
begin
  if old.finalized = true then
    raise exception 'Finalized report snapshot is immutable — create a new snapshot instead (Phase 6 exit gate)';
  end if;
  return new;
end; $$ language plpgsql;

drop trigger if exists trg_guard_finalized_snapshot on report_snapshots;
create trigger trg_guard_finalized_snapshot
  before update or delete on report_snapshots
  for each row execute function guard_finalized_snapshot();

-- Read policies already exist from 0001/0002; ensure list by assessment works via existing members select policy
