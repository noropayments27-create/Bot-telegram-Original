const { getPool } = require("../../db");

async function ensureUser(client, telegramId, username) {
  const userRes = await client.query(
    "SELECT * FROM users WHERE telegram_id = $1",
    [telegramId]
  );
  if (userRes.rowCount > 0) {
    return userRes.rows[0];
  }

  const insertRes = await client.query(
    `INSERT INTO users (telegram_id, telegram_username)
     VALUES ($1, $2)
     RETURNING *`,
    [telegramId, username || null]
  );
  return insertRes.rows[0];
}

async function getOrCreateActiveCart(client, telegramId) {
  const cartRes = await client.query(
    `SELECT * FROM carts
     WHERE telegram_id = $1 AND status = 'ACTIVE'
     ORDER BY created_at DESC
     LIMIT 1`,
    [telegramId]
  );
  if (cartRes.rowCount > 0) {
    return cartRes.rows[0];
  }

  try {
    const insertRes = await client.query(
      `INSERT INTO carts (telegram_id, status)
       VALUES ($1, 'ACTIVE')
       RETURNING *`,
      [telegramId]
    );
    return insertRes.rows[0];
  } catch (error) {
    if (error && error.code === "23505") {
      const fallbackRes = await client.query(
        `SELECT * FROM carts
         WHERE telegram_id = $1 AND status = 'ACTIVE'
         ORDER BY created_at DESC
         LIMIT 1`,
        [telegramId]
      );
      if (fallbackRes.rowCount > 0) {
        return fallbackRes.rows[0];
      }
    }
    throw error;
  }
}

async function getCart(req, res, next) {
  const telegramId = Number(req.query.telegram_id);
  if (!Number.isFinite(telegramId)) {
    return res.status(400).json({ error: "telegram_id is required" });
  }

  try {
    const pool = getPool();
    const cartRes = await pool.query(
      `SELECT * FROM carts
       WHERE telegram_id = $1 AND status = 'ACTIVE'
       ORDER BY created_at DESC
       LIMIT 1`,
      [telegramId]
    );

    if (cartRes.rowCount === 0) {
      return res.json({ items: [], total_usd: 0 });
    }

    const cart = cartRes.rows[0];
    const itemsRes = await pool.query(
      `SELECT item_key, name, unit_price_usd, qty
       FROM cart_items
       WHERE cart_id = $1
       ORDER BY created_at ASC`,
      [cart.id]
    );

    const items = itemsRes.rows.map((item) => ({
      ...item,
      unit_price_usd: Number(item.unit_price_usd),
      qty: Number(item.qty),
    }));

    const total = items.reduce(
      (sum, item) => sum + item.unit_price_usd * item.qty,
      0
    );

    return res.json({ items, total_usd: Number(total.toFixed(2)) });
  } catch (error) {
    return next(error);
  }
}

async function addToCart(req, res, next) {
  const telegramId = Number(req.body.telegram_id);
  const itemKey = req.body.item_key;
  const name = req.body.name;
  const unitPrice = Number(req.body.unit_price_usd);
  const qty = Math.max(parseInt(req.body.qty, 10) || 1, 1);
  const username = req.body.username || null;

  if (!Number.isFinite(telegramId)) {
    return res.status(400).json({ error: "telegram_id is required" });
  }
  if (!itemKey) {
    return res.status(400).json({ error: "item_key is required" });
  }
  if (!name) {
    return res.status(400).json({ error: "name is required" });
  }
  if (!Number.isFinite(unitPrice)) {
    return res.status(400).json({ error: "unit_price_usd is required" });
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await ensureUser(client, telegramId, username);
    const cart = await getOrCreateActiveCart(client, telegramId);

    const itemRes = await client.query(
      `INSERT INTO cart_items (cart_id, item_key, name, unit_price_usd, qty)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (cart_id, item_key)
       DO UPDATE SET qty = cart_items.qty + EXCLUDED.qty,
                     name = EXCLUDED.name,
                     unit_price_usd = EXCLUDED.unit_price_usd,
                     updated_at = now()
       RETURNING *`,
      [cart.id, itemKey, name, unitPrice, qty]
    );

    await client.query(
      `UPDATE carts
       SET updated_at = now()
       WHERE id = $1`,
      [cart.id]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      item: itemRes.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
}

async function clearCart(req, res, next) {
  const telegramId = Number(req.body.telegram_id);
  if (!Number.isFinite(telegramId)) {
    return res.status(400).json({ error: "telegram_id is required" });
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const cartRes = await client.query(
      `SELECT * FROM carts
       WHERE telegram_id = $1 AND status = 'ACTIVE'
       ORDER BY created_at DESC
       LIMIT 1`,
      [telegramId]
    );

    if (cartRes.rowCount > 0) {
      const cartId = cartRes.rows[0].id;
      await client.query("DELETE FROM cart_items WHERE cart_id = $1", [cartId]);
      await client.query(
        `UPDATE carts SET updated_at = now() WHERE id = $1`,
        [cartId]
      );
    }

    await client.query("COMMIT");
    return res.json({ status: "cleared" });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
}

async function checkoutCart(req, res, next) {
  const telegramId = Number(req.body.telegram_id);
  const username = req.body.username || null;
  if (!Number.isFinite(telegramId)) {
    return res.status(400).json({ error: "telegram_id is required" });
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const user = await ensureUser(client, telegramId, username);
    const cartRes = await client.query(
      `SELECT * FROM carts
       WHERE telegram_id = $1 AND status = 'ACTIVE'
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [telegramId]
    );

    if (cartRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "cart_empty" });
    }

    const cart = cartRes.rows[0];
    const itemsRes = await client.query(
      `SELECT item_key, name, unit_price_usd, qty
       FROM cart_items
       WHERE cart_id = $1
       ORDER BY created_at ASC`,
      [cart.id]
    );

    if (itemsRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "cart_empty" });
    }

    const productRes = await client.query(
      `SELECT id FROM products
       WHERE is_active = true
       ORDER BY created_at ASC
       LIMIT 1`
    );

    if (productRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "no_products" });
    }

    const total = itemsRes.rows.reduce((sum, item) => {
      return sum + Number(item.unit_price_usd) * Number(item.qty);
    }, 0);
    const totalRounded = Number(total.toFixed(2));

    const orderRes = await client.query(
      `INSERT INTO orders
        (user_id, product_id, affiliate_id, status, unit_price_at_purchase)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        user.id,
        productRes.rows[0].id,
        user.referred_by_affiliate_id,
        "CREATED",
        totalRounded,
      ]
    );

    for (const item of itemsRes.rows) {
      const qty = Number(item.qty);
      const unitPrice = Number(item.unit_price_usd);
      const lineTotal = Number((unitPrice * qty).toFixed(2));
      await client.query(
        `INSERT INTO order_items
          (order_id, item_key, name, unit_price_usd, qty, line_total_usd)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          orderRes.rows[0].id,
          item.item_key,
          item.name,
          unitPrice,
          qty,
          lineTotal,
        ]
      );
    }

    await client.query(
      `UPDATE carts
       SET status = 'CHECKED_OUT', updated_at = now()
       WHERE id = $1`,
      [cart.id]
    );

    await client.query(
      `INSERT INTO carts (telegram_id, status)
       VALUES ($1, 'ACTIVE')`,
      [telegramId]
    );

    await client.query("COMMIT");
    return res.json({
      order_id: orderRes.rows[0].id,
      total_usd: totalRounded,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
}

module.exports = {
  getCart,
  addToCart,
  clearCart,
  checkoutCart,
};
