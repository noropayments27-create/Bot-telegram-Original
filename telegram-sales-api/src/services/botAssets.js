let botAssetsSchemaReady = false;

async function ensureBotAssetsSchema(pool) {
  if (botAssetsSchemaReady) {
    return;
  }
  await pool.query(
    `CREATE TABLE IF NOT EXISTS bot_assets (
       id int PRIMARY KEY DEFAULT 1,
       payment_methods_image_url text,
       updated_at timestamptz NOT NULL DEFAULT now()
     )`
  );
  await pool.query(
    `INSERT INTO bot_assets (id)
     VALUES (1)
     ON CONFLICT (id) DO NOTHING`
  );
  botAssetsSchemaReady = true;
}

async function getBotAssets(pool) {
  await ensureBotAssetsSchema(pool);
  const res = await pool.query(
    "SELECT payment_methods_image_url FROM bot_assets WHERE id = 1"
  );
  return {
    payment_methods_image_url: res.rows[0]?.payment_methods_image_url || null,
  };
}

async function setPaymentMethodsImage(pool, imageUrl) {
  await ensureBotAssetsSchema(pool);
  const normalized = imageUrl ? String(imageUrl).trim() : null;
  await pool.query(
    `UPDATE bot_assets
     SET payment_methods_image_url = $1,
         updated_at = now()
     WHERE id = 1`,
    [normalized || null]
  );
  return normalized || null;
}

module.exports = {
  ensureBotAssetsSchema,
  getBotAssets,
  setPaymentMethodsImage,
};
