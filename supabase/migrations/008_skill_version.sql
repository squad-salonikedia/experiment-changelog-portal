-- Which version of the skill a key was downloaded with.
--
-- WHY
-- The skill file is generated once and lives on someone's machine forever.
-- When its instructions change — as they did when PATCH stopped needing the
-- whole entry, and when replies and reactions arrived — every copy already out
-- there keeps following the old rules, and nobody has any way to know.
--
-- Recording the version at download time lets the Connect drawer say "yours is
-- out of date" instead of leaving people to guess. Existing keys have no
-- version, which is treated as "older than the first version we tracked" —
-- correct, since they all predate this column.
--
-- HOW TO RUN
-- Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to re-run. The app works without it: the drawer simply stops flagging
-- stale keys until it is applied.

alter table api_tokens add column if not exists skill_version integer;
