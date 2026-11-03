-- Office report style (D-031): one template per workspace — name, logo, accent colour, header and footer text, and the order,
-- visibility and headings of the report's sections. Read by every member (it is copied into each report draft when the draft is made);
-- changed only by owners and admins. A report that was already drafted keeps its own copy, and a finalized report never changes.

create table if not exists report_templates (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  template jsonb not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  -- The logo is embedded as a data address, so keep the whole record small.
  constraint report_templates_size check (pg_column_size(template) <= 400000)
);

alter table report_templates enable row level security;

create policy "members select report_templates" on report_templates for select using (is_workspace_member(workspace_id));
create policy "admins insert report_templates" on report_templates for insert with check (is_workspace_admin(workspace_id));
create policy "admins update report_templates" on report_templates for update using (is_workspace_admin(workspace_id)) with check (is_workspace_admin(workspace_id));
create policy "admins delete report_templates" on report_templates for delete using (is_workspace_admin(workspace_id));
