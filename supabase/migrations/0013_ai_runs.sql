-- APPLIED to project gmzstzqmbsuqwserlaul (RLS on, members read-only; verified clients cannot insert, service role can).
-- 0013: AI usage log. One row per provider call (success or failure): which model, how much it used, how long it took,
-- and an estimated cost. Metadata only — never prompts, transcripts, images or audio.
-- Written by the server with the service role; workspace members can read their own workspace's usage.

create table if not exists ai_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  assessment_id uuid references assessments(id) on delete set null,
  operation text not null,
  model text not null,
  effort text,
  status text not null check (status in ('ok', 'error')),
  error_code text,
  latency_ms integer not null check (latency_ms >= 0),
  prompt_tokens integer,
  completion_tokens integer,
  reasoning_tokens integer,
  total_tokens integer,
  audio_ms integer,
  est_cost_usd numeric(12, 6),
  created_at timestamptz not null default now()
);

create index if not exists ai_runs_workspace_created_idx on ai_runs (workspace_id, created_at desc);

alter table ai_runs enable row level security;

create policy "members select ai_runs" on ai_runs for select using (is_workspace_member(workspace_id));

-- Clients can read but never write: rows come only from the server (service role bypasses RLS).
revoke insert, update, delete on ai_runs from anon, authenticated;
