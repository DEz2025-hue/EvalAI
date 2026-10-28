-- EvalAI foundation — workspaces, membership, sites, assessments, checklist, evidence, reports
-- Security: RLS deny-by-default, workspace-scoped policies, private storage.

-- Extensions
create extension if not exists "pgcrypto";

-- Workspaces
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

-- Membership
create table workspace_memberships (
  workspace_id uuid references workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','member','viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- Sites
create table sites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  address text,
  created_at timestamptz not null default now()
);

-- Assessments (covers both Assessment and Inspection modes via mode column)
create table assessments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  site_id uuid references sites(id) on delete set null,
  mode text not null check (mode in ('assessment','inspection')),
  pack text not null check (pack in ('solar','cctv')),
  status text not null default 'draft',
  context jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Checklist items (editable per assessment, versioned)
create table checklist_items (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  title text not null,
  instructions text,
  required boolean not null default true,
  ord int not null,
  category text
);

create table checklist_responses (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  item_id uuid not null references checklist_items(id) on delete cascade,
  status text not null check (status in ('pass','fail','needs_attention','not_applicable','not_checked')),
  notes text,
  measured_value double precision,
  measured_unit text,
  updated_at timestamptz not null default now(),
  unique(assessment_id, item_id)
);

-- Evidence (private Storage objects referenced here)
create table evidence_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  assessment_id uuid references assessments(id) on delete set null,
  item_id uuid references checklist_items(id) on delete set null,
  storage_key text not null,
  mime_type text not null,
  size_bytes int not null,
  captured_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

-- Findings / recommendations (AI drafts are separate, see ai_runs)
create table findings (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  title text not null,
  severity text check (severity in ('low','medium','high')),
  status text not null default 'needs_review',
  evidence_refs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- Report snapshots (immutable)
create table report_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  assessment_id uuid not null references assessments(id) on delete cascade,
  assessment_version int not null,
  materials_version int,
  quotation_version int,
  artifact_key text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- RLS
alter table workspaces enable row level security;
alter table workspace_memberships enable row level security;
alter table sites enable row level security;
alter table assessments enable row level security;
alter table checklist_items enable row level security;
alter table checklist_responses enable row level security;
alter table evidence_items enable row level security;
alter table findings enable row level security;
alter table report_snapshots enable row level security;

-- Policies: deny by default — membership check via workspace_memberships
-- Example (to be refined with auth.uid() and service_role bypass):
-- create policy "members can read own workspace" on workspaces for select using (exists (select 1 from workspace_memberships where workspace_id = workspaces.id and user_id = auth.uid()));

-- Storage buckets (create via supabase storage API / dashboard):
-- evidence (private), reports (private) — access via short-lived signed URLs only after authz.

-- Audit events
create table audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete set null,
  actor uuid references auth.users(id),
  action text not null,
  target_type text,
  target_id uuid,
  created_at timestamptz not null default now()
);
