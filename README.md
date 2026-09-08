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

## Security notes

- `SUPABASE_SECRET_KEY` and the Cloudinary secret are never exposed to the
  browser. `src/lib/supabase/admin.ts` and the storage providers import
  `server-only`, so the build fails if they are ever pulled into a client bundle.
- Storage paths are built from the Clerk user id **on the server**. A client
  cannot choose where its file lands, so cross-user writes are impossible.
- Every route handler calls `auth()` and scopes its query by `userId`. Passing
  another user's photo id to `DELETE /api/photos/:id` reads as "not found".
- Uploads are checked against the file's real magic bytes, not the browser's
  claimed `Content-Type`, and capped at 8 MB.
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

## Notes on versions

This project uses **Next.js 16** and **Clerk Core 3**, both of which renamed
things you may remember differently:

- `middleware.ts` → `proxy.ts` (the `clerkMiddleware` export is unchanged)
- `<SignedIn>` / `<SignedOut>` / `<Protect>` → `<Show when="signed-in">` etc.
