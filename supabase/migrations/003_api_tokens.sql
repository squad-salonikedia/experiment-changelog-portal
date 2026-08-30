-- Personal API tokens, so an AI assistant can log experiments as a real person.
--
-- WHY
-- The API only accepts a browser session cookie, so a skill running in someone's
-- Claude cannot write anything as them. A token binds a request to one email
-- permanently: whatever it creates is owned by that person, forever, and shows
-- their name in the changelog.
--
-- SECURITY NOTES
--   * Only the SHA-256 hash is stored. The plaintext token is shown once, at
--     creation, and cannot be recovered — losing it means making a new one.
--   * `prefix` is the first few visible characters, kept purely so a person can
--     tell their tokens apart in the UI.
--   * Revoking is a timestamp, not a delete, so an audit trail survives.
--   * Access is still gated on allowed_users at request time, so removing
--     someone from the invite list kills their tokens immediately.
--
-- HOW TO RUN
-- Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
-- The app detects the table automatically; no redeploy needed.

create table if not exists api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  name text not null default '',
  token_hash text not null unique,
  prefix text not null default '',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists idx_api_tokens_hash on api_tokens (token_hash);
create index if not exists idx_api_tokens_user on api_tokens (user_email);

alter table api_tokens enable row level security;
