-- Team management + audit trail policies

-- Owners/admins may remove memberships (cannot remove the last owner — enforced in app layer).
create policy "admins delete memberships"
  on workspace_memberships for delete
  using (
    exists (
      select 1 from workspace_memberships m
      where m.workspace_id = workspace_memberships.workspace_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

-- Audit events: members can read their workspace trail; inserts run privileged
-- from the app layer after authz (service role), so no insert policy needed.
-- Members can read (app-layer writes only).
create policy "members select audit"
  on audit_events for select
  using (workspace_id is null or is_workspace_member(workspace_id));
