# Live Photos — Next.js + Clerk + Supabase (or Cloudinary)

Sign in with Clerk, capture a photo from your device camera, and store it in a
private bucket that only you can read.

## How it works

```
browser                        Next.js server                 storage
────────                       ──────────────                 ───────
getUserMedia  ──▶ <video>
   │  draw frame to <canvas>
   ▼
POST /api/photos  ──────────▶  auth() verifies Clerk session
  (multipart, cookie)          validate size + magic bytes
                               upload to <userId>/<uuid>.jpg  ──▶ private bucket
                               insert row in `photos` table   ──▶ Supabase Postgres

GET /dashboard  ────────────▶  list rows for this user only
                               mint short-lived signed URLs   ◀── storage
```

The browser never sees a storage credential. It only ever talks to
`/api/photos`, which is protected by Clerk.

## Setup

**1. Install and configure**

```bash
npm install
cp .env.local.example .env.local
```

Fill in `.env.local`:

- **Clerk** — [dashboard.clerk.com](https://dashboard.clerk.com) → API Keys.
  Copy the publishable key and secret key.
- **Supabase** — [supabase.com/dashboard](https://supabase.com/dashboard) →
  Project Settings → API Keys. Copy the project URL and the **secret** key
  (`sb_secret_…`). The publishable key will not work — it is a browser key, and
  the RLS policies in the schema deliberately grant it nothing.

**2. Create the table and bucket**

Paste [`supabase/schema.sql`](supabase/schema.sql) into the Supabase SQL editor
and run it. It creates the `photos` table and the private `photos` bucket.

**3. Run it**

```bash
npm run dev
```

Open http://localhost:3000. Browsers only grant camera access on `localhost` or
HTTPS, so a plain `http://` LAN address will not work.

## Using Cloudinary instead

The image bytes can go to Cloudinary rather than Supabase Storage. The Supabase
`photos` table is still used as the metadata index either way.

Set in `.env.local`:

```env
STORAGE_PROVIDER=cloudinary
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

Assets upload with `type: "authenticated"` and a per-user folder
(`live-photos/<clerk_user_id>/…`), so the plain delivery URL returns 404 and
every read needs a signature generated server-side with the API secret.

Switching providers is safe for existing photos: each row records the backend
that holds it, so old and new photos both keep resolving in the gallery.

> Cloudinary's *expiring* signed URLs (`auth_token`) are a paid add-on. Without
> it, signatures do not expire — they are unguessable, but they don't time out
> the way Supabase's do. Supabase signed URLs here last 5 minutes.

## Attendance and dress code

Staff at a food cart punch in and out from `/attendance`. Every punch records a
photo, the distance from the cart, and how late it was against the shift.

```
browser                          Next.js server
────────                         ──────────────
watch position  ──▶ distance to cart shown live
   │  (button stays disabled until inside the fence)
   ▼
capture frame, scaled to 1024px
   │
   ▼
POST /api/attendance  ─────────▶ auth() verifies Clerk session
  (multipart, cookie)            resolve staff row from the Clerk user id
                                 reject if already checked in  ─┐
                                 reject if outside the geofence ─┤ no upload,
                                                                 ┘ no storage write
                                 store evidence photo
                                 insert attendance_events
                                   └─ trigger fills business_date +
                                      late_by_minutes in the cart's timezone
```

**Setup.** Run [`supabase/attendance.sql`](supabase/attendance.sql) and
[`supabase/admin.sql`](supabase/admin.sql) after `schema.sql`. Both are additive
and idempotent, so they are safe against a database that already holds photos.
Paste them into the Supabase SQL editor, or apply them from here:

```bash
npm run db:migrate supabase/attendance.sql supabase/admin.sql
```

The `db:migrate` route needs `SUPABASE_ACCESS_TOKEN` in `.env.local` — a
personal access token from
[supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens),
which is a different secret from `SUPABASE_SECRET_KEY`. PostgREST cannot execute
DDL and the secret key is not a Postgres credential, so
[`scripts/db-migrate.mjs`](scripts/db-migrate.mjs) goes through the Management
API instead. That token reaches every project on the account, so keep it local —
it is never needed by the deployed app, and nothing else reads it.

Then open `/admin`. While the `staff` table is empty the page offers to make the
signed-in account the first admin — managing staff needs a role and granting a
role needs the panel, so the first one has to bootstrap. That offer disappears
the moment any staff row exists.

From there, carts and staff are managed in the UI; no SQL is needed again. Add
each cart **while standing at it** and press "Use my current location" rather
than typing coordinates. To enrol someone, they sign in, open `/attendance`, and
send you the Clerk user id the page prints.

No new environment variables are needed to *run* the app: attendance uses the
storage and Supabase config that is already there.

**Tolerance is per cart.** `carts.radius_m` is how far from that cart's pin a
punch still counts — 100–150m absorbs ordinary phone GPS slop. It is set per
cart rather than globally because a cart on an open street and one inside a
market do not need the same allowance. With several carts, keep each radius well
under the distance to the nearest other cart, or someone standing at one could
punch for the other; staff are matched to their *assigned* cart, so the failure
shows up as a punch accepted at the wrong place rather than a rejection.

**Geofencing is a deterrent, not proof.** Coordinates come from the browser and
a determined user can override them, exactly as the `photos` table already
notes. Two things narrow the gap: a fix coarser than `MAX_ACCURACY_M` (100m) is
refused outright, so a desktop reporting ±2km cannot "land inside" a 150m
circle by luck, and `distance_m` is stored on every punch so an audit can see
how close each one really was.

**Times are per cart.** `carts.timezone` drives both the business date a punch
belongs to and the lateness calculation, so carts in different zones each
report their own local day. That math lives in the `attendance_derived`
trigger rather than in JS, because Postgres does it correctly.

## Dress-code checking

A check-in queues a uniform verdict. **Attendance never waits for it** — the
punch is recorded and returned, and the verdict is attached a second or two
later by a background worker.

```
POST /api/attendance (kind=in)
   │  record punch ─────────────▶ 201 to the staff member
   │  queue dress_checks row
   ▼
after()  ──▶ runDressCheckBatch()   ← fast path, ~2s
punch screen poll ──▶ same          ← retries while someone is watching
nightly cron ──▶ same               ← long-stop sweeper
   │
   │  claim_dress_checks()  ← FOR UPDATE SKIP LOCKED, so these never
   │                          pay for the same verdict twice
   ▼
Gemini (one call per batch of 8) ──▶ verdict written to dress_checks
```

The staff screen polls while a verdict is pending and stops once it settles.

**Setup.** Run [`supabase/dress-checks.sql`](supabase/dress-checks.sql),
[`supabase/scoring.sql`](supabase/scoring.sql) and
[`supabase/grading.sql`](supabase/grading.sql), then set `GEMINI_API_KEY` and
`CRON_SECRET` (see `.env.local.example`). On Vercel, add both under
Settings → Environment Variables — the build succeeds without them and the
worker then fails at runtime, which is a confusing way to find out.

Vercel presents `CRON_SECRET` to the cron route as a bearer token, which the
route checks. Without that the worker — and the spend behind it — would be
triggerable by anyone who found the path.

**The schedule is daily, and that is a plan limit, not a preference.** Hobby
accounts reject any cron more frequent than once a day, and the *deployment
fails* rather than the schedule degrading. So the nightly run is a long-stop
sweeper, and two things carry the real load: `after()` on the punch, and the
punch screen, which re-renders every couple of seconds while a verdict is
outstanding and kicks the worker again each time (`kickWorkerIfPending`). A
check that fails its first attempt is retried within seconds while the staff
member is still looking at the screen, rather than waiting for morning. On Pro,
`*/5 * * * *` in [`vercel.json`](vercel.json) is a better fit.

Uniforms are described in words, per cart, at `/admin`. That description is
injected into the prompt verbatim, so how it is worded matters more than any
other setting here.

### Reference photos and the logo

Words describe a navy polo well enough. They cannot describe *your* logo, so
`/admin` takes one photo per item — cap, apron, shirt, logo — and those are sent
ahead of the staff photos on every call. The logo one is the point: it is the
only way the check can tell your print from any other.

They are stored under a `uniforms/<profile>` prefix rather than in the
uploader's folder, since they belong to the business, and they are shrunk in the
browser before upload because a phone photo would otherwise exceed the request
limit.

### Resolution is the accuracy dial, not the image size

Gemini 3.x prices an image by the **media resolution** asked for, not by how
many pixels were sent. Measured on this project's own captures:

| `GEMINI_MEDIA_RESOLUTION` | Tokens per image | Cost/month, 200 staff |
| --- | --- | --- |
| `MEDIA_RESOLUTION_LOW` | ~266 | — |
| `MEDIA_RESOLUTION_MEDIUM` | ~540 | ₹179 |
| `MEDIA_RESOLUTION_HIGH` *(default)* | ~1064 | ₹251 |
| `MEDIA_RESOLUTION_ULTRA_HIGH` | ~2160 | ₹402 |

Two consequences worth holding on to:

- **Shrinking the upload saves bandwidth and not one token.** Captures are
  1024px (`CAPTURE_MAX_EDGE`) so the detail the check needs is actually present;
  a single photo then serves both the manager's review and the model.
- **If a logo is being missed, raise the resolution, not the image size.** That
  is the only dial that changes either the answer or the bill.

### Why it still costs little

- **`thinkingLevel: "minimal"`.** Thinking tokens bill at the *output* rate and
  "is a cap present" needs no reasoning. This is also why the default model is
  Flash-Lite: `gemini-3.8-flash` cannot go below `"low"`.
- **Batches of 8.** One call, one shared instruction block, one set of reference
  photos, and eight times the headroom against the requests-per-minute ceiling.
- **Check-outs are never checked.** Re-verifying a uniform at the end of a shift
  costs a call and tells you nothing new. Halves the volume outright.
- **Tiny output.** Single-character enums, and a written reason only on a fail.

A daily cap (`GEMINI_DAILY_CALL_CAP`) backstops all of it: past the ceiling,
checks stay queued rather than being dropped, so a runaway loop costs nothing
and the work resumes the next day.

### The score

The check grades **how each item is worn**, not merely whether it is there:

| Grade | Meaning | Credit |
| --- | --- | --- |
| `g` | worn properly | full weight |
| `p` | present but worn badly — cap pushed back, apron untied, shirt crumpled | half |
| `n` | not worn | none |
| `?` | the photo cannot settle it | bracketed, see below |

Five items are graded — cap, apron, shirt, logo, and overall turnout — each
carrying a weight set per uniform in `/admin`. The score is the weighted share
earned, out of 100, and a uniform passes at or above its pass mark.

Four grades, not a number, is deliberate. A model asked to rate an item 0-100
returns something that looks precise and moves between runs on the same photo;
asked whether something is worn properly, badly, or not at all, it is steady.
More buckets would add noise rather than detail. The arithmetic then happens in
`scoreObservation`, so the score is stable, explainable ("apron worn badly,
half of 20"), and adjustable without touching the prompt.

**Three scores, not one.** `score_worst` treats every `?` as not worn,
`score_best` as worn properly, and the verdict only commits to pass or fail
when both land on the same side of the pass mark. Anything else is `unclear`
and goes to a person, which is what stops a dark photo from producing a
confident accusation. The displayed score is the midpoint.

Watch the interaction between weights and the pass mark: with the defaults
(cap 20, apron 20, shirt 25, logo 15, turnout 20) and a mark of 70, someone
missing only their cap scores 80 and still passes. Raise the mark if every item
must be present and properly worn.

## Deploying to Vercel

Import the repo at [vercel.com/new](https://vercel.com/new). Next.js is detected
automatically — the default build command, output directory, and install command
are all correct, so nothing needs overriding.

**1. Environment variables**

Add these under Settings → Environment Variables, for every environment you
want to work (Production, Preview, Development):

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Build-time. `pk_live_…` for Production. |
| `CLERK_SECRET_KEY` | Server only. `sk_live_…` for Production. |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | `/dashboard` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | `/dashboard` |
| `NEXT_PUBLIC_SUPABASE_URL` | |
| `SUPABASE_SECRET_KEY` | Server only. `sb_secret_…`, never the publishable key. |
| `SUPABASE_PHOTOS_BUCKET` | `photos` |
| `STORAGE_PROVIDER` | `supabase` or `cloudinary` |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` / `_FOLDER` | Only when `STORAGE_PROVIDER=cloudinary` |
| `GEMINI_API_KEY` | Server only. Without it the dress-check worker fails at runtime. |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` |
| `GEMINI_MEDIA_RESOLUTION` | `MEDIA_RESOLUTION_HIGH`. Raise for small details, at roughly double the cost per step. |
| `GEMINI_DAILY_CALL_CAP` | Ceiling on model calls per day |
| `CRON_SECRET` | Vercel presents this to the cron route as a bearer token |

`SUPABASE_ACCESS_TOKEN` is **not** in this list on purpose: it is a local
migration credential that reaches every project on the account, and the
deployed app never reads it.

The `NEXT_PUBLIC_*` values are compiled into the client bundle, so they must be
present *before* the build and a change to one needs a fresh deploy. The rest
are read per request and only ever on the server.

**2. Point Clerk at the deployed domain**

The `pk_test_`/`sk_test_` keys work on `*.vercel.app` previews but not on a real
production domain. In the Clerk dashboard, create a **production instance**, add
the domain, and add the DNS records Clerk asks for. Then use that instance's
`pk_live_`/`sk_live_` keys for the Production environment only — keep the test
keys on Preview and Development so preview deploys keep working.

**3. Run the schema against the production project**

Paste [`supabase/schema.sql`](supabase/schema.sql) into the SQL editor of
whichever Supabase project the deployment points at. A separate project for
production keeps real photos out of your development data.

**4. Check the camera works**

Vercel serves every deployment over HTTPS, which is what `getUserMedia`
requires, so the camera and the on-device face model both work on preview URLs
as well as production.

### Platform limits worth knowing

- **Request bodies are capped at 4.5 MB.** Vercel rejects anything larger at the
  edge, before the function runs. `MAX_UPLOAD_BYTES` in
  [src/lib/photos.ts](src/lib/photos.ts) is set to 4 MB so an oversized capture
  fails with this app's message rather than an opaque platform error. Going
  past 4.5 MB means uploading straight to storage from the browser with a
  pre-signed URL instead of proxying bytes through the route handler.
- **The upload route asks for `maxDuration = 30`**, up from the 10s default, so
  a slow connection plus the storage round-trip doesn't get cut off.
- **The rate limiter is in-memory** ([src/lib/rate-limit.ts](src/lib/rate-limit.ts)),
  so each serverless instance counts separately and the effective limit is
  higher than the configured 20/minute. Back it with Upstash Redis if you need
  a real ceiling.
- **Put the deployment in a region near the Supabase project** (Settings →
  Functions). Every upload and gallery render is a round-trip to it, so a
  mismatched region shows up directly as latency.

## Security notes

- `SUPABASE_SECRET_KEY` and the Cloudinary secret are never exposed to the
  browser. `src/lib/supabase/admin.ts` and the storage providers import
  `server-only`, so the build fails if they are ever pulled into a client bundle.
- Storage paths are built from the Clerk user id **on the server**. A client
  cannot choose where its file lands, so cross-user writes are impossible.
- Every route handler calls `auth()` and scopes its query by `userId`. Passing
  another user's photo id to `DELETE /api/photos/:id` reads as "not found".
- Uploads are checked against the file's real magic bytes, not the browser's
  claimed `Content-Type`, and capped at 4 MB (see `MAX_UPLOAD_BYTES`).
- RLS is enabled on `photos` with no permissive policies, so a leaked anon key
  grants nothing.
- The rate limiter in `src/lib/rate-limit.ts` is in-memory, which only covers a
  single instance. For a multi-instance deployment, back it with Redis/Upstash.

## Layout

| Path | What it does |
| --- | --- |
| [src/proxy.ts](src/proxy.ts) | Clerk auth gate. Next.js 16 renamed `middleware.ts` to `proxy.ts`. |
| [src/app/camera/page.tsx](src/app/camera/page.tsx) | Capture screen |
| [src/components/CameraCapture.tsx](src/components/CameraCapture.tsx) | Camera stream, capture, preview, upload |
| [src/app/dashboard/page.tsx](src/app/dashboard/page.tsx) | Gallery, server-rendered with fresh signed URLs |
| [src/app/api/photos/route.ts](src/app/api/photos/route.ts) | `GET` list, `POST` upload |
| [src/lib/photos.ts](src/lib/photos.ts) | Validation and metadata; the core logic |
| [src/lib/storage/](src/lib/storage/) | Swappable Supabase / Cloudinary backends |
| [src/app/attendance/page.tsx](src/app/attendance/page.tsx) | Punch screen |
| [src/components/AttendancePunch.tsx](src/components/AttendancePunch.tsx) | Live geofence readout, capture, punch |
| [src/app/api/attendance/route.ts](src/app/api/attendance/route.ts) | `GET` today's status, `POST` a punch |
| [src/lib/attendance/service.ts](src/lib/attendance/service.ts) | Staff lookup, session rules, punch recording |
| [src/lib/attendance/geofence.ts](src/lib/attendance/geofence.ts) | Haversine distance, shared by both sides |
| [src/lib/image.ts](src/lib/image.ts) | Capture sizing and browser-side shrinking |
| [src/app/admin/page.tsx](src/app/admin/page.tsx) | Cart and staff management, role-gated |
| [src/app/admin/actions.ts](src/app/admin/actions.ts) | Server Actions; each re-checks the role itself |
| [src/components/admin/](src/components/admin/) | Cart editor with "use my location", staff editor |
| [src/lib/attendance/admin.ts](src/lib/attendance/admin.ts) | Admin queries and the first-admin bootstrap |
| [supabase/attendance.sql](supabase/attendance.sql) | Carts, staff, punches, dress-check queue |
| [src/lib/gemini/dresscode.ts](src/lib/gemini/dresscode.ts) | The batched model call, schema, and verdict policy |
| [src/lib/attendance/dress-checks.ts](src/lib/attendance/dress-checks.ts) | Queue: enqueue, claim, judge, record spend |
| [src/app/api/cron/dress-checks/route.ts](src/app/api/cron/dress-checks/route.ts) | Durable worker, bearer-token gated |
| [supabase/dress-checks.sql](supabase/dress-checks.sql) | Atomic claim RPC and queue columns |
| [supabase/scoring.sql](supabase/scoring.sql) | Weights, pass mark, reference-image table |
| [scripts/db-migrate.mjs](scripts/db-migrate.mjs) | Applies .sql files via the Management API |

## Notes on versions

This project uses **Next.js 16** and **Clerk Core 3**, both of which renamed
things you may remember differently:

- `middleware.ts` → `proxy.ts` (the `clerkMiddleware` export is unchanged)
- `<SignedIn>` / `<SignedOut>` / `<Protect>` → `<Show when="signed-in">` etc.
