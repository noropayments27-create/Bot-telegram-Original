import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";

import { apiFetch, apiFetchBinary, getAuthToken } from "../../lib/api";
import { IconAffiliates } from "../../components/PanelIcons";

const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "PENDING", label: "PENDIENTE" },
  { value: "APPROVED", label: "APROBADO" },
  { value: "REJECTED", label: "RECHAZADO" },
];

export default function AffiliatesPage() {
  const botUsername =
    (process.env.NEXT_PUBLIC_BOT_USERNAME || "").replace(/^@/, "") || "tu_bot";
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("APPROVED");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedAffiliateIds, setSelectedAffiliateIds] = useState([]);
  const [details, setDetails] = useState({});
  const [detailLoading, setDetailLoading] = useState({});
  const [detailErrors, setDetailErrors] = useState({});
  const [detailMessages, setDetailMessages] = useState({});
  const [globalCommissionRate, setGlobalCommissionRate] = useState("");
  const [globalCommissionMessage, setGlobalCommissionMessage] = useState("");
  const [globalCommissionError, setGlobalCommissionError] = useState("");
  const [globalCommissionSaving, setGlobalCommissionSaving] = useState(false);
  const [photoUrls, setPhotoUrls] = useState({});
  const [isCommissionOpen, setIsCommissionOpen] = useState(true);

  const formatRatePercent = (rate) => {
    const numeric = Number(rate);
    if (!Number.isFinite(numeric)) {
      return "-";
    }
    return `${(numeric * 100).toFixed(2)}%`;
  };

  const formatMoney = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "-";
    }
    return `$${numeric.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  };

  const formatDate = (value) => {
    if (!value) {
      return "-";
    }
    return new Date(value).toLocaleDateString();
  };

  const loadAffiliatePhoto = async (telegramId) => {
    if (!telegramId || photoUrls[telegramId]) {
      return;
    }
    try {
      const { buffer, contentType } = await apiFetchBinary(
        `/admin/users/${telegramId}/photo`
      );
      const blob = new Blob([buffer], { type: contentType });
      const url = URL.createObjectURL(blob);
      setPhotoUrls((prev) => ({ ...prev, [telegramId]: url }));
    } catch (err) {
      // ignore missing photos
    }
  };

  const getInitials = (username, telegramId) => {
    const base = (username || "").replace(/^@/, "").trim();
    if (base) {
      return base.slice(0, 2).toUpperCase();
    }
    return String(telegramId || "--").slice(-2);
  };

  const toDecimalRate = (value) => {
    if (value === "" || value === null || value === undefined) {
      return null;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
      return null;
    }
    return numeric > 1 ? numeric / 100 : numeric;
  };

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    const loadGlobalCommission = async () => {
      try {
        const data = await apiFetch("/admin/affiliates/commission-rate");
        if (data && data.rate_percent != null) {
          setGlobalCommissionRate(String(data.rate_percent));
        }
      } catch (err) {
        setGlobalCommissionError("No se pudo cargar la comisión global.");
      }
    };
    loadGlobalCommission();
  }, []);

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
    items.forEach((affiliate) => {
      loadAffiliatePhoto(affiliate.telegram_id);
    });
  }, [items]);


  const handleStatusChange = (event) => {
    setStatus(event.target.value);
    setPage(1);
  };

  const handleToggleLock = async (affiliate) => {
    const nextStatus = affiliate.status === "APPROVED" ? "REJECTED" : "APPROVED";
    try {
      await apiFetch(`/admin/affiliates/${affiliate.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      setItems((prev) =>
        prev.map((item) =>
          item.id === affiliate.id ? { ...item, status: nextStatus } : item
        )
      );
    } catch (err) {
      setError("No se pudo actualizar el estado del afiliado.");
    }
  };

  const removeDetail = useCallback((affiliateId) => {
    setDetails((prev) => {
      const next = { ...prev };
      delete next[affiliateId];
      return next;
    });
    setDetailErrors((prev) => {
      const next = { ...prev };
      delete next[affiliateId];
      return next;
    });
    setDetailMessages((prev) => {
      const next = { ...prev };
      delete next[affiliateId];
      return next;
    });
  }, []);

  const loadDetail = useCallback(async (affiliateId) => {
    if (!affiliateId) {
      return;
    }
    setDetailLoading((prev) => ({ ...prev, [affiliateId]: true }));
    setDetailErrors((prev) => ({ ...prev, [affiliateId]: "" }));
    try {
      const data = await apiFetch(`/admin/affiliates/${affiliateId}`);
      setDetails((prev) => ({ ...prev, [affiliateId]: data }));
    } catch (err) {
      setDetailErrors((prev) => ({
        ...prev,
        [affiliateId]: "No se pudo cargar el afiliado.",
      }));
    } finally {
      setDetailLoading((prev) => ({ ...prev, [affiliateId]: false }));
    }
  }, []);

  const handleViewAffiliate = async (affiliateId) => {
    if (!affiliateId) {
      return;
    }
    setSelectedAffiliateIds((prev) => {
      if (prev.includes(affiliateId)) {
        removeDetail(affiliateId);
        return prev.filter((id) => id !== affiliateId);
      }
      const next = [affiliateId, ...prev.filter((id) => id !== affiliateId)];
      if (next.length > 3) {
        const removed = next.pop();
        if (removed) {
          removeDetail(removed);
        }
      }
      return next;
    });
    await loadDetail(affiliateId);
  };

  useEffect(() => {
    selectedAffiliateIds.forEach((affiliateId) => {
      if (!details[affiliateId] && !detailLoading[affiliateId]) {
        loadDetail(affiliateId);
      }
    });
  }, [detailLoading, details, loadDetail, selectedAffiliateIds]);

  const handleQuickStatus = async (affiliateId, nextStatus) => {
    try {
      await apiFetch(`/admin/affiliates/${affiliateId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      setDetailMessages((prev) => ({
        ...prev,
        [affiliateId]: `Afiliado ${nextStatus === "APPROVED" ? "aprobado" : "rechazado"}.`,
      }));
      setItems((prev) =>
        prev.map((item) =>
          item.id === affiliateId ? { ...item, status: nextStatus } : item
        )
      );
    } catch (err) {
      setError("No se pudo actualizar el estado del afiliado.");
    }
  };

  const handleSaveGlobalCommission = async () => {
    if (globalCommissionSaving) {
      return;
    }
    setGlobalCommissionSaving(true);
    setGlobalCommissionMessage("");
    setGlobalCommissionError("");
    try {
      const payload = { commission_rate: toDecimalRate(globalCommissionRate) };
      await apiFetch("/admin/affiliates/commission-rate", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setGlobalCommissionMessage("Comisión global actualizada.");
    } catch (err) {
      setGlobalCommissionError("No se pudo actualizar la comisión global.");
    } finally {
      setGlobalCommissionSaving(false);
    }
  };

  return (
    <main className="page">
      <section className="card affiliates-commission-card">
        <div className="affiliates-commission-header">
          <h2>Comisión global</h2>
          <button
            type="button"
            className="link-button"
            onClick={() => setIsCommissionOpen((prev) => !prev)}
          >
            {isCommissionOpen ? "Ocultar" : "Mostrar"}
          </button>
        </div>
        {isCommissionOpen && (
          <>
            {globalCommissionMessage && <p className="muted">{globalCommissionMessage}</p>}
            {globalCommissionError && <p className="error">{globalCommissionError}</p>}
            <div className="form">
              <label>
                Comisión (%)
                <input
                  className="commission-input"
                  type="number"
                  value={globalCommissionRate}
                  onChange={(event) => setGlobalCommissionRate(event.target.value)}
                  placeholder="20"
                  min="0"
                  step="0.01"
                />
              </label>
              <button
                type="button"
                onClick={handleSaveGlobalCommission}
                disabled={globalCommissionSaving}
              >
                {globalCommissionSaving ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </>
        )}
      </section>
      <section className="card affiliates-card">
        <h1 className="icon-inline"><IconAffiliates className="panel-icon" /> Afiliados</h1>
        {message && <p className="muted">{message}</p>}
        {error && <p className="error">{error}</p>}
        <div className="form">
          <label>
            Estado
            <select
              className="affiliates-status-select"
              value={status}
              onChange={handleStatusChange}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="table-scroll affiliates-table-scroll">
          <table style={{ width: "100%", marginTop: "16px" }}>
            <thead>
              <tr>
                <th align="left">Perfil</th>
                <th align="left" className="affiliate-center">Telegram ID</th>
                <th align="left" className="affiliate-center">Estado</th>
                <th align="left" className="affiliate-center">Ventas</th>
                <th align="left" className="affiliate-center">Ganancias</th>
                <th align="left" className="affiliate-center">Ingreso</th>
                <th align="left" className="affiliate-center">Bloqueo</th>
                <th align="left" className="affiliate-center">Acciones</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((affiliate) => {
                return (
                  <tr key={affiliate.id}>
                    <td>
                      <div className="affiliate-name-cell">
                          <div className="affiliate-avatar">
                            {photoUrls[affiliate.telegram_id] ? (
                              <img
                                src={photoUrls[affiliate.telegram_id]}
                                alt="Avatar"
                              />
                            ) : (
                              getInitials(
                                affiliate.telegram_username,
                                affiliate.telegram_id
                              )
                            )}
                          </div>
                        <div>
                          <div className="affiliate-username">
                            {affiliate.telegram_username || "-"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="affiliate-center">{affiliate.telegram_id}</td>
                    <td className="affiliate-center">{formatStatus(affiliate.status)}</td>
                    <td className="affiliate-center">{affiliate.sales_count || 0}</td>
                    <td className="affiliate-center">{formatMoney(affiliate.earnings_total)}</td>
                    <td className="affiliate-center">
                      {formatDate(affiliate.approved_at || affiliate.created_at)}
                    </td>
                    <td className="affiliate-center">
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => handleToggleLock(affiliate)}
                        title={
                          affiliate.status === "APPROVED"
                            ? "Bloquear afiliado"
                            : "Activar afiliado"
                        }
                      >
                        {affiliate.status === "APPROVED" ? "🔓" : "🔒"}
                      </button>
                    </td>
                  <td>
                    {affiliate.status === "PENDING" ? (
                      <div className="actions" style={{ marginTop: 0 }}>
                        <button
                          type="button"
                          onClick={() => handleQuickStatus(affiliate.id, "APPROVED")}
                        >
                          Aprobar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickStatus(affiliate.id, "REJECTED")}
                        >
                          Rechazar
                        </button>
                      </div>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => handleViewAffiliate(affiliate.id)}
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              );
            })}
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
      {selectedAffiliateIds.length > 0 && (
        <div className="orders-detail-wrap">
          {selectedAffiliateIds.map((affiliateId) => {
            const detail = details[affiliateId];
            const isLoading = detailLoading[affiliateId];
            const errorMessage = detailErrors[affiliateId];
            const detailMessage = detailMessages[affiliateId];
            const affiliate = detail?.affiliate;
            const user = detail?.user;
            const commissions = detail?.commissions || [];

            return (
              <section key={affiliateId} className="card orders-detail-card">
                {isLoading && <p>Cargando...</p>}
                {!isLoading && affiliate && (
                  <>
                    <div className="orders-detail-header">
                      <h2>Afiliado #{affiliate.id}</h2>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => handleViewAffiliate(affiliate.id)}
                      >
                        Cerrar
                      </button>
                    </div>
                    <div className="orders-detail-separator"></div>
                    {detailMessage && <p className="muted">{detailMessage}</p>}
                    {errorMessage && <p className="error">{errorMessage}</p>}
                    <div className="orders-detail-grid">
                      <div className="orders-detail-section">
                        <h3>Detalle</h3>
                        <p>Estado: {affiliate.status}</p>
                        <p>Comisión: {formatRatePercent(affiliate.commission_rate)}</p>
                        <p>Balance disponible: {detail.available_balance}</p>
                        <p>
                          Creado:{" "}
                          {affiliate.created_at
                            ? new Date(affiliate.created_at).toLocaleString()
                            : "-"}
                        </p>
                        <p>
                          Aprobado:{" "}
                          {affiliate.approved_at
                            ? new Date(affiliate.approved_at).toLocaleString()
                            : "-"}
                        </p>
                        <p>Código referido: {affiliate.id}</p>
                        <p>
                          Link sugerido: https://t.me/{botUsername}?start={affiliate.id}
                        </p>
                      </div>
                      <div className="orders-detail-section">
                        <h3>Usuario</h3>
                        <p>Telegram ID: {user?.telegram_id || "-"}</p>
                        <p>Username: {user?.telegram_username || "-"}</p>
                        <div className="orders-detail-subseparator"></div>
                        <h3>Pagos</h3>
                        <p>
                          Metodo:{" "}
                          {affiliate.wallet_usdt_bsc
                            ? "USDT"
                            : affiliate.binance_id
                            ? "ID de Binance"
                            : "-"}
                        </p>
                        <p>
                          Destino:{" "}
                          {affiliate.wallet_usdt_bsc || affiliate.binance_id || "-"}
                        </p>
                      </div>
                    </div>
                    <div className="orders-detail-separator"></div>
                    <div className="orders-detail-section">
                      <h3>Comisiones recientes</h3>
                      {commissions.length === 0 ? (
                        <p className="muted">Sin comisiones.</p>
                      ) : (
                        <div className="table-scroll">
                          <table style={{ width: "100%", marginTop: "8px" }}>
                            <thead>
                              <tr>
                                <th align="left">Orden</th>
                                <th align="left">Monto</th>
                                <th align="left">Estado</th>
                                <th align="left">Ganado</th>
                                <th align="left">Pagado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {commissions.map((row) => (
                                <tr key={row.id}>
                                  <td>{row.order_id}</td>
                                  <td>{row.amount}</td>
                                  <td>{row.status}</td>
                                  <td>
                                    {row.earned_at
                                      ? new Date(row.earned_at).toLocaleString()
                                      : "-"}
                                  </td>
                                  <td>
                                    {row.paid_out_at
                                      ? new Date(row.paid_out_at).toLocaleString()
                                      : "-"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                )}
                {!isLoading && !affiliate && errorMessage && (
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
  const formatStatus = (value) => {
    if (value === "APPROVED") {
      return "APROBADO";
    }
    if (value === "PENDING") {
      return "PENDIENTE";
    }
    if (value === "REJECTED") {
      return "BLOQUEADO";
    }
    return value || "-";
  };
