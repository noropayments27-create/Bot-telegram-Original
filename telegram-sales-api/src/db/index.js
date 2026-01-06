const { Pool } = require("pg");

let pool;

function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is required");

    pool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return pool;
}

async function connectDb() {
  const p = getPool();
  const client = await p.connect();
  try {
    // Prueba simple
    const res = await client.query("SELECT 1 as ok");
    console.log("DB connected:", res.rows[0]);
  } finally {
    client.release();
  }
}

module.exports = { getPool, connectDb };
