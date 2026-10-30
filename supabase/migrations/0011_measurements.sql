-- 0011: recorded measurements — formula, inputs (with units) and result are stored so any number in a
-- report can be traced back to how it was produced. Results are computed deterministically in code.

create table if not exists measurements (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  item_id uuid references checklist_items(id) on delete set null,
  name text not null check (char_length(name) between 1 and 200),
  formula text not null check (formula in ('area','volume','cable_with_sag','manual')),
  method text,
  inputs jsonb not null default '{}'::jsonb,
  value double precision not null check (value = value and value > -1e12 and value < 1e12),
  unit text not null check (char_length(unit) between 1 and 20),
  note text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists measurements_assessment_idx on measurements (assessment_id, created_at);

alter table measurements enable row level security;

create policy "members select measurements" on measurements for select
  using (is_workspace_member(assessment_workspace(assessment_id)));
create policy "writers insert measurements" on measurements for insert
  with check (
    can_write_workspace(assessment_workspace(assessment_id))
    and (item_id is null or exists (select 1 from checklist_items i where i.id = item_id and i.assessment_id = measurements.assessment_id))
  );
create policy "writers update measurements" on measurements for update
  using (can_write_workspace(assessment_workspace(assessment_id)))
  with check (can_write_workspace(assessment_workspace(assessment_id)));
create policy "writers delete measurements" on measurements for delete
  using (can_write_workspace(assessment_workspace(assessment_id)));
