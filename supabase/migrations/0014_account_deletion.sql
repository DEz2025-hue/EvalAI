-- APPLIED to project gmzstzqmbsuqwserlaul (10 user FKs now ON DELETE SET NULL; sign-off check + guard
-- verified in a rolled-back test: edits blocked, user detach allowed, draft delete and workspace cascade work;
-- advisor shows no new findings).
-- Account deletion support.
--  1. Rows a user created or reviewed stay with their workspace when the account is deleted:
--     every auth.users reference that had no ON DELETE rule becomes ON DELETE SET NULL
--     (the UI shows these as "Deleted user"). Memberships already cascade.
--  2. The finalized-report guard allowed nothing at all. It now also allows:
--     - clearing created_by / reviewed_by (and nothing else) — needed for (1); the printed
--       reviewer name (reviewed_by_label) is part of the signed record and is kept;
--     - deletes cascading from a workspace that is being deleted.
--  3. Bug fix: the guard returned NEW on DELETE, which is always NULL in a BEFORE DELETE
--     trigger, so deleting any draft snapshot was silently skipped (and broke cascades).

do $$
declare
  ref record;
  con text;
begin
  for ref in
    select * from (values
      ('workspaces', 'created_by'),
      ('assessments', 'created_by'),
      ('evidence_items', 'created_by'),
      ('report_snapshots', 'created_by'),
      ('report_snapshots', 'reviewed_by'),
      ('audit_events', 'actor'),
      ('materials_lists', 'created_by'),
      ('quotations', 'created_by'),
      ('findings', 'reviewed_by'),
      ('measurements', 'created_by')
    ) as t(tbl, col)
  loop
    select c.conname into con
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f'
      and c.conrelid = ('public.' || ref.tbl)::regclass
      and c.confrelid = 'auth.users'::regclass
      and a.attname = ref.col;
    if con is null then
      raise exception 'No auth.users foreign key found on %.%', ref.tbl, ref.col;
    end if;
    execute format('alter table public.%I drop constraint %I', ref.tbl, con);
    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references auth.users(id) on delete set null',
      ref.tbl, con, ref.col
    );
  end loop;
end $$;

-- 0012 required reviewed_by on finalized snapshots. A deleted reviewer clears that id, so the
-- printed reviewer name (always written at sign-off) now satisfies the requirement too.
alter table report_snapshots
  drop constraint if exists report_snapshots_signoff_check;
alter table report_snapshots
  add constraint report_snapshots_signoff_check
  check (finalized = false or ((reviewed_by is not null or reviewed_by_label is not null) and reviewed_at is not null)) not valid;

create or replace function guard_finalized_snapshot() returns trigger as $$
begin
  if tg_op = 'DELETE' then
    -- Cascade from a workspace being deleted (the workspace row is already gone).
    if old.finalized and exists (select 1 from workspaces w where w.id = old.workspace_id) then
      raise exception 'Finalized report snapshot is immutable — create a new snapshot instead (Phase 6 exit gate)';
    end if;
    return old;
  end if;

  if old.finalized then
    -- Only allow detaching a deleted account: user ids cleared, every other column unchanged.
    if (new.created_by is distinct from old.created_by and new.created_by is not null)
       or (new.reviewed_by is distinct from old.reviewed_by and new.reviewed_by is not null)
       or (to_jsonb(new) - 'created_by' - 'reviewed_by') is distinct from (to_jsonb(old) - 'created_by' - 'reviewed_by') then
      raise exception 'Finalized report snapshot is immutable — create a new snapshot instead (Phase 6 exit gate)';
    end if;
  end if;
  return new;
end; $$ language plpgsql set search_path = public;
