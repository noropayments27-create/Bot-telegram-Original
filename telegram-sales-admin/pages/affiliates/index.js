import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { apiFetch, getAuthToken } from "../../lib/api";

const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "PENDING", label: "PENDING" },
  { value: "APPROVED", label: "APPROVED" },
  { value: "REJECTED", label: "REJECTED" },
];

const METHOD_OPTIONS = [
  { value: "USDT_BSC", label: "USDT_BSC" },
  { value: "BINANCE_ID", label: "BINANCE_ID" },
];

export default function AffiliatesPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [formState, setFormState] = useState({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    const loadAffiliates = async () => {
      try {
        const params = new URLSearchParams({
          page: String(page),
          page_size: "20",
        });
        if (status) {
          params.set("status", status);
        }

        const data = await apiFetch(`/admin/affiliates?${params.toString()}`);
        setItems(data.items || []);
        setTotalPages(data.total_pages || 1);
        setError("");
      } catch (err) {
        setError("No se pudo cargar afiliados.");
      }
    };

    loadAffiliates();
  }, [page, status]);

  useEffect(() => {
    setFormState((prev) => {
      const next = { ...prev };
      items.forEach((affiliate) => {
        if (!next[affiliate.id]) {
          next[affiliate.id] = {
            method: "USDT_BSC",
            destination: affiliate.wallet_usdt_bsc || "",
          };
        }
      });
      return next;
    });
  }, [items]);

  const handleStatusChange = (event) => {
    setStatus(event.target.value);
    setPage(1);
  };

  const handleMethodChange = (affiliate, value) => {
    setFormState((prev) => ({
      ...prev,
      [affiliate.id]: {
        ...prev[affiliate.id],
        method: value,
        destination:
          value === "USDT_BSC"
            ? affiliate.wallet_usdt_bsc || ""
            : affiliate.binance_id || "",
      },
    }));
  };

  const handleDestinationChange = (affiliateId, value) => {
    setFormState((prev) => ({
      ...prev,
      [affiliateId]: {
        ...prev[affiliateId],
        destination: value,
      },
    }));
  };

  const handleCreatePayout = async (affiliate) => {
    const state = formState[affiliate.id] || {};
    try {
      const payload = {
        affiliate_id: affiliate.id,
        method: state.method || "USDT_BSC",
        destination: state.destination,
      };
      const data = await apiFetch("/admin/payouts", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setMessage(`Payout creado: ${data.payout.id}`);
      setError("");
    } catch (err) {
      setError("No se pudo crear el payout.");
    }
  };

  return (
    <main className="page">
      <section className="card">
        <h1>Afiliados</h1>
        {message && <p className="muted">{message}</p>}
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
              <th align="left">Affiliate ID</th>
              <th align="left">Telegram</th>
              <th align="left">Status</th>
              <th align="left">Balance</th>
              <th align="left">Rate</th>
              <th align="left">Crear payout</th>
            </tr>
          </thead>
          <tbody>
            {items.map((affiliate) => {
              const state = formState[affiliate.id] || {};
              return (
                <tr key={affiliate.id}>
                  <td>{affiliate.id}</td>
                  <td>{affiliate.telegram_id}</td>
                  <td>{affiliate.status}</td>
                  <td>{affiliate.available_balance}</td>
                  <td>{affiliate.commission_rate}</td>
                  <td>
                    <div style={{ display: "grid", gap: "8px" }}>
                      <select
                        value={state.method || "USDT_BSC"}
                        onChange={(event) =>
                          handleMethodChange(affiliate, event.target.value)
                        }
                      >
                        {METHOD_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={state.destination || ""}
                        onChange={(event) =>
                          handleDestinationChange(affiliate.id, event.target.value)
                        }
                        placeholder="Destino"
                      />
                      <button
                        type="button"
                        onClick={() => handleCreatePayout(affiliate)}
                      >
                        Crear payout
                      </button>
                      <Link className="link" href="/payouts">
                        Ver payouts
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
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
