-- AI-written garment descriptions, used at check time instead of resending the
-- reference photo itself.
--
-- Run after supabase/rbac.sql. Additive and idempotent.
--
-- The logo is the one item that still needs the actual photo on every check --
-- a small emblem cannot be described precisely enough in words to catch a
-- different logo. Everything else (cap, apron, shirt) is described once, in
-- text, the moment its photo is uploaded; that description is what rides on
-- every check-in from then on, not the image.

alter table public.uniform_reference_images
  add column if not exists description text;

comment on column public.uniform_reference_images.description is
  'AI-written description of this garment (colour, cut, distinguishing '
  'features), generated once when the photo was uploaded and editable by an '
  'owner afterwards. Sent to the uniform check in place of the photo for '
  'every kind except ''logo'', which is always sent as the image itself.';
