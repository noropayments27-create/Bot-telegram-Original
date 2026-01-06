const { getPool } = require("../../db");

function parseBoolean(value) {
  if (value === undefined) return undefined;
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return undefined;
}

async function listProducts(req, res, next) {
  const active = parseBoolean(req.query.active);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const pageSize = Math.min(
    Math.max(parseInt(req.query.page_size, 10) || 8, 1),
    50
  );
  const offset = (page - 1) * pageSize;

  const pool = getPool();
  const filters = [];
  const values = [];

  if (active !== undefined) {
    values.push(active);
    filters.push(`is_active = $${values.length}`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  try {
    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM products ${whereClause}`,
      values
    );
    const total = countRes.rows[0].total;

    const itemsRes = await pool.query(
      `SELECT id, name, description, price, is_active, delivery_type, delivery_payload,
              created_at, updated_at
       FROM products
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, offset]
    );

    const totalPages = Math.ceil(total / pageSize) || 1;

    res.json({
      items: itemsRes.rows,
      page,
      page_size: pageSize,
      total,
      total_pages: totalPages,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { listProducts };
