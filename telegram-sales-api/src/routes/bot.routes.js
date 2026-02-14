const express = require("express");
const { getPool } = require("../db");
const { getMaintenanceStatus } = require("../services/maintenance");
const { getBotAssets } = require("../services/botAssets");
const { getAdminLayout } = require("../services/adminLayouts");

const router = express.Router();

function requireBotSecret(req, res, next) {
  const secret = req.header("x-bot-secret");
  const expectedSecret = process.env.BOT_TO_API_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }
  return next();
}

router.get("/maintenance", requireBotSecret, async (req, res, next) => {
  const pool = getPool();
  try {
    const active = await getMaintenanceStatus(pool);
    return res.json({ active });
  } catch (error) {
    return next(error);
  }
});

router.get("/assets", requireBotSecret, async (req, res, next) => {
  const pool = getPool();
  try {
    const assets = await getBotAssets(pool);
    return res.json({ assets });
  } catch (error) {
    return next(error);
  }
});

router.get("/layouts/:key", requireBotSecret, async (req, res, next) => {
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

module.exports = router;
