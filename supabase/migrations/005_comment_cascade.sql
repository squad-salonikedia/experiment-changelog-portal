-- Comments should not outlive the experiment they are attached to.
--
-- WHY
-- experiment_reactions has a foreign key with `on delete cascade`, so reactions
-- clean themselves up. experiment_comments (migration 004) has neither, so
-- deleting an experiment left its whole thread in the table: invisible in the
-- UI, attached to an id nothing resolves, and counted by nothing.
--
-- The DELETE route also clears comments itself, so this is not urgent — but the
-- route cannot help when rows are deleted straight from the Supabase console,
-- which is exactly when it is easiest to forget.
--
-- HOW TO RUN
-- Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to re-run, and safe to run while the app is live.

-- Any comments already orphaned by a delete that happened before this.
delete from experiment_comments c
where not exists (
  select 1 from experiments e where e.id = c.experiment_id
);

alter table experiment_comments
  drop constraint if exists experiment_comments_experiment_id_fkey;

alter table experiment_comments
  add constraint experiment_comments_experiment_id_fkey
  foreign key (experiment_id) references experiments(id) on delete cascade;
