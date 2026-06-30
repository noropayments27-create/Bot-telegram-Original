const app = require('./app');
const env = require('./config/env');
const { connectDb, getPool } = require('./db');
const { startOrderExpiryJob } = require('./services/orderExpiryJob');
const { ensureOrderNumberSchema } = require('./services/orderNumbers');
const { ensureUserWalletSchema, ensureWalletGiftSchema, syncWalletGifts } = require('./services/userWallets');
const adminRoutes = require('./routes/admin.routes');

// Puerto dinámico (Koyeb lo inyecta)
const PORT = env.PORT || 3001;

function envFlag(name, defaultValue = true) {
  const raw = process.env[name];
  if (raw == null || raw === "") {
    return defaultValue;
  }
  return ["1", "true", "yes", "y", "on"].includes(String(raw).trim().toLowerCase());
}

function envIntervalMs(name, defaultValue, minValue = 60000) {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  const value = Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
  return Math.max(value, minValue);
}

function backgroundJobEnabled(name, defaultValue = true) {
  return envFlag("BACKGROUND_JOBS_ENABLED", true) && envFlag(name, defaultValue);
}

async function bootstrap() {
  await connectDb();

  try {
    const pool = getPool();
    await Promise.all([
      ensureOrderNumberSchema(pool),
      ensureUserWalletSchema(pool),
      ensureWalletGiftSchema(pool),
    ]);
    console.log("[bootstrap] runtime schemas ready");
  } catch (error) {
    console.error("[bootstrap] runtime schema warmup failed", error);
  }

  if (backgroundJobEnabled("ORDER_EXPIRY_JOB_ENABLED")) {
    startOrderExpiryJob();
  } else {
    console.log("[jobs] order expiry disabled");
  }

  if (
    backgroundJobEnabled("BROADCAST_RECOVERY_ENABLED")
    && typeof adminRoutes.startBroadcastRecoveryLoop === "function"
  ) {
    adminRoutes.startBroadcastRecoveryLoop();
  } else {
    console.log("[jobs] broadcast recovery disabled");
  }

  if (
    backgroundJobEnabled("GLOBAL_COMMISSION_WATCHER_ENABLED")
    && typeof adminRoutes.startGlobalCommissionWatcher === "function"
  ) {
    adminRoutes.startGlobalCommissionWatcher();
  } else {
    console.log("[jobs] global commission watcher disabled");
  }

  if (backgroundJobEnabled("WALLET_GIFT_SYNC_ENABLED")) {
    const walletSyncIntervalMs = envIntervalMs("WALLET_GIFT_SYNC_INTERVAL_MS", 10 * 60 * 1000);
    setInterval(async () => {
      try {
        await syncWalletGifts(getPool());
      } catch (error) {
        console.error("[wallet-gifts] sync failed", error);
      }
    }, walletSyncIntervalMs);
  } else {
    console.log("[jobs] wallet gift sync disabled");
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API listening on port ${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error("[bootstrap] failed to start API", error);
  process.exit(1);
});
