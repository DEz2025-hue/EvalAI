-- 0015: delete a job (assessment or inspection), draft or finished. APPLIED to project gmzstzqmbsuqwserlaul (2026-11-01; rules verified first in a rolled-back transaction, 11 checks).
--
-- A job owns rows (all child tables already cascade) and files (evidence bucket, report PDFs). Finalized report
-- snapshots are protected by guard_finalized_snapshot(); deleting a finished job has to be a deliberate, narrow path:
--
--   delete_assessment(p_id) - SECURITY DEFINER. Only an owner or admin of the job's workspace may call it. It lists
--   the files to remove, switches the guard off for this one transaction, deletes the job, records the deletion in
--   audit_events (no job content), and returns the file keys so the server can remove the files afterwards.
--
--   guard_finalized_snapshot() - a DELETE of a finalized snapshot is now also allowed when that transaction flag is
--   on AND the caller is an owner/admin of the snapshot's workspace. Every edit, and every other delete, stays blocked.

create or replace function guard_finalized_snapshot() returns trigger as $$
begin
  if tg_op = 'DELETE' then
    if old.finalized and exists (select 1 from workspaces w where w.id = old.workspace_id) then
      -- The only way through: delete_assessment() set the flag in this transaction and the caller is an admin.
      if coalesce(current_setting('app.job_deletion', true), '') = 'on'
         and has_workspace_role(old.workspace_id, array['owner','admin']) then
        return old;
      end if;
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

create or replace function delete_assessment(p_id uuid) returns jsonb as $$
declare
  ws uuid;
  had_finalized boolean;
  evidence_keys jsonb;
  report_keys jsonb;
begin
  select workspace_id into ws from assessments where id = p_id;
  if ws is null or not has_workspace_role(ws, array['owner','admin']) then
    -- Same answer for "not found", "other workspace" and "not an admin": nothing is revealed.
    raise exception 'Forbidden — job not found or you are not an admin of its workspace';
  end if;

  select coalesce(bool_or(finalized), false) into had_finalized from report_snapshots where assessment_id = p_id;
  select coalesce(jsonb_agg(storage_key), '[]'::jsonb) into evidence_keys from evidence_items where assessment_id = p_id;
  select coalesce(jsonb_agg('reports/' || id::text || '.pdf'), '[]'::jsonb) into report_keys from report_snapshots where assessment_id = p_id;

  perform set_config('app.job_deletion', 'on', true); -- this transaction only
  delete from assessments where id = p_id;
  perform set_config('app.job_deletion', 'off', true);

  insert into audit_events (workspace_id, actor, action, target_type, target_id)
  values (ws, auth.uid(), case when had_finalized then 'assessment.deleted_finalized' else 'assessment.deleted' end, 'assessment', p_id);

  return jsonb_build_object('workspaceId', ws, 'hadFinalizedReport', had_finalized, 'evidenceKeys', evidence_keys, 'reportKeys', report_keys);
end; $$ language plpgsql security definer set search_path = public;

revoke execute on function delete_assessment(uuid) from public, anon;
grant execute on function delete_assessment(uuid) to authenticated, service_role;
