import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { apiFetch, getAuthToken } from "../../lib/api";

function cleanProductName(name) {
  if (!name) {
    return "";
  }
  return String(name).replace(/^shop\s*\d+\s*-\s*/i, "").trim();
}

const STATUS_OPTIONS = [
  { value: "RECENT", label: "Nuevos" },
  { value: "", label: "Todos" },
  { value: "WAITING_PAYMENT", label: "Esperando Pago" },
  { value: "CREATED", label: "Creado" },
  { value: "PAID", label: "Pagado" },
  { value: "CANCELLED", label: "Cancelado" },
  { value: "DELIVERED", label: "Entregado" },
];

export default function OrdersPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("RECENT");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState("");

  const filterRecent = (orders) => {
    const cutoff = Date.now() - 5 * 60 * 1000;
    return orders.filter((order) => {
      if (order.status === "WAITING_PAYMENT") {
        return true;
      }
      const createdAt = new Date(order.created_at).getTime();
      return Number.isFinite(createdAt) && createdAt >= cutoff;
    });
  };

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    const loadOrders = async () => {
      try {
        const isRecent = status === "RECENT";
        const params = new URLSearchParams({
          page: String(isRecent ? 1 : page),
          page_size: "20",
        });
        if (status && !isRecent) {
          params.set("status", status);
        }

        const data = await apiFetch(`/admin/orders?${params.toString()}`);
        const fetchedItems = data.items || [];
        const nextItems = isRecent ? filterRecent(fetchedItems) : fetchedItems;
        setItems(nextItems);
        setTotalPages(isRecent ? 1 : data.total_pages || 1);
        setError("");

      } catch (err) {
        setError("No se pudo cargar las ordenes.");
      }
    };

    loadOrders();
    if (status !== "RECENT") {
      return undefined;
    }
    const interval = setInterval(loadOrders, 10 * 1000);
    return () => clearInterval(interval);
  }, [page, status]);

  const handleStatusChange = (event) => {
    setStatus(event.target.value);
    setPage(1);
  };

  return (
    <main className="page">
      <section className="card">
        <h1>Ordenes</h1>
        <div className="form">
          <label>
            Estado
            <select value={status} onChange={handleStatusChange}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error && <p className="error">{error}</p>}
        <table style={{ width: "100%", marginTop: "16px" }}>
          <thead>
            <tr>
              <th align="left">Número</th>
              <th align="left">Telegram</th>
              <th align="left">Producto</th>
              <th align="left">Estado</th>
              <th align="left">Creada</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && status === "RECENT" ? (
              <>
                <tr className="orders-placeholder">
                  <td>—</td>
                  <td>0000000000</td>
                  <td>Producto de ejemplo</td>
                  <td>CREATED</td>
                  <td>Hace 2 min</td>
                  <td>
                    <span className="muted">Ver</span>
                  </td>
                </tr>
                <tr className="orders-placeholder">
                  <td>—</td>
                  <td>0000000001</td>
                  <td>Producto de ejemplo</td>
                  <td>WAITING_PAYMENT</td>
                  <td>Hace 4 min</td>
                  <td>
                    <span className="muted">Ver</span>
                  </td>
                </tr>
              </>
            ) : (
              items.map((order) => (
              <tr key={order.id}>
                <td>
                  {order.order_number
                    ? String(order.order_number).padStart(5, "0")
                    : "-"}
                </td>
                <td>{order.telegram_id}</td>
                <td>
                  {order.product_code
                    ? `${order.product_code} - ${cleanProductName(
                        order.product_name || order.product_id
                      )}`
                    : cleanProductName(order.product_name || order.product_id)}
                </td>
                <td>{order.status}</td>
                <td>{new Date(order.created_at).toLocaleString()}</td>
                <td>
                  <Link className="link" href={`/orders/${order.id}`}>
                    Ver
                  </Link>
                </td>
              </tr>
              ))
            )}
          </tbody>
        </table>
        {!(status === "RECENT" && items.length === 0) && (
          <div className="actions" style={{ marginTop: "16px" }}>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              disabled={page <= 1}
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={page >= totalPages}
            >
              Siguiente
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
