import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";

import { apiFetch, getAuthToken } from "../../lib/api";
import { IconPayouts } from "../../components/PanelIcons";

const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "REQUESTED", label: "SOLICITADO" },
  { value: "SENT", label: "ENVIADO" },
  { value: "CANCELLED", label: "CANCELADO" },
];

export default function PayoutsPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState("");
  const [selectedPayoutIds, setSelectedPayoutIds] = useState([]);
  const [details, setDetails] = useState({});
  const [detailLoading, setDetailLoading] = useState({});
  const [detailErrors, setDetailErrors] = useState({});
  const [detailMessages, setDetailMessages] = useState({});
  const [reasonById, setReasonById] = useState({});

  useEffect(() => {
    if (!getAuthToken()) {
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

  const removeDetail = useCallback((payoutId) => {
    setDetails((prev) => {
      const next = { ...prev };
      delete next[payoutId];
      return next;
    });
    setDetailErrors((prev) => {
      const next = { ...prev };
      delete next[payoutId];
      return next;
    });
    setDetailMessages((prev) => {
      const next = { ...prev };
      delete next[payoutId];
      return next;
    });
    setReasonById((prev) => {
      const next = { ...prev };
      delete next[payoutId];
      return next;
    });
  }, []);

  const loadDetail = useCallback(async (payoutId) => {
    if (!payoutId) {
      return;
    }
    setDetailLoading((prev) => ({ ...prev, [payoutId]: true }));
    setDetailErrors((prev) => ({ ...prev, [payoutId]: "" }));
    try {
      const data = await apiFetch(`/admin/payouts/${payoutId}`);
      setDetails((prev) => ({ ...prev, [payoutId]: data }));
    } catch (err) {
      setDetailErrors((prev) => ({
        ...prev,
        [payoutId]: "No se pudo cargar el payout.",
      }));
    } finally {
      setDetailLoading((prev) => ({ ...prev, [payoutId]: false }));
    }
  }, []);

  const handleViewPayout = async (payoutId) => {
    if (!payoutId) {
      return;
    }
    setSelectedPayoutIds((prev) => {
      if (prev.includes(payoutId)) {
        removeDetail(payoutId);
        return prev.filter((id) => id !== payoutId);
      }
      const next = [payoutId, ...prev.filter((id) => id !== payoutId)];
      if (next.length > 3) {
        const removed = next.pop();
        if (removed) {
          removeDetail(removed);
        }
      }
      return next;
    });
    await loadDetail(payoutId);
  };

  useEffect(() => {
    selectedPayoutIds.forEach((payoutId) => {
      if (!details[payoutId] && !detailLoading[payoutId]) {
        loadDetail(payoutId);
      }
    });
  }, [detailLoading, details, loadDetail, selectedPayoutIds]);

  const handleMarkSent = async (payoutId) => {
    try {
      await apiFetch(`/admin/payouts/${payoutId}/mark-sent`, { method: "POST" });
      setDetailMessages((prev) => ({
        ...prev,
        [payoutId]: "Payout marcado como enviado.",
      }));
      await loadDetail(payoutId);
    } catch (err) {
      setDetailErrors((prev) => ({
        ...prev,
        [payoutId]: "No se pudo marcar como enviado.",
      }));
    }
  };

  const handleCancel = async (payoutId) => {
    try {
      await apiFetch(`/admin/payouts/${payoutId}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: reasonById[payoutId] || undefined }),
      });
      setDetailMessages((prev) => ({
        ...prev,
        [payoutId]: "Payout cancelado.",
      }));
      await loadDetail(payoutId);
    } catch (err) {
      setDetailErrors((prev) => ({
        ...prev,
        [payoutId]: "No se pudo cancelar el payout.",
      }));
    }
  };

  return (
    <main className="page">
      <section className="card orders-card">
        <h1 className="icon-inline"><IconPayouts className="panel-icon" /> Pagos</h1>
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
        <div className="orders-list">
          <table className="orders-table">
            <thead>
              <tr>
                <th align="left">ID de Pago</th>
                <th align="left">Afiliado</th>
                <th align="left">Monto</th>
                <th align="left">Método</th>
                <th align="left">Destino</th>
                <th align="left">Estado</th>
                <th align="left">Creado</th>
                <th align="left">Enviado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((payout) => (
                <tr
                  key={payout.id}
                  className={selectedPayoutIds.includes(payout.id) ? "orders-row-active" : ""}
                >
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
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => handleViewPayout(payout.id)}
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
      {selectedPayoutIds.length > 0 && (
        <div className="orders-detail-wrap">
          {selectedPayoutIds.map((payoutId) => {
            const detail = details[payoutId];
            const isLoading = detailLoading[payoutId];
            const errorMessage = detailErrors[payoutId];
            const message = detailMessages[payoutId];
            const payout = detail?.payout;
            const affiliate = detail?.affiliate;
            const user = detail?.user;
            const availableBalance = detail?.available_balance;
            const reason = reasonById[payoutId] || "";
            const isSent = payout?.status === "SENT";
            const isCancelled = payout?.status === "CANCELLED";

            return (
              <section key={payoutId} className="card orders-detail-card">
                {isLoading && <p>Cargando...</p>}
                {!isLoading && payout && (
                  <>
                    <div className="orders-detail-header">
                      <h2>Pago #{payout.id}</h2>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => handleViewPayout(payout.id)}
                      >
                        Cerrar
                      </button>
                    </div>
                    <div className="orders-detail-separator"></div>
                    {message && <p className="muted">{message}</p>}
                    {errorMessage && <p className="error">{errorMessage}</p>}
                    <div className="orders-detail-grid">
                      <div className="orders-detail-section">
                        <h3>Detalle</h3>
                        <p>Estado: {payout.status}</p>
                        <p>Monto: {payout.amount}</p>
                        <p>Método: {payout.method}</p>
                        <p>Destino: {payout.destination}</p>
                        <p>
                          Creado: {new Date(payout.created_at).toLocaleString()}
                        </p>
                        {payout.sent_at && (
                          <p>Enviado: {new Date(payout.sent_at).toLocaleString()}</p>
                        )}
                      </div>
                      <div className="orders-detail-section">
                        <h3>Afiliado</h3>
                        <p>ID: {affiliate?.id || "-"}</p>
                        <p>Estado: {affiliate?.status || "-"}</p>
                        <p>Tasa: {affiliate?.commission_rate || "-"}</p>
                        <p>Balance disponible: {availableBalance || "-"}</p>
                        <div className="orders-detail-subseparator"></div>
                        <h3>Usuario</h3>
                        <p>Telegram ID: {user?.telegram_id || "-"}</p>
                        <p>Username: {user?.telegram_username || "-"}</p>
                      </div>
                    </div>
                    <div className="orders-detail-actions">
                      <div className="form">
                        <label>
                          Motivo (opcional)
                          <input
                            type="text"
                            value={reason}
                            onChange={(event) =>
                              setReasonById((prev) => ({
                                ...prev,
                                [payoutId]: event.target.value,
                              }))
                            }
                            placeholder="Motivo"
                          />
                        </label>
                      </div>
                      <div className="actions">
                        <button
                          type="button"
                          onClick={() => handleMarkSent(payoutId)}
                          disabled={isSent || isCancelled}
                        >
                          Marcar como ENVIADO
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCancel(payoutId)}
                          disabled={isSent || isCancelled}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  </>
                )}
                {!isLoading && !payout && errorMessage && (
                  <p className="error">{errorMessage}</p>
                )}
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
