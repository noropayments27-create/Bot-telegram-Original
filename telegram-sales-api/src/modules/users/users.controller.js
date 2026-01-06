const { getPool } = require("../../db");

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === "string" && UUID_REGEX.test(value);
}

async function resolveAffiliateId(client, startAffiliateCode, telegramId) {
  let affiliateId = null;

  if (isUuid(startAffiliateCode)) {
    const res = await client.query(
      `SELECT a.id, u.telegram_id
       FROM affiliates a
       JOIN users u ON u.id = a.user_id
       WHERE a.id = $1
       LIMIT 1`,
      [startAffiliateCode]
    );

    if (res.rowCount > 0) {
      const row = res.rows[0];
      if (Number(row.telegram_id) !== Number(telegramId)) {
        affiliateId = row.id;
      }
    }
  }

  if (!affiliateId) {
    const fallback = await client.query(
      `SELECT id
       FROM affiliates
       ORDER BY created_at ASC
       LIMIT 1`
    );

    if (fallback.rowCount > 0) {
      // Fallback: use the earliest affiliate as default admin when no code exists.
      affiliateId = fallback.rows[0].id;
    }
  }

  return affiliateId;
}

async function isUserBanned(client, telegramId) {
  const banRes = await client.query(
    "SELECT 1 FROM user_bans WHERE telegram_id = $1 LIMIT 1",
    [telegramId]
  );
  return banRes.rowCount > 0;
}

async function upsertTelegramUser(req, res, next) {
  const telegramId = Number(req.body.telegram_id);
  const username = req.body.username || null;
  const startAffiliateCode =
    req.body.start_affiliate_code || req.body.start_payload || null;

  if (!Number.isFinite(telegramId)) {
    return res.status(400).json({ error: "telegram_id is required" });
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (await isUserBanned(client, telegramId)) {
      await client.query("ROLLBACK");
      return res.status(403).json({ status: "banned" });
    }

    const affiliateId = await resolveAffiliateId(
      client,
      startAffiliateCode,
      telegramId
    );
    const referredAt = affiliateId ? new Date() : null;

    const upserted = await client.query(
      `INSERT INTO users
        (telegram_id, telegram_username, referred_by_affiliate_id, referred_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (telegram_id)
       DO UPDATE SET telegram_username = EXCLUDED.telegram_username
       RETURNING *, (xmax = 0) AS is_new`,
      [telegramId, username, affiliateId, referredAt]
    );

    await client.query("COMMIT");
    const row = upserted.rows[0];
    const isNew = row.is_new;
    const affiliateAssigned = isNew
      ? affiliateId
      : row.referred_by_affiliate_id;
    return res.status(isNew ? 201 : 200).json({
      user: row,
      is_new: isNew,
      affiliate_assigned: affiliateAssigned,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
}

async function getUserByTelegramId(req, res, next) {
  const telegramId = Number(req.params.telegram_id);

  if (!Number.isFinite(telegramId)) {
    return res.status(400).json({ error: "telegram_id is required" });
  }

  try {
    const pool = getPool();
    const result = await pool.query(
      "SELECT * FROM users WHERE telegram_id = $1",
      [telegramId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.status(200).json({ user: result.rows[0] });
  } catch (error) {
    return next(error);
  }
}

module.exports = { upsertTelegramUser, getUserByTelegramId };
