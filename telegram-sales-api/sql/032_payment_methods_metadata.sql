ALTER TABLE payment_methods
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS markup text,
  ADD COLUMN IF NOT EXISTS sort_order int;
