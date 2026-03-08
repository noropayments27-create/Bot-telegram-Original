const { sendMessage } = require("./telegram");

const DEFAULT_COOLDOWN_SECONDS = 300;
const lastAlertByKey = new Map();

function isEnabled() {
  return String(process.env.OPS_ALERTS_ENABLED || "").trim().toLowerCase() === "true";
}

function parseAdminTelegramIds() {
  const value = String(process.env.ADMIN_TELEGRAM_IDS || "");
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item && /^[0-9]+$/.test(item))
    .map((item) => Number(item));
}

function getClientIp(req) {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return forwarded[0] || req.ip || "unknown";
}

function sanitizeMessage(value, max = 300) {
  const raw = String(value || "").replace(/\s+/g, " ").trim();
  if (!raw) {
    return "";
  }
  if (raw.length <= max) {
    return raw;
  }
  return `${raw.slice(0, max)}...`;
}

function buildAlertKey(req, status, err) {
  const method = String(req.method || "GET").toUpperCase();
  const route = String(req.originalUrl || req.url || "/");
  const code = String(err?.code || err?.name || "ERR");
  return `${status}:${method}:${route}:${code}`;
}

function shouldSendNow(key) {
  const cooldownSeconds = Math.max(
    Number.parseInt(process.env.OPS_ALERTS_COOLDOWN_SECONDS || "", 10) || DEFAULT_COOLDOWN_SECONDS,
    10
  );
  const now = Date.now();
  const lastSent = Number(lastAlertByKey.get(key) || 0);
  if (lastSent > 0 && now - lastSent < cooldownSeconds * 1000) {
    return false;
  }
  lastAlertByKey.set(key, now);
  return true;
}

async function notifyApiError(req, err, status = 500) {
  if (!isEnabled()) {
    return;
  }
  if (Number(status) < 500) {
    return;
  }

  const admins = parseAdminTelegramIds();
  if (admins.length === 0) {
    return;
  }

  const key = buildAlertKey(req, status, err);
  if (!shouldSendNow(key)) {
    return;
  }

  const service = String(process.env.OPS_ALERTS_SERVICE || "telegram-sales-api").trim();
  const method = String(req.method || "GET").toUpperCase();
  const route = String(req.originalUrl || req.url || "/");
  const ip = getClientIp(req);
  const errorCode = sanitizeMessage(err?.code || err?.name || "-", 80);
  const errorMessage = sanitizeMessage(err?.message || "Internal Server Error", 240);
  const userAgent = sanitizeMessage(req.headers?.["user-agent"] || "-", 150);

  const text = [
    "🚨 Alerta operativa",
    "",
    `Servicio: ${service}`,
    `Estado: ${status}`,
    `Ruta: ${method} ${route}`,
    `IP: ${ip}`,
    `Error: ${errorCode}`,
    `Mensaje: ${errorMessage}`,
    `UA: ${userAgent}`,
  ].join("\n");

  await Promise.all(
    admins.map((adminId) =>
      sendMessage(adminId, text).catch((sendErr) => {
        console.error("[ops-alert] telegram send failed", {
          adminId,
          message: sendErr?.message || String(sendErr),
        });
      })
    )
  );
}

module.exports = {
  notifyApiError,
};

