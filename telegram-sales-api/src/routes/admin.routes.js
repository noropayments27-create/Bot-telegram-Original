const express = require("express");
const { getPool } = require("../db");
const requireAdmin = require("../middlewares/requireAdmin");
const {
  createLoginRequest,
  getLoginRequest,
  setLoginDecision,
  REQUEST_TTL_SECONDS,
} = require("../services/adminAuth");
const {
  getFilePath,
  downloadFile,
  sendMessage,
  sendPhoto,
} = require("../services/telegram");
const { renderReceiptPng } = require("../services/receiptRenderer");
const { consumeStockForOrder, releaseStockForOrder } = require("../services/stock");
const { deliverOrderToTelegram } = require("../services/delivery");

const router = express.Router();

const DELIVERY_START_DELAY_MS = Math.max(
  Number(process.env.DELIVERY_START_DELAY_MS || 10000) || 10000,
  0
);

function parsePagination(query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(query.page_size, 10) || 20, 1), 100);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function normalizeTelegramIds(input) {
  if (!Array.isArray(input)) {
    return [];
  }
  const cleaned = input
    .map((item) => String(item).trim())
    .filter((item) => item && /^[0-9]+$/.test(item));
  return Array.from(new Set(cleaned));
}

function mapBroadcastSegment(segment, hasCustomRecipients) {
  if (hasCustomRecipients) {
    return "CUSTOM";
  }
  if (segment === "ALL") {
    return "ALL_USERS";
  }
  return segment;
}

function buildReceiptMessage(order, paymentProof) {
  const price = order.unit_price_at_purchase || order.product_price;
  const createdAt = order.paid_at || new Date();
  const createdAtText = new Date(createdAt).toLocaleString();
  const lines = [
    "Recibo de pago",
    `ID de orden: ${order.id}`,
    `Producto: ${order.product_name || order.product_id}`,
    `Precio: $${price}`,
    `Fecha: ${createdAtText}`,
    "Estado: PAGADO",
  ];
  if (paymentProof && paymentProof.screenshot_file_id) {
    lines.push(`Referencia: ${paymentProof.screenshot_file_id}`);
  }
  return lines.join("\n");
}

function parseAdminTelegramIds() {
  const value = process.env.ADMIN_TELEGRAM_IDS || "";
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item && /^[0-9]+$/.test(item))
    .map((item) => Number(item));
}

router.post("/auth/start", async (req, res) => {
  const { username, password } = req.body || {};
  const expectedUsername = process.env.ADMIN_USERNAME;
  const expectedPassword = process.env.ADMIN_PASSWORD;

  if (!expectedUsername || !expectedPassword) {
    return res.status(500).json({ error: "ADMIN_AUTH_NOT_CONFIGURED" });
  }

  if (username !== expectedUsername || password !== expectedPassword) {
    return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  }

  const admins = parseAdminTelegramIds();
  if (admins.length === 0) {
    return res.status(500).json({ error: "NO_ADMIN_TELEGRAM_IDS" });
  }

  const { requestId } = createLoginRequest();
  const replyMarkup = {
    inline_keyboard: [
      [
        {
          text: "✅ SÍ",
          callback_data: `admin_auth:${requestId}:APPROVE`,
        },
        {
          text: "❌ NO",
          callback_data: `admin_auth:${requestId}:DENY`,
        },
      ],
    ],
  };

  await Promise.all(
    admins.map((adminId) =>
      sendMessage(
        adminId,
        "¿Estas intentando Ingresar en el panel del Bot?",
        { reply_markup: replyMarkup }
      ).catch((error) => {
        console.error("Telegram 2FA notification failed", error);
      })
    )
  );

  return res.json({ request_id: requestId, expires_in: REQUEST_TTL_SECONDS });
});

router.get("/auth/status", (req, res) => {
  const requestId = String(req.query.request_id || "");
  if (!requestId) {
    return res.status(400).json({ error: "REQUEST_ID_REQUIRED" });
  }

  const entry = getLoginRequest(requestId);
  if (!entry) {
    return res.json({ status: "EXPIRED" });
  }

  if (entry.status === "APPROVED") {
    return res.json({ status: entry.status, token: entry.token });
  }

  return res.json({ status: entry.status });
});

router.post("/auth/decision", (req, res) => {
  const secret = req.header("x-bot-secret");
  const expectedSecret = process.env.BOT_TO_API_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }

  const { request_id: requestId, decision } = req.body || {};
  if (!requestId || !decision) {
    return res.status(400).json({ error: "INVALID_REQUEST" });
  }

  const entry = setLoginDecision(String(requestId), String(decision).toUpperCase());
  if (!entry) {
    return res.status(404).json({ error: "REQUEST_NOT_FOUND" });
  }

  return res.json({ status: entry.status });
});

router.use(requireAdmin);

router.get("/orders", async (req, res, next) => {
  const status = req.query.status;
  const { page, pageSize, offset } = parsePagination(req.query);
  const pool = getPool();

  const filters = [];
  const values = [];

  if (status) {
    values.push(status);
    filters.push(`o.status = $${values.length}`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  try {
    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM orders o ${whereClause}`,
      values
    );
    const total = countRes.rows[0].total;

    const listRes = await pool.query(
      `SELECT o.id, o.status, o.created_at,
              o.order_number,
              u.telegram_id,
              p.id AS product_id, p.code AS product_code, p.name AS product_name,
              (op.id IS NOT NULL) AS has_payment_proof
       FROM orders o
       JOIN users u ON u.id = o.user_id
       JOIN products p ON p.id = o.product_id
       LEFT JOIN order_payments op ON op.order_id = o.id
       ${whereClause}
       ORDER BY o.created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, offset]
    );

    res.json({
      items: listRes.rows,
      page,
      page_size: pageSize,
      total,
      total_pages: Math.ceil(total / pageSize) || 1,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/orders/:id", async (req, res, next) => {
  const orderId = req.params.id;
  const pool = getPool();

  try {
    const orderRes = await pool.query(
      `SELECT o.*, u.telegram_id, u.telegram_username,
              p.id AS product_id, p.code AS product_code,
              p.name AS product_name, p.price AS product_price
       FROM orders o
       JOIN users u ON u.id = o.user_id
       JOIN products p ON p.id = o.product_id
       WHERE o.id = $1`,
      [orderId]
    );

    if (orderRes.rowCount === 0) {
      return res.status(404).json({ error: "ORDER_NOT_FOUND" });
    }

    const paymentRes = await pool.query(
      "SELECT * FROM order_payments WHERE order_id = $1",
      [orderId]
    );

    const commissionRes = await pool.query(
      "SELECT * FROM commissions WHERE order_id = $1",
      [orderId]
    );

    const itemsRes = await pool.query(
      `SELECT
         oi.product_id,
         p.code,
         p.name,
         oi.qty,
         oi.unit_price_usd,
         oi.line_total_usd
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = $1
       ORDER BY oi.created_at ASC`,
      [orderId]
    );

    const order = orderRes.rows[0];

    return res.json({
      order: {
        id: order.id,
        order_number: order.order_number,
        status: order.status,
        unit_price_at_purchase: order.unit_price_at_purchase,
        created_at: order.created_at,
        paid_at: order.paid_at,
      },
      user: {
        telegram_id: order.telegram_id,
        telegram_username: order.telegram_username,
      },
      product: {
        id: order.product_id,
        code: order.product_code,
        name: order.product_name,
        price: order.product_price,
      },
      items: itemsRes.rows.map((row) => ({
        product_id: row.product_id,
        code: row.code,
        name: row.name,
        qty: row.qty,
        unit_price_usd: row.unit_price_usd,
        line_total_usd: row.line_total_usd,
      })),
      payment: paymentRes.rows[0] || null,
      commission: commissionRes.rows[0] || null,
    });
  } catch (error) {
    next(error);
  }
});

async function handlePaymentProof(req, res, next, asAttachment) {
  const orderId = req.params.id;
  const pool = getPool();

  try {
    const paymentRes = await pool.query(
      "SELECT screenshot_file_id FROM order_payments WHERE order_id = $1",
      [orderId]
    );

    if (paymentRes.rowCount === 0) {
      return res.status(404).json({ error: "NO_PAYMENT_PROOF" });
    }

    const fileId = paymentRes.rows[0].screenshot_file_id;
    const filePath = await getFilePath(fileId);
    const { buffer, contentType } = await downloadFile(filePath);

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-store");
    if (asAttachment) {
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="order_${orderId}_payment_proof.jpg"`
      );
    }
    return res.send(buffer);
  } catch (error) {
    next(error);
  }
}

router.get("/orders/:id/payment-proof", async (req, res, next) => {
  await handlePaymentProof(req, res, next, false);
});

router.get("/orders/:id/payment-proof/download", async (req, res, next) => {
  await handlePaymentProof(req, res, next, true);
});

router.post("/orders/:id/mark-paid", async (req, res, next) => {
  const orderId = req.params.id;
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const orderRes = await client.query(
      `SELECT o.*, u.telegram_id, u.telegram_username,
              p.name AS product_name,
              p.price AS product_price,
              p.delivery_type,
              p.delivery_payload,
              p.delivery_template,
              p.stock_mode
       FROM orders o
       JOIN users u ON u.id = o.user_id
       JOIN products p ON p.id = o.product_id
       WHERE o.id = $1
       FOR UPDATE OF o`,
      [orderId]
    );

    if (orderRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "ORDER_NOT_FOUND" });
    }

    const order = orderRes.rows[0];

    if (order.status === "PAID") {
      await client.query("COMMIT");
      return res.status(200).json({ status: "already_paid" });
    }

    const paymentRes = await client.query(
      "SELECT * FROM order_payments WHERE order_id = $1",
      [orderId]
    );

    if (paymentRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "NO_PAYMENT_PROOF" });
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
       SET status = 'PAID', paid_at = now()
       WHERE id = $1
       RETURNING *`,
      [orderId]
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

    const telegramId = order.telegram_id;
    order.paid_at = updatedOrderRes.rows[0].paid_at;

    try {
      await sendMessage(
        telegramId,
        "🎉 Felicidades, hemos recibido tu pago 🎉 🥳"
      );
    } catch (err) {
      console.error("Telegram congratulations failed", err);
    }

    const receipt = buildReceiptMessage(order, paymentRes.rows[0]);
    try {
      let items = [];
      const subtotal = order.unit_price_at_purchase;
      try {
        const itemsRes = await pool.query(
          `SELECT
             p.name,
             oi.qty,
             oi.unit_price_usd,
             oi.line_total_usd
           FROM order_items oi
           JOIN products p ON p.id = oi.product_id
           WHERE oi.order_id = $1
           ORDER BY oi.created_at ASC`,
          [orderId]
        );
        if (itemsRes.rowCount > 0) {
          items = itemsRes.rows.map((row) => {
            const itemName = row.qty > 1 ? `${row.name} x${row.qty}` : row.name;
            return {
              name: itemName,
              price: row.line_total_usd,
            };
          });
        }
      } catch (err) {
        console.error("Receipt items query failed", err);
      }

      if (items.length === 0) {
        items = [{ name: order.product_name, price: order.product_price }];
      }

      const orderNumberText = order.order_number
        ? String(order.order_number).padStart(5, "0")
        : "-";

      const receiptPng = await renderReceiptPng({
        orderId: order.id,
        orderNumber: orderNumberText,
        telegramId,
        username: order.telegram_username,
        dateTime: new Date(order.paid_at || new Date()).toLocaleString(),
        items,
        subtotal,
        commission: 0,
        total: subtotal,
        referredBy: "N/A",
      });

      try {
        await sendPhoto(telegramId, { path: receiptPng.pngPath });
      } finally {
        await receiptPng.cleanup();
      }
    } catch (err) {
      console.error("Telegram receipt failed", err);
      try {
        await sendMessage(telegramId, receipt);
      } catch (fallbackError) {
        console.error("Telegram receipt fallback failed", fallbackError);
      }
    }

    try {
      await sendMessage(
        telegramId,
        "⌚️ En breve momento estarás recibiendo tu contenido."
      );
    } catch (err) {
      console.error("Telegram content notice failed", err);
    }

    console.log("[order-delivery] scheduled", {
      orderId: order.id,
      delayMs: DELIVERY_START_DELAY_MS,
    });
    setTimeout(async () => {
      console.log("[order-delivery] starting", { orderId: order.id });
      try {
        const deliveryResult = await deliverOrderToTelegram({
          dbClient: pool,
          orderId: order.id,
          telegramId,
        });
        if (deliveryResult.delivered) {
          await pool.query(
            `UPDATE orders
             SET status = 'DELIVERED', delivered_at = now()
             WHERE id = $1`,
            [order.id]
          );
        } else {
          console.error(
            "[order/delivery] failed:",
            deliveryResult.error || "DELIVERY_FAILED"
          );
        }
      } catch (error) {
        console.error("Telegram delivery failed", error);
      }
    }, DELIVERY_START_DELAY_MS);

    return res.json({ order: updatedOrderRes.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
});

router.post("/orders/:id/reject", async (req, res, next) => {
  const orderId = req.params.id;
  const { mode, reason } = req.body || {};
  const pool = getPool();
  const client = await pool.connect();

  if (!mode || (mode !== "retry" && mode !== "cancel")) {
    return res.status(400).json({ error: "INVALID_MODE" });
  }

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
      return res.status(404).json({ error: "ORDER_NOT_FOUND" });
    }

    const paymentRes = await client.query(
      "SELECT * FROM order_payments WHERE order_id = $1",
      [orderId]
    );

    if (paymentRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "NO_PAYMENT_PROOF" });
    }

    const nextStatus = mode === "retry" ? "CREATED" : "CANCELLED";

    const updatedOrderRes = await client.query(
      `UPDATE orders
       SET status = $2
       WHERE id = $1
       RETURNING *`,
      [orderId, nextStatus]
    );

    await releaseStockForOrder(client, orderId);

    await client.query(
      `UPDATE order_payments
       SET review_status = 'REJECTED', reviewed_by_admin_at = now()
       WHERE order_id = $1`,
      [orderId]
    );

    await client.query("COMMIT");

    const telegramId = orderRes.rows[0].telegram_id;
    const reasonText = reason ? `\nMotivo: ${reason}` : "";
    const message =
      mode === "retry"
        ? `Tu pago fue rechazado. Envia una nueva Captura.${reasonText}`
        : `Tu orden fue cancelada. Contacta soporte.${reasonText}`;

    try {
      await sendMessage(telegramId, message);
    } catch (err) {
      console.error("Telegram notification failed", err);
    }

    return res.json({ order: updatedOrderRes.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
});

router.get("/affiliates", async (req, res, next) => {
  const status = req.query.status;
  const { page, pageSize, offset } = parsePagination(req.query);
  const pool = getPool();

  const filters = [];
  const values = [];

  if (status) {
    values.push(status);
    filters.push(`a.status = $${values.length}`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  try {
    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM affiliates a ${whereClause}`,
      values
    );
    const total = countRes.rows[0].total;

    const listRes = await pool.query(
      `SELECT a.id, a.status, a.commission_rate,
              a.wallet_usdt_bsc, a.binance_id,
              u.telegram_id, u.telegram_username,
              COALESCE(SUM(c.amount) FILTER (WHERE c.status = 'EARNED'), 0) AS available_balance
       FROM affiliates a
       JOIN users u ON u.id = a.user_id
       LEFT JOIN commissions c ON c.affiliate_id = a.id
       ${whereClause}
       GROUP BY a.id, u.telegram_id, u.telegram_username
       ORDER BY a.created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, offset]
    );

    res.json({
      items: listRes.rows,
      page,
      page_size: pageSize,
      total,
      total_pages: Math.ceil(total / pageSize) || 1,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/affiliates/:id", async (req, res, next) => {
  const affiliateId = req.params.id;
  const pool = getPool();

  try {
    const affiliateRes = await pool.query(
      `SELECT a.*, u.telegram_id, u.telegram_username
       FROM affiliates a
       JOIN users u ON u.id = a.user_id
       WHERE a.id = $1`,
      [affiliateId]
    );

    if (affiliateRes.rowCount === 0) {
      return res.status(404).json({ error: "AFFILIATE_NOT_FOUND" });
    }

    const balanceRes = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS available_balance
       FROM commissions
       WHERE affiliate_id = $1 AND status = 'EARNED'`,
      [affiliateId]
    );

    const commissionsRes = await pool.query(
      `SELECT id, order_id, amount, status, earned_at, paid_out_at
       FROM commissions
       WHERE affiliate_id = $1
       ORDER BY earned_at DESC
       LIMIT 50`,
      [affiliateId]
    );

    const row = affiliateRes.rows[0];

    return res.json({
      affiliate: row,
      user: {
        telegram_id: row.telegram_id,
        telegram_username: row.telegram_username,
      },
      available_balance: balanceRes.rows[0].available_balance,
      commissions: commissionsRes.rows,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/payouts", async (req, res, next) => {
  const status = req.query.status;
  const { page, pageSize, offset } = parsePagination(req.query);
  const pool = getPool();

  const filters = [];
  const values = [];

  if (status) {
    values.push(status);
    filters.push(`p.status = $${values.length}`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  try {
    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM payouts p ${whereClause}`,
      values
    );
    const total = countRes.rows[0].total;

    const listRes = await pool.query(
      `SELECT p.*, u.telegram_id, u.telegram_username
       FROM payouts p
       JOIN affiliates a ON a.id = p.affiliate_id
       JOIN users u ON u.id = a.user_id
       ${whereClause}
       ORDER BY p.created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, offset]
    );

    res.json({
      items: listRes.rows,
      page,
      page_size: pageSize,
      total,
      total_pages: Math.ceil(total / pageSize) || 1,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/payouts/:id", async (req, res, next) => {
  const payoutId = req.params.id;
  const pool = getPool();

  try {
    const payoutRes = await pool.query(
      `SELECT p.*, a.status AS affiliate_status, a.commission_rate,
              a.wallet_usdt_bsc, a.binance_id,
              u.telegram_id, u.telegram_username
       FROM payouts p
       JOIN affiliates a ON a.id = p.affiliate_id
       JOIN users u ON u.id = a.user_id
       WHERE p.id = $1`,
      [payoutId]
    );

    if (payoutRes.rowCount === 0) {
      return res.status(404).json({ error: "PAYOUT_NOT_FOUND" });
    }

    const payout = payoutRes.rows[0];
    const balanceRes = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS available_balance
       FROM commissions
       WHERE affiliate_id = $1 AND status = 'EARNED'`,
      [payout.affiliate_id]
    );

    return res.json({
      payout,
      affiliate: {
        id: payout.affiliate_id,
        status: payout.affiliate_status,
        commission_rate: payout.commission_rate,
        wallet_usdt_bsc: payout.wallet_usdt_bsc,
        binance_id: payout.binance_id,
      },
      user: {
        telegram_id: payout.telegram_id,
        telegram_username: payout.telegram_username,
      },
      available_balance: balanceRes.rows[0].available_balance,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/payouts", async (req, res, next) => {
  const { affiliate_id: affiliateId, method, destination } = req.body || {};
  const pool = getPool();

  if (!affiliateId) {
    return res.status(400).json({ error: "AFFILIATE_REQUIRED" });
  }

  if (!method || (method !== "USDT_BSC" && method !== "BINANCE_ID")) {
    return res.status(400).json({ error: "INVALID_METHOD" });
  }

  try {
    const affiliateRes = await pool.query(
      "SELECT id, wallet_usdt_bsc, binance_id FROM affiliates WHERE id = $1",
      [affiliateId]
    );

    if (affiliateRes.rowCount === 0) {
      return res.status(404).json({ error: "AFFILIATE_NOT_FOUND" });
    }

    const affiliate = affiliateRes.rows[0];
    const resolvedDestination =
      destination ||
      (method === "USDT_BSC" ? affiliate.wallet_usdt_bsc : affiliate.binance_id);

    if (!resolvedDestination) {
      return res.status(400).json({ error: "DESTINATION_REQUIRED" });
    }

    const amountRes = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM commissions
       WHERE affiliate_id = $1 AND status = 'EARNED'`,
      [affiliateId]
    );

    const amount = Number(amountRes.rows[0].total);

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "NO_EARNED_COMMISSIONS" });
    }

    const payoutRes = await pool.query(
      `INSERT INTO payouts (affiliate_id, amount, method, destination, status)
       VALUES ($1, $2, $3, $4, 'REQUESTED')
       RETURNING *`,
      [affiliateId, amount, method, resolvedDestination]
    );

    return res.status(201).json({ payout: payoutRes.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/payouts/:id/mark-sent", async (req, res, next) => {
  const payoutId = req.params.id;
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const payoutRes = await client.query(
      `SELECT p.*, u.telegram_id
       FROM payouts p
       JOIN affiliates a ON a.id = p.affiliate_id
       JOIN users u ON u.id = a.user_id
       WHERE p.id = $1
       FOR UPDATE OF p`,
      [payoutId]
    );

    if (payoutRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "PAYOUT_NOT_FOUND" });
    }

    const payout = payoutRes.rows[0];

    if (payout.status === "SENT") {
      await client.query("COMMIT");
      return res.status(200).json({ status: "already_sent" });
    }

    if (payout.status === "CANCELLED") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "PAYOUT_CANCELLED" });
    }

    const updatedRes = await client.query(
      `UPDATE payouts
       SET status = 'SENT', sent_at = now()
       WHERE id = $1
       RETURNING *`,
      [payoutId]
    );

    const commissionsRes = await client.query(
      `UPDATE commissions
       SET status = 'PAID_OUT', paid_out_at = now()
       WHERE affiliate_id = $1 AND status = 'EARNED'`,
      [payout.affiliate_id]
    );

    await client.query("COMMIT");

    const message = `✅ Tu retiro fue enviado.\n\nMonto: ${payout.amount}\nMétodo: ${payout.method}\nDestino: ${payout.destination}`;
    try {
      await sendMessage(payout.telegram_id, message);
    } catch (err) {
      console.error("Telegram notification failed", err);
    }

    return res.json({
      payout: updatedRes.rows[0],
      commissions_updated: commissionsRes.rowCount,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
});

router.post("/payouts/:id/cancel", async (req, res, next) => {
  const payoutId = req.params.id;
  const { reason } = req.body || {};
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const payoutRes = await client.query(
      `SELECT p.*, u.telegram_id
       FROM payouts p
       JOIN affiliates a ON a.id = p.affiliate_id
       JOIN users u ON u.id = a.user_id
       WHERE p.id = $1
       FOR UPDATE OF p`,
      [payoutId]
    );

    if (payoutRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "PAYOUT_NOT_FOUND" });
    }

    const payout = payoutRes.rows[0];

    if (payout.status === "SENT") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "ALREADY_SENT" });
    }

    if (payout.status === "CANCELLED") {
      await client.query("COMMIT");
      return res.status(200).json({ status: "already_cancelled" });
    }

    const updatedRes = await client.query(
      `UPDATE payouts
       SET status = 'CANCELLED'
       WHERE id = $1
       RETURNING *`,
      [payoutId]
    );

    await client.query("COMMIT");

    const reasonText = reason ? `\nMotivo: ${reason}` : "";
    const message = `❌ Tu retiro fue cancelado.${reasonText}`;
    try {
      await sendMessage(payout.telegram_id, message);
    } catch (err) {
      console.error("Telegram notification failed", err);
    }

    return res.json({ payout: updatedRes.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
});

router.get("/tickets", async (req, res, next) => {
  const status = req.query.status;
  const { page, pageSize, offset } = parsePagination(req.query);
  const pool = getPool();

  const filters = [];
  const values = [];

  if (status) {
    values.push(status);
    filters.push(`t.status = $${values.length}`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  try {
    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM tickets t ${whereClause}`,
      values
    );
    const total = countRes.rows[0].total;

    const listRes = await pool.query(
      `SELECT t.id, t.status, t.created_at, t.closed_at,
              u.telegram_id, u.telegram_username,
              lm.created_at AS last_message_at,
              lm.message_text AS last_message_preview,
              EXISTS (
                SELECT 1 FROM ticket_messages tm
                WHERE tm.ticket_id = t.id AND tm.sender = 'ADMIN'
              ) AS has_admin_reply
       FROM tickets t
       JOIN users u ON u.id = t.user_id
       LEFT JOIN LATERAL (
         SELECT message_text, created_at
         FROM ticket_messages
         WHERE ticket_id = t.id
         ORDER BY created_at DESC
         LIMIT 1
       ) lm ON true
       ${whereClause}
       ORDER BY COALESCE(lm.created_at, t.created_at) DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, offset]
    );

    res.json({
      items: listRes.rows,
      page,
      page_size: pageSize,
      total,
      total_pages: Math.ceil(total / pageSize) || 1,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/tickets/:id", async (req, res, next) => {
  const ticketId = req.params.id;
  const pool = getPool();

  try {
    const ticketRes = await pool.query(
      `SELECT t.*, u.telegram_id, u.telegram_username
       FROM tickets t
       JOIN users u ON u.id = t.user_id
       WHERE t.id = $1`,
      [ticketId]
    );

    if (ticketRes.rowCount === 0) {
      return res.status(404).json({ error: "TICKET_NOT_FOUND" });
    }

    const messagesRes = await pool.query(
      `SELECT id, sender, message_text, created_at
       FROM ticket_messages
       WHERE ticket_id = $1
       ORDER BY created_at ASC`,
      [ticketId]
    );

    const ticket = ticketRes.rows[0];

    return res.json({
      ticket: {
        id: ticket.id,
        status: ticket.status,
        subject: ticket.subject,
        created_at: ticket.created_at,
        closed_at: ticket.closed_at,
      },
      user: {
        telegram_id: ticket.telegram_id,
        telegram_username: ticket.telegram_username,
      },
      messages: messagesRes.rows,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/tickets/:id/reply", async (req, res, next) => {
  const ticketId = req.params.id;
  const messageText = req.body && req.body.message ? String(req.body.message).trim() : "";

  if (!messageText) {
    return res.status(400).json({ error: "MESSAGE_REQUIRED" });
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const ticketRes = await client.query(
      `SELECT t.*, u.telegram_id
       FROM tickets t
       JOIN users u ON u.id = t.user_id
       WHERE t.id = $1
       FOR UPDATE`,
      [ticketId]
    );

    if (ticketRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "TICKET_NOT_FOUND" });
    }

    const ticket = ticketRes.rows[0];
    if (ticket.status !== "OPEN") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "TICKET_NOT_OPEN" });
    }

    const msgRes = await client.query(
      `INSERT INTO ticket_messages (ticket_id, sender, message_text)
       VALUES ($1, 'ADMIN', $2)
       RETURNING *`,
      [ticketId, messageText]
    );

    await client.query("COMMIT");

    const text = `📩 Respuesta de soporte:\n\n${messageText}`;
    try {
      await sendMessage(ticket.telegram_id, text);
    } catch (err) {
      console.error("Telegram notification failed", err);
    }

    return res.json({ ok: true, message: msgRes.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
});

router.post("/tickets/:id/close", async (req, res, next) => {
  const ticketId = req.params.id;
  const pool = getPool();

  try {
    const ticketRes = await pool.query(
      `UPDATE tickets
       SET status = 'CLOSED', closed_at = now()
       WHERE id = $1
       RETURNING *`,
      [ticketId]
    );

    if (ticketRes.rowCount === 0) {
      return res.status(404).json({ error: "TICKET_NOT_FOUND" });
    }

    return res.json({ ticket: ticketRes.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get("/broadcasts", async (req, res, next) => {
  const { page, pageSize, offset } = parsePagination(req.query);
  const pool = getPool();

  try {
    const countRes = await pool.query("SELECT COUNT(*)::int AS total FROM broadcasts");
    const total = countRes.rows[0].total;

    const listRes = await pool.query(
      `SELECT b.*,
              EXISTS (
                SELECT 1
                FROM audit_logs a
                WHERE a.entity_type = 'broadcast'
                  AND a.entity_id = b.id
                  AND a.admin_action = 'BROADCAST_CUSTOM_RECIPIENTS'
              ) AS has_custom_recipients
       FROM broadcasts b
       ORDER BY b.created_at DESC
       LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    );

    const items = listRes.rows.map((row) => ({
      ...row,
      segment: mapBroadcastSegment(row.segment, row.has_custom_recipients),
    }));

    return res.json({
      items,
      page,
      page_size: pageSize,
      total,
      total_pages: Math.ceil(total / pageSize) || 1,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/broadcasts/:id", async (req, res, next) => {
  const broadcastId = req.params.id;
  const pool = getPool();

  try {
    const broadcastRes = await pool.query("SELECT * FROM broadcasts WHERE id = $1", [
      broadcastId,
    ]);

    if (broadcastRes.rowCount === 0) {
      return res.status(404).json({ error: "BROADCAST_NOT_FOUND" });
    }

    const auditRes = await pool.query(
      `SELECT meta
       FROM audit_logs
       WHERE entity_type = 'broadcast'
         AND entity_id = $1
         AND admin_action = 'BROADCAST_CUSTOM_RECIPIENTS'
       ORDER BY created_at DESC
       LIMIT 1`,
      [broadcastId]
    );

    const meta = auditRes.rows[0] && auditRes.rows[0].meta ? auditRes.rows[0].meta : {};
    const customTelegramIds = Array.isArray(meta.telegram_ids) ? meta.telegram_ids : [];

    const broadcast = broadcastRes.rows[0];

    return res.json({
      broadcast: {
        ...broadcast,
        segment: mapBroadcastSegment(broadcast.segment, customTelegramIds.length > 0),
        telegram_ids: customTelegramIds,
        // Back-compat alias (deprecated):
        custom_telegram_ids: customTelegramIds,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/broadcasts", async (req, res, next) => {
  const messageText = req.body && req.body.message ? String(req.body.message).trim() : "";
  const rawSegment = req.body && req.body.segment ? String(req.body.segment).trim() : "ALL_USERS";

  if (!messageText) {
    return res.status(400).json({ error: "MESSAGE_REQUIRED" });
  }

  const isCustom = rawSegment === "CUSTOM";
  if (!isCustom && rawSegment !== "ALL_USERS") {
    return res.status(400).json({ error: "SEGMENT_INVALID" });
  }

  const telegramIds = isCustom ? normalizeTelegramIds(req.body.telegram_ids) : [];
  if (isCustom && telegramIds.length === 0) {
    return res.status(400).json({ error: "TELEGRAM_IDS_REQUIRED" });
  }

  const pool = getPool();

  try {
    const broadcastRes = await pool.query(
      `INSERT INTO broadcasts (segment, destination, message_text)
       VALUES ($1, $2, $3)
       RETURNING *`,
      ["ALL", "DM", messageText]
    );

    const broadcast = broadcastRes.rows[0];

    if (isCustom) {
      await pool.query(
        `INSERT INTO audit_logs (admin_action, entity_type, entity_id, meta)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [
          "BROADCAST_CUSTOM_RECIPIENTS",
          "broadcast",
          broadcast.id,
          JSON.stringify({ telegram_ids: telegramIds }),
        ]
      );
    }

    return res.status(201).json({
      broadcast: {
        ...broadcast,
        segment: mapBroadcastSegment(broadcast.segment, isCustom),
        telegram_ids: telegramIds,
        // Back-compat alias (deprecated):
        custom_telegram_ids: telegramIds,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/broadcasts/:id/send", async (req, res, next) => {
  const broadcastId = req.params.id;
  const pool = getPool();

  try {
    const broadcastRes = await pool.query("SELECT * FROM broadcasts WHERE id = $1", [
      broadcastId,
    ]);

    if (broadcastRes.rowCount === 0) {
      return res.status(404).json({ error: "BROADCAST_NOT_FOUND" });
    }

    const broadcast = broadcastRes.rows[0];
    const bodyTelegramIds = normalizeTelegramIds(req.body && req.body.telegram_ids);

    const auditRes = await pool.query(
      `SELECT meta
       FROM audit_logs
       WHERE entity_type = 'broadcast'
         AND entity_id = $1
         AND admin_action = 'BROADCAST_CUSTOM_RECIPIENTS'
       ORDER BY created_at DESC
       LIMIT 1`,
      [broadcastId]
    );

    const meta = auditRes.rows[0] && auditRes.rows[0].meta ? auditRes.rows[0].meta : {};
    const savedTelegramIds = Array.isArray(meta.telegram_ids) ? meta.telegram_ids : [];

    let recipientIds = [];
    const customIds = bodyTelegramIds.length > 0 ? bodyTelegramIds : savedTelegramIds;
    const isCustom = customIds.length > 0;

    if (isCustom) {
      const uniqueIds = Array.from(new Set(customIds.map((id) => String(id))));
      const bannedRes = await pool.query(
        "SELECT telegram_id FROM user_bans WHERE telegram_id = ANY($1::bigint[])",
        [uniqueIds]
      );
      const bannedSet = new Set(bannedRes.rows.map((row) => String(row.telegram_id)));
      recipientIds = uniqueIds.filter((id) => !bannedSet.has(String(id)));
    } else {
      const usersRes = await pool.query(
        `SELECT u.telegram_id
         FROM users u
         LEFT JOIN user_bans b ON b.telegram_id = u.telegram_id
         WHERE b.telegram_id IS NULL`
      );
      recipientIds = usersRes.rows.map((row) => row.telegram_id);
    }

    const targetCount = recipientIds.length;
    const batchSize = 25;
    const batchDelayMs = 75;
    let sentCount = 0;
    let failedCount = 0;

    for (let i = 0; i < recipientIds.length; i += batchSize) {
      const batch = recipientIds.slice(i, i + batchSize);
      for (const telegramId of batch) {
        try {
          await sendMessage(telegramId, broadcast.message_text);
          sentCount += 1;
        } catch (err) {
          failedCount += 1;
          console.error("Broadcast send failed", {
            broadcastId: broadcast.id,
            telegramId,
            error: err && err.message ? err.message : err,
          });
        }
      }

      if (i + batchSize < recipientIds.length) {
        await new Promise((resolve) => setTimeout(resolve, batchDelayMs));
      }
    }

    const status = sentCount > 0 && failedCount === 0 ? "SENT" : "FAILED";
    const updatedRes = await pool.query(
      `UPDATE broadcasts
       SET status = $1, sent_at = now()
       WHERE id = $2
       RETURNING *`,
      [status, broadcast.id]
    );

    return res.json({
      ok: true,
      broadcast: {
        ...updatedRes.rows[0],
        segment: mapBroadcastSegment(updatedRes.rows[0].segment, isCustom),
      },
      result: {
        target_count: targetCount,
        sent_count: sentCount,
        failed_count: failedCount,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
