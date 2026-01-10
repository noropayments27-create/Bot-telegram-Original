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
  if (typeof value === "number") return value.toFixed(2);
  return String(value);
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
    return `<tr><td>${escapeHtml("Producto")}</td><td>${escapeHtml("0")}</td></tr>`;
  }
  return items
    .map((it) => {
      const rawName = cleanProductName(it.name ?? it.product_name ?? "Item");
      const qty = Number(it.qty ?? 0);
      const nameText = qty > 1 ? `${rawName} x${qty}` : rawName;
      const name = escapeHtml(nameText);
      const price = escapeHtml(formatMoney(it.price ?? it.unit_price ?? it.product_price ?? 0));
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
 */
async function renderReceiptPng(data) {
  if (!playwright) {
    throw new Error("playwright_not_installed");
  }

  const template = await loadTemplate();

  const html = applyTokens(template, {
    ORDER_ID: escapeHtml(data.orderId),
    ORDER_NUMBER: escapeHtml(data.orderNumber || "-"),
    TELEGRAM_ID: escapeHtml(data.telegramId),
    USERNAME: escapeHtml(data.username || "N/A"),
    DATE_TIME: escapeHtml(data.dateTime || new Date().toLocaleString()),
    REFERRED_BY: escapeHtml(data.referredBy || "N/A"),
    ITEM_ROWS_HTML: buildItemRowsHtml(data.items || []),
    SUBTOTAL: escapeHtml(formatMoney(data.subtotal)),
    COMMISSION: escapeHtml(formatMoney(data.commission ?? 0)),
    TOTAL: escapeHtml(formatMoney(data.total)),
  });

  const tmpName = `receipt-${crypto.randomBytes(8).toString("hex")}.png`;
  const pngPath = path.join(os.tmpdir(), tmpName);

  let browser;
  try {
    browser = await playwright.chromium.launch();
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
