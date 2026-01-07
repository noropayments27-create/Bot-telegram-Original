import { useEffect, useState } from "react";
import { useRouter } from "next/router";

import { apiFetch, getAuthToken } from "../../lib/api";

export default function PayoutDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [detail, setDetail] = useState(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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
      const data = await apiFetch(`/admin/payouts/${id}`);
      setDetail(data);
      setMessage("");
      setError("");
    } catch (err) {
      setError("No se pudo cargar el payout.");
    }
  };

  useEffect(() => {
    loadDetail();
  }, [id]);

  const handleMarkSent = async () => {
    try {
      await apiFetch(`/admin/payouts/${id}/mark-sent`, { method: "POST" });
      setMessage("Payout marcado como enviado.");
      await loadDetail();
    } catch (err) {
      setError("No se pudo marcar como enviado.");
    }
  };

  const handleCancel = async () => {
    try {
      await apiFetch(`/admin/payouts/${id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: reason || undefined }),
      });
      setMessage("Payout cancelado.");
      await loadDetail();
    } catch (err) {
      setError("No se pudo cancelar el payout.");
    }
  };

  if (!detail) {
    return (
      <main className="page">
        <section className="card">
          <p>Cargando...</p>
        </section>
      </main>
    );
  }

  const { payout, affiliate, user, available_balance } = detail;
  const isSent = payout.status === "SENT";
  const isCancelled = payout.status === "CANCELLED";

  return (
    <main className="page">
      <section className="card">
        <h1>Payout {payout.id}</h1>
        {message && <p className="muted">{message}</p>}
        {error && <p className="error">{error}</p>}

        <h3>Detalle</h3>
        <p>Status: {payout.status}</p>
        <p>Amount: {payout.amount}</p>
        <p>Method: {payout.method}</p>
        <p>Destination: {payout.destination}</p>
        <p>Created: {new Date(payout.created_at).toLocaleString()}</p>
        {payout.sent_at && <p>Sent: {new Date(payout.sent_at).toLocaleString()}</p>}

        <h3>Afiliado</h3>
        <p>ID: {affiliate.id}</p>
        <p>Status: {affiliate.status}</p>
        <p>Rate: {affiliate.commission_rate}</p>
        <p>Balance disponible: {available_balance}</p>

        <h3>Usuario</h3>
        <p>Telegram ID: {user.telegram_id}</p>
        <p>Username: {user.telegram_username || "-"}</p>

        <h3>Acciones</h3>
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
          <button type="button" onClick={handleMarkSent} disabled={isSent || isCancelled}>
            Marcar como ENVIADO
          </button>
          <button type="button" onClick={handleCancel} disabled={isSent || isCancelled}>
            Cancelar
          </button>
        </div>
      </section>
    </main>
  );
}
