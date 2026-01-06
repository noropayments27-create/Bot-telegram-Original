import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { apiFetch, getAdminKey } from "../../lib/api";

const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "OPEN", label: "OPEN" },
  { value: "CLOSED", label: "CLOSED" },
];

export default function TicketsPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getAdminKey()) {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    const loadTickets = async () => {
      try {
        const params = new URLSearchParams({
          page: String(page),
          page_size: "20",
        });
        if (status) {
          params.set("status", status);
        }

        const data = await apiFetch(`/admin/tickets?${params.toString()}`);
        setItems(data.items || []);
        setTotalPages(data.total_pages || 1);
        setError("");
      } catch (err) {
        setError("No se pudo cargar tickets.");
      }
    };

    loadTickets();
  }, [page, status]);

  const handleStatusChange = (event) => {
    setStatus(event.target.value);
    setPage(1);
  };

  return (
    <main className="page">
      <section className="card">
        <h1>Tickets</h1>
        {error && <p className="error">{error}</p>}
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
        <table style={{ width: "100%", marginTop: "16px" }}>
          <thead>
            <tr>
              <th align="left">Ticket</th>
              <th align="left">Estado</th>
              <th align="left">Telegram</th>
              <th align="left">Ultimo mensaje</th>
              <th align="left">Admin respondio</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((ticket) => (
              <tr key={ticket.id}>
                <td>{ticket.id}</td>
                <td>{ticket.status}</td>
                <td>{ticket.telegram_id}</td>
                <td>{ticket.last_message_preview || "-"}</td>
                <td>{ticket.has_admin_reply ? "Si" : "No"}</td>
                <td>
                  <Link className="link" href={`/tickets/${ticket.id}`}>
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
