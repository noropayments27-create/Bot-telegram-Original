const express = require("express");
const { getPool } = require("../db");
const { getMaintenanceStatus } = require("../services/maintenance");

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

module.exports = router;
