const express = require("express");
const {
  upsertTelegramUser,
  getUserByTelegramId,
  updateUserLocale,
  getUserBanStatus,
  getAffiliateStatus,
  getAffiliateTop,
  applyAffiliate,
  requestAffiliatePayout,
  decideAffiliateStatus,
  decideAffiliateInvoice,
} = require("./users.controller");

const router = express.Router();

function requireBotSecret(req, res, next) {
  const secret = req.header("x-bot-secret");
  const expectedSecret = process.env.BOT_TO_API_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }
  return next();
}

router.get("/affiliates/status", requireBotSecret, getAffiliateStatus);
router.get("/affiliates/top", requireBotSecret, getAffiliateTop);
router.post("/affiliates/apply", requireBotSecret, applyAffiliate);
router.post("/affiliates/withdraw", requireBotSecret, requestAffiliatePayout);
router.post("/affiliates/invoices/decision", requireBotSecret, decideAffiliateInvoice);
router.post("/affiliates/:id/decision", requireBotSecret, decideAffiliateStatus);
router.post("/telegram/upsert", upsertTelegramUser);
router.get("/:telegram_id", getUserByTelegramId);
router.get("/:telegram_id/ban", getUserBanStatus);
router.patch("/:telegram_id/locale", updateUserLocale);

module.exports = router;
