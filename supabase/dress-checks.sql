-- Dress-check queue mechanics. Run after supabase/attendance.sql.

-- When the worker picked a row up. Needed to tell "a worker is on this" from
-- "a worker died holding this": a row stuck in 'running' past the timeout is
-- reclaimable, which is what keeps a crashed invocation from stranding a check
-- in the queue forever.
alter table public.dress_checks
  add column if not exists claimed_at timestamptz;

-- The 384px copy actually sent to the model, which is not the same image as the
-- evidence photo a manager reviews. Kept apart so the bytes that produced a
-- verdict stay exactly reproducible even if the evidence photo is re-processed.
alter table public.dress_checks
  add column if not exists model_photo_id uuid
  references public.photos(id) on delete set null;

/*
 * Atomically hands a batch of pending checks to one worker.
 *
 * FOR UPDATE SKIP LOCKED is the point: the cron worker and the after() fast
 * path can run at the same moment, and without it both would read the same
 * queued rows and pay for the same verdict twice. PostgREST cannot express
 * that lock, so it lives here and is called as an RPC.
 */
create or replace function public.claim_dress_checks(
  batch_size    int default 8,
  max_attempts  int default 3,
  stale_after   interval default '5 minutes'
)
returns setof public.dress_checks
language sql
as $fn$
  update public.dress_checks d
     set status     = 'running',
         attempts   = d.attempts + 1,
         claimed_at = now()
   where d.id in (
     select c.id
       from public.dress_checks c
      where c.attempts < max_attempts
        and (
          c.status in ('queued', 'failed')
          -- Abandoned by a worker that never reported back.
          or (c.status = 'running' and c.claimed_at < now() - stale_after)
        )
      order by c.created_at
      limit batch_size
      for update skip locked
   )
  returning d.*;
$fn$;

revoke all on function public.claim_dress_checks(int, int, interval)
  from anon, authenticated;
