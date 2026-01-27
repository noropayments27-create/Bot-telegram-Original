const DEFAULT_METHODS = [
  { key: "NEQUI", label: "Nequi" },
  { key: "BINANCE_ID", label: "Binance ID" },
  { key: "CRYPTO", label: "Cripto" },
  { key: "MERCADOPAGO", label: "Mercado pago" },
  { key: "PAYPAL", label: "Paypal" },
];

async function ensurePaymentMethodsSchema(pool) {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS payment_methods (
       method_key text PRIMARY KEY,
       enabled boolean NOT NULL DEFAULT true,
       updated_at timestamptz NOT NULL DEFAULT now()
     )`
  );
  const values = [];
  const placeholders = DEFAULT_METHODS.map((item, idx) => {
    values.push(item.key);
    return `($${idx + 1}, true)`;
  }).join(", ");
  if (values.length > 0) {
    await pool.query(
      `INSERT INTO payment_methods (method_key, enabled)
       VALUES ${placeholders}
       ON CONFLICT (method_key) DO NOTHING`,
      values
    );
  }
}

function normalizeMethodKey(input) {
  const key = String(input || "").trim().toUpperCase();
  const allowed = new Set(DEFAULT_METHODS.map((item) => item.key));
  return allowed.has(key) ? key : null;
}

async function listPaymentMethods(pool) {
  await ensurePaymentMethodsSchema(pool);
  const res = await pool.query(
    "SELECT method_key, enabled FROM payment_methods"
  );
  const byKey = new Map(res.rows.map((row) => [row.method_key, row.enabled]));
  return DEFAULT_METHODS.map((item) => ({
    key: item.key,
    label: item.label,
    enabled: byKey.has(item.key) ? Boolean(byKey.get(item.key)) : true,
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

module.exports = {
  DEFAULT_METHODS,
  ensurePaymentMethodsSchema,
  normalizeMethodKey,
  listPaymentMethods,
  togglePaymentMethod,
  isPaymentMethodEnabled,
};
