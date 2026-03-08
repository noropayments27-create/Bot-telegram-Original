const { notifyApiError } = require("../services/opsAlerts");

const errorMiddleware = (err, req, res, next) => {
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';

  if (process.env.NODE_ENV !== 'test') {
    console.error(err);
  }

  notifyApiError(req, err, status).catch((alertError) => {
    if (process.env.NODE_ENV !== "test") {
      console.error("[ops-alert] failed to notify", alertError);
    }
  });

  res.status(status).json({ ok: false, error: message });
};

module.exports = errorMiddleware;
