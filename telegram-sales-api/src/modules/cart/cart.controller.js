const { getPool } = require("../../db");

function normalizeTelegramId(value) {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value).trim();
}

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
  const normalizedTelegramId = normalizeTelegramId(telegramId);
  if (!normalizedTelegramId) {
    return null;
  }
  const cartRes = await client.query(
    `SELECT * FROM carts
     WHERE telegram_id = $1 AND status = 'ACTIVE'
     ORDER BY created_at DESC
     LIMIT 1`,
    [normalizedTelegramId]
  );
  if (cartRes.rowCount > 0) {
    return cartRes.rows[0];
  }

  try {
    const insertRes = await client.query(
      `INSERT INTO carts (telegram_id, status)
       VALUES ($1, 'ACTIVE')
       RETURNING *`,
      [normalizedTelegramId]
    );
    return insertRes.rows[0];
  } catch (error) {
    if (error && error.code === "23505") {
      const fallbackRes = await client.query(
        `SELECT * FROM carts
         WHERE telegram_id = $1 AND status = 'ACTIVE'
         ORDER BY created_at DESC
         LIMIT 1`,
        [normalizedTelegramId]
      );
      if (fallbackRes.rowCount > 0) {
        return fallbackRes.rows[0];
      }
    }
    throw error;
  }
}

async function getActiveCart(telegramId, client, options = {}) {
  const normalizedTelegramId = normalizeTelegramId(telegramId);
  if (!normalizedTelegramId) {
    return null;
  }
  const lockClause = options.forUpdate ? "FOR UPDATE" : "";
  const cartRes = await client.query(
    `SELECT * FROM carts
     WHERE telegram_id = $1 AND status = 'ACTIVE'
     ORDER BY created_at DESC
     LIMIT 1 ${lockClause}`,
    [normalizedTelegramId]
  );
  if (cartRes.rowCount === 0) {
    return null;
  }
  return cartRes.rows[0];
}

async function getCart(req, res, next) {
  const telegramId = normalizeTelegramId(req.query.telegram_id);
  if (!telegramId) {
    return res.status(400).json({ error: "telegram_id is required" });
  }

  try {
    const pool = getPool();
    const cart = await getActiveCart(telegramId, pool);

    if (!cart) {
      return res.json({ items: [], total_usd: 0 });
    }

    const itemsRes = await pool.query(
      `SELECT ci.product_id,
              p.name,
              ci.unit_price_usd,
              ci.qty,
              ci.total_price_usd
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ci.cart_id = $1
       ORDER BY ci.created_at ASC`,
      [cart.id]
    );

    const items = itemsRes.rows.map((item) => {
      const unitPrice = Number(item.unit_price_usd);
      const qty = Number(item.qty);
      const totalPrice =
        item.total_price_usd === null || item.total_price_usd === undefined
          ? Number((unitPrice * qty).toFixed(2))
          : Number(item.total_price_usd);
      return {
        product_id: item.product_id,
        name: item.name,
        unit_price_usd: unitPrice,
        qty,
        total_price_usd: totalPrice,
      };
    });

    const total = items.reduce((sum, item) => sum + item.total_price_usd, 0);

    return res.json({ items, total_usd: Number(total.toFixed(2)) });
  } catch (error) {
    return next(error);
  }
}

async function addToCart(req, res, next) {
  const telegramId = normalizeTelegramId(req.body.telegram_id);
  const productId = req.body.product_id;
  const qty = Math.max(parseInt(req.body.qty, 10) || 1, 1);
  const username = req.body.username || null;

  if (!telegramId) {
    return res.status(400).json({ error: "telegram_id is required" });
  }
  if (!productId) {
    return res.status(400).json({ error: "product_id is required" });
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await ensureUser(client, telegramId, username);
    const cart = await getOrCreateActiveCart(client, telegramId);
    if (!cart) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "cart_not_found" });
    }

    const productRes = await client.query(
      `SELECT id, name, price
       FROM products
       WHERE id = $1 AND is_active = true`,
      [productId]
    );
    if (productRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "product_not_found" });
    }

    const product = productRes.rows[0];
    const unitPrice = Number(product.price);
    const totalPrice = Number((unitPrice * qty).toFixed(2));

    await client.query(
      `INSERT INTO cart_items
        (cart_id, product_id, unit_price_usd, qty, total_price_usd)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (cart_id, product_id)
       DO UPDATE SET qty = cart_items.qty + EXCLUDED.qty,
                     unit_price_usd = EXCLUDED.unit_price_usd,
                     total_price_usd = (cart_items.qty + EXCLUDED.qty)
                       * EXCLUDED.unit_price_usd,
                     updated_at = now()`,
      [cart.id, product.id, unitPrice, qty, totalPrice]
    );

    await client.query(
      `UPDATE carts
       SET updated_at = now()
       WHERE id = $1`,
      [cart.id]
    );

    await client.query("COMMIT");
    const itemsRes = await client.query(
      `SELECT ci.product_id,
              p.name,
              ci.unit_price_usd,
              ci.qty,
              ci.total_price_usd
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ci.cart_id = $1
       ORDER BY ci.created_at ASC`,
      [cart.id]
    );
    const items = itemsRes.rows.map((item) => ({
      product_id: item.product_id,
      name: item.name,
      unit_price_usd: Number(item.unit_price_usd),
      qty: Number(item.qty),
      total_price_usd: Number(item.total_price_usd),
    }));
    const total = items.reduce((sum, item) => sum + item.total_price_usd, 0);

    return res.status(201).json({
      items,
      total_usd: Number(total.toFixed(2)),
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
}

async function clearCart(req, res, next) {
  const telegramId = normalizeTelegramId(req.body.telegram_id);
  if (!telegramId) {
    return res.status(400).json({ error: "telegram_id is required" });
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const cart = await getActiveCart(telegramId, client);

    if (cart) {
      const cartId = cart.id;
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
  const telegramId = normalizeTelegramId(req.body.telegram_id);
  const username = req.body.username || null;
  if (!telegramId) {
    return res.status(400).json({ error: "telegram_id is required" });
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    console.log("[cart/checkout] telegram_id:", telegramId);
    const user = await ensureUser(client, telegramId, username);
    const cart = await getActiveCart(telegramId, client, { forUpdate: true });

    if (!cart) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Tu carrito está vacío" });
    }

    console.log("[cart/checkout] cart:", { id: cart.id, status: cart.status });
    const itemsRes = await client.query(
      `SELECT ci.*,
              p.name,
              p.price
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ci.cart_id = $1
       ORDER BY p.name ASC`,
      [cart.id]
    );

    if (itemsRes.rowCount === 0) {
      await client.query("ROLLBACK");
      console.log("[cart/checkout] items_count:", 0);
      return res.status(400).json({ message: "Tu carrito está vacío" });
    }

    console.log("[cart/checkout] items_count:", itemsRes.rowCount);
    const total = itemsRes.rows.reduce((sum, item) => {
      const unitPrice = Number(item.unit_price_usd ?? item.price);
      if (item.total_price_usd !== null && item.total_price_usd !== undefined) {
        return sum + Number(item.total_price_usd);
      }
      return sum + unitPrice * Number(item.qty);
    }, 0);
    const totalRounded = Number(total.toFixed(2));

    const firstItem = itemsRes.rows[0];

    const orderRes = await client.query(
      `INSERT INTO orders
        (user_id, product_id, affiliate_id, status, unit_price_at_purchase)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        user.id,
        firstItem.product_id,
        user.referred_by_affiliate_id,
        "CREATED",
        totalRounded,
      ]
    );

    for (const item of itemsRes.rows) {
      const qty = Number(item.qty);
      const unitPrice = Number(item.unit_price_usd ?? item.price);
      const totalPrice = Number((unitPrice * qty).toFixed(2));
      await client.query(
        `INSERT INTO order_items
          (order_id, product_id, qty, unit_price_usd, total_price_usd, line_total_usd, price_usd)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          orderRes.rows[0].id,
          item.product_id,
          qty,
          unitPrice,
          totalPrice,
          totalPrice,
          unitPrice,
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
    return res.status(500).json({
      error: "CHECKOUT_FAILED",
      message: "No se pudo procesar el checkout",
    });
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
