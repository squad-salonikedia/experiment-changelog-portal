-- Replies and edits on comments.
--
-- WHY
-- Comments were a flat list: no way to answer a specific question, and no way to
-- fix a typo without deleting and re-posting. Threading is also what makes
-- notifications sensible later — "someone replied to you" needs a parent.
--
-- parent_id cascades, so deleting a comment takes its replies with it, and
-- migration 005's cascade on experiment_id means deleting an experiment still
-- clears the whole thread.
--
-- The app works with or without this migration: it probes for the columns and
-- falls back to flat, uneditable comments if they are missing. Running it turns
-- the features on with no redeploy.
--
-- HOW TO RUN
-- Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to re-run.

alter table experiment_comments
  add column if not exists parent_id uuid references experiment_comments(id) on delete cascade;

alter table experiment_comments
  add column if not exists edited_at timestamptz;

create index if not exists idx_comments_parent on experiment_comments (parent_id);
