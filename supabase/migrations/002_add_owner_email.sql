-- Identify the owner of an experiment by email instead of first name.
--
-- WHY
-- `logged_by` holds a display first name ("Saloni", "Rajat"). Edit permission
-- has to match the signed-in user against that string, which breaks the moment
-- two people share a first name — and it silently reassigned owners when a name
-- was missing from the form's dropdown. Email is unique and stable.
--
-- `logged_by` stays as the display name shown in the UI. `owner_email` becomes
-- the thing permission checks actually compare.
--
-- HOW TO RUN
-- Supabase dashboard -> SQL Editor -> New query -> paste this -> Run.
-- The app detects the column automatically; no redeploy needed.

alter table experiments
  add column if not exists owner_email text not null default '';

-- Backfill: match each row's logged_by against the first name on the invite
-- list. Rows whose owner is not on the invite list are left blank and keep
-- falling back to name matching until someone edits them.
update experiments e
set owner_email = u.email
from allowed_users u
where e.owner_email = ''
  and e.logged_by <> ''
  and lower(split_part(u.name, ' ', 1)) = lower(e.logged_by);

create index if not exists idx_experiments_owner_email
  on experiments (owner_email);

-- Check what the backfill could not resolve:
--   select distinct logged_by from experiments where owner_email = '';
