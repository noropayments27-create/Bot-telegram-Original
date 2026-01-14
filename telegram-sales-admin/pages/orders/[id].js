import { useEffect, useState } from "react";
import { useRouter } from "next/router";

import {
  apiFetch,
  apiFetchBinary,
  clearAuthToken,
  getApiBaseUrl,
  getAuthToken,
} from "../../lib/api";

function cleanProductName(name) {
  if (!name) {
    return "";
  }
  return String(name).replace(/^shop\s*\d+\s*-\s*/i, "").trim();
}

export default function OrderDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [detail, setDetail] = useState(null);
  const [proofUrl, setProofUrl] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmittingApprove, setIsSubmittingApprove] = useState(false);

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/login");
    }
  }, [router]);

  const loadDetail = async () => {
    if (!id) {
      return;
    }
    try {
      const data = await apiFetch(`/admin/orders/${id}`);
      setDetail(data);
      setError("");
      setMessage("");
    } catch (err) {
      setError("No se pudo cargar la orden.");
    }
  };

  useEffect(() => {
    loadDetail();
  }, [id]);

  useEffect(() => {
    const loadProof = async () => {
      if (!id) {
        return;
      }
      try {
        const result = await apiFetchBinary(`/admin/orders/${id}/payment-proof`);
        const blob = new Blob([result.buffer], { type: result.contentType });
        const url = URL.createObjectURL(blob);
        setProofUrl(url);
      } catch (err) {
        setProofUrl("");
      }
    };

    loadProof();
    return () => {
      if (proofUrl) {
        URL.revokeObjectURL(proofUrl);
      }
    };
  }, [id]);

  const handleApprove = async () => {
    if (isSubmittingApprove) {
      return;
    }
    setIsSubmittingApprove(true);
    setError("");
    try {
      const baseUrl = getApiBaseUrl();
      const token = getAuthToken();
      const response = await fetch(`${baseUrl}/admin/orders/${id}/mark-paid`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (response.status === 401) {
        clearAuthToken();
        router.replace("/login");
        return;
      }
      if (response.status === 409) {
        await loadDetail();
        setMessage("Este pedido ya fue procesado anteriormente");
        return;
      }
      if (!response.ok) {
        throw new Error("APPROVE_FAILED");
      }
      setMessage("Pago aprobado.");
      await loadDetail();
    } catch (err) {
      setError("No se pudo aprobar el pago.");
    } finally {
      setIsSubmittingApprove(false);
    }
  };

  const handleReject = async (mode) => {
    try {
      await apiFetch(`/admin/orders/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ mode, reason: reason || undefined }),
      });
      setMessage("Pago rechazado.");
      await loadDetail();
    } catch (err) {
      setError("No se pudo rechazar el pago.");
    }
  };

  const handleDownload = async () => {
    try {
      const result = await apiFetchBinary(
        `/admin/orders/${id}/payment-proof/download`
      );
      const blob = new Blob([result.buffer], { type: result.contentType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `order_${id}_payment_proof.jpg`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError("No se pudo descargar la prueba.");
    }
  };

  if (!detail || !detail.order) {
    return (
      <main className="page">
        <section className="card">
          <p>Cargando...</p>
        </section>
      </main>
    );
  }

  const { order, user, payment, commission } = detail;
  const totals = detail.totals || {};
  const subtotalUsd =
    totals.subtotal_usd !== undefined && totals.subtotal_usd !== null
      ? totals.subtotal_usd
      : order.unit_price_at_purchase;
  const localTotal = detail.local_total;

  const formatLocalTotal = (value, currency) => {
    if (!currency) {
      return value;
    }
    if (currency === "BTC" || currency === "LTC") {
      return Number(value).toFixed(8);
    }
    if (currency === "USDT") {
      return Number(value).toFixed(2);
    }
    return Number(value).toLocaleString();
  };
  const hasProof = Boolean(payment && payment.screenshot_file_id);
  const isAlreadyProcessed = order.status === "PAID" || order.status === "DELIVERED";
  const orderNumberText = order.order_number
    ? String(order.order_number).padStart(5, "0")
    : "-";
  const items = detail.items || [];

  return (
    <main className="page order-detail-page">
      <section className="card order-detail">
        <h1>Orden {orderNumberText}</h1>
        {message && <p className="muted">{message}</p>}
        {error && <p className="error">{error}</p>}

        <div className="detail-section">
          <h3>Detalle</h3>
          <p>Estado: {order.status}</p>
          <p>Precio (USD): {subtotalUsd}</p>
          {localTotal && (
            <p>
              Total {localTotal.currency}:{" "}
              {formatLocalTotal(localTotal.amount, localTotal.currency)}{" "}
              {localTotal.currency}
            </p>
          )}
          <p>Creada: {new Date(order.created_at).toLocaleString()}</p>
          {order.paid_at && <p>Pagada: {new Date(order.paid_at).toLocaleString()}</p>}
        </div>

        <div className="detail-section">
          <h3>Usuario</h3>
          <p>Telegram ID: {user.telegram_id}</p>
          <p>Username: {user.telegram_username || "-"}</p>
        </div>

        <div className="detail-section">
          <h3>Productos</h3>
        {items.length > 0 ? (
          <>
            {items.map((item) => {
              const qty = Number(item.qty || 0);
              const displayName = cleanProductName(item.name);
              const nameText =
                qty > 1 ? `${displayName} x${qty}` : displayName;
              return (
                <p key={`${item.product_id}-${item.name}`}>
                  {nameText}: ${item.line_total_usd}
                </p>
              );
            })}
            <p>Total: ${subtotalUsd}</p>
          </>
        ) : (
          <p>No hay productos registrados.</p>
        )}
        </div>

        <div className="detail-section">
        <h3>Pago</h3>
        {payment ? (
          <>
            <p>Método: {payment.payment_method || "No especificado"}</p>
            <p>ID de archivo: {payment.screenshot_file_id}</p>
            <p>Estado de revisión: {payment.review_status}</p>
            <p>Enviado: {new Date(payment.submitted_at).toLocaleString()}</p>
          </>
        ) : (
          <p>No hay pago registrado.</p>
        )}
        </div>

        <div className="detail-section">
        <h3>Comisión</h3>
        {commission ? (
          <>
            <p>ID: {commission.id}</p>
            <p>Monto: {commission.amount}</p>
            <p>Estado: {commission.status}</p>
          </>
        ) : (
          <p>No aplica.</p>
        )}
        </div>

        <div className="detail-section">
        <h3>Captura</h3>
        {hasProof && proofUrl ? (
          <>
            <img
              src={proofUrl}
              alt="Captura de pago"
              className="payment-proof"
            />
            <button type="button" onClick={handleDownload}>
              Descargar
            </button>
          </>
        ) : (
          <p>No hay captura.</p>
        )}
        </div>

        <div className="detail-section">
        <h3>Acciones</h3>
        {isAlreadyProcessed && (
          <div className="muted">
            <p>Pago aprobado</p>
            <p>Stock consumido</p>
            <p>Entrega realizada</p>
          </div>
        )}
        <div className="form">
          <label>
            Motivo (opcional)
            <input
              type="text"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Motivo"
            />
          </label>
        </div>
        <div className="actions">
          <button
            type="button"
            onClick={handleApprove}
            disabled={!hasProof || isAlreadyProcessed || isSubmittingApprove}
          >
            Aprobar pago
          </button>
          <button type="button" onClick={() => handleReject("retry")} disabled={!hasProof}>
            Rechazar (reintentar)
          </button>
          <button type="button" onClick={() => handleReject("cancel")} disabled={!hasProof}>
            Rechazar (cancelar)
          </button>
        </div>
        </div>
      </section>
    </main>
  );
}
