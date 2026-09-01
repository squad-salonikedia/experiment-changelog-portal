-- Reactions are recorded against an email, not a first name.
--
-- WHY
-- experiment_reactions.user_identity used to hold whatever name the browser
-- sent. Two people called Saloni shared one vote, and because the value came
-- from the request body rather than the session, a crafted request could react
-- as somebody else — or undo their reaction. The API now always writes the
-- signed-in email, the same identity ownership uses.
--
-- Rows written before this still hold first names. They keep counting toward
-- the totals; they just do not belong to anyone, so nobody can un-toggle them.
-- This backfills the ones that can be resolved unambiguously.
--
-- HOW TO RUN
-- Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to re-run.

update experiment_reactions r
set user_identity = u.email
from allowed_users u
where r.user_identity not like '%@%'
  and lower(r.user_identity) = lower(split_part(u.name, ' ', 1))
  and (
    select count(*) from allowed_users u2
    where lower(split_part(u2.name, ' ', 1)) = lower(r.user_identity)
  ) = 1;

-- One person, one reaction of each kind, per experiment. The API checks this
-- before inserting, but two quick clicks used to be able to race past it.
delete from experiment_reactions a
using experiment_reactions b
where a.ctid > b.ctid
  and a.experiment_id = b.experiment_id
  and a.user_identity = b.user_identity
  and a.reaction = b.reaction;

create unique index if not exists uniq_reaction_per_person
  on experiment_reactions (experiment_id, user_identity, reaction);
