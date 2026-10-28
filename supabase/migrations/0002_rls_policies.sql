-- RLS policies — deny-by-default, workspace membership checks
-- See SECURITY.md §3, TEST_PLAN.md §7

-- Helper: is member of workspace
create or replace function is_workspace_member(ws uuid) returns boolean as $$
  select exists(select 1 from workspace_memberships where workspace_id = ws and user_id = auth.uid());
$$ language sql stable security definer;

-- Workspaces: members can select their workspaces; owners/admins can insert/update
create policy "members select own workspaces" on workspaces for select using (is_workspace_member(id));
create policy "authenticated can create workspace" on workspaces for insert with check (auth.uid() = created_by);

-- Memberships: members can see memberships of workspaces they belong to
create policy "members select memberships" on workspace_memberships for select using (is_workspace_member(workspace_id));

-- Sites
create policy "members select sites" on sites for select using (is_workspace_member(workspace_id));
create policy "members insert sites" on sites for insert with check (is_workspace_member(workspace_id));
create policy "members update sites" on sites for update using (is_workspace_member(workspace_id));

-- Assessments
create policy "members select assessments" on assessments for select using (is_workspace_member(workspace_id));
create policy "members insert assessments" on assessments for insert with check (is_workspace_member(workspace_id) and auth.uid() = created_by);
create policy "members update assessments" on assessments for update using (is_workspace_member(workspace_id));
create policy "members delete assessments" on assessments for delete using (is_workspace_member(workspace_id));

-- Checklist
create policy "members select checklist_items via assessment" on checklist_items for select using (
  exists(select 1 from assessments a where a.id = assessment_id and is_workspace_member(a.workspace_id))
);
create policy "members insert checklist_items" on checklist_items for insert with check (
  exists(select 1 from assessments a where a.id = assessment_id and is_workspace_member(a.workspace_id))
);
create policy "members select responses" on checklist_responses for select using (
  exists(select 1 from assessments a where a.id = assessment_id and is_workspace_member(a.workspace_id))
);
create policy "members upsert responses" on checklist_responses for insert with check (
  exists(select 1 from assessments a where a.id = assessment_id and is_workspace_member(a.workspace_id))
);
create policy "members update responses" on checklist_responses for update using (
  exists(select 1 from assessments a where a.id = assessment_id and is_workspace_member(a.workspace_id))
);

-- Evidence
create policy "members select evidence" on evidence_items for select using (is_workspace_member(workspace_id));
create policy "members insert evidence" on evidence_items for insert with check (is_workspace_member(workspace_id));

-- Findings
create policy "members select findings" on findings for select using (
  exists(select 1 from assessments a where a.id = assessment_id and is_workspace_member(a.workspace_id))
);
create policy "members insert findings" on findings for insert with check (
  exists(select 1 from assessments a where a.id = assessment_id and is_workspace_member(a.workspace_id))
);

-- Reports
create policy "members select reports" on report_snapshots for select using (is_workspace_member(workspace_id));
create policy "members insert reports" on report_snapshots for insert with check (is_workspace_member(workspace_id));

-- Storage buckets — create as private, access only via signed URLs after authz (handled in app layer)
-- Run once via Supabase dashboard or CLI:
-- insert into storage.buckets (id, name, public) values ('evidence','evidence',false), ('reports','reports',false) on conflict do nothing;
