const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

let playwright;
try {
  playwright = require("playwright");
} catch (e) {
  playwright = null;
}

const RECEIPT_LABELS = {
  es: {
    receipt_title: "RECIBO DE PAGO",
    order_number: "Número de orden:",
    telegram_id: "Telegram ID:",
    username: "Username:",
    whatsapp: "Whatsapp:",
    date: "Fecha:",
    description: "Descripción",
    value: "Valor",
    subtotal: "Sub-total",
    commission: "Comisión",
    total: "Total",
    referred_by: "Referido de:",
    thank_you: "Gracias<br>Por Tu Compra",
    total_in: "Total en",
  },
  en: {
    receipt_title: "RECEIPT",
    order_number: "Order Number:",
    telegram_id: "Telegram ID:",
    username: "Username:",
    whatsapp: "Whatsapp:",
    date: "Date:",
    description: "Description",
    value: "Value",
    subtotal: "Sub-total",
    commission: "Commission",
    total: "Total",
    referred_by: "Referred by:",
    thank_you: "Thank you<br>For Your Purchase",
    total_in: "Total in",
  },
};

async function loadTemplate() {
  const templatePath = path.join(__dirname, "..", "templates", "recibo.html");
  return fs.readFile(templatePath, "utf-8");
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMoney(value) {
  // mantiene simple: string o number -> string
  if (value == null) return "0";
  if (typeof value === "number") {
    return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  return String(value);
}

function formatUsdLabel(value, allowFree = false) {
  const numeric = Number(value ?? 0);
  if (allowFree && Number.isFinite(numeric) && numeric <= 0) {
    return "Gratis";
  }
  return `${formatMoney(value)} USD`;
}

function cleanProductName(name) {
  let s = String(name ?? "");
  // Quitar prefijo "SHOP 02 - " / "shop 2 - "
  s = s.replace(/^\s*SHOP\s*\d+\s*-\s*/i, "");
  // Quitar emojis / pictográficos (Node soporta \p con flag u)
  try {
    s = s.replace(/\p{Extended_Pictographic}+/gu, "");
  } catch (e) {
    // fallback si la runtime no soporta la clase
    s = s.replace(/[\u{1F300}-\u{1FAFF}]/gu, "");
  }
  // Quitar guiones sobrantes al inicio
  s = s.replace(/^\s*-\s*/, "");
  // Normalizar espacios
  s = s.replace(/\s{2,}/g, " ").trim();
  return s || "Item";
}

function buildItemRowsHtml(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<tr><td>${escapeHtml("Producto")}</td><td>${escapeHtml("0 USD")}</td></tr>`;
  }
  return items
    .map((it) => {
      const rawName = cleanProductName(it.name ?? it.product_name ?? "Item");
      const qty = Number(it.qty ?? 0);
      const nameText = qty > 1 ? `${rawName} x${qty}` : rawName;
      const name = escapeHtml(nameText);
      const price = escapeHtml(formatUsdLabel(it.price ?? it.unit_price ?? it.product_price ?? 0, true));
      return `<tr><td>${name}</td><td>${price}</td></tr>`;
    })
    .join("");
}

function applyTokens(template, tokens) {
  let out = template;
  for (const [key, val] of Object.entries(tokens)) {
    out = out.split(`{{${key}}}`).join(String(val));
  }
  return out;
}

/**
 * renderReceiptPng
 * @param {Object} data
 * @param {string} data.orderId
 * @param {string|number} data.telegramId
 * @param {string} data.username
 * @param {string} data.dateTime
 * @param {Array} data.items  [{name, price}]
 * @param {string|number} data.subtotal
 * @param {string|number} data.commission
 * @param {string|number} data.total
 * @param {string} data.referredBy
 * @param {string} data.orderNumber
 * @param {Object} data.localTotal  {currency, amount}
 * @param {string} data.locale
 */
async function renderReceiptPng(data) {
  if (!playwright) {
    throw new Error("playwright_not_installed");
  }

  const template = await loadTemplate();
  const locale = data.locale || "es";
  const labels = RECEIPT_LABELS[locale] || RECEIPT_LABELS.es;

  let localTotalLine = "";
  if (data.localTotal && data.localTotal.currency && data.localTotal.amount != null) {
    const currency = data.localTotal.currency;
    let amountStr = "";
    if (currency === "COP" || currency === "MXN") {
      amountStr = Math.floor(data.localTotal.amount).toLocaleString(locale === "es" ? "es-CO" : "en-US");
    } else {
      // Crypto: trim decimals
      amountStr = data.localTotal.amount.toFixed(currency === "BTC" || currency === "LTC" ? 8 : 2).replace(/\.?0+$/, "");
    }
    localTotalLine = `<div><span>${labels.total_in} ${currency}</span> <span>${amountStr} ${currency}</span></div>`;
  }

  const html = applyTokens(template, {
    RECEIPT_TITLE: labels.receipt_title,
    ORDER_NUMBER_LABEL: labels.order_number,
    ORDER_NUMBER: escapeHtml(data.orderNumber || "-"),
    TELEGRAM_ID_LABEL: labels.telegram_id,
    TELEGRAM_ID: escapeHtml(data.telegramId),
    USERNAME_LABEL: labels.username,
    USERNAME: escapeHtml(data.username || "N/A"),
    WHATSAPP_LABEL: labels.whatsapp,
    DATE_LABEL: labels.date,
    DATE_TIME: escapeHtml(data.dateTime || new Date().toLocaleString()),
    DESCRIPTION_LABEL: labels.description,
    VALUE_LABEL: labels.value,
    ITEM_ROWS_HTML: buildItemRowsHtml(data.items || []),
    SUBTOTAL_LABEL: labels.subtotal,
    SUBTOTAL: escapeHtml(formatUsdLabel(data.subtotal, true)),
    COMMISSION_LABEL: labels.commission,
    COMMISSION: escapeHtml(`${formatMoney(data.commission ?? 0)} USD`),
    TOTAL_LABEL: labels.total,
    TOTAL: escapeHtml(formatUsdLabel(data.total, true)),
    LOCAL_TOTAL_LINE: localTotalLine,
    REFERRED_BY_LABEL: labels.referred_by,
    REFERRED_BY: escapeHtml(data.referredBy || "N/A"),
    THANK_YOU: labels.thank_you,
  });

  const tmpName = `receipt-${crypto.randomBytes(8).toString("hex")}.png`;
  const pngPath = path.join(os.tmpdir(), tmpName);

  let browser;
  try {
    browser = await playwright.chromium.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage({
      viewport: { width: 420, height: 800 },
      deviceScaleFactor: 2,
    });

    await page.setContent(html, { waitUntil: "load" });
    await page.waitForSelector(".receipt", { timeout: 5000 });

    const receipt = page.locator(".receipt");
    await receipt.screenshot({ path: pngPath, omitBackground: true });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  return {
    pngPath,
    cleanup: async () => {
      await fs.unlink(pngPath).catch(() => {});
    },
  };
}

module.exports = { renderReceiptPng };
