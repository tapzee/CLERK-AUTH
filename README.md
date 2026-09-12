# Shift — attendance, uniform checking and payroll for food carts

A worker signs in, stands at their cart, and takes one selfie. From that single
action the system records **when** they arrived, **where** they were, and
**whether they are in uniform** — and at the end of the month it turns that
record into pay.

Built on Next.js 16 (App Router), Clerk for authentication, Supabase for data
and storage, and Gemini for the uniform check.

---

## The three roles

Access is **role-based**, and roles are attached to the **email address** a
person signs in with — so a manager can enrol somebody before that person has
ever opened the app.

| Role | Can do |
| --- | --- |
| **Staff** | Punch in and out with a selfie. See their own attendance and pay. |
| **Manager** | Everything staff can, plus: set shift times, grace windows and salaries for their own cart; move the cart's geofence pin; review uniform verdicts the model could not settle; prepare payroll. |
| **Owner** (`admin`) | Everything, across every cart, plus the two powers withheld from a manager: **granting roles** and **approving payroll**. |

Roles are coarse labels; the code checks **permissions**, never
`role === "admin"`. The whole table is one file,
[`src/lib/auth/rbac.ts`](src/lib/auth/rbac.ts), so adding a capability is one
entry rather than a hunt through pages for role comparisons that have drifted.

A second axis, **scope**, decides *who* a role reaches — a manager holds
`staff:write`, but only over their own cart. That is
[`src/lib/manage/scope.ts`](src/lib/manage/scope.ts), and every scoped query
goes through `listStaff`, so the rule is written once.

### Separation of duties

A manager sets salaries and prepares payroll but **cannot approve it**, and
cannot hand out roles. Nobody — not even an owner — can change **their own**
role: demoting yourself is a one-way door, because the permission you would need
to undo it is the one you just gave away.

### The first owner

Granting a role needs the console, and reaching the console needs a role.
`ADMIN_EMAILS` breaks that cycle: any address on that list gets an owner record
the first time it signs in. It defaults to `tapzee.in@gmail.com`, and
[`supabase/rbac.sql`](supabase/rbac.sql) seeds the row so it is already waiting.

---

## How a check-in works

The order is deliberate, and it is **cheapest first** — a punch refused at step
one pays for nothing.

1. **Session rule.** Already checked in? Then the only thing on offer is
   check-out. Pure arithmetic, no writes.
2. **Geofence.** The browser reports a position; the server measures it against
   the cart's pin and radius. A fix coarser than ±100 m is refused outright,
   because a desktop reporting ±2 km "passes" a 150 m circle by luck.
3. **Uniform check.** The selfie goes to Gemini with the cart's uniform and its
   reference photos. This is where it differs from most attendance apps:

   - **Pass** → the punch is recorded.
   - **Fail** → **nothing is recorded.** The worker is told exactly what is
     wrong ("no cap, apron worn badly") and the camera goes straight back up.
     The rejected photo is still filed to `uniform_attempts`, so a manager can
     see somebody tried four times before putting a cap on.
   - **Can't tell** → the punch **is** recorded and flagged for a manager.
   - **Model unavailable** (timeout, quota, outage) → the punch **is** recorded,
     flagged, and left in a queue for the catch-up worker.

4. **Write.** The photo lands in private storage and the event is inserted.
   Postgres fills in the business date and the lateness figures on a trigger,
   because both depend on the cart's timezone.

### Attendance never depends on an API being up

That is the governing trade. If the uniform check cannot answer within
`UNIFORM_CHECK_TIMEOUT_MS` (9 s by default), the shift is still recorded and the
uncertainty is handed to a person. Nobody loses a day's pay because Gemini was
slow.

The catch-up worker ([`dress-checks.ts`](src/lib/attendance/dress-checks.ts))
then judges those photos in batches. A clean pass **un-flags** the punch on its
own, so a manager only ever looks at what the model genuinely could not settle.

### Late is decided by the manager

Each worker has a shift start and a **grace window** (30 minutes by default).
Arriving inside it is on time; past it, the day is marked late.

Both `late_by_minutes` (the raw figure, so a manager can still see a 12-minute
arrival) and `is_late` (the judgement) are **stored on the row**, not derived at
read time — because the grace figure can be edited later, and payroll must not
silently re-decide a month that was already approved.

---

## How pay is worked out

```
per day     = monthly_salary ÷ working_days_per_month
gross       = per day × min(days present, working days)
deductions  = days late × late_deduction
net         = max(0, gross − deductions)
```

Days present counts **distinct days with a check-in**. Lateness is decided by
the **first** check-in of each day, so somebody who arrives on time, steps out at
noon and punches back in late has not turned up late.

Gross is capped at a full month: covering 28 days against a 26-day basis is an
overtime conversation, not something to pay out silently.

To make a late day a **half day**, set the deduction to half of one day's pay.

The arithmetic lives in one pure function,
[`src/lib/payroll/calculate.ts`](src/lib/payroll/calculate.ts), used by both the
console and the worker's own page — so the number a worker checks is the number
their manager sees.

### Approval

A manager **prepares** a run, which freezes that month's figures into
`payroll_runs`. An owner **approves**, **declines**, or marks it **paid**.

Figures are frozen rather than recomputed on read: a salary change in March must
not quietly rewrite a February payslip somebody already approved. If attendance
or salary moves after a run was prepared, the console shows both numbers and
says so.

---

## Setup

**1. Install and configure**

```bash
npm install
cp .env.local.example .env.local
```

Fill in `.env.local`:

- **Clerk** — [dashboard.clerk.com](https://dashboard.clerk.com) → API Keys.
  Copy the publishable key and the secret key.
- **Supabase** — [supabase.com/dashboard](https://supabase.com/dashboard) →
  Project Settings → API Keys. Copy the project URL and the **secret** key
  (`sb_secret_…`). The publishable key will not work — it is a browser key, and
  the RLS policies deliberately grant it nothing.
- **Gemini** — [aistudio.google.com](https://aistudio.google.com) → API key.
- **`ADMIN_EMAILS`** — the address that should own the deployment.

**2. Run the migrations, in order**

```bash
SUPABASE_ACCESS_TOKEN=sbp_... npm run db:migrate -- \
  supabase/schema.sql \
  supabase/attendance.sql \
  supabase/admin.sql \
  supabase/dress-checks.sql \
  supabase/scoring.sql \
  supabase/grading.sql \
  supabase/rbac.sql
```

`SUPABASE_ACCESS_TOKEN` is a *personal access token* from
[account/tokens](https://supabase.com/dashboard/account/tokens) — a different
secret from anything else in `.env.local`, and one the deployed app never reads.
Or paste each file into the Supabase SQL editor by hand.

Every migration is additive and idempotent, so re-running one is safe.

**3. Run it**

```bash
npm run dev
```

Open http://localhost:3000. Browsers only grant camera access on `localhost` or
HTTPS, so a plain `http://` LAN address will not work.

**4. First run**

1. Sign in with the address in `ADMIN_EMAILS`. You land in the console as owner.
2. **Carts** → add a cart. Stand at it and press *use my location*, or type the
   coordinates. Set the radius.
3. **Uniforms** (optional) → describe the uniform, set the weights and pass
   mark, and upload a reference photo per garment. The logo cannot be judged
   without one — a written description cannot tell one logo from another.
4. **Staff** → enrol people by email, assign the cart, set shift, grace, salary.
5. They sign in with that address and go straight to `/punch`.

---

## Routes

| Route | Who | What |
| --- | --- | --- |
| `/punch` | anyone signed in | The selfie screen. Also explains enrolment to anyone not on the roster. |
| `/me` | staff+ | Own attendance, own pay, own payslips. |
| `/manage` | manager+ | Today at a glance: who is missing, who was late, what is waiting. |
| `/manage/attendance` | manager+ | The day sheet — one row per person, present or not. |
| `/manage/review` | manager+ | Photos the check could not settle. |
| `/manage/staff` | manager+ | Roster, shifts, grace, salary, roles. |
| `/manage/carts` | manager+ | Pin and radius. |
| `/manage/uniforms` | owner | What the check looks for. |
| `/manage/payroll` | manager+ | Prepare; owner approves. |

---

## Layout

```
src/
  app/
    punch/            The worker's screen
    me/               A worker's own record
    manage/           The console — layout guards once, each page re-checks
      actions.ts      Every console write, each gated by requirePermission
      nav.ts          Sections as data, with the permission each one needs
    api/
      attendance/     GET status, POST a punch
      cron/           Catch-up worker for unsettled verdicts
  lib/
    auth/
      rbac.ts         Roles → permissions. Pure, shared with the browser.
      viewer.ts       Session → staff record (email match, Clerk id binding)
    attendance/
      service.ts      recordPunch — the order-of-operations above
      uniform-check.ts  The blocking check, with a deadline
      dress-checks.ts   The catch-up worker
      geofence.ts     Haversine + accuracy floor. Shared client/server.
    manage/           Console data layer, one file per subject
      scope.ts        Narrows a manager to their own cart
      form.ts         Form parsing and validation, shared by every action
    uniform/
      items.ts        What a uniform is, and how grades become a score. Pure.
      profile.ts      Loading a uniform with its reference photos
    payroll/
      calculate.ts    The pay arithmetic. Pure, shared with the browser.
  components/
    ui/               Card, Pill, Field, SubmitButton — the shared kit
    punch/            The selfie screen
    manage/           One manager per console subject
```

The split that matters: anything **pure** (`rbac.ts`, `items.ts`,
`calculate.ts`, `geofence.ts`) is importable by the browser, so the punch screen
can explain a verdict and the worker's page can show the same pay maths the
console does. Anything touching the database imports `server-only`, so the build
fails if it is ever pulled into a client bundle.

---

## Scaling

Two reads would otherwise grow with the size of the whole company rather than
with what is being looked at, so both are grouped in Postgres
(see section 11 of [`supabase/rbac.sql`](supabase/rbac.sql)):

- `monthly_attendance(staff_ids, from, to)` — days present and days late per
  person, using `DISTINCT ON` to take each day's first check-in.
- `cart_staff_counts()` — headcount per cart.

Everything else is bounded by scope: a manager's queries never reach past their
own cart, and an owner's reach at most one cart's staff per day sheet.

**Known limit:** the rate limiter in
[`src/lib/rate-limit.ts`](src/lib/rate-limit.ts) is in-memory, so it only covers
a single instance. A multi-instance deployment should back it with
Redis/Upstash.

---

## Security notes

- `SUPABASE_SECRET_KEY`, the Cloudinary secret and `GEMINI_API_KEY` never reach
  the browser. `src/lib/supabase/admin.ts` and the storage providers import
  `server-only`, so the build fails if they are pulled into a client bundle.
- **Every Server Action re-checks the session and the permission.** Actions are
  reachable by direct POST, not only through the forms that render them, so
  gating the page that shows the form is not enough. Hiding a nav link is a
  courtesy, never a control.
- **Roles only follow a *verified* email.** An unverified address could be typed
  by anyone, and matching a role against one would let a stranger claim a
  manager's account by claiming their address.
- A staff row's Clerk id is bound on first sign-in and **only ever fills a
  blank** — never re-pointed, which would hand a new account the old one's
  history.
- Storage paths are built from the Clerk user id **on the server**, so a client
  cannot choose where its file lands.
- Uploads are checked against the file's real magic bytes, not the browser's
  claimed `Content-Type`, and capped at 4 MB (`MAX_UPLOAD_BYTES`).
- RLS is enabled on every table with no permissive policies, so a leaked anon
  key grants nothing.
- Coordinates are **self-reported by the browser** and cannot be independently
  verified. Treat a stored position as "what the device claimed", not as proof
  of presence. The geofence result is *recorded* as well as enforced, so a later
  audit can see how close the call was.

---

## Storage: Supabase or Cloudinary

The image bytes can go to either. The Supabase `photos` table is the metadata
index regardless, and each row records the backend that holds it — so switching
providers is safe for photos that already exist.

```env
STORAGE_PROVIDER=cloudinary
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

Cloudinary assets upload with `type: "authenticated"` under a per-user folder,
so the plain delivery URL returns 404 and every read needs a signature generated
server-side. Supabase signed URLs here last 5 minutes.

> Cloudinary's *expiring* signed URLs (`auth_token`) are a paid add-on. Without
> it, signatures are unguessable but do not time out the way Supabase's do.

---

## Deploying to Vercel

Import the repo at [vercel.com/new](https://vercel.com/new). Next.js is detected
automatically, so nothing needs overriding.

**1. Environment variables**

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Build-time. `pk_live_…` for Production. |
| `CLERK_SECRET_KEY` | Server only. `sk_live_…` for Production. |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | `/` — the landing page routes by role |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | `/` |
| `NEXT_PUBLIC_SUPABASE_URL` | |
| `SUPABASE_SECRET_KEY` | Server only. `sb_secret_…`, never the publishable key. |
| `SUPABASE_PHOTOS_BUCKET` | `photos` |
| `STORAGE_PROVIDER` | `supabase` or `cloudinary` |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` / `_FOLDER` | Only when `STORAGE_PROVIDER=cloudinary` |
| `ADMIN_EMAILS` | Comma-separated owner allow-list |
| `GEMINI_API_KEY` | Server only |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` |
| `GEMINI_MEDIA_RESOLUTION` | `MEDIA_RESOLUTION_HIGH` |
| `GEMINI_DAILY_CALL_CAP` | Ceiling on model calls per day |
| `UNIFORM_CHECK_TIMEOUT_MS` | How long a check-in waits for a verdict. Default 9000. |
| `NEXT_PUBLIC_GEOFENCE_MAX_ACCURACY_M` | Coarsest location fix accepted. Default 100 — **leave it at the default in production.** |
| `CRON_SECRET` | Vercel presents this to the cron route as a bearer token |

`SUPABASE_ACCESS_TOKEN` is **not** in this list on purpose: it is a local
migration credential that reaches every project on the account, and the deployed
app never reads it.

`NEXT_PUBLIC_*` values are compiled into the client bundle, so they must be
present *before* the build and a change to one needs a fresh deploy.

**2. Point Clerk at the deployed domain**, add the Vercel URL to Clerk's allowed
origins, and run the migrations against the production Supabase project.

**3. Cron.** [`vercel.json`](vercel.json) schedules the catch-up worker. Hobby
plans cap cron at once a day, which is why it is a long-stop rather than a retry
loop — the punch screen's own poll is what retries a check within seconds.

### Platform limits worth knowing

- Vercel rejects request bodies over 4.5 MB at the edge, before the function
  runs. Captures are resized to a 1024 px long edge (~150 KB), well under it.
- `/api/attendance` sets `maxDuration = 45`: a check-in now waits on a model
  call as well as an upload.

---

## Notes on versions

This project uses **Next.js 16** and **Clerk Core 3**, both of which renamed
things you may remember differently:

- `middleware.ts` → `proxy.ts` (the `clerkMiddleware` export is unchanged)
- `<SignedIn>` / `<SignedOut>` / `<Protect>` → `<Show when="signed-in">` etc.
