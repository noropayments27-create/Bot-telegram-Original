import { useEffect, useState } from "react";
import { useRouter } from "next/router";

import { apiFetch, getAuthToken } from "../../lib/api";
import {
  IconPayouts,
  IconAffiliates,
} from "../../components/PanelIcons";

export default function PayoutDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [detail, setDetail] = useState(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const formatMethod = (method) => {
    if (method === "USDT_BSC") {
      return "USDT";
    }
    if (method === "BINANCE_ID") {
      return "ID de Binance";
    }
    return method || "-";
  };

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
        <h1 className="icon-inline"><IconPayouts className="panel-icon" /> Pago {payout.id}</h1>
        {message && <p className="muted">{message}</p>}
        {error && <p className="error">{error}</p>}

        <h3 className="icon-inline"><IconPayouts className="panel-icon" /> Detalle</h3>
        <p>Estado: {payout.status}</p>
        <p>Monto: {payout.amount}</p>
        <p>Método: {formatMethod(payout.method)}</p>
        <p>Destino: {payout.destination}</p>
        <p>Creado: {new Date(payout.created_at).toLocaleString()}</p>
        {payout.sent_at && <p>Enviado: {new Date(payout.sent_at).toLocaleString()}</p>}

        <h3 className="icon-inline"><IconAffiliates className="panel-icon" /> Afiliado</h3>
        <p>ID: {affiliate.id}</p>
        <p>Estado: {affiliate.status}</p>
        <p>Tasa: {affiliate.commission_rate}</p>
        <p>Balance disponible: {available_balance}</p>

        <h3 className="icon-inline"><IconAffiliates className="panel-icon" /> Usuario</h3>
        <p>Telegram ID: {user.telegram_id}</p>
        <p>Username: {user.telegram_username || "-"}</p>

        <h3 className="icon-inline"><IconPayouts className="panel-icon" /> Acciones</h3>
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
