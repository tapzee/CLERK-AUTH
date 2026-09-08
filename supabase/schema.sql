-- Run this in the Supabase SQL editor (Dashboard → SQL → New query).
--
-- The app talks to Supabase only from Next.js server code, using the service
-- role key. RLS is still switched on with no permissive policies, so if the
-- anon key ever leaks into a client bundle it grants exactly nothing.

-- 1. Photo metadata -----------------------------------------------------------
-- This table is the index for every photo regardless of where the bytes live,
-- so it is needed even when STORAGE_PROVIDER=cloudinary.

create table if not exists public.photos (
  id            uuid primary key default gen_random_uuid(),
  -- Clerk user ids are strings like "user_2abc…", not uuids.
  user_id       text        not null,
  -- Which backend holds the bytes: 'supabase' or 'cloudinary'. Recorded per row
  -- so photos keep resolving after the provider is switched.
  provider      text        not null default 'supabase'
                            check (provider in ('supabase', 'cloudinary')),
  -- Supabase: the object path in the bucket. Cloudinary: the public_id.
  storage_path  text        not null,
  content_type  text        not null,
  byte_size     integer     not null check (byte_size > 0),
  width         integer,
  height        integer,
  captured_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),

  -- Where the device said it was when the shutter fired. Null if the user
  -- denied location, or no fix arrived in time; `location_error` says which.
  -- These are self-reported by the browser and cannot be independently
  -- verified, so treat them as a claim rather than proof of presence.
  latitude      double precision check (latitude between -90 and 90),
  longitude     double precision check (longitude between -180 and 180),
  -- 68% confidence radius in metres. A phone with GPS gives single digits;
  -- a desktop on Wi-Fi/IP lookup can be off by hundreds of metres.
  accuracy_m    double precision check (accuracy_m >= 0),
  altitude_m    double precision,
  location_error text,

  -- 'manual' = the user pressed the button, 'blink' = auto-fired by the
  -- deliberate-blink detector.
  capture_method text not null default 'manual'
                 check (capture_method in ('manual', 'blink')),

  unique (provider, storage_path)
);

create index if not exists photos_user_id_captured_at_idx
  on public.photos (user_id, captured_at desc);

alter table public.photos enable row level security;

-- Deliberately no policies: only the service role (which bypasses RLS) reads
-- or writes this table, and it always filters by the Clerk user id.
revoke all on public.photos from anon, authenticated;

-- 2. Private storage bucket ---------------------------------------------------
-- Only needed when STORAGE_PROVIDER=supabase.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photos',
  'photos',
  false,                                              -- private: reads need a signed URL
  8388608,                                            -- 8 MB, matches MAX_UPLOAD_BYTES
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Objects live at "<clerk_user_id>/<uuid>.<ext>". The server builds that prefix
-- from the verified session, so a user can never write outside their own folder.
