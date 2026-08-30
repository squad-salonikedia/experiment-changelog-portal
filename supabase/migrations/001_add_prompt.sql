-- Adds a column for the prompt snippet behind an experiment.
--
-- The log form used to collect "Prompt used" but the experiments table had
-- nowhere to put it, so every value typed there was discarded on save. The
-- field is removed from the form until this migration is applied.
--
-- Run in Supabase → SQL Editor, then:
--   1. add `prompt: row.prompt ?? ""` to rowToEntry in lib/experiments.ts
--   2. add `prompt: entry.prompt ?? ""` to payloadToRecord in lib/experiments.ts
--   3. restore the "Prompt used" textarea in src/dashboard.js (step 1 of the
--      form) and its line in syncStep()

alter table experiments
  add column if not exists prompt text not null default '';
