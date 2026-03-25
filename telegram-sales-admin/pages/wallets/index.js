import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";

import { apiFetch, apiFetchBinary, getAuthToken } from "../../lib/api";
import Toast from "../../components/Toast";

const STATUS_OPTIONS = [
  { value: "SUBMITTED", label: "Pendientes" },
  { value: "ALL", label: "Todos" },
  { value: "APPROVED", label: "Aprobadas" },
  { value: "REJECTED", label: "Rechazadas" },
  { value: "CREATED", label: "Creadas" },
  { value: "EXPIRED", label: "Expiradas" },
  { value: "CANCELLED", label: "Canceladas" },
];

const TOPUP_STATUS_LABELS = {
  CREATED: "CREADA",
  SUBMITTED: "PENDIENTE",
  APPROVED: "APROBADA",
  REJECTED: "RECHAZADA",
  CANCELLED: "CANCELADA",
  EXPIRED: "EXPIRADA",
  SCAM: "ESTAFA",
};

const TX_TYPE_LABELS = {
  TOPUP_APPROVED: "Recarga aprobada",
  ORDER_PAYMENT: "Compra con saldo",
  ORDER_REFUND: "Reembolso a saldo",
  ADMIN_ADJUSTMENT: "Ajuste admin",
};

const PAYMENT_METHOD_LABELS = {
  BTC: "Bitcoin",
  LTC: "Litecoin",
  MP: "Mercado Pago",
  NEQUI: "Nequi",
  BINANCE: "Binance",
  BINANCE_ID: "Binance ID",
  USDT: "USDT",
  USDT_BSC: "USDT BSC",
  USDT_TRON: "USDT Tron",
  PAYPAL: "PayPal",
  WALLET: "Wallet",
};

function formatUsd(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "$0 USD";
  }
  return `$${numeric.toLocaleString("en-US", {
    minimumFractionDigits: numeric % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} USD`;
}

function formatDate(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString("es-CO");
}

function formatUsername(username) {
  if (!username) {
    return "-";
  }
  return username.startsWith("@") ? username : `@${username}`;
}

function formatTopupStatus(value) {
  return TOPUP_STATUS_LABELS[String(value || "").toUpperCase()] || value || "-";
}

function formatPaymentMethod(value) {
  return PAYMENT_METHOD_LABELS[String(value || "").toUpperCase()] || value || "-";
}

function formatTxType(value) {
  return TX_TYPE_LABELS[String(value || "").toUpperCase()] || value || "-";
}

function txAmountLabel(item) {
  const amount = formatUsd(item?.amount);
  if (String(item?.direction || "").toUpperCase() === "DEBIT") {
    return `-${amount}`;
  }
  return `+${amount}`;
}

export default function WalletsPage() {
  const router = useRouter();
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [topups, setTopups] = useState([]);
  const [topupSummary, setTopupSummary] = useState({
    pending: 0,
    approved: 0,
    rejected: 0,
  });
  const [totalPages, setTotalPages] = useState(1);
  const [loadingTopups, setLoadingTopups] = useState(false);
  const [selectedTopupId, setSelectedTopupId] = useState("");
  const [selectedTopup, setSelectedTopup] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [proofUrl, setProofUrl] = useState("");
  const [telegramIdInput, setTelegramIdInput] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [toast, setToast] = useState("");

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
    return () => {
      if (proofUrl) {
        URL.revokeObjectURL(proofUrl);
      }
    };
  }, [proofUrl]);

  const loadTopups = useCallback(async () => {
    setLoadingTopups(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: "12",
      });
      if (status) {
        params.set("status", status);
      }
      const [data, allData] = await Promise.all([
        apiFetch(`/admin/wallets/topups?${params.toString()}`),
        apiFetch("/admin/wallets/topups?status=ALL&include_all=1"),
      ]);
      setTopups(data.items || []);
      setTotalPages(Math.max(Number(data.total_pages || 1), 1));
      const summary = {
        pending: 0,
        approved: 0,
        rejected: 0,
      };
      for (const item of allData.items || []) {
        const key = String(item?.status || "").toUpperCase();
        if (key === "SUBMITTED") {
          summary.pending += 1;
        } else if (key === "APPROVED") {
          summary.approved += 1;
        } else if (key === "REJECTED") {
          summary.rejected += 1;
        }
      }
      setTopupSummary(summary);
    } catch (_error) {
      setToast("No se pudieron cargar las recargas.");
    } finally {
      setLoadingTopups(false);
    }
  }, [page, status]);

  const loadTopupDetail = useCallback(async (topupId) => {
    if (!topupId) {
      return;
    }
    setLoadingDetail(true);
    try {
      const data = await apiFetch(`/admin/wallets/topups/${topupId}`);
      const topup = data?.topup || null;
      setSelectedTopup(topup);
      setSelectedTopupId(topup?.id || topupId);
      setRejectReason(topup?.reason || "");

      setProofUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return "";
      });

      try {
        const result = await apiFetchBinary(`/admin/wallets/topups/${topupId}/payment-proof`);
        const blob = new Blob([result.buffer], { type: result.contentType });
        setProofUrl(URL.createObjectURL(blob));
      } catch (_error) {
        setProofUrl("");
      }
    } catch (_error) {
      setToast("No se pudo cargar la recarga.");
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const loadUserWallet = useCallback(async (telegramId) => {
    const normalized = String(telegramId || "").trim();
    if (!normalized) {
      setToast("Ingresa un telegram_id o @username.");
      return;
    }
    setLoadingUser(true);
    try {
      const data = await apiFetch(`/admin/wallets/users/${encodeURIComponent(normalized)}?limit=25`);
      setSelectedUser(data);
      setTelegramIdInput(normalized);
    } catch (_error) {
      setToast("No se pudo cargar la wallet del usuario.");
    } finally {
      setLoadingUser(false);
    }
  }, []);

  useEffect(() => {
    loadTopups();
    const interval = setInterval(loadTopups, 20000);
    return () => clearInterval(interval);
  }, [loadTopups]);

  useEffect(() => {
    const topupId = router.query?.topupId;
    if (!topupId || typeof topupId !== "string") {
      return;
    }
    loadTopupDetail(topupId);
  }, [router.query?.topupId, loadTopupDetail]);

  const handleApprove = async () => {
    if (!selectedTopupId) {
      return;
    }
    try {
      await apiFetch(`/admin/wallets/topups/${selectedTopupId}/approve`, { method: "POST" });
      setToast("✅ Recarga aprobada.");
      await loadTopups();
      await loadTopupDetail(selectedTopupId);
      if (selectedTopup?.telegram_id) {
        await loadUserWallet(selectedTopup.telegram_id);
      }
    } catch (_error) {
      setToast("No se pudo aprobar la recarga.");
    }
  };

  const handleReject = async () => {
    if (!selectedTopupId) {
      return;
    }
    try {
      await apiFetch(`/admin/wallets/topups/${selectedTopupId}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: rejectReason || undefined }),
      });
      setToast("✅ Recarga rechazada.");
      await loadTopups();
      await loadTopupDetail(selectedTopupId);
    } catch (_error) {
      setToast("No se pudo rechazar la recarga.");
    }
  };

  const handleScam = async () => {
    if (!selectedTopupId) {
      return;
    }
    try {
      await apiFetch(`/admin/wallets/topups/${selectedTopupId}/scam`, {
        method: "POST",
        body: JSON.stringify({ reason: rejectReason || "Marcada como estafa" }),
      });
      setToast("🚨 Recarga marcada como estafa.");
      await loadTopups();
      await loadTopupDetail(selectedTopupId);
    } catch (_error) {
      setToast("No se pudo marcar la recarga como estafa.");
    }
  };

  const handleAdjust = async (event) => {
    event.preventDefault();
    const targetTelegramId = String(selectedUser?.user?.telegram_id || telegramIdInput || "").trim();
    if (!targetTelegramId) {
      setToast("Busca primero un usuario.");
      return;
    }
    const numericAmount = Number(String(adjustAmount).replace(",", "."));
    if (!Number.isFinite(numericAmount) || numericAmount === 0) {
      setToast("Ingresa un monto válido.");
      return;
    }
    try {
      await apiFetch(`/admin/wallets/users/${encodeURIComponent(targetTelegramId)}/adjust`, {
        method: "POST",
        body: JSON.stringify({
          amount: numericAmount,
          reason: adjustReason || undefined,
        }),
      });
      setToast("✅ Ajuste aplicado.");
      setAdjustAmount("");
      setAdjustReason("");
      await loadUserWallet(targetTelegramId);
    } catch (error) {
      const detail = error?.payload?.error;
      if (detail === "INSUFFICIENT_WALLET_BALANCE") {
        setToast("Saldo insuficiente para descontar.");
        return;
      }
      setToast("No se pudo ajustar el saldo.");
    }
  };

  return (
    <div className="page wallets-page">
      <Toast message={toast} />
      <div className="wallets-header-card">
        <div>
          <h1>Wallets</h1>
          <p>Gestiona recargas, saldos e historial de movimientos.</p>
        </div>
        <div className="wallets-summary">
          <span>Pendientes: {topupSummary.pending}</span>
          <span>Aprobadas: {topupSummary.approved}</span>
          <span>Rechazadas: {topupSummary.rejected}</span>
        </div>
      </div>

      <div className="wallets-grid">
        <section className="wallets-card">
          <div className="wallets-card-head">
            <h2>Recargas</h2>
            <div className="wallets-toolbar">
              <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button type="button" onClick={loadTopups}>
                Actualizar
              </button>
            </div>
          </div>

          <div className="wallets-list">
            {loadingTopups ? <p className="wallets-empty">Cargando recargas...</p> : null}
            {!loadingTopups && topups.length === 0 ? (
              <p className="wallets-empty">No hay recargas para este filtro.</p>
            ) : null}
            {topups.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`wallets-list-item ${selectedTopupId === item.id ? "is-active" : ""}`}
                onClick={() => loadTopupDetail(item.id)}
              >
                <div>
                  <strong>{item.topup_number_label || item.id}</strong>
                  <span>{formatUsername(item.telegram_username)} · {item.telegram_id}</span>
                </div>
                <div className="wallets-list-meta">
                  <span>{formatUsd(item.amount_usd)}</span>
                  <span>{formatTopupStatus(item.status)}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="wallets-pagination">
            <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(current - 1, 1))}>
              ←
            </button>
            <span>Página {page} / {Math.max(totalPages, 1)}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>
              →
            </button>
          </div>
        </section>

        <section className="wallets-card">
          <div className="wallets-card-head">
            <h2>Detalle de recarga</h2>
          </div>
          {!selectedTopup ? (
            <p className="wallets-empty">Selecciona una recarga para ver el detalle.</p>
          ) : (
            <div className="wallets-detail">
              {loadingDetail ? <p className="wallets-empty">Cargando detalle...</p> : null}
              <div className="wallets-detail-block">
                <p><strong>Referencia:</strong> {selectedTopup.topup_number_label || selectedTopup.id}</p>
          <p><strong>Usuario:</strong> {formatUsername(selectedTopup.telegram_username)} ({selectedTopup.telegram_id})</p>
                <p><strong>Monto:</strong> {formatUsd(selectedTopup.amount_usd)}</p>
                <p><strong>Método:</strong> {formatPaymentMethod(selectedTopup.payment_method)}</p>
                <p><strong>Estado:</strong> {formatTopupStatus(selectedTopup.status)}</p>
                <p><strong>Creada:</strong> {formatDate(selectedTopup.created_at)}</p>
                <p><strong>Enviada:</strong> {formatDate(selectedTopup.submitted_at)}</p>
                <p><strong>Expira:</strong> {formatDate(selectedTopup.expires_at)}</p>
                {selectedTopup.reason ? <p><strong>Motivo:</strong> {selectedTopup.reason}</p> : null}
              </div>

              <div className="wallets-proof">
                {proofUrl ? (
                  <img src={proofUrl} alt="Comprobante recarga" />
                ) : (
                  <div className="wallets-proof-placeholder">Sin comprobante disponible</div>
                )}
              </div>

              <div className="wallets-actions">
                <button
                  type="button"
                  className="wallets-primary"
                  onClick={handleApprove}
                  disabled={selectedTopup.status !== "SUBMITTED"}
                >
                  Aprobar
                </button>
                <button
                  type="button"
                  className="wallets-danger"
                  onClick={handleReject}
                  disabled={!["CREATED", "SUBMITTED"].includes(String(selectedTopup.status || "").toUpperCase())}
                >
                  Rechazar
                </button>
                <button
                  type="button"
                  className="wallets-danger"
                  onClick={handleScam}
                  disabled={!["CREATED", "SUBMITTED"].includes(String(selectedTopup.status || "").toUpperCase())}
                >
                  Estafa
                </button>
                <button
                  type="button"
                  className="wallets-secondary"
                  onClick={() => loadUserWallet(selectedTopup.telegram_id)}
                >
                  Ver wallet
                </button>
              </div>

              <textarea
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder="Motivo opcional de rechazo"
                rows={3}
              />
            </div>
          )}
        </section>
      </div>

      <section className="wallets-card wallets-card--full">
        <div className="wallets-card-head">
          <h2>Buscar wallet de usuario</h2>
          <form
            className="wallets-toolbar"
            onSubmit={(event) => {
              event.preventDefault();
              loadUserWallet(telegramIdInput);
            }}
          >
            <input
              type="text"
              value={telegramIdInput}
              onChange={(event) => setTelegramIdInput(event.target.value)}
              placeholder="telegram_id o @username"
            />
            <button type="submit">Buscar</button>
          </form>
        </div>

        {!selectedUser ? (
          <p className="wallets-empty">Busca un usuario para ver saldo y movimientos.</p>
        ) : (
          <div className="wallets-user-grid">
            <div className="wallets-user-card">
              {loadingUser ? <p className="wallets-empty">Cargando wallet...</p> : null}
              <p><strong>ID:</strong> {selectedUser.user?.telegram_id}</p>
              <p><strong>Username:</strong> {formatUsername(selectedUser.user?.telegram_username)}</p>
              <p><strong>Saldo actual:</strong> {formatUsd(selectedUser.wallet?.balance)}</p>
              <p><strong>Moneda:</strong> {selectedUser.wallet?.currency || "USD"}</p>

              <form className="wallets-adjust-form" onSubmit={handleAdjust}>
                <input
                  type="text"
                  value={adjustAmount}
                  onChange={(event) => setAdjustAmount(event.target.value)}
                  placeholder="Monto, ejemplo: 15 o -5"
                />
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(event) => setAdjustReason(event.target.value)}
                  placeholder="Motivo opcional"
                />
                <button type="submit">Aplicar ajuste</button>
              </form>
            </div>

            <div className="wallets-user-card">
              <h3>Historial</h3>
              <div className="wallets-history">
                {(selectedUser.history || []).length === 0 ? (
                  <p className="wallets-empty">No hay movimientos todavía.</p>
                ) : (
                  (selectedUser.history || []).map((item) => (
                    <div key={item.id} className="wallets-history-item">
                      <div>
                        <strong>{formatTxType(item.transaction_type)}</strong>
                        <span>{formatDate(item.created_at)}</span>
                        {item.note ? <span>{item.note}</span> : null}
                      </div>
                      <div className={String(item.direction || "").toUpperCase() === "DEBIT" ? "is-negative" : "is-positive"}>
                        {txAmountLabel(item)}
                        <small>Saldo: {formatUsd(item.balance_after)}</small>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      <style jsx>{`
        .wallets-page {
          display: grid;
          gap: 24px;
        }
        .wallets-header-card,
        .wallets-card {
          background: rgba(28, 26, 26, 0.9);
          border: 1px solid rgba(255, 72, 0, 0.45);
          border-radius: 26px;
          padding: 24px;
          box-shadow: 10px 10px 24px rgba(0, 0, 0, 0.35);
        }
        .wallets-header-card {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          align-items: flex-start;
        }
        .wallets-header-card h1 {
          margin: 0 0 8px;
          color: #ff4a0d;
          font-size: 2rem;
        }
        .wallets-header-card p {
          margin: 0;
          color: #f7d8d1;
        }
        .wallets-summary {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }
        .wallets-summary span {
          border: 1px solid rgba(255, 72, 0, 0.35);
          border-radius: 999px;
          padding: 10px 14px;
          color: #ffe7df;
          background: rgba(255, 72, 0, 0.08);
        }
        .wallets-grid {
          display: grid;
          grid-template-columns: 1.1fr 1fr;
          gap: 24px;
        }
        .wallets-card--full {
          width: 100%;
        }
        .wallets-card-head {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: center;
          margin-bottom: 18px;
        }
        .wallets-card-head h2,
        .wallets-user-card h3 {
          margin: 0;
          color: #ff4a0d;
        }
        .wallets-toolbar {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .wallets-toolbar select,
        .wallets-toolbar input,
        .wallets-adjust-form input,
        .wallets-detail textarea {
          min-height: 42px;
          border-radius: 14px;
          border: 1px solid rgba(255, 72, 0, 0.35);
          background: rgba(14, 14, 14, 0.8);
          color: #fff;
          padding: 10px 14px;
        }
        .wallets-detail textarea {
          width: 100%;
          min-height: 84px;
          resize: vertical;
        }
        .wallets-toolbar button,
        .wallets-adjust-form button,
        .wallets-actions button,
        .wallets-pagination button {
          min-height: 42px;
          border-radius: 14px;
          border: 1px solid rgba(255, 72, 0, 0.45);
          background: rgba(255, 72, 0, 0.14);
          color: #fff;
          padding: 10px 16px;
          cursor: pointer;
        }
        .wallets-toolbar button:hover,
        .wallets-adjust-form button:hover,
        .wallets-actions button:hover,
        .wallets-pagination button:hover {
          background: rgba(255, 72, 0, 0.22);
        }
        .wallets-actions button:disabled,
        .wallets-pagination button:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .wallets-primary {
          background: rgba(28, 158, 74, 0.24) !important;
          border-color: rgba(28, 158, 74, 0.48) !important;
        }
        .wallets-danger {
          background: rgba(196, 41, 41, 0.2) !important;
          border-color: rgba(196, 41, 41, 0.46) !important;
        }
        .wallets-secondary {
          background: rgba(56, 123, 255, 0.18) !important;
          border-color: rgba(56, 123, 255, 0.38) !important;
        }
        .wallets-list {
          display: grid;
          gap: 12px;
        }
        .wallets-list-item {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          text-align: left;
          border-radius: 18px;
          border: 1px solid rgba(255, 72, 0, 0.22);
          background: rgba(10, 10, 10, 0.7);
          color: #fff;
          padding: 14px 16px;
          cursor: pointer;
        }
        .wallets-list-item.is-active {
          border-color: rgba(255, 72, 0, 0.56);
          background: rgba(255, 72, 0, 0.12);
        }
        .wallets-list-item strong,
        .wallets-history-item strong {
          display: block;
          margin-bottom: 4px;
        }
        .wallets-list-item span,
        .wallets-history-item span,
        .wallets-detail-block p,
        .wallets-user-card p {
          color: #f2e2de;
        }
        .wallets-list-item span {
          display: block;
          font-size: 0.92rem;
        }
        .wallets-list-meta {
          text-align: right;
        }
        .wallets-detail {
          display: grid;
          gap: 16px;
        }
        .wallets-detail-block {
          display: grid;
          gap: 8px;
        }
        .wallets-detail-block p,
        .wallets-user-card p {
          margin: 0;
        }
        .wallets-proof img,
        .wallets-proof-placeholder {
          width: 100%;
          min-height: 240px;
          border-radius: 18px;
          border: 1px solid rgba(255, 72, 0, 0.25);
          background: rgba(8, 8, 8, 0.7);
          object-fit: contain;
        }
        .wallets-proof-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          color: #c9a8a1;
          padding: 20px;
          text-align: center;
        }
        .wallets-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .wallets-pagination {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          margin-top: 16px;
        }
        .wallets-user-grid {
          display: grid;
          grid-template-columns: minmax(280px, 360px) 1fr;
          gap: 20px;
        }
        .wallets-user-card {
          border-radius: 18px;
          border: 1px solid rgba(255, 72, 0, 0.22);
          background: rgba(10, 10, 10, 0.58);
          padding: 18px;
        }
        .wallets-adjust-form {
          display: grid;
          gap: 10px;
          margin-top: 16px;
        }
        .wallets-history {
          display: grid;
          gap: 12px;
        }
        .wallets-history-item {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          border-radius: 16px;
          border: 1px solid rgba(255, 72, 0, 0.18);
          background: rgba(255, 255, 255, 0.02);
          padding: 14px;
        }
        .wallets-history-item small {
          display: block;
          margin-top: 6px;
          color: #c9a8a1;
        }
        .is-positive {
          color: #7ef0a4;
          text-align: right;
        }
        .is-negative {
          color: #ff9f9f;
          text-align: right;
        }
        .wallets-empty {
          margin: 0;
          color: #d8b7b1;
        }
        @media (max-width: 980px) {
          .wallets-grid,
          .wallets-user-grid,
          .wallets-header-card {
            grid-template-columns: 1fr;
            display: grid;
          }
          .wallets-summary {
            margin-top: 4px;
          }
        }
      `}</style>
    </div>
  );
}
