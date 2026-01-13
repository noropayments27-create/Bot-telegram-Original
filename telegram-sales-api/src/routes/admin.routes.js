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

const MESSAGES = {
  es: {
    payment_received: "🎉 Felicidades, hemos recibido tu pago 🎉 🥳",
  },
  en: {
    payment_received: "🎉 Congratulations, we’ve received your payment 🎉 🥳",
  },
};

const router = express.Router();

const DELIVERY_START_DELAY_MS = Math.max(
  Number(process.env.DELIVERY_START_DELAY_MS || 10000) || 10000,
  0
);

// Function to get fiat rate (COP/MXN to USD)
async function getFiatRate(currency) {
  try {
    const response = await fetch(`https://open.er-api.com/v6/latest/USD`);
    const data = await response.json();
    if (data.result === "success") {
      return data.rates[currency] || null;
    }
  } catch (err) {
    console.error("Failed to get fiat rate", err);
  }
  return null;
}

// Function to get crypto rate (to USD)
async function getCryptoRate(symbol) {
  try {
    const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${symbol}&vs_currencies=usd`);
    const data = await response.json();
    return data[symbol]?.usd || null;
  } catch (err) {
    console.error("Failed to get crypto rate", err);
  }
  return null;
}

// Function to calculate local amount
function normalizePaymentMethod(paymentMethod) {
  const raw = String(paymentMethod || "").trim().toUpperCase();
  if (!raw) {
    return "";
  }
  if (raw === "MP") {
    return "MERCADO_PAGO";
  }
  if (raw === "BTC") {
    return "BITCOIN";
  }
  if (raw === "USDT_BSC" || raw === "USDT_TRON") {
    return "USDT";
  }
  return raw;
}

function applyRateMarkup(rate, markup = 0.02) {
  if (!Number.isFinite(rate)) {
    return rate;
  }
  return rate * (1 + markup);
}

function applyUsdMarkup(amount, markup = 0.02) {
  if (!Number.isFinite(amount)) {
    return amount;
  }
  return amount * (1 + markup);
}

async function calculateLocalAmount(usdAmount, paymentMethod) {
  const method = normalizePaymentMethod(paymentMethod);
  const usdBase = Number(usdAmount) || 0;
  const usdWithMarkup = applyUsdMarkup(usdBase);
  let currency = null;
  let rate = null;

  if (method === "NEQUI") {
    currency = "COP";
    rate = await getFiatRate("COP");
    if (rate) {
      return { currency, amount: usdWithMarkup * applyRateMarkup(rate) };
    }
  } else if (method === "MERCADO_PAGO") {
    currency = "MXN";
    rate = await getFiatRate("MXN");
    if (rate) {
      return { currency, amount: usdWithMarkup * applyRateMarkup(rate) };
    }
  } else if (method === "BITCOIN") {
    currency = "BTC";
    rate = await getCryptoRate("bitcoin");
    if (rate) {
      return { currency, amount: usdBase / rate };
    }
  } else if (method === "USDT") {
    currency = "USDT";
    return { currency, amount: usdBase };
  } else if (method === "LTC") {
    currency = "LTC";
    rate = await getCryptoRate("litecoin");
    if (rate) {
      return { currency, amount: usdBase / rate };
    }
  }

  return null;
}

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

const RECEIPT_TRANSLATIONS = {
  es: {
    title: "🧾 Recibo de pago",
    order_id: "🆔 ID de orden",
    product: "📦 Producto",
    price: "💰 Precio",
    date: "📅 Fecha",
    status: "📊 Estado",
    paid: "✅ PAGADO",
    reference: "🔗 Referencia",
    total: "💵 Total",
    total_in: "💵 Total en",
  },
  en: {
    title: "🧾 Receipt",
    order_id: "🆔 Order ID",
    product: "📦 Product",
    price: "💰 Price",
    date: "📅 Date",
    status: "📊 Status",
    paid: "✅ PAID",
    reference: "🔗 Reference",
    total: "💵 Total",
    total_in: "💵 Total in",
  },
};

function buildReceiptMessage(order, paymentProof, locale = "es", subtotalUsd) {
  const translations = RECEIPT_TRANSLATIONS[locale] || RECEIPT_TRANSLATIONS.es;
  const price =
    subtotalUsd !== undefined && subtotalUsd !== null
      ? subtotalUsd
      : order.unit_price_at_purchase || order.product_price;
  const createdAt = order.paid_at || new Date();
  const createdAtText = new Date(createdAt).toLocaleString();
  const lines = [
    `🎉 ${translations.title} 🎉`,
    "",
    `${translations.order_id}: ${order.id}`,
    `${translations.product}: ${order.product_name || order.product_id}`,
    `${translations.price}: $${price} USD`,
    `${translations.date}: ${createdAtText}`,
    `${translations.status}: ${translations.paid}`,
  ];
  if (paymentProof && paymentProof.screenshot_file_id) {
    lines.push(`${translations.reference}: ${paymentProof.screenshot_file_id}`);
  }
  lines.push("");
  lines.push("✅ ¡Gracias por tu compra!");
  return lines.join("\n");
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      const nextChar = line[i + 1];
      if (inQuotes && nextChar === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  result.push(current);
  return result.map((value) => value.trim());
}

function parseCsv(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }
  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
  const rows = [];

  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    rows.push(row);
  }

  return { headers, rows };
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  const entries = keys.map((key) => `"${key}":${stableStringify(value[key])}`);
  return `{${entries.join(",")}}`;
}

function maskPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }
  const masked = { ...payload };
  if (masked.password) {
    masked.password = "***";
  }
  if (masked.token) {
    masked.token = "***";
  }
  return masked;
}

function maskSecret(value) {
  if (!value) {
    return "";
  }
  const str = String(value);
  if (str.length <= 4) {
    return "****";
  }
  return `${"*".repeat(Math.max(str.length - 4, 4))}${str.slice(-4)}`;
}

async function getActiveHolds(client, product) {
  if (!product) {
    return { holds: [], heldQty: 0 };
  }
  if (product.stock_mode === "UNITS") {
    const holdsRes = await client.query(
      `SELECT held_by_order_id AS order_id,
              COUNT(*)::int AS qty,
              MIN(created_at) AS created_at
       FROM product_stock_units
       WHERE product_id = $1 AND status = 'HELD'
       GROUP BY held_by_order_id
       ORDER BY created_at ASC`,
      [product.id]
    );
    const holds = holdsRes.rows.map((row) => ({
      id: `units-held-${row.order_id || "none"}`,
      product_id: product.id,
      order_id: row.order_id,
      qty: Number(row.qty || 0),
      status: "HELD",
      expires_at: null,
      created_at: row.created_at,
    }));
    const heldQty = holds.reduce((sum, row) => sum + Number(row.qty || 0), 0);
    return { holds, heldQty };
  }
  const holdsRes = await client.query(
    `SELECT id, product_id, order_id, qty, status, expires_at, created_at
     FROM product_stock_holds
     WHERE product_id = $1
       AND expires_at IS NOT NULL
       AND expires_at > now()
       AND status NOT IN ('CONSUMED','EXPIRED')
     ORDER BY expires_at ASC`,
    [product.id]
  );
  const heldQty = holdsRes.rows.reduce((sum, row) => sum + Number(row.qty || 0), 0);
  return { holds: holdsRes.rows, heldQty };
}

async function resolveProductByIdentifier(client, productId, skuKey) {
  if (!productId && !skuKey) {
    return null;
  }
  if (productId) {
    const res = await client.query("SELECT * FROM products WHERE id = $1", [
      productId,
    ]);
    return res.rows[0] || null;
  }
  const res = await client.query("SELECT * FROM products WHERE sku_key = $1", [
    skuKey,
  ]);
  return res.rows[0] || null;
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

router.get("/stock/holds/active", async (req, res, next) => {
  const productId = req.query.product_id;
  const skuKey = req.query.sku_key;
  const pool = getPool();

  try {
    const product = await resolveProductByIdentifier(pool, productId, skuKey);
    if (!product) {
      return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
    }

    const { holds, heldQty } = await getActiveHolds(pool, product);

    res.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.set("Surrogate-Control", "no-store");
    res.set("ETag", "");

    return res.json({
      holds_active: holds,
      held_qty: heldQty,
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/stock/holds/debug", async (req, res, next) => {
  const orderId = req.query.order_id;
  const productId = req.query.product_id;
  const pool = getPool();

  if (!orderId && !productId) {
    return res.status(400).json({ error: "ORDER_ID_OR_PRODUCT_ID_REQUIRED" });
  }

  try {
    let byOrder = [];
    let byProduct = [];

    if (orderId) {
      const byOrderRes = await pool.query(
        `SELECT id, product_id, order_id, qty, status, expires_at, created_at
         FROM product_stock_holds
         WHERE order_id = $1
         ORDER BY created_at DESC`,
        [orderId]
      );
      byOrder = byOrderRes.rows;
    }

    if (productId) {
      const byProductRes = await pool.query(
        `SELECT id, product_id, order_id, qty, status, expires_at, created_at
         FROM product_stock_holds
         WHERE product_id = $1
         ORDER BY created_at DESC
         LIMIT 10`,
        [productId]
      );
      byProduct = byProductRes.rows;
    }

    res.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.set("Surrogate-Control", "no-store");
    res.set("ETag", "");

    return res.json({
      by_order: byOrder,
      by_product_last10: byProduct,
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/stock/inspect", async (req, res, next) => {
  const productId = req.query.product_id;
  const skuKey = req.query.sku_key;
  const limitUnitsSample = Math.min(
    Math.max(parseInt(req.query.limit_units_sample, 10) || 20, 1),
    100
  );
  const pool = getPool();

  try {
    const product = await resolveProductByIdentifier(pool, productId, skuKey);
    if (!product) {
      return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
    }

    let availableStock = null;
    let heldQty = 0;
    if (product.stock_mode === "SIMPLE") {
      const active = await getActiveHolds(pool, product);
      heldQty = active.heldQty;
      if (product.stock_qty !== null && product.stock_qty !== undefined) {
        availableStock = Math.max(Number(product.stock_qty) - heldQty, 0);
      }
    } else if (product.stock_mode === "UNITS") {
      const unitsRes = await pool.query(
        `SELECT COUNT(*)::int AS available_units
         FROM product_stock_units
         WHERE product_id = $1 AND status = 'AVAILABLE'`,
        [product.id]
      );
      availableStock = Number(unitsRes.rows[0]?.available_units || 0);
    }

    const activeHolds = await getActiveHolds(pool, product);

    const unitsSummaryRes = await pool.query(
      `SELECT status, COUNT(*)::int AS count
       FROM product_stock_units
       WHERE product_id = $1
       GROUP BY status`,
      [product.id]
    );

    const unitsSampleRes = await pool.query(
      `SELECT id, status, created_at
       FROM product_stock_units
       WHERE product_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [product.id, limitUnitsSample]
    );

    const unitsSummaryMap = new Map(
      unitsSummaryRes.rows.map((row) => [
        row.status === "DELIVERED" ? "CONSUMED" : row.status,
        row.count,
      ])
    );
    const unitsSummaryMapped =
      product.stock_mode === "UNITS"
        ? ["AVAILABLE", "HELD", "CONSUMED"].map((status) => ({
            status,
            count: unitsSummaryMap.get(status) || 0,
          }))
        : [];

    res.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.set("Surrogate-Control", "no-store");
    res.set("ETag", "");
    return res.json({
      product: {
        id: product.id,
        sku_key: product.sku_key,
        name: product.name,
        stock_mode: product.stock_mode,
        stock_qty: product.stock_qty,
      },
      available_stock: availableStock,
      held_qty: activeHolds.heldQty,
      holds_active: activeHolds.holds,
      units_summary_mapped: unitsSummaryMapped,
      units_sample: unitsSampleRes.rows,
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/orders/:id/inspect", async (req, res, next) => {
  const orderId = req.params.id;
  const pool = getPool();

  try {
    const orderRes = await pool.query(
      `SELECT o.*, u.telegram_id
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       WHERE o.id = $1`,
      [orderId]
    );
    if (orderRes.rowCount === 0) {
      return res.status(404).json({ error: "ORDER_NOT_FOUND" });
    }

    const itemsRes = await pool.query(
      `SELECT oi.*, p.name
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = $1
       ORDER BY oi.created_at ASC`,
      [orderId]
    );

    const holdsRes = await pool.query(
      `SELECT id, product_id, qty, status, expires_at, created_at
       FROM product_stock_holds
       WHERE order_id = $1
       ORDER BY created_at ASC`,
      [orderId]
    );

    const unitsRes = await pool.query(
      `SELECT id, product_id, status, held_at, delivered_at, created_at
       FROM product_stock_units
       WHERE held_by_order_id = $1
       ORDER BY created_at ASC`,
      [orderId]
    );

    return res.json({
      order: orderRes.rows[0],
      items: itemsRes.rows,
      holds: holdsRes.rows,
      units: unitsRes.rows,
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/stock/holds/:id/release", async (req, res, next) => {
  const holdId = req.params.id;
  const { confirm } = req.body || {};
  if (confirm !== true) {
    return res.status(400).json({ error: "CONFIRM_REQUIRED" });
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (holdId.startsWith("units-held-")) {
      const orderId = holdId.replace("units-held-", "");
      const productId = req.query.product_id;

      if (!orderId || orderId === "none") {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "ORDER_ID_REQUIRED" });
      }
      if (!productId) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "PRODUCT_ID_REQUIRED" });
      }

      const releaseRes = await client.query(
        `UPDATE product_stock_units
         SET status = 'AVAILABLE',
             held_by_order_id = NULL,
             held_by_telegram_id = NULL,
             held_by_username = NULL,
             held_at = NULL,
             updated_at = now()
         WHERE product_id = $1
           AND held_by_order_id = $2
           AND status = 'HELD'`,
        [productId, orderId]
      );

      if (releaseRes.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "HOLD_NOT_ACTIVE" });
      }

      await client.query(
        `INSERT INTO audit_logs (admin_action, entity_type, entity_id, meta)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [
          "STOCK_HOLD_RELEASE",
          "order",
          orderId,
          JSON.stringify({
            hold_id: holdId,
            order_id: orderId,
            product_id: productId,
            qty: releaseRes.rowCount,
            mode: "UNITS",
            reason: "ADMIN_MANUAL_RELEASE",
            admin: req.admin?.mode || null,
          }),
        ]
      );

      const cancelRes = await client.query(
        `UPDATE orders
         SET status = 'CANCELLED'
         WHERE id = $1 AND status = 'WAITING_PAYMENT'`,
        [orderId]
      );
      const orderCancelled = cancelRes.rowCount > 0;

      if (orderCancelled) {
        await client.query(
          `INSERT INTO audit_logs (admin_action, entity_type, entity_id, meta)
           VALUES ($1, $2, $3, $4::jsonb)`,
          [
            "HOLD_RELEASE_CANCEL_ORDER",
            "order",
            orderId,
            JSON.stringify({
              hold_id: holdId,
              order_id: orderId,
              product_id: productId,
              mode: "UNITS",
              reason: "HOLD_RELEASE",
              admin: req.admin?.mode || null,
            }),
          ]
        );
      }

      await client.query("COMMIT");
      return res.json({
        ok: true,
        released_qty: releaseRes.rowCount,
        order_cancelled: orderCancelled,
      });
    }

    const holdRes = await client.query(
      `SELECT *
       FROM product_stock_holds
       WHERE id = $1
       FOR UPDATE`,
      [holdId]
    );

    if (holdRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "HOLD_NOT_FOUND" });
    }

    const hold = holdRes.rows[0];
    if (hold.status === "CONSUMED") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "HOLD_ALREADY_CONSUMED" });
    }
    if (hold.status === "EXPIRED" || (hold.expires_at && hold.expires_at <= new Date())) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "HOLD_ALREADY_EXPIRED" });
    }

    await client.query(
      `UPDATE product_stock_holds
       SET status = 'EXPIRED', expires_at = now(), updated_at = now()
       WHERE id = $1`,
      [holdId]
    );

    if (hold.order_id && hold.product_id) {
      await client.query(
        `UPDATE product_stock_units
         SET status = 'AVAILABLE',
             held_by_order_id = NULL,
             held_by_telegram_id = NULL,
             held_by_username = NULL,
             held_at = NULL,
             updated_at = now()
         WHERE held_by_order_id = $1
           AND product_id = $2
           AND status = 'HELD'`,
        [hold.order_id, hold.product_id]
      );
    }

    await client.query(
      `INSERT INTO audit_logs (admin_action, entity_type, entity_id, meta)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [
        "STOCK_HOLD_RELEASE",
        "product_stock_hold",
        hold.id,
        JSON.stringify({
          hold_id: hold.id,
          order_id: hold.order_id,
          product_id: hold.product_id,
          qty: hold.qty,
          mode: "SIMPLE",
          reason: "ADMIN_MANUAL_RELEASE",
          admin: req.admin?.mode || null,
        }),
      ]
    );

    let orderCancelled = false;
    if (hold.order_id) {
      const cancelRes = await client.query(
        `UPDATE orders
         SET status = 'CANCELLED'
         WHERE id = $1 AND status = 'WAITING_PAYMENT'`,
        [hold.order_id]
      );
      orderCancelled = cancelRes.rowCount > 0;
      if (orderCancelled) {
        await client.query(
          `INSERT INTO audit_logs (admin_action, entity_type, entity_id, meta)
           VALUES ($1, $2, $3, $4::jsonb)`,
          [
            "HOLD_RELEASE_CANCEL_ORDER",
            "order",
            hold.order_id,
            JSON.stringify({
              hold_id: hold.id,
              order_id: hold.order_id,
              product_id: hold.product_id,
              mode: "SIMPLE",
              reason: "HOLD_RELEASE",
              admin: req.admin?.mode || null,
            }),
          ]
        );
      }
    }

    await client.query("COMMIT");
    return res.json({
      ok: true,
      released_qty: hold.qty,
      status: "EXPIRED",
      order_cancelled: orderCancelled,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
});

router.get("/stock/units", async (req, res, next) => {
  const productId = req.query.product_id;
  const skuKey = req.query.sku_key;
  const status = req.query.status;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const pool = getPool();

  try {
    const product = await resolveProductByIdentifier(pool, productId, skuKey);
    if (!product) {
      return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
    }

    const values = [product.id];
    const filters = ["product_id = $1"];

    if (status) {
      values.push(status);
      filters.push(`status = $${values.length}`);
    }

    values.push(limit);
    values.push(offset);

    const listRes = await pool.query(
      `SELECT id, payload, status, created_at
       FROM product_stock_units
       WHERE ${filters.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );

    const summaryRes = await pool.query(
      `SELECT status, COUNT(*)::int AS count
       FROM product_stock_units
       WHERE product_id = $1
       GROUP BY status`,
      [product.id]
    );

    const summaryMap = new Map(
      summaryRes.rows.map((row) => [
        row.status === "DELIVERED" ? "CONSUMED" : row.status,
        row.count,
      ])
    );
    const summary = ["AVAILABLE", "HELD", "CONSUMED"].map((key) => ({
      status: key,
      count: summaryMap.get(key) || 0,
    }));

    const sample = listRes.rows.map((row) => {
      const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
      const username = payload.username || payload.user || "";
      const password = payload.password || "";
      const preview = stableStringify(payload);
      return {
        id: row.id,
        status: row.status === "DELIVERED" ? "CONSUMED" : row.status,
        external_id: payload.external_id || "",
        starts_at: payload.starts_at || payload.start_at || "",
        expires_at: payload.expires_at || "",
        created_at: row.created_at,
        username: username ? String(username) : "",
        password_masked: password ? maskSecret(password) : "",
        payload_preview: preview.length > 80 ? `${preview.slice(0, 80)}…` : preview,
      };
    });

    res.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.set("Surrogate-Control", "no-store");
    res.set("ETag", "");
    return res.json({ summary, sample, limit, offset });
  } catch (error) {
    return next(error);
  }
});

router.post(
  "/stock/units/upload",
  express.raw({ type: "*/*", limit: "10mb" }),
  async (req, res, next) => {
    const productId = req.query.product_id;
    const skuKey = req.query.sku_key;
    const pool = getPool();

    let receipt = "";
    try {
      const contentType = req.headers["content-type"] || "";
      let csvText = "";

      if (contentType.includes("multipart/form-data")) {
        const boundaryMatch = contentType.match(/boundary=([^;]+)/i);
        const boundary = boundaryMatch ? boundaryMatch[1] : null;
        if (!boundary) {
          return res.status(400).json({ error: "BOUNDARY_NOT_FOUND" });
        }
        const raw = req.body.toString("utf8");
        const parts = raw.split(`--${boundary}`);
        for (const part of parts) {
          if (!part.includes("Content-Disposition")) {
            continue;
          }
          const splitIndex = part.indexOf("\r\n\r\n");
          if (splitIndex === -1) {
            continue;
          }
          const body = part.slice(splitIndex + 4).trim();
          if (body) {
            csvText = body.replace(/\r\n--$/, "").trim();
            break;
          }
        }
      } else {
        csvText = req.body ? req.body.toString("utf8") : "";
      }

      if (!csvText) {
        return res.status(400).json({ error: "CSV_REQUIRED" });
      }

      const parsed = parseCsv(csvText);
      if (parsed.rows.length === 0) {
        return res.status(400).json({ error: "CSV_EMPTY" });
      }

      const client = await pool.connect();
      const inserted = [];
      const failed = [];
      const seenPayloads = new Set();
      const touchedProducts = new Set();

      try {
        await client.query("BEGIN");

        for (const [index, row] of parsed.rows.entries()) {
          if (failed.length >= 50) {
            break;
          }
          const rowProductId = row.product_id || productId;
          const rowSkuKey = row.sku_key || skuKey;
          const product = await resolveProductByIdentifier(
            client,
            rowProductId || null,
            rowSkuKey || null
          );

          if (!product) {
            failed.push({ row_number: index + 2, reason: "PRODUCT_NOT_FOUND" });
            continue;
          }

          if (product.stock_mode !== "UNITS") {
            failed.push({ row_number: index + 2, reason: "PRODUCT_NOT_UNITS" });
            continue;
          }

          let payload = {};
          if (row.payload) {
            try {
              payload = JSON.parse(row.payload);
            } catch (error) {
              failed.push({ row_number: index + 2, reason: "PAYLOAD_INVALID_JSON" });
              continue;
            }
          }

          const normalizedPayload = {
            title: row.title || payload.title,
            username: row.username || payload.username,
            password: row.password || payload.password,
            start_at: row.start_at || row.starts_at || payload.start_at,
            starts_at: row.starts_at || row.start_at || payload.starts_at,
            expires_at: row.expires_at || payload.expires_at,
            notes: row.notes || payload.notes,
            external_id: row.external_id || payload.external_id,
            ...payload,
          };

          const payloadKey = stableStringify(normalizedPayload);
          if (seenPayloads.has(payloadKey)) {
            failed.push({ row_number: index + 2, reason: "DUPLICATE_IN_FILE" });
            continue;
          }
          seenPayloads.add(payloadKey);

          if (normalizedPayload.external_id) {
            const extRes = await client.query(
              `SELECT 1
               FROM product_stock_units
               WHERE product_id = $1
                 AND payload->>'external_id' = $2
               LIMIT 1`,
              [product.id, String(normalizedPayload.external_id)]
            );
            if (extRes.rowCount > 0) {
              failed.push({ row_number: index + 2, reason: "EXTERNAL_ID_DUPLICATE" });
              continue;
            }
          }

          const existingRes = await client.query(
            `SELECT 1 FROM product_stock_units
             WHERE product_id = $1 AND payload = $2::jsonb
             LIMIT 1`,
            [product.id, normalizedPayload]
          );
          if (existingRes.rowCount > 0) {
            failed.push({ row_number: index + 2, reason: "DUPLICATE_IN_DB" });
            continue;
          }

          await client.query(
            `INSERT INTO product_stock_units (product_id, payload, status)
             VALUES ($1, $2::jsonb, 'AVAILABLE')`,
            [product.id, normalizedPayload]
          );
          inserted.push(row);
          touchedProducts.add(product.id);
        }

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      if (touchedProducts.size > 0) {
        await pool.query(
          `INSERT INTO audit_logs (admin_action, entity_type, entity_id, meta)
           VALUES ($1, $2, $3, $4::jsonb)`,
          [
            "STOCK_UNITS_UPLOAD",
            "product",
            Array.from(touchedProducts)[0],
            JSON.stringify({
              inserted_count: inserted.length,
              failed_count: failed.length,
              product_ids: Array.from(touchedProducts),
              sku_key: skuKey || null,
            }),
          ]
        );
      }

      return res.json({
        inserted_count: inserted.length,
        failed_rows: failed,
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.post("/stock/simple/set", async (req, res, next) => {
  const productId = req.body && req.body.product_id;
  const skuKey = req.body && req.body.sku_key;
  const simpleStock = req.body && req.body.stock_qty;
  const pool = getPool();

  if (simpleStock === undefined || simpleStock === null || simpleStock === "") {
    return res.status(400).json({ error: "STOCK_REQUIRED" });
  }

  const parsedStock = Number(simpleStock);
  if (!Number.isFinite(parsedStock) || parsedStock < 0) {
    return res.status(400).json({ error: "STOCK_INVALID" });
  }

  try {
    const product = await resolveProductByIdentifier(pool, productId, skuKey);
    if (!product) {
      return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
    }
    if (product.stock_mode !== "SIMPLE") {
      return res.status(400).json({ error: "PRODUCT_NOT_SIMPLE" });
    }

    const updateRes = await pool.query(
      `UPDATE products
       SET stock_qty = $2, updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [product.id, parsedStock]
    );

    await pool.query(
      `INSERT INTO audit_logs (admin_action, entity_type, entity_id, meta)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [
        "STOCK_SIMPLE_SET",
        "product",
        product.id,
        JSON.stringify({ stock_qty: parsedStock, sku_key: product.sku_key }),
      ]
    );

    return res.json({ product: updateRes.rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.post("/stock/template/set", async (req, res, next) => {
  const productId = req.body && req.body.product_id;
  const skuKey = req.body && req.body.sku_key;
  const template =
    req.body && req.body.delivery_template !== undefined
      ? String(req.body.delivery_template)
      : "";
  const pool = getPool();

  try {
    const product = await resolveProductByIdentifier(pool, productId, skuKey);
    if (!product) {
      return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
    }
    if (product.stock_mode !== "UNITS") {
      return res.status(400).json({ error: "PRODUCT_NOT_UNITS" });
    }

    const updateRes = await pool.query(
      `UPDATE products
       SET delivery_template = $2, updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [product.id, template]
    );

    await pool.query(
      `INSERT INTO audit_logs (admin_action, entity_type, entity_id, meta)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [
        "STOCK_TEMPLATE_SET",
        "product",
        product.id,
        JSON.stringify({ delivery_template: template }),
      ]
    );

    return res.json({ product: updateRes.rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.get("/orders", async (req, res, next) => {
  const status = req.query.status;
  const { page, pageSize, offset } = parsePagination(req.query);
  const pool = getPool();

  const filters = [];
  const values = [];

  filters.push("op.id IS NOT NULL");

  if (status) {
    values.push(status);
    filters.push(`o.status = $${values.length}`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  try {
    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM orders o
       LEFT JOIN order_payments op ON op.order_id = o.id
       ${whereClause}`,
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
    const items = itemsRes.rows.map((row) => ({
      product_id: row.product_id,
      code: row.code,
      name: row.name,
      qty: row.qty,
      unit_price_usd: row.unit_price_usd,
      line_total_usd: row.line_total_usd,
    }));

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
      subtotalUsd = Number(order.unit_price_at_purchase || order.product_price || 0);
    }

    let localTotal = null;
    const paymentMethod =
      paymentRes.rows[0]?.payment_method || order.payment_method;
    if (paymentMethod) {
      try {
        const localData = await calculateLocalAmount(subtotalUsd, paymentMethod);
        if (localData) {
          localTotal = {
            currency: localData.currency,
            amount: localData.amount,
          };
        }
      } catch (error) {
        console.error("Failed to calculate local total", error);
      }
    }

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
      items,
      payment: paymentRes.rows[0] || null,
      commission: commissionRes.rows[0] || null,
      totals: {
        subtotal_usd: subtotalUsd,
      },
      local_total: localTotal,
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
              p.stock_mode,
              op.payment_method
       FROM orders o
       JOIN users u ON u.id = o.user_id
       JOIN products p ON p.id = o.product_id
       LEFT JOIN order_payments op ON op.order_id = o.id
       WHERE o.id = $1
       FOR UPDATE OF o`,
      [orderId]
    );

    if (orderRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "ORDER_NOT_FOUND" });
    }

    const order = orderRes.rows[0];

    if (order.status !== "WAITING_PAYMENT") {
      await client.query("ROLLBACK");
      console.log("[admin/approve] already_finalized", {
        order_id: orderId,
        status: order.status,
      });
      return res.status(409).json({ error: "ORDER_ALREADY_FINALIZED" });
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
    console.log("[admin/approve] consumed_stock", { order_id: orderId });

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

    await client.query(
      `INSERT INTO audit_logs (admin_action, entity_type, entity_id, meta)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [
        "ORDER_MARK_PAID",
        "order",
        orderId,
        JSON.stringify({ admin: req.admin?.sub || null }),
      ]
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

    // Get user locale for receipt and notifications
    let userLocale = "es";
    try {
      const userRes = await pool.query(
        "SELECT locale FROM users WHERE telegram_id = $1",
        [telegramId]
      );
      if (userRes.rowCount > 0) {
        userLocale = userRes.rows[0].locale || "es";
      }
    } catch (err) {
      console.error("Failed to get user locale", err);
    }

    try {
      await sendMessage(
        telegramId,
        MESSAGES[userLocale]?.payment_received || MESSAGES.es.payment_received
      );
    } catch (err) {
      console.error("Telegram congratulations failed", err);
    }

    try {
      let items = [];
      let subtotal = Number(order.unit_price_at_purchase || 0);
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
          subtotal = 0;
          items = itemsRes.rows.map((row) => {
            const itemName = row.qty > 1 ? `${row.name} x${row.qty}` : row.name;
            const lineTotal =
              row.line_total_usd != null
                ? Number(row.line_total_usd)
                : Number(row.unit_price_usd || 0) * Number(row.qty || 0);
            subtotal += Number.isFinite(lineTotal) ? lineTotal : 0;
            return {
              name: itemName,
              price: row.line_total_usd,
            };
          });
          subtotal = Number(subtotal.toFixed(2));
        }
      } catch (err) {
        console.error("Receipt items query failed", err);
      }

      if (items.length === 0) {
        items = [{ name: order.product_name, price: order.product_price }];
        subtotal = Number(order.unit_price_at_purchase || order.product_price || 0);
      }

      const orderNumberText = order.order_number
        ? String(order.order_number).padStart(5, "0")
        : "-";

      // Calculate local amount for receipt
      let localTotal = null;
      try {
        const localData = await calculateLocalAmount(subtotal, order.payment_method);
        if (localData) {
          localTotal = {
            currency: localData.currency,
            amount: localData.amount,
          };
        }
      } catch (err) {
        console.error("Failed to calculate local total", err);
      }

      receipt = buildReceiptMessage(
        order,
        paymentRes.rows[0],
        userLocale,
        subtotal
      );

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
        localTotal,
        locale: userLocale,
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
        "⌚️ You will receive your content shortly."
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

    await client.query(
      `INSERT INTO audit_logs (admin_action, entity_type, entity_id, meta)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [
        "ORDER_REJECT",
        "order",
        orderId,
        JSON.stringify({ admin: req.admin?.sub || null, mode }),
      ]
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
