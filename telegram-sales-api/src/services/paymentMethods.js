const DEFAULT_METHODS = [
  { key: "NEQUI", label: "Nequi", sort_order: 1 },
  { key: "BINANCE_ID", label: "Binance ID", sort_order: 2 },
  { key: "CRYPTO", label: "Cripto", sort_order: 3 },
  { key: "MERCADOPAGO", label: "Mercado pago", sort_order: 4 },
  { key: "PAYPAL", label: "Paypal", sort_order: 5 },
];

async function ensurePaymentMethodsSchema(pool) {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS payment_methods (
       method_key text PRIMARY KEY,
       label text,
       description text,
       image_url text,
       markup text,
       sort_order int,
       enabled boolean NOT NULL DEFAULT true,
       updated_at timestamptz NOT NULL DEFAULT now()
     )`
  );
  await pool.query(
    `ALTER TABLE payment_methods
     ADD COLUMN IF NOT EXISTS label text,
     ADD COLUMN IF NOT EXISTS description text,
     ADD COLUMN IF NOT EXISTS image_url text,
     ADD COLUMN IF NOT EXISTS markup text,
     ADD COLUMN IF NOT EXISTS sort_order int`
  );
  const values = [];
  const placeholders = DEFAULT_METHODS.map((item, idx) => {
    const base = idx * 3;
    values.push(item.key, item.label, item.sort_order);
    return `($${base + 1}, $${base + 2}, $${base + 3}, true)`;
  }).join(", ");
  if (values.length > 0) {
    await pool.query(
      `INSERT INTO payment_methods (method_key, label, sort_order, enabled)
       VALUES ${placeholders}
       ON CONFLICT (method_key) DO NOTHING`,
      values
    );
  }
}

function normalizeMethodKey(input) {
  const key = String(input || "").trim().toUpperCase();
  return key ? key : null;
}

async function listPaymentMethods(pool) {
  await ensurePaymentMethodsSchema(pool);
  const res = await pool.query(
    `SELECT method_key, label, description, image_url, markup, sort_order, enabled
     FROM payment_methods
     ORDER BY sort_order NULLS LAST, method_key ASC`
  );
  return res.rows.map((row) => ({
    key: row.method_key,
    label: row.label || row.method_key,
    description: row.description || null,
    enabled: Boolean(row.enabled),
    image_url: row.image_url || null,
    markup: row.markup || null,
    sort_order: row.sort_order ?? null,
  }));
}

async function togglePaymentMethod(pool, methodKey) {
  await ensurePaymentMethodsSchema(pool);
  const key = normalizeMethodKey(methodKey);
  if (!key) {
    return null;
  }
  const res = await pool.query(
    `UPDATE payment_methods
     SET enabled = NOT enabled,
         updated_at = now()
     WHERE method_key = $1
     RETURNING method_key, enabled`,
    [key]
  );
  if (res.rowCount === 0) {
    await pool.query(
      `INSERT INTO payment_methods (method_key, enabled)
       VALUES ($1, false)
       ON CONFLICT (method_key) DO NOTHING`,
      [key]
    );
  }
  return listPaymentMethods(pool);
}

async function isPaymentMethodEnabled(pool, methodKey) {
  await ensurePaymentMethodsSchema(pool);
  const key = normalizeMethodKey(methodKey);
  if (!key) {
    return true;
  }
  const res = await pool.query(
    "SELECT enabled FROM payment_methods WHERE method_key = $1",
    [key]
  );
  if (res.rowCount === 0) {
    return true;
  }
  return Boolean(res.rows[0].enabled);
}

async function upsertPaymentMethod(pool, payload) {
  await ensurePaymentMethodsSchema(pool);
  const key = normalizeMethodKey(payload?.method_key || payload?.key);
  if (!key) {
    return null;
  }
  const label = payload?.label ? String(payload.label).trim() : null;
  const description = payload?.description ? String(payload.description).trim() : null;
  const imageUrl = payload?.image_url ? String(payload.image_url).trim() : null;
  const markup = payload?.markup ? String(payload.markup) : null;
  const sortOrderRaw = payload?.sort_order;
  const sortOrder = Number.isFinite(Number(sortOrderRaw)) ? Number(sortOrderRaw) : null;
  const enabled =
    payload?.enabled === undefined || payload?.enabled === null
      ? false
      : Boolean(payload.enabled);
  await pool.query(
    `INSERT INTO payment_methods (method_key, label, description, image_url, markup, sort_order, enabled)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (method_key)
     DO UPDATE SET
       label = EXCLUDED.label,
       description = EXCLUDED.description,
       image_url = EXCLUDED.image_url,
       markup = EXCLUDED.markup,
       sort_order = EXCLUDED.sort_order,
       enabled = EXCLUDED.enabled,
       updated_at = now()`,
    [key, label, description, imageUrl, markup, sortOrder, enabled]
  );
  return listPaymentMethods(pool);
}

async function deletePaymentMethod(pool, methodKey) {
  await ensurePaymentMethodsSchema(pool);
  const key = normalizeMethodKey(methodKey);
  if (!key) {
    return null;
  }
  await pool.query(
    "DELETE FROM payment_methods WHERE method_key = $1",
    [key]
  );
  return listPaymentMethods(pool);
}

module.exports = {
  DEFAULT_METHODS,
  ensurePaymentMethodsSchema,
  normalizeMethodKey,
  listPaymentMethods,
  togglePaymentMethod,
  isPaymentMethodEnabled,
  upsertPaymentMethod,
  deletePaymentMethod,
};
