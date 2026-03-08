const { getPool } = require("../db");
const { sendMessage } = require("./telegram");
const { ensureFreeOrderSchema } = require("./freeOrders");

let timer = null;
let running = false;
let cachedBotUsername = "";
let cachedBotUsernameAt = 0;
const BOT_USERNAME_CACHE_TTL_MS = 10 * 60 * 1000;
const FOLLOWUP_NOTIFIED_ORDERS = new Set();

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildProductToken(order) {
  const productCode = String(order?.product_code || "").trim().toUpperCase();
  if (/^[0-9A-Za-z_-]{2,40}$/.test(productCode)) {
    return productCode;
  }
  const productId = String(order?.product_id || "").trim();
  if (/^[0-9A-Za-z_-]{2,40}$/.test(productId)) {
    return productId;
  }
  return "";
}

async function resolveBotUsername() {
  const configured = String(
    process.env.BOT_USERNAME
      || process.env.NEXT_PUBLIC_BOT_USERNAME
      || process.env.TELEGRAM_BOT_USERNAME
      || ""
  )
    .replace(/^@/, "")
    .trim();
  if (configured) {
    return configured;
  }

  const now = Date.now();
  if (cachedBotUsername && now - cachedBotUsernameAt < BOT_USERNAME_CACHE_TTL_MS) {
    return cachedBotUsername;
  }

  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) {
    return "";
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await response.json();
    const username = String(data?.result?.username || "")
      .replace(/^@/, "")
      .trim();
    if (response.ok && data?.ok && username) {
      cachedBotUsername = username;
      cachedBotUsernameAt = now;
      return username;
    }
  } catch (error) {
    console.error("[order-expiry] getMe failed:", error);
  }

  return "";
}

function buildProductStartLink(order, botUsername) {
  if (!botUsername) {
    return "";
  }
  const token = buildProductToken(order);
  if (!token) {
    return "";
  }
  return `https://t.me/${botUsername}?start=p${token}`;
}

function buildOrderExpiredMessage(order) {
  const productName = escapeHtml(order?.product_name || "Producto no disponible");
  return (
    "👀 <b>Detectamos que intentaste comprar:</b>\n"
    + `🛒 <b>(${productName})</b>\n\n`
    + "Si aún estás interesado, puedes <b>realizar la compra nuevamente</b> desde el bot.\n\n"
    + "💬 Si necesitas <b>más información o asistencia</b>, no dudes en comunicarte con el administrador:\n"
    + "👉 <b>@Noropayments</b>\n\n"
    + "Estamos aquí para ayudarte. 🚀"
  );
}

function buildOrderExpiredKeyboard(order, botUsername) {
  const link = buildProductStartLink(order, botUsername);
  if (!link) {
    return undefined;
  }
  return {
    inline_keyboard: [[{ text: "Comprar Producto", url: link }]],
  };
}

async function sendOrderExpiredMessage(order) {
  const botUsername = await resolveBotUsername();
  const text = buildOrderExpiredMessage(order);
  const replyMarkup = buildOrderExpiredKeyboard(order, botUsername);
  const options = {
    parse_mode: "HTML",
  };
  if (replyMarkup) {
    options.reply_markup = replyMarkup;
  }
  await sendMessage(order.telegram_id, text, options);
}

async function sendOrderExpiredNotice(order) {
  const text = "⏰ Tu pedido expiró por falta de pago. El stock fue liberado.";
  await sendMessage(order.telegram_id, text);
}

function scheduleOrderExpiredMessage(order) {
  const orderId = String(order?.id || "").trim();
  if (!orderId) {
    return;
  }
  if (FOLLOWUP_NOTIFIED_ORDERS.has(orderId)) {
    return;
  }
  FOLLOWUP_NOTIFIED_ORDERS.add(orderId);
  const notifyDelayMs = Math.max(
    parseInt(process.env.ORDER_EXPIRY_NOTIFY_DELAY_MS || "60000", 10) || 60000,
    0
  );
  setTimeout(() => {
    sendOrderExpiredMessage(order).catch((error) => {
      console.error("[order-expiry] telegram notify failed:", error);
    });
    setTimeout(() => {
      FOLLOWUP_NOTIFIED_ORDERS.delete(orderId);
    }, 24 * 60 * 60 * 1000);
  }, notifyDelayMs);
}

async function expireWaitingPaymentOrders() {
  if (running) {
    return;
  }
  running = true;

  const expirySeconds = Math.max(
    parseInt(process.env.ORDER_EXPIRY_SECONDS || "", 10)
      || (parseInt(process.env.ORDER_EXPIRY_MINUTES || "", 10) || 0) * 60
      || 10,
    1
  );
  const pool = getPool();
  let client;
  const expiredOrders = [];

  try {
    await ensureFreeOrderSchema(pool);
    client = await pool.connect();
    await client.query("BEGIN");

    const ordersRes = await client.query(
      `SELECT o.id,
              o.product_id,
              p.code AS product_code,
              p.name AS product_name,
              u.telegram_id
       FROM orders o
       JOIN products p ON p.id = o.product_id
       JOIN users u ON u.id = o.user_id
       WHERE o.status = 'WAITING_PAYMENT'
         AND o.free_order_number IS NULL
         AND COALESCE(o.unit_price_at_purchase, 0) > 0
         AND o.created_at <= now() - ($1 * interval '1 second')
         AND NOT EXISTS (
           SELECT 1 FROM order_payments op WHERE op.order_id = o.id
         )
       FOR UPDATE SKIP LOCKED`,
      [expirySeconds]
    );

    for (const order of ordersRes.rows) {
      const updateRes = await client.query(
        `UPDATE orders
         SET status = 'EXPIRED',
             cancelled_at = now(),
             cancel_source = 'EXPIRED',
             order_number = NULL
         WHERE id = $1 AND status = 'WAITING_PAYMENT'
         RETURNING id`,
        [order.id]
      );

      if (updateRes.rowCount === 0) {
        continue;
      }

      await client.query(
        `UPDATE product_stock_units
         SET status = 'AVAILABLE',
             held_by_order_id = NULL,
             held_by_telegram_id = NULL,
             held_by_username = NULL,
             held_at = NULL
         WHERE held_by_order_id = $1 AND status = 'HELD'`,
        [order.id]
      );

      await client.query(
        `UPDATE product_stock_holds
         SET status = 'EXPIRED', updated_at = now()
         WHERE order_id = $1 AND status = 'HELD'`,
        [order.id]
      );

      expiredOrders.push(order);
      console.log("[stock/hold] expired", { order_id: order.id });
    }

    await client.query("COMMIT");
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("[order-expiry] rollback failed:", rollbackError);
      }
    }
    console.error("[order-expiry] failed:", error);
  } finally {
    if (client) {
      client.release();
    }
    running = false;
  }

  const notifyTelegram = String(
    process.env.ORDER_EXPIRY_NOTIFY_TELEGRAM || "true"
  ).toLowerCase() !== "false";
  if (notifyTelegram) {
    for (const order of expiredOrders) {
      try {
        await sendOrderExpiredNotice(order);
        scheduleOrderExpiredMessage(order);
      } catch (error) {
        console.error("[order-expiry] telegram immediate notify failed:", error);
      }
    }
  }

  if (expiredOrders.length > 0) {
    console.log(`[order-expiry] expired ${expiredOrders.length} orders`);
  }
}

function startOrderExpiryJob() {
  if (timer) {
    return timer;
  }
  const intervalMs = Math.max(
    parseInt(process.env.ORDER_EXPIRY_INTERVAL_MS || "60000", 10) || 60000,
    1000
  );
  timer = setInterval(expireWaitingPaymentOrders, intervalMs);
  expireWaitingPaymentOrders();
  return timer;
}

module.exports = { startOrderExpiryJob };
