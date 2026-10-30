-- Allow a user to create their first workspace and join as owner.
-- Without this, workspace_memberships had SELECT-only policies, so bootstrap failed under RLS.

create policy "creator insert owner membership"
  on workspace_memberships for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from workspaces w
      where w.id = workspace_id and w.created_by = auth.uid()
    )
  );

create policy "admins insert memberships"
  on workspace_memberships for insert
  with check (
    exists (
      select 1 from workspace_memberships m
      where m.workspace_id = workspace_memberships.workspace_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "members update own membership role by admin"
  on workspace_memberships for update
  using (
    exists (
      select 1 from workspace_memberships m
      where m.workspace_id = workspace_memberships.workspace_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );
