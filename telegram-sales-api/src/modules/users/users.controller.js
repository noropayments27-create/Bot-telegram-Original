const { getPool } = require("../../db");
const { sendMessage } = require("../../services/telegram");

function parseAdminTelegramIds() {
  const value = process.env.ADMIN_TELEGRAM_IDS || "";
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item && /^[0-9]+$/.test(item))
    .map((item) => Number(item));
}

function parseScammerTelegramIds() {
  const value = process.env.SCAMMER_TELEGRAM_IDS || "";
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item && /^[0-9]+$/.test(item))
    .map((item) => Number(item));
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === "string" && UUID_REGEX.test(value);
}

function normalizeLocale(input, languageCode) {
  const raw = (input || "").toString().trim().toLowerCase();
  if (raw === "es" || raw === "en") {
    return raw;
  }
  const lc = (languageCode || "").toString().toLowerCase();
  if (!lc) {
    return "es";
  }
  if (lc.startsWith("es")) {
    return "es";
  }
  return "en";
}

async function resolveAffiliateId(client, startAffiliateCode, telegramId) {
  let affiliateId = null;

  if (isUuid(startAffiliateCode)) {
    const res = await client.query(
      `SELECT a.id, u.telegram_id
       FROM affiliates a
       JOIN users u ON u.id = a.user_id
       WHERE a.id = $1 AND a.status = 'APPROVED'
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
    const adminIds = parseAdminTelegramIds();
    if (adminIds.length > 0) {
      const adminAffiliateRes = await client.query(
        `SELECT a.id
         FROM affiliates a
         JOIN users u ON u.id = a.user_id
         WHERE u.telegram_id = ANY($1::bigint[])
         ORDER BY a.created_at ASC
         LIMIT 1`,
        [adminIds]
      );
      if (adminAffiliateRes.rowCount > 0) {
        affiliateId = adminAffiliateRes.rows[0].id;
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
      // Fallback: use the earliest affiliate when no code or admin affiliate exists.
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
  const languageCode = req.body.language_code || null;
  const photoFileId = req.body.telegram_photo_file_id || null;
  const userLocale = normalizeLocale(req.body.locale, languageCode);
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
        (telegram_id, telegram_username, telegram_photo_file_id, referred_by_affiliate_id, referred_at, locale)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (telegram_id)
       DO UPDATE SET telegram_username = EXCLUDED.telegram_username,
                     telegram_photo_file_id = COALESCE(EXCLUDED.telegram_photo_file_id, users.telegram_photo_file_id),
                     locale = COALESCE(EXCLUDED.locale, users.locale)
       RETURNING *, (xmax = 0) AS is_new`,
      [telegramId, username, photoFileId, affiliateId, referredAt, userLocale]
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

async function updateUserLocale(req, res) {
  const telegramId = Number(req.params.telegram_id);
  const userLocale = normalizeLocale(req.body && req.body.locale, null);

  if (!Number.isFinite(telegramId)) {
    return res.status(400).json({ error: "telegram_id is required" });
  }

  try {
    const pool = getPool();
    const result = await pool.query(
      "UPDATE users SET locale = $1 WHERE telegram_id = $2 RETURNING telegram_id, locale",
      [userLocale, telegramId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "USER_NOT_FOUND" });
    }
    return res.json({
      ok: true,
      telegram_id: telegramId,
      locale: result.rows[0].locale,
    });
  } catch (error) {
    return res.status(500).json({ error: "UPDATE_LOCALE_FAILED" });
  }
}

async function getAffiliateStatus(req, res, next) {
  const telegramId = Number(req.query.telegram_id);
  if (!Number.isFinite(telegramId)) {
    return res.status(400).json({ error: "telegram_id is required" });
  }
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT a.*, u.telegram_id, u.telegram_username
       FROM affiliates a
       JOIN users u ON u.id = a.user_id
       WHERE u.telegram_id = $1`,
      [telegramId]
    );
    if (result.rowCount === 0) {
      return res.json({ exists: false });
    }
    const row = result.rows[0];
    const salesRes = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM commissions
       WHERE affiliate_id = $1`,
      [row.id]
    );
    const salesCount = salesRes.rows[0]?.count || 0;
    const earningsRes = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM commissions
       WHERE affiliate_id = $1`,
      [row.id]
    );
    const earningsTotal = Number(earningsRes.rows[0]?.total || 0);
    const dailyRes = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM commissions
       WHERE affiliate_id = $1
         AND earned_at >= date_trunc('day', now())`,
      [row.id]
    );
    const dailyEarnings = Number(dailyRes.rows[0]?.total || 0);
    const availableRes = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM commissions
       WHERE affiliate_id = $1 AND status = 'EARNED'`,
      [row.id]
    );
    const earningsAvailable = Number(availableRes.rows[0]?.total || 0);
    const referralsRes = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM users
       WHERE referred_by_affiliate_id = $1`,
      [row.id]
    );
    const referralsTotal = referralsRes.rows[0]?.count || 0;
    const payoutMethod = row.wallet_usdt_bsc
      ? "USDT_BSC"
      : row.binance_id
      ? "BINANCE_ID"
      : null;
    return res.json({
      exists: true,
      affiliate: {
        id: row.id,
        status: row.status,
        commission_rate: row.commission_rate,
        wallet_usdt_bsc: row.wallet_usdt_bsc,
        binance_id: row.binance_id,
        payout_method: payoutMethod,
        created_at: row.created_at,
        approved_at: row.approved_at,
        sales_count: salesCount,
        earnings_total: earningsTotal,
        daily_earnings: dailyEarnings,
        earnings_available: earningsAvailable,
        referrals_total: referralsTotal,
      },
      user: {
        telegram_id: row.telegram_id,
        telegram_username: row.telegram_username,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function getAffiliateTop(req, res, next) {
  const telegramId = Number(req.query.telegram_id);
  const period = String(req.query.period || "week").toLowerCase();
  if (!Number.isFinite(telegramId)) {
    return res.status(400).json({ error: "telegram_id is required" });
  }
  if (period !== "week" && period !== "day") {
    return res.status(400).json({ error: "INVALID_PERIOD" });
  }
  try {
    const pool = getPool();
    const affiliateRes = await pool.query(
      `SELECT a.id
       FROM affiliates a
       JOIN users u ON u.id = a.user_id
       WHERE u.telegram_id = $1 AND a.status = 'APPROVED'`,
      [telegramId]
    );
    if (affiliateRes.rowCount === 0) {
      return res.status(404).json({ error: "AFFILIATE_NOT_APPROVED" });
    }
    const affiliateId = affiliateRes.rows[0].id;
    const interval = period === "day" ? "1 day" : "7 days";
    const rankedRes = await pool.query(
      `WITH stats AS (
         SELECT a.id,
                u.telegram_username,
                COUNT(c.id)::int AS sales_count,
                COALESCE(SUM(c.amount), 0) AS earnings_total
           FROM affiliates a
           JOIN users u ON u.id = a.user_id
           LEFT JOIN commissions c
             ON c.affiliate_id = a.id
            AND c.earned_at >= (now() - $1::interval)
          WHERE a.status = 'APPROVED'
          GROUP BY a.id, u.telegram_username
       ),
       ranked AS (
         SELECT *,
                ROW_NUMBER() OVER (
                  ORDER BY sales_count DESC, earnings_total DESC, telegram_username ASC NULLS LAST
                ) AS position
           FROM stats
       )
       SELECT *
         FROM ranked
        ORDER BY sales_count DESC, earnings_total DESC, telegram_username ASC NULLS LAST`,
      [interval]
    );
    const rows = rankedRes.rows || [];
    const top = rows.slice(0, 3).map((row) => ({
      username: row.telegram_username || "-",
      sales_count: row.sales_count || 0,
      earnings_total: Number(row.earnings_total || 0),
    }));
    const me = rows.find((row) => row.id === affiliateId);
    return res.json({
      period,
      top,
      position: me ? me.position : null,
      my_earnings: me ? Number(me.earnings_total || 0) : 0,
    });
  } catch (error) {
    return next(error);
  }
}

async function applyAffiliate(req, res, next) {
  const telegramId = Number(req.body.telegram_id);
  const username = req.body.telegram_username || null;
  const photoFileId = req.body.telegram_photo_file_id || null;
  const method = String(req.body.method || "").toUpperCase();
  const walletUsdtBsc = req.body.wallet_usdt_bsc || null;
  const binanceId = req.body.binance_id || null;
  const isWalletProvided = Boolean(walletUsdtBsc);
  const isBinanceProvided = Boolean(binanceId);

  if (!Number.isFinite(telegramId)) {
    return res.status(400).json({ error: "telegram_id is required" });
  }
  if (method !== "USDT_BSC" && method !== "BINANCE_ID") {
    return res.status(400).json({ error: "INVALID_METHOD" });
  }
  if (isWalletProvided && isBinanceProvided) {
    return res.status(400).json({ error: "ONLY_ONE_METHOD_ALLOWED" });
  }
  if (method === "USDT_BSC" && !walletUsdtBsc) {
    return res.status(400).json({ error: "WALLET_REQUIRED" });
  }
  if (method === "BINANCE_ID" && !binanceId) {
    return res.status(400).json({ error: "BINANCE_ID_REQUIRED" });
  }
  const resolvedWallet = method === "USDT_BSC" ? walletUsdtBsc : null;
  const resolvedBinance = method === "BINANCE_ID" ? binanceId : null;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (await isUserBanned(client, telegramId)) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "USER_BANNED" });
    }
    const scammers = parseScammerTelegramIds();
    if (scammers.includes(telegramId)) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "SCAMMER_REPORTED" });
    }
    const userRes = await client.query(
      `INSERT INTO users (telegram_id, telegram_username, telegram_photo_file_id, locale)
       VALUES ($1, $2, $3, 'es')
       ON CONFLICT (telegram_id)
       DO UPDATE SET telegram_username = COALESCE(EXCLUDED.telegram_username, users.telegram_username),
                     telegram_photo_file_id = COALESCE(EXCLUDED.telegram_photo_file_id, users.telegram_photo_file_id)
       RETURNING id`,
      [telegramId, username, photoFileId]
    );
    const userId = userRes.rows[0].id;

    const userCheckRes = await client.query(
      `SELECT telegram_username, telegram_photo_file_id
       FROM users
       WHERE id = $1`,
      [userId]
    );
    const userRow = userCheckRes.rows[0] || {};
    if (!userRow.telegram_username) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "USERNAME_REQUIRED" });
    }
    if (!userRow.telegram_photo_file_id) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "PHOTO_REQUIRED" });
    }

    const existingRes = await client.query(
      `SELECT * FROM affiliates WHERE user_id = $1`,
      [userId]
    );

    if (existingRes.rowCount > 0) {
      const existing = existingRes.rows[0];
      const updateRes = await client.query(
        `UPDATE affiliates
         SET wallet_usdt_bsc = $2,
             binance_id = $3
         WHERE id = $1
         RETURNING *`,
        [existing.id, resolvedWallet, resolvedBinance]
      );
      await client.query("COMMIT");
      return res.json({ status: "updated", affiliate: updateRes.rows[0] });
    }

    const affiliateRes = await client.query(
      `INSERT INTO affiliates (user_id, status, wallet_usdt_bsc, binance_id)
       VALUES ($1, 'PENDING', $2, $3)
       RETURNING *`,
      [userId, resolvedWallet, resolvedBinance]
    );

    await client.query("COMMIT");

    const admins = parseAdminTelegramIds();
    const notice = `📢 Nueva solicitud de afiliado\nTelegram ID: ${telegramId}\nUsuario: ${username || "-"}\nMétodo: ${method}\nDestino: ${method === "USDT_BSC" ? resolvedWallet : resolvedBinance}`;
    await Promise.all(
      admins.map(async (adminId) => {
        try {
          await sendMessage(adminId, notice);
        } catch (err) {
          // ignore admin notification errors
        }
      })
    );

    return res.status(201).json({ status: "created", affiliate: affiliateRes.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
}

async function requestAffiliatePayout(req, res, next) {
  const telegramId = Number(req.body.telegram_id);
  if (!Number.isFinite(telegramId)) {
    return res.status(400).json({ error: "telegram_id is required" });
  }
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const affiliateRes = await client.query(
      `SELECT a.id, a.status, a.wallet_usdt_bsc, a.binance_id
       FROM affiliates a
       JOIN users u ON u.id = a.user_id
       WHERE u.telegram_id = $1`,
      [telegramId]
    );
    if (affiliateRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "AFFILIATE_NOT_FOUND" });
    }
    const affiliate = affiliateRes.rows[0];
    if (affiliate.status !== "APPROVED") {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "AFFILIATE_NOT_APPROVED" });
    }
    const method = affiliate.wallet_usdt_bsc ? "USDT_BSC" : "BINANCE_ID";
    const destination =
      affiliate.wallet_usdt_bsc || affiliate.binance_id || null;
    if (!destination) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "DESTINATION_REQUIRED" });
    }

    const commissionsRes = await client.query(
      `SELECT id, amount
       FROM commissions
       WHERE affiliate_id = $1 AND status = 'EARNED'
       ORDER BY earned_at ASC
       FOR UPDATE`,
      [affiliate.id]
    );

    if (commissionsRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "NO_EARNED_COMMISSIONS" });
    }

    const amount = commissionsRes.rows.reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0
    );

    if (!amount || amount <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "NO_EARNED_COMMISSIONS" });
    }

    const payoutRes = await client.query(
      `INSERT INTO payouts (affiliate_id, amount, method, destination, status)
       VALUES ($1, $2, $3, $4, 'REQUESTED')
       RETURNING *`,
      [affiliate.id, amount, method, destination]
    );

    const commissionIds = commissionsRes.rows.map((row) => row.id);
    const payoutId = payoutRes.rows[0].id;

    await client.query(
      `INSERT INTO payout_items (payout_id, commission_id, amount)
       SELECT $1, id, amount
       FROM commissions
       WHERE id = ANY($2::uuid[])`,
      [payoutId, commissionIds]
    );

    await client.query(
      `UPDATE commissions
       SET status = 'RESERVED'
       WHERE id = ANY($1::uuid[]) AND status = 'EARNED'`,
      [commissionIds]
    );

    await client.query("COMMIT");
    return res.status(201).json({ payout: payoutRes.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
}

async function getUserBanStatus(req, res, next) {
  const telegramId = Number(req.params.telegram_id);

  if (!Number.isFinite(telegramId)) {
    return res.status(400).json({ error: "telegram_id is required" });
  }

  try {
    const pool = getPool();
    const banned = await isUserBanned(pool, telegramId);
    return res.status(200).json({ banned });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  upsertTelegramUser,
  getUserByTelegramId,
  updateUserLocale,
  getUserBanStatus,
  getAffiliateStatus,
  getAffiliateTop,
  applyAffiliate,
  requestAffiliatePayout,
};
