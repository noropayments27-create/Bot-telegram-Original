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
  const formatMethod = (method) => {
    if (method === "USDT_BSC") {
      return "USDT";
    }
    if (method === "BINANCE_ID") {
      return "ID de Binance";
    }
    return method || "-";
  };
  const formatStatus = (value) => {
    const map = {
      REQUESTED: "SOLICITADO",
      SENT: "ENVIADO",
      CANCELLED: "CANCELADO",
      APPROVED: "APROBADO",
      REJECTED: "RECHAZADO",
      PENDING: "PENDIENTE",
    };
    return map[value] || value || "-";
  };
  const formatUsername = (username) => {
    if (!username) {
      return "-";
    }
    return username.startsWith("@") ? username : `@${username}`;
  };
  const formatUsdAmount = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return value || "-";
    }
    const formatted = numeric.toLocaleString("en-US", {
      minimumFractionDigits: numeric % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    });
    return `$${formatted} USD`;
  };
  const formatPayoutNumber = (value) => {
    if (!value) {
      return null;
    }
    return String(value).padStart(5, "0");
  };
  const getPayoutTone = (status) => {
    if (status === "SENT") {
      return "success";
    }
    if (status === "CANCELLED") {
      return "danger";
    }
    return "neutral";
  };
  const maskValue = (value) => {
    if (!value) {
      return "-";
    }
    const text = String(value);
    if (text.length <= 10) {
      return text;
    }
    return text.slice(0, 10);
  };
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
  const [markingSentById, setMarkingSentById] = useState({});
  const [toast, setToast] = useState("");
  const [payoutCounts, setPayoutCounts] = useState({});
  const getPayoutCount = (key) => Number(payoutCounts[key] || 0);
  const totalPayouts = Object.values(payoutCounts).reduce(
    (sum, value) => sum + Number(value || 0),
    0
  );

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }
    const timer = setTimeout(() => setToast(""), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const markPayoutsSeen = async () => {
      try {
        const summary = await apiFetch("/admin/summary");
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(
            "admin_seen_payouts_count",
            String(summary.pending_payouts || 0)
          );
        }
      } catch (err) {
        // ignore summary errors
      }
    };
    markPayoutsSeen();
  }, []);

  const loadPayouts = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: "20",
      });
      if (status) {
        params.set("status", status);
      }

      const [data, countsRes] = await Promise.all([
        apiFetch(`/admin/payouts?${params.toString()}`),
        apiFetch("/admin/payouts/status-counts"),
      ]);
      setItems(data.items || []);
      setTotalPages(data.total_pages || 1);
      setError("");
      setPayoutCounts(countsRes?.counts || {});
    } catch (err) {
      setError("No se pudo cargar payouts.");
    }
  }, [page, status]);

  useEffect(() => {
    loadPayouts();
  }, [loadPayouts]);

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

  useEffect(() => {
    const payoutId = router.query?.payoutId;
    if (!payoutId || typeof payoutId !== "string") {
      return;
    }
    setSelectedPayoutIds((prev) => {
      if (prev.includes(payoutId)) {
        return prev;
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
    loadDetail(payoutId);
    loadPayouts();
  }, [router.query, loadDetail, loadPayouts, removeDetail]);

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
      const currentScroll = window.scrollY;
      setMarkingSentById((prev) => ({ ...prev, [payoutId]: true }));
      await apiFetch(`/admin/payouts/${payoutId}/mark-sent`, { method: "POST" });
      setDetailMessages((prev) => ({
        ...prev,
        [payoutId]: "Payout marcado como enviado.",
      }));
      await loadDetail(payoutId);
      await loadPayouts();
      requestAnimationFrame(() => {
        window.scrollTo({ top: currentScroll, behavior: "auto" });
      });
    } catch (err) {
      setDetailErrors((prev) => ({
        ...prev,
        [payoutId]: "No se pudo marcar como enviado.",
      }));
      requestAnimationFrame(() => {
        window.scrollTo({ top: window.scrollY, behavior: "auto" });
      });
    } finally {
      setMarkingSentById((prev) => ({ ...prev, [payoutId]: false }));
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
      await loadPayouts();
    } catch (err) {
      setDetailErrors((prev) => ({
        ...prev,
        [payoutId]: "No se pudo cancelar el payout.",
      }));
    }
  };

  const handleCopy = async (label, value) => {
    if (!value) {
      return;
    }
    try {
      await navigator.clipboard.writeText(String(value));
      setToast(`${label} copiado`);
    } catch (err) {
      setToast("No se pudo copiar");
    }
  };

  return (
    <main className="page">
      <section className="card orders-card">
        <div className="orders-header-row">
          <h1 className="icon-inline"><IconPayouts className="panel-icon" /> Pagos</h1>
          <div className="orders-status-counts">
            <span className="orders-count-label">Total:</span>
            <span className="orders-count-value">
              {status === ""
                ? totalPayouts
                : status === "REQUESTED"
                ? getPayoutCount("REQUESTED")
                : status === "SENT"
                ? getPayoutCount("SENT")
                : status === "CANCELLED"
                ? getPayoutCount("CANCELLED")
                : 0}
            </span>
          </div>
        </div>
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
          <table className="orders-table payouts-table">
            <thead>
              <tr>
                <th>Numero de pago</th>
                <th>Telegram ID</th>
                <th>Username</th>
                <th>Monto</th>
                <th>Método</th>
                <th>Destino</th>
                <th>Estado</th>
                <th>Creado</th>
                <th>Enviado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((payout) => (
                <tr
                  key={payout.id}
                  className={selectedPayoutIds.includes(payout.id) ? "orders-row-active" : ""}
                >
                  <td>{formatPayoutNumber(payout.payout_number) || "-"}</td>
                  <td>
                    <button
                      type="button"
                      className="orders-copy"
                      onClick={() => handleCopy("Telegram ID", payout.telegram_id)}
                    >
                      {payout.telegram_id || "-"}
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="orders-copy"
                      onClick={() => handleCopy("Username", payout.telegram_username)}
                    >
                      {formatUsername(payout.telegram_username)}
                    </button>
                  </td>
                  <td>{formatUsdAmount(payout.amount)}</td>
                  <td>{formatMethod(payout.method)}</td>
                  <td>
                    <button
                      type="button"
                      className="orders-copy"
                      onClick={() => handleCopy("Destino", payout.destination)}
                    >
                      {maskValue(payout.destination)}
                    </button>
                  </td>
                  <td>{formatStatus(payout.status)}</td>
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
            const availableBalanceText = Number.isFinite(Number(availableBalance))
              ? formatUsdAmount(availableBalance)
              : "-";
            const reason = reasonById[payoutId] || "";
            const isSent = payout?.status === "SENT";
            const isCancelled = payout?.status === "CANCELLED";
            const isMarkingSent = Boolean(markingSentById[payoutId]);

            return (
              <section key={payoutId} className="card orders-detail-card">
                {isLoading && <p>Cargando...</p>}
                {!isLoading && payout && (
                  <>
                    <div className="orders-detail-header">
                      <h2>
                        Pago
                        {payout.payout_number
                          ? ` #${formatPayoutNumber(payout.payout_number)}`
                          : ""}
                      </h2>
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
                    <div className="orders-detail-grid payouts-detail-grid">
                      <div className="orders-detail-section">
                        <h3>Detalle</h3>
                        <p>Estado: {formatStatus(payout.status)}</p>
                        <p>Monto: {formatUsdAmount(payout.amount)}</p>
                        <p>Método: {formatMethod(payout.method)}</p>
                        <p>
                          Destino:{" "}
                          <button
                            type="button"
                            className="orders-copy"
                            onClick={() => handleCopy("Destino", payout.destination)}
                          >
                            {maskValue(payout.destination)}
                          </button>
                        </p>
                        <p>
                          Creado: {new Date(payout.created_at).toLocaleString()}
                        </p>
                        {payout.sent_at && (
                          <p>Enviado: {new Date(payout.sent_at).toLocaleString()}</p>
                        )}
                      </div>
                      <div className="orders-detail-section">
                        <h3>Afiliado</h3>
                        <p>Estado: {formatStatus(affiliate?.status)}</p>
                        <p>Balance disponible: {availableBalanceText}</p>
                        <div className="orders-detail-subseparator"></div>
                        <h3>Usuario</h3>
                        <p>
                          Telegram ID:{" "}
                          <button
                            type="button"
                            className="orders-copy"
                            onClick={() => handleCopy("Telegram ID", user?.telegram_id)}
                          >
                            {user?.telegram_id || "-"}
                          </button>
                        </p>
                        <p>
                          Username:{" "}
                          <button
                            type="button"
                            className="orders-copy"
                            onClick={() => handleCopy("Username", user?.telegram_username)}
                          >
                            {formatUsername(user?.telegram_username)}
                          </button>
                        </p>
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
                          disabled={isSent || isCancelled || isMarkingSent}
                        >
                          {isMarkingSent && <span className="button-spinner" aria-hidden="true"></span>}
                          Enviado
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCancel(payoutId)}
                          disabled={isSent || isCancelled}
                        >
                          Cancelar
                        </button>
                      </div>
                      {(() => {
                        const tone = getPayoutTone(payout.status);
                        return (
                          <div className={`orders-detail-footer orders-detail-footer--${tone}`}>
                            <div className="orders-status-inline">
                              <span>
                                <span className={`orders-status-dot is-${tone}`}></span>
                                Pago aprobado
                              </span>
                              <span>
                                <span className={`orders-status-dot is-${tone}`}></span>
                                Entrega realizada
                              </span>
                            </div>
                          </div>
                        );
                      })()}
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
      {toast && (
        <div className="toast">
          <span className="toast__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <circle
                cx="12"
                cy="12"
                r="9"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M12 8v5M12 16h.01"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span>{toast}</span>
        </div>
      )}
    </main>
  );
}
