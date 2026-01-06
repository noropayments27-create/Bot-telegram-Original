import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { apiFetch, getAdminKey } from "../../lib/api";

const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "REQUESTED", label: "REQUESTED" },
  { value: "SENT", label: "SENT" },
  { value: "CANCELLED", label: "CANCELLED" },
];

export default function PayoutsPage() {
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
    const loadPayouts = async () => {
      try {
        const params = new URLSearchParams({
          page: String(page),
          page_size: "20",
        });
        if (status) {
          params.set("status", status);
        }

        const data = await apiFetch(`/admin/payouts?${params.toString()}`);
        setItems(data.items || []);
        setTotalPages(data.total_pages || 1);
        setError("");
      } catch (err) {
        setError("No se pudo cargar payouts.");
      }
    };

    loadPayouts();
  }, [page, status]);

  const handleStatusChange = (event) => {
    setStatus(event.target.value);
    setPage(1);
  };

  return (
    <main className="page">
      <section className="card">
        <h1>Payouts</h1>
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
              <th align="left">Payout ID</th>
              <th align="left">Affiliate</th>
              <th align="left">Amount</th>
              <th align="left">Method</th>
              <th align="left">Destination</th>
              <th align="left">Status</th>
              <th align="left">Created</th>
              <th align="left">Sent</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((payout) => (
              <tr key={payout.id}>
                <td>{payout.id}</td>
                <td>{payout.telegram_id}</td>
                <td>{payout.amount}</td>
                <td>{payout.method}</td>
                <td>{payout.destination}</td>
                <td>{payout.status}</td>
                <td>{new Date(payout.created_at).toLocaleString()}</td>
                <td>
                  {payout.sent_at ? new Date(payout.sent_at).toLocaleString() : "-"}
                </td>
                <td>
                  <Link className="link" href={`/payouts/${payout.id}`}>
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
