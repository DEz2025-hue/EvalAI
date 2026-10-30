-- 0010: address security-advisor warnings raised after 0009.
--  1. Pin search_path on the plpgsql functions added in 0009 (role-mutable search_path).
--  2. The SECURITY DEFINER helpers exist for RLS policies; signed-out callers have no business
--     calling them through /rest/v1/rpc. Revoke from PUBLIC/anon and keep authenticated
--     (policies are evaluated with the caller's privileges, so authenticated must keep EXECUTE).

alter function guard_finalized_snapshot() set search_path = public;
alter function allocate_snapshot_version() set search_path = public;
alter function save_materials_list(uuid, jsonb) set search_path = public;
alter function replace_checklist(uuid, jsonb) set search_path = public;

revoke execute on function is_workspace_member(uuid) from public, anon;
revoke execute on function is_workspace_admin(uuid) from public, anon;
revoke execute on function is_workspace_owner(uuid) from public, anon;
revoke execute on function has_workspace_role(uuid, text[]) from public, anon;
revoke execute on function can_write_workspace(uuid) from public, anon;
revoke execute on function can_bootstrap_workspace(uuid) from public, anon;
revoke execute on function assessment_workspace(uuid) from public, anon;
revoke execute on function save_materials_list(uuid, jsonb) from public, anon;
revoke execute on function replace_checklist(uuid, jsonb) from public, anon;

grant execute on function is_workspace_member(uuid) to authenticated, service_role;
grant execute on function is_workspace_admin(uuid) to authenticated, service_role;
grant execute on function is_workspace_owner(uuid) to authenticated, service_role;
grant execute on function has_workspace_role(uuid, text[]) to authenticated, service_role;
grant execute on function can_write_workspace(uuid) to authenticated, service_role;
grant execute on function can_bootstrap_workspace(uuid) to authenticated, service_role;
grant execute on function assessment_workspace(uuid) to authenticated, service_role;
grant execute on function save_materials_list(uuid, jsonb) to authenticated, service_role;
grant execute on function replace_checklist(uuid, jsonb) to authenticated, service_role;
