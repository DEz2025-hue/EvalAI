-- 0009: role-aware write policies, integrity, atomic versioning, finding/checklist columns.
-- Fixes (audit): viewers could write; audit_events had no RLS; missing UPDATE/DELETE policies;
-- cross-tenant FK inserts; non-atomic versioning/checklist replace; draft-snapshot delete bug.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function is_workspace_member(ws uuid) returns boolean as $$
  select exists(select 1 from workspace_memberships where workspace_id = ws and user_id = auth.uid());
$$ language sql stable security definer set search_path = public;

-- Role check: viewer is read-only. Writers = owner/admin/member.
create or replace function has_workspace_role(ws uuid, roles text[]) returns boolean as $$
  select exists(
    select 1 from workspace_memberships
    where workspace_id = ws and user_id = auth.uid() and role = any(roles)
  );
$$ language sql stable security definer set search_path = public;

create or replace function can_write_workspace(ws uuid) returns boolean as $$
  select has_workspace_role(ws, array['owner','admin','member']);
$$ language sql stable security definer set search_path = public;

create or replace function assessment_workspace(a uuid) returns uuid as $$
  select workspace_id from assessments where id = a;
$$ language sql stable security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- audit_events: enable RLS; clients may only read (app writes via service role)
-- ---------------------------------------------------------------------------
alter table audit_events enable row level security;
revoke insert, update, delete on audit_events from anon, authenticated;
drop policy if exists "members select audit" on audit_events;
create policy "members select audit" on audit_events for select
  using (workspace_id is not null and is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------------
-- created_by defaults so inserts through the user client satisfy RLS
-- ---------------------------------------------------------------------------
alter table assessments alter column created_by set default auth.uid();
alter table evidence_items alter column created_by set default auth.uid();
alter table materials_lists alter column created_by set default auth.uid();
alter table quotations alter column created_by set default auth.uid();
alter table report_snapshots alter column created_by set default auth.uid();

-- ---------------------------------------------------------------------------
-- Role-aware write policies (drop old member-only ones, recreate with role check)
-- ---------------------------------------------------------------------------
-- sites
drop policy if exists "members insert sites" on sites;
drop policy if exists "members update sites" on sites;
create policy "writers insert sites" on sites for insert with check (can_write_workspace(workspace_id));
create policy "writers update sites" on sites for update using (can_write_workspace(workspace_id)) with check (can_write_workspace(workspace_id));
create policy "admins delete sites" on sites for delete using (has_workspace_role(workspace_id, array['owner','admin']));

-- assessments
drop policy if exists "members insert assessments" on assessments;
drop policy if exists "members update assessments" on assessments;
drop policy if exists "members delete assessments" on assessments;
create policy "writers insert assessments" on assessments for insert
  with check (can_write_workspace(workspace_id) and created_by = auth.uid());
create policy "writers update assessments" on assessments for update
  using (can_write_workspace(workspace_id)) with check (can_write_workspace(workspace_id));
create policy "admins delete assessments" on assessments for delete
  using (has_workspace_role(workspace_id, array['owner','admin']));

-- checklist_items
drop policy if exists "members insert checklist_items" on checklist_items;
drop policy if exists "members update checklist_items" on checklist_items;
drop policy if exists "members delete checklist_items" on checklist_items;
create policy "writers insert checklist_items" on checklist_items for insert
  with check (can_write_workspace(assessment_workspace(assessment_id)));
create policy "writers update checklist_items" on checklist_items for update
  using (can_write_workspace(assessment_workspace(assessment_id)))
  with check (can_write_workspace(assessment_workspace(assessment_id)));
create policy "writers delete checklist_items" on checklist_items for delete
  using (can_write_workspace(assessment_workspace(assessment_id)));

-- checklist_responses (item must belong to the same assessment)
drop policy if exists "members upsert responses" on checklist_responses;
drop policy if exists "members update responses" on checklist_responses;
create policy "writers insert responses" on checklist_responses for insert
  with check (
    can_write_workspace(assessment_workspace(assessment_id))
    and exists (select 1 from checklist_items i where i.id = item_id and i.assessment_id = checklist_responses.assessment_id)
  );
create policy "writers update responses" on checklist_responses for update
  using (can_write_workspace(assessment_workspace(assessment_id)))
  with check (
    can_write_workspace(assessment_workspace(assessment_id))
    and exists (select 1 from checklist_items i where i.id = item_id and i.assessment_id = checklist_responses.assessment_id)
  );
create policy "writers delete responses" on checklist_responses for delete
  using (can_write_workspace(assessment_workspace(assessment_id)));

-- evidence_items (assessment, when set, must be in the same workspace)
drop policy if exists "members insert evidence" on evidence_items;
drop policy if exists "members delete evidence" on evidence_items;
create policy "writers insert evidence" on evidence_items for insert
  with check (
    can_write_workspace(workspace_id)
    and (assessment_id is null or assessment_workspace(assessment_id) = workspace_id)
  );
create policy "writers update evidence" on evidence_items for update
  using (can_write_workspace(workspace_id)) with check (can_write_workspace(workspace_id));
create policy "writers delete evidence" on evidence_items for delete using (can_write_workspace(workspace_id));

-- findings
drop policy if exists "members insert findings" on findings;
drop policy if exists "members update findings" on findings;
create policy "writers insert findings" on findings for insert
  with check (can_write_workspace(assessment_workspace(assessment_id)));
create policy "writers update findings" on findings for update
  using (can_write_workspace(assessment_workspace(assessment_id)))
  with check (can_write_workspace(assessment_workspace(assessment_id)));
create policy "writers delete findings" on findings for delete
  using (can_write_workspace(assessment_workspace(assessment_id)));

-- report_snapshots: insert + (draft only, guarded by trigger) update; no client delete of finalized
drop policy if exists "members insert reports" on report_snapshots;
create policy "writers insert reports" on report_snapshots for insert
  with check (can_write_workspace(workspace_id) and assessment_workspace(assessment_id) = workspace_id);
create policy "writers update reports" on report_snapshots for update
  using (can_write_workspace(workspace_id)) with check (can_write_workspace(workspace_id));
create policy "admins delete reports" on report_snapshots for delete
  using (has_workspace_role(workspace_id, array['owner','admin']));

-- materials / quotations
drop policy if exists "members insert materials_lists" on materials_lists;
drop policy if exists "members insert materials_items" on materials_items;
drop policy if exists "members insert quotations" on quotations;
drop policy if exists "members insert quotation_items" on quotation_items;

create policy "writers insert materials_lists" on materials_lists for insert
  with check (can_write_workspace(workspace_id) and assessment_workspace(assessment_id) = workspace_id);
create policy "writers update materials_lists" on materials_lists for update
  using (can_write_workspace(workspace_id)) with check (can_write_workspace(workspace_id));
create policy "writers delete materials_lists" on materials_lists for delete using (can_write_workspace(workspace_id));

create policy "writers insert materials_items" on materials_items for insert
  with check (exists(select 1 from materials_lists l where l.id = list_id and can_write_workspace(l.workspace_id)));
create policy "writers update materials_items" on materials_items for update
  using (exists(select 1 from materials_lists l where l.id = list_id and can_write_workspace(l.workspace_id)))
  with check (exists(select 1 from materials_lists l where l.id = list_id and can_write_workspace(l.workspace_id)));
create policy "writers delete materials_items" on materials_items for delete
  using (exists(select 1 from materials_lists l where l.id = list_id and can_write_workspace(l.workspace_id)));

create policy "writers insert quotations" on quotations for insert
  with check (
    can_write_workspace(workspace_id)
    and assessment_workspace(assessment_id) = workspace_id
    and exists(select 1 from materials_lists l where l.id = materials_list_id and l.assessment_id = quotations.assessment_id)
  );
create policy "writers update quotations" on quotations for update
  using (can_write_workspace(workspace_id)) with check (can_write_workspace(workspace_id));
create policy "writers delete quotations" on quotations for delete using (can_write_workspace(workspace_id));

create policy "writers insert quotation_items" on quotation_items for insert
  with check (exists(select 1 from quotations q where q.id = quotation_id and can_write_workspace(q.workspace_id)));
create policy "writers update quotation_items" on quotation_items for update
  using (exists(select 1 from quotations q where q.id = quotation_id and can_write_workspace(q.workspace_id)))
  with check (exists(select 1 from quotations q where q.id = quotation_id and can_write_workspace(q.workspace_id)));
create policy "writers delete quotation_items" on quotation_items for delete
  using (exists(select 1 from quotations q where q.id = quotation_id and can_write_workspace(q.workspace_id)));

-- workspaces: owners may rename/delete
create policy "owners update workspace" on workspaces for update
  using (has_workspace_role(id, array['owner'])) with check (has_workspace_role(id, array['owner']));
create policy "owners delete workspace" on workspaces for delete using (has_workspace_role(id, array['owner']));

-- ---------------------------------------------------------------------------
-- Stale quotations are derived at read time (quote.materials_version < latest list version).
-- The old trigger only touched the changed list's quotes and could not run under RLS.
-- ---------------------------------------------------------------------------
drop trigger if exists trg_materials_stale on materials_items;
drop function if exists mark_quotations_stale();

-- ---------------------------------------------------------------------------
-- Snapshot guard: fix delete (returned NULL, silently cancelling draft deletes)
-- ---------------------------------------------------------------------------
create or replace function guard_finalized_snapshot() returns trigger as $$
begin
  if old.finalized = true then
    raise exception 'Finalized report snapshot is immutable — create a new snapshot instead';
  end if;
  return coalesce(new, old);
end; $$ language plpgsql;

-- ---------------------------------------------------------------------------
-- Atomic versioning: server allocates versions under an advisory lock; unique constraints.
-- ---------------------------------------------------------------------------
create or replace function allocate_snapshot_version() returns trigger as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('snap:' || new.assessment_id::text, 0));
  select coalesce(max(assessment_version), 0) + 1 into new.assessment_version
    from report_snapshots where assessment_id = new.assessment_id;
  return new;
end; $$ language plpgsql;

drop trigger if exists trg_allocate_snapshot_version on report_snapshots;
create trigger trg_allocate_snapshot_version before insert on report_snapshots
  for each row execute function allocate_snapshot_version();

create unique index if not exists report_snapshots_assessment_version_key
  on report_snapshots (assessment_id, assessment_version);
create unique index if not exists materials_lists_assessment_version_key
  on materials_lists (assessment_id, version);

-- Save a materials list + items atomically; version allocated server-side. Runs as the caller (RLS applies).
create or replace function save_materials_list(p_assessment uuid, p_items jsonb)
returns table (list_id uuid, version int) language plpgsql as $$
declare
  ws uuid;
  v int;
  lid uuid;
begin
  select workspace_id into ws from assessments where id = p_assessment;
  if ws is null then raise exception 'Forbidden — assessment not found in your workspace' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('mat:' || p_assessment::text, 0));
  select coalesce(max(l.version), 0) + 1 into v from materials_lists l where l.assessment_id = p_assessment;
  insert into materials_lists (assessment_id, workspace_id, version, created_by)
    values (p_assessment, ws, v, auth.uid()) returning id into lid;
  insert into materials_items (list_id, description, specification, quantity, unit, rationale, source, provisional, assumptions, finding_id, ord)
    select lid, x.description, x.specification, x.quantity, x.unit, x.rationale, x.source,
           coalesce(x.provisional, false), coalesce(x.assumptions, '[]'::jsonb), x.finding_id, x.ord
    from jsonb_to_recordset(p_items) as x(description text, specification text, quantity double precision, unit text,
         rationale text, source text, provisional boolean, assumptions jsonb, finding_id uuid, ord int);
  return query select lid, v;
end $$;

-- ---------------------------------------------------------------------------
-- Checklist provenance + atomic replace that preserves item ids (and thus responses/evidence links)
-- ---------------------------------------------------------------------------
alter table checklist_items
  add column if not exists source text not null default 'established'
    check (source in ('established','user','ai_suggested')),
  add column if not exists rationale text;

create or replace function replace_checklist(p_assessment uuid, p_items jsonb)
returns setof checklist_items language plpgsql as $$
declare
  rec jsonb;
  rid uuid;
  pos int := 0;
  keep uuid[] := '{}';
begin
  if not exists (select 1 from assessments where id = p_assessment) then
    raise exception 'Forbidden — assessment not found in your workspace' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('chk:' || p_assessment::text, 0));
  for rec in select * from jsonb_array_elements(p_items) loop
    rid := nullif(rec->>'id', '')::uuid;
    if rid is not null and exists (select 1 from checklist_items where id = rid and assessment_id = p_assessment) then
      update checklist_items set
        title = rec->>'title',
        instructions = rec->>'instructions',
        required = coalesce((rec->>'required')::boolean, false),
        ord = pos,
        category = rec->>'category',
        source = coalesce(rec->>'source', source),
        rationale = rec->>'rationale'
      where id = rid;
    else
      insert into checklist_items (assessment_id, title, instructions, required, ord, category, source, rationale)
      values (p_assessment, rec->>'title', rec->>'instructions', coalesce((rec->>'required')::boolean, false), pos,
              rec->>'category', coalesce(rec->>'source', 'user'), rec->>'rationale')
      returning id into rid;
    end if;
    keep := keep || rid;
    pos := pos + 1;
  end loop;
  delete from checklist_items where assessment_id = p_assessment and not (id = any(keep));
  return query select * from checklist_items where assessment_id = p_assessment order by ord;
end $$;

-- ---------------------------------------------------------------------------
-- Findings: persist the reviewed content (previously dropped) + reviewer attribution
-- ---------------------------------------------------------------------------
alter table findings
  add column if not exists description text,
  add column if not exists uncertainty text,
  add column if not exists missing_inputs jsonb not null default '[]'::jsonb,
  add column if not exists reviewed_by uuid references auth.users(id),
  add column if not exists reviewed_at timestamptz;

-- ---------------------------------------------------------------------------
-- Storage bucket limits (server-side validated uploads; defence in depth)
-- ---------------------------------------------------------------------------
update storage.buckets set file_size_limit = 26214400,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf','audio/webm','audio/mp4','audio/mpeg','audio/ogg','audio/wav','audio/x-m4a']
  where id = 'evidence';
update storage.buckets set file_size_limit = 26214400, allowed_mime_types = array['application/pdf','image/jpeg','image/png']
  where id = 'reports';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists assessments_ws_created_idx on assessments (workspace_id, created_at desc);
create index if not exists checklist_items_assessment_ord_idx on checklist_items (assessment_id, ord);
create index if not exists evidence_items_assessment_idx on evidence_items (assessment_id);
create index if not exists evidence_items_workspace_idx on evidence_items (workspace_id);
create index if not exists findings_assessment_idx on findings (assessment_id);
create index if not exists report_snapshots_assessment_created_idx on report_snapshots (assessment_id, created_at desc);
create index if not exists quotations_assessment_idx on quotations (assessment_id);
create index if not exists quotation_items_quotation_idx on quotation_items (quotation_id);
create index if not exists audit_events_ws_created_idx on audit_events (workspace_id, created_at desc);
create index if not exists workspace_memberships_user_idx on workspace_memberships (user_id);
create index if not exists materials_items_list_idx on materials_items (list_id);
