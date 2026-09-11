-- Dress-code attendance: carts, staff, punches.
--
-- Run this AFTER supabase/schema.sql, in the Supabase SQL editor. It is
-- additive and idempotent, so it is safe to re-run against a database that
-- already holds photos.
--
-- Phase 0 (this file) creates the shape. Phase 1 fills `attendance_events`.
-- `dress_checks` is created here too so Phase 2 is a pure code change, but
-- nothing writes to it yet.

-- 0. Photos gain a purpose ----------------------------------------------------
-- Attendance evidence lands in the same `photos` table as personal captures so
-- it inherits the storage-provider abstraction and per-user pathing. This
-- column keeps the two apart: the personal gallery filters to 'personal', the
-- manager dashboard will read 'attendance'.

alter table public.photos
  add column if not exists purpose text not null default 'personal';

do $$
begin
  alter table public.photos
    add constraint photos_purpose_check
    check (purpose in ('personal', 'attendance'));
exception
  when duplicate_object then null;
end $$;

-- 1. Uniform profiles ---------------------------------------------------------
-- What "in uniform" means. Phase 2 turns `required_items` and `prompt_notes`
-- into the model checklist; nothing reads them before that.

create table if not exists public.uniform_profiles (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  -- e.g. {"cap": true, "apron": true, "shirt": true}. Items set false are
  -- still reported but never fail a check.
  required_items jsonb not null
                 default '{"cap": true, "apron": true, "shirt": true}'::jsonb,
  -- Free text describing the uniform, injected verbatim into the prompt:
  -- "Navy blue polo, black apron, black cap." Text beats a reference image for
  -- everything except logo authenticity.
  prompt_notes   text,
  -- Expected torso colour as hex, for the on-device colour check that runs
  -- before any model call. Null disables that check.
  shirt_hex      text check (shirt_hex is null or shirt_hex ~* '^#[0-9a-f]{6}$'),
  created_at     timestamptz not null default now()
);

-- 2. Carts --------------------------------------------------------------------

create table if not exists public.carts (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  latitude  double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  -- How far from the pin a punch still counts. Carts move a little and GPS
  -- drifts, so this is generous by default.
  radius_m  integer not null default 150 check (radius_m > 0),
  -- IANA name, e.g. 'Asia/Kolkata'. Business date and lateness are computed in
  -- this zone, so a cart in another city reports its own local day.
  timezone  text not null default 'Asia/Kolkata',
  uniform_profile_id uuid references public.uniform_profiles(id) on delete set null,
  active    boolean not null default true,
  created_at timestamptz not null default now()
);

-- 3. Staff --------------------------------------------------------------------
-- One row per person who can punch. `clerk_user_id` is the join to the session;
-- a signed-in user with no row here cannot record attendance at all.

create table if not exists public.staff (
  id            uuid primary key default gen_random_uuid(),
  clerk_user_id text not null unique,
  full_name     text not null,
  phone         text,
  cart_id       uuid references public.carts(id) on delete set null,
  role          text not null default 'staff'
                check (role in ('staff', 'manager', 'admin')),
  -- The regular daily shift, as wall-clock time in the cart's timezone. Null
  -- means no schedule, so nothing is ever counted late.
  shift_start   time,
  shift_end     time,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create index if not exists staff_cart_idx on public.staff (cart_id) where active;

-- 4. Attendance events --------------------------------------------------------

create table if not exists public.attendance_events (
  id       uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  cart_id  uuid not null references public.carts(id) on delete restrict,
  kind     text not null check (kind in ('in', 'out')),

  -- When the shutter fired, as reported by the device.
  happened_at timestamptz not null default now(),
  -- When the server actually saw it. A wide gap means clock skew or a replay.
  recorded_at timestamptz not null default now(),
  -- The local day this punch belongs to, in the cart's timezone. Filled by the
  -- trigger below so "today" queries never do timezone math.
  business_date date not null,

  -- Same caveat as photos: browser-reported, not attested. The geofence result
  -- is recorded rather than merely enforced, so a later audit can see how close
  -- the call was.
  latitude    double precision check (latitude between -90 and 90),
  longitude   double precision check (longitude between -180 and 180),
  accuracy_m  double precision check (accuracy_m >= 0),
  distance_m  double precision,
  geofence_ok boolean not null default false,

  -- Minutes past shift_start for an 'in', minutes before shift_end for an
  -- 'out'. Zero when on time, null when the staff member has no schedule.
  late_by_minutes  integer,
  early_by_minutes integer,

  photo_id   uuid references public.photos(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists attendance_staff_day_idx
  on public.attendance_events (staff_id, business_date, happened_at desc);
create index if not exists attendance_cart_day_idx
  on public.attendance_events (cart_id, business_date, happened_at desc);

-- Business date and lateness both depend on the cart's timezone, so they are
-- computed in Postgres, which does this correctly, rather than in JS.
create or replace function public.fill_attendance_derived()
returns trigger
language plpgsql
as $fn$
declare
  v_tz       text;
  v_start    time;
  v_end      time;
  v_expected timestamptz;
begin
  select timezone into v_tz from public.carts where id = new.cart_id;
  v_tz := coalesce(v_tz, 'UTC');

  -- timestamptz AT TIME ZONE tz -> local wall clock; cast to date for the day.
  new.business_date := (new.happened_at at time zone v_tz)::date;

  select shift_start, shift_end into v_start, v_end
    from public.staff where id = new.staff_id;

  if new.kind = 'in' and v_start is not null then
    -- date + time -> naive timestamp; AT TIME ZONE tz reads it as local wall
    -- clock and returns the instant it corresponds to.
    v_expected := (new.business_date + v_start) at time zone v_tz;
    new.late_by_minutes :=
      greatest(0, round(extract(epoch from (new.happened_at - v_expected)) / 60))::int;
  elsif new.kind = 'out' and v_end is not null then
    v_expected := (new.business_date + v_end) at time zone v_tz;
    new.early_by_minutes :=
      greatest(0, round(extract(epoch from (v_expected - new.happened_at)) / 60))::int;
  end if;

  return new;
end;
$fn$;

drop trigger if exists attendance_derived on public.attendance_events;
create trigger attendance_derived
  before insert on public.attendance_events
  for each row execute function public.fill_attendance_derived();

-- 5. Dress checks -------------------------------------------------------------
-- Created now, written in Phase 2. One row per attendance event that warrants a
-- uniform verdict -- check-ins only, never check-outs.

create table if not exists public.dress_checks (
  id uuid primary key default gen_random_uuid(),
  attendance_event_id uuid not null unique
    references public.attendance_events(id) on delete cascade,
  photo_id uuid references public.photos(id) on delete set null,

  status text not null default 'queued'
         check (status in ('queued', 'running', 'done', 'failed', 'skipped')),
  verdict text check (verdict in ('pass', 'fail', 'unclear')),
  -- Per-item outcome, e.g. {"cap": "yes", "apron": "no", "shirt": "unclear"}.
  items      jsonb,
  confidence numeric,
  reason     text,

  -- Recorded per row so spend is measured rather than estimated.
  model         text,
  input_tokens  integer,
  output_tokens integer,

  attempts integer not null default 0,
  error    text,
  -- Perceptual hash of the judged image, so a resubmitted photo reuses its
  -- verdict instead of paying for a second call.
  image_phash text,

  created_at   timestamptz not null default now(),
  completed_at timestamptz
);

-- The queue worker's read path: oldest queued rows first.
create index if not exists dress_checks_queue_idx
  on public.dress_checks (status, created_at)
  where status in ('queued', 'failed');

-- 6. Lock everything down -----------------------------------------------------
-- Same posture as `photos`: only the service role touches these tables, and it
-- always scopes by the Clerk user id resolved from the session.

alter table public.uniform_profiles  enable row level security;
alter table public.carts             enable row level security;
alter table public.staff             enable row level security;
alter table public.attendance_events enable row level security;
alter table public.dress_checks      enable row level security;

revoke all on public.uniform_profiles  from anon, authenticated;
revoke all on public.carts             from anon, authenticated;
revoke all on public.staff             from anon, authenticated;
revoke all on public.attendance_events from anon, authenticated;
revoke all on public.dress_checks      from anon, authenticated;
