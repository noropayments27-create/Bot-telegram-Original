import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { ArrowLeft, ArrowRight } from "lucide-react";

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
  WAITING_PAYMENT: "PENDIENTE",
  PAID: "PAGADA",
  DELIVERED: "ENTREGADA",
  REFUNDED: "REEMBOLSADA",
  CANCELLED: "CANCELADA",
  EXPIRED: "EXPIRADA",
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
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function getOrderTone(order, payment) {
  const orderStatus = order?.status;
  const reviewStatus = payment?.review_status;
  if (orderStatus === "PAID" || orderStatus === "DELIVERED" || reviewStatus === "APPROVED") {
    return "success";
  }
  if (orderStatus === "CANCELLED" || orderStatus === "REFUNDED" || orderStatus === "EXPIRED" || reviewStatus === "REJECTED") {
    return "danger";
  }
  if (orderStatus === "WAITING_PAYMENT" || orderStatus === "CREATED" || reviewStatus === "PENDING" || reviewStatus === "SUBMITTED") {
    return "warning";
  }
  return "neutral";
}

const STATUS_OPTIONS = [
  { value: "RECENT", label: "Nuevas" },
  { value: "", label: "Todos" },
  { value: "CANCELLED", label: "Cancelado" },
  { value: "EXPIRED", label: "Expiradas" },
  { value: "DELIVERED", label: "Entregado" },
  { value: "REFUNDED", label: "Reembolsado" },
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
  const [receiptUrls, setReceiptUrls] = useState({});
  const [previewUrl, setPreviewUrl] = useState("");
  const [reasons, setReasons] = useState({});
  const [isSubmittingApprove, setIsSubmittingApprove] = useState({});
  const [isSubmittingRefund, setIsSubmittingRefund] = useState({});
  const [headerActionsOpenById, setHeaderActionsOpenById] = useState({});
  const [toast, setToast] = useState("");
  const [orderCounts, setOrderCounts] = useState({});
  const [isResponsiveView, setIsResponsiveView] = useState(false);

  const getOrderCount = (key) => Number(orderCounts[key] || 0);
  const totalNonExpired = Object.entries(orderCounts).reduce((sum, [key, value]) => {
    if (key === "EXPIRED") {
      return sum;
    }
    return sum + Number(value || 0);
  }, 0);
  const newOrdersCount = getOrderCount("WAITING_PAYMENT") + getOrderCount("CREATED");

  const filterRecent = (orders) => {
    return orders.filter((order) => {
      return order.status === "WAITING_PAYMENT" || order.status === "CREATED";
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

      const [data, countsRes] = await Promise.all([
        apiFetch(`/admin/orders?${params.toString()}`),
        apiFetch("/admin/orders/status-counts"),
      ]);
      const fetchedItems = data.items || [];
      const nextItems = isRecent ? filterRecent(fetchedItems) : fetchedItems;
      setItems(nextItems);
      setTotalPages(isRecent ? 1 : data.total_pages || 1);
      setError("");
      setOrderCounts(countsRes?.counts || {});
    } catch (err) {
      setError("No se pudo cargar las ordenes.");
    }
  }, [page, status]);

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 20 * 1000);
    return () => clearInterval(interval);
  }, [loadOrders, status]);

  useEffect(() => {
    const markOrdersSeen = async () => {
      try {
        const summary = await apiFetch("/admin/summary");
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(
            "admin_seen_orders_count",
            String(summary.new_orders || 0)
          );
        }
      } catch (err) {
        // ignore summary errors
      }
    };
    markOrdersSeen();
  }, []);

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
    setReceiptUrls((prev) => {
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
      if (
        data?.order?.status === "PAID"
        || data?.order?.status === "DELIVERED"
        || data?.payment?.review_status === "APPROVED"
      ) {
        try {
          const result = await apiFetchBinary(
            `/admin/orders/${orderId}/receipt`
          );
          const blob = new Blob([result.buffer], { type: result.contentType });
          const url = URL.createObjectURL(blob);
          setReceiptUrls((prev) => {
            if (prev[orderId]) {
              URL.revokeObjectURL(prev[orderId]);
            }
            return { ...prev, [orderId]: url };
          });
        } catch (err) {
          setReceiptUrls((prev) => ({ ...prev, [orderId]: "" }));
        }
      } else {
        setReceiptUrls((prev) => ({ ...prev, [orderId]: "" }));
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
      setReceiptUrls((prev) => ({ ...prev, [orderId]: "" }));
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
      Object.values(receiptUrls).forEach((url) => {
        if (url) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, [proofUrls, receiptUrls]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }
    const timer = setTimeout(() => setToast(""), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    const media = window.matchMedia("(max-width: 960px)");
    const apply = () => setIsResponsiveView(media.matches);
    apply();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", apply);
      return () => media.removeEventListener("change", apply);
    }
    media.addListener(apply);
    return () => media.removeListener(apply);
  }, []);

  const orderedDetailIds = isResponsiveView
    ? [...selectedOrderIds].reverse()
    : selectedOrderIds;

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
        let payload = null;
        try {
          payload = await response.json();
        } catch (err) {
          payload = null;
        }
        await loadDetail(detail.order.id);
        if (payload?.code === "INSUFFICIENT_STOCK") {
          setDetailMessages((prev) => ({
            ...prev,
            [orderId]: "Stock insuficiente para aprobar la orden.",
          }));
          return;
        }
        setDetailMessages((prev) => ({
          ...prev,
          [orderId]: "Este pedido ya fue procesado anteriormente",
        }));
        return;
      }
      if (!response.ok) {
        throw new Error("APPROVE_FAILED");
      }
      let payload = null;
      try {
        payload = await response.json();
      } catch (err) {
        payload = null;
      }
      let message = "Pago aprobado.";
      if (payload?.status === "delivery_retry") {
        message = payload.delivered
          ? "Entrega reenviada."
          : "Pago ya aprobado. No se pudo reenviar la entrega.";
      }
      setDetailMessages((prev) => ({
        ...prev,
        [orderId]: message,
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

  const handleRefund = async (orderId) => {
    const detail = details[orderId];
    if (!detail || !detail.order || isSubmittingRefund[orderId]) {
      return;
    }
    const order = detail.order;
    if (order.status !== "PAID" && order.status !== "DELIVERED") {
      setDetailErrors((prev) => ({
        ...prev,
        [orderId]: "Solo puedes reembolsar ordenes pagadas o entregadas.",
      }));
      return;
    }
    const totalUsd = Number(
      detail.totals?.subtotal_usd
      ?? detail.totals?.total_usd
      ?? order.unit_price_at_purchase
      ?? 0
    );
    const alreadyRefunded = Number(order.refunded_amount || 0);
    const remaining = Math.max(totalUsd - alreadyRefunded, 0);
    const amountInput = window.prompt(
      `Monto a reembolsar en USD (max ${remaining.toFixed(2)}). Deja vacío para total:`,
      ""
    );
    if (amountInput === null) {
      return;
    }
    const reasonInput = window.prompt("Motivo del reembolso (opcional):", "");
    if (reasonInput === null) {
      return;
    }
    const payload = {};
    if (amountInput.trim() !== "") {
      const parsed = Number(amountInput);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setDetailErrors((prev) => ({
          ...prev,
          [orderId]: "Monto de reembolso inválido.",
        }));
        return;
      }
      payload.amount = parsed;
    }
    if (reasonInput.trim()) {
      payload.reason = reasonInput.trim();
    }
    setIsSubmittingRefund((prev) => ({ ...prev, [orderId]: true }));
    setDetailErrors((prev) => ({ ...prev, [orderId]: "" }));
    try {
      await apiFetch(`/admin/orders/${order.id}/refund`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setDetailMessages((prev) => ({
        ...prev,
        [orderId]: "Reembolso procesado.",
      }));
      await loadDetail(order.id);
      await loadOrders();
    } catch (err) {
      setDetailErrors((prev) => ({
        ...prev,
        [orderId]: "No se pudo procesar el reembolso.",
      }));
    } finally {
      setIsSubmittingRefund((prev) => ({ ...prev, [orderId]: false }));
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

  const handleReceiptDownload = async (orderId) => {
    try {
      const result = await apiFetchBinary(`/admin/orders/${orderId}/receipt/download`);
      const blob = new Blob([result.buffer], { type: result.contentType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `recibo-${orderId}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setToast("No se pudo descargar el recibo.");
    }
  };

  const handleToggleBan = async (orderId) => {
    const detail = details[orderId];
    const telegramId = detail?.user?.telegram_id;
    if (!telegramId) {
      return;
    }
    try {
      const result = await apiFetch(`/admin/users/${telegramId}/ban-toggle`, {
        method: "POST",
      });
      setDetails((prev) => ({
        ...prev,
        [orderId]: {
          ...detail,
          user: {
            ...detail.user,
            banned: Boolean(result.banned),
          },
        },
      }));
      setToast(result.banned ? "Usuario baneado" : "Usuario desbaneado");
    } catch (err) {
      setToast("No se pudo actualizar el baneo");
    }
  };

  const toggleHeaderActions = (orderId) => {
    setHeaderActionsOpenById((prev) => ({
      ...prev,
      [orderId]: !prev[orderId],
    }));
  };

  return (
    <main className="page orders-page">
      <section className="card orders-card">
        <div className="orders-header-row">
          <h1 className="icon-inline"><IconOrders className="panel-icon" /> Ordenes</h1>
          {status !== "RECENT" && (
            <div className="orders-status-counts">
              <span className="orders-count-label">Total:</span>
              <span className="orders-count-value">
                {status === ""
                  ? totalNonExpired
                  : status === "CANCELLED"
                  ? getOrderCount("CANCELLED")
                  : status === "EXPIRED"
                  ? getOrderCount("EXPIRED")
                  : status === "DELIVERED"
                  ? getOrderCount("DELIVERED")
                  : status === "REFUNDED"
                  ? getOrderCount("REFUNDED")
                  : 0}
              </span>
            </div>
          )}
        </div>
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
                <th align="left">Username</th>
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
                    <td>@usuario</td>
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
                    <td>@usuario</td>
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
                      {order.status === "EXPIRED"
                        ? "-"
                        : order.order_number
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
                      <button
                        type="button"
                        className="orders-copy"
                        onClick={() =>
                          handleCopy("Username", order.telegram_username)
                        }
                      >
                        {formatUsername(order.telegram_username)}
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
      </section>
      {selectedOrderIds.length > 0 && (
        <div className="orders-detail-wrap">
          {orderedDetailIds.map((orderId) => {
            const detail = details[orderId];
            const isLoading = detailLoading[orderId];
            const errorMessage = detailErrors[orderId];
            const message = detailMessages[orderId];
            const proofUrl = proofUrls[orderId];
            const receiptUrl = receiptUrls[orderId];
            const reason = reasons[orderId] || "";
            const isApproving = isSubmittingApprove[orderId];
            const isApproved =
              detail?.order?.status === "PAID"
              || detail?.order?.status === "DELIVERED"
              || detail?.payment?.review_status === "APPROVED";
            const isHeaderActionsOpen = Boolean(headerActionsOpenById[orderId]);

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
                      <div
                        className={`orders-detail-header-actions${
                          isHeaderActionsOpen ? " is-open" : ""
                        }`}
                      >
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => handleViewOrder(detail.order.id)}
                        >
                          Cerrar
                        </button>
                        <button
                          type="button"
                          className="plain-button orders-header-toggle"
                          onClick={() => toggleHeaderActions(orderId)}
                          title={isHeaderActionsOpen ? "Ocultar acciones" : "Mostrar acciones"}
                        >
                          {isHeaderActionsOpen ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}
                        </button>
                        {isHeaderActionsOpen && (
                          <>
                            <button
                              type="button"
                              className="orders-refund-button"
                              onClick={() => handleRefund(orderId)}
                              disabled={
                                isSubmittingRefund[orderId]
                                || detail.order.status === "REFUNDED"
                              }
                            >
                              {detail.order.status === "REFUNDED"
                                ? "Reembolsada"
                                : isSubmittingRefund[orderId]
                                ? "Reembolsando..."
                                : "Reembolsar"}
                            </button>
                            <button
                              type="button"
                              className="orders-ban-button"
                              onClick={() => handleToggleBan(orderId)}
                            >
                              {detail.user?.banned ? "Desbanear" : "Banear"}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="orders-detail-separator"></div>
                    {message && <p className="muted">{message}</p>}
                    {errorMessage && <p className="error">{errorMessage}</p>}
                    <div className="orders-detail-grid orders-detail-grid--summary">
                      <div className="orders-detail-section orders-detail-section--summary">
                        <h3>Detalle</h3>
                        <p>Estado: {formatOrderStatus(detail.order.status)}</p>
                        <p>
                          Subtotal USD: $
                          {formatUsdValue(
                            detail.totals?.subtotal_usd ??
                              detail.order.unit_price_at_purchase
                          )}
                        </p>
                        {detail.totals?.markup_percent !== null
                          && detail.totals?.markup_percent !== undefined && (
                          <p>Markup aplicado: {detail.totals.markup_percent}%</p>
                        )}
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
                      <div className="orders-detail-section orders-detail-section--user-products">
                        <h3>Usuario</h3>
                        <p className="orders-user-telegram">
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
                        <div className="orders-detail-section orders-detail-products">
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
                                Subtotal: $
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
                    <div className="orders-detail-grid orders-detail-grid--payment-capture">
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
                          <div
                            className={`orders-proof${receiptUrl ? " orders-proof--side orders-proof--pair" : ""}`}
                          >
                            <div>
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
                            {receiptUrl && (
                              <div>
                                <img
                                  src={receiptUrl}
                                  alt="Recibo"
                                  className="payment-proof"
                                  onClick={() => setPreviewUrl(receiptUrl)}
                                  role="button"
                                  tabIndex={0}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                      setPreviewUrl(receiptUrl);
                                    }
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleReceiptDownload(detail.order.id)}
                                >
                                  Descargar
                                </button>
                              </div>
                            )}
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
                            <p className="orders-inline-line">
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
                          {isApproving && (
                            <span className="button-spinner" aria-hidden="true" />
                          )}
                          {isApproving ? "Aprobando..." : "Aprobar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReject(orderId, "retry")}
                          disabled={!detail.payment?.screenshot_file_id || isApproved}
                        >
                          Reintentar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReject(orderId, "cancel")}
                          disabled={!detail.payment?.screenshot_file_id || isApproved}
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
