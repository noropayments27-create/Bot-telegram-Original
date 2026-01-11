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

  const whereClause = filters.length
    ? `WHERE ${filters.map((filter) => `p.${filter}`).join(" AND ")}`
    : "";

  try {
    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM products p ${whereClause}`,
      values
    );
    const total = countRes.rows[0].total;

    const itemsRes = await pool.query(
      `SELECT p.id,
              p.code,
              p.name,
              p.description,
              p.price,
              p.is_active,
              p.delivery_type,
              p.delivery_payload,
              p.created_at,
              p.updated_at,
              p.stock_mode,
              p.stock_qty,
              p.show_stock,
              CASE
                WHEN p.stock_mode = 'SIMPLE' AND p.stock_qty IS NULL THEN true
                ELSE false
              END AS stock_is_unlimited,
              CASE
                WHEN p.show_stock = false THEN NULL
                WHEN p.stock_mode = 'SIMPLE' THEN
                  CASE
                    WHEN p.stock_qty IS NULL THEN NULL
                    ELSE GREATEST(p.stock_qty - COALESCE(psh.held_qty, 0), 0)
                  END
                WHEN p.stock_mode = 'UNITS' THEN COALESCE(psu.available_units, 0)
                ELSE NULL
              END AS available_stock
       FROM products p
       LEFT JOIN (
         SELECT product_id, COUNT(*)::int AS available_units
         FROM product_stock_units
         WHERE status = 'AVAILABLE'
         GROUP BY product_id
       ) psu ON psu.product_id = p.id
       LEFT JOIN (
         SELECT product_id, COALESCE(SUM(qty), 0)::int AS held_qty
         FROM product_stock_holds
         WHERE status = 'HELD' AND expires_at > now()
         GROUP BY product_id
       ) psh ON psh.product_id = p.id
       ${whereClause}
       ORDER BY p.name ASC
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
