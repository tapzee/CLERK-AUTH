-- Admin panel support. Run after supabase/attendance.sql.

-- Audit trail for the pin. Carts sit in fixed spots, so this is not about
-- drift — it is so a mistyped coordinate can be traced to when it changed,
-- rather than silently failing every punch at that cart from then on.
alter table public.carts
  add column if not exists pin_updated_at timestamptz not null default now();
