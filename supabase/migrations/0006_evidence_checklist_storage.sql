-- Phase fix-1: evidence pipeline + editable checklist support
-- Buckets for private evidence/report artifacts (access via signed URLs after app-layer authz).
insert into storage.buckets (id, name, public) values ('evidence','evidence',false), ('reports','reports',false) on conflict (id) do nothing;

-- Checklist items: members of the assessment's workspace may update/delete
-- (builder edits, removals, reorders). Reads/inserts already covered in 0002.
create policy "members update checklist_items" on checklist_items for update using (
  exists(select 1 from assessments a where a.id = assessment_id and is_workspace_member(a.workspace_id))
);
create policy "members delete checklist_items" on checklist_items for delete using (
  exists(select 1 from assessments a where a.id = assessment_id and is_workspace_member(a.workspace_id))
);

-- Evidence: members may delete their workspace's evidence rows (tombstoned in app, audit kept).
create policy "members delete evidence" on evidence_items for delete using (is_workspace_member(workspace_id));

-- Findings: members may update review status (accept needs_review -> confirmed/rejected).
create policy "members update findings" on findings for update using (
  exists(select 1 from assessments a where a.id = assessment_id and is_workspace_member(a.workspace_id))
);
