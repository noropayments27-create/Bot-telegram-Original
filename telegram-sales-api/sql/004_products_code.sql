-- 004_products_code.sql
-- Add short code for products, backfill existing rows, auto-assign new ones.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS code text;

WITH max_code AS (
  SELECT COALESCE(MAX(code::int), 0) AS max_code
  FROM products
  WHERE code ~ '^[0-9]+$'
),
ranked AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM products
  WHERE code IS NULL
)
UPDATE products p
SET code = lpad((ranked.rn + max_code.max_code)::text, 5, '0')
FROM ranked, max_code
WHERE p.id = ranked.id;

DO $$ BEGIN
  CREATE SEQUENCE IF NOT EXISTS products_code_seq;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

SELECT setval(
  'products_code_seq',
  GREATEST(
    COALESCE((SELECT MAX(code::int) FROM products WHERE code ~ '^[0-9]+$'), 0),
    0
  ),
  true
);

DO $$ BEGIN
  ALTER TABLE products
    ADD CONSTRAINT products_code_unique UNIQUE (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE products
  ALTER COLUMN code SET NOT NULL;

CREATE OR REPLACE FUNCTION set_products_code()
RETURNS trigger AS $$
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    NEW.code := lpad(nextval('products_code_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_code ON products;
CREATE TRIGGER trg_products_code
BEFORE INSERT ON products
FOR EACH ROW
EXECUTE FUNCTION set_products_code();
