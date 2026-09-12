-- Uniform scoring and reference images. Run after supabase/dress-checks.sql.

-- 1. Scoring ------------------------------------------------------------------
-- Each item carries a weight out of 100. Weight 0 means the item is still
-- reported but contributes nothing, which replaces the old boolean
-- `required_items` with something that can express "the logo matters less than
-- the apron".

alter table public.uniform_profiles
  add column if not exists score_weights jsonb not null
  default '{"cap": 25, "apron": 25, "shirt": 30, "logo": 20}'::jsonb;

-- Score at or above this counts as compliant.
alter table public.uniform_profiles
  add column if not exists pass_score integer not null default 70
  check (pass_score between 0 and 100);

/*
 * Three scores rather than one.
 *
 * The model answers "?" when a photo cannot settle an item, and a single number
 * would quietly bury that uncertainty. `score_worst` counts every "?" as absent
 * and `score_best` counts it as present; the verdict is only pass or fail when
 * both land on the same side of pass_score, and is "unclear" otherwise. `score`
 * is the midpoint, and is what gets shown.
 */
alter table public.dress_checks
  add column if not exists score       integer check (score between 0 and 100);
alter table public.dress_checks
  add column if not exists score_best  integer check (score_best between 0 and 100);
alter table public.dress_checks
  add column if not exists score_worst integer check (score_worst between 0 and 100);

-- 2. Reference images ---------------------------------------------------------
-- What the real cap, apron, shirt and logo look like. Sent alongside the staff
-- photo so the check compares against the actual uniform rather than a verbal
-- description alone — which is the only way a logo can be judged at all.

create table if not exists public.uniform_reference_images (
  id                 uuid primary key default gen_random_uuid(),
  uniform_profile_id uuid not null
                     references public.uniform_profiles(id) on delete cascade,
  -- One image per item per uniform; uploading again replaces it.
  kind               text not null check (kind in ('cap', 'apron', 'shirt', 'logo')),
  provider           text not null default 'supabase'
                     check (provider in ('supabase', 'cloudinary')),
  storage_path       text not null,
  content_type       text not null,
  byte_size          integer not null check (byte_size > 0),
  created_at         timestamptz not null default now(),

  unique (uniform_profile_id, kind)
);

create index if not exists uniform_reference_profile_idx
  on public.uniform_reference_images (uniform_profile_id);

alter table public.uniform_reference_images enable row level security;
revoke all on public.uniform_reference_images from anon, authenticated;
