-- Comments on experiments, so anyone with access can discuss a logged experiment.
--
-- HOW TO RUN
-- Supabase dashboard -> SQL Editor -> New query -> paste -> Run.

create table if not exists experiment_comments (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null,
  author_email text not null,
  author_name text not null default '',
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_comments_experiment on experiment_comments (experiment_id, created_at);
create index if not exists idx_comments_author on experiment_comments (author_email);

alter table experiment_comments enable row level security;
