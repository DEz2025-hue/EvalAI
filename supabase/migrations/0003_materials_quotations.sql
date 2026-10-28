-- Materials schedule + quotations — traceable, provisional, stale handling

create table materials_lists (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  version int not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table materials_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references materials_lists(id) on delete cascade,
  description text not null,
  specification text,
  quantity double precision not null check (quantity > 0),
  unit text not null,
  rationale text not null, -- traceable source: measurement id, finding id, rule, user_input
  source text not null check (source in ('measurement','finding','rule','user_input')),
  provisional boolean not null default false,
  assumptions jsonb not null default '[]'::jsonb,
  finding_id uuid references findings(id) on delete set null,
  ord int not null
);

create table quotations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  assessment_id uuid not null references assessments(id) on delete cascade,
  materials_list_id uuid not null references materials_lists(id) on delete cascade,
  materials_version int not null,
  supplier text not null,
  reference text,
  date date not null,
  currency char(3) not null,
  validity_days int,
  attachment_key text, -- private storage key in reports bucket
  total double precision,
  stale boolean not null default false,
  review_status text not null default 'pending' check (review_status in ('pending','approved','stale_needs_review')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references quotations(id) on delete cascade,
  description text not null,
  quantity double precision not null,
  unit text not null,
  unit_price double precision not null check (unit_price >= 0),
  currency char(3) not null,
  taxes_or_fees double precision,
  line_total double precision generated always as (quantity * unit_price + coalesce(taxes_or_fees,0)) stored
);

-- RLS
alter table materials_lists enable row level security;
alter table materials_items enable row level security;
alter table quotations enable row level security;
alter table quotation_items enable row level security;

create policy "members select materials_lists" on materials_lists for select using (is_workspace_member(workspace_id));
create policy "members insert materials_lists" on materials_lists for insert with check (is_workspace_member(workspace_id));
create policy "members select materials_items via list" on materials_items for select using (exists(select 1 from materials_lists l where l.id = list_id and is_workspace_member(l.workspace_id)));
create policy "members insert materials_items" on materials_items for insert with check (exists(select 1 from materials_lists l where l.id = list_id and is_workspace_member(l.workspace_id)));
create policy "members select quotations" on quotations for select using (is_workspace_member(workspace_id));
create policy "members insert quotations" on quotations for insert with check (is_workspace_member(workspace_id));
create policy "members select quotation_items" on quotation_items for select using (exists(select 1 from quotations q where q.id = quotation_id and is_workspace_member(q.workspace_id)));
create policy "members insert quotation_items" on quotation_items for insert with check (exists(select 1 from quotations q where q.id = quotation_id and is_workspace_member(q.workspace_id)));

-- Stale trigger: when materials_items change, mark related quotations stale
create or replace function mark_quotations_stale() returns trigger as $$
begin
  update quotations set stale = true, review_status = 'stale_needs_review' where materials_list_id = coalesce(new.list_id, old.list_id);
  return new;
end; $$ language plpgsql;

create trigger trg_materials_stale after insert or update or delete on materials_items for each row execute function mark_quotations_stale();
