-- Role-based access control, shift policy, and payroll.
--
-- Run after supabase/grading.sql. Additive and idempotent, so it is safe to
-- re-run against a database that already holds carts, staff and punches.
--
-- Three things change shape here:
--   1. Identity moves from the Clerk user id to the email address, so a role
--      can be granted before the person has ever signed in.
--   2. Lateness gains a grace buffer, so "late" means late past the allowance
--      the manager set rather than one second past the shift time.
--   3. Salary and payroll approval arrive, which is the first thing in this
--      schema that needs a second person to sign off.

-- 1. Identity is the email address -------------------------------------------
-- A manager enrolls someone by the Gmail address they will sign in with. The
-- Clerk id is unknown at that moment and is bound on first login instead, which
-- is why it stops being required.

alter table public.staff add column if not exists email text;
alter table public.staff alter column clerk_user_id drop not null;

-- Case-insensitive: people type their own address inconsistently, and a plain
-- `unique (email)` would happily enrol "Ravi@..." and "ravi@..." as two people.
create unique index if not exists staff_email_key
  on public.staff (lower(email))
  where email is not null;

-- 2. Shift policy ------------------------------------------------------------
-- shift_start / shift_end already exist. What was missing is the allowance:
-- arriving inside it is on time, past it is late.

alter table public.staff
  add column if not exists grace_minutes integer not null default 30
  check (grace_minutes between 0 and 240);

-- 3. Salary ------------------------------------------------------------------
-- Monthly figure, prorated by days actually present. `working_days_per_month`
-- is the divisor -- 26 is a six-day week, 30 pays for rest days too -- and is
-- per-person because a part-timer and a full-timer sit in the same table.

alter table public.staff
  add column if not exists monthly_salary numeric(12, 2)
  check (monthly_salary is null or monthly_salary >= 0);

alter table public.staff
  add column if not exists working_days_per_month integer not null default 26
  check (working_days_per_month between 1 and 31);

-- Flat amount docked per day marked late. Left at 0 so lateness is recorded but
-- costs nothing until someone deliberately sets a penalty.
alter table public.staff
  add column if not exists late_deduction numeric(12, 2) not null default 0
  check (late_deduction >= 0);

-- 4. Lateness, with the buffer applied ---------------------------------------
-- `late_by_minutes` keeps meaning "minutes past shift_start", so a manager can
-- still see a 12-minute arrival. `is_late` is the judgement, and it is stored
-- rather than derived at read time because the grace figure can be edited later
-- and payroll must not silently re-decide a month that was already approved.

alter table public.attendance_events
  add column if not exists is_late boolean not null default false;

-- The allowance in force when the punch happened, kept for the same reason.
alter table public.attendance_events
  add column if not exists grace_minutes integer;

-- 5. Manager review ----------------------------------------------------------
-- Set when a punch was recorded without a settled uniform verdict: the model
-- timed out, errored, or could not tell. The punch still counts; a person
-- decides afterwards.

alter table public.attendance_events
  add column if not exists review_status text not null default 'none'
  check (review_status in ('none', 'pending', 'cleared', 'flagged'));

alter table public.attendance_events
  add column if not exists review_note text;
alter table public.attendance_events
  add column if not exists reviewed_by uuid references public.staff(id) on delete set null;
alter table public.attendance_events
  add column if not exists reviewed_at timestamptz;

create index if not exists attendance_review_idx
  on public.attendance_events (review_status, happened_at desc)
  where review_status = 'pending';

-- 6. Rejected selfies --------------------------------------------------------
-- A check-in that fails the uniform check never becomes an attendance event, so
-- without this the attempt would leave no trace at all. Four rejections before
-- someone finally put a cap on is exactly what a manager needs to see, and it
-- is also how the cost of a retry loop becomes visible.

create table if not exists public.uniform_attempts (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references public.staff(id) on delete cascade,
  cart_id       uuid references public.carts(id) on delete set null,
  business_date date not null,
  photo_id      uuid references public.photos(id) on delete set null,

  verdict text check (verdict in ('fail', 'unclear')),
  score   integer check (score between 0 and 100),
  items   jsonb,
  reason  text,

  model         text,
  input_tokens  integer,
  output_tokens integer,

  created_at timestamptz not null default now()
);

create index if not exists uniform_attempts_staff_day_idx
  on public.uniform_attempts (staff_id, business_date, created_at desc);

-- 7. Payroll -----------------------------------------------------------------
-- One row per person per month. The figures are frozen into the row when it is
-- prepared rather than recomputed on read: a salary change in March must not
-- quietly rewrite the February payslip somebody already approved.

create table if not exists public.payroll_runs (
  id       uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  -- Always the first of the month, so one month is one row.
  period_month date not null,

  monthly_salary numeric(12, 2) not null,
  working_days   integer not null,
  days_present   integer not null default 0,
  days_late      integer not null default 0,
  late_deduction numeric(12, 2) not null default 0,

  gross      numeric(12, 2) not null default 0,
  deductions numeric(12, 2) not null default 0,
  net        numeric(12, 2) not null default 0,

  -- 'pending' is a manager asking for sign-off; only an admin moves it on.
  status text not null default 'pending'
         check (status in ('pending', 'approved', 'declined', 'paid')),
  note   text,

  prepared_by uuid references public.staff(id) on delete set null,
  decided_by  uuid references public.staff(id) on delete set null,
  decided_at  timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (staff_id, period_month)
);

create index if not exists payroll_runs_period_idx
  on public.payroll_runs (period_month desc, status);

-- 8. Lateness is decided in Postgres -----------------------------------------
-- Replaces the function from attendance.sql. Same job, plus the grace buffer.
-- It stays in the database because the business date it depends on needs the
-- cart's timezone, which Postgres gets right and JS date maths does not.

create or replace function public.fill_attendance_derived()
returns trigger
language plpgsql
as $fn$
declare
  v_tz       text;
  v_start    time;
  v_end      time;
  v_grace    integer;
  v_expected timestamptz;
begin
  select timezone into v_tz from public.carts where id = new.cart_id;
  v_tz := coalesce(v_tz, 'UTC');

  -- timestamptz AT TIME ZONE tz -> local wall clock; cast to date for the day.
  new.business_date := (new.happened_at at time zone v_tz)::date;

  select shift_start, shift_end, grace_minutes
    into v_start, v_end, v_grace
    from public.staff where id = new.staff_id;

  -- Snapshotted onto the row: editing someone's allowance tomorrow must not
  -- change whether they were late today.
  new.grace_minutes := coalesce(v_grace, 0);

  if new.kind = 'in' and v_start is not null then
    -- date + time -> naive timestamp; AT TIME ZONE tz reads it as local wall
    -- clock and returns the instant it corresponds to.
    v_expected := (new.business_date + v_start) at time zone v_tz;
    new.late_by_minutes :=
      greatest(0, round(extract(epoch from (new.happened_at - v_expected)) / 60))::int;
    new.is_late := new.late_by_minutes > new.grace_minutes;
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

-- 9. The first admin ---------------------------------------------------------
-- Roles are granted from inside the console, which nobody can reach without a
-- role. This seeds the one account that breaks the cycle. Matching on the email
-- means the row is already waiting when that address first signs in.

insert into public.staff (email, full_name, role, active)
select 'tapzee.in@gmail.com', 'Owner', 'admin', true
where not exists (
  select 1 from public.staff where lower(email) = 'tapzee.in@gmail.com'
);

-- 10. Lock the new tables down -----------------------------------------------
-- Same posture as the rest of the schema: only the service role reads or writes
-- these, and it always scopes by the staff row resolved from the session.

alter table public.uniform_attempts enable row level security;
alter table public.payroll_runs     enable row level security;

revoke all on public.uniform_attempts from anon, authenticated;
revoke all on public.payroll_runs     from anon, authenticated;

-- 11. Aggregates that must not be done in JavaScript -------------------------
-- Two reads would otherwise grow with the whole company rather than with what
-- is being looked at: counting staff per cart, and reducing a month of punches
-- to days-present. Both are one grouped query in Postgres and a full table
-- fetch in the application, so both live here.

/*
 * Days present and days late, per person, for a date range.
 *
 * DISTINCT ON takes the earliest check-in of each day, which is what decides
 * lateness: somebody who arrives on time, steps out at noon and punches back in
 * late has not turned up late.
 */
create or replace function public.monthly_attendance(
  p_staff_ids uuid[],
  p_from      date,
  p_to        date
)
returns table (staff_id uuid, days_present integer, days_late integer)
language sql
stable
as $fn$
  with first_in as (
    select distinct on (e.staff_id, e.business_date)
           e.staff_id,
           e.business_date,
           e.is_late
      from public.attendance_events e
     where e.kind = 'in'
       and e.staff_id = any (p_staff_ids)
       and e.business_date between p_from and p_to
     order by e.staff_id, e.business_date, e.happened_at
  )
  select f.staff_id,
         count(*)::integer                          as days_present,
         count(*) filter (where f.is_late)::integer as days_late
    from first_in f
   group by f.staff_id;
$fn$;

/* How many active people are assigned to each cart. */
create or replace function public.cart_staff_counts()
returns table (cart_id uuid, staff_count integer)
language sql
stable
as $fn$
  select s.cart_id, count(*)::integer
    from public.staff s
   where s.active and s.cart_id is not null
   group by s.cart_id;
$fn$;

revoke all on function public.monthly_attendance(uuid[], date, date)
  from anon, authenticated;
revoke all on function public.cart_staff_counts() from anon, authenticated;

-- Supports the day sheet, which asks for one date across many people. The
-- existing (staff_id, business_date, ...) index cannot serve a query that leads
-- with the date.
create index if not exists attendance_day_idx
  on public.attendance_events (business_date, kind, staff_id);
