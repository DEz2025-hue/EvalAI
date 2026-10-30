-- RLS regression suite for EvalAI. Plain SQL, no extensions.
--
-- Everything runs inside one transaction that is ROLLED BACK at the end: it seeds throw-away users, workspaces and rows,
-- impersonates each role the way PostgREST does (request.jwt.claims + SET ROLE), records pass/fail per assertion,
-- and leaves the database exactly as it found it. Safe to run against a real project.
--
-- Run (any Postgres with migrations applied; needs a role that can SET ROLE and write auth.users, e.g. postgres):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.test.sql
-- Fail the process when anything fails (CI):
--   PGOPTIONS="-c rls_test.strict=on" psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.test.sql
-- The last result set lists totals and the names of failed assertions.

begin;

create schema rls_test;
grant usage on schema rls_test to anon, authenticated;

create table rls_test.results (id serial primary key, name text not null, ok boolean not null, detail text);
create table rls_test.ids (k text primary key, v uuid not null);
grant select on rls_test.ids to anon, authenticated;

-- ---- helpers (invoker unless noted, so they execute with the privileges of the impersonated role) ------------------
create function rls_test.id(k text) returns uuid language sql stable as $$ select v from rls_test.ids where k = $1 $$;

create function rls_test.rec(n text, ok boolean, d text default null) returns void
  language sql security definer set search_path = rls_test as $$
  insert into rls_test.results(name, ok, detail) values (n, coalesce(ok, false), d)
$$;

create function rls_test.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;

create function rls_test.cnt(q text) returns bigint language plpgsql as $$
declare n bigint; begin execute 'select count(*) from (' || q || ') s' into n; return n; end $$;

-- sqlstate of the first error, or 'ok'
create function rls_test.code(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlstate; end $$;

-- true when a write did nothing: RLS filtered every row, or raised insufficient_privilege (42501)
create function rls_test.blocked(q text) returns boolean language plpgsql as $$
declare n bigint;
begin execute q; get diagnostics n = row_count; return n = 0;
exception when insufficient_privilege then return true; when others then return false; end $$;

-- true when a write changed at least one row
create function rls_test.allowed(q text) returns boolean language plpgsql as $$
declare n bigint;
begin execute q; get diagnostics n = row_count; return n > 0; exception when others then return false; end $$;

create function rls_test.no(label text, q text) returns void language plpgsql as $$
begin perform rls_test.rec(label, rls_test.blocked(q), left(q, 200)); end $$;
create function rls_test.yes(label text, q text) returns void language plpgsql as $$
begin perform rls_test.rec(label, rls_test.allowed(q), left(q, 200)); end $$;
create function rls_test.raises(label text, q text, state text) returns void language plpgsql as $$
declare c text := rls_test.code(q);
begin perform rls_test.rec(label, c = state, 'got ' || c || ', wanted ' || state); end $$;
create function rls_test.eq(label text, got bigint, want bigint) returns void language plpgsql as $$
begin perform rls_test.rec(label, got = want, 'got ' || coalesce(got::text, 'null') || ', wanted ' || want); end $$;

-- how many of the seeded rows the current role can see, per table (one row each; memberships counted separately)
create function rls_test.read_all(who text, want bigint) returns void language plpgsql as $$
declare r record;
begin
  for r in select * from (values
    ('sites','id','site1'),('assessments','id','asm1'),('checklist_items','id','item1'),('checklist_responses','id','resp1'),
    ('evidence_items','id','ev1'),('findings','id','find1'),('measurements','id','meas1'),('materials_lists','id','ml1'),
    ('materials_items','id','mi1'),('quotations','id','q1'),('quotation_items','id','qi1'),('report_snapshots','id','snap1'),
    ('audit_events','id','aud1'),('ai_runs','id','ai1'),('workspaces','id','w1')) v(t, c, k)
  loop
    perform rls_test.eq(who || ': reads ' || r.t, rls_test.cnt(format('select 1 from public.%I where %I = %L', r.t, r.c, rls_test.id(r.k))), want);
  end loop;
  perform rls_test.eq(who || ': reads workspace_memberships', rls_test.cnt(format('select 1 from public.workspace_memberships where workspace_id = %L', rls_test.id('w1'))), case when want = 0 then 0 else 5 end);
end $$;

-- ---- seed (as the connecting superuser, bypassing RLS) -----------------------------------------------------------
insert into rls_test.ids(k, v)
select k, gen_random_uuid() from unnest(array[
  'u_owner','u_admin','u_member','u_viewer','u_viewer2','u_outsider','u_stranger',
  'w1','w2','w3','site1','site_spare1','site_spare2','site2',
  'asm1','asm1b','asm_spare','asm2','item1','item1b','item2','resp1','ev1','find1','meas1',
  'ml1','mlb','mi1','q1','qi1','snap1','snap_fin','snap_del','aud1','ai1']) k;

insert into auth.users(id, email)
select rls_test.id(k), k || '@rls.invalid' from unnest(array['u_owner','u_admin','u_member','u_viewer','u_viewer2','u_outsider','u_stranger']) k;

insert into workspaces(id, name, created_by) values
  (rls_test.id('w1'), 'RLS W1', rls_test.id('u_owner')),
  (rls_test.id('w2'), 'RLS W2', rls_test.id('u_outsider'));
insert into workspace_memberships(workspace_id, user_id, role) values
  (rls_test.id('w1'), rls_test.id('u_owner'), 'owner'),
  (rls_test.id('w1'), rls_test.id('u_admin'), 'admin'),
  (rls_test.id('w1'), rls_test.id('u_member'), 'member'),
  (rls_test.id('w1'), rls_test.id('u_viewer'), 'viewer'),
  (rls_test.id('w1'), rls_test.id('u_viewer2'), 'viewer'),
  (rls_test.id('w2'), rls_test.id('u_outsider'), 'owner');

insert into sites(id, workspace_id, name) values
  (rls_test.id('site1'), rls_test.id('w1'), 'Site 1'), (rls_test.id('site_spare1'), rls_test.id('w1'), 'Spare 1'),
  (rls_test.id('site_spare2'), rls_test.id('w1'), 'Spare 2'), (rls_test.id('site2'), rls_test.id('w2'), 'Other tenant site');
insert into assessments(id, workspace_id, mode, pack, created_by) values
  (rls_test.id('asm1'), rls_test.id('w1'), 'assessment', 'solar', rls_test.id('u_owner')),
  (rls_test.id('asm1b'), rls_test.id('w1'), 'assessment', 'cctv', rls_test.id('u_owner')),
  (rls_test.id('asm_spare'), rls_test.id('w1'), 'inspection', 'solar', rls_test.id('u_owner')),
  (rls_test.id('asm2'), rls_test.id('w2'), 'assessment', 'solar', rls_test.id('u_outsider'));
insert into checklist_items(id, assessment_id, title, ord) values
  (rls_test.id('item1'), rls_test.id('asm1'), 'Roof condition', 0), (rls_test.id('item1b'), rls_test.id('asm1b'), 'Camera mounts', 0),
  (rls_test.id('item2'), rls_test.id('asm2'), 'Other tenant item', 0);
insert into checklist_responses(id, assessment_id, item_id, status) values (rls_test.id('resp1'), rls_test.id('asm1'), rls_test.id('item1'), 'pass');
insert into evidence_items(id, workspace_id, assessment_id, storage_key, mime_type, size_bytes)
  values (rls_test.id('ev1'), rls_test.id('w1'), rls_test.id('asm1'), 'rls/' || rls_test.id('ev1'), 'image/jpeg', 1000);
insert into findings(id, assessment_id, title) values (rls_test.id('find1'), rls_test.id('asm1'), 'Seed finding');
insert into measurements(id, assessment_id, name, formula, value, unit) values (rls_test.id('meas1'), rls_test.id('asm1'), 'Roof area', 'manual', 42, 'm2');
insert into materials_lists(id, assessment_id, workspace_id, version) values
  (rls_test.id('ml1'), rls_test.id('asm1'), rls_test.id('w1'), 1), (rls_test.id('mlb'), rls_test.id('asm1b'), rls_test.id('w1'), 1);
insert into materials_items(id, list_id, description, quantity, unit, rationale, source, ord)
  values (rls_test.id('mi1'), rls_test.id('ml1'), 'Rail', 4, 'ea', 'seed', 'user_input', 0);
insert into quotations(id, workspace_id, assessment_id, materials_list_id, materials_version, supplier, date, currency)
  values (rls_test.id('q1'), rls_test.id('w1'), rls_test.id('asm1'), rls_test.id('ml1'), 1, 'Supplier', current_date, 'USD');
insert into quotation_items(id, quotation_id, description, quantity, unit, unit_price, currency)
  values (rls_test.id('qi1'), rls_test.id('q1'), 'Rail', 4, 'ea', 10, 'USD');
insert into report_snapshots(id, workspace_id, assessment_id, assessment_version) values
  (rls_test.id('snap1'), rls_test.id('w1'), rls_test.id('asm1'), 0),
  (rls_test.id('snap_del'), rls_test.id('w1'), rls_test.id('asm1b'), 0);
insert into report_snapshots(id, workspace_id, assessment_id, assessment_version, finalized, reviewed_by, reviewed_at)
  values (rls_test.id('snap_fin'), rls_test.id('w1'), rls_test.id('asm1b'), 0, true, rls_test.id('u_owner'), now());
insert into audit_events(id, workspace_id, action) values (rls_test.id('aud1'), rls_test.id('w1'), 'seed');
insert into ai_runs(id, workspace_id, operation, model, status, latency_ms) values (rls_test.id('ai1'), rls_test.id('w1'), 'seed', 'muse-spark-1.3', 'ok', 5);

-- ======================================================================================================================
-- 1. Structure (as the connecting role)
-- ======================================================================================================================
do $$ declare t text; begin
  for t in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' loop
    perform rls_test.rec('structure: RLS enabled on public.' || t, (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass));
  end loop;
  perform rls_test.eq('structure: no policy is a blanket "true"', (select count(*) from pg_policies where schemaname = 'public' and (qual = 'true' or with_check = 'true')), 0);
  perform rls_test.eq('structure: no policy targets anon explicitly', (select count(*) from pg_policies where schemaname = 'public' and 'anon' = any(roles)), 0);
end $$;

-- sign-off and immutability, enforced even for privileged roles
select rls_test.raises('snapshot: finalized snapshots cannot be edited', format('update report_snapshots set review_note = ''x'' where id = %L', rls_test.id('snap_fin')), 'P0001');
select rls_test.raises('snapshot: finalized snapshots cannot be deleted', format('delete from report_snapshots where id = %L', rls_test.id('snap_fin')), 'P0001');
select rls_test.raises('snapshot: cannot finalize without a reviewer', format('update report_snapshots set finalized = true where id = %L', rls_test.id('snap_del')), '23514');
select rls_test.raises('snapshot: cannot finalize with a reviewer but no review time', format('update report_snapshots set finalized = true, reviewed_by = %L where id = %L', rls_test.id('u_owner'), rls_test.id('snap_del')), '23514');
select rls_test.eq('snapshot: versions are allocated per assessment (asm1 has 1, asm1b has 2)',
  (select max(assessment_version) from report_snapshots where assessment_id = rls_test.id('asm1')) * 10 + (select max(assessment_version) from report_snapshots where assessment_id = rls_test.id('asm1b')), 12);

-- data-quality constraints
select rls_test.raises('constraint: measurement formula is validated', format('insert into measurements(assessment_id, name, formula, value, unit) values (%L, ''x'', ''bogus'', 1, ''m'')', rls_test.id('asm1')), '23514');
select rls_test.raises('constraint: measurement value must be finite', format('insert into measurements(assessment_id, name, formula, value, unit) values (%L, ''x'', ''manual'', ''NaN'', ''m'')', rls_test.id('asm1')), '23514');
select rls_test.raises('constraint: materials quantity must be positive', format('insert into materials_items(list_id, description, quantity, unit, rationale, source, ord) values (%L, ''x'', 0, ''ea'', ''r'', ''user_input'', 9)', rls_test.id('ml1')), '23514');
select rls_test.raises('constraint: quotation unit price cannot be negative', format('insert into quotation_items(quotation_id, description, quantity, unit, unit_price, currency) values (%L, ''x'', 1, ''ea'', -1, ''USD'')', rls_test.id('q1')), '23514');
select rls_test.raises('constraint: membership role is validated', format('insert into workspace_memberships(workspace_id, user_id, role) values (%L, %L, ''superuser'')', rls_test.id('w2'), rls_test.id('u_stranger')), '23514');
select rls_test.raises('constraint: checklist provenance is validated', format('insert into checklist_items(assessment_id, title, ord, source) values (%L, ''x'', 5, ''guess'')', rls_test.id('asm1')), '23514');

-- ======================================================================================================================
-- 2. Anonymous (no session) — nothing readable, nothing writable, no RPC
-- ======================================================================================================================
select set_config('request.jwt.claims', '', true);
set local role anon;
do $$ declare t text; n bigint; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    begin execute format('select count(*) from public.%I', t) into n; exception when others then n := 0; end;
    perform rls_test.eq('anon: sees no rows in ' || t, n, 0);
  end loop;
  perform rls_test.no('anon: cannot insert a site', format('insert into sites(workspace_id, name) values (%L, ''x'')', rls_test.id('w1')));
  perform rls_test.no('anon: cannot insert a workspace', format('insert into workspaces(name, created_by) values (''x'', %L)', rls_test.id('u_owner')));
  perform rls_test.rec('anon: cannot run replace_checklist', not has_function_privilege('anon', 'public.replace_checklist(uuid, jsonb)', 'execute'));
  perform rls_test.rec('anon: cannot run save_materials_list', not has_function_privilege('anon', 'public.save_materials_list(uuid, jsonb)', 'execute'));
  perform rls_test.rec('anon: cannot run the membership helpers', not has_function_privilege('anon', 'public.is_workspace_member(uuid)', 'execute'));
end $$;
reset role;

-- ======================================================================================================================
-- 3. Outsider: signed in, member of a different workspace only
-- ======================================================================================================================
select rls_test.as_user(rls_test.id('u_outsider'));
set local role authenticated;
select rls_test.read_all('outsider', 0);
do $$ begin
  perform rls_test.eq('outsider: still sees their own workspace data', rls_test.cnt(format('select 1 from sites where id = %L', rls_test.id('site2'))), 1);
  perform rls_test.no('outsider: cannot insert a site into another workspace', format('insert into sites(workspace_id, name) values (%L, ''x'')', rls_test.id('w1')));
  perform rls_test.no('outsider: cannot rename another workspace''s site', format('update sites set name = ''x'' where id = %L', rls_test.id('site1')));
  perform rls_test.no('outsider: cannot delete another workspace''s site', format('delete from sites where id = %L', rls_test.id('site1')));
  perform rls_test.no('outsider: cannot create an assessment in another workspace', format('insert into assessments(workspace_id, mode, pack, created_by) values (%L, ''assessment'', ''solar'', %L)', rls_test.id('w1'), rls_test.id('u_outsider')));
  perform rls_test.no('outsider: cannot update another workspace''s assessment', format('update assessments set status = ''x'' where id = %L', rls_test.id('asm1')));
  perform rls_test.no('outsider: cannot delete another workspace''s assessment', format('delete from assessments where id = %L', rls_test.id('asm1')));
  perform rls_test.no('outsider: cannot add a finding to another workspace''s assessment', format('insert into findings(assessment_id, title) values (%L, ''x'')', rls_test.id('asm1')));
  perform rls_test.no('outsider: cannot add evidence to another workspace', format('insert into evidence_items(workspace_id, assessment_id, storage_key, mime_type, size_bytes) values (%L, %L, ''k'', ''image/png'', 1)', rls_test.id('w1'), rls_test.id('asm1')));
  perform rls_test.no('outsider: cannot attach evidence from their own workspace to another workspace''s assessment', format('insert into evidence_items(workspace_id, assessment_id, storage_key, mime_type, size_bytes) values (%L, %L, ''k2'', ''image/png'', 1)', rls_test.id('w2'), rls_test.id('asm1')));
  perform rls_test.no('outsider: cannot join another workspace as a member', format('insert into workspace_memberships(workspace_id, user_id, role) values (%L, %L, ''member'')', rls_test.id('w1'), rls_test.id('u_outsider')));
  perform rls_test.no('outsider: cannot make themselves owner of another workspace', format('insert into workspace_memberships(workspace_id, user_id, role) values (%L, %L, ''owner'')', rls_test.id('w1'), rls_test.id('u_outsider')));
  perform rls_test.no('outsider: cannot create a workspace in someone else''s name', format('insert into workspaces(name, created_by) values (''x'', %L)', rls_test.id('u_owner')));
  perform rls_test.no('outsider: cannot rename another workspace', format('update workspaces set name = ''x'' where id = %L', rls_test.id('w1')));
  perform rls_test.no('outsider: cannot delete another workspace', format('delete from workspaces where id = %L', rls_test.id('w1')));
  perform rls_test.no('outsider: cannot create a snapshot for another workspace', format('insert into report_snapshots(workspace_id, assessment_id, assessment_version) values (%L, %L, 1)', rls_test.id('w1'), rls_test.id('asm1')));
  perform rls_test.raises('outsider: replace_checklist on another workspace''s assessment is refused', format('select * from replace_checklist(%L, %L::jsonb)', rls_test.id('asm1'), '[{"title":"x"}]'), '42501');
  perform rls_test.raises('outsider: save_materials_list on another workspace''s assessment is refused', format('select * from save_materials_list(%L, %L::jsonb)', rls_test.id('asm1'), '[]'), '42501');
  perform rls_test.yes('outsider: can write inside their own workspace', format('insert into sites(workspace_id, name) values (%L, ''Mine'')', rls_test.id('w2')));
end $$;
reset role;

-- ======================================================================================================================
-- 4. Stranger: authenticated, no workspace yet — bootstrap rules
-- ======================================================================================================================
select rls_test.as_user(rls_test.id('u_stranger'));
set local role authenticated;
select rls_test.read_all('stranger', 0);
do $$ begin
  perform rls_test.yes('stranger: can create a workspace they own', format('insert into workspaces(id, name, created_by) values (%L, ''RLS W3'', %L)', rls_test.id('w3'), rls_test.id('u_stranger')));
  perform rls_test.eq('stranger: sees the workspace they just created', rls_test.cnt(format('select 1 from workspaces where id = %L', rls_test.id('w3'))), 1);
  perform rls_test.no('stranger: bootstrap membership must be the owner role', format('insert into workspace_memberships(workspace_id, user_id, role) values (%L, %L, ''admin'')', rls_test.id('w3'), rls_test.id('u_stranger')));
  perform rls_test.no('stranger: cannot bootstrap a membership for someone else', format('insert into workspace_memberships(workspace_id, user_id, role) values (%L, %L, ''owner'')', rls_test.id('w3'), rls_test.id('u_viewer')));
  perform rls_test.yes('stranger: can bootstrap their own owner membership', format('insert into workspace_memberships(workspace_id, user_id, role) values (%L, %L, ''owner'')', rls_test.id('w3'), rls_test.id('u_stranger')));
end $$;
reset role;
select rls_test.as_user(rls_test.id('u_outsider'));
set local role authenticated;
do $$ begin
  perform rls_test.no('outsider: cannot bootstrap into a workspace someone else created', format('insert into workspace_memberships(workspace_id, user_id, role) values (%L, %L, ''owner'')', rls_test.id('w3'), rls_test.id('u_outsider')));
end $$;
reset role;
select rls_test.as_user(rls_test.id('u_stranger'));
set local role authenticated;
do $$ begin
  perform rls_test.yes('owner of a new workspace can delete it', format('delete from workspaces where id = %L', rls_test.id('w3')));
end $$;
reset role;

-- ======================================================================================================================
-- 5. Viewer: read-only
-- ======================================================================================================================
select rls_test.as_user(rls_test.id('u_viewer'));
set local role authenticated;
select rls_test.read_all('viewer', 1);
do $$ begin
  perform rls_test.no('viewer: cannot insert a site', format('insert into sites(workspace_id, name) values (%L, ''x'')', rls_test.id('w1')));
  perform rls_test.no('viewer: cannot update a site', format('update sites set name = ''x'' where id = %L', rls_test.id('site1')));
  perform rls_test.no('viewer: cannot delete a site', format('delete from sites where id = %L', rls_test.id('site1')));
  perform rls_test.no('viewer: cannot create an assessment', format('insert into assessments(workspace_id, mode, pack, created_by) values (%L, ''assessment'', ''solar'', %L)', rls_test.id('w1'), rls_test.id('u_viewer')));
  perform rls_test.no('viewer: cannot update an assessment', format('update assessments set status = ''x'' where id = %L', rls_test.id('asm1')));
  perform rls_test.no('viewer: cannot add a finding', format('insert into findings(assessment_id, title) values (%L, ''x'')', rls_test.id('asm1')));
  perform rls_test.no('viewer: cannot edit a finding', format('update findings set title = ''x'' where id = %L', rls_test.id('find1')));
  perform rls_test.no('viewer: cannot delete a finding', format('delete from findings where id = %L', rls_test.id('find1')));
  perform rls_test.no('viewer: cannot add a measurement', format('insert into measurements(assessment_id, name, formula, value, unit) values (%L, ''x'', ''manual'', 1, ''m'')', rls_test.id('asm1')));
  perform rls_test.no('viewer: cannot delete a measurement', format('delete from measurements where id = %L', rls_test.id('meas1')));
  perform rls_test.no('viewer: cannot change a checklist response', format('update checklist_responses set status = ''fail'' where id = %L', rls_test.id('resp1')));
  perform rls_test.no('viewer: cannot add a checklist item', format('insert into checklist_items(assessment_id, title, ord) values (%L, ''x'', 9)', rls_test.id('asm1')));
  perform rls_test.no('viewer: cannot add evidence', format('insert into evidence_items(workspace_id, assessment_id, storage_key, mime_type, size_bytes) values (%L, %L, ''kv'', ''image/png'', 1)', rls_test.id('w1'), rls_test.id('asm1')));
  perform rls_test.no('viewer: cannot delete evidence', format('delete from evidence_items where id = %L', rls_test.id('ev1')));
  perform rls_test.no('viewer: cannot edit a materials item', format('update materials_items set quantity = 99 where id = %L', rls_test.id('mi1')));
  perform rls_test.no('viewer: cannot edit a quotation', format('update quotations set supplier = ''x'' where id = %L', rls_test.id('q1')));
  perform rls_test.no('viewer: cannot edit a quotation line', format('update quotation_items set unit_price = 1 where id = %L', rls_test.id('qi1')));
  perform rls_test.no('viewer: cannot create a report snapshot', format('insert into report_snapshots(workspace_id, assessment_id, assessment_version) values (%L, %L, 1)', rls_test.id('w1'), rls_test.id('asm1')));
  perform rls_test.no('viewer: cannot edit a draft report', format('update report_snapshots set review_note = ''x'' where id = %L', rls_test.id('snap1')));
  perform rls_test.raises('viewer: replace_checklist cannot add items', format('select * from replace_checklist(%L, %L::jsonb)', rls_test.id('asm1'), '[{"title":"sneaky"}]'), '42501');
  perform rls_test.raises('viewer: save_materials_list cannot create a list', format('select * from save_materials_list(%L, %L::jsonb)', rls_test.id('asm1'), '[]'), '42501');
  perform rls_test.code(format('select * from replace_checklist(%L, %L::jsonb)', rls_test.id('asm1'), '[]'));
  perform rls_test.eq('viewer: replace_checklist with an empty list deletes nothing', rls_test.cnt(format('select 1 from checklist_items where id = %L', rls_test.id('item1'))), 1);
  perform rls_test.no('viewer: cannot add a member', format('insert into workspace_memberships(workspace_id, user_id, role) values (%L, %L, ''viewer'')', rls_test.id('w1'), rls_test.id('u_stranger')));
  perform rls_test.no('viewer: cannot promote themselves', format('update workspace_memberships set role = ''admin'' where user_id = %L and workspace_id = %L', rls_test.id('u_viewer'), rls_test.id('w1')));
  perform rls_test.no('viewer: cannot remove another member', format('delete from workspace_memberships where user_id = %L and workspace_id = %L', rls_test.id('u_viewer2'), rls_test.id('w1')));
  perform rls_test.no('viewer: cannot rename the workspace', format('update workspaces set name = ''x'' where id = %L', rls_test.id('w1')));
end $$;
reset role;

-- ======================================================================================================================
-- 6. Member: can work, cannot administer
-- ======================================================================================================================
select rls_test.as_user(rls_test.id('u_member'));
set local role authenticated;
select rls_test.read_all('member', 1);
do $$ declare v bigint; sid uuid; begin
  perform rls_test.yes('member: can create a site', format('insert into sites(workspace_id, name) values (%L, ''Member site'')', rls_test.id('w1')));
  perform rls_test.yes('member: can edit a site', format('update sites set name = ''Renamed'' where id = %L', rls_test.id('site1')));
  perform rls_test.no('member: cannot delete a site', format('delete from sites where id = %L', rls_test.id('site_spare2')));
  perform rls_test.yes('member: can create an assessment as themselves', format('insert into assessments(workspace_id, mode, pack, created_by) values (%L, ''assessment'', ''cctv'', %L)', rls_test.id('w1'), rls_test.id('u_member')));
  perform rls_test.no('member: cannot create an assessment attributed to someone else', format('insert into assessments(workspace_id, mode, pack, created_by) values (%L, ''assessment'', ''cctv'', %L)', rls_test.id('w1'), rls_test.id('u_owner')));
  perform rls_test.yes('member: can edit an assessment', format('update assessments set status = ''in_progress'' where id = %L', rls_test.id('asm1')));
  perform rls_test.no('member: cannot move an assessment to another workspace', format('update assessments set workspace_id = %L where id = %L', rls_test.id('w2'), rls_test.id('asm1')));
  perform rls_test.no('member: cannot delete an assessment', format('delete from assessments where id = %L', rls_test.id('asm_spare')));
  perform rls_test.yes('member: can add a finding', format('insert into findings(assessment_id, title) values (%L, ''Member finding'')', rls_test.id('asm1')));
  perform rls_test.yes('member: can edit a finding', format('update findings set title = ''Edited'' where id = %L', rls_test.id('find1')));
  perform rls_test.yes('member: can add a measurement', format('insert into measurements(assessment_id, name, formula, value, unit) values (%L, ''Run'', ''manual'', 12.5, ''m'')', rls_test.id('asm1')));
  perform rls_test.yes('member: can link a measurement to an item of the same assessment', format('insert into measurements(assessment_id, item_id, name, formula, value, unit) values (%L, %L, ''Linked'', ''manual'', 1, ''m'')', rls_test.id('asm1'), rls_test.id('item1')));
  perform rls_test.no('member: cannot link a measurement to another assessment''s item', format('insert into measurements(assessment_id, item_id, name, formula, value, unit) values (%L, %L, ''Cross'', ''manual'', 1, ''m'')', rls_test.id('asm1'), rls_test.id('item1b')));
  perform rls_test.yes('member: can update a checklist response', format('update checklist_responses set status = ''fail'' where id = %L', rls_test.id('resp1')));
  perform rls_test.no('member: cannot point a response at another assessment''s item', format('update checklist_responses set item_id = %L where id = %L', rls_test.id('item1b'), rls_test.id('resp1')));
  perform rls_test.no('member: cannot create a response for another assessment''s item', format('insert into checklist_responses(assessment_id, item_id, status) values (%L, %L, ''pass'')', rls_test.id('asm1'), rls_test.id('item1b')));
  perform rls_test.yes('member: can attach evidence to an assessment of the same workspace', format('insert into evidence_items(workspace_id, assessment_id, storage_key, mime_type, size_bytes) values (%L, %L, ''km1'', ''image/png'', 1)', rls_test.id('w1'), rls_test.id('asm1')));
  perform rls_test.no('member: cannot attach evidence to another workspace''s assessment', format('insert into evidence_items(workspace_id, assessment_id, storage_key, mime_type, size_bytes) values (%L, %L, ''km2'', ''image/png'', 1)', rls_test.id('w1'), rls_test.id('asm2')));
  perform rls_test.no('member: cannot create a materials list for another workspace''s assessment', format('insert into materials_lists(assessment_id, workspace_id) values (%L, %L)', rls_test.id('asm2'), rls_test.id('w1')));
  perform rls_test.no('member: cannot attach a quotation to a materials list of a different assessment', format('insert into quotations(workspace_id, assessment_id, materials_list_id, materials_version, supplier, date, currency) values (%L, %L, %L, 1, ''S'', current_date, ''USD'')', rls_test.id('w1'), rls_test.id('asm1'), rls_test.id('mlb')));
  perform rls_test.yes('member: can create a quotation for the right materials list', format('insert into quotations(workspace_id, assessment_id, materials_list_id, materials_version, supplier, date, currency) values (%L, %L, %L, 1, ''S'', current_date, ''USD'')', rls_test.id('w1'), rls_test.id('asm1'), rls_test.id('ml1')));

  -- RPCs
  perform rls_test.eq('member: replace_checklist edits and appends (2 items afterwards)',
    (select count(*) from replace_checklist(rls_test.id('asm1'), format('[{"id":"%s","title":"Roof condition (edited)"},{"title":"Added by member"}]', rls_test.id('item1'))::jsonb)), 2);
  perform rls_test.eq('member: replace_checklist kept the original item id (responses survive)', rls_test.cnt(format('select 1 from checklist_items where id = %L and title like ''%%edited%%''', rls_test.id('item1'))), 1);
  perform rls_test.eq('member: checklist response survived the replace', rls_test.cnt(format('select 1 from checklist_responses where id = %L', rls_test.id('resp1'))), 1);
  perform rls_test.raises('member: replace_checklist cannot reach another workspace''s assessment', format('select * from replace_checklist(%L, %L::jsonb)', rls_test.id('asm2'), '[{"title":"x"}]'), '42501');
  perform rls_test.eq('member: save_materials_list creates the next version (list count 2 for asm1)',
    (select count(*) from save_materials_list(rls_test.id('asm1'), '[{"description":"Panel","quantity":10,"unit":"ea","rationale":"from measurement","source":"measurement","ord":0}]'::jsonb)) * 100 + rls_test.cnt(format('select 1 from materials_lists where assessment_id = %L', rls_test.id('asm1'))), 102);
  perform rls_test.raises('member: save_materials_list rejects non-positive quantities', format('select * from save_materials_list(%L, %L::jsonb)', rls_test.id('asm1'), '[{"description":"x","quantity":0,"unit":"ea","rationale":"r","source":"rule","ord":0}]'), '23514');
  perform rls_test.raises('member: save_materials_list cannot reach another workspace''s assessment', format('select * from save_materials_list(%L, %L::jsonb)', rls_test.id('asm2'), '[]'), '42501');

  -- report snapshots
  insert into report_snapshots(workspace_id, assessment_id, assessment_version) values (rls_test.id('w1'), rls_test.id('asm1'), 99) returning id, assessment_version into sid, v;
  perform rls_test.eq('member: snapshot version is allocated by the server, not the client (next is 2)', v, 2);
  perform rls_test.no('member: cannot create a snapshot for a mismatched workspace/assessment', format('insert into report_snapshots(workspace_id, assessment_id, assessment_version) values (%L, %L, 1)', rls_test.id('w1'), rls_test.id('asm2')));
  perform rls_test.raises('member: cannot finalize without a reviewer', format('update report_snapshots set finalized = true where id = %L', sid), '23514');
  perform rls_test.yes('member: can edit a draft snapshot', format('update report_snapshots set review_note = ''draft note'' where id = %L', sid));
  perform rls_test.yes('member: can finalize with reviewer and time', format('update report_snapshots set finalized = true, reviewed_by = %L, reviewed_at = now() where id = %L', rls_test.id('u_member'), sid));
  perform rls_test.raises('member: a finalized snapshot is immutable', format('update report_snapshots set review_note = ''tamper'' where id = %L', sid), 'P0001');
  perform rls_test.no('member: cannot delete draft reports (admins only)', format('delete from report_snapshots where id = %L', rls_test.id('snap_del')));

  -- membership and workspace administration
  perform rls_test.no('member: cannot add members', format('insert into workspace_memberships(workspace_id, user_id, role) values (%L, %L, ''viewer'')', rls_test.id('w1'), rls_test.id('u_stranger')));
  perform rls_test.no('member: cannot promote themselves', format('update workspace_memberships set role = ''admin'' where user_id = %L and workspace_id = %L', rls_test.id('u_member'), rls_test.id('w1')));
  perform rls_test.no('member: cannot change a viewer''s role', format('update workspace_memberships set role = ''member'' where user_id = %L and workspace_id = %L', rls_test.id('u_viewer'), rls_test.id('w1')));
  perform rls_test.no('member: cannot remove another member', format('delete from workspace_memberships where user_id = %L and workspace_id = %L', rls_test.id('u_viewer'), rls_test.id('w1')));
  perform rls_test.no('member: cannot rename the workspace', format('update workspaces set name = ''x'' where id = %L', rls_test.id('w1')));
  perform rls_test.no('member: cannot delete the workspace', format('delete from workspaces where id = %L', rls_test.id('w1')));
end $$;
reset role;

-- ======================================================================================================================
-- 7. Admin: delete + manage members, never owners
-- ======================================================================================================================
select rls_test.as_user(rls_test.id('u_admin'));
set local role authenticated;
select rls_test.read_all('admin', 1);
do $$ begin
  perform rls_test.yes('admin: can delete a site', format('delete from sites where id = %L', rls_test.id('site_spare1')));
  perform rls_test.yes('admin: can delete an assessment', format('delete from assessments where id = %L', rls_test.id('asm_spare')));
  perform rls_test.yes('admin: can delete a draft report', format('delete from report_snapshots where id = %L', rls_test.id('snap_del')));
  perform rls_test.yes('admin: can add a viewer', format('insert into workspace_memberships(workspace_id, user_id, role) values (%L, %L, ''viewer'')', rls_test.id('w1'), rls_test.id('u_stranger')));
  perform rls_test.yes('admin: can change that member''s role', format('update workspace_memberships set role = ''member'' where user_id = %L and workspace_id = %L', rls_test.id('u_stranger'), rls_test.id('w1')));
  perform rls_test.yes('admin: can remove that member', format('delete from workspace_memberships where user_id = %L and workspace_id = %L', rls_test.id('u_stranger'), rls_test.id('w1')));
  perform rls_test.no('admin: cannot add an owner', format('insert into workspace_memberships(workspace_id, user_id, role) values (%L, %L, ''owner'')', rls_test.id('w1'), rls_test.id('u_stranger')));
  perform rls_test.no('admin: cannot promote themselves to owner', format('update workspace_memberships set role = ''owner'' where user_id = %L and workspace_id = %L', rls_test.id('u_admin'), rls_test.id('w1')));
  perform rls_test.no('admin: cannot demote the owner', format('update workspace_memberships set role = ''viewer'' where user_id = %L and workspace_id = %L', rls_test.id('u_owner'), rls_test.id('w1')));
  perform rls_test.no('admin: cannot remove the owner', format('delete from workspace_memberships where user_id = %L and workspace_id = %L', rls_test.id('u_owner'), rls_test.id('w1')));
  perform rls_test.no('admin: cannot rename the workspace', format('update workspaces set name = ''x'' where id = %L', rls_test.id('w1')));
  perform rls_test.no('admin: cannot delete the workspace', format('delete from workspaces where id = %L', rls_test.id('w1')));
end $$;
reset role;

-- ======================================================================================================================
-- 8. Owner
-- ======================================================================================================================
select rls_test.as_user(rls_test.id('u_owner'));
set local role authenticated;
select rls_test.read_all('owner', 1);
do $$ begin
  perform rls_test.yes('owner: can rename the workspace', format('update workspaces set name = ''RLS W1 renamed'' where id = %L', rls_test.id('w1')));
  perform rls_test.yes('owner: can add another owner', format('insert into workspace_memberships(workspace_id, user_id, role) values (%L, %L, ''owner'')', rls_test.id('w1'), rls_test.id('u_stranger')));
  perform rls_test.yes('owner: can change an admin''s role', format('update workspace_memberships set role = ''member'' where user_id = %L and workspace_id = %L', rls_test.id('u_admin'), rls_test.id('w1')));
end $$;
reset role;

-- ======================================================================================================================
-- 9. Members can leave; nobody can write the server-owned logs
-- ======================================================================================================================
select rls_test.as_user(rls_test.id('u_viewer2'));
set local role authenticated;
do $$ begin
  perform rls_test.no('leave: a member cannot remove someone else', format('delete from workspace_memberships where user_id = %L and workspace_id = %L', rls_test.id('u_viewer'), rls_test.id('w1')));
  perform rls_test.yes('leave: a non-owner can leave the workspace', format('delete from workspace_memberships where user_id = %L and workspace_id = %L', rls_test.id('u_viewer2'), rls_test.id('w1')));
  perform rls_test.eq('leave: after leaving, the workspace is invisible', rls_test.cnt(format('select 1 from sites where workspace_id = %L', rls_test.id('w1'))), 0);
end $$;
reset role;

select rls_test.as_user(rls_test.id('u_owner'));
set local role authenticated;
do $$ begin
  perform rls_test.no('owner: cannot write audit_events', format('insert into audit_events(workspace_id, action) values (%L, ''forged'')', rls_test.id('w1')));
  perform rls_test.no('owner: cannot edit audit_events', format('update audit_events set action = ''x'' where id = %L', rls_test.id('aud1')));
  perform rls_test.no('owner: cannot delete audit_events', format('delete from audit_events where id = %L', rls_test.id('aud1')));
  perform rls_test.no('owner: cannot write ai_runs', format('insert into ai_runs(workspace_id, operation, model, status, latency_ms) values (%L, ''x'', ''m'', ''ok'', 1)', rls_test.id('w1')));
  perform rls_test.no('owner: cannot edit ai_runs', format('update ai_runs set est_cost_usd = 0 where id = %L', rls_test.id('ai1')));
  perform rls_test.no('owner: cannot delete ai_runs', format('delete from ai_runs where id = %L', rls_test.id('ai1')));
end $$;
reset role;

-- ======================================================================================================================
-- Report
-- ======================================================================================================================
do $$ declare failed text; begin
  select string_agg(name, '; ' order by id) into failed from rls_test.results where not ok;
  if failed is not null and current_setting('rls_test.strict', true) = 'on' then
    raise exception 'RLS tests failed: %', failed;
  end if;
end $$;

select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed,
       coalesce(jsonb_agg(jsonb_build_object('test', name, 'detail', detail) order by id) filter (where not ok), '[]'::jsonb) as failures
from rls_test.results;

rollback;
