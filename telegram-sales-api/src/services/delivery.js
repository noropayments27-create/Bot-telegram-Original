const { sendMessage, sendPhoto, sendVideo, sendDocument } = require("./telegram");

const DEFAULT_UNITS_TEMPLATE = `<b>{{title}}</b>

👤 <b>Usuario:</b> <code>{{username}}</code>
🔑 <b>Password:</b> <code>{{password}}</code>

🗓 <b>Inicio:</b> <code>{{start_at}}</code>
⏳ <b>Expira:</b> <code>{{expires_at}}</code>

📝 <b>Nota:</b> {{notes}}

🧾 <b>Comprador:</b> <code>{{buyer_telegram_id}}</code>{{buyer_username_line}}`;

function normalizeDelay(value, fallbackMs) {
  if (value === undefined || value === null || value === "") {
    return fallbackMs;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallbackMs;
  }
  return Math.max(parsed, 0);
}

const DELIVERY_INITIAL_DELAY_MS = normalizeDelay(
  process.env.DELIVERY_INITIAL_DELAY_MS,
  10000
);
const DELIVERY_MESSAGE_INTERVAL_MS = normalizeDelay(
  process.env.DELIVERY_MESSAGE_INTERVAL_MS,
  1000
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderTemplate(template, data) {
  const rawKeys = new Set(["buyer_username_line"]);
  return String(template || "").replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) =>
    rawKeys.has(key) ? data[key] ?? "" : escapeHtml(data[key] ?? "")
  );
}

function normalizePayload(payload) {
  if (!payload) {
    return {};
  }
  if (typeof payload === "string") {
    try {
      return JSON.parse(payload);
    } catch (error) {
      return {};
    }
  }
  return payload;
}

function buildUnitsMessage(product, unit, telegramId) {
  const payload = normalizePayload(unit.payload);
  const rawBuyerUsername = payload.buyer_username || unit.held_by_username || "";
  const cleanedBuyerUsername = String(rawBuyerUsername || "").trim();
  const buyerUsernameLine = cleanedBuyerUsername
    ? `\n👤 <b>Username:</b> <code>@${escapeHtml(
        cleanedBuyerUsername.replace(/^@/, "")
      )}</code>`
    : "";
  const notes = payload.notes ? String(payload.notes).trim() : "";
  const data = {
    title: product.name || "",
    ...payload,
    notes: notes || "—",
    buyer_telegram_id: telegramId,
    buyer_username: cleanedBuyerUsername,
    buyer_username_line: buyerUsernameLine,
  };
  const template = product.delivery_template || DEFAULT_UNITS_TEMPLATE;
  return renderTemplate(template, data);
}

function resolveMediaPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return {};
  }
  return {
    file_id: payload.telegram_file_id || payload.file_id,
    url: payload.url,
    path: payload.path,
    filename: payload.filename,
  };
}

async function deliverProductToTelegram({ telegramId, product, quantity, units }) {
  let deliveriesCount = 0;
  const payload = normalizePayload(product.delivery_payload);

  if (product.stock_mode === "UNITS") {
    if (!Array.isArray(units) || units.length < quantity) {
      throw new Error("UNITS_NOT_AVAILABLE");
    }
    for (const unit of units.slice(0, quantity)) {
      const text = buildUnitsMessage(product, unit, telegramId);
      await sendMessage(telegramId, text, { parse_mode: "HTML" });
      deliveriesCount += 1;
      await sleep(DELIVERY_MESSAGE_INTERVAL_MS);
    }
    return deliveriesCount;
  }

  if (product.delivery_type === "TEXT") {
    const text =
      payload.text || payload.message || payload.content || payload.body || "";
    if (!text) {
      throw new Error("DELIVERY_TEXT_EMPTY");
    }
    const message =
      quantity > 1 ? `x${quantity}\n\n${text}` : text;
    await sendMessage(telegramId, message, { parse_mode: "HTML" });
    deliveriesCount += 1;
    await sleep(DELIVERY_MESSAGE_INTERVAL_MS);
    return deliveriesCount;
  }

  if (product.delivery_type === "LINK") {
    const url = payload.url || "";
    if (!url) {
      throw new Error("DELIVERY_LINK_EMPTY");
    }
    const message =
      quantity > 1 ? `x${quantity}\n\n${url}` : url;
    await sendMessage(telegramId, message, { parse_mode: "HTML" });
    deliveriesCount += 1;
    await sleep(DELIVERY_MESSAGE_INTERVAL_MS);
    return deliveriesCount;
  }

  if (product.delivery_type === "EXPIRING_LINK") {
    const url = payload.url || "";
    const expiresAt = payload.expires_at || payload.expires || "";
    if (!url) {
      throw new Error("DELIVERY_LINK_EMPTY");
    }
    const note = expiresAt ? `\n\nExpira: ${expiresAt}` : "";
    const message =
      quantity > 1 ? `x${quantity}\n\n${url}${note}` : `${url}${note}`;
    await sendMessage(telegramId, message, { parse_mode: "HTML" });
    deliveriesCount += 1;
    await sleep(DELIVERY_MESSAGE_INTERVAL_MS);
    return deliveriesCount;
  }

  if (quantity > 1) {
    await sendMessage(telegramId, `Cantidad: x${quantity}`, {
      parse_mode: "HTML",
    });
    deliveriesCount += 1;
    await sleep(DELIVERY_MESSAGE_INTERVAL_MS);
  }

  const mediaPayload = resolveMediaPayload(payload);
  if (product.delivery_type === "IMAGE") {
    await sendPhoto(telegramId, mediaPayload);
    deliveriesCount += 1;
    await sleep(DELIVERY_MESSAGE_INTERVAL_MS);
    return deliveriesCount;
  }
  if (product.delivery_type === "VIDEO") {
    await sendVideo(telegramId, mediaPayload);
    deliveriesCount += 1;
    await sleep(DELIVERY_MESSAGE_INTERVAL_MS);
    return deliveriesCount;
  }
  if (product.delivery_type === "FILE") {
    await sendDocument(telegramId, mediaPayload);
    deliveriesCount += 1;
    await sleep(DELIVERY_MESSAGE_INTERVAL_MS);
    return deliveriesCount;
  }

  throw new Error("DELIVERY_TYPE_UNSUPPORTED");
}

async function deliverOrderToTelegram({ dbClient, orderId, telegramId }) {
  try {
    const itemsRes = await dbClient.query(
      `SELECT oi.product_id, oi.qty
       FROM order_items oi
       WHERE oi.order_id = $1
       ORDER BY oi.created_at ASC`,
      [orderId]
    );

    if (itemsRes.rowCount === 0) {
      return { delivered: false, error: "ORDER_ITEMS_NOT_FOUND" };
    }

    const productIds = itemsRes.rows.map((row) => row.product_id);
    const productsRes = await dbClient.query(
      `SELECT id, name, delivery_type, delivery_payload, delivery_template, stock_mode
       FROM products
       WHERE id = ANY($1)`,
      [productIds]
    );

    const productsById = new Map(
      productsRes.rows.map((row) => [row.id, row])
    );

    let deliveriesCount = 0;

    await sleep(DELIVERY_INITIAL_DELAY_MS);

    for (const item of itemsRes.rows) {
      const product = productsById.get(item.product_id);
      if (!product) {
        return { delivered: false, error: "PRODUCT_NOT_FOUND" };
      }
      const qty = Number(item.qty);
      if (!Number.isFinite(qty) || qty <= 0) {
        continue;
      }

      let units = null;
      if (product.stock_mode === "UNITS") {
        const unitsRes = await dbClient.query(
          `SELECT id, payload, held_by_username
           FROM product_stock_units
           WHERE held_by_order_id = $1
             AND product_id = $2
             AND status = 'DELIVERED'
           ORDER BY created_at ASC`,
          [orderId, item.product_id]
        );
        if (unitsRes.rowCount < qty) {
          return { delivered: false, error: "UNITS_NOT_AVAILABLE" };
        }
        units = unitsRes.rows;
      }

      deliveriesCount += await deliverProductToTelegram({
        telegramId,
        product,
        quantity: qty,
        units,
      });
    }

    return { delivered: true, deliveries_count: deliveriesCount };
  } catch (error) {
    return {
      delivered: false,
      error: error?.message || "DELIVERY_FAILED",
    };
  }
}

module.exports = {
  deliverOrderToTelegram,
  deliverProductToTelegram,
  renderTemplate,
};
