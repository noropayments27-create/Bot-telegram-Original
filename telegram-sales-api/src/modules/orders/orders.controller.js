const { getPool } = require("../../db");
const { consumeStockForOrder, releaseStockForOrder } = require("../../services/stock");
const { deliverOrderToTelegram } = require("../../services/delivery");

const ORDER_STATUS_PENDING = "CREATED"; // maps to PENDING_PAYMENT
const ORDER_STATUS_WAITING_CONFIRMATION = "WAITING_PAYMENT"; // maps to WAITING_CONFIRMATION
const ORDER_STATUS_PAID = "PAID";
const ORDER_STATUS_REJECTED = "CANCELLED"; // maps to REJECTED

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

async function createOrder(req, res, next) {
  const telegramId = Number(req.body.telegram_id);
  const productId = req.body.product_id;
  const qty = Math.max(parseInt(req.body.qty, 10) || 1, 1);
  const username = req.body.username || null;

  if (!Number.isFinite(telegramId)) {
    return res.status(400).json({ error: "telegram_id is required" });
  }
  if (!productId) {
    return res.status(400).json({ error: "product_id is required" });
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const user = await ensureUser(client, telegramId, username);

    const productRes = await client.query(
      "SELECT * FROM products WHERE id = $1",
      [productId]
    );
    if (productRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Product not found" });
    }

    const product = productRes.rows[0];
    if (!product.is_active) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Product inactive" });
    }

    const unitPrice = Number(product.price);
    const total = Number((unitPrice * qty).toFixed(2));

    const orderRes = await client.query(
      `INSERT INTO orders
        (user_id, product_id, affiliate_id, status, unit_price_at_purchase)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        user.id,
        product.id,
        user.referred_by_affiliate_id,
        ORDER_STATUS_PENDING,
        unitPrice,
      ]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      order: {
        ...orderRes.rows[0],
        qty,
        total,
      },
      payment_instructions: {
        network: "BSC",
        asset: "USDT",
        wallet: process.env.PAYMENT_WALLET || "WALLET_NOT_CONFIGURED",
        note: "Envía screenshot aquí",
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
}

async function getOrderById(req, res, next) {
  const orderId = req.params.id;

  try {
    const pool = getPool();
    const orderRes = await pool.query(
      "SELECT * FROM orders WHERE id = $1",
      [orderId]
    );

    if (orderRes.rowCount === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    const paymentRes = await pool.query(
      "SELECT * FROM order_payments WHERE order_id = $1",
      [orderId]
    );

    return res.json({
      order: orderRes.rows[0],
      payment: paymentRes.rows[0] || null,
    });
  } catch (error) {
    return next(error);
  }
}

async function submitPaymentProof(req, res, next) {
  const orderId = req.params.id;
  const telegramId = Number(req.body.telegram_id);
  const screenshotFileId = req.body.screenshot_file_id;

  if (!Number.isFinite(telegramId)) {
    return res.status(400).json({ error: "telegram_id is required" });
  }
  if (!screenshotFileId) {
    return res.status(400).json({ error: "screenshot_file_id is required" });
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const orderRes = await client.query(
      `SELECT o.*, u.telegram_id AS owner_telegram_id
       FROM orders o
       JOIN users u ON u.id = o.user_id
       WHERE o.id = $1
       FOR UPDATE`,
      [orderId]
    );

    if (orderRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Order not found" });
    }

    const order = orderRes.rows[0];
    if (Number(order.owner_telegram_id) !== telegramId) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Not allowed" });
    }

    if (order.status === ORDER_STATUS_PAID) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Order already paid" });
    }

    if (order.status === ORDER_STATUS_REJECTED) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Order rejected" });
    }

    const existingPaymentRes = await client.query(
      "SELECT * FROM order_payments WHERE order_id = $1 FOR UPDATE",
      [orderId]
    );

    if (
      existingPaymentRes.rowCount > 0
      && order.status === "WAITING_PAYMENT"
    ) {
      await client.query("ROLLBACK");
      return res
        .status(409)
        .json({ error: "SCREENSHOT_ALREADY_SUBMITTED" });
    }

    const paymentRes = await client.query(
      `INSERT INTO order_payments (order_id, screenshot_file_id, review_status)
       VALUES ($1, $2, 'PENDING')
       ON CONFLICT (order_id)
       DO UPDATE SET screenshot_file_id = EXCLUDED.screenshot_file_id,
                     submitted_at = now(),
                     review_status = 'PENDING',
                     reviewed_by_admin_at = NULL
       RETURNING *`,
      [orderId, screenshotFileId]
    );

    const updatedOrderRes = await client.query(
      `UPDATE orders
       SET status = $2
       WHERE id = $1
       RETURNING *`,
      [orderId, ORDER_STATUS_WAITING_CONFIRMATION]
    );

    await client.query("COMMIT");
    return res.json({
      order: updatedOrderRes.rows[0],
      payment: paymentRes.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
}

async function markOrderPaid(req, res, next) {
  const orderId = req.params.id;
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const orderRes = await client.query(
      `SELECT o.*, u.telegram_id
       FROM orders o
       JOIN users u ON u.id = o.user_id
       WHERE o.id = $1
       FOR UPDATE`,
      [orderId]
    );

    if (orderRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Order not found" });
    }

    const order = orderRes.rows[0];

    if (order.status === ORDER_STATUS_PAID) {
      await client.query("COMMIT");
      return res.status(200).json({ status: "already_paid" });
    }

    try {
      await consumeStockForOrder(client, order.id);
    } catch (error) {
      await client.query("ROLLBACK");
      if (error.code === "INSUFFICIENT_STOCK") {
        return res.status(409).json({
          ok: false,
          code: "INSUFFICIENT_STOCK",
          message: "Stock insuficiente para aprobar la orden.",
          available: error.available ?? null,
        });
      }
      throw error;
    }

    const updatedOrderRes = await client.query(
      `UPDATE orders
       SET status = $2, paid_at = now()
       WHERE id = $1
       RETURNING *`,
      [orderId, ORDER_STATUS_PAID]
    );

    await client.query(
      `UPDATE order_payments
       SET review_status = 'APPROVED', reviewed_by_admin_at = now()
       WHERE order_id = $1`,
      [orderId]
    );

    if (order.affiliate_id) {
      const affiliateRes = await client.query(
        "SELECT commission_rate FROM affiliates WHERE id = $1",
        [order.affiliate_id]
      );

      if (affiliateRes.rowCount > 0) {
        const rate = Number(affiliateRes.rows[0].commission_rate);
        const amount = Number(
          (Number(order.unit_price_at_purchase) * rate).toFixed(2)
        );

        await client.query(
          `INSERT INTO commissions (order_id, affiliate_id, rate, amount)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (order_id) DO NOTHING`,
          [order.id, order.affiliate_id, rate, amount]
        );
      }
    }

    await client.query("COMMIT");

    const deliveryResult = await deliverOrderToTelegram({
      dbClient: pool,
      orderId: order.id,
      telegramId: order.telegram_id,
    });

    if (deliveryResult.delivered) {
      await pool.query(
        `UPDATE orders SET status = 'DELIVERED', delivered_at = now() WHERE id = $1`,
        [order.id]
      );
      return res.json({
        ok: true,
        delivered: true,
        order: updatedOrderRes.rows[0],
      });
    }

    console.error("[order/delivery] failed:", deliveryResult.error);
    return res.json({
      ok: true,
      delivered: false,
      delivery_error: deliveryResult.error,
      order: updatedOrderRes.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
}

async function rejectPayment(req, res, next) {
  const orderId = req.params.id;
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const orderRes = await client.query(
      "SELECT * FROM orders WHERE id = $1 FOR UPDATE",
      [orderId]
    );

    if (orderRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Order not found" });
    }

    const updatedOrderRes = await client.query(
      `UPDATE orders
       SET status = $2
       WHERE id = $1
       RETURNING *`,
      [orderId, ORDER_STATUS_REJECTED]
    );

    await releaseStockForOrder(client, orderId);

    await client.query(
      `UPDATE order_payments
       SET review_status = 'REJECTED', reviewed_by_admin_at = now()
       WHERE order_id = $1`,
      [orderId]
    );

    await client.query("COMMIT");
    return res.json({ order: updatedOrderRes.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
}

module.exports = {
  createOrder,
  getOrderById,
  submitPaymentProof,
  markOrderPaid,
  rejectPayment,
};
