const { getPool } = require("../../db");
const { consumeStockForOrder, releaseStockForOrder } = require("../../services/stock");
const { deliverOrderToTelegram } = require("../../services/delivery");
const { getAffiliateLevel } = require("../../services/affiliateLevels");
const { listPaymentMethods, normalizeMethodKey } = require("../../services/paymentMethods");
const { getBotAssets } = require("../../services/botAssets");
const { sendPhoto } = require("../../services/telegram");
const { ensureProductCategorySchema } = require("../../services/productSchema");
const { validatePaymentProofScreenshot } = require("../../services/paymentProofValidation");
const {
  recordAdminOrderNotification,
  buildOrderNotificationCaption,
  buildOrderNotificationKeyboard,
  calculateLocalAmount,
} = require("../../services/adminOrderNotification");

const ORDER_STATUS_PENDING = "CREATED"; // maps to PENDING_PAYMENT
const ORDER_STATUS_WAITING_CONFIRMATION = "WAITING_PAYMENT"; // maps to WAITING_CONFIRMATION
const ORDER_STATUS_PAID = "PAID";
const ORDER_STATUS_REJECTED = "CANCELLED"; // maps to REJECTED

async function getPaymentMethodMarkup(pool, paymentMethod) {
  const rawKey = normalizeMethodKey(paymentMethod);
  if (!rawKey) {
    return null;
  }
  let key = rawKey;
  if (["BTC", "USDT", "USDT_BSC", "USDT_TRON", "LTC"].includes(key)) {
    key = "CRYPTO";
  } else if (key === "MERCADO_PAGO") {
    key = "MERCADOPAGO";
  } else if (key === "BINANCE") {
    key = "BINANCE_ID";
  }
  const res = await pool.query(
    "SELECT markup FROM payment_methods WHERE method_key = $1",
    [key]
  );
  const rawMarkup = res.rows[0]?.markup;
  if (rawMarkup == null || rawMarkup === "") {
    return null;
  }
  const value = Number(String(rawMarkup).trim());
  return Number.isFinite(value) ? value : null;
}

async function resolveTotalsWithMarkup(pool, subtotalUsd, paymentMethod, localTotal = null) {
  const baseSubtotal = Number.isFinite(Number(subtotalUsd))
    ? Number(Number(subtotalUsd).toFixed(2))
    : 0;
  const methodKey = normalizeMethodKey(paymentMethod);
  let markupPercent = null;
  let localTotalWithMarkup = localTotal;

  if (methodKey && localTotal && localTotal.amount != null) {
    try {
      const markup = await getPaymentMethodMarkup(pool, methodKey);
      if (markup != null && Number.isFinite(Number(markup))) {
        const localCurrency = String(localTotal.currency || "")
          .trim()
          .toUpperCase();
        const localAmount = Number(localTotal.amount);
        const isDollarEquivalent =
          localCurrency === "USD" || localCurrency === "USDT";
        if (Number.isFinite(localAmount) && !isDollarEquivalent) {
          markupPercent = Number(markup);
          const factor = 1 + markupPercent / 100;
          localTotalWithMarkup = {
            ...localTotal,
            amount: localAmount * factor,
          };
        }
      }
    } catch (error) {
      console.error("Failed to resolve totals with markup (orders.controller)", error);
    }
  }

  return {
    subtotalUsd: baseSubtotal,
    localTotal: localTotalWithMarkup,
    markupPercent,
  };
}

function parseAdminTelegramIds() {
  const value = process.env.ADMIN_TELEGRAM_IDS || "";
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item && /^[0-9]+$/.test(item))
    .map((item) => Number(item));
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
  await ensureProductCategorySchema(pool);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const user = await ensureUser(client, telegramId, username);

    const productRes = await client.query(
      "SELECT * FROM products WHERE id = $1 FOR UPDATE",
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
    if (product.out_of_stock) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        error: "OUT_OF_STOCK",
        message: "❌ Producto agotado por el momento.",
      });
    }

    const isFreeProduct = Number(product.price || 0) <= 0;
    if (product.stock_mode === "SIMPLE" && (product.unique_purchase || isFreeProduct)) {
      if (qty > 1) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          ok: false,
          error: "UNIQUE_LIMIT",
          message: "❌ Este producto solo lo puedes reclamar una vez.",
        });
      }
      const alreadyPurchasedRes = await client.query(
        `SELECT 1
         FROM orders o
         WHERE o.user_id = $1
           AND o.product_id = $2
           AND o.status IN ('PAID', 'DELIVERED')
         LIMIT 1`,
        [user.id, product.id]
      );
      if (alreadyPurchasedRes.rowCount > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          ok: false,
          error: "UNIQUE_ALREADY_PURCHASED",
          message: "❌ Este producto solo lo puedes reclamar una vez.",
        });
      }
    }

    if (product.stock_mode === "SIMPLE") {
      if (!product.unique_purchase && product.stock_qty !== null && product.stock_qty !== undefined) {
        const holdsRes = await client.query(
          `SELECT COALESCE(SUM(qty), 0)::int AS held_qty
           FROM product_stock_holds
           WHERE product_id = $1
             AND expires_at IS NOT NULL
             AND expires_at > now()
             AND status NOT IN ('CONSUMED','EXPIRED')`,
          [product.id]
        );
        const heldQty = Number(holdsRes.rows[0]?.held_qty || 0);
        const available = Math.max(Number(product.stock_qty) - heldQty, 0);
        if (qty > available) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            ok: false,
            error: "OUT_OF_STOCK",
            message: `❌ Solo quedan ${available} disponibles.`,
            available,
          });
        }
      }
    } else if (product.stock_mode === "UNITS") {
      const unitsRes = await client.query(
        `SELECT COUNT(*)::int AS available_units
         FROM product_stock_units
         WHERE product_id = $1 AND status = 'AVAILABLE'`,
        [product.id]
      );
      const available = Number(unitsRes.rows[0]?.available_units || 0);
      if (qty > available) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          ok: false,
          error: "OUT_OF_STOCK",
          message: `❌ Solo quedan ${available} disponibles.`,
          available,
        });
      }
    }

    const unitPrice = Number(product.price);
    const total = Number((unitPrice * qty).toFixed(2));

    const expirySeconds = Math.max(
      parseInt(process.env.ORDER_EXPIRY_SECONDS || "", 10)
        || (parseInt(process.env.ORDER_EXPIRY_MINUTES || "", 10) || 0) * 60
        || 900,
      1
    );

    let affiliateId = user.referred_by_affiliate_id;
    if (affiliateId) {
      const affiliateRes = await client.query(
        "SELECT status FROM affiliates WHERE id = $1",
        [affiliateId]
      );
      if (
        affiliateRes.rowCount === 0
        || affiliateRes.rows[0].status !== "APPROVED"
      ) {
        affiliateId = null;
      }
    }

    const orderRes = await client.query(
      `INSERT INTO orders
        (user_id, product_id, affiliate_id, status, unit_price_at_purchase)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        user.id,
        product.id,
        affiliateId,
        ORDER_STATUS_WAITING_CONFIRMATION,
        unitPrice,
      ]
    );

    if (product.stock_mode === "SIMPLE") {
      if (product.stock_qty !== null && product.stock_qty !== undefined) {
        const existingHoldRes = await client.query(
          `SELECT id, qty
           FROM product_stock_holds
           WHERE order_id = $1
             AND product_id = $2
             AND expires_at IS NOT NULL
             AND expires_at > now()
             AND status NOT IN ('CONSUMED','EXPIRED')
           ORDER BY created_at DESC
           LIMIT 1
           FOR UPDATE`,
          [orderRes.rows[0].id, product.id]
        );
        if (existingHoldRes.rowCount === 0) {
          try {
            const holdInsertRes = await client.query(
              `INSERT INTO product_stock_holds
                (product_id, order_id, telegram_id, qty, status, expires_at)
               VALUES ($1, $2, $3, $4, 'HELD', now() + ($5 * interval '1 second'))
               RETURNING id`,
              [product.id, orderRes.rows[0].id, telegramId, qty, expirySeconds]
            );
            if (holdInsertRes.rowCount === 0) {
              const error = new Error("HOLD_CREATE_FAILED");
              error.status = 500;
              throw error;
            }
            console.log("[stock/hold] inserted", {
              hold_id: holdInsertRes.rows[0].id,
              order_id: orderRes.rows[0].id,
              product_id: product.id,
              qty,
              expires_at: new Date(Date.now() + expirySeconds * 1000).toISOString(),
            });
          } catch (error) {
            console.error("[stock/hold] insert_failed", {
              order_id: orderRes.rows[0].id,
              product_id: product.id,
              qty,
              pg_code: error.code,
              message: error.message,
            });
            const wrapped = new Error("HOLD_CREATE_FAILED");
            wrapped.status = 500;
            throw wrapped;
          }
        } else if (Number(existingHoldRes.rows[0].qty) !== qty) {
          const holdsRes = await client.query(
            `SELECT COALESCE(SUM(qty), 0)::int AS held_qty
             FROM product_stock_holds
             WHERE product_id = $1
               AND expires_at IS NOT NULL
               AND expires_at > now()
               AND status NOT IN ('CONSUMED','EXPIRED')
               AND order_id <> $2`,
            [product.id, orderRes.rows[0].id]
          );
          const heldQtyOther = Number(holdsRes.rows[0]?.held_qty || 0);
          const available = Math.max(Number(product.stock_qty) - heldQtyOther, 0);
          if (qty > available) {
            await client.query("ROLLBACK");
            return res.status(409).json({
              ok: false,
              error: "OUT_OF_STOCK",
              message: `❌ Solo quedan ${available} disponibles.`,
              available,
            });
          }
          const updateRes = await client.query(
            `UPDATE product_stock_holds
             SET qty = $1,
                 status = 'HELD',
                 expires_at = now() + ($2 * interval '1 second'),
                 updated_at = now()
             WHERE id = $3
             RETURNING id`,
            [qty, expirySeconds, existingHoldRes.rows[0].id]
          );
          if (updateRes.rowCount === 0) {
            const error = new Error("HOLD_CREATE_FAILED");
            error.status = 500;
            throw error;
          }
          console.log("[stock/hold] inserted", {
            hold_id: updateRes.rows[0].id,
            order_id: orderRes.rows[0].id,
            product_id: product.id,
            qty,
            expires_at: new Date(Date.now() + expirySeconds * 1000).toISOString(),
          });
        }
      }
    } else if (product.stock_mode === "UNITS") {
      const heldRes = await client.query(
        `SELECT COUNT(*)::int AS held_qty
         FROM product_stock_units
         WHERE held_by_order_id = $1
           AND product_id = $2
           AND status = 'HELD'`,
        [orderRes.rows[0].id, product.id]
      );
      const alreadyHeld = Number(heldRes.rows[0]?.held_qty || 0);
      if (alreadyHeld < qty) {
        const needed = qty - alreadyHeld;
        const holdRes = await client.query(
          `WITH picked AS (
             SELECT id
             FROM product_stock_units
             WHERE product_id = $1 AND status = 'AVAILABLE'
             LIMIT $2
             FOR UPDATE SKIP LOCKED
           )
           UPDATE product_stock_units
           SET status = 'HELD',
               held_by_order_id = $3,
               held_by_telegram_id = $4,
               held_by_username = $5,
               held_at = now()
           WHERE id IN (SELECT id FROM picked)
           RETURNING id`,
          [product.id, needed, orderRes.rows[0].id, telegramId, username]
        );
        if (holdRes.rowCount < needed) {
          await client.query("ROLLBACK");
          const available = alreadyHeld + holdRes.rowCount;
          return res.status(409).json({
            ok: false,
            error: "OUT_OF_STOCK",
            message: `❌ Solo quedan ${available} disponibles.`,
            available,
          });
        }
        console.log("[orders/create] hold_created", {
          order_id: orderRes.rows[0].id,
          product_id: product.id,
          qty: alreadyHeld + holdRes.rowCount,
          expires_at: new Date(Date.now() + expirySeconds * 1000).toISOString(),
        });
      }
    }

    await client.query(
      `INSERT INTO order_items
        (order_id, product_id, qty, unit_price_usd, total_price_usd, line_total_usd, price_usd)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        orderRes.rows[0].id,
        product.id,
        qty,
        unitPrice,
        total,
        total,
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

async function getPaymentMethods(req, res, next) {
  try {
    const pool = getPool();
    const methods = await listPaymentMethods(pool);
    const assets = await getBotAssets(pool);
    return res.json({
      methods,
      header_image_url: assets.payment_methods_image_url || null,
    });
  } catch (error) {
    return next(error);
  }
}

async function submitPaymentProof(req, res, next) {
  const orderId = req.params.id;
  const telegramId = Number(req.body.telegram_id);
  const screenshotFileId = req.body.screenshot_file_id;
  const screenshotUniqueId = req.body.screenshot_unique_id;
  const paymentMethod = req.body.payment_method;

  console.log(`[submitPaymentProof] orderId=${orderId}, paymentMethod=${paymentMethod}`);

  if (!Number.isFinite(telegramId)) {
    return res.status(400).json({ error: "telegram_id is required" });
  }
  if (!screenshotFileId) {
    return res.status(400).json({ error: "screenshot_file_id is required" });
  }
  if (!screenshotUniqueId) {
    return res.status(400).json({ error: "screenshot_unique_id is required" });
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const orderRes = await client.query(
      `SELECT o.*, u.telegram_id AS owner_telegram_id, u.telegram_username,
              p.name AS product_name, p.price AS product_price
       FROM orders o
       JOIN users u ON u.id = o.user_id
       JOIN products p ON p.id = o.product_id
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

    const duplicateRes = await client.query(
      `SELECT 1
       FROM order_payments op
       JOIN orders o ON o.id = op.order_id
       JOIN users u ON u.id = o.user_id
       WHERE u.telegram_id = $1
         AND op.screenshot_unique_id = $2
       LIMIT 1`,
      [telegramId, screenshotUniqueId]
    );
    if (duplicateRes.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "DUPLICATE_IMAGE" });
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

    const proofValidation = await validatePaymentProofScreenshot(
      screenshotFileId,
      paymentMethod
    );
    if (proofValidation && proofValidation.valid === false) {
      await client.query("ROLLBACK");
      return res.status(422).json({
        error: "PAYMENT_PROOF_NOT_VALID",
        message:
          "⚠️ La imagen no parece un comprobante de pago. Envía una captura donde se vea método y monto.",
        details: proofValidation,
      });
    }

    const paymentRes = await client.query(
      `INSERT INTO order_payments (
         order_id,
         screenshot_file_id,
         screenshot_unique_id,
         review_status,
         payment_method
       )
       VALUES ($1, $2, $3, 'PENDING', $4)
       ON CONFLICT (order_id)
       DO UPDATE SET screenshot_file_id = EXCLUDED.screenshot_file_id,
                     screenshot_unique_id = EXCLUDED.screenshot_unique_id,
                     submitted_at = now(),
                     review_status = 'PENDING',
                     reviewed_by_admin_at = NULL,
                     payment_method = EXCLUDED.payment_method
       RETURNING *`,
      [orderId, screenshotFileId, screenshotUniqueId, paymentMethod]
    );

    const updatedOrderRes = await client.query(
      `UPDATE orders
       SET status = $2,
           order_number = COALESCE(order_number, nextval('orders_order_number_seq'))
       WHERE id = $1
       RETURNING *`,
      [orderId, ORDER_STATUS_WAITING_CONFIRMATION]
    );

    await client.query(
      `UPDATE product_stock_holds
       SET expires_at = now() + interval '365 days',
           updated_at = now()
       WHERE order_id = $1
         AND status = 'HELD'
         AND (expires_at IS NULL OR expires_at > now())`,
      [orderId]
    );

    await client.query("COMMIT");

    const adminIds = parseAdminTelegramIds();
    if (adminIds.length > 0) {
      const orderRow = orderRes.rows[0];
      const updatedOrder = {
        ...orderRow,
        order_number: updatedOrderRes.rows[0]?.order_number || orderRow.order_number,
      };
      const paymentRow = paymentRes.rows[0];
      const itemsRes = await pool.query(
        `SELECT oi.qty, oi.unit_price_usd, oi.line_total_usd, p.name
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = $1
         ORDER BY oi.created_at ASC`,
        [orderId]
      );
      const items = itemsRes.rows || [];
      let subtotalUsd = 0;
      if (items.length > 0) {
        subtotalUsd = items.reduce((sum, item) => {
          const lineTotal =
            item.line_total_usd != null
              ? Number(item.line_total_usd)
              : Number(item.unit_price_usd || 0) * Number(item.qty || 0);
          return sum + (Number.isFinite(lineTotal) ? lineTotal : 0);
        }, 0);
        subtotalUsd = Number(subtotalUsd.toFixed(2));
      } else {
        subtotalUsd = Number(updatedOrder.unit_price_at_purchase || updatedOrder.product_price || 0);
      }

      const paymentMethod =
        paymentRow?.payment_method || updatedOrder.payment_method || null;
      let localTotal = null;
      if (paymentMethod) {
        try {
          localTotal = await calculateLocalAmount(subtotalUsd, paymentMethod);
        } catch (error) {
          console.error("Failed to calculate local total", error);
        }
      }
      const totalsWithMarkup = await resolveTotalsWithMarkup(
        pool,
        subtotalUsd,
        paymentMethod,
        localTotal
      );

      const caption = buildOrderNotificationCaption({
        order: updatedOrder,
        user: {
          telegram_id: updatedOrder.owner_telegram_id,
          telegram_username: updatedOrder.telegram_username,
        },
        items,
        payment: paymentRow,
        subtotalUsd: totalsWithMarkup.subtotalUsd,
        localTotal: totalsWithMarkup.localTotal,
        markupPercent: totalsWithMarkup.markupPercent,
      });
      const replyMarkup = buildOrderNotificationKeyboard({
        id: updatedOrder.id,
        telegram_id: updatedOrder.owner_telegram_id,
      });

      for (const adminId of adminIds) {
        try {
          const result = await sendPhoto(adminId, {
            file_id: paymentRow.screenshot_file_id,
            caption,
            reply_markup: replyMarkup,
          });
          if (result?.message_id) {
            await recordAdminOrderNotification(
              pool,
              updatedOrder.id,
              adminId,
              result.message_id
            );
          }
        } catch (error) {
          console.error("Admin payment proof notify failed", error);
        }
      }
    }

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
       SET status = $2,
           paid_at = now(),
           order_number = COALESCE(order_number, nextval('orders_order_number_seq'))
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
      const statsRes = await client.query(
        `SELECT COALESCE(SUM(COALESCE(oi.sale_qty, 1)), 0)::int AS sales_count,
                COALESCE(SUM(c.amount - COALESCE(c.refunded_amount, 0)), 0) AS earnings_total,
                MAX(c.earned_at) AS last_sale_at
         FROM commissions c
         LEFT JOIN (
           SELECT order_id, COALESCE(SUM(qty), 0) AS sale_qty
           FROM order_items
           GROUP BY order_id
         ) oi ON oi.order_id = c.order_id
         WHERE c.affiliate_id = $1
           AND c.status != 'REFUNDED'`,
        [order.affiliate_id]
      );
      const stats = statsRes.rows[0] || {};
      const salesTotal = stats.sales_count || 0;
      const earningsTotal = Number(stats.earnings_total || 0);
      const boostRes = await client.query(
        "SELECT commission_rate FROM affiliates WHERE id = $1",
        [order.affiliate_id]
      );
      const boostRate = Number(boostRes.rows[0]?.commission_rate || 0);
      let daysSinceLastSale = null;
      if (stats.last_sale_at) {
        const lastSaleTime = new Date(stats.last_sale_at).getTime();
        daysSinceLastSale = Math.max(
          Math.floor((Date.now() - lastSaleTime) / (24 * 60 * 60 * 1000)),
          0
        );
      }
      let baseRate = 0.2;
      let boostEffective = boostRate;
      if (salesTotal > 0) {
        const currentLevel = getAffiliateLevel({
          salesTotal,
          earningsTotal,
          daysSinceLastSale,
        });
        baseRate = currentLevel.rate;
      } else {
        boostEffective = 0;
      }
      const rate = Math.min(baseRate + boostEffective, 1);
      const amount = Number(
        (Number(order.unit_price_at_purchase) * rate).toFixed(2)
      );

      await client.query(
        `INSERT INTO commissions (order_id, affiliate_id, rate, amount)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (order_id) DO NOTHING`,
        [order.id, order.affiliate_id, rate, amount]
      );

      // Commission rate is based on level + optional boost, no per-affiliate override.
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
       SET status = $2,
           cancelled_at = now(),
           cancel_source = 'ADMIN',
           order_number = COALESCE(order_number, nextval('orders_order_number_seq'))
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
  getPaymentMethods,
  submitPaymentProof,
  markOrderPaid,
  rejectPayment,
};
