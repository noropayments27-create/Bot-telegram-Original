const { verifyAdminToken } = require("../services/adminAuth");

function requireAdmin(req, res, next) {
  if (req.method === "OPTIONS") {
    return next();
  }
  const authHeader = req.header("Authorization") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;

  const payload = verifyAdminToken(token);
  if (!payload) {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }

  req.admin = payload;
  return next();
}

module.exports = requireAdmin;
