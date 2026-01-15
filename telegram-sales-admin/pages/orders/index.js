import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";

import {
  apiFetch,
  apiFetchBinary,
  clearAuthToken,
  getApiBaseUrl,
  getAuthToken,
} from "../../lib/api";
import { IconOrders } from "../../components/PanelIcons";

function cleanProductName(name) {
  if (!name) {
    return "";
  }
  return String(name).replace(/^shop\s*\d+\s*-\s*/i, "").trim();
}

const STATUS_LABELS = {
  CREATED: "CREADA",
  WAITING_PAYMENT: "ESPERANDO PAGO",
  PAID: "PAGADA",
  DELIVERED: "ENTREGADA",
  CANCELLED: "CANCELADA",
  APPROVED: "APROBADO",
  REJECTED: "RECHAZADO",
  PENDING: "PENDIENTE",
  SUBMITTED: "ENVIADO",
  EARNED: "GANADA",
  PAID_OUT: "PAGADA",
};

function formatOrderStatus(status) {
  if (!status) {
    return "-";
  }
  return STATUS_LABELS[status] || status;
}

function formatLocalTotal(value, currency) {
  if (value === undefined || value === null) {
    return "";
  }
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return String(value);
  }
  if (currency === "BTC" || currency === "LTC") {
    return numericValue.toFixed(8);
  }
  if (currency === "USDT") {
    return numericValue.toFixed(2);
  }
  if (currency === "COP") {
    return numericValue.toLocaleString("es-CO", {
      maximumFractionDigits: 0,
    });
  }
  return numericValue.toLocaleString();
}

function formatUsername(username) {
  if (!username) {
    return "-";
  }
  return username.startsWith("@") ? username : `@${username}`;
}

function formatPaymentMethod(method) {
  if (!method) {
    return "NO ESPECIFICADO";
  }
  const key = String(method).toUpperCase();
  const map = {
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
  };
  return map[key] || key;
}

function formatCommissionUsd(value) {
  if (value === undefined || value === null) {
    return "-";
  }
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return String(value);
  }
  return numericValue.toFixed(2);
}

function formatUsdValue(value) {
  if (value === undefined || value === null) {
    return "-";
  }
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return String(value);
  }
  return numericValue.toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
}

function getOrderTone(order, payment) {
  const orderStatus = order?.status;
  const reviewStatus = payment?.review_status;
  if (orderStatus === "PAID" || orderStatus === "DELIVERED" || reviewStatus === "APPROVED") {
    return "success";
  }
  if (orderStatus === "CANCELLED" || reviewStatus === "REJECTED") {
    return "danger";
  }
  if (orderStatus === "WAITING_PAYMENT" || orderStatus === "CREATED" || reviewStatus === "PENDING" || reviewStatus === "SUBMITTED") {
    return "warning";
  }
  return "neutral";
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
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [details, setDetails] = useState({});
  const [detailMessages, setDetailMessages] = useState({});
  const [detailErrors, setDetailErrors] = useState({});
  const [detailLoading, setDetailLoading] = useState({});
  const [proofUrls, setProofUrls] = useState({});
  const [previewUrl, setPreviewUrl] = useState("");
  const [reasons, setReasons] = useState({});
  const [isSubmittingApprove, setIsSubmittingApprove] = useState({});
  const [toast, setToast] = useState("");

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

  const loadOrders = useCallback(async () => {
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
  }, [page, status]);

  useEffect(() => {
    loadOrders();
    if (status !== "RECENT") {
      return undefined;
    }
    const interval = setInterval(loadOrders, 10 * 1000);
    return () => clearInterval(interval);
  }, [loadOrders, status]);

  const handleStatusChange = (event) => {
    setStatus(event.target.value);
    setPage(1);
  };

  const removeDetail = useCallback((orderId) => {
    setDetails((prev) => {
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
    setDetailMessages((prev) => {
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
    setDetailErrors((prev) => {
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
    setDetailLoading((prev) => {
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
    setReasons((prev) => {
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
    setIsSubmittingApprove((prev) => {
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
    setProofUrls((prev) => {
      const next = { ...prev };
      if (next[orderId]) {
        URL.revokeObjectURL(next[orderId]);
      }
      delete next[orderId];
      return next;
    });
  }, []);

  const loadDetail = useCallback(async (orderId) => {
    if (!orderId) {
      return;
    }
    setDetailLoading((prev) => ({ ...prev, [orderId]: true }));
    setDetailErrors((prev) => ({ ...prev, [orderId]: "" }));
    setDetailMessages((prev) => ({ ...prev, [orderId]: "" }));
    try {
      const data = await apiFetch(`/admin/orders/${orderId}`);
      setDetails((prev) => ({ ...prev, [orderId]: data }));
      setReasons((prev) => ({ ...prev, [orderId]: prev[orderId] || "" }));
      try {
        const result = await apiFetchBinary(
          `/admin/orders/${orderId}/payment-proof`
        );
        const blob = new Blob([result.buffer], { type: result.contentType });
        const url = URL.createObjectURL(blob);
        setProofUrls((prev) => {
          if (prev[orderId]) {
            URL.revokeObjectURL(prev[orderId]);
          }
          return { ...prev, [orderId]: url };
        });
      } catch (err) {
        setProofUrls((prev) => ({ ...prev, [orderId]: "" }));
      }
    } catch (err) {
      setDetailErrors((prev) => ({
        ...prev,
        [orderId]: "No se pudo cargar la orden.",
      }));
      setDetails((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
      setProofUrls((prev) => ({ ...prev, [orderId]: "" }));
    } finally {
      setDetailLoading((prev) => ({ ...prev, [orderId]: false }));
    }
  }, []);

  useEffect(() => {
    const orderId = router.query?.orderId;
    if (!orderId || typeof orderId !== "string") {
      return;
    }
    setSelectedOrderIds((prev) => {
      if (prev.includes(orderId)) {
        return prev;
      }
      const next = [...prev, orderId];
      if (next.length > 3) {
        const [removed] = next;
        removeDetail(removed);
        return next.slice(1);
      }
      return next;
    });
    loadDetail(orderId);
  }, [router.query, loadDetail, removeDetail]);

  useEffect(() => {
    return () => {
      Object.values(proofUrls).forEach((url) => {
        if (url) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, [proofUrls]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }
    const timer = setTimeout(() => setToast(""), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

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

  const handleViewOrder = async (orderId) => {
    if (!orderId) {
      return;
    }
    setSelectedOrderIds((prev) => {
      if (prev.includes(orderId)) {
        removeDetail(orderId);
        return prev.filter((id) => id !== orderId);
      }
      const next = [...prev, orderId];
      if (next.length > 3) {
        const [removed] = next;
        removeDetail(removed);
        return next.slice(1);
      }
      return next;
    });
    await loadDetail(orderId);
  };

  const handleApprove = async (orderId) => {
    const detail = details[orderId];
    if (!detail || !detail.order || isSubmittingApprove[orderId]) {
      return;
    }
    setIsSubmittingApprove((prev) => ({ ...prev, [orderId]: true }));
    setDetailErrors((prev) => ({ ...prev, [orderId]: "" }));
    try {
      const baseUrl = getApiBaseUrl();
      const token = getAuthToken();
      const response = await fetch(
        `${baseUrl}/admin/orders/${detail.order.id}/mark-paid`,
        {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }
      );
      if (response.status === 401) {
        clearAuthToken();
        router.replace("/login");
        return;
      }
      if (response.status === 409) {
        await loadDetail(detail.order.id);
        setDetailMessages((prev) => ({
          ...prev,
          [orderId]: "Este pedido ya fue procesado anteriormente",
        }));
        return;
      }
      if (!response.ok) {
        throw new Error("APPROVE_FAILED");
      }
      setDetailMessages((prev) => ({
        ...prev,
        [orderId]: "Pago aprobado.",
      }));
      await loadDetail(detail.order.id);
      await loadOrders();
    } catch (err) {
      setDetailErrors((prev) => ({
        ...prev,
        [orderId]: "No se pudo aprobar el pago.",
      }));
    } finally {
      setIsSubmittingApprove((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  const handleReject = async (orderId, mode) => {
    const detail = details[orderId];
    if (!detail || !detail.order) {
      return;
    }
    try {
      await apiFetch(`/admin/orders/${detail.order.id}/reject`, {
        method: "POST",
        body: JSON.stringify({
          mode,
          reason: reasons[orderId] || undefined,
        }),
      });
      setDetailMessages((prev) => ({
        ...prev,
        [orderId]: "Pago rechazado.",
      }));
      await loadDetail(detail.order.id);
      await loadOrders();
    } catch (err) {
      setDetailErrors((prev) => ({
        ...prev,
        [orderId]: "No se pudo rechazar el pago.",
      }));
    }
  };

  const handleDownload = async (orderId) => {
    const detail = details[orderId];
    if (!detail || !detail.order) {
      return;
    }
    try {
      const result = await apiFetchBinary(
        `/admin/orders/${detail.order.id}/payment-proof/download`
      );
      const blob = new Blob([result.buffer], { type: result.contentType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `order_${detail.order.id}_payment_proof.jpg`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDetailErrors((prev) => ({
        ...prev,
        [orderId]: "No se pudo descargar la prueba.",
      }));
    }
  };

  return (
    <main className="page">
      <section className="card orders-card">
        <h1 className="icon-inline"><IconOrders className="panel-icon" /> Ordenes</h1>
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
        <div className="orders-list">
          <table className="orders-table">
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
                  <tr
                    key={order.id}
                    className={selectedOrderIds.includes(order.id) ? "orders-row-active" : ""}
                  >
                    <td>
                      {order.order_number
                        ? String(order.order_number).padStart(5, "0")
                        : "-"}
                    </td>
                <td>
                  <button
                    type="button"
                    className="orders-copy"
                    onClick={() =>
                      handleCopy("Telegram ID", order.telegram_id)
                    }
                  >
                    {order.telegram_id}
                  </button>
                </td>
                    <td>
                      {order.product_code
                        ? `${order.product_code} - ${cleanProductName(
                            order.product_name || order.product_id
                          )}`
                        : cleanProductName(
                            order.product_name || order.product_id
                          )}
                    </td>
                <td>{formatOrderStatus(order.status)}</td>
                <td>{new Date(order.created_at).toLocaleString()}</td>
                    <td>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => handleViewOrder(order.id)}
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
      {selectedOrderIds.length > 0 && (
        <div className="orders-detail-wrap">
          {selectedOrderIds.map((orderId) => {
            const detail = details[orderId];
            const isLoading = detailLoading[orderId];
            const errorMessage = detailErrors[orderId];
            const message = detailMessages[orderId];
            const proofUrl = proofUrls[orderId];
            const reason = reasons[orderId] || "";
            const isApproving = isSubmittingApprove[orderId];

            return (
              <section key={orderId} className="card orders-detail-card">
                {isLoading && <p>Cargando...</p>}
                {!isLoading && detail && detail.order && (
                  <>
                    <div className="orders-detail-header">
                      <h2>
                        Orden:{" "}
                        {detail.order.order_number
                          ? String(detail.order.order_number).padStart(5, "0")
                          : "-"}
                      </h2>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => handleViewOrder(detail.order.id)}
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
                        <p>Estado: {formatOrderStatus(detail.order.status)}</p>
                        <p>
                          Total USD: $
                          {formatUsdValue(
                            detail.totals?.subtotal_usd ??
                              detail.order.unit_price_at_purchase
                          )}
                        </p>
                        {detail.local_total && (
                          <p className="orders-detail-total-line">
                            <span>Total {detail.local_total.currency}:</span>
                            <span>
                              {formatLocalTotal(
                                detail.local_total.amount,
                                detail.local_total.currency
                              )}{" "}
                              {detail.local_total.currency}
                            </span>
                          </p>
                        )}
                        <p className="orders-detail-date-line">
                          <span>Creada:</span>
                          <span>
                            {new Date(detail.order.created_at).toLocaleString()}
                          </span>
                        </p>
                        {detail.order.paid_at && (
                          <p className="orders-detail-date-line">
                            <span>Pagada:</span>
                            <span>
                              {new Date(detail.order.paid_at).toLocaleString()}
                            </span>
                          </p>
                        )}
                      </div>
                      <div className="orders-detail-section">
                        <h3>Usuario</h3>
                        <p>
                          <span className="orders-copy-label">Telegram ID:</span>
                          <button
                            type="button"
                            className="orders-copy"
                            onClick={() =>
                              handleCopy(
                                "Telegram ID",
                                detail.user?.telegram_id
                              )
                            }
                          >
                            {detail.user?.telegram_id || "-"}
                          </button>
                        </p>
                        <p className="orders-username">
                          <span className="orders-copy-label">Username:</span>
                          <button
                            type="button"
                            className="orders-copy"
                            onClick={() =>
                              handleCopy(
                                "Username",
                                detail.user?.telegram_username
                              )
                            }
                          >
                            {formatUsername(detail.user?.telegram_username)}
                          </button>
                        </p>
                        <div className="orders-detail-subseparator"></div>
                        <div className="orders-detail-section">
                          <h3>Productos</h3>
                          {(detail.items || []).length > 0 ? (
                            <>
                              {detail.items.map((item) => {
                                const qty = Number(item.qty || 0);
                                const nameText =
                                  qty > 1
                                    ? `${cleanProductName(item.name)} x${qty}`
                                    : cleanProductName(item.name);
                                return (
                                  <p key={`${item.product_id}-${item.name}`}>
                                    {nameText}: ${formatUsdValue(item.line_total_usd)}
                                  </p>
                                );
                              })}
                              <p>
                                Total: $
                                {formatUsdValue(
                                  detail.totals?.subtotal_usd ??
                                    detail.order.unit_price_at_purchase
                                )}
                              </p>
                            </>
                          ) : (
                            <p>No hay productos registrados.</p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="orders-detail-separator"></div>
                    <div className="orders-detail-grid">
                      <div className="orders-detail-section">
                        <h3>Pago</h3>
                        {detail.payment ? (
                          <>
                            <p>
                              Método: {formatPaymentMethod(detail.payment.payment_method)}
                            </p>
                            <p>
                              Estado: {formatOrderStatus(detail.payment.review_status)}
                            </p>
                            <p className="orders-detail-date-line">
                              <span>Enviado:</span>
                              <span>
                                {new Date(
                                  detail.payment.submitted_at
                                ).toLocaleString()}
                              </span>
                            </p>
                          </>
                        ) : (
                          <p>No hay pago registrado.</p>
                        )}
                      </div>
                      <div className="orders-detail-section">
                        <h3>Captura</h3>
                        {detail.payment?.screenshot_file_id && proofUrl ? (
                          <div className="orders-proof">
                            <img
                              src={proofUrl}
                              alt="Captura de pago"
                              className="payment-proof"
                              onClick={() => setPreviewUrl(proofUrl)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  setPreviewUrl(proofUrl);
                                }
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handleDownload(detail.order.id)}
                            >
                              Descargar
                            </button>
                          </div>
                        ) : (
                          <p>No hay captura.</p>
                        )}
                      </div>
                    </div>
                    <div className="orders-detail-separator"></div>
                    <div className="orders-detail-grid">
                      <div className="orders-detail-section">
                        <h3>Comisión</h3>
                        {detail.commission ? (
                          <>
                            <p className="orders-inline-line">
                              <span className="orders-copy-label">Telegram ID:</span>
                              <button
                                type="button"
                                className="orders-copy"
                                onClick={() =>
                                  handleCopy(
                                    "Telegram ID",
                                    detail.commission.affiliate_telegram_id
                                  )
                                }
                              >
                                {detail.commission.affiliate_telegram_id || "-"}
                              </button>
                            </p>
                            <p className="orders-username">
                              <span className="orders-copy-label">Username:</span>
                              <button
                                type="button"
                                className="orders-copy"
                                onClick={() =>
                                  handleCopy(
                                    "Username",
                                    detail.commission.affiliate_username
                                  )
                                }
                              >
                                {formatUsername(detail.commission.affiliate_username)}
                              </button>
                            </p>
                            <p>
                              Monto: ${formatCommissionUsd(detail.commission.amount)} USD
                            </p>
                            <p>
                              Estado: {formatOrderStatus(detail.commission.status)}
                            </p>
                          </>
                        ) : (
                          <p>No aplica.</p>
                        )}
                      </div>
                      <div></div>
                    </div>
                    <div className="orders-detail-actions">
                      <div className="form">
                        <label>
                          <input
                            type="text"
                            value={reason}
                            onChange={(event) =>
                              setReasons((prev) => ({
                                ...prev,
                                [orderId]: event.target.value,
                              }))
                            }
                            placeholder="Motivo"
                          />
                        </label>
                      </div>
                      <div className="actions">
                        <button
                          type="button"
                          onClick={() => handleApprove(orderId)}
                          disabled={
                            !detail.payment?.screenshot_file_id ||
                            detail.order.status === "PAID" ||
                            detail.order.status === "DELIVERED" ||
                            isApproving
                          }
                        >
                          Aprobar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReject(orderId, "retry")}
                          disabled={!detail.payment?.screenshot_file_id}
                        >
                          Reintentar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReject(orderId, "cancel")}
                          disabled={!detail.payment?.screenshot_file_id}
                        >
                          Cancelar
                        </button>
                      </div>
                      {(() => {
                        const tone = getOrderTone(detail.order, detail.payment);
                        return (
                          <div className={`orders-detail-footer orders-detail-footer--${tone}`}>
                            <div className="orders-status-inline">
                              <span>
                                <span className={`orders-status-dot is-${tone}`}></span>
                                Pago aprobado
                              </span>
                              <span>
                                <span className={`orders-status-dot is-${tone}`}></span>
                                Stock consumido
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
                {!isLoading && !detail && errorMessage && (
                  <p className="error">{errorMessage}</p>
                )}
              </section>
            );
          })}
        </div>
      )}
      {previewUrl && (
        <div
          className="image-preview-overlay"
          role="button"
          tabIndex={0}
          onClick={() => setPreviewUrl("")}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setPreviewUrl("");
            }
          }}
        >
          <div className="image-preview-dialog">
            <img src={previewUrl} alt="Vista previa" />
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
