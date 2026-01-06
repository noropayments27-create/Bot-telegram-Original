const express = require("express");
const {
  upsertTelegramUser,
  getUserByTelegramId,
} = require("./users.controller");

const router = express.Router();

router.post("/telegram/upsert", upsertTelegramUser);
router.get("/:telegram_id", getUserByTelegramId);

module.exports = router;
