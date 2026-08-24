-- Experiment Changelog Portal — Supabase schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)

create table experiments (
  id uuid primary key default gen_random_uuid(),
  date_logged timestamptz,
  logged_by text not null default '',
  client text not null default '',
  industry text not null default '',
  use_case text not null default '',
  bucket text not null default '',
  experiment_name text not null default '',
  metric_type text not null default '',
  metric_label text not null default '',
  before_value text not null default '',
  after_value text not null default '',
  pct_change text not null default '',
  direction text not null default '',
  evidence_note text not null default '',
  endorsements text not null default '',
  pinned text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table experiment_reactions (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references experiments(id) on delete cascade,
  user_identity text not null,
  reaction text not null check (reaction in ('up', 'down')),
  created_at timestamptz not null default now(),
  unique(experiment_id, user_identity, reaction)
);

create index idx_experiments_client on experiments(client);
create index idx_experiments_bucket on experiments(bucket);
create index idx_experiments_date on experiments(date_logged desc);
create index idx_reactions_experiment on experiment_reactions(experiment_id);

-- Row Level Security (optional but recommended)
-- Enable RLS on both tables. The service role key bypasses RLS,
-- so the Next.js API routes will work as-is.
alter table experiments enable row level security;
alter table experiment_reactions enable row level security;
