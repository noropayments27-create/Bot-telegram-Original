const express = require("express");
const {
  upsertTelegramUser,
  getUserByTelegramId,
  updateUserLocale,
  getUserBanStatus,
} = require("./users.controller");

const router = express.Router();

router.post("/telegram/upsert", upsertTelegramUser);
router.get("/:telegram_id", getUserByTelegramId);
router.get("/:telegram_id/ban", getUserBanStatus);
router.patch("/:telegram_id/locale", updateUserLocale);

module.exports = router;
