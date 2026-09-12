-- Graded scoring. Run after supabase/scoring.sql.
--
-- The check used to answer "is the cap there"; it now answers "is the cap worn
-- properly", with a middle grade for worn-but-badly. That adds a fifth scored
-- item — overall turnout — which has no garment of its own and so never has a
-- reference photo.

-- New default spread across five items rather than four. Existing rows keep
-- whatever weights were set for them; only uniforms created from here on pick
-- this up.
alter table public.uniform_profiles
  alter column score_weights
  set default '{"cap": 20, "apron": 20, "shirt": 25, "logo": 15, "neat": 20}'::jsonb;

-- Backfill a weight for the new item on uniforms that predate it, leaving the
-- existing weights untouched. Without this an older uniform would silently
-- score turnout at zero.
update public.uniform_profiles
   set score_weights = score_weights || '{"neat": 20}'::jsonb
 where not (score_weights ? 'neat');
