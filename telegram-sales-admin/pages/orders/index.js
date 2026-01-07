import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { apiFetch, getAuthToken } from "../../lib/api";

const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "WAITING_PAYMENT", label: "WAITING_PAYMENT" },
  { value: "CREATED", label: "CREATED" },
  { value: "PAID", label: "PAID" },
  { value: "CANCELLED", label: "CANCELLED" },
  { value: "DELIVERED", label: "DELIVERED" },
];

export default function OrdersPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    const loadOrders = async () => {
      try {
        const params = new URLSearchParams({
          page: String(page),
          page_size: "20",
        });
        if (status) {
          params.set("status", status);
        }

        const data = await apiFetch(`/admin/orders?${params.toString()}`);
        setItems(data.items || []);
        setTotalPages(data.total_pages || 1);
        setError("");
      } catch (err) {
        setError("No se pudo cargar las ordenes.");
      }
    };

    loadOrders();
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
              <th align="left">Order ID</th>
              <th align="left">Telegram</th>
              <th align="left">Producto</th>
              <th align="left">Estado</th>
              <th align="left">Creada</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((order) => (
              <tr key={order.id}>
                <td>{order.id}</td>
                <td>{order.telegram_id}</td>
                <td>{order.product_name || order.product_id}</td>
                <td>{order.status}</td>
                <td>{new Date(order.created_at).toLocaleString()}</td>
                <td>
                  <Link className="link" href={`/orders/${order.id}`}>
                    Ver
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
      </section>
    </main>
  );
}
