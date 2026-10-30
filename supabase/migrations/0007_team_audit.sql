-- Team management + audit trail policies
-- (Membership delete policies live in 0008, which replaced the recursive version
-- that originally lived here.)

-- Audit events: members can read their workspace trail; inserts run privileged
-- from the app layer after authz (service role), so no insert policy needed.
-- Members can read (app-layer writes only).
create policy "members select audit"
  on audit_events for select
  using (workspace_id is null or is_workspace_member(workspace_id));
