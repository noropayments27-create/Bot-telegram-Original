const { verifyAdminToken } = require("../services/adminAuth");

function requireAdmin(req, res, next) {
  if (req.method === "OPTIONS") {
    return next();
  }
  const authHeader = req.header("Authorization") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  const apiKey = req.header("x-admin-key") || "";
  const expected =
    process.env.ADMIN_API_KEY
    || process.env.ADMIN_KEY
    || process.env.ADMIN_SECRET;

  if (process.env.NODE_ENV !== "production") {
    console.log("[admin-auth] headers", {
      has_admin_key: Boolean(apiKey),
      has_authorization: Boolean(authHeader),
      has_expected_key: Boolean(expected),
    });
  }

  if (expected && apiKey && apiKey === expected) {
    req.admin = { mode: "api_key", key_id: "env:ADMIN_API_KEY" };
    return next();
  }

  const payload = token ? verifyAdminToken(token) : null;
  if (payload) {
    req.admin = { ...payload, mode: "jwt" };
    return next();
  }

  return res.status(401).json({ error: "UNAUTHORIZED" });
}

module.exports = requireAdmin;
