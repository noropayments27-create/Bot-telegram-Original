import { useEffect, useState } from "react";
import { useRouter } from "next/router";

import { apiFetch, getAuthToken } from "../../lib/api";
import { IconTickets } from "../../components/PanelIcons";

export default function TicketDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [detail, setDetail] = useState(null);
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
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
      const data = await apiFetch(`/admin/tickets/${id}`);
      setDetail(data);
      setError("");
    } catch (err) {
      setError("No se pudo cargar el ticket.");
    }
  };

  useEffect(() => {
    loadDetail();
  }, [id]);

  useEffect(() => {
    const markTicketsSeen = async () => {
      if (!id) {
        return;
      }
      try {
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(
            "admin_seen_tickets_at",
            String(Date.now())
          );
        }
      } catch (err) {
        // ignore summary errors
      }
    };
    markTicketsSeen();
  }, [id]);

  const handleReply = async () => {
    if (!reply.trim()) {
      return;
    }
    try {
      await apiFetch(`/admin/tickets/${id}/reply`, {
        method: "POST",
        body: JSON.stringify({ message: reply.trim() }),
      });
      setMessage("Respuesta enviada.");
      setReply("");
      await loadDetail();
    } catch (err) {
      setError("No se pudo enviar la respuesta.");
    }
  };

  const handleClose = async () => {
    try {
      await apiFetch(`/admin/tickets/${id}/close`, { method: "POST" });
      setMessage("Ticket cerrado.");
      await loadDetail();
    } catch (err) {
      setError("No se pudo cerrar el ticket.");
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

  const { ticket, user, messages } = detail;

  return (
    <main className="page">
      <section className="card">
        <h1 className="icon-inline"><IconTickets className="panel-icon" /> Ticket {ticket.id}</h1>
        {message && <p className="muted">{message}</p>}
        {error && <p className="error">{error}</p>}

        <p>Estado: {ticket.status}</p>
        <p>Usuario: {user.telegram_id}</p>
        <p>Username: {user.telegram_username || "-"}</p>

        <div style={{ marginTop: "16px" }}>
          {messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                textAlign: msg.sender === "ADMIN" ? "right" : "left",
                marginBottom: "12px",
              }}
            >
              <div
                style={{
                  display: "inline-block",
                  background: msg.sender === "ADMIN" ? "#f3b842" : "#f7f7f7",
                  padding: "8px 12px",
                  borderRadius: "8px",
                }}
              >
                <strong>{msg.sender}</strong>
                <div>{msg.message_text}</div>
                <small>{new Date(msg.created_at).toLocaleString()}</small>
              </div>
            </div>
          ))}
        </div>

        <div className="form" style={{ marginTop: "16px" }}>
          <label>
            Respuesta
            <input
              type="text"
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              placeholder="Escribe tu respuesta"
            />
          </label>
        </div>

        <div className="actions">
          <button type="button" onClick={handleReply}>
            Enviar
          </button>
          <button type="button" onClick={handleClose}>
            Cerrar ticket
          </button>
        </div>
      </section>
    </main>
  );
}
