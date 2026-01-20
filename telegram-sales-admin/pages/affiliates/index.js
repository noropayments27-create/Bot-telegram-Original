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
  const [status, setStatus] = useState("");
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
  const [toast, setToast] = useState("");
  const hasPending = items.some((item) => item.status === "PENDING");

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

  const formatUsdAmount = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "-";
    }
    const formatted = numeric.toLocaleString("en-US", {
      minimumFractionDigits: Number.isInteger(numeric) ? 0 : 2,
      maximumFractionDigits: 2,
    });
    return `$${formatted} USD`;
  };

  const formatAffiliateNumber = (value) => {
    if (!value) {
      return null;
    }
    return String(value).padStart(5, "0");
  };

  const formatDate = (value) => {
    if (!value) {
      return "-";
    }
    return new Date(value).toLocaleDateString();
  };

  const formatCommissionAmount = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "-";
    }
    const rounded = Number.isInteger(numeric)
      ? numeric.toFixed(0)
      : numeric.toFixed(2);
    return `$${rounded} USD`;
  };

  const formatCommissionStatus = (value) => {
    const status = String(value || "").toUpperCase();
    if (status === "EARNED") return "GANADA";
    if (status === "RESERVED") return "RESERVADA";
    if (status === "PAID_OUT") return "PAGADA";
    if (status === "CANCELLED") return "CANCELADA";
    return status || "-";
  };

  const getLevelBaseRate = (levelLabel) => {
    if (levelLabel.includes("Novato")) return 5;
    if (levelLabel.includes("Bronce")) return 8;
    if (levelLabel.includes("Plata")) return 12;
    if (levelLabel.includes("Oro")) return 15;
    if (levelLabel.includes("Diamante")) return 20;
    if (levelLabel.includes("Élite")) return 30;
    return 0;
  };

  const formatApprovedAt = (value) => {
    if (!value) {
      return "-";
    }
    return new Date(value).toLocaleString();
  };

  const getAffiliateLevel = (salesTotal, earningsTotal, lastSaleAt) => {
    let baseIndex = 0;
    if (salesTotal >= 100 && earningsTotal >= 600) baseIndex = 5;
    else if (salesTotal >= 70 && earningsTotal >= 500) baseIndex = 4;
    else if (salesTotal >= 40 && earningsTotal >= 200) baseIndex = 3;
    else if (salesTotal >= 20 && earningsTotal >= 50) baseIndex = 2;
    else if (salesTotal >= 2 && earningsTotal >= 5) baseIndex = 1;

    let downgradeSteps = 0;
    if (lastSaleAt) {
      const lastSaleTime = new Date(lastSaleAt).getTime();
      const daysSince = Math.max(
        Math.floor((Date.now() - lastSaleTime) / (24 * 60 * 60 * 1000)),
        0
      );
      if (daysSince >= 30) {
        downgradeSteps = Math.floor(daysSince / 30);
      }
    }
    const finalIndex = Math.max(0, baseIndex - downgradeSteps);
    const labels = [
      "Novato 🎖️",
      "Bronce 🥉",
      "Plata 🥈",
      "Oro 🥇",
      "Diamante 💎",
      "Élite 👑",
    ];
    return labels[finalIndex];
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
    const cleaned = String(value).replace(",", ".").trim();
    if (cleaned === "") {
      return null;
    }
    const numeric = Number(cleaned);
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
      setDetails((prev) => {
        if (!prev[affiliate.id]) {
          return prev;
        }
        return {
          ...prev,
          [affiliate.id]: {
            ...prev[affiliate.id],
            affiliate: {
              ...prev[affiliate.id].affiliate,
              status: nextStatus,
            },
          },
        };
      });
      setToast(
        nextStatus === "APPROVED"
          ? "Afiliado activado."
          : "Afiliado bloqueado."
      );
    } catch (err) {
      const detail = err?.payload?.error || "No se pudo actualizar el estado del afiliado.";
      setToast(detail);
      setError("No se pudo actualizar el estado del afiliado.");
    }
  };

  const handleCopy = async (label, value) => {
    try {
      await navigator.clipboard.writeText(String(value ?? ""));
      setToast(`${label} copiado.`);
    } catch (err) {
      setToast(`No se pudo copiar ${label}.`);
    }
  };

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

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
      const errorText =
        (err && err.payload && err.payload.error) ? ` (${err.payload.error})` : "";
      setGlobalCommissionError(`No se pudo actualizar la comisión global.${errorText}`);
    } finally {
      setGlobalCommissionSaving(false);
    }
  };

  return (
    <main className="page affiliates-page">
      <section className="card affiliates-card">
        <div className="affiliates-header">
          <h1 className="icon-inline affiliates-title"><IconAffiliates className="panel-icon" /> Afiliados</h1>
          <div className="affiliates-header-actions">
            <div className="form affiliates-filters">
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
            <div className="affiliates-commission-card">
            <div className="affiliates-commission-header">
              <h2 className="affiliates-title">
                <svg viewBox="0 0 24 24" aria-hidden="true" className="affiliates-title-icon">
                  <path
                    d="M12 2v20M7 6.5c0-1.9 2.2-3.5 5-3.5s5 1.6 5 3.5-2.2 3.5-5 3.5-5 1.6-5 3.5 2.2 3.5 5 3.5 5-1.6 5-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Comisión global
              </h2>
            </div>
            {globalCommissionMessage && <p className="muted">{globalCommissionMessage}</p>}
            {globalCommissionError && <p className="error">{globalCommissionError}</p>}
            <div className="form">
              <label>
                Comisión (%)
                <input
                  className="commission-input"
                  type="number"
                  value={globalCommissionRate}
                  onChange={(event) => {
                    const raw = event.target.value || "";
                    const cleaned = raw.replace(/[^0-9.]/g, "");
                    const parts = cleaned.split(".");
                    const integerPart = (parts[0] || "").slice(0, 2);
                    const decimalPart = (parts[1] || "").slice(0, 2);
                    const value = decimalPart ? `${integerPart}.${decimalPart}` : integerPart;
                    setGlobalCommissionRate(value);
                  }}
                  placeholder="20"
                  min="0"
                  max="99"
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
          </div>
          </div>
        </div>
        {message && <p className="muted">{message}</p>}
        {error && <p className="error">{error}</p>}
        <div className="table-scroll affiliates-table-scroll">
          <table style={{ width: "100%", marginTop: "16px" }}>
            <thead>
              <tr>
                <th align="left">Perfil</th>
                <th align="left" className="affiliate-center">Afiliado</th>
                <th align="left" className="affiliate-center">Telegram ID</th>
                <th align="left" className="affiliate-center">Estado</th>
                <th align="left" className="affiliate-center">Ventas</th>
                <th align="left" className="affiliate-center">Ganancias</th>
                <th align="left" className="affiliate-center">Ingreso</th>
                <th align="left" className="affiliate-center">Bloqueo</th>
                <th align="left" className="affiliate-center">
                  {hasPending ? "Acciones" : "Nivel"}
                </th>
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
                          <button
                            type="button"
                            className="orders-copy"
                            onClick={() =>
                              handleCopy("Username", affiliate.telegram_username)
                            }
                          >
                            {affiliate.telegram_username || "-"}
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="affiliate-center">
                      {affiliate?.affiliate_number
                        ? `#${formatAffiliateNumber(affiliate.affiliate_number)}`
                        : "-"}
                    </td>
                    <td className="affiliate-center">
                      <button
                        type="button"
                        className="orders-copy"
                        onClick={() =>
                          handleCopy("Telegram ID", affiliate.telegram_id)
                        }
                      >
                        {affiliate.telegram_id}
                      </button>
                    </td>
                    <td className="affiliate-center">{formatStatus(affiliate.status)}</td>
                    <td className="affiliate-center">{affiliate.sales_count || 0}</td>
                    <td className="affiliate-center">{formatMoney(affiliate.earnings_total)}</td>
                    <td className="affiliate-center">
                      {formatDate(affiliate.approved_at || affiliate.created_at)}
                    </td>
                    <td className="affiliate-center">
                      <button
                        type="button"
                        className={`lock-button ${
                          affiliate.status === "APPROVED" ? "lock-open" : "lock-closed"
                        }`}
                        onClick={() => handleToggleLock(affiliate)}
                        title={
                          affiliate.status === "APPROVED"
                            ? "Bloquear afiliado"
                            : "Activar afiliado"
                        }
                      >
                        {affiliate.status === "APPROVED" ? (
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path
                              d="M17 9h-7V7a4 4 0 0 1 7.6-1.6"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <rect
                              x="3"
                              y="9"
                              width="14"
                              height="12"
                              rx="2"
                              ry="2"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <rect
                              x="3"
                              y="9"
                              width="18"
                              height="12"
                              rx="2"
                              ry="2"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M7 9V7a5 5 0 0 1 10 0v2"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </button>
                    </td>
                  <td className="affiliate-center">
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
                      <span className="muted">
                        {getAffiliateLevel(
                          affiliate.sales_count || 0,
                          Number(affiliate.earnings_total || 0),
                          affiliate.last_sale_at
                        )}
                      </span>
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
                      <h2>
                        Afiliado
                        {affiliate?.affiliate_number
                          ? ` #${formatAffiliateNumber(affiliate.affiliate_number)}`
                          : ""}
                      </h2>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => handleViewAffiliate(affiliate.id)}
                      >
                        Cerrar
                      </button>
                    </div>
                    <div className="orders-detail-separator"></div>
                    <div className="affiliate-detail-table">
                      <div className="affiliate-detail-row affiliate-detail-row--header">
                        <div>Perfil</div>
                        <div className="affiliate-center">Telegram ID</div>
                        <div className="affiliate-center">Estado</div>
                        <div className="affiliate-center">Ventas</div>
                        <div className="affiliate-center">Ganancias</div>
                        <div className="affiliate-center">Ingreso</div>
                        <div className="affiliate-center">Bloqueo</div>
                        <div className="affiliate-center">Nivel</div>
                      </div>
                      <div className="affiliate-detail-row affiliate-detail-row--data">
                        <div className="affiliate-name-cell">
                          <div className="affiliate-avatar affiliate-detail-avatar">
                            {photoUrls[user?.telegram_id] ? (
                              <img
                                src={photoUrls[user?.telegram_id]}
                                alt="Avatar"
                              />
                            ) : (
                              getInitials(user?.telegram_username, user?.telegram_id)
                            )}
                          </div>
                          <button
                            type="button"
                            className="orders-copy"
                            onClick={() => handleCopy("Username", user?.telegram_username)}
                          >
                            {user?.telegram_username || "-"}
                          </button>
                        </div>
                        <div className="affiliate-center">
                          <button
                            type="button"
                            className="orders-copy"
                            onClick={() => handleCopy("Telegram ID", user?.telegram_id)}
                          >
                            {user?.telegram_id || "-"}
                          </button>
                        </div>
                        <div className="affiliate-center">{formatStatus(affiliate.status)}</div>
                        <div className="affiliate-center">{detail?.affiliate?.sales_count || 0}</div>
                        <div className="affiliate-center">{formatMoney(detail?.affiliate?.earnings_total)}</div>
                        <div className="affiliate-center">
                          {formatDate(affiliate.approved_at || affiliate.created_at)}
                        </div>
                        <div className="affiliate-center">
                          <button
                            type="button"
                            className={`lock-button lock-pill ${
                              affiliate.status === "APPROVED" ? "lock-open" : "lock-closed"
                            }`}
                            onClick={() => handleToggleLock(affiliate)}
                            title={
                              affiliate.status === "APPROVED"
                                ? "Bloquear afiliado"
                                : "Activar afiliado"
                            }
                          >
                            {affiliate.status === "APPROVED" ? (
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path
                                  d="M17 9h-7V7a4 4 0 0 1 7.6-1.6"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                                <rect
                                  x="3"
                                  y="9"
                                  width="14"
                                  height="12"
                                  rx="2"
                                  ry="2"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            ) : (
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <rect
                                  x="3"
                                  y="9"
                                  width="18"
                                  height="12"
                                  rx="2"
                                  ry="2"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                                <path
                                  d="M7 9V7a5 5 0 0 1 10 0v2"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </button>
                        </div>
                        <div className="affiliate-center">
                          {getAffiliateLevel(
                            detail?.affiliate?.sales_count || 0,
                            Number(detail?.affiliate?.earnings_total || 0),
                            detail?.affiliate?.last_sale_at
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="orders-detail-separator"></div>
                    {detailMessage && <p className="muted">{detailMessage}</p>}
                    {errorMessage && <p className="error">{errorMessage}</p>}
                    <div className="orders-detail-grid">
                      <div className="orders-detail-section">
                        <h3>Detalle</h3>
                        <p>Estado: {formatStatus(affiliate.status)}</p>
                        <p>
                          Comisión:{" "}
                          {`${getLevelBaseRate(
                            getAffiliateLevel(
                              detail?.affiliate?.sales_count || 0,
                              Number(detail?.affiliate?.earnings_total || 0),
                              detail?.affiliate?.last_sale_at
                            )
                          )}%`}
                        </p>
                        <p>Balance disponible: {formatUsdAmount(detail.available_balance)}</p>
                        <p>
                          Ingreso:{" "}
                          {affiliate.approved_at
                            ? new Date(affiliate.approved_at).toLocaleString()
                            : "-"}
                        </p>
                        <p>
                          Link de afiliado:{" "}
                          <button
                            type="button"
                            className="orders-copy"
                            onClick={() =>
                              handleCopy(
                                "Link de afiliado",
                                `https://t.me/${botUsername}?start=${user?.telegram_id || ""}`
                              )
                            }
                          >
                            https://t.me/{botUsername}?start={user?.telegram_id || "-"}
                          </button>
                        </p>
                      </div>
                      <div className="orders-detail-section">
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
                            {user?.telegram_username || "-"}
                          </button>
                        </p>
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
                      <h3 className="affiliate-commissions-title">Comisiones recientes</h3>
                      {commissions.length === 0 ? (
                        <p className="muted">Sin comisiones.</p>
                      ) : (
                        <div className="table-scroll affiliate-commissions-scroll">
                          <table style={{ width: "100%", marginTop: "0px" }}>
                            <thead>
                              <tr>
                                <th align="left">Número</th>
                                <th align="left">Orden</th>
                                <th align="left">Comprador</th>
                                <th align="left">Telegram ID</th>
                                <th align="left">Monto</th>
                                <th align="left">Estado</th>
                                <th align="left">Ganado</th>
                                <th align="left">Retirado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {commissions.map((row) => (
                                <tr key={row.id}>
                                  <td>
                                    {row.order_number
                                      ? String(row.order_number).padStart(5, "0")
                                      : "-"}
                                  </td>
                                  <td>
                                    <button
                                      type="button"
                                      className="link-button commission-order-link"
                                      onClick={() => router.push(`/orders/${row.order_id}`)}
                                    >
                                      <span className="truncate-id">{row.order_id}</span>
                                    </button>
                                  </td>
                                  <td>
                                    <button
                                      type="button"
                                      className="orders-copy"
                                      onClick={() =>
                                        handleCopy("Username", row.buyer_username)
                                      }
                                    >
                                      {row.buyer_username || "-"}
                                    </button>
                                  </td>
                                  <td>
                                    <button
                                      type="button"
                                      className="orders-copy"
                                      onClick={() =>
                                        handleCopy("Telegram ID", row.buyer_telegram_id)
                                      }
                                    >
                                      {row.buyer_telegram_id || "-"}
                                    </button>
                                  </td>
                                  <td>{formatCommissionAmount(row.amount)}</td>
                                  <td>{formatCommissionStatus(row.status)}</td>
                                  <td>{formatApprovedAt(row.payment_approved_at)}</td>
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
