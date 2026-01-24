const { getPool } = require("../db");
const { sendMessage } = require("./telegram");

let timer = null;
let running = false;

async function expireWaitingPaymentOrders() {
  if (running) {
    return;
  }
  running = true;

  const expirySeconds = Math.max(
    parseInt(process.env.ORDER_EXPIRY_SECONDS || "", 10)
      || (parseInt(process.env.ORDER_EXPIRY_MINUTES || "", 10) || 0) * 60
      || 10,
    1
  );
  const pool = getPool();
  let client;
  const expiredOrders = [];

  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const ordersRes = await client.query(
      `SELECT o.id, u.telegram_id
       FROM orders o
       JOIN users u ON u.id = o.user_id
       WHERE o.status = 'WAITING_PAYMENT'
         AND o.created_at <= now() - ($1 * interval '1 second')
         AND NOT EXISTS (
           SELECT 1 FROM order_payments op WHERE op.order_id = o.id
         )
       FOR UPDATE SKIP LOCKED`,
      [expirySeconds]
    );

    for (const order of ordersRes.rows) {
      const updateRes = await client.query(
        `UPDATE orders
         SET status = 'EXPIRED',
             cancelled_at = now(),
             cancel_source = 'EXPIRED',
             order_number = NULL
         WHERE id = $1 AND status = 'WAITING_PAYMENT'
         RETURNING id`,
        [order.id]
      );

      if (updateRes.rowCount === 0) {
        continue;
      }

      await client.query(
        `UPDATE product_stock_units
         SET status = 'AVAILABLE',
             held_by_order_id = NULL,
             held_by_telegram_id = NULL,
             held_by_username = NULL,
             held_at = NULL
         WHERE held_by_order_id = $1 AND status = 'HELD'`,
        [order.id]
      );

      await client.query(
        `UPDATE product_stock_holds
         SET status = 'EXPIRED', updated_at = now()
         WHERE order_id = $1 AND status = 'HELD'`,
        [order.id]
      );

      expiredOrders.push(order);
      console.log("[stock/hold] expired", { order_id: order.id });
    }

    await client.query("COMMIT");
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("[order-expiry] rollback failed:", rollbackError);
      }
    }
    console.error("[order-expiry] failed:", error);
  } finally {
    if (client) {
      client.release();
    }
    running = false;
  }

  const notifyTelegram = String(
    process.env.ORDER_EXPIRY_NOTIFY_TELEGRAM || ""
  ).toLowerCase() === "true";
  if (notifyTelegram) {
    for (const order of expiredOrders) {
      try {
        await sendMessage(
          order.telegram_id,
          "⏰ Tu pedido expiró por falta de pago. El stock fue liberado."
        );
      } catch (error) {
        console.error("[order-expiry] telegram notify failed:", error);
      }
    }
  }

  if (expiredOrders.length > 0) {
    console.log(`[order-expiry] expired ${expiredOrders.length} orders`);
  }
}

function startOrderExpiryJob() {
  if (timer) {
    return timer;
  }
  const intervalMs = Math.max(
    parseInt(process.env.ORDER_EXPIRY_INTERVAL_MS || "60000", 10) || 60000,
    1000
  );
  timer = setInterval(expireWaitingPaymentOrders, intervalMs);
  expireWaitingPaymentOrders();
  return timer;
}

module.exports = { startOrderExpiryJob };
