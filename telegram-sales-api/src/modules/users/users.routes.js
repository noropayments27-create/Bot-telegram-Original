const express = require("express");
const {
  upsertTelegramUser,
  getUserByTelegramId,
  updateUserLocale,
} = require("./users.controller");

const router = express.Router();

router.post("/telegram/upsert", upsertTelegramUser);
router.get("/:telegram_id", getUserByTelegramId);
router.patch("/:telegram_id/locale", updateUserLocale);

module.exports = router;
