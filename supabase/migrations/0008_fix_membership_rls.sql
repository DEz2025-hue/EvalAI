-- Fix workspace_memberships RLS from 0005/0007.
--  1. Policies queried workspace_memberships from inside policies on the same
--     table (infinite recursion). Use SECURITY DEFINER helpers instead.
--  2. The update policy had no WITH CHECK, so an admin could promote anyone
--     (including themselves) to owner. Only owners may grant/alter/remove owners.
--  3. Bootstrap: a creator must be able to read their new workspace and add
--     themselves as its first owner — but only while it has no members.

create or replace function is_workspace_admin(ws uuid) returns boolean as $$
  select exists(
    select 1 from workspace_memberships
    where workspace_id = ws and user_id = auth.uid() and role in ('owner','admin')
  );
$$ language sql stable security definer set search_path = public;

create or replace function is_workspace_owner(ws uuid) returns boolean as $$
  select exists(
    select 1 from workspace_memberships
    where workspace_id = ws and user_id = auth.uid() and role = 'owner'
  );
$$ language sql stable security definer set search_path = public;

-- True only for the workspace creator while the workspace has no members yet.
create or replace function can_bootstrap_workspace(ws uuid) returns boolean as $$
  select exists(select 1 from workspaces w where w.id = ws and w.created_by = auth.uid())
     and not exists(select 1 from workspace_memberships m where m.workspace_id = ws);
$$ language sql stable security definer set search_path = public;

drop policy if exists "creator insert owner membership" on workspace_memberships;
drop policy if exists "admins insert memberships" on workspace_memberships;
drop policy if exists "members update own membership role by admin" on workspace_memberships;
drop policy if exists "admins delete memberships" on workspace_memberships;

-- Creator can see the workspace they just inserted (needed for insert ... returning
-- before the owner membership row exists).
drop policy if exists "creator select own workspace" on workspaces;
create policy "creator select own workspace" on workspaces for select using (created_by = auth.uid());

create policy "creator bootstrap owner membership"
  on workspace_memberships for insert
  with check (
    user_id = auth.uid()
    and role = 'owner'
    and can_bootstrap_workspace(workspace_id)
  );

create policy "admins insert memberships"
  on workspace_memberships for insert
  with check (
    is_workspace_admin(workspace_id)
    and (role <> 'owner' or is_workspace_owner(workspace_id))
  );

create policy "admins update memberships"
  on workspace_memberships for update
  using (
    is_workspace_admin(workspace_id)
    and (role <> 'owner' or is_workspace_owner(workspace_id))
  )
  with check (
    is_workspace_admin(workspace_id)
    and (role <> 'owner' or is_workspace_owner(workspace_id))
  );

create policy "admins delete memberships"
  on workspace_memberships for delete
  using (
    is_workspace_admin(workspace_id)
    and (role <> 'owner' or is_workspace_owner(workspace_id))
  );

-- Members may leave a workspace themselves (last-owner check stays in the app layer).
create policy "members leave workspace"
  on workspace_memberships for delete
  using (user_id = auth.uid() and role <> 'owner');
