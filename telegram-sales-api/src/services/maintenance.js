let maintenanceSchemaReady = false;

async function ensureMaintenanceSchema(pool) {
  if (maintenanceSchemaReady) {
    return;
  }
  await pool.query(
     `CREATE TABLE IF NOT EXISTS bot_maintenance (
       id int PRIMARY KEY DEFAULT 1,
       active boolean NOT NULL DEFAULT false,
       referral_gate_active boolean NOT NULL DEFAULT true,
       updated_at timestamptz NOT NULL DEFAULT now()
     )`
  );
  await pool.query(
    `ALTER TABLE bot_maintenance
     ADD COLUMN IF NOT EXISTS referral_gate_active boolean NOT NULL DEFAULT true`
  );
  await pool.query(
    `INSERT INTO bot_maintenance (id)
     VALUES (1)
     ON CONFLICT (id) DO NOTHING`
  );
  maintenanceSchemaReady = true;
}

async function getMaintenanceStatus(pool) {
  await ensureMaintenanceSchema(pool);
  const res = await pool.query(
    "SELECT active FROM bot_maintenance WHERE id = 1"
  );
  return Boolean(res.rows[0]?.active);
}

async function setMaintenanceStatus(pool, active) {
  await ensureMaintenanceSchema(pool);
  const normalized = Boolean(active);
  await pool.query(
    `UPDATE bot_maintenance
     SET active = $1,
         updated_at = now()
     WHERE id = 1`,
    [normalized]
  );
  return normalized;
}

async function getReferralGateStatus(pool) {
  await ensureMaintenanceSchema(pool);
  const res = await pool.query(
    "SELECT referral_gate_active FROM bot_maintenance WHERE id = 1"
  );
  return Boolean(res.rows[0]?.referral_gate_active ?? true);
}

async function setReferralGateStatus(pool, active) {
  await ensureMaintenanceSchema(pool);
  const normalized = Boolean(active);
  await pool.query(
    `UPDATE bot_maintenance
     SET referral_gate_active = $1,
         updated_at = now()
     WHERE id = 1`,
    [normalized]
  );
  return normalized;
}

module.exports = {
  ensureMaintenanceSchema,
  getMaintenanceStatus,
  setMaintenanceStatus,
  getReferralGateStatus,
  setReferralGateStatus,
};
