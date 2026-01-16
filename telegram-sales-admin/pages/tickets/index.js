import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";

import { apiFetch, getAuthToken } from "../../lib/api";
import { IconTickets } from "../../components/PanelIcons";

const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "OPEN", label: "ABIERTO" },
  { value: "CLOSED", label: "CERRADO" },
];

export default function TicketsPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState("");
  const [selectedTicketIds, setSelectedTicketIds] = useState([]);
  const [details, setDetails] = useState({});
  const [detailLoading, setDetailLoading] = useState({});
  const [detailErrors, setDetailErrors] = useState({});
  const [detailMessages, setDetailMessages] = useState({});
  const [replyById, setReplyById] = useState({});

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    const loadTickets = async () => {
      try {
        const params = new URLSearchParams({
          page: String(page),
          page_size: "20",
        });
        if (status) {
          params.set("status", status);
        }

        const data = await apiFetch(`/admin/tickets?${params.toString()}`);
        setItems(data.items || []);
        setTotalPages(data.total_pages || 1);
        setError("");
      } catch (err) {
        setError("No se pudo cargar tickets.");
      }
    };

    loadTickets();
  }, [page, status]);

  useEffect(() => {
    const markTicketsSeen = async () => {
      try {
        const summary = await apiFetch("/admin/summary");
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(
            "admin_seen_tickets_count",
            String(summary.unread_tickets || 0)
          );
        }
      } catch (err) {
        // ignore summary errors
      }
    };
    markTicketsSeen();
  }, []);

  const handleStatusChange = (event) => {
    setStatus(event.target.value);
    setPage(1);
  };

  const removeDetail = useCallback((ticketId) => {
    setDetails((prev) => {
      const next = { ...prev };
      delete next[ticketId];
      return next;
    });
    setDetailErrors((prev) => {
      const next = { ...prev };
      delete next[ticketId];
      return next;
    });
    setDetailMessages((prev) => {
      const next = { ...prev };
      delete next[ticketId];
      return next;
    });
    setReplyById((prev) => {
      const next = { ...prev };
      delete next[ticketId];
      return next;
    });
  }, []);

  const loadDetail = useCallback(async (ticketId) => {
    if (!ticketId) {
      return;
    }
    setDetailLoading((prev) => ({ ...prev, [ticketId]: true }));
    setDetailErrors((prev) => ({ ...prev, [ticketId]: "" }));
    try {
      const data = await apiFetch(`/admin/tickets/${ticketId}`);
      setDetails((prev) => ({ ...prev, [ticketId]: data }));
    } catch (err) {
      setDetailErrors((prev) => ({
        ...prev,
        [ticketId]: "No se pudo cargar el ticket.",
      }));
    } finally {
      setDetailLoading((prev) => ({ ...prev, [ticketId]: false }));
    }
  }, []);

  const handleViewTicket = async (ticketId) => {
    if (!ticketId) {
      return;
    }
    setSelectedTicketIds((prev) => {
      if (prev.includes(ticketId)) {
        removeDetail(ticketId);
        return prev.filter((id) => id !== ticketId);
      }
      const next = [ticketId, ...prev.filter((id) => id !== ticketId)];
      if (next.length > 3) {
        const removed = next.pop();
        if (removed) {
          removeDetail(removed);
        }
      }
      return next;
    });
    await loadDetail(ticketId);
  };

  useEffect(() => {
    selectedTicketIds.forEach((ticketId) => {
      if (!details[ticketId] && !detailLoading[ticketId]) {
        loadDetail(ticketId);
      }
    });
  }, [detailLoading, details, loadDetail, selectedTicketIds]);

  const handleReply = async (ticketId) => {
    const message = (replyById[ticketId] || "").trim();
    if (!message) {
      return;
    }
    try {
      await apiFetch(`/admin/tickets/${ticketId}/reply`, {
        method: "POST",
        body: JSON.stringify({ message }),
      });
      setDetailMessages((prev) => ({
        ...prev,
        [ticketId]: "Respuesta enviada.",
      }));
      setReplyById((prev) => ({ ...prev, [ticketId]: "" }));
      await loadDetail(ticketId);
    } catch (err) {
      setDetailErrors((prev) => ({
        ...prev,
        [ticketId]: "No se pudo enviar la respuesta.",
      }));
    }
  };

  const handleClose = async (ticketId) => {
    try {
      await apiFetch(`/admin/tickets/${ticketId}/close`, { method: "POST" });
      setDetailMessages((prev) => ({
        ...prev,
        [ticketId]: "Ticket cerrado.",
      }));
      await loadDetail(ticketId);
    } catch (err) {
      setDetailErrors((prev) => ({
        ...prev,
        [ticketId]: "No se pudo cerrar el ticket.",
      }));
    }
  };

  return (
    <main className="page">
      <section className="card orders-card">
        <h1 className="icon-inline"><IconTickets className="panel-icon" /> Tickets</h1>
        {error && <p className="error">{error}</p>}
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
        <div className="orders-list">
          <table className="orders-table">
            <thead>
              <tr>
                <th align="left">Ticket</th>
                <th align="left">Estado</th>
                <th align="left">Telegram</th>
                <th align="left">Último mensaje</th>
                <th align="left">Admin respondió</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((ticket) => (
                <tr
                  key={ticket.id}
                  className={selectedTicketIds.includes(ticket.id) ? "orders-row-active" : ""}
                >
                  <td>{ticket.id}</td>
                  <td>{ticket.status}</td>
                  <td>{ticket.telegram_id}</td>
                  <td>{ticket.last_message_preview || "-"}</td>
                  <td>{ticket.has_admin_reply ? "Si" : "No"}</td>
                  <td>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => handleViewTicket(ticket.id)}
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
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
      {selectedTicketIds.length > 0 && (
        <div className="orders-detail-wrap">
          {selectedTicketIds.map((ticketId) => {
            const detail = details[ticketId];
            const isLoading = detailLoading[ticketId];
            const errorMessage = detailErrors[ticketId];
            const message = detailMessages[ticketId];
            const replyValue = replyById[ticketId] || "";

            return (
              <section key={ticketId} className="card orders-detail-card">
                {isLoading && <p>Cargando...</p>}
                {!isLoading && detail && detail.ticket && (
                  <>
                    <div className="orders-detail-header">
                      <h2>Ticket #{detail.ticket.id}</h2>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => handleViewTicket(detail.ticket.id)}
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
                        <p>Estado: {detail.ticket.status}</p>
                        <p>
                          Creado:{" "}
                          {detail.ticket.created_at
                            ? new Date(detail.ticket.created_at).toLocaleString()
                            : "-"}
                        </p>
                        <p>
                          Último mensaje:{" "}
                          {detail.ticket.last_message_at
                            ? new Date(detail.ticket.last_message_at).toLocaleString()
                            : "-"}
                        </p>
                        <p>
                          Admin respondió:{" "}
                          {detail.ticket.has_admin_reply ? "Si" : "No"}
                        </p>
                      </div>
                      <div className="orders-detail-section">
                        <h3>Usuario</h3>
                        <p>Telegram ID: {detail.user?.telegram_id || "-"}</p>
                        <p>Username: {detail.user?.telegram_username || "-"}</p>
                      </div>
                    </div>
                    <div className="orders-detail-separator"></div>
                    <div className="orders-detail-section">
                      <h3>Conversación</h3>
                      <div className="ticket-thread">
                        {(detail.messages || []).length === 0 && (
                          <p className="muted">Sin mensajes.</p>
                        )}
                        {(detail.messages || []).map((msg) => (
                          <div
                            key={msg.id}
                            className={`ticket-message ${msg.sender === "ADMIN" ? "ticket-message--admin" : ""}`}
                          >
                            <div className="ticket-bubble">
                              <strong>{msg.sender}</strong>
                              <div>{msg.message_text}</div>
                            </div>
                            <span className="ticket-meta">
                              {new Date(msg.created_at).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="orders-detail-actions">
                      <div className="form">
                        <label>
                          Respuesta
                          <input
                            type="text"
                            value={replyValue}
                            onChange={(event) =>
                              setReplyById((prev) => ({
                                ...prev,
                                [ticketId]: event.target.value,
                              }))
                            }
                            placeholder="Escribe tu respuesta"
                          />
                        </label>
                      </div>
                      <div className="actions">
                        <button
                          type="button"
                          onClick={() => handleReply(ticketId)}
                          disabled={!replyValue.trim()}
                        >
                          Enviar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleClose(ticketId)}
                          disabled={detail.ticket.status === "CLOSED"}
                        >
                          Cerrar ticket
                        </button>
                      </div>
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
    </main>
  );
}
