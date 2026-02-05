const express = require("express");
const fs = require("fs/promises");
const path = require("path");
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
  sendDocument,
  editMessageCaption,
} = require("../services/telegram");
const {
  listAdminOrderNotifications,
  buildOrderNotificationCaption,
  buildOrderNotificationKeyboard,
  calculateLocalAmount: calculateLocalAmountForAdminNotify,
} = require("../services/adminOrderNotification");
const {
  listPaymentMethods,
  normalizeMethodKey,
  togglePaymentMethod,
  upsertPaymentMethod,
  deletePaymentMethod,
} = require("../services/paymentMethods");
const {
  getMaintenanceStatus,
  setMaintenanceStatus,
} = require("../services/maintenance");
const {
  getBotAssets,
  setBotAssets,
  setPaymentMethodsImage,
} = require("../services/botAssets");
const { ensureProductCategorySchema } = require("../services/productSchema");
const { renderReceiptPng } = require("../services/receiptRenderer");
const { consumeStockForOrder, releaseStockForOrder } = require("../services/stock");
const { deliverOrderToTelegram } = require("../services/delivery");
const { getAffiliateLevel } = require("../services/affiliateLevels");
const { getAdminLayout, setAdminLayout } = require("../services/adminLayouts");
const env = require("../config/env");
const bcrypt = require("bcryptjs");

let payoutReceiptSchemaReady = false;
async function ensurePayoutReceiptSchema(pool) {
  if (payoutReceiptSchemaReady) {
    return;
  }
  await pool.query(
    `ALTER TABLE payouts
     ADD COLUMN IF NOT EXISTS receipt_path text,
     ADD COLUMN IF NOT EXISTS receipt_filename text,
     ADD COLUMN IF NOT EXISTS receipt_mime text`
  );
  payoutReceiptSchemaReady = true;
}

const MESSAGES = {
  es: {
    payment_received: "🎉 Felicidades, hemos recibido tu pago 🎉 🥳",
    refund_full:
      "✅ Tu reembolso fue procesado correctamente.\n\nMonto reembolsado: {amount}\n\nSi necesitas ayuda, contáctanos.",
    refund_partial:
      "✅ Procesamos un reembolso parcial de tu orden.\n\nMonto reembolsado: {amount}\n\nSi necesitas ayuda, contáctanos.",
  },
  en: {
    payment_received: "🎉 Congratulations, we’ve received your payment 🎉 🥳",
    refund_full:
      "✅ Your refund was processed successfully.\n\nRefunded amount: {amount}\n\nIf you need help, contact us.",
    refund_partial:
      "✅ We processed a partial refund for your order.\n\nRefunded amount: {amount}\n\nIf you need help, contact us.",
  },
};

const SUPPORT_MESSAGES = {
  es: {
    image_allowed: "🖼️ Ya puedes enviar una imagen en este ticket. Solo 1 captura.",
    ticket_closed: "✅ Tu ticket de soporte fue cerrado. Si necesitas más ayuda, abre un nuevo ticket.",
    user_banned: "⛔️ Has sido baneado de soporte por uso indebido de mensajes.",
  },
  en: {
    image_allowed: "🖼️ You can now send one image in this ticket. Only 1 capture.",
    ticket_closed: "✅ Your support ticket was closed. If you need more help, open a new ticket.",
    user_banned: "⛔️ You have been banned from support for misuse of messages.",
  },
};

const AFFILIATE_MESSAGES = {
  es: {
    approved: "✅ Tu solicitud para ser afiliado fue aprobada por el admin.",
    rejected: "❌ Tu solicitud para ser afiliado fue rechazada por el admin.",
    blocked:
      "🔒 Afiliado: {username}\n\n⚠️ Haz sido bloqueado por un admin, tal ves por que infringiste alguna regla. Si crees que es un error comunícate con @Noropayments.",
    unblocked:
      "🔓 Haz sido desbloqueado por un admin. ✅ Sigue trabajando sin romper las reglas.",
    adjustment_credit:
      "✅ Se te agregó saldo.\n\n💵 Monto: {amount}\n📝 Motivo: {reason}",
    adjustment_debit:
      "⚠️ Se te descontó saldo.\n\n💵 Monto: {amount}\n📝 Motivo: {reason}",
    refund_full:
      "⚠️ Se reembolsó una orden referida por ti y se descontó tu comisión.\n\nMonto descontado: {amount}.",
    refund_partial:
      "⚠️ Se realizó un reembolso parcial en una orden referida por ti y se ajustó tu comisión.\n\nMonto descontado: {amount}.",
  },
  en: {
    approved: "✅ Your affiliate request was approved by the admin.",
    rejected: "❌ Your affiliate request was rejected by the admin.",
    blocked:
      "🔒 Affiliate: {username}\n\n⚠️ You have been blocked by an admin, maybe because you violated a rule. If you think this is a mistake, contact @Noropayments.",
    unblocked:
      "🔓 You have been unblocked by an admin. ✅ Keep working without breaking the rules.",
    adjustment_credit:
      "✅ Balance added.\n\n💵 Amount: {amount}\n📝 Reason: {reason}",
    adjustment_debit:
      "⚠️ Balance deducted.\n\n💵 Amount: {amount}\n📝 Reason: {reason}",
    refund_full:
      "⚠️ A referred order was refunded and your commission was deducted.\n\nAmount deducted: {amount}.",
    refund_partial:
      "⚠️ A referred order was partially refunded and your commission was adjusted.\n\nAmount deducted: {amount}.",
  },
};

const router = express.Router();

const DELIVERY_START_DELAY_MS = Math.max(
  Number(process.env.DELIVERY_START_DELAY_MS || 10000) || 10000,
  0
);

let broadcastSchemaReady = false;
async function ensureBroadcastSchema(pool) {
  if (broadcastSchemaReady) {
    return;
  }
  await pool.query(
    `ALTER TABLE broadcasts
     ADD COLUMN IF NOT EXISTS image_path text,
     ADD COLUMN IF NOT EXISTS image_filename text,
     ADD COLUMN IF NOT EXISTS image_mime text,
     ADD COLUMN IF NOT EXISTS buttons jsonb,
     ADD COLUMN IF NOT EXISTS saved boolean NOT NULL DEFAULT false`
  );
  broadcastSchemaReady = true;
}

let globalCommissionSchemaReady = false;
async function ensureGlobalCommissionSchema(pool) {
  if (globalCommissionSchemaReady) {
    return;
  }
  await pool.query(
    `CREATE TABLE IF NOT EXISTS global_commission_boost (
       id int PRIMARY KEY DEFAULT 1,
       rate numeric(6,4) NOT NULL DEFAULT 0,
       active boolean NOT NULL DEFAULT false,
       ends_at timestamptz,
       updated_at timestamptz NOT NULL DEFAULT now()
     )`
  );
  await pool.query(
    `INSERT INTO global_commission_boost (id)
     VALUES (1)
     ON CONFLICT (id) DO NOTHING`
  );
  globalCommissionSchemaReady = true;
}

let globalCommissionTimer = null;
let globalCommissionEndsAt = null;
let globalCommissionWatchStarted = false;

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

async function notifyAffiliates(pool, message) {
  if (!message) {
    return;
  }
  const affiliatesRes = await pool.query(
    `SELECT u.telegram_id
     FROM affiliates a
     JOIN users u ON u.id = a.user_id
     WHERE a.status = 'APPROVED' AND u.telegram_id IS NOT NULL`
  );
  await Promise.all(
    affiliatesRes.rows.map(async (row) => {
      try {
        await sendMessage(row.telegram_id, message);
      } catch (err) {
        // ignore affiliate notification errors
      }
    })
  );
}

async function resetGlobalCommission(pool, reason) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE affiliates SET commission_rate = 0");
    await client.query(
      "ALTER TABLE affiliates ALTER COLUMN commission_rate SET DEFAULT 0"
    );
    await client.query(
      `UPDATE global_commission_boost
       SET rate = 0, active = false, ends_at = NULL, updated_at = now()
       WHERE id = 1`
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  const message =
    reason === "STOPPED"
      ? `⛔️ BOOST DETENIDO\n\nTus comisiones vuelven a tu porcentaje habitual por nivel.`
      : `✅ BOOST FINALIZADO\n\nTus comisiones vuelven a tu porcentaje habitual por nivel.`;
  await notifyAffiliates(pool, message);
}

async function scheduleGlobalCommissionReset(pool, endsAt) {
  if (globalCommissionTimer) {
    clearTimeout(globalCommissionTimer);
    globalCommissionTimer = null;
  }
  globalCommissionEndsAt = endsAt ? new Date(endsAt) : null;
  if (!globalCommissionEndsAt || Number.isNaN(globalCommissionEndsAt.getTime())) {
    return;
  }
  const ms = globalCommissionEndsAt.getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) {
    await resetGlobalCommission(pool, "AUTO");
    return;
  }
  globalCommissionTimer = setTimeout(() => {
    resetGlobalCommission(pool, "AUTO").catch(() => null);
  }, ms);
}

function startGlobalCommissionWatcher() {
  if (globalCommissionWatchStarted) {
    return;
  }
  globalCommissionWatchStarted = true;
  setInterval(async () => {
    try {
      const pool = getPool();
      await ensureGlobalCommissionSchema(pool);
      const res = await pool.query(
        `SELECT active, ends_at
         FROM global_commission_boost
         WHERE id = 1`
      );
      const row = res.rows[0];
      if (!row || !row.active || !row.ends_at) {
        return;
      }
      const endsAt = new Date(row.ends_at);
      if (Number.isFinite(endsAt.getTime()) && endsAt.getTime() <= Date.now()) {
        await resetGlobalCommission(pool, "AUTO");
      }
    } catch (err) {
      // ignore watcher errors
    }
  }, 60000);
}

startGlobalCommissionWatcher();

let ticketSchemaReady = false;
async function ensureTicketSchema(pool) {
  if (ticketSchemaReady) {
    return;
  }
  await pool.query(
    `ALTER TABLE tickets
     ADD COLUMN IF NOT EXISTS allow_image boolean NOT NULL DEFAULT false`
  );
  ticketSchemaReady = true;
}

let supportBanSchemaReady = false;
async function ensureSupportBanSchema(pool) {
  if (supportBanSchemaReady) {
    return;
  }
  await pool.query(
    `CREATE TABLE IF NOT EXISTS support_bans (
       id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       telegram_id bigint NOT NULL UNIQUE,
       reason text,
       banned_at timestamptz NOT NULL DEFAULT now()
     )`
  );
  supportBanSchemaReady = true;
}

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

async function getUserLocaleByTelegramId(pool, telegramId) {
  try {
    const userRes = await pool.query(
      "SELECT locale FROM users WHERE telegram_id = $1",
      [telegramId]
    );
    const locale = userRes.rows[0]?.locale;
    if (locale === "en" || locale === "es") {
      return locale;
    }
  } catch (err) {
    console.error("Failed to get user locale", err);
  }
  return "es";
}

async function calculateLocalAmount(usdAmount, paymentMethod) {
  const method = normalizePaymentMethod(paymentMethod);
  const usdBase = Number(usdAmount) || 0;
  let currency = null;
  let rate = null;

  if (method === "NEQUI") {
    currency = "COP";
    rate = await getFiatRate("COP");
    if (rate) {
      return { currency, amount: usdBase * rate };
    }
  } else if (method === "MERCADO_PAGO") {
    currency = "MXN";
    rate = await getFiatRate("MXN");
    if (rate) {
      return { currency, amount: usdBase * rate };
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

async function updateAdminOrderNotifications(pool, orderId) {
  try {
    const notifications = await listAdminOrderNotifications(pool, orderId);
    if (!notifications.length) {
      return;
    }

    const orderRes = await pool.query(
      `SELECT o.*, u.telegram_id, u.telegram_username,
              p.name AS product_name, p.price AS product_price
       FROM orders o
       JOIN users u ON u.id = o.user_id
       JOIN products p ON p.id = o.product_id
       WHERE o.id = $1`,
      [orderId]
    );
    if (orderRes.rowCount === 0) {
      return;
    }
    const order = orderRes.rows[0];

    const paymentRes = await pool.query(
      "SELECT * FROM order_payments WHERE order_id = $1",
      [orderId]
    );
    const payment = paymentRes.rows[0] || null;

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
      subtotalUsd = Number(order.unit_price_at_purchase || order.product_price || 0);
    }

    const paymentMethod = payment?.payment_method || order.payment_method;
    let localTotal = null;
    if (paymentMethod) {
      try {
        localTotal = await calculateLocalAmountForAdminNotify(subtotalUsd, paymentMethod);
      } catch (error) {
        console.error("Failed to calculate local total", error);
      }
    }
    let markupPercent = null;
    if (localTotal && localTotal.amount != null) {
      try {
        markupPercent = await getPaymentMethodMarkup(pool, paymentMethod);
        if (markupPercent) {
          const nextAmount =
            Number(localTotal.amount) * (1 + Number(markupPercent) / 100);
          if (Number.isFinite(nextAmount)) {
            localTotal = { ...localTotal, amount: nextAmount };
          }
        }
      } catch (error) {
        console.error("Failed to apply markup for admin notify", error);
      }
    }

    const caption = buildOrderNotificationCaption({
      order,
      user: {
        telegram_id: order.telegram_id,
        telegram_username: order.telegram_username,
      },
      items,
      payment,
      subtotalUsd,
      localTotal,
      markupPercent,
    });
    const replyMarkup = buildOrderNotificationKeyboard({
      id: order.id,
      telegram_id: order.telegram_id,
    });

    await Promise.all(
      notifications.map((row) =>
        editMessageCaption(
          row.admin_telegram_id,
          row.message_id,
          caption,
          { reply_markup: replyMarkup }
        ).catch((error) => {
          console.error("Admin order notify update failed", error);
        })
      )
    );
  } catch (error) {
    console.error("Admin order notify update failed", error);
  }
}

function parsePagination(query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(query.page_size, 10) || 20, 1), 100);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

async function recalcSkuKeys(client) {
  await client.query("CREATE SEQUENCE IF NOT EXISTS products_sku_key_seq");
  await client.query("UPDATE products SET sku_key = NULL WHERE sku_key IS NOT NULL");
  await client.query(
    `WITH ordered AS (
       SELECT
         id,
         row_number() OVER (ORDER BY created_at, id) AS rn
       FROM products
       WHERE is_active = true
     ),
     updated AS (
       UPDATE products p
       SET sku_key = lpad(ordered.rn::text, 6, '0')
       FROM ordered
       WHERE p.id = ordered.id
       RETURNING ordered.rn
     )
     SELECT setval('products_sku_key_seq', COALESCE((SELECT max(rn) FROM ordered), 0))`
  );
}

async function getNextSkuKey(client) {
  await client.query("CREATE SEQUENCE IF NOT EXISTS products_sku_key_seq");
  await client.query(
    "GRANT USAGE, SELECT ON SEQUENCE products_sku_key_seq TO PUBLIC"
  );
  const res = await client.query(
    "SELECT nextval('products_sku_key_seq') AS value"
  );
  return String(res.rows[0].value).padStart(6, "0");
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

function normalizeChatIds(input) {
  if (!Array.isArray(input)) {
    return [];
  }
  const cleaned = input
    .map((item) => String(item).trim())
    .filter((item) => item && /^-?[0-9]+$/.test(item));
  return Array.from(new Set(cleaned));
}

function escapeBroadcastHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatBroadcastMessage(raw) {
  let text = escapeBroadcastHtml(raw);
  text = text.replace(/```([\s\S]+?)```/g, (_, code) => {
    return `<pre><code>${code}</code></pre>`;
  });
  text = text.replace(/`([^`]+?)`/g, "<code>$1</code>");
  text = text.replace(/\*\*([^*]+?)\*\*/g, "<b>$1</b>");
  text = text.replace(/(^|[^*])\*([^*]+?)\*(?!\*)/g, "$1<i>$2</i>");
  return text;
}

function normalizeBroadcastButtons(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((button) => {
      if (!button || typeof button !== "object") {
        return null;
      }
      const text = String(button.text || "").trim();
      const url = String(button.url || "").trim();
      if (!text || !url || !/^https?:\/\//i.test(url)) {
        return null;
      }
      return { text, url };
    })
    .filter(Boolean);
}

function parseImageDataUrl(value) {
  if (!value) {
    return null;
  }
  const raw = String(value).trim();
  const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/);
  if (!match) {
    return null;
  }
  const mime = match[1];
  const base64 = match[2];
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) {
    return null;
  }
  return { mime, buffer };
}

function getImageExtension(mime) {
  const map = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  return map[mime] || "jpg";
}

function buildInlineKeyboard(buttons) {
  if (!Array.isArray(buttons) || buttons.length === 0) {
    return null;
  }
  return {
    inline_keyboard: buttons.map((button) => [
      { text: button.text, url: button.url },
    ]),
  };
}

function mapBroadcastSegment(segment, hasCustomRecipients) {
  if (segment === "GROUPS") {
    return "GROUPS";
  }
  if (segment === "CHANNELS") {
    return "CHANNELS";
  }
  if (segment === "BUYERS") {
    return "BUYERS";
  }
  if (segment === "AFFILIATES") {
    return "AFFILIATES";
  }
  if (segment === "BUYERS_AFFILIATES") {
    return "BUYERS_AFFILIATES";
  }
  if (hasCustomRecipients) {
    return "CUSTOM";
  }
  if (segment === "ALL") {
    return "ALL_USERS";
  }
  return segment;
}

function normalizeBroadcastSegmentInput(segment) {
  if (!segment) {
    return "";
  }
  if (segment === "ALL_USERS") {
    return "ALL";
  }
  if (segment === "CUSTOM") {
    return "ALL";
  }
  return segment;
}

const RECEIPT_TRANSLATIONS = {
  es: {
    title: "🧾 Recibo de pago",
    order_id: "🆔 ID de orden",
    order_number: "🧾 Número de orden",
    product: "📦 Producto",
    price: "💰 Precio",
    date: "📅 Fecha (Hora COL)",
    status: "📊 Estado",
    paid: "✅ PAGADO",
    reference: "🔗 Referencia",
    total: "💵 Total",
    total_in: "💵 Total en",
    rate: "💱 Tasa aplicada",
    commission: "💸 Comisión",
    referred_by: "👤 Referido de",
  },
  en: {
    title: "🧾 Receipt",
    order_id: "🆔 Order ID",
    order_number: "🧾 Order number",
    product: "📦 Product",
    price: "💰 Price",
    date: "📅 Date (Hora COL)",
    status: "📊 Status",
    paid: "✅ PAID",
    reference: "🔗 Reference",
    total: "💵 Total",
    total_in: "💵 Total in",
    rate: "💱 Applied rate",
    commission: "💸 Commission",
    referred_by: "👤 Referred by",
  },
};

function formatBogotaDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" });
  }
  return date.toLocaleString("es-CO", { timeZone: "America/Bogota" });
}

function buildReceiptMessage(
  order,
  paymentProof,
  locale = "es",
  subtotalUsd,
  localTotal,
  commissionAmount,
  referredBy
) {
  const translations = RECEIPT_TRANSLATIONS[locale] || RECEIPT_TRANSLATIONS.es;
  const price =
    subtotalUsd !== undefined && subtotalUsd !== null
      ? subtotalUsd
      : order.unit_price_at_purchase || order.product_price;
  const createdAtText = formatBogotaDate(order.paid_at || new Date());
  const orderNumberText = order.order_number
    ? String(order.order_number).padStart(5, "0")
    : "-";
  const priceNumber = Number(price || 0);
  const priceText =
    Number.isFinite(priceNumber) && priceNumber <= 0
      ? "Gratis"
      : `$${priceNumber.toLocaleString(locale === "es" ? "es-CO" : "en-US", {
          maximumFractionDigits: 0,
        })} USD`;
  const lines = [
    `🎉 ${translations.title} 🎉`,
    "",
    `${translations.order_number}: ${orderNumberText}`,
    "",
    `${translations.order_id}: ${order.id}`,
    "",
    `${translations.product}: ${order.product_name || order.product_id}`,
    "",
    `${translations.price}: ${priceText}`,
    "",
    `${translations.date}: ${createdAtText}`,
    "",
    `${translations.status}: ${translations.paid}`,
  ];
  if (paymentProof && paymentProof.screenshot_file_id) {
    lines.push("");
    lines.push(`${translations.reference}: ${paymentProof.screenshot_file_id}`);
  }
  if (localTotal && localTotal.currency && localTotal.amount != null) {
    const currency = localTotal.currency;
    const amount =
      currency === "COP" || currency === "MXN"
        ? Math.floor(localTotal.amount).toLocaleString(locale === "es" ? "es-CO" : "en-US")
        : Number(localTotal.amount).toFixed(currency === "BTC" || currency === "LTC" ? 8 : 2)
            .replace(/\.?0+$/, "");
    lines.push("");
    lines.push(`${translations.total_in} ${currency}: ${amount} ${currency}`);
    const rateBase = Number(price) || 0;
    if (rateBase > 0) {
      const rateValue = Number(localTotal.amount) / rateBase;
      if (Number.isFinite(rateValue) && rateValue > 0) {
        const rateText =
          currency === "BTC" || currency === "LTC"
            ? rateValue.toFixed(8)
            : rateValue.toFixed(2);
        lines.push(`${translations.rate}: 1 USD = ${rateText} ${currency}`);
      }
    }
  }
  if (commissionAmount != null) {
    lines.push("");
    lines.push(
      `${translations.commission}: $${Number(commissionAmount || 0).toFixed(2)} USD`
    );
  }
  if (referredBy) {
    lines.push(`${translations.referred_by}: ${referredBy}`);
  }
  lines.push("");
  lines.push("✅ ¡Gracias por tu compra!");
  return lines.join("\n");
}

function formatUsd(amount) {
  const value = Number(amount || 0);
  return `$${value.toFixed(2)}`;
}

function formatUsdWithCurrency(amount) {
  const value = Number(amount || 0);
  const fixed = value.toFixed(2);
  const trimmed = fixed.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  return `$${trimmed} USD`;
}

async function getOrderTotalUsd(client, orderId, fallback) {
  const itemsRes = await client.query(
    `SELECT COALESCE(SUM(line_total_usd), 0) AS total
     FROM order_items
     WHERE order_id = $1`,
    [orderId]
  );
  const total = Number(itemsRes.rows[0]?.total || 0);
  if (total > 0) {
    return Number(total.toFixed(2));
  }
  return Number(Number(fallback || 0).toFixed(2));
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
  const expectedUsername = (process.env.ADMIN_USERNAME || "").trim();
  const expectedPasswordHash = (process.env.ADMIN_PASSWORD_HASH || "").trim();
  const expectedPasswordPlain = (process.env.ADMIN_PASSWORD || "").trim();

  if (!expectedUsername || (!expectedPasswordHash && !expectedPasswordPlain)) {
    return res.status(500).json({ error: "ADMIN_AUTH_NOT_CONFIGURED" });
  }

  const providedUsername = String(username || "").trim();
  if (providedUsername !== expectedUsername) {
    console.warn("[admin/auth] invalid username", {
      provided: providedUsername,
      expected: expectedUsername,
    });
    return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  }

  const providedPassword = String(password || "");
  let passwordOk = false;
  if (expectedPasswordHash) {
    passwordOk = await bcrypt.compare(providedPassword, expectedPasswordHash);
  }
  if (!passwordOk && expectedPasswordPlain) {
    passwordOk = providedPassword === expectedPasswordPlain;
  }
  if (!passwordOk) {
    console.warn("[admin/auth] invalid password", {
      hasHash: Boolean(expectedPasswordHash),
      hasPlain: Boolean(expectedPasswordPlain),
      providedLength: providedPassword.length,
    });
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

  const notifyAdmins = async () => {
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
  };

  setImmediate(() => {
    notifyAdmins().catch((error) => {
      console.error("Telegram 2FA notification failed", error);
    });
  });

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

router.get("/users/total", async (req, res, next) => {
  const pool = getPool();
  try {
    const result = await pool.query(
      "SELECT COUNT(DISTINCT telegram_id)::int AS total FROM users"
    );
    const total = result.rows[0]?.total || 0;
    return res.json({ total });
  } catch (error) {
    return next(error);
  }
});

router.get("/maintenance", async (req, res, next) => {
  const pool = getPool();
  try {
    const active = await getMaintenanceStatus(pool);
    return res.json({ active });
  } catch (error) {
    return next(error);
  }
});

router.post("/maintenance", async (req, res, next) => {
  const pool = getPool();
  try {
    const requested = req.body?.active;
    let nextActive = requested;
    if (typeof nextActive !== "boolean") {
      const current = await getMaintenanceStatus(pool);
      nextActive = !current;
    }
    const active = await setMaintenanceStatus(pool, nextActive);
    return res.json({ active });
  } catch (error) {
    return next(error);
  }
});

router.get("/bot-assets", async (req, res, next) => {
  const pool = getPool();
  try {
    const assets = await getBotAssets(pool);
    return res.json({ assets });
  } catch (error) {
    return next(error);
  }
});

router.post("/bot-assets", async (req, res, next) => {
  const pool = getPool();
  try {
    const assets = await setBotAssets(pool, req.body || {});
    return res.json({ assets });
  } catch (error) {
    return next(error);
  }
});

router.post("/bot-assets/payment-methods-image", async (req, res, next) => {
  const pool = getPool();
  try {
    const imageUrl = req.body?.image_url || "";
    const value = await setPaymentMethodsImage(pool, imageUrl);
    return res.json({ image_url: value });
  } catch (error) {
    return next(error);
  }
});

router.get("/layouts/:key", async (req, res, next) => {
  const pool = getPool();
  const key = String(req.params.key || "").trim();
  if (!key) {
    return res.status(400).json({ error: "LAYOUT_KEY_REQUIRED" });
  }
  try {
    const layout = await getAdminLayout(pool, key);
    return res.json({ layout });
  } catch (error) {
    return next(error);
  }
});

router.post("/layouts/:key", async (req, res, next) => {
  const pool = getPool();
  const key = String(req.params.key || "").trim();
  if (!key) {
    return res.status(400).json({ error: "LAYOUT_KEY_REQUIRED" });
  }
  try {
    const layout = await setAdminLayout(pool, key, req.body || {});
    return res.json({ layout });
  } catch (error) {
    return next(error);
  }
});

router.get("/payment-methods", async (req, res, next) => {
  const pool = getPool();
  try {
    const methods = await listPaymentMethods(pool);
    return res.json({ methods });
  } catch (error) {
    return next(error);
  }
});

router.post("/payment-methods/:key/toggle", async (req, res, next) => {
  const pool = getPool();
  const key = normalizeMethodKey(req.params.key);
  if (!key) {
    return res.status(400).json({ error: "PAYMENT_METHOD_INVALID" });
  }
  try {
    const methods = await togglePaymentMethod(pool, key);
    return res.json({ methods });
  } catch (error) {
    return next(error);
  }
});

router.post("/payment-methods", async (req, res, next) => {
  const pool = getPool();
  try {
    const methods = await upsertPaymentMethod(pool, req.body || {});
    if (!methods) {
      return res.status(400).json({ error: "PAYMENT_METHOD_INVALID" });
    }
    return res.json({ methods });
  } catch (error) {
    return next(error);
  }
});

router.delete("/payment-methods/:key", async (req, res, next) => {
  const pool = getPool();
  try {
    const methods = await deletePaymentMethod(pool, req.params.key);
    if (!methods) {
      return res.status(400).json({ error: "PAYMENT_METHOD_INVALID" });
    }
    return res.json({ methods });
  } catch (error) {
    return next(error);
  }
});

router.post("/products/:id/name", async (req, res, next) => {
  const productId = req.params.id;
  const name = req.body && typeof req.body.name === "string"
    ? req.body.name.trim()
    : "";
  const pool = getPool();

  if (!productId) {
    return res.status(400).json({ error: "PRODUCT_ID_REQUIRED" });
  }
  if (!name) {
    return res.status(400).json({ error: "NAME_REQUIRED" });
  }

  try {
    const updateRes = await pool.query(
      `UPDATE products
       SET name = $2, updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [productId, name]
    );

    if (updateRes.rowCount === 0) {
      return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
    }

    await pool.query(
      `INSERT INTO audit_logs (admin_action, entity_type, entity_id, meta)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [
        "PRODUCT_NAME_UPDATE",
        "product",
        productId,
        JSON.stringify({ name }),
      ]
    );

    return res.json({ product: updateRes.rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.post("/products/recalculate", async (req, res, next) => {
  const pool = getPool();
  try {
    await ensureProductCategorySchema(pool);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("LOCK TABLE products IN EXCLUSIVE MODE");
      await recalcSkuKeys(client);
      await client.query("COMMIT");
      return res.json({ status: "ok" });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return next(error);
  }
});

router.post("/products", async (req, res, next) => {
  const pool = getPool();
  const allowedDeliveryTypes = [
    "FILE",
    "TEXT",
    "IMAGE",
    "VIDEO",
    "LINK",
    "EXPIRING_LINK",
  ];
  const allowedStockModes = ["SIMPLE", "UNITS"];

  const categoryKey = String(req.body?.category_key || "").toUpperCase();
  const displayName = typeof req.body?.display_name === "string"
    ? req.body.display_name.trim()
    : "";
  const rawName = typeof req.body?.name === "string"
    ? req.body.name.trim()
    : "";
  const baseName = rawName || displayName;

  if (!baseName) {
    return res.status(400).json({ error: "NAME_REQUIRED" });
  }

  const name = baseName;

  const priceValue = req.body?.price;
  const parsedPrice = Number(priceValue ?? 0);
  if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
    return res.status(400).json({ error: "PRICE_INVALID" });
  }

  const deliveryType = String(req.body?.delivery_type || "TEXT").toUpperCase();
  if (!allowedDeliveryTypes.includes(deliveryType)) {
    return res.status(400).json({ error: "DELIVERY_TYPE_INVALID" });
  }

  const stockMode = String(req.body?.stock_mode || "SIMPLE").toUpperCase();
  if (!allowedStockModes.includes(stockMode)) {
    return res.status(400).json({ error: "STOCK_MODE_INVALID" });
  }

  const stockQtyRaw = req.body?.stock_qty;
  const stockQty = stockMode === "UNITS"
    ? null
    : stockQtyRaw === "" || stockQtyRaw === null || stockQtyRaw === undefined
      ? null
      : Number(stockQtyRaw);
  if (stockMode === "SIMPLE" && stockQty !== null) {
    if (!Number.isFinite(stockQty) || stockQty < 0) {
      return res.status(400).json({ error: "STOCK_INVALID" });
    }
  }

  const showStock = req.body?.show_stock === undefined
    ? true
    : Boolean(req.body?.show_stock);
  const uniquePurchase = Boolean(req.body?.unique_purchase);
  const outOfStock = req.body?.out_of_stock === undefined
    ? false
    : Boolean(req.body?.out_of_stock);
  let skuKey = typeof req.body?.sku_key === "string" && req.body.sku_key.trim()
    ? req.body.sku_key.trim()
    : "";
  if (skuKey && !/^\d+$/.test(skuKey)) {
    skuKey = "";
  }
  const description = typeof req.body?.description === "string"
    ? req.body.description.trim()
    : "";
  const nameEn = Object.prototype.hasOwnProperty.call(req.body || {}, "name_en")
    ? String(req.body?.name_en || "").trim()
    : null;
  const descriptionEn = Object.prototype.hasOwnProperty.call(req.body || {}, "description_en")
    ? String(req.body?.description_en || "").trim()
    : null;
  const imageUrl = Object.prototype.hasOwnProperty.call(req.body || {}, "image_url")
    ? String(req.body?.image_url || "").trim()
    : "";
  const deliveryPayload = req.body?.delivery_payload && typeof req.body.delivery_payload === "object"
    ? req.body.delivery_payload
    : {};
  const deliveryPayloadEn = req.body?.delivery_payload_en && typeof req.body.delivery_payload_en === "object"
    ? req.body.delivery_payload_en
    : null;

  try {
    await ensureProductCategorySchema(pool);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (!skuKey) {
        skuKey = await getNextSkuKey(client);
      }
      const insertRes = await client.query(
        `INSERT INTO products
          (sku_key, name, description, name_en, description_en, image_url, price, is_active,
           delivery_type, delivery_payload, delivery_payload_en, stock_mode, stock_qty, show_stock,
           unique_purchase, out_of_stock, category_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         RETURNING *`,
        [
          skuKey,
          name,
          description,
          nameEn,
          descriptionEn,
          imageUrl || null,
          parsedPrice,
          deliveryType,
          deliveryPayload,
          deliveryPayloadEn,
          stockMode,
          stockQty,
          showStock,
          uniquePurchase,
          outOfStock,
          categoryKey || "TIENDA",
        ]
      );

      const created = insertRes.rows[0];
      await client.query(
        `INSERT INTO audit_logs (admin_action, entity_type, entity_id, meta)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [
          "PRODUCT_CREATE",
          "product",
          created.id,
          JSON.stringify({ name: created.name }),
        ]
      );
      await client.query("COMMIT");
      return res.status(201).json({ product: created });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return next(error);
  }
});

router.post("/products/:id/update", async (req, res, next) => {
  const productId = req.params.id;
  const pool = getPool();
  const allowedDeliveryTypes = [
    "FILE",
    "TEXT",
    "IMAGE",
    "VIDEO",
    "LINK",
    "EXPIRING_LINK",
  ];
  const allowedStockModes = ["SIMPLE", "UNITS"];

  if (!productId) {
    return res.status(400).json({ error: "PRODUCT_ID_REQUIRED" });
  }

  const displayName = typeof req.body?.display_name === "string"
    ? req.body.display_name.trim()
    : "";
  const categoryKey = String(req.body?.category_key || "").toUpperCase();
  if (!displayName) {
    return res.status(400).json({ error: "NAME_REQUIRED" });
  }

  const name = displayName;

  const priceValue = req.body?.price;
  const parsedPrice = Number(priceValue ?? 0);
  if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
    return res.status(400).json({ error: "PRICE_INVALID" });
  }

  const description = typeof req.body?.description === "string"
    ? req.body.description.trim()
    : "";
  const nameEn = Object.prototype.hasOwnProperty.call(req.body || {}, "name_en")
    ? String(req.body?.name_en || "").trim()
    : null;
  const descriptionEn = Object.prototype.hasOwnProperty.call(req.body || {}, "description_en")
    ? String(req.body?.description_en || "").trim()
    : null;
  const imageUrlProvided = Object.prototype.hasOwnProperty.call(req.body || {}, "image_url");
  const imageUrl = imageUrlProvided
    ? String(req.body?.image_url || "").trim()
    : null;

  const showStock = req.body?.show_stock === undefined
    ? true
    : Boolean(req.body?.show_stock);
  const uniquePurchase = Boolean(req.body?.unique_purchase);
  const outOfStockProvided = Object.prototype.hasOwnProperty.call(req.body || {}, "out_of_stock");
  const outOfStock = outOfStockProvided ? Boolean(req.body?.out_of_stock) : null;

  const stockMode = String(req.body?.stock_mode || "").toUpperCase();
  if (!allowedStockModes.includes(stockMode)) {
    return res.status(400).json({ error: "STOCK_MODE_INVALID" });
  }

  const deliveryType = req.body?.delivery_type
    ? String(req.body.delivery_type).toUpperCase()
    : null;
  const deliveryPayload = req.body?.delivery_payload && typeof req.body.delivery_payload === "object"
    ? req.body.delivery_payload
    : null;
  const deliveryPayloadEn = req.body?.delivery_payload_en && typeof req.body.delivery_payload_en === "object"
    ? req.body.delivery_payload_en
    : null;
  if (deliveryType && !allowedDeliveryTypes.includes(deliveryType)) {
    return res.status(400).json({ error: "DELIVERY_TYPE_INVALID" });
  }

  try {
    await ensureProductCategorySchema(pool);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const currentRes = await client.query(
        "SELECT name, code FROM products WHERE id = $1",
        [productId]
      );
      if (currentRes.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
      }
      const updateRes = await client.query(
        `UPDATE products
         SET name = $2,
             description = $3,
             name_en = COALESCE($4, name_en),
             description_en = COALESCE($5, description_en),
             image_url = CASE WHEN $14 THEN $15 ELSE image_url END,
             price = $6,
             show_stock = $7,
             unique_purchase = $8,
             stock_mode = $9::stock_mode_enum,
             stock_qty = CASE WHEN $9::stock_mode_enum = 'UNITS' THEN NULL ELSE stock_qty END,
             delivery_type = COALESCE($10, delivery_type),
             delivery_payload = COALESCE($11::jsonb, delivery_payload),
             delivery_payload_en = COALESCE($12::jsonb, delivery_payload_en),
             category_key = COALESCE($13, category_key),
             out_of_stock = CASE WHEN $16 THEN $17 ELSE out_of_stock END,
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [
          productId,
          name,
          description,
          nameEn,
          descriptionEn,
          parsedPrice,
          showStock,
          uniquePurchase,
          stockMode,
          deliveryType,
          deliveryPayload ? JSON.stringify(deliveryPayload) : null,
          deliveryPayloadEn ? JSON.stringify(deliveryPayloadEn) : null,
          categoryKey || null,
          imageUrlProvided,
          imageUrl || null,
          outOfStockProvided,
          outOfStock,
        ]
      );

      if (updateRes.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
      }

      try {
        await client.query(
          `INSERT INTO audit_logs (admin_action, entity_type, entity_id, meta)
           VALUES ($1, $2, $3, $4::jsonb)`,
          [
            "PRODUCT_UPDATE",
            "product",
            productId,
            JSON.stringify({
              name,
              price: parsedPrice,
              show_stock: showStock,
              unique_purchase: uniquePurchase,
              stock_mode: stockMode,
            }),
          ]
        );
      } catch (error) {
        if (process.env.NODE_ENV !== "test") {
          console.warn("Audit log insert failed:", error?.message || error);
        }
      }

      await client.query("COMMIT");
      return res.json({ product: updateRes.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    return next(error);
  }
});

router.post("/products/:id/deactivate", async (req, res, next) => {
  const productId = req.params.id;
  const pool = getPool();

  if (!productId) {
    return res.status(400).json({ error: "PRODUCT_ID_REQUIRED" });
  }

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const updateRes = await client.query(
        `UPDATE products
         SET is_active = false,
             code = NULL,
             sku_key = NULL,
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [productId]
      );

      if (updateRes.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
      }

      await recalcSkuKeys(client);
      await client.query(
        `INSERT INTO audit_logs (admin_action, entity_type, entity_id, meta)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [
          "PRODUCT_DEACTIVATE",
          "product",
          productId,
          JSON.stringify({ is_active: false }),
        ]
      );

      await client.query("COMMIT");
      return res.json({ product: updateRes.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return next(error);
  }
});

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
    await ensureProductCategorySchema(pool);
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
        code: product.code,
        sku_key: product.sku_key,
        category_key: product.category_key,
        name: product.name,
        name_en: product.name_en,
        description: product.description,
        description_en: product.description_en,
        image_url: product.image_url,
        price: product.price,
        show_stock: product.show_stock,
        stock_mode: product.stock_mode,
        stock_qty: product.stock_qty,
        unique_purchase: product.unique_purchase,
        out_of_stock: product.out_of_stock,
        delivery_type: product.delivery_type,
        delivery_payload: product.delivery_payload,
        delivery_payload_en: product.delivery_payload_en,
        delivery_template: product.delivery_template,
        delivery_template_en: product.delivery_template_en,
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
         SET status = 'CANCELLED',
             cancelled_at = now(),
             cancel_source = 'ADMIN',
             order_number = COALESCE(order_number, nextval('orders_order_number_seq'))
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
         SET status = 'CANCELLED',
             cancelled_at = now(),
             cancel_source = 'ADMIN',
             order_number = COALESCE(order_number, nextval('orders_order_number_seq'))
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
      const durationValue = payload.duration_value || payload.duration || "";
      const durationUnit = payload.duration_unit || "";
      return {
        id: row.id,
        status: row.status === "DELIVERED" ? "CONSUMED" : row.status,
        created_at: row.created_at,
        username: username ? String(username) : "",
        password_masked: password ? maskSecret(password) : "",
        duration_value: durationValue ? String(durationValue) : "",
        duration_unit: durationUnit ? String(durationUnit) : "",
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

router.post("/stock/units/add", async (req, res, next) => {
  const productId = req.body?.product_id;
  const skuKey = req.body?.sku_key;
  const pool = getPool();

  try {
    const product = await resolveProductByIdentifier(pool, productId, skuKey);
    if (!product) {
      return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
    }
    if (product.stock_mode !== "UNITS") {
      return res.status(400).json({ error: "PRODUCT_NOT_UNITS" });
    }

    let payload = {};
    if (req.body?.payload) {
      if (typeof req.body.payload === "string") {
        try {
          payload = JSON.parse(req.body.payload);
        } catch (error) {
          return res.status(400).json({ error: "PAYLOAD_INVALID_JSON" });
        }
      } else if (typeof req.body.payload === "object") {
        payload = req.body.payload;
      }
    }

    const normalizedPayload = {
      title: req.body?.title || payload.title,
      username: req.body?.username || payload.username,
      password: req.body?.password || payload.password,
      duration_value:
        req.body?.duration_value
        || req.body?.duration
        || payload.duration_value
        || payload.duration,
      duration_unit: req.body?.duration_unit || payload.duration_unit,
      notes: req.body?.notes || payload.notes,
      ...payload,
    };

    const normalizedUsername = String(normalizedPayload.username || "").trim();
    const normalizedPassword = String(normalizedPayload.password || "").trim();
    const normalizedDurationValue = String(
      normalizedPayload.duration_value || ""
    ).trim();
    const normalizedDurationUnit = String(
      normalizedPayload.duration_unit || ""
    ).trim();
    if (!normalizedUsername || !normalizedPassword || !normalizedDurationValue) {
      return res.status(400).json({ error: "UNIT_FIELDS_REQUIRED" });
    }
    if (!normalizedDurationUnit) {
      return res.status(400).json({ error: "UNIT_DURATION_UNIT_REQUIRED" });
    }
    if (normalizedUsername || normalizedPassword || normalizedDurationValue) {
      const dupRes = await pool.query(
        `SELECT 1
         FROM product_stock_units
         WHERE product_id = $1
           AND COALESCE(payload->>'username', payload->>'user', '') = $2
           AND COALESCE(payload->>'password', '') = $3
           AND COALESCE(payload->>'duration_value', payload->>'duration', '') = $4
           AND COALESCE(payload->>'duration_unit', '') = $5
         LIMIT 1`,
        [
          product.id,
          normalizedUsername,
          normalizedPassword,
          normalizedDurationValue,
          normalizedDurationUnit,
        ]
      );
      if (dupRes.rowCount > 0) {
        return res.status(409).json({ error: "DUPLICATE_IN_DB" });
      }
    }

    const payloadKey = stableStringify(normalizedPayload);
    const existingRes = await pool.query(
      `SELECT 1 FROM product_stock_units
       WHERE product_id = $1 AND payload = $2::jsonb
       LIMIT 1`,
      [product.id, normalizedPayload]
    );
    if (existingRes.rowCount > 0) {
      return res.status(409).json({ error: "DUPLICATE_IN_DB" });
    }

    const insertRes = await pool.query(
      `INSERT INTO product_stock_units (product_id, payload, status)
       VALUES ($1, $2::jsonb, 'AVAILABLE')
       RETURNING *`,
      [product.id, normalizedPayload]
    );

    await pool.query(
      `INSERT INTO audit_logs (admin_action, entity_type, entity_id, meta)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [
        "STOCK_UNITS_ADD",
        "product",
        product.id,
        JSON.stringify({
          sku_key: product.sku_key,
          payload_key: payloadKey,
        }),
      ]
    );

    return res.json({ unit: insertRes.rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.post("/stock/units/:id/delete", async (req, res, next) => {
  const unitId = req.params.id;
  const pool = getPool();

  if (!unitId) {
    return res.status(400).json({ error: "UNIT_ID_REQUIRED" });
  }

  try {
    const unitRes = await pool.query(
      `SELECT id, product_id, status, payload
       FROM product_stock_units
       WHERE id = $1`,
      [unitId]
    );
    if (unitRes.rowCount === 0) {
      return res.status(404).json({ error: "UNIT_NOT_FOUND" });
    }
    const unit = unitRes.rows[0];
    if (unit.status !== "AVAILABLE") {
      return res.status(409).json({ error: "UNIT_NOT_AVAILABLE" });
    }

    await pool.query(
      `DELETE FROM product_stock_units
       WHERE id = $1`,
      [unitId]
    );

    try {
      await pool.query(
        `INSERT INTO audit_logs (admin_action, entity_type, entity_id, meta)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [
          "STOCK_UNITS_DELETE",
          "product",
          unit.product_id,
          JSON.stringify({
            unit_id: unit.id,
            payload_key: stableStringify(unit.payload || {}),
          }),
        ]
      );
    } catch (error) {
      if (process.env.NODE_ENV !== "test") {
        console.warn("Audit log insert failed:", error?.message || error);
      }
    }

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.post("/stock/simple/set", async (req, res, next) => {
  const productId = req.body && req.body.product_id;
  const skuKey = req.body && req.body.sku_key;
  const simpleStock = req.body && req.body.stock_qty;
  const hasUniquePurchase = req.body
    && Object.prototype.hasOwnProperty.call(req.body, "unique_purchase");
  const uniquePurchase = hasUniquePurchase
    ? Boolean(req.body && req.body.unique_purchase)
    : null;
  const unlimited = Boolean(req.body && req.body.unlimited) || Boolean(uniquePurchase);
  const pool = getPool();

  if (!unlimited && (simpleStock === undefined || simpleStock === null || simpleStock === "")) {
    return res.status(400).json({ error: "STOCK_REQUIRED" });
  }

  let parsedStock = null;
  if (!unlimited) {
    parsedStock = Number(simpleStock);
    if (!Number.isFinite(parsedStock) || parsedStock < 0) {
      return res.status(400).json({ error: "STOCK_INVALID" });
    }
  }
  if (uniquePurchase) {
    parsedStock = null;
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
       SET stock_qty = $2,
           unique_purchase = COALESCE($3, unique_purchase),
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [product.id, parsedStock, uniquePurchase]
    );

    await pool.query(
      `INSERT INTO audit_logs (admin_action, entity_type, entity_id, meta)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [
        "STOCK_SIMPLE_SET",
        "product",
        product.id,
        JSON.stringify({
          stock_qty: parsedStock,
          sku_key: product.sku_key,
          unique_purchase: updateRes.rows[0].unique_purchase,
        }),
      ]
    );

    return res.json({ product: updateRes.rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.post("/products/:id/stock-mode", async (req, res, next) => {
  const productId = req.params.id;
  const mode = String(req.body?.stock_mode || "").toUpperCase();
  const pool = getPool();

  if (!productId) {
    return res.status(400).json({ error: "PRODUCT_ID_REQUIRED" });
  }
  if (mode !== "SIMPLE" && mode !== "UNITS") {
    return res.status(400).json({ error: "INVALID_STOCK_MODE" });
  }

  try {
    const updateRes = await pool.query(
      `UPDATE products
       SET stock_mode = $2, updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [productId, mode]
    );
    if (updateRes.rowCount === 0) {
      return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
    }
    await pool.query(
      `INSERT INTO audit_logs (admin_action, entity_type, entity_id, meta)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [
        "PRODUCT_STOCK_MODE_UPDATE",
        "product",
        productId,
        JSON.stringify({ stock_mode: mode }),
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

  if (status) {
    values.push(status);
    filters.push(`o.status = $${values.length}`);
    if (status !== "EXPIRED") {
      filters.push("op.id IS NOT NULL");
    }
  } else {
    filters.push(`o.status != 'EXPIRED'`);
    filters.push("op.id IS NOT NULL");
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const orderClause =
    status === "EXPIRED" ? "ORDER BY o.created_at ASC" : "ORDER BY o.created_at DESC";

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
              u.telegram_id, u.telegram_username,
              p.id AS product_id, p.code AS product_code, p.name AS product_name,
              (op.id IS NOT NULL) AS has_payment_proof
       FROM orders o
       JOIN users u ON u.id = o.user_id
       JOIN products p ON p.id = o.product_id
       LEFT JOIN order_payments op ON op.order_id = o.id
       ${whereClause}
       ${orderClause}
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

router.get("/orders/status-counts", async (req, res, next) => {
  const pool = getPool();
  try {
    const countsRes = await pool.query(
      `SELECT o.status, COUNT(*)::int AS count
       FROM orders o
       LEFT JOIN order_payments op ON op.order_id = o.id
       WHERE o.status = 'EXPIRED'
          OR (o.status != 'EXPIRED' AND op.id IS NOT NULL)
       GROUP BY o.status`
    );
    const counts = {};
    for (const row of countsRes.rows) {
      counts[row.status] = row.count || 0;
    }
    return res.json({ counts });
  } catch (error) {
    return next(error);
  }
});

router.get("/orders/:id", async (req, res, next) => {
  const orderId = req.params.id;
  const pool = getPool();

  try {
    const orderRes = await pool.query(
      `SELECT o.*, u.telegram_id, u.telegram_username,
              b.telegram_id AS banned_telegram_id,
              p.id AS product_id, p.code AS product_code,
              p.name AS product_name, p.price AS product_price
       FROM orders o
       JOIN users u ON u.id = o.user_id
       LEFT JOIN user_bans b ON b.telegram_id = u.telegram_id
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
    let commission = commissionRes.rows[0] || null;
    if (commission?.affiliate_id) {
      const affiliateRes = await pool.query(
        `SELECT u.telegram_id, u.telegram_username
         FROM affiliates a
         JOIN users u ON u.id = a.user_id
         WHERE a.id = $1`,
        [commission.affiliate_id]
      );
      const affiliateUser = affiliateRes.rows[0] || null;
      const adminIds = parseAdminTelegramIds();
      const adminId = adminIds.length > 0 ? adminIds[0] : null;
      const adminUsername = process.env.ADMIN_TELEGRAM_USERNAME || null;
      const isPlaceholderAffiliate =
        affiliateUser?.telegram_id === 90000000000
        || affiliateUser?.telegram_username === "admin_affiliate";
      commission = {
        ...commission,
        affiliate_telegram_id: isPlaceholderAffiliate
          ? adminId
          : affiliateUser?.telegram_id || null,
        affiliate_username: isPlaceholderAffiliate
          ? adminUsername
          : affiliateUser?.telegram_username || null,
      };
    }

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
        refunded_amount: order.refunded_amount,
        refunded_at: order.refunded_at,
        refund_reason: order.refund_reason,
      },
      user: {
        telegram_id: order.telegram_id,
        telegram_username: order.telegram_username,
        banned: Boolean(order.banned_telegram_id),
      },
      product: {
        id: order.product_id,
        code: order.product_code,
        name: order.product_name,
        price: order.product_price,
      },
      items,
      payment: paymentRes.rows[0] || null,
      commission,
      totals: {
        subtotal_usd: subtotalUsd,
      },
      local_total: localTotal,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/users/:telegram_id/ban-toggle", async (req, res, next) => {
  const telegramId = Number(req.params.telegram_id);
  if (!Number.isFinite(telegramId)) {
    return res.status(400).json({ error: "telegram_id is required" });
  }
  const pool = getPool();

  try {
    const banRes = await pool.query(
      "SELECT 1 FROM user_bans WHERE telegram_id = $1 LIMIT 1",
      [telegramId]
    );
    if (banRes.rowCount > 0) {
      await pool.query("DELETE FROM user_bans WHERE telegram_id = $1", [
        telegramId,
      ]);
      return res.json({ banned: false });
    }

    await pool.query(
      "INSERT INTO user_bans (telegram_id, reason) VALUES ($1, $2)",
      [telegramId, "Banned from admin panel"]
    );
    return res.json({ banned: true });
  } catch (error) {
    return next(error);
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

router.get("/orders/:id/receipt", async (req, res, next) => {
  const orderId = req.params.id;
  const pool = getPool();

  try {
    const orderRes = await pool.query(
      `SELECT o.*, u.telegram_id, u.telegram_username,
              p.name AS product_name,
              p.price AS product_price,
              op.payment_method,
              op.review_status
       FROM orders o
       JOIN users u ON u.id = o.user_id
       JOIN products p ON p.id = o.product_id
       LEFT JOIN order_payments op ON op.order_id = o.id
       WHERE o.id = $1`,
      [orderId]
    );

    if (orderRes.rowCount === 0) {
      return res.status(404).json({ error: "ORDER_NOT_FOUND" });
    }

    const order = orderRes.rows[0];
    const isApproved =
      order.status === "PAID"
      || order.status === "DELIVERED"
      || order.review_status === "APPROVED";
    if (!isApproved) {
      return res.status(400).json({ error: "ORDER_NOT_PAID" });
    }

    const paymentRes = await pool.query(
      "SELECT * FROM order_payments WHERE order_id = $1",
      [orderId]
    );
    if (paymentRes.rowCount === 0) {
      return res.status(404).json({ error: "NO_PAYMENT_PROOF" });
    }

    let items = [];
    let subtotal = Number(order.unit_price_at_purchase || 0);
    let commissionAmount = 0;
    let referredBy = "N/A";
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

    try {
      const commissionRes = await pool.query(
        `SELECT c.amount, u.telegram_username, u.telegram_id
         FROM commissions c
         JOIN affiliates a ON a.id = c.affiliate_id
         JOIN users u ON u.id = a.user_id
         WHERE c.order_id = $1`,
        [orderId]
      );
      if (commissionRes.rowCount > 0) {
        const row = commissionRes.rows[0];
        commissionAmount = Number(row.amount || 0);
        const adminIds = parseAdminTelegramIds();
        const adminId = adminIds.length > 0 ? adminIds[0] : null;
        const adminUsername = process.env.ADMIN_TELEGRAM_USERNAME || null;
        const isPlaceholderAffiliate =
          row.telegram_id === 90000000000 || row.telegram_username === "admin_affiliate";
        if (isPlaceholderAffiliate) {
          referredBy = adminUsername
            ? `@${adminUsername}`
            : adminId
            ? String(adminId)
            : "N/A";
        } else {
          referredBy = row.telegram_username
            ? `@${row.telegram_username}`
            : row.telegram_id
            ? String(row.telegram_id)
            : "N/A";
        }
      }
    } catch (err) {
      console.error("Receipt commission query failed", err);
    }

    const orderNumberText = order.order_number
      ? String(order.order_number).padStart(5, "0")
      : "-";

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

    const receiptPng = await renderReceiptPng({
      orderId: order.id,
      orderNumber: orderNumberText,
      telegramId: order.telegram_id,
      username: order.telegram_username,
      dateTime: formatBogotaDate(order.paid_at || new Date()),
      items,
      subtotal,
      commission: commissionAmount,
      total: subtotal,
      referredBy,
      localTotal,
      locale: "es",
    });

    try {
      const buffer = await fs.readFile(receiptPng.pngPath);
      res.setHeader("Content-Type", "image/png");
      res.send(buffer);
    } finally {
      await receiptPng.cleanup();
    }
  } catch (error) {
    return next(error);
  }
});

router.get("/orders/:id/receipt/download", async (req, res, next) => {
  const orderId = req.params.id;
  const pool = getPool();

  try {
    const receiptRes = await pool.query(
      `SELECT order_number
       FROM orders
       WHERE id = $1`,
      [orderId]
    );
    if (receiptRes.rowCount === 0) {
      return res.status(404).json({ error: "ORDER_NOT_FOUND" });
    }

    const receiptResponse = await pool.query(
      `SELECT o.*, u.telegram_id, u.telegram_username,
              p.name AS product_name,
              p.price AS product_price,
              op.payment_method,
              op.review_status
       FROM orders o
       JOIN users u ON u.id = o.user_id
       JOIN products p ON p.id = o.product_id
       LEFT JOIN order_payments op ON op.order_id = o.id
       WHERE o.id = $1`,
      [orderId]
    );
    if (receiptResponse.rowCount === 0) {
      return res.status(404).json({ error: "ORDER_NOT_FOUND" });
    }

    const order = receiptResponse.rows[0];
    const isApproved =
      order.status === "PAID"
      || order.status === "DELIVERED"
      || order.review_status === "APPROVED";
    if (!isApproved) {
      return res.status(400).json({ error: "ORDER_NOT_PAID" });
    }

    let items = [];
    let subtotal = Number(order.unit_price_at_purchase || 0);
    let commissionAmount = 0;
    let referredBy = "N/A";
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

    try {
      const commissionRes = await pool.query(
        `SELECT c.amount, u.telegram_username, u.telegram_id
         FROM commissions c
         JOIN affiliates a ON a.id = c.affiliate_id
         JOIN users u ON u.id = a.user_id
         WHERE c.order_id = $1`,
        [orderId]
      );
      if (commissionRes.rowCount > 0) {
        const row = commissionRes.rows[0];
        commissionAmount = Number(row.amount || 0);
        const adminIds = parseAdminTelegramIds();
        const adminId = adminIds.length > 0 ? adminIds[0] : null;
        const adminUsername = process.env.ADMIN_TELEGRAM_USERNAME || null;
        const isPlaceholderAffiliate =
          row.telegram_id === 90000000000 || row.telegram_username === "admin_affiliate";
        if (isPlaceholderAffiliate) {
          referredBy = adminUsername
            ? `@${adminUsername}`
            : adminId
            ? String(adminId)
            : "N/A";
        } else {
          referredBy = row.telegram_username
            ? `@${row.telegram_username}`
            : row.telegram_id
            ? String(row.telegram_id)
            : "N/A";
        }
      }
    } catch (err) {
      console.error("Receipt commission query failed", err);
    }

    const orderNumberText = order.order_number
      ? String(order.order_number).padStart(5, "0")
      : "-";

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

    const receiptPng = await renderReceiptPng({
      orderId: order.id,
      orderNumber: orderNumberText,
      telegramId: order.telegram_id,
      username: order.telegram_username,
      dateTime: formatBogotaDate(order.paid_at || new Date()),
      items,
      subtotal,
      commission: commissionAmount,
      total: subtotal,
      referredBy,
      localTotal,
      locale: "es",
    });

    try {
      const buffer = await fs.readFile(receiptPng.pngPath);
      const filename = `recibo-${orderNumberText}.png`;
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
    } finally {
      await receiptPng.cleanup();
    }
  } catch (error) {
    return next(error);
  }
});

router.get("/summary", async (req, res, next) => {
  const pool = getPool();

  try {
    const newOrdersRes = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM orders o
       JOIN order_payments op ON op.order_id = o.id
       WHERE o.status = 'WAITING_PAYMENT'
         AND op.review_status = 'PENDING'`
    );

    const customersRes = await pool.query(
      `SELECT COUNT(DISTINCT o.user_id)::int AS count
       FROM orders o
       WHERE o.status IN ('PAID', 'DELIVERED')`
    );

    const salesRes = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM orders o
       WHERE o.status IN ('PAID', 'DELIVERED')`
    );

    const revenueRes = await pool.query(
      `SELECT COALESCE(SUM(oi.line_total_usd), 0)::numeric AS total
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.status IN ('PAID', 'DELIVERED')`
    );

    const productsRes = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM products
       WHERE is_active = true`
    );

    const unreadTicketsRes = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM tickets t
       WHERE t.status = 'OPEN'
         AND NOT EXISTS (
           SELECT 1 FROM ticket_messages tm
           WHERE tm.ticket_id = t.id AND tm.sender = 'ADMIN'
         )`
    );

    const pendingPayoutsRes = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM payouts
       WHERE status = 'REQUESTED'`
    );

    const affiliatesRes = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM affiliates`
    );

    const pendingAffiliatesRes = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM affiliates
       WHERE status = 'PENDING'`
    );

    return res.json({
      new_orders: newOrdersRes.rows[0]?.count || 0,
      customers: customersRes.rows[0]?.count || 0,
      total_sales: salesRes.rows[0]?.count || 0,
      total_revenue_usd: Number(revenueRes.rows[0]?.total || 0).toFixed(2),
      active_products: productsRes.rows[0]?.count || 0,
      unread_tickets: unreadTicketsRes.rows[0]?.count || 0,
      pending_payouts: pendingPayoutsRes.rows[0]?.count || 0,
      affiliates: affiliatesRes.rows[0]?.count || 0,
      pending_affiliates: pendingAffiliatesRes.rows[0]?.count || 0,
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/stats/reset", async (req, res, next) => {
  const confirm = req.body?.confirm ? String(req.body.confirm).trim() : "";
  const normalized = confirm.toLowerCase();
  if (normalized !== "reset" && normalized !== "reiniciar") {
    return res.status(400).json({ error: "CONFIRM_REQUIRED" });
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE orders
       SET status = 'CANCELLED',
           paid_at = NULL,
           delivered_at = NULL,
           order_number = NULL`
    );

    await client.query(
      `UPDATE product_stock_units
       SET status = 'AVAILABLE',
           held_by_order_id = NULL,
           held_by_telegram_id = NULL,
           held_by_username = NULL,
           held_at = NULL,
           updated_at = now()
       WHERE status = 'HELD'`
    );

    await client.query(
      `UPDATE product_stock_holds
       SET status = 'EXPIRED',
           expires_at = now(),
           updated_at = now()
       WHERE status = 'HELD'`
    );

    await client.query("DELETE FROM payouts");
    await client.query("DELETE FROM commissions");
    await client.query("DELETE FROM payout_adjustments");
    await client.query("DELETE FROM affiliate_adjustments");
    await client.query("DELETE FROM affiliate_invoices");
    await client.query("DELETE FROM order_payments");
    await client.query("DELETE FROM order_items");
    await client.query("DELETE FROM ticket_messages");
    await client.query("DELETE FROM tickets");
    await client.query("DELETE FROM broadcasts");
    await client.query("SELECT setval('orders_order_number_seq', 1, false)");

    await client.query(
      `INSERT INTO audit_logs (admin_action, entity_type, meta)
       VALUES ($1, $2, $3::jsonb)`,
      ["STATS_RESET", "stats", JSON.stringify({ confirm })]
    );

    await client.query("COMMIT");
    return res.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
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
      if (order.status === "PAID" && !order.delivered_at) {
        console.log("[admin/approve] retry_delivery", { order_id: orderId });
        const deliveryResult = await deliverOrderToTelegram({
          dbClient: pool,
          orderId: order.id,
          telegramId: order.telegram_id,
        });
        if (deliveryResult.delivered) {
          await pool.query(
            `UPDATE orders
             SET status = 'DELIVERED', delivered_at = now()
             WHERE id = $1`,
            [order.id]
          );
        }
        return res.json({
          status: "delivery_retry",
          delivered: Boolean(deliveryResult.delivered),
          delivery_error: deliveryResult.error || null,
        });
      }
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
       SET status = 'PAID',
           paid_at = now(),
           order_number = COALESCE(order_number, nextval('orders_order_number_seq'))
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

      const commissionInsertRes = await client.query(
        `INSERT INTO commissions (order_id, affiliate_id, rate, amount)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (order_id) DO NOTHING`,
        [order.id, order.affiliate_id, rate, amount]
      );

      if (commissionInsertRes.rowCount > 0 && amount > 0) {
        const debtRes = await client.query(
          `SELECT affiliate_debt
           FROM affiliates
           WHERE id = $1
           FOR UPDATE`,
          [order.affiliate_id]
        );
        const debt = Number(debtRes.rows[0]?.affiliate_debt || 0);
        const appliedDebt = Math.min(debt, amount);
        if (appliedDebt > 0) {
          await client.query(
            `UPDATE affiliates
             SET affiliate_debt = affiliate_debt - $2
             WHERE id = $1`,
            [order.affiliate_id, appliedDebt]
          );
          await client.query(
            `INSERT INTO affiliate_adjustments
              (affiliate_id, amount, reason, status, created_by_admin_id)
             VALUES ($1, $2, $3, 'EARNED', NULL)`,
            [
              order.affiliate_id,
              -Number(appliedDebt.toFixed(2)),
              "Pago automatico de deuda",
            ]
          );
        }
      }

      // Commission rate is based on level + optional boost, no per-affiliate override.
    }

    await client.query("COMMIT");

    await updateAdminOrderNotifications(pool, orderId);

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

    if (order.affiliate_id) {
      try {
        const affiliateUserRes = await pool.query(
          `SELECT u.telegram_id
           FROM affiliates a
           JOIN users u ON u.id = a.user_id
           WHERE a.id = $1`,
          [order.affiliate_id]
        );
        if (affiliateUserRes.rowCount > 0) {
          const affiliateTelegramId = affiliateUserRes.rows[0].telegram_id;
          try {
            const commissionRes = await pool.query(
              `SELECT amount
               FROM commissions
               WHERE order_id = $1
                 AND affiliate_id = $2`,
              [orderId, order.affiliate_id]
            );
            if (commissionRes.rowCount > 0) {
              const commissionAmount = Number(commissionRes.rows[0].amount || 0);
              if (commissionAmount > 0) {
                const orderNumberText = updatedOrderRes.rows[0]?.order_number
                  ? String(updatedOrderRes.rows[0].order_number).padStart(5, "0")
                  : "-";
                const commissionMessage =
                  "🎉 ¡Nueva comisión generada!\n\n" +
                  "Un cliente realizó una compra usando tu enlace de afiliado y ha sido aprobada ✅\n\n" +
                  `💵 Comisión obtenida: $${commissionAmount.toFixed(2)} USD\n` +
                  `🆔 ID de orden: ${orderNumberText}\n\n` +
                  "Sigue compartiendo tu enlace y aumenta tus ganancias 🚀";
                await sendMessage(affiliateTelegramId, commissionMessage);
              }
            }
          } catch (err) {
            console.error("Affiliate commission notification failed", err);
          }
          const salesRes = await pool.query(
            `SELECT COUNT(*)::int AS count
             FROM commissions
             WHERE affiliate_id = $1
               AND status != 'REFUNDED'`,
            [order.affiliate_id]
          );
          const salesCount = salesRes.rows[0]?.count || 0;
          const earningsRes = await pool.query(
            `SELECT COALESCE(SUM(amount - COALESCE(refunded_amount, 0)), 0) AS total
             FROM commissions
             WHERE affiliate_id = $1
               AND status != 'REFUNDED'`,
            [order.affiliate_id]
          );
          const earningsTotal = Number(earningsRes.rows[0]?.total || 0);
          let rankMessage = "";
          if (salesCount === 2 && earningsTotal >= 5) {
            rankMessage =
              "🎉 ¡Felicidades! Subiste a <b>Afiliado Bronce</b> 🥉\n\n" +
              "Beneficios próximos: mejores comisiones y materiales.";
          } else if (salesCount === 20 && earningsTotal >= 50) {
            rankMessage =
              "🎉 ¡Felicidades! Subiste a <b>Afiliado Plata</b> 🥈\n\n" +
              "Beneficios próximos: mejores comisiones, bonos y materiales.";
          } else if (salesCount === 40 && earningsTotal >= 200) {
            rankMessage =
              "🏆 ¡Increíble! Subiste a <b>Afiliado Oro</b> 🥇\n\n" +
              "Beneficios próximos: comisiones VIP, prioridad y bonos especiales.";
          } else if (salesCount === 70 && earningsTotal >= 500) {
            rankMessage =
              "💎 ¡Excelente! Subiste a <b>Afiliado Diamante</b> 💎\n\n" +
              "Beneficios próximos: bonos premium y soporte prioritario.";
          } else if (salesCount === 100 && earningsTotal >= 600) {
            rankMessage =
              "👑 ¡Legendario! Subiste a <b>Afiliado Elite</b> 👑\n\n" +
              "Beneficios próximos: recompensas elite y beneficios exclusivos.";
          }
          if (rankMessage) {
            await sendMessage(affiliateTelegramId, rankMessage, { parse_mode: "HTML" });
          }
        }
      } catch (err) {
        console.error("Affiliate rank notification failed", err);
      }
    }

    try {
      let items = [];
      let subtotal = Number(order.unit_price_at_purchase || 0);
      let commissionAmount = 0;
      let referredBy = "N/A";
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

      try {
        const commissionRes = await pool.query(
          `SELECT c.amount, u.telegram_username, u.telegram_id
           FROM commissions c
           JOIN affiliates a ON a.id = c.affiliate_id
           JOIN users u ON u.id = a.user_id
           WHERE c.order_id = $1`,
          [orderId]
        );
        if (commissionRes.rowCount > 0) {
          const row = commissionRes.rows[0];
          commissionAmount = Number(row.amount || 0);
          const adminIds = parseAdminTelegramIds();
          const adminId = adminIds.length > 0 ? adminIds[0] : null;
          const adminUsername = process.env.ADMIN_TELEGRAM_USERNAME || null;
          const isPlaceholderAffiliate =
            row.telegram_id === 90000000000 || row.telegram_username === "admin_affiliate";
          if (isPlaceholderAffiliate) {
            referredBy = adminUsername ? `@${adminUsername}` : adminId ? String(adminId) : "N/A";
          } else {
            referredBy = row.telegram_username
              ? `@${row.telegram_username}`
              : row.telegram_id
              ? String(row.telegram_id)
              : "N/A";
          }
        }
      } catch (err) {
        console.error("Receipt commission query failed", err);
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
        subtotal,
        localTotal,
        commissionAmount,
        referredBy
      );

      const receiptPng = await renderReceiptPng({
        orderId: order.id,
        orderNumber: orderNumberText,
        telegramId,
        username: order.telegram_username,
        dateTime: formatBogotaDate(order.paid_at || new Date()),
        items,
        subtotal,
        commission: commissionAmount,
        total: subtotal,
        referredBy,
        localTotal,
        locale: userLocale,
      });

      try {
        try {
          await sendPhoto(telegramId, { path: receiptPng.pngPath });
        } catch (photoError) {
          console.error("Telegram receipt photo failed", photoError);
          await sendDocument(telegramId, { path: receiptPng.pngPath });
        }
      } finally {
        await receiptPng.cleanup();
      }
    } catch (err) {
      console.error("Telegram receipt failed", err);
      if (err && err.message === "playwright_not_installed") {
        console.error("Playwright browsers missing. Run: npx playwright install");
      }
      try {
        await sendMessage(telegramId, receipt);
      } catch (fallbackError) {
        console.error("Telegram receipt fallback failed", fallbackError);
      }
    }

    try {
      const notice =
        userLocale === "en"
          ? "⌚️ You will receive your content shortly."
          : "⌚️ En breve momento estarás recibiendo tu contenido.";
      await sendMessage(telegramId, notice);
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

router.post("/orders/:id/refund", async (req, res, next) => {
  const orderId = req.params.id;
  const { amount, reason } = req.body || {};
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const orderRes = await client.query(
      `SELECT o.*, u.telegram_id, u.telegram_username, u.locale
       FROM orders o
       JOIN users u ON u.id = o.user_id
       WHERE o.id = $1
       FOR UPDATE OF o`,
      [orderId]
    );

    if (orderRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "ORDER_NOT_FOUND" });
    }

    const order = orderRes.rows[0];
    if (order.status !== "PAID" && order.status !== "DELIVERED") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "ORDER_NOT_REFUNDABLE" });
    }

    const orderTotal = await getOrderTotalUsd(
      client,
      orderId,
      order.unit_price_at_purchase || order.product_price
    );

    if (!orderTotal || orderTotal <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "ORDER_TOTAL_INVALID" });
    }

    const alreadyRefunded = Number(order.refunded_amount || 0);
    const remaining = Number((orderTotal - alreadyRefunded).toFixed(2));
    if (remaining <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "ORDER_ALREADY_REFUNDED" });
    }

    let refundAmount = remaining;
    if (amount !== undefined && amount !== null && amount !== "") {
      const parsedAmount = Number(amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "INVALID_REFUND_AMOUNT" });
      }
      refundAmount = Math.min(parsedAmount, remaining);
    }

    refundAmount = Number(refundAmount.toFixed(2));
    if (refundAmount <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "INVALID_REFUND_AMOUNT" });
    }

    const newRefundedAmount = Number((alreadyRefunded + refundAmount).toFixed(2));
    const fullyRefunded = newRefundedAmount >= orderTotal - 0.01;
    const refundType = fullyRefunded ? "FULL" : "PARTIAL";

    const commissionRes = await client.query(
      `SELECT c.*, a.user_id AS affiliate_user_id
       FROM commissions c
       JOIN affiliates a ON a.id = c.affiliate_id
       WHERE c.order_id = $1
       FOR UPDATE OF c`,
      [orderId]
    );

    let commissionRefunded = 0;
    let affiliateUserId = null;

    if (commissionRes.rowCount > 0) {
      const commission = commissionRes.rows[0];
      affiliateUserId = commission.affiliate_user_id;

      if (Number(commission.reserved_amount || 0) > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "COMMISSION_RESERVED" });
      }

      const commissionAmount = Number(commission.amount || 0);
      const currentRefunded = Number(commission.refunded_amount || 0);
      const refundRatio = refundAmount / orderTotal;
      const rawCommissionRefund = commissionAmount * refundRatio;
      const refundForCommission = Number(rawCommissionRefund.toFixed(2));
      const remainingCommission = Math.max(commissionAmount - currentRefunded, 0);
      const appliedRefund = Math.min(remainingCommission, refundForCommission);

      if (appliedRefund > 0) {
        commissionRefunded = Number(appliedRefund.toFixed(2));
        const updatedRefunded = Number((currentRefunded + commissionRefunded).toFixed(2));
        const commissionFullyRefunded = updatedRefunded >= commissionAmount - 0.01;

        await client.query(
          `UPDATE commissions
           SET refunded_amount = $2,
               refunded_at = now(),
               refund_reason = $3,
               status = CASE
                 WHEN $4 THEN 'REFUNDED'
                 ELSE status
               END
           WHERE id = $1`,
          [commission.id, updatedRefunded, reason || null, commissionFullyRefunded]
        );

        const paidOutAmount = Number(commission.paid_out_amount || 0);
        const refundDebt = Math.min(commissionRefunded, paidOutAmount);
        if (refundDebt > 0) {
          await client.query(
            `UPDATE affiliates
             SET affiliate_debt = affiliate_debt + $2
             WHERE id = $1`,
            [commission.affiliate_id, refundDebt]
          );
        }
      }
    }

    await client.query(
      `UPDATE orders
       SET refunded_amount = $2,
           refund_reason = $3,
           refunded_at = CASE WHEN $4 THEN now() ELSE refunded_at END,
           status = CASE WHEN $4 THEN 'REFUNDED' ELSE status END
       WHERE id = $1`,
      [orderId, newRefundedAmount, reason || null, fullyRefunded]
    );

    await client.query(
      `INSERT INTO order_refunds (order_id, amount, refund_type, reason, refunded_by_admin)
       VALUES ($1, $2, $3, $4, $5)`,
      [orderId, refundAmount, refundType, reason || null, req.admin?.sub || null]
    );

    await client.query(
      `INSERT INTO audit_logs (admin_action, entity_type, entity_id, meta)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [
        "ORDER_REFUND",
        "order",
        orderId,
        JSON.stringify({
          admin: req.admin?.sub || null,
          amount: refundAmount,
          refund_type: refundType,
          commission_refund: commissionRefunded,
        }),
      ]
    );

    await client.query("COMMIT");

    const locale = order.locale || "es";
    const refundMessage =
      (MESSAGES[locale]?.[fullyRefunded ? "refund_full" : "refund_partial"]
        || MESSAGES.es[fullyRefunded ? "refund_full" : "refund_partial"])
        .replace("{amount}", formatUsdWithCurrency(refundAmount));

    try {
      await sendMessage(order.telegram_id, refundMessage);
    } catch (err) {
      console.error("Customer refund notification failed", err);
    }

    if (affiliateUserId && commissionRefunded > 0) {
      try {
        const affiliateUserRes = await pool.query(
          "SELECT telegram_id, locale FROM users WHERE id = $1",
          [affiliateUserId]
        );
        if (affiliateUserRes.rowCount > 0) {
          const affiliateRow = affiliateUserRes.rows[0];
          const affiliateLocale = affiliateRow.locale || "es";
          const affiliateMessage =
            (AFFILIATE_MESSAGES[affiliateLocale]?.[
              fullyRefunded ? "refund_full" : "refund_partial"
            ] || AFFILIATE_MESSAGES.es[fullyRefunded ? "refund_full" : "refund_partial"])
              .replace("{amount}", formatUsdWithCurrency(commissionRefunded));
          await sendMessage(affiliateRow.telegram_id, affiliateMessage);
        }
      } catch (err) {
        console.error("Affiliate refund notification failed", err);
      }
    }

    return res.json({
      ok: true,
      refund: {
        order_id: orderId,
        amount: refundAmount,
        refund_type: refundType,
        commission_refund: commissionRefunded,
        fully_refunded: fullyRefunded,
      },
    });
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
       SET status = $2::order_status,
           cancelled_at = CASE WHEN $2::order_status = 'CANCELLED'::order_status THEN now() ELSE cancelled_at END,
           cancel_source = CASE WHEN $2::order_status = 'CANCELLED'::order_status THEN 'ADMIN' ELSE cancel_source END,
           order_number = CASE
             WHEN $2::order_status = 'CANCELLED'::order_status
             THEN COALESCE(order_number, nextval('orders_order_number_seq'))
             ELSE order_number
           END
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

    await updateAdminOrderNotifications(pool, orderId);

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
      `WITH ranked AS (
         SELECT id,
                ROW_NUMBER() OVER (ORDER BY approved_at, id) AS affiliate_number
         FROM affiliates
         WHERE approved_at IS NOT NULL
       )
       SELECT a.id, a.status, a.commission_rate,
              a.wallet_usdt_bsc, a.binance_id,
              a.created_at, a.approved_at,
              u.telegram_id, u.telegram_username,
              ranked.affiliate_number,
              COALESCE(SUM(
                GREATEST(
                  (c.amount - COALESCE(c.refunded_amount, 0))
                  - COALESCE(c.reserved_amount, 0)
                  - COALESCE(c.paid_out_amount, 0),
                  0
                )
              ) FILTER (WHERE c.status != 'REFUNDED'), 0)
                + COALESCE(adj.adjustments_total, 0) AS available_balance,
              COALESCE(SUM(c.amount - COALESCE(c.refunded_amount, 0)), 0)
                + COALESCE(adj_all.adjustments_total, 0) AS earnings_total,
              COALESCE(SUM(CASE WHEN c.id IS NULL THEN 0 ELSE COALESCE(oi.sale_qty, 1) END), 0)::int AS sales_count,
              MAX(c.earned_at) AS last_sale_at
       FROM affiliates a
       JOIN users u ON u.id = a.user_id
       LEFT JOIN ranked ON ranked.id = a.id
       LEFT JOIN (
         SELECT affiliate_id,
                COALESCE(SUM(
                  CASE
                    WHEN amount > 0 THEN GREATEST(
                      amount
                      - COALESCE(reserved_amount, 0)
                      - COALESCE(paid_out_amount, 0),
                      0
                    )
                    ELSE amount
                  END
                ), 0) AS adjustments_total
         FROM affiliate_adjustments
         GROUP BY affiliate_id
       ) adj ON adj.affiliate_id = a.id
       LEFT JOIN (
         SELECT affiliate_id, COALESCE(SUM(amount), 0) AS adjustments_total
         FROM affiliate_adjustments
         GROUP BY affiliate_id
       ) adj_all ON adj_all.affiliate_id = a.id
       LEFT JOIN commissions c ON c.affiliate_id = a.id AND c.status != 'REFUNDED'
       LEFT JOIN (
         SELECT order_id, COALESCE(SUM(qty), 0) AS sale_qty
         FROM order_items
         GROUP BY order_id
       ) oi ON oi.order_id = c.order_id
       ${whereClause}
       GROUP BY a.id, u.telegram_id, u.telegram_username, ranked.affiliate_number, adj.adjustments_total, adj_all.adjustments_total
       ORDER BY a.created_at ASC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, offset]
    );

    const adminIds = parseAdminTelegramIds();
    const adminId = adminIds.length > 0 ? adminIds[0] : null;
    const adminUsername = process.env.ADMIN_TELEGRAM_USERNAME || null;
    const items = listRes.rows.map((row) => {
      const isPlaceholderAffiliate =
        row.telegram_id === 90000000000 || row.telegram_username === "admin_affiliate";
      if (!isPlaceholderAffiliate) {
        return row;
      }
      return {
        ...row,
        telegram_id: adminId || row.telegram_id,
        telegram_username: adminUsername || row.telegram_username,
      };
    });
    res.json({
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

router.get("/affiliates/commission-rate", async (req, res, next) => {
  const pool = getPool();
  try {
    await ensureGlobalCommissionSchema(pool);
    const boostRes = await pool.query(
      `SELECT rate, active, ends_at
       FROM global_commission_boost
       WHERE id = 1`
    );
    const boostRow = boostRes.rows[0] || {};
    const boostEndsAt = boostRow.ends_at || null;
    const boostActive = Boolean(boostRow.active);
    if (boostActive && boostEndsAt) {
      const endsAtDate = new Date(boostEndsAt);
      if (Number.isFinite(endsAtDate.getTime()) && endsAtDate.getTime() <= Date.now()) {
        await resetGlobalCommission(pool, "AUTO");
      } else {
        await scheduleGlobalCommissionReset(pool, boostEndsAt);
      }
    }
    const defaultRes = await pool.query(
      `SELECT column_default
       FROM information_schema.columns
       WHERE table_name = 'affiliates' AND column_name = 'commission_rate'`
    );
    let rate = null;
    if (defaultRes.rowCount > 0) {
      const raw = defaultRes.rows[0].column_default || "";
      const match = String(raw).match(/([0-9]+(?:\.[0-9]+)?)/);
      if (match) {
        rate = Number(match[1]);
      }
    }
    if (rate === null) {
      const fallbackRes = await pool.query(
        `SELECT commission_rate
         FROM affiliates
         ORDER BY created_at ASC
         LIMIT 1`
      );
      if (fallbackRes.rowCount > 0) {
        rate = Number(fallbackRes.rows[0].commission_rate || 0);
      }
    }
    const ratePercent = rate != null ? Number((rate * 100).toFixed(2)) : null;
    return res.json({
      rate: rate ?? null,
      rate_percent: ratePercent,
      boost_active: boostActive,
      boost_ends_at: boostEndsAt,
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/users/:telegram_id/photo", async (req, res, next) => {
  const telegramId = Number(req.params.telegram_id);
  if (!Number.isFinite(telegramId)) {
    return res.status(400).json({ error: "INVALID_TELEGRAM_ID" });
  }
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return res.status(500).json({ error: "BOT_TOKEN_NOT_CONFIGURED" });
  }
  try {
    const pool = getPool();
    const userRes = await pool.query(
      "SELECT telegram_photo_file_id FROM users WHERE telegram_id = $1",
      [telegramId]
    );
    const fileId = userRes.rows[0]?.telegram_photo_file_id || null;
    if (!fileId) {
      return res.status(404).json({ error: "PHOTO_NOT_FOUND" });
    }
    const fileRes = await fetch(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(
        fileId
      )}`
    );
    if (!fileRes.ok) {
      return res.status(502).json({ error: "TELEGRAM_GETFILE_FAILED" });
    }
    const filePayload = await fileRes.json();
    const filePath = filePayload?.result?.file_path;
    if (!filePath) {
      return res.status(404).json({ error: "PHOTO_PATH_NOT_FOUND" });
    }
    const photoRes = await fetch(
      `https://api.telegram.org/file/bot${botToken}/${filePath}`
    );
    if (!photoRes.ok) {
      return res.status(502).json({ error: "TELEGRAM_PHOTO_FAILED" });
    }
    const buffer = Buffer.from(await photoRes.arrayBuffer());
    const contentType =
      photoRes.headers.get("content-type") || "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.send(buffer);
  } catch (error) {
    return next(error);
  }
});

router.post("/affiliates/commission-rate", async (req, res, next) => {
  const {
    commission_rate: commissionRateInput,
    duration_minutes: durationMinutesInput,
  } = req.body || {};
  let commissionRate = null;
  if (commissionRateInput !== undefined && commissionRateInput !== null && commissionRateInput !== "") {
    const rateValue = Number(commissionRateInput);
    if (!Number.isFinite(rateValue) || rateValue < 0) {
      return res.status(400).json({ error: "INVALID_COMMISSION_RATE" });
    }
    commissionRate = rateValue > 1 ? rateValue / 100 : rateValue;
  }
  if (commissionRate === null) {
    return res.status(400).json({ error: "COMMISSION_RATE_REQUIRED" });
  }
  const durationMinutes = Number(durationMinutesInput);
  if (!Number.isFinite(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) {
    return res.status(400).json({ error: "INVALID_DURATION" });
  }
  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensureGlobalCommissionSchema(pool);
    await client.query("BEGIN");
    const previousRes = await client.query(
      `SELECT commission_rate
       FROM affiliates
       ORDER BY created_at ASC
       LIMIT 1`
    );
    const previousRate = Number(previousRes.rows[0]?.commission_rate || 0);
    await client.query(
      "UPDATE affiliates SET commission_rate = $1",
      [commissionRate]
    );
    await client.query(
      `ALTER TABLE affiliates ALTER COLUMN commission_rate SET DEFAULT ${commissionRate}`
    );
    const endsAt = commissionRate > 0
      ? new Date(Date.now() + durationMinutes * 60 * 1000)
      : null;
    await client.query(
      `UPDATE global_commission_boost
       SET rate = $1,
           active = $2,
           ends_at = $3,
           updated_at = now()
       WHERE id = 1`,
      [commissionRate, commissionRate > 0, endsAt]
    );
    await client.query("COMMIT");
    await scheduleGlobalCommissionReset(pool, endsAt);
    const ratePercent = Number((commissionRate * 100).toFixed(2));
    const previousPercent = Number((previousRate * 100).toFixed(2));
    try {
      let message = "";
      if (commissionRate > 0) {
        const hours = Math.floor(durationMinutes / 60);
        const minutes = durationMinutes % 60;
        const durationText =
          hours > 0 && minutes > 0
            ? `${hours}h ${minutes}m`
            : hours > 0
            ? `${hours}h`
            : `${minutes}m`;
        message =
          `🚀 BOOST ACTIVADO\n\n` +
          `Porcentaje extra por venta: +${ratePercent}%\n` +
          `Duración: ${durationText}\n\n` +
          `Aplica a todas tus ventas mientras esté activo.`;
      } else if (previousRate > 0) {
        message =
          `✅ BOOST FINALIZADO\n\n` +
          `Tus comisiones vuelven a tu porcentaje habitual por nivel.`;
      }
      if (message) {
        await notifyAffiliates(pool, message);
      }
    } catch (err) {
      // ignore broadcast errors
    }
    return res.json({
      ok: true,
      commission_rate: commissionRate,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
});

router.post("/affiliates/commission-rate/stop", async (req, res, next) => {
  const pool = getPool();
  try {
    await ensureGlobalCommissionSchema(pool);
    await resetGlobalCommission(pool, "STOPPED");
    await scheduleGlobalCommissionReset(pool, null);
    return res.json({ ok: true, commission_rate: 0 });
  } catch (error) {
    return next(error);
  }
});

router.post("/affiliates", async (req, res, next) => {
  const {
    telegram_id: telegramIdInput,
    telegram_username: telegramUsername,
    status,
    commission_rate: commissionRateInput,
    wallet_usdt_bsc: walletUsdtBsc,
    binance_id: binanceId,
  } = req.body || {};
  const telegramId = Number(telegramIdInput);
  const pool = getPool();

  if (!Number.isFinite(telegramId)) {
    return res.status(400).json({ error: "TELEGRAM_ID_REQUIRED" });
  }
  if (walletUsdtBsc && binanceId) {
    return res.status(400).json({ error: "ONLY_ONE_METHOD_ALLOWED" });
  }
  const resolvedWalletUsdtBsc = walletUsdtBsc || null;
  const resolvedBinanceId = binanceId || null;
  const finalWalletUsdtBsc = resolvedBinanceId ? null : resolvedWalletUsdtBsc;
  const finalBinanceId = resolvedWalletUsdtBsc ? null : resolvedBinanceId;

  const allowedStatuses = ["PENDING", "APPROVED", "REJECTED"];
  const normalizedStatus = status ? String(status).toUpperCase() : "PENDING";
  if (!allowedStatuses.includes(normalizedStatus)) {
    return res.status(400).json({ error: "INVALID_STATUS" });
  }

  let commissionRate = null;
  if (commissionRateInput !== undefined && commissionRateInput !== null && commissionRateInput !== "") {
    const rateValue = Number(commissionRateInput);
    if (!Number.isFinite(rateValue) || rateValue < 0) {
      return res.status(400).json({ error: "INVALID_COMMISSION_RATE" });
    }
    commissionRate = rateValue > 1 ? rateValue / 100 : rateValue;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const userRes = await client.query(
      `INSERT INTO users (telegram_id, telegram_username)
       VALUES ($1, $2)
       ON CONFLICT (telegram_id)
       DO UPDATE SET telegram_username = COALESCE(EXCLUDED.telegram_username, users.telegram_username)
       RETURNING id`,
      [telegramId, telegramUsername || null]
    );
    const userId = userRes.rows[0].id;

    const existingRes = await client.query(
      "SELECT id FROM affiliates WHERE user_id = $1",
      [userId]
    );
    if (existingRes.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "AFFILIATE_ALREADY_EXISTS" });
    }

    const affiliateRes = await client.query(
      `INSERT INTO affiliates (user_id, status, commission_rate, wallet_usdt_bsc, binance_id, approved_at)
       VALUES ($1, $2, COALESCE($3, commission_rate), $4, $5,
         CASE WHEN $2 = 'APPROVED' THEN now() ELSE NULL END)
       RETURNING *`,
      [userId, normalizedStatus, commissionRate, finalWalletUsdtBsc, finalBinanceId]
    );

    await client.query("COMMIT");
    return res.status(201).json({ affiliate: affiliateRes.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
});

router.get("/affiliates/:id", async (req, res, next) => {
  const affiliateId = req.params.id;
  const pool = getPool();

  try {
    const affiliateRes = await pool.query(
      `WITH ranked AS (
         SELECT id,
                ROW_NUMBER() OVER (ORDER BY approved_at, id) AS affiliate_number
         FROM affiliates
         WHERE approved_at IS NOT NULL
       )
       SELECT a.*, u.telegram_id, u.telegram_username,
              ranked.affiliate_number,
              COALESCE(SUM(c.amount - COALESCE(c.refunded_amount, 0)), 0)
                + COALESCE(adj_all.adjustments_total, 0) AS earnings_total,
              COALESCE(SUM(CASE WHEN c.id IS NULL THEN 0 ELSE COALESCE(oi.sale_qty, 1) END), 0)::int AS sales_count,
              MAX(c.earned_at) AS last_sale_at
       FROM affiliates a
       JOIN users u ON u.id = a.user_id
       LEFT JOIN ranked ON ranked.id = a.id
       LEFT JOIN (
         SELECT affiliate_id, COALESCE(SUM(amount), 0) AS adjustments_total
         FROM affiliate_adjustments
         GROUP BY affiliate_id
       ) adj_all ON adj_all.affiliate_id = a.id
       LEFT JOIN commissions c ON c.affiliate_id = a.id AND c.status != 'REFUNDED'
       LEFT JOIN (
         SELECT order_id, COALESCE(SUM(qty), 0) AS sale_qty
         FROM order_items
         GROUP BY order_id
       ) oi ON oi.order_id = c.order_id
       WHERE a.id = $1
       GROUP BY a.id, u.telegram_id, u.telegram_username, ranked.affiliate_number, adj_all.adjustments_total`,
      [affiliateId]
    );

    if (affiliateRes.rowCount === 0) {
      return res.status(404).json({ error: "AFFILIATE_NOT_FOUND" });
    }

    const balanceRes = await pool.query(
      `SELECT COALESCE(SUM(
        GREATEST(
          (amount - COALESCE(refunded_amount, 0))
          - COALESCE(reserved_amount, 0)
          - COALESCE(paid_out_amount, 0),
          0
        )
      ), 0) AS available_balance
       FROM commissions
       WHERE affiliate_id = $1 AND status != 'REFUNDED'`,
      [affiliateId]
    );

    const adjustmentsRes = await pool.query(
      `SELECT COALESCE(SUM(
        CASE
          WHEN amount > 0 THEN GREATEST(
            amount
            - COALESCE(reserved_amount, 0)
            - COALESCE(paid_out_amount, 0),
            0
          )
          ELSE amount
        END
      ), 0) AS adjustments_total
       FROM affiliate_adjustments
       WHERE affiliate_id = $1`,
      [affiliateId]
    );

    const adjustmentsListRes = await pool.query(
      `SELECT id,
              amount,
              reason,
              status,
              created_by_admin_id,
              created_at
       FROM affiliate_adjustments
       WHERE affiliate_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [affiliateId]
    );

    await pool.query(
      `UPDATE affiliate_invoices
       SET status = 'EXPIRED', expired_at = now()
       WHERE affiliate_id = $1
         AND status = 'PENDING'
         AND COALESCE(expires_at, created_at + interval '10 minutes') <= now()`,
      [affiliateId]
    );

    const invoicesRes = await pool.query(
      `SELECT id,
              amount,
              reason,
              status,
              created_by_admin_id,
              created_at,
              paid_at,
              cancelled_at,
              expires_at,
              expired_at
       FROM affiliate_invoices
       WHERE affiliate_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [affiliateId]
    );

    const commissionsRes = await pool.query(
      `SELECT c.id,
              c.order_id,
              c.amount,
              c.refunded_amount,
              c.status,
              c.earned_at,
              c.paid_out_at,
              op.reviewed_by_admin_at AS payment_approved_at,
              o.order_number,
              u.telegram_id AS buyer_telegram_id,
              u.telegram_username AS buyer_username
       FROM commissions c
       LEFT JOIN orders o ON o.id = c.order_id
       LEFT JOIN order_payments op ON op.order_id = o.id
       LEFT JOIN users u ON u.id = o.user_id
       WHERE c.affiliate_id = $1
       ORDER BY c.earned_at DESC
       LIMIT 50`,
      [affiliateId]
    );

    const rankRes = await pool.query(
      `WITH sales AS (
         SELECT a.id,
                COALESCE(SUM(CASE WHEN c.id IS NULL THEN 0 ELSE COALESCE(oi.sale_qty, 1) END), 0)::int AS sales_count
         FROM affiliates a
         LEFT JOIN commissions c ON c.affiliate_id = a.id AND c.status != 'REFUNDED'
         LEFT JOIN (
           SELECT order_id, COALESCE(SUM(qty), 0) AS sale_qty
           FROM order_items
           GROUP BY order_id
       ) oi ON oi.order_id = c.order_id
       GROUP BY a.id
      ),
       ranked AS (
         SELECT id,
                sales_count,
                RANK() OVER (ORDER BY sales_count DESC, id) AS sales_rank
         FROM sales
       )
       SELECT sales_rank FROM ranked WHERE id = $1`,
      [affiliateId]
    );

    const streakRes = await pool.query(
      `SELECT DISTINCT date_trunc('day', earned_at)::date AS day
       FROM commissions
       WHERE affiliate_id = $1
         AND status != 'REFUNDED'
       ORDER BY day DESC`,
      [affiliateId]
    );

    const referralsRes = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM users
       WHERE referred_by_affiliate_id = $1`,
      [affiliateId]
    );

    const salesTodayRes = await pool.query(
      `SELECT COALESCE(SUM(COALESCE(oi.sale_qty, 1)), 0)::int AS count
       FROM commissions c
       LEFT JOIN (
         SELECT order_id, COALESCE(SUM(qty), 0) AS sale_qty
         FROM order_items
         GROUP BY order_id
       ) oi ON oi.order_id = c.order_id
       WHERE c.affiliate_id = $1
         AND c.status != 'REFUNDED'
         AND c.earned_at >= date_trunc('day', now())`,
      [affiliateId]
    );

    const salesWeekRes = await pool.query(
      `SELECT COALESCE(SUM(COALESCE(oi.sale_qty, 1)), 0)::int AS count
       FROM commissions c
       LEFT JOIN (
         SELECT order_id, COALESCE(SUM(qty), 0) AS sale_qty
         FROM order_items
         GROUP BY order_id
       ) oi ON oi.order_id = c.order_id
       WHERE c.affiliate_id = $1
         AND c.status != 'REFUNDED'
         AND c.earned_at >= now() - interval '7 days'`,
      [affiliateId]
    );

    const salesMonthRes = await pool.query(
      `SELECT COALESCE(SUM(COALESCE(oi.sale_qty, 1)), 0)::int AS count
       FROM commissions c
       LEFT JOIN (
         SELECT order_id, COALESCE(SUM(qty), 0) AS sale_qty
         FROM order_items
         GROUP BY order_id
       ) oi ON oi.order_id = c.order_id
       WHERE c.affiliate_id = $1
         AND c.status != 'REFUNDED'
         AND c.earned_at >= now() - interval '30 days'`,
      [affiliateId]
    );

    const row = affiliateRes.rows[0];

    const streakDays = [];
    for (const streakRow of streakRes.rows) {
      if (streakRow.day) {
        streakDays.push(streakRow.day);
      }
    }
    let streakCount = 0;
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daySet = new Set(streakDays.map((day) => new Date(day).getTime()));
      let cursor = today;
      while (daySet.has(cursor.getTime())) {
        streakCount += 1;
        cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
      }
    } catch (err) {
      streakCount = 0;
    }

    const adminIds = parseAdminTelegramIds();
    const adminId = adminIds.length > 0 ? adminIds[0] : null;
    const adminUsername = process.env.ADMIN_TELEGRAM_USERNAME || null;
    const isPlaceholderAffiliate =
      row.telegram_id === 90000000000 || row.telegram_username === "admin_affiliate";
    const displayTelegramId = isPlaceholderAffiliate ? adminId : row.telegram_id;
    const displayUsername = isPlaceholderAffiliate ? adminUsername : row.telegram_username;

    return res.json({
      affiliate: {
        ...row,
        sales_rank: rankRes.rows[0]?.sales_rank || null,
        daily_streak: streakCount,
        referrals_total: referralsRes.rows[0]?.count || 0,
        sales_today: salesTodayRes.rows[0]?.count || 0,
        sales_week: salesWeekRes.rows[0]?.count || 0,
        sales_month: salesMonthRes.rows[0]?.count || 0,
      },
      user: {
        telegram_id: displayTelegramId,
        telegram_username: displayUsername,
      },
      available_balance:
        Number(balanceRes.rows[0].available_balance || 0)
        + Number(adjustmentsRes.rows[0].adjustments_total || 0),
      adjustments: adjustmentsListRes.rows,
      invoices: invoicesRes.rows,
      commissions: commissionsRes.rows,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/affiliates/:id/invoices/watch", async (req, res, next) => {
  const affiliateId = req.params.id;
  const pool = getPool();
  const sinceRaw = req.query.since;
  const sinceMs = Number(sinceRaw);
  const sinceDate =
    Number.isFinite(sinceMs) && sinceMs > 0 ? new Date(sinceMs) : new Date(0);
  const timeoutMs = 20000;
  const intervalMs = 1000;
  const startedAt = Date.now();

  try {
    await pool.query(
      `UPDATE affiliate_invoices
       SET status = 'EXPIRED', expired_at = now()
       WHERE affiliate_id = $1
         AND status = 'PENDING'
         AND COALESCE(expires_at, created_at + interval '10 minutes') <= now()`,
      [affiliateId]
    );
    while (Date.now() - startedAt < timeoutMs) {
      const watchRes = await pool.query(
        `SELECT id,
                affiliate_id,
                amount,
                reason,
                status,
                created_at,
                paid_at,
                cancelled_at,
                expires_at,
                expired_at
         FROM affiliate_invoices
         WHERE affiliate_id = $1
           AND status IN ('PAID', 'CANCELLED', 'EXPIRED')
           AND COALESCE(paid_at, cancelled_at, expired_at, created_at) > $2
         ORDER BY COALESCE(paid_at, cancelled_at, expired_at, created_at) DESC
         LIMIT 1`,
        [affiliateId, sinceDate]
      );

      if (watchRes.rowCount > 0) {
        return res.json({ changed: true, invoice: watchRes.rows[0] });
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    return res.json({ changed: false });
  } catch (error) {
    return next(error);
  }
});

router.patch("/affiliates/:id", async (req, res, next) => {
  const affiliateId = req.params.id;
  const {
    status,
    commission_rate: commissionRateInput,
    wallet_usdt_bsc: walletUsdtBsc,
    binance_id: binanceId,
  } = req.body || {};
  const pool = getPool();
  if (walletUsdtBsc && binanceId) {
    return res.status(400).json({ error: "ONLY_ONE_METHOD_ALLOWED" });
  }

  const allowedStatuses = ["PENDING", "APPROVED", "REJECTED"];
  let normalizedStatus = null;
  if (status !== undefined && status !== null && status !== "") {
    normalizedStatus = String(status).toUpperCase();
    if (!allowedStatuses.includes(normalizedStatus)) {
      return res.status(400).json({ error: "INVALID_STATUS" });
    }
  }

  let commissionRate = null;
  if (commissionRateInput !== undefined && commissionRateInput !== null && commissionRateInput !== "") {
    const rateValue = Number(commissionRateInput);
    if (!Number.isFinite(rateValue) || rateValue < 0) {
      return res.status(400).json({ error: "INVALID_COMMISSION_RATE" });
    }
    commissionRate = rateValue > 1 ? rateValue / 100 : rateValue;
  }
  const resolvedWalletUsdtBsc = walletUsdtBsc !== undefined ? walletUsdtBsc : null;
  const resolvedBinanceId = binanceId !== undefined ? binanceId : null;
  const finalWalletUsdtBsc = resolvedBinanceId ? null : resolvedWalletUsdtBsc;
  const finalBinanceId = resolvedWalletUsdtBsc ? null : resolvedBinanceId;

  try {
    const userRes = await pool.query(
      `SELECT a.status, u.telegram_id, u.telegram_username
       FROM affiliates a
       JOIN users u ON u.id = a.user_id
       WHERE a.id = $1`,
      [affiliateId]
    );

    if (userRes.rowCount === 0) {
      return res.status(404).json({ error: "AFFILIATE_NOT_FOUND" });
    }

    const previousStatus = userRes.rows[0].status;
    const telegramId = userRes.rows[0].telegram_id;
    const telegramUsername = userRes.rows[0].telegram_username;

    const updateRes = await pool.query(
      `UPDATE affiliates
       SET status = COALESCE($2, status),
           commission_rate = COALESCE($3, commission_rate),
           wallet_usdt_bsc = CASE
             WHEN $4::text IS NULL AND $5::text IS NULL THEN wallet_usdt_bsc
             WHEN $4::text IS NOT NULL THEN $4::text
             WHEN $5::text IS NOT NULL THEN NULL
             ELSE wallet_usdt_bsc
           END,
           binance_id = CASE
             WHEN $4::text IS NULL AND $5::text IS NULL THEN binance_id
             WHEN $5::text IS NOT NULL THEN $5::text
             WHEN $4::text IS NOT NULL THEN NULL
             ELSE binance_id
           END,
           approved_at = CASE
             WHEN $2 = 'APPROVED' THEN COALESCE(approved_at, now())
             WHEN $2 = 'PENDING' THEN NULL
             WHEN $2 = 'REJECTED' THEN approved_at
             ELSE approved_at
           END
       WHERE id = $1
       RETURNING *`,
      [affiliateId, normalizedStatus, commissionRate, finalWalletUsdtBsc, finalBinanceId]
    );

    if (updateRes.rowCount === 0) {
      return res.status(404).json({ error: "AFFILIATE_NOT_FOUND" });
    }

    const updated = updateRes.rows[0];
    if (normalizedStatus === "APPROVED" || normalizedStatus === "REJECTED") {
      try {
        if (telegramId) {
          const userLocale = await getUserLocaleByTelegramId(pool, telegramId);
          const displayName = telegramUsername
            ? `@${telegramUsername.replace(/^@/, "")}`
            : `ID ${telegramId}`;
          let text = "";
          if (previousStatus === "APPROVED" && normalizedStatus === "REJECTED") {
            text =
              (AFFILIATE_MESSAGES[userLocale]?.blocked
                || AFFILIATE_MESSAGES.es.blocked).replace("{username}", displayName);
          } else if (
            previousStatus === "REJECTED" && normalizedStatus === "APPROVED"
          ) {
            text = AFFILIATE_MESSAGES[userLocale]?.unblocked
              || AFFILIATE_MESSAGES.es.unblocked;
          } else if (normalizedStatus === "APPROVED") {
            text = AFFILIATE_MESSAGES[userLocale]?.approved
              || AFFILIATE_MESSAGES.es.approved;
          } else if (normalizedStatus === "REJECTED") {
            text = AFFILIATE_MESSAGES[userLocale]?.rejected
              || AFFILIATE_MESSAGES.es.rejected;
          }
          if (text) {
            await sendMessage(telegramId, text);
          }
        }
      } catch (err) {
        console.error("Affiliate notification failed", err);
      }
    }

    return res.json({ affiliate: updated });
  } catch (error) {
    return next(error);
  }
});

router.post("/affiliates/:id/adjustments", async (req, res, next) => {
  const affiliateId = req.params.id;
  const amountRaw = req.body?.amount;
  const reason = String(req.body?.reason || "").trim();
  const pool = getPool();

  if (!affiliateId) {
    return res.status(400).json({ error: "AFFILIATE_REQUIRED" });
  }

  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount === 0) {
    return res.status(400).json({ error: "INVALID_AMOUNT" });
  }
  const adminIds = parseAdminTelegramIds();
  const adminTelegramId = adminIds.length > 0 ? adminIds[0] : null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const affiliateRes = await client.query(
      `SELECT a.id, a.affiliate_debt, u.telegram_id, u.telegram_username
       FROM affiliates a
       JOIN users u ON u.id = a.user_id
       WHERE a.id = $1
       FOR UPDATE OF a`,
      [affiliateId]
    );
    if (affiliateRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "AFFILIATE_NOT_FOUND" });
    }
    const affiliateRow = affiliateRes.rows[0];

    if (amount < 0) {
      const availableRes = await client.query(
        `SELECT COALESCE(SUM(
          GREATEST(
            (amount - COALESCE(refunded_amount, 0))
            - COALESCE(reserved_amount, 0)
            - COALESCE(paid_out_amount, 0),
            0
          )
        ), 0) AS total
         FROM commissions
         WHERE affiliate_id = $1 AND status != 'REFUNDED'`,
        [affiliateId]
      );
      const adjustmentsTotalRes = await client.query(
        `SELECT COALESCE(SUM(
          CASE
            WHEN amount > 0 THEN GREATEST(
              amount
              - COALESCE(reserved_amount, 0)
              - COALESCE(paid_out_amount, 0),
              0
            )
            ELSE amount
          END
        ), 0) AS total
         FROM affiliate_adjustments
         WHERE affiliate_id = $1`,
        [affiliateId]
      );
      const availableGross =
        Number(availableRes.rows[0]?.total || 0)
        + Number(adjustmentsTotalRes.rows[0]?.total || 0);
      const affiliateDebtRes = await client.query(
        "SELECT affiliate_debt FROM affiliates WHERE id = $1",
        [affiliateId]
      );
      const affiliateDebt = Number(affiliateDebtRes.rows[0]?.affiliate_debt || 0);
      const availableNet = Math.max(availableGross - affiliateDebt, 0);
      if (availableNet < Math.abs(amount)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "INSUFFICIENT_BALANCE" });
      }
    }

    const insertRes = await client.query(
      `INSERT INTO affiliate_adjustments
        (affiliate_id, amount, reason, status, created_by_admin_id)
       VALUES ($1, $2, $3, 'EARNED', $4)
       RETURNING *`,
      [affiliateId, amount, reason || null, adminTelegramId]
    );

    if (amount > 0) {
      const debt = Number(affiliateRow.affiliate_debt || 0);
      const appliedDebt = Math.min(debt, amount);
      if (appliedDebt > 0) {
        await client.query(
          `UPDATE affiliates
           SET affiliate_debt = affiliate_debt - $2
           WHERE id = $1`,
          [affiliateId, appliedDebt]
        );
        await client.query(
          `INSERT INTO affiliate_adjustments
            (affiliate_id, amount, reason, status, created_by_admin_id)
           VALUES ($1, $2, $3, 'EARNED', $4)`,
          [affiliateId, -Number(appliedDebt.toFixed(2)), "Pago automatico de deuda", adminTelegramId]
        );
      }
    }

    await client.query(
      `INSERT INTO audit_logs (admin_action, entity_type, entity_id, meta)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [
        "AFFILIATE_ADJUSTMENT",
        "affiliate",
        affiliateId,
        JSON.stringify({
          amount,
          reason,
          admin_telegram_id: adminTelegramId,
        }),
      ]
    );

    await client.query("COMMIT");

    if (reason) {
      try {
        const telegramId = affiliateRow.telegram_id;
        if (telegramId) {
          const locale = await getUserLocaleByTelegramId(pool, telegramId);
          const messageKey = amount >= 0 ? "adjustment_credit" : "adjustment_debit";
          const formattedAmount = formatUsdWithCurrency(Math.abs(amount));
          const text = (AFFILIATE_MESSAGES[locale]?.[messageKey]
            || AFFILIATE_MESSAGES.es[messageKey])
            .replace("{amount}", formattedAmount)
            .replace("{reason}", reason);
          await sendMessage(telegramId, text);
        }
      } catch (err) {
        console.error("Affiliate adjustment notification failed", err);
      }
    }

    return res.status(201).json({ adjustment: insertRes.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
});

router.post("/affiliates/:id/invoices", async (req, res, next) => {
  const affiliateId = req.params.id;
  const amountRaw = req.body?.amount;
  const reason = String(req.body?.reason || "").trim();
  const pool = getPool();

  if (!affiliateId) {
    return res.status(400).json({ error: "AFFILIATE_REQUIRED" });
  }

  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: "INVALID_AMOUNT" });
  }

  const adminIds = parseAdminTelegramIds();
  const adminTelegramId = adminIds.length > 0 ? adminIds[0] : null;

  try {
    const affiliateRes = await pool.query(
      `WITH ranked AS (
         SELECT id,
                ROW_NUMBER() OVER (ORDER BY approved_at, id) AS affiliate_number
         FROM affiliates
         WHERE approved_at IS NOT NULL
       )
       SELECT a.id, u.telegram_id, u.telegram_username, ranked.affiliate_number
       FROM affiliates a
       JOIN users u ON u.id = a.user_id
       LEFT JOIN ranked ON ranked.id = a.id
       WHERE a.id = $1`,
      [affiliateId]
    );
    if (affiliateRes.rowCount === 0) {
      return res.status(404).json({ error: "AFFILIATE_NOT_FOUND" });
    }

    const affiliate = affiliateRes.rows[0];
    const invoiceRes = await pool.query(
      `INSERT INTO affiliate_invoices
        (affiliate_id, amount, reason, status, created_by_admin_id)
       VALUES ($1, $2, $3, 'PENDING', $4)
       RETURNING *`,
      [affiliateId, amount, reason || null, adminTelegramId]
    );

    const invoice = invoiceRes.rows[0];
    const { buildAffiliateInvoiceMessage } = require("../services/affiliateInvoiceMessage");
    const message = buildAffiliateInvoiceMessage({ affiliate, invoice });
    const replyMarkup = {
      inline_keyboard: [
        [
          { text: "✅ Pagar", callback_data: `affiliate_invoice:${invoice.id}:PAY` },
          { text: "❌ Cancelar", callback_data: `affiliate_invoice:${invoice.id}:CANCEL` },
        ],
      ],
    };

    if (affiliate.telegram_id) {
      sendPhoto(affiliate.telegram_id, {
        url: env.AFFILIATE_INVOICE_IMAGE_URL || "https://i.ibb.co/hJL9BQSr/FACTURA.png",
        caption: message,
        parse_mode: "HTML",
        reply_markup: replyMarkup,
      }).catch((err) => {
        console.error("Affiliate invoice photo failed", err);
        sendMessage(affiliate.telegram_id, message, {
          parse_mode: "HTML",
          reply_markup: replyMarkup,
        }).catch((fallbackErr) => {
          console.error("Affiliate invoice notification failed", fallbackErr);
        });
      });
    }

    await pool.query(
      `INSERT INTO audit_logs (admin_action, entity_type, entity_id, meta)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [
        "AFFILIATE_INVOICE_CREATE",
        "affiliate",
        affiliateId,
        JSON.stringify({
          invoice_id: invoice.id,
          amount,
          reason: reason || null,
          admin_telegram_id: adminTelegramId,
        }),
      ]
    );

    return res.status(201).json({ invoice });
  } catch (error) {
    return next(error);
  }
});

router.delete("/affiliates/:id", async (req, res, next) => {
  const affiliateId = req.params.id;
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const affiliateRes = await client.query(
      "SELECT id FROM affiliates WHERE id = $1",
      [affiliateId]
    );
    if (affiliateRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "AFFILIATE_NOT_FOUND" });
    }

    await client.query(
      `DELETE FROM payout_items
       WHERE payout_id IN (SELECT id FROM payouts WHERE affiliate_id = $1)
          OR commission_id IN (SELECT id FROM commissions WHERE affiliate_id = $1)`,
      [affiliateId]
    );
    await client.query("DELETE FROM payouts WHERE affiliate_id = $1", [affiliateId]);
    await client.query("DELETE FROM commissions WHERE affiliate_id = $1", [
      affiliateId,
    ]);
    await client.query("DELETE FROM affiliates WHERE id = $1", [affiliateId]);

    await client.query("COMMIT");
    return res.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
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
      `WITH numbered AS (
         SELECT p.*,
                ROW_NUMBER() OVER (ORDER BY p.created_at, p.id) AS payout_number
         FROM payouts p
       )
       SELECT numbered.*, u.telegram_id, u.telegram_username
       FROM numbered
       JOIN affiliates a ON a.id = numbered.affiliate_id
       JOIN users u ON u.id = a.user_id
       ${whereClause.replace(/\bp\./g, "numbered.")}
       ORDER BY numbered.created_at DESC
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

router.get("/payouts/status-counts", async (req, res, next) => {
  const pool = getPool();
  try {
    const countsRes = await pool.query(
      `SELECT status, COUNT(*)::int AS count
       FROM payouts
       GROUP BY status`
    );
    const counts = {};
    for (const row of countsRes.rows) {
      counts[row.status] = row.count || 0;
    }
    return res.json({ counts });
  } catch (error) {
    return next(error);
  }
});

router.get("/payouts/:id", async (req, res, next) => {
  const payoutId = req.params.id;
  if (!/^[0-9a-fA-F-]{36}$/.test(payoutId || "")) {
    return res.status(400).json({ error: "INVALID_PAYOUT_ID" });
  }
  const pool = getPool();

  try {
    await ensurePayoutReceiptSchema(pool);
    const payoutRes = await pool.query(
      `WITH numbered AS (
         SELECT id,
                ROW_NUMBER() OVER (ORDER BY created_at, id) AS payout_number
         FROM payouts
       )
       SELECT p.*, a.status AS affiliate_status, a.commission_rate,
              a.wallet_usdt_bsc, a.wallet_nequi, a.binance_id,
              u.telegram_id, u.telegram_username,
              numbered.payout_number
       FROM payouts p
       JOIN affiliates a ON a.id = p.affiliate_id
       JOIN users u ON u.id = a.user_id
       LEFT JOIN numbered ON numbered.id = p.id
       WHERE p.id = $1`,
      [payoutId]
    );

    if (payoutRes.rowCount === 0) {
      return res.status(404).json({ error: "PAYOUT_NOT_FOUND" });
    }

    const payout = payoutRes.rows[0];
    const balanceRes = await pool.query(
      `SELECT COALESCE(SUM(
        GREATEST(
          (amount - COALESCE(refunded_amount, 0))
          - COALESCE(reserved_amount, 0)
          - COALESCE(paid_out_amount, 0),
          0
        )
      ), 0) AS available_balance
       FROM commissions
       WHERE affiliate_id = $1 AND status != 'REFUNDED'`,
      [payout.affiliate_id]
    );

    const adjustmentsRes = await pool.query(
      `SELECT COALESCE(SUM(
        CASE
          WHEN amount > 0 THEN GREATEST(
            amount
            - COALESCE(reserved_amount, 0)
            - COALESCE(paid_out_amount, 0),
            0
          )
          ELSE amount
        END
      ), 0) AS adjustments_total
       FROM affiliate_adjustments
       WHERE affiliate_id = $1`,
      [payout.affiliate_id]
    );

    const availableBalance =
      Number(balanceRes.rows[0].available_balance || 0)
      + Number(adjustmentsRes.rows[0].adjustments_total || 0);
    return res.json({
      payout,
        affiliate: {
          id: payout.affiliate_id,
          status: payout.affiliate_status,
          commission_rate: payout.commission_rate,
          wallet_usdt_bsc: payout.wallet_usdt_bsc,
          wallet_nequi: payout.wallet_nequi,
          binance_id: payout.binance_id,
        },
      user: {
        telegram_id: payout.telegram_id,
        telegram_username: payout.telegram_username,
      },
      available_balance: Math.max(availableBalance, 0),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/payouts/:id/receipt", async (req, res, next) => {
  const payoutId = req.params.id;
  if (!/^[0-9a-fA-F-]{36}$/.test(payoutId || "")) {
    return res.status(400).json({ error: "INVALID_PAYOUT_ID" });
  }
  const pool = getPool();
  try {
    await ensurePayoutReceiptSchema(pool);
    const payoutRes = await pool.query(
      `SELECT receipt_path, receipt_filename, receipt_mime
       FROM payouts
       WHERE id = $1`,
      [payoutId]
    );
    if (payoutRes.rowCount === 0) {
      return res.status(404).json({ error: "PAYOUT_NOT_FOUND" });
    }
    const receipt = payoutRes.rows[0];
    if (!receipt.receipt_path) {
      return res.status(404).json({ error: "RECEIPT_NOT_FOUND" });
    }
    const buffer = await fs.readFile(receipt.receipt_path);
    res.set("Content-Type", receipt.receipt_mime || "image/png");
    res.set("Cache-Control", "private, max-age=300");
    return res.send(buffer);
  } catch (error) {
    return next(error);
  }
});

router.get("/payouts/:id/receipt/download", async (req, res, next) => {
  const payoutId = req.params.id;
  if (!/^[0-9a-fA-F-]{36}$/.test(payoutId || "")) {
    return res.status(400).json({ error: "INVALID_PAYOUT_ID" });
  }
  const pool = getPool();
  try {
    await ensurePayoutReceiptSchema(pool);
    const payoutRes = await pool.query(
      `SELECT receipt_path, receipt_filename, receipt_mime
       FROM payouts
       WHERE id = $1`,
      [payoutId]
    );
    if (payoutRes.rowCount === 0) {
      return res.status(404).json({ error: "PAYOUT_NOT_FOUND" });
    }
    const receipt = payoutRes.rows[0];
    if (!receipt.receipt_path) {
      return res.status(404).json({ error: "RECEIPT_NOT_FOUND" });
    }
    const buffer = await fs.readFile(receipt.receipt_path);
    const filename = receipt.receipt_filename || `recibo-retiro-${payoutId}.png`;
    res.set("Content-Type", receipt.receipt_mime || "image/png");
    res.set("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (error) {
    return next(error);
  }
});

router.post("/payouts", async (req, res, next) => {
  const { affiliate_id: affiliateId, method, destination, amount } = req.body || {};
  const pool = getPool();

  if (!affiliateId) {
    return res.status(400).json({ error: "AFFILIATE_REQUIRED" });
  }

  if (!method || (method !== "USDT_BSC" && method !== "BINANCE_ID" && method !== "NEQUI")) {
    return res.status(400).json({ error: "INVALID_METHOD" });
  }
  if (amount != null && (!Number.isFinite(Number(amount)) || Number(amount) <= 0)) {
    return res.status(400).json({ error: "INVALID_AMOUNT" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const affiliateRes = await client.query(
      "SELECT id, wallet_usdt_bsc, wallet_nequi, binance_id, affiliate_debt FROM affiliates WHERE id = $1",
      [affiliateId]
    );

    if (affiliateRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "AFFILIATE_NOT_FOUND" });
    }

    const affiliate = affiliateRes.rows[0];
    const debt = Number(affiliate.affiliate_debt || 0);
    const resolvedDestination =
      destination ||
      (method === "USDT_BSC"
        ? affiliate.wallet_usdt_bsc
        : method === "NEQUI"
        ? affiliate.wallet_nequi
        : affiliate.binance_id);

    if (!resolvedDestination) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "DESTINATION_REQUIRED" });
    }

    const commissionsRes = await client.query(
      `SELECT id,
              amount,
              COALESCE(refunded_amount, 0) AS refunded_amount,
              COALESCE(reserved_amount, 0) AS reserved_amount,
              COALESCE(paid_out_amount, 0) AS paid_out_amount,
              (amount - COALESCE(refunded_amount, 0)
                - COALESCE(reserved_amount, 0)
                - COALESCE(paid_out_amount, 0)) AS available_amount
       FROM commissions
       WHERE affiliate_id = $1
         AND status != 'REFUNDED'
         AND (amount - COALESCE(refunded_amount, 0)
           - COALESCE(reserved_amount, 0)
           - COALESCE(paid_out_amount, 0)) > 0
       ORDER BY earned_at ASC
       FOR UPDATE`,
      [affiliateId]
    );

    const positiveAdjustmentsRes = await client.query(
      `SELECT id,
              amount,
              COALESCE(reserved_amount, 0) AS reserved_amount,
              COALESCE(paid_out_amount, 0) AS paid_out_amount,
              (amount - COALESCE(reserved_amount, 0)
                - COALESCE(paid_out_amount, 0)) AS available_amount
       FROM affiliate_adjustments
       WHERE affiliate_id = $1
         AND amount > 0
         AND (amount - COALESCE(reserved_amount, 0)
           - COALESCE(paid_out_amount, 0)) > 0
       ORDER BY created_at ASC
       FOR UPDATE`,
      [affiliateId]
    );

    const negativeAdjustmentsRes = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM affiliate_adjustments
       WHERE affiliate_id = $1
         AND amount < 0`,
      [affiliateId]
    );

    const commissionAvailableTotal = commissionsRes.rows.reduce(
      (sum, row) => sum + Number(row.available_amount || 0),
      0
    );
    const positiveAdjustmentsTotal = positiveAdjustmentsRes.rows.reduce(
      (sum, row) => sum + Number(row.available_amount || 0),
      0
    );
    const negativeAdjustmentsTotal = Number(negativeAdjustmentsRes.rows[0]?.total || 0);

    const totalGross = Number(
      (commissionAvailableTotal + positiveAdjustmentsTotal + negativeAdjustmentsTotal).toFixed(2)
    );
    if (commissionsRes.rowCount === 0 && positiveAdjustmentsRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "NO_EARNED_COMMISSIONS" });
    }

    if (!totalGross || totalGross <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "NO_EARNED_COMMISSIONS" });
    }

    const debtAppliedTotal = Math.min(debt, totalGross);
    const availableAfterDebt = Number((totalGross - debtAppliedTotal).toFixed(2));
    if (availableAfterDebt <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "DEBT_PENDING" });
    }

    let targetPayout = availableAfterDebt;
    if (amount != null) {
      const requestedAmount = Number(amount);
      if (requestedAmount > availableAfterDebt) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "INSUFFICIENT_BALANCE" });
      }
      targetPayout = requestedAmount;
    }
    const targetGross = Number((targetPayout + debtAppliedTotal).toFixed(2));
    const targetPositive = targetGross;

    let remaining = targetPositive;
    const selectedCommissions = [];
    const selectedAdjustments = [];

    for (const row of commissionsRes.rows) {
      if (remaining <= 0) {
        break;
      }
      const availableAmount = Number(row.available_amount || 0);
      if (availableAmount <= 0) {
        continue;
      }
      const takeAmount = Number(Math.min(availableAmount, remaining).toFixed(2));
      if (takeAmount <= 0) {
        continue;
      }
      selectedCommissions.push({ id: row.id, amount: takeAmount });
      remaining = Number((remaining - takeAmount).toFixed(2));
    }

    for (const row of positiveAdjustmentsRes.rows) {
      if (remaining <= 0) {
        break;
      }
      const availableAmount = Number(row.available_amount || 0);
      if (availableAmount <= 0) {
        continue;
      }
      const takeAmount = Number(Math.min(availableAmount, remaining).toFixed(2));
      if (takeAmount <= 0) {
        continue;
      }
      selectedAdjustments.push({ id: row.id, amount: takeAmount });
      remaining = Number((remaining - takeAmount).toFixed(2));
    }

    if (remaining > 0.01) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "NO_EARNED_COMMISSIONS" });
    }
    const selectedPositiveTotal = selectedCommissions.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    ) + selectedAdjustments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const selectedGross = Number(selectedPositiveTotal.toFixed(2));

    const debtApplied = Math.min(debtAppliedTotal, selectedGross);
    const payoutAmount = Number((selectedGross - debtApplied).toFixed(2));
    if (payoutAmount <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "DEBT_EXCEEDS_BALANCE" });
    }

    const payoutRes = await client.query(
      `INSERT INTO payouts (affiliate_id, amount, method, destination, status, debt_applied)
       VALUES ($1, $2, $3, $4, 'REQUESTED', $5)
       RETURNING *`,
      [affiliateId, payoutAmount, method, resolvedDestination, debtApplied]
    );

    const payoutId = payoutRes.rows[0].id;
    const commissionIds = selectedCommissions.map((item) => item.id);
    const commissionAmounts = selectedCommissions.map((item) => item.amount);
    const adjustmentIds = selectedAdjustments.map((item) => item.id);
    const adjustmentAmounts = selectedAdjustments.map((item) => item.amount);

    if (debtApplied > 0) {
      await client.query(
        `UPDATE affiliates
         SET affiliate_debt = affiliate_debt - $2
         WHERE id = $1`,
        [affiliateId, debtApplied]
      );
    }

    if (commissionIds.length > 0) {
      await client.query(
        `WITH selected AS (
           SELECT UNNEST($2::uuid[]) AS id,
                  UNNEST($3::numeric[]) AS amount
         )
         INSERT INTO payout_items (payout_id, commission_id, amount)
         SELECT $1, id, amount
         FROM selected`,
        [payoutId, commissionIds, commissionAmounts]
      );

      await client.query(
        `WITH selected AS (
           SELECT UNNEST($1::uuid[]) AS id,
                  UNNEST($2::numeric[]) AS amount
         )
         UPDATE commissions c
         SET reserved_amount = c.reserved_amount + selected.amount,
             status = CASE
               WHEN (c.amount - COALESCE(c.refunded_amount, 0)
                 - (c.reserved_amount + selected.amount)
                 - COALESCE(c.paid_out_amount, 0)) <= 0.01
                 THEN 'RESERVED'
               ELSE c.status
             END
         FROM selected
         WHERE c.id = selected.id`,
        [commissionIds, commissionAmounts]
      );
    }

    if (adjustmentIds.length > 0) {
      await client.query(
        `WITH selected AS (
           SELECT UNNEST($2::uuid[]) AS id,
                  UNNEST($3::numeric[]) AS amount
         )
         INSERT INTO payout_adjustments (payout_id, adjustment_id, amount)
         SELECT $1, id, amount
         FROM selected`,
        [payoutId, adjustmentIds, adjustmentAmounts]
      );

      await client.query(
        `WITH selected AS (
           SELECT UNNEST($1::uuid[]) AS id,
                  UNNEST($2::numeric[]) AS amount
         )
         UPDATE affiliate_adjustments a
         SET reserved_amount = a.reserved_amount + selected.amount,
             status = CASE
               WHEN (a.amount - (a.reserved_amount + selected.amount)
                 - COALESCE(a.paid_out_amount, 0)) <= 0.01
                 THEN 'RESERVED'
               ELSE a.status
             END
         FROM selected
         WHERE a.id = selected.id`,
        [adjustmentIds, adjustmentAmounts]
      );
    }

    await client.query("COMMIT");
    return res.status(201).json({ payout: payoutRes.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

router.post("/payouts/:id/mark-sent", async (req, res, next) => {
  const payoutId = req.params.id;
  const pool = getPool();
  const client = await pool.connect();

  try {
    await ensurePayoutReceiptSchema(pool);
    await client.query("BEGIN");

    const payoutRes = await client.query(
      `WITH ranked AS (
         SELECT id,
                ROW_NUMBER() OVER (ORDER BY approved_at, id) AS affiliate_number
         FROM affiliates
         WHERE approved_at IS NOT NULL
       ),
       numbered AS (
         SELECT id,
                ROW_NUMBER() OVER (ORDER BY created_at, id) AS payout_number
         FROM payouts
       )
       SELECT p.*, u.telegram_id, u.telegram_username,
              ranked.affiliate_number, numbered.payout_number
       FROM payouts p
       JOIN affiliates a ON a.id = p.affiliate_id
       JOIN users u ON u.id = a.user_id
       LEFT JOIN ranked ON ranked.id = a.id
       LEFT JOIN numbered ON numbered.id = p.id
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

    const payoutItemsRes = await client.query(
      `SELECT commission_id, amount
       FROM payout_items
       WHERE payout_id = $1`,
      [payoutId]
    );

    let commissionsRes = { rowCount: 0 };
    if (payoutItemsRes.rowCount > 0) {
      const commissionIds = payoutItemsRes.rows.map((row) => row.commission_id);
      const commissionAmounts = payoutItemsRes.rows.map((row) => Number(row.amount || 0));
      commissionsRes = await client.query(
        `WITH selected AS (
           SELECT UNNEST($1::uuid[]) AS id,
                  UNNEST($2::numeric[]) AS amount
         )
         UPDATE commissions c
         SET reserved_amount = GREATEST(c.reserved_amount - selected.amount, 0),
             paid_out_amount = LEAST(
               c.paid_out_amount + selected.amount,
               (c.amount - COALESCE(c.refunded_amount, 0))
             ),
             paid_out_at = CASE
               WHEN (c.amount - COALESCE(c.refunded_amount, 0))
                 - LEAST(
                   c.paid_out_amount + selected.amount,
                   (c.amount - COALESCE(c.refunded_amount, 0))
                 ) <= 0.01
                 THEN COALESCE(c.paid_out_at, now())
               ELSE c.paid_out_at
             END,
             status = CASE
               WHEN (c.amount - COALESCE(c.refunded_amount, 0))
                 - LEAST(
                   c.paid_out_amount + selected.amount,
                   (c.amount - COALESCE(c.refunded_amount, 0))
                 ) <= 0.01
                 THEN 'PAID_OUT'::commission_status
               WHEN GREATEST(c.reserved_amount - selected.amount, 0) > 0.01
                 THEN 'RESERVED'::commission_status
               ELSE 'EARNED'::commission_status
             END
         FROM selected
         WHERE c.id = selected.id
           AND c.status != 'REFUNDED'`,
        [commissionIds, commissionAmounts]
      );
    }

    const payoutAdjustmentsRes = await client.query(
      `SELECT adjustment_id, amount
       FROM payout_adjustments
       WHERE payout_id = $1`,
      [payoutId]
    );
    if (payoutAdjustmentsRes.rowCount > 0) {
      const positiveAdjustments = payoutAdjustmentsRes.rows.filter(
        (row) => Number(row.amount || 0) > 0
      );
      if (positiveAdjustments.length > 0) {
        const adjustmentIds = positiveAdjustments.map((row) => row.adjustment_id);
        const adjustmentAmounts = positiveAdjustments.map((row) => Number(row.amount || 0));
        await client.query(
          `WITH selected AS (
             SELECT UNNEST($1::uuid[]) AS id,
                    UNNEST($2::numeric[]) AS amount
           )
           UPDATE affiliate_adjustments a
           SET reserved_amount = GREATEST(a.reserved_amount - selected.amount, 0),
               paid_out_amount = LEAST(a.paid_out_amount + selected.amount, a.amount),
               status = CASE
                 WHEN a.amount - LEAST(a.paid_out_amount + selected.amount, a.amount) <= 0.01
                   THEN 'PAID_OUT'::commission_status
                 WHEN GREATEST(a.reserved_amount - selected.amount, 0) > 0.01
                   THEN 'RESERVED'::commission_status
                 ELSE 'EARNED'::commission_status
               END
           FROM selected
           WHERE a.id = selected.id`,
          [adjustmentIds, adjustmentAmounts]
        );
      }
    }

    await client.query("COMMIT");

    const message = "✅💸 ¡Tu pago se ha enviado exitosamente! 🙌\n\n🧾 En breve recibirás tu recibo de pago.";
    try {
      await sendMessage(payout.telegram_id, message);
      await new Promise((resolve) => setTimeout(resolve, 10000));
      const affiliateNumber = payout.affiliate_number
        ? `#${payout.affiliate_number}`
        : "#-";
      const paidToUsername = payout.telegram_username || "N/A";
      const botUsername = (process.env.BOT_USERNAME || process.env.NEXT_PUBLIC_BOT_USERNAME || "")
        .replace(/^@/, "");
      const payoutNumber = payout.payout_number
        ? String(payout.payout_number).padStart(5, "0")
        : "-";
      const receiptPng = await renderReceiptPng({
        orderId: payout.id,
        orderNumber: payoutNumber,
        orderNumberLabel: "Numero de pago:",
        receiptTitle: "RECIBO DE RETIRO",
        telegramId: payout.telegram_id,
        username: payout.telegram_username,
        dateTime: formatBogotaDate(payout.sent_at || new Date()),
        items: [{ name: "Retiro", price: payout.amount }],
        subtotal: payout.amount,
        commission: 0,
        total: payout.amount,
        referredBy: "N/A",
        templateName: "recibo_retiro.html",
        totalLabel: "Total retirado",
        thankYou: "Gracias<br>Por trabajar con nosotros<br>Sigue adelante",
        affiliateNumber,
        paidToUsername,
        paidToTelegramId: payout.telegram_id,
        botUsername: botUsername || undefined,
        locale: "es",
      });
      try {
        const receiptsDir = path.resolve(__dirname, "..", "..", "uploads", "payout-receipts");
        await fs.mkdir(receiptsDir, { recursive: true });
        const filename = `payout-${payout.id}.png`;
        const storedPath = path.join(receiptsDir, filename);
        await fs.copyFile(receiptPng.pngPath, storedPath);
        await client.query(
          `UPDATE payouts
           SET receipt_path = $1,
               receipt_filename = $2,
               receipt_mime = $3
           WHERE id = $4`,
          [storedPath, filename, "image/png", payout.id]
        );
        try {
          await sendPhoto(payout.telegram_id, { path: storedPath });
        } catch (photoError) {
          console.error("Telegram payout receipt photo failed", photoError);
          await sendDocument(payout.telegram_id, { path: storedPath });
        }
      } finally {
        await receiptPng.cleanup();
      }
    } catch (err) {
      console.error("Telegram payout receipt failed", err);
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

    if (payout.debt_applied && Number(payout.debt_applied) > 0) {
      await client.query(
        `UPDATE affiliates
         SET affiliate_debt = affiliate_debt + $2
         WHERE id = $1`,
        [payout.affiliate_id, payout.debt_applied]
      );
    }

    const payoutItemsRes = await client.query(
      `SELECT commission_id, amount
       FROM payout_items
       WHERE payout_id = $1`,
      [payoutId]
    );

    if (payoutItemsRes.rowCount > 0) {
      const commissionIds = payoutItemsRes.rows.map((row) => row.commission_id);
      const commissionAmounts = payoutItemsRes.rows.map((row) => Number(row.amount || 0));
      await client.query(
        `WITH selected AS (
           SELECT UNNEST($1::uuid[]) AS id,
                  UNNEST($2::numeric[]) AS amount
         )
         UPDATE commissions c
         SET reserved_amount = GREATEST(c.reserved_amount - selected.amount, 0),
             status = CASE
               WHEN (c.amount - COALESCE(c.refunded_amount, 0)
                 - COALESCE(c.paid_out_amount, 0)) <= 0.01
                 THEN 'PAID_OUT'::commission_status
               WHEN GREATEST(c.reserved_amount - selected.amount, 0) > 0.01
                 THEN 'RESERVED'::commission_status
               ELSE 'EARNED'::commission_status
             END
         FROM selected
         WHERE c.id = selected.id
           AND c.status != 'REFUNDED'`,
        [commissionIds, commissionAmounts]
      );
    }

    await client.query(
      `DELETE FROM payout_items
       WHERE payout_id = $1`,
      [payoutId]
    );

    const payoutAdjustmentsRes = await client.query(
      `SELECT adjustment_id, amount
       FROM payout_adjustments
       WHERE payout_id = $1`,
      [payoutId]
    );
    if (payoutAdjustmentsRes.rowCount > 0) {
      const positiveAdjustments = payoutAdjustmentsRes.rows.filter(
        (row) => Number(row.amount || 0) > 0
      );
      if (positiveAdjustments.length > 0) {
        const adjustmentIds = positiveAdjustments.map((row) => row.adjustment_id);
        const adjustmentAmounts = positiveAdjustments.map((row) => Number(row.amount || 0));
        await client.query(
          `WITH selected AS (
             SELECT UNNEST($1::uuid[]) AS id,
                    UNNEST($2::numeric[]) AS amount
           )
           UPDATE affiliate_adjustments a
           SET reserved_amount = GREATEST(a.reserved_amount - selected.amount, 0),
               status = CASE
                 WHEN a.amount - COALESCE(a.paid_out_amount, 0) <= 0.01
                   THEN 'PAID_OUT'::commission_status
                 WHEN GREATEST(a.reserved_amount - selected.amount, 0) > 0.01
                   THEN 'RESERVED'::commission_status
                 ELSE 'EARNED'::commission_status
               END
           FROM selected
           WHERE a.id = selected.id`,
          [adjustmentIds, adjustmentAmounts]
        );
      }
    }

    await client.query(
      `DELETE FROM payout_adjustments
       WHERE payout_id = $1`,
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
    await ensureTicketSchema(pool);
    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM tickets t ${whereClause}`,
      values
    );
    const total = countRes.rows[0].total;

    const listRes = await pool.query(
      `SELECT t.id, t.status, t.created_at, t.closed_at, t.allow_image,
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
    await ensureTicketSchema(pool);
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
      `SELECT id, sender, message_text, telegram_file_id, created_at
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
        allow_image: ticket.allow_image,
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

router.get("/tickets/messages/:id/image", async (req, res, next) => {
  const messageId = req.params.id;
  const pool = getPool();

  try {
    const msgRes = await pool.query(
      `SELECT telegram_file_id
       FROM ticket_messages
       WHERE id = $1`,
      [messageId]
    );
    if (msgRes.rowCount === 0 || !msgRes.rows[0].telegram_file_id) {
      return res.status(404).json({ error: "MESSAGE_IMAGE_NOT_FOUND" });
    }

    const fileId = msgRes.rows[0].telegram_file_id;
    const filePath = await getFilePath(fileId);
    const file = await downloadFile(filePath);

    res.set("Content-Type", file.contentType || "application/octet-stream");
    res.set("Cache-Control", "private, max-age=300");
    return res.send(file.buffer);
  } catch (error) {
    next(error);
  }
});

router.post("/tickets/:id/reply", async (req, res, next) => {
  const ticketId = req.params.id;
  const messageText = req.body && req.body.message ? String(req.body.message).trim() : "";
  const imageDataUrl = req.body && req.body.image_data_url
    ? String(req.body.image_data_url).trim()
    : "";
  const imagePayload = imageDataUrl ? parseImageDataUrl(imageDataUrl) : null;

  if (!messageText && !imagePayload) {
    return res.status(400).json({ error: "MESSAGE_REQUIRED" });
  }
  if (imageDataUrl && !imagePayload) {
    return res.status(400).json({ error: "IMAGE_INVALID" });
  }
  if (imagePayload && imagePayload.buffer.length > 6 * 1024 * 1024) {
    return res.status(400).json({ error: "IMAGE_TOO_LARGE" });
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await ensureTicketSchema(pool);
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

    let telegramFileId = null;
    if (imagePayload) {
      const extension = getImageExtension(imagePayload.mime);
      const filename = `ticket-${ticketId}.${extension}`;
      const tempPath = path.join(
        path.resolve(__dirname, "..", "..", "uploads", "tickets"),
        filename
      );
      await fs.mkdir(path.dirname(tempPath), { recursive: true });
      await fs.writeFile(tempPath, imagePayload.buffer);
      let sentPhoto;
      try {
        sentPhoto = await sendPhoto(ticket.telegram_id, {
          path: tempPath,
          filename,
          caption: messageText
            ? `<b>🤖 Soporte</b>\n\nRespuesta:\n\n${messageText}`
            : undefined,
          parse_mode: "HTML",
        });
      } finally {
        try {
          await fs.unlink(tempPath);
        } catch (err) {
          // ignore cleanup errors
        }
      }
      if (sentPhoto && Array.isArray(sentPhoto.photo) && sentPhoto.photo.length > 0) {
        telegramFileId = sentPhoto.photo[sentPhoto.photo.length - 1].file_id;
      }
    } else {
      const text = `<b>🤖 Soporte</b>\n\nRespuesta:\n\n${messageText}`;
      await sendMessage(ticket.telegram_id, text, { parse_mode: "HTML" });
    }

    const msgRes = await client.query(
      `INSERT INTO ticket_messages (ticket_id, sender, message_text, telegram_file_id)
       VALUES ($1, 'ADMIN', $2, $3)
       RETURNING *`,
      [ticketId, messageText || null, telegramFileId]
    );

    await client.query("COMMIT");

    return res.json({ ok: true, message: msgRes.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
});

router.post("/tickets/:id/allow-image", async (req, res, next) => {
  const ticketId = req.params.id;
  const pool = getPool();

  try {
    await ensureTicketSchema(pool);
    const ticketRes = await pool.query(
      `SELECT t.id, t.status, u.telegram_id
       FROM tickets t
       JOIN users u ON u.id = t.user_id
       WHERE t.id = $1`,
      [ticketId]
    );
    if (ticketRes.rowCount === 0) {
      return res.status(404).json({ error: "TICKET_NOT_FOUND" });
    }
    const ticket = ticketRes.rows[0];
    if (ticket.status !== "OPEN") {
      return res.status(400).json({ error: "TICKET_NOT_OPEN" });
    }

    const updateRes = await pool.query(
      `UPDATE tickets
       SET allow_image = true
       WHERE id = $1
       RETURNING *`,
      [ticketId]
    );

    const userLocale = await getUserLocaleByTelegramId(pool, ticket.telegram_id);
    try {
      const text =
        SUPPORT_MESSAGES[userLocale]?.image_allowed
        || SUPPORT_MESSAGES.es.image_allowed;
      await sendMessage(ticket.telegram_id, text);
    } catch (err) {
      console.error("Telegram notification failed", err);
    }

    return res.json({ ok: true, ticket: updateRes.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/tickets/:id/ban-user", async (req, res, next) => {
  const ticketId = req.params.id;
  const pool = getPool();

  try {
    await ensureSupportBanSchema(pool);
    const ticketRes = await pool.query(
      `SELECT u.telegram_id
       FROM tickets t
       JOIN users u ON u.id = t.user_id
       WHERE t.id = $1`,
      [ticketId]
    );
    if (ticketRes.rowCount === 0) {
      return res.status(404).json({ error: "TICKET_NOT_FOUND" });
    }
    const telegramId = ticketRes.rows[0].telegram_id;
    if (!telegramId) {
      return res.status(400).json({ error: "TELEGRAM_ID_REQUIRED" });
    }

    const banRes = await pool.query(
      "SELECT 1 FROM support_bans WHERE telegram_id = $1 LIMIT 1",
      [telegramId]
    );
    if (banRes.rowCount > 0) {
      await pool.query("DELETE FROM support_bans WHERE telegram_id = $1", [
        telegramId,
      ]);
      return res.json({ ok: true, banned: false });
    }

    await pool.query(
      "INSERT INTO support_bans (telegram_id, reason) VALUES ($1, $2)",
      [telegramId, "Banned from support tickets"]
    );

    const userLocale = await getUserLocaleByTelegramId(pool, telegramId);
    try {
      const text =
        SUPPORT_MESSAGES[userLocale]?.user_banned
        || SUPPORT_MESSAGES.es.user_banned;
      await sendMessage(telegramId, text);
    } catch (err) {
      console.error("Telegram notification failed", err);
    }

    return res.json({ ok: true, banned: true });
  } catch (error) {
    next(error);
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

    const userRes = await pool.query(
      `SELECT u.telegram_id
       FROM tickets t
       JOIN users u ON u.id = t.user_id
       WHERE t.id = $1`,
      [ticketId]
    );
    const telegramId = userRes.rows[0]?.telegram_id;
    if (telegramId) {
      const userLocale = await getUserLocaleByTelegramId(pool, telegramId);
      const text =
        SUPPORT_MESSAGES[userLocale]?.ticket_closed
        || SUPPORT_MESSAGES.es.ticket_closed;
      try {
        await sendMessage(telegramId, text);
      } catch (err) {
        console.error("Telegram notification failed", err);
      }
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
              ) AS has_custom_recipients,
              EXISTS (
                SELECT 1
                FROM audit_logs a
                WHERE a.entity_type = 'broadcast'
                  AND a.entity_id = b.id
                  AND a.admin_action = 'BROADCAST_GROUP_CHATS'
              ) AS has_group_recipients
       FROM broadcasts b
       ORDER BY b.created_at DESC
       LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    );

    const items = listRes.rows.map((row) => ({
      ...row,
      segment: mapBroadcastSegment(
        row.segment,
        row.has_custom_recipients || row.has_group_recipients
      ),
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
         AND admin_action IN ('BROADCAST_CUSTOM_RECIPIENTS', 'BROADCAST_GROUP_CHATS')
       ORDER BY created_at DESC
       LIMIT 1`,
      [broadcastId]
    );

    const meta = auditRes.rows[0] && auditRes.rows[0].meta ? auditRes.rows[0].meta : {};
    const customTelegramIds = Array.isArray(meta.telegram_ids) ? meta.telegram_ids : [];
    const groupChatIds = Array.isArray(meta.chat_ids) ? meta.chat_ids : [];

    const broadcast = broadcastRes.rows[0];

    return res.json({
      broadcast: {
        ...broadcast,
        segment: mapBroadcastSegment(
          broadcast.segment,
          customTelegramIds.length > 0 || groupChatIds.length > 0
        ),
        telegram_ids: customTelegramIds,
        chat_ids: groupChatIds,
        // Back-compat alias (deprecated):
        custom_telegram_ids: customTelegramIds,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/broadcasts/:id", async (req, res, next) => {
  const broadcastId = req.params.id;
  const messageText = req.body && req.body.message !== undefined
    ? String(req.body.message).trim()
    : null;
  const rawSegment = req.body && req.body.segment ? String(req.body.segment).trim() : "";
  const imageDataUrl = req.body && req.body.image_data_url
    ? String(req.body.image_data_url).trim()
    : "";
  const clearImage = Boolean(req.body && req.body.clear_image);
  const buttons = normalizeBroadcastButtons(req.body && req.body.buttons);
  const savedFlag = typeof req.body?.saved === "boolean" ? req.body.saved : null;

  const pool = getPool();

  try {
    await ensureBroadcastSchema(pool);
    const broadcastRes = await pool.query("SELECT * FROM broadcasts WHERE id = $1", [
      broadcastId,
    ]);
    if (broadcastRes.rowCount === 0) {
      return res.status(404).json({ error: "BROADCAST_NOT_FOUND" });
    }

    const broadcast = broadcastRes.rows[0];
    const imagePayload = imageDataUrl ? parseImageDataUrl(imageDataUrl) : null;
    if (imageDataUrl && !imagePayload) {
      return res.status(400).json({ error: "IMAGE_INVALID" });
    }
    if (imagePayload && imagePayload.buffer.length > 6 * 1024 * 1024) {
      return res.status(400).json({ error: "IMAGE_TOO_LARGE" });
    }

    const nextMessage = messageText !== null ? messageText : broadcast.message_text;
    const normalizedSegment = rawSegment ? normalizeBroadcastSegmentInput(rawSegment) : "";
    const nextSegment = normalizedSegment || broadcast.segment;
    const hasImage = Boolean(broadcast.image_path) && !clearImage;
    if (!nextMessage && !hasImage && !imagePayload) {
      return res.status(400).json({ error: "MESSAGE_REQUIRED" });
    }

    const isGroups = nextSegment === "GROUPS";
    const isChannels = nextSegment === "CHANNELS";
    const destination = isGroups || isChannels ? "CHAT" : "DM";

    const updateRes = await pool.query(
      `UPDATE broadcasts
       SET message_text = $1,
           segment = $2,
           destination = $3,
           buttons = $4::jsonb,
           saved = COALESCE($5, saved),
           image_path = CASE WHEN $6 THEN NULL ELSE image_path END,
           image_filename = CASE WHEN $6 THEN NULL ELSE image_filename END,
           image_mime = CASE WHEN $6 THEN NULL ELSE image_mime END
       WHERE id = $7
       RETURNING *`,
      [
        nextMessage,
        nextSegment,
        destination,
        JSON.stringify(buttons),
        savedFlag,
        clearImage,
        broadcastId,
      ]
    );

    let updated = updateRes.rows[0];
    if (imagePayload) {
      const uploadsDir = path.resolve(__dirname, "..", "..", "uploads", "broadcasts");
      await fs.mkdir(uploadsDir, { recursive: true });
      const extension = getImageExtension(imagePayload.mime);
      const filename = `broadcast-${updated.id}.${extension}`;
      const filePath = path.join(uploadsDir, filename);
      await fs.writeFile(filePath, imagePayload.buffer);
      const imageRes = await pool.query(
        `UPDATE broadcasts
         SET image_path = $1, image_filename = $2, image_mime = $3
         WHERE id = $4
         RETURNING *`,
        [filePath, filename, imagePayload.mime, updated.id]
      );
      updated = imageRes.rows[0];
    }

    return res.json({
      broadcast: {
        ...updated,
        segment: mapBroadcastSegment(updated.segment, updated.segment === "ALL"),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/broadcasts/:id", async (req, res, next) => {
  const broadcastId = req.params.id;
  const pool = getPool();

  try {
    await ensureBroadcastSchema(pool);
    const broadcastRes = await pool.query(
      "DELETE FROM broadcasts WHERE id = $1 RETURNING *",
      [broadcastId]
    );
    if (broadcastRes.rowCount === 0) {
      return res.status(404).json({ error: "BROADCAST_NOT_FOUND" });
    }
    const deleted = broadcastRes.rows[0];
    return res.json({
      ok: true,
      broadcast: {
        ...deleted,
        segment: mapBroadcastSegment(deleted.segment, deleted.segment === "ALL"),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/broadcasts", async (req, res, next) => {
  const messageText = req.body && req.body.message ? String(req.body.message).trim() : "";
  const rawSegment = req.body && req.body.segment ? String(req.body.segment).trim() : "ALL_USERS";
  const imageDataUrl = req.body && req.body.image_data_url
    ? String(req.body.image_data_url).trim()
    : "";
  const imagePayload = imageDataUrl ? parseImageDataUrl(imageDataUrl) : null;
  const buttons = normalizeBroadcastButtons(req.body && req.body.buttons);

  if (!messageText && !imagePayload) {
    return res.status(400).json({ error: "MESSAGE_REQUIRED" });
  }
  if (imageDataUrl && !imagePayload) {
    return res.status(400).json({ error: "IMAGE_INVALID" });
  }
  if (imagePayload && imagePayload.buffer.length > 6 * 1024 * 1024) {
    return res.status(400).json({ error: "IMAGE_TOO_LARGE" });
  }

  const isCustom = rawSegment === "CUSTOM";
  const isGroups = rawSegment === "GROUPS";
  const isChannels = rawSegment === "CHANNELS";
  const isBuyers = rawSegment === "BUYERS";
  const isAffiliates = rawSegment === "AFFILIATES";
  if (
    !isCustom
    && !isGroups
    && !isChannels
    && !isBuyers
    && !isAffiliates
    && rawSegment !== "ALL_USERS"
    && rawSegment !== "BUYERS_AFFILIATES"
  ) {
    return res.status(400).json({ error: "SEGMENT_INVALID" });
  }

  const telegramIds = isCustom ? normalizeTelegramIds(req.body.telegram_ids) : [];
  const chatIds = isGroups || isChannels ? normalizeChatIds(req.body.chat_ids) : [];
  if (isCustom && telegramIds.length === 0) {
    return res.status(400).json({ error: "TELEGRAM_IDS_REQUIRED" });
  }
  if ((isGroups || isChannels) && chatIds.length === 0) {
    return res.status(400).json({ error: "CHAT_IDS_REQUIRED" });
  }

  const pool = getPool();

  try {
    await ensureBroadcastSchema(pool);
    const broadcastRes = await pool.query(
      `INSERT INTO broadcasts (segment, destination, message_text, buttons)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING *`,
      [
        isBuyers
          ? "BUYERS"
          : isAffiliates
          ? "AFFILIATES"
          : rawSegment === "BUYERS_AFFILIATES"
          ? "BUYERS_AFFILIATES"
          : isGroups
          ? "GROUPS"
          : isChannels
          ? "CHANNELS"
          : "ALL",
        isGroups || isChannels ? "CHAT" : "DM",
        messageText,
        JSON.stringify(buttons),
      ]
    );

    let broadcast = broadcastRes.rows[0];

    if (imagePayload) {
      const uploadsDir = path.resolve(__dirname, "..", "..", "uploads", "broadcasts");
      await fs.mkdir(uploadsDir, { recursive: true });
      const extension = getImageExtension(imagePayload.mime);
      const filename = `broadcast-${broadcast.id}.${extension}`;
      const filePath = path.join(uploadsDir, filename);
      await fs.writeFile(filePath, imagePayload.buffer);
      const updateRes = await pool.query(
        `UPDATE broadcasts
         SET image_path = $1, image_filename = $2, image_mime = $3
         WHERE id = $4
         RETURNING *`,
        [filePath, filename, imagePayload.mime, broadcast.id]
      );
      broadcast = updateRes.rows[0];
    }

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
    if (isGroups || isChannels) {
      await pool.query(
        `INSERT INTO audit_logs (admin_action, entity_type, entity_id, meta)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [
          "BROADCAST_GROUP_CHATS",
          "broadcast",
          broadcast.id,
          JSON.stringify({ chat_ids: chatIds }),
        ]
      );
    }

    return res.status(201).json({
      broadcast: {
        ...broadcast,
        segment: mapBroadcastSegment(broadcast.segment, isCustom || isGroups || isChannels),
        telegram_ids: telegramIds,
        chat_ids: chatIds,
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
    await ensureBroadcastSchema(pool);
    const broadcastRes = await pool.query("SELECT * FROM broadcasts WHERE id = $1", [
      broadcastId,
    ]);

    if (broadcastRes.rowCount === 0) {
      return res.status(404).json({ error: "BROADCAST_NOT_FOUND" });
    }

    const broadcast = broadcastRes.rows[0];
    const bodyTelegramIds = normalizeTelegramIds(req.body && req.body.telegram_ids);
    const bodyChatIds = normalizeChatIds(req.body && req.body.chat_ids);

    const auditRes = await pool.query(
      `SELECT meta
       FROM audit_logs
       WHERE entity_type = 'broadcast'
         AND entity_id = $1
         AND admin_action IN ('BROADCAST_CUSTOM_RECIPIENTS', 'BROADCAST_GROUP_CHATS')
       ORDER BY created_at DESC
       LIMIT 1`,
      [broadcastId]
    );

    const meta = auditRes.rows[0] && auditRes.rows[0].meta ? auditRes.rows[0].meta : {};
    const savedTelegramIds = Array.isArray(meta.telegram_ids) ? meta.telegram_ids : [];
    const savedChatIds = Array.isArray(meta.chat_ids) ? meta.chat_ids : [];

    let recipientIds = [];
    const customIds = bodyTelegramIds.length > 0 ? bodyTelegramIds : savedTelegramIds;
    const groupIds = bodyChatIds.length > 0 ? bodyChatIds : savedChatIds;
    const isCustom = customIds.length > 0;
    const isGroups = broadcast.segment === "GROUPS" || groupIds.length > 0;
    const isChannels = broadcast.segment === "CHANNELS" || groupIds.length > 0;

    if (isGroups || isChannels) {
      recipientIds = Array.from(new Set(groupIds.map((id) => String(id))));
    } else if (isCustom) {
      const uniqueIds = Array.from(new Set(customIds.map((id) => String(id))));
      const bannedRes = await pool.query(
        "SELECT telegram_id FROM user_bans WHERE telegram_id = ANY($1::bigint[])",
        [uniqueIds]
      );
      const bannedSet = new Set(bannedRes.rows.map((row) => String(row.telegram_id)));
      recipientIds = uniqueIds.filter((id) => !bannedSet.has(String(id)));
    } else if (broadcast.segment === "BUYERS_AFFILIATES") {
      const usersRes = await pool.query(
        `SELECT DISTINCT u.telegram_id
         FROM users u
         LEFT JOIN user_bans b ON b.telegram_id = u.telegram_id
         LEFT JOIN orders o ON o.user_id = u.id AND o.status IN ('PAID', 'DELIVERED')
         LEFT JOIN affiliates a ON a.user_id = u.id AND a.status = 'APPROVED'
         WHERE b.telegram_id IS NULL
           AND u.telegram_id IS NOT NULL
           AND u.telegram_id <> 90000000000
           AND (o.id IS NOT NULL OR a.id IS NOT NULL)`
      );
      recipientIds = usersRes.rows.map((row) => String(row.telegram_id));
    } else if (broadcast.segment === "BUYERS") {
      const usersRes = await pool.query(
        `SELECT DISTINCT u.telegram_id
         FROM users u
         JOIN orders o ON o.user_id = u.id AND o.status IN ('PAID', 'DELIVERED')
         LEFT JOIN user_bans b ON b.telegram_id = u.telegram_id
         WHERE b.telegram_id IS NULL
           AND u.telegram_id IS NOT NULL
           AND u.telegram_id <> 90000000000`
      );
      recipientIds = usersRes.rows.map((row) => String(row.telegram_id));
    } else if (broadcast.segment === "AFFILIATES") {
      const usersRes = await pool.query(
        `SELECT DISTINCT u.telegram_id
         FROM affiliates a
         JOIN users u ON u.id = a.user_id
         LEFT JOIN user_bans b ON b.telegram_id = u.telegram_id
         WHERE a.status = 'APPROVED'
           AND b.telegram_id IS NULL
           AND u.telegram_id IS NOT NULL
           AND u.telegram_id <> 90000000000`
      );
      recipientIds = usersRes.rows.map((row) => String(row.telegram_id));
    } else {
      const usersRes = await pool.query(
        `SELECT u.telegram_id
         FROM users u
         LEFT JOIN user_bans b ON b.telegram_id = u.telegram_id
         WHERE b.telegram_id IS NULL
           AND u.telegram_id IS NOT NULL
           AND u.telegram_id <> 90000000000`
      );
      recipientIds = Array.from(
        new Set(usersRes.rows.map((row) => String(row.telegram_id)))
      );
    }

    const targetCount = recipientIds.length;
    const batchSize = 25;
    const batchDelayMs = 75;
    let sentCount = 0;
    let failedCount = 0;

    const formattedMessage = formatBroadcastMessage(broadcast.message_text);
    const buttons = Array.isArray(broadcast.buttons) ? broadcast.buttons : [];
    const replyMarkup = buildInlineKeyboard(buttons);
    const messageOptions = replyMarkup
      ? { parse_mode: "HTML", reply_markup: replyMarkup }
      : { parse_mode: "HTML" };

    for (let i = 0; i < recipientIds.length; i += batchSize) {
      const batch = recipientIds.slice(i, i + batchSize);
      for (const telegramId of batch) {
        try {
          if (broadcast.image_path) {
            await sendPhoto(telegramId, {
              path: broadcast.image_path,
              filename: broadcast.image_filename || undefined,
              caption: formattedMessage,
              parse_mode: "HTML",
              reply_markup: replyMarkup || undefined,
            });
          } else {
            await sendMessage(telegramId, formattedMessage, messageOptions);
          }
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
        segment: mapBroadcastSegment(
          updatedRes.rows[0].segment,
          isCustom || isGroups || isChannels
        ),
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
