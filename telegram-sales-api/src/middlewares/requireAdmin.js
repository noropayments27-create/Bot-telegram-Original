function requireAdmin(req, res, next) {
  const adminKey = req.header("x-admin-key");
  const expectedKey = process.env.ADMIN_API_KEY;

  if (!expectedKey || adminKey !== expectedKey) {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }

  return next();
}

module.exports = requireAdmin;
