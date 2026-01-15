import { useEffect, useState } from "react";
import { useRouter } from "next/router";

import { apiFetch, getAuthToken } from "../../lib/api";
import { IconBroadcasts } from "../../components/PanelIcons";

export default function BroadcastDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const [broadcast, setBroadcast] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    if (!id) {
      return;
    }

    const loadBroadcast = async () => {
      try {
        const data = await apiFetch(`/admin/broadcasts/${id}`);
        setBroadcast(data.broadcast || null);
        setError("");
      } catch (err) {
        setError("No se pudo cargar el broadcast.");
      }
    };

    loadBroadcast();
  }, [id]);

  const handleSend = async () => {
    if (!broadcast || sending) {
      return;
    }

    const confirmed = window.confirm("Enviar este broadcast ahora?");
    if (!confirmed) {
      return;
    }

    setSending(true);
    setError("");

    try {
      const payload = {};
      if (broadcast.segment === "CUSTOM" && Array.isArray(broadcast.custom_telegram_ids)) {
        payload.telegram_ids = broadcast.custom_telegram_ids;
      }

      const data = await apiFetch(`/admin/broadcasts/${broadcast.id}/send`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setBroadcast(data.broadcast || broadcast);
      setResult(data.result || null);
    } catch (err) {
      setError("No se pudo enviar el broadcast.");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="page">
      <section className="card" style={{ width: "min(800px, 100%)" }}>
        <h1 className="icon-inline"><IconBroadcasts className="panel-icon" /> Detalle de Difusión</h1>
        {error && <p className="error">{error}</p>}
        {!broadcast && !error && <p className="muted">Cargando...</p>}
        {broadcast && (
          <div className="form">
            <label>
              ID
              <input value={broadcast.id} readOnly />
            </label>
            <label>
              Estado
              <input value={broadcast.status} readOnly />
            </label>
            <label>
              Segmento
              <input value={broadcast.segment} readOnly />
            </label>
            <label>
              Mensaje
              <textarea value={broadcast.message_text} readOnly />
            </label>
            <label>
              Creado
              <input
                value={
                  broadcast.created_at ? new Date(broadcast.created_at).toLocaleString() : "-"
                }
                readOnly
              />
            </label>
            <label>
              Enviado
              <input
                value={broadcast.sent_at ? new Date(broadcast.sent_at).toLocaleString() : "-"}
                readOnly
              />
            </label>
            {broadcast.segment === "CUSTOM" && (
              <label>
                Destinatarios
                <textarea
                  value={(broadcast.custom_telegram_ids || []).join(", ")}
                  readOnly
                />
              </label>
            )}
            {result && (
              <label>
                Resultado
                <textarea
                  value={`Objetivo: ${result.target_count}\nEnviados: ${result.sent_count}\nFallidos: ${result.failed_count}`}
                  readOnly
                />
              </label>
            )}
            <div className="actions">
              <button type="button" onClick={handleSend} disabled={sending}>
                {sending ? "Enviando..." : "Enviar"}
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
