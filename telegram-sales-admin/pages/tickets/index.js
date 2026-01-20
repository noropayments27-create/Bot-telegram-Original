import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

import { apiFetch, apiFetchBinary, getAuthToken } from "../../lib/api";
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
  const [error, setError] = useState("");
  const [selectedTicketIds, setSelectedTicketIds] = useState([]);
  const [details, setDetails] = useState({});
  const [detailLoading, setDetailLoading] = useState({});
  const [detailErrors, setDetailErrors] = useState({});
  const [detailMessages, setDetailMessages] = useState({});
  const [replyById, setReplyById] = useState({});
  const [replyImageById, setReplyImageById] = useState({});
  const [replyImageNameById, setReplyImageNameById] = useState({});
  const [imageByMessageId, setImageByMessageId] = useState({});
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    const loadTickets = async () => {
      try {
        const params = new URLSearchParams({
          page: "1",
          page_size: "500",
        });
        if (status) {
          params.set("status", status);
        }

        const data = await apiFetch(`/admin/tickets?${params.toString()}`);
        setItems(data.items || []);
        setError("");
      } catch (err) {
        setError("No se pudo cargar tickets.");
        setToast("No se pudo cargar tickets.");
      }
    };

    loadTickets();
  }, [status]);

  useEffect(() => {
    const markTicketsSeen = async () => {
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
  }, []);

  const handleStatusChange = (event) => {
    setStatus(event.target.value);
  };

  const removeDetail = useCallback((ticketId) => {
    const messageIds = (details[ticketId]?.messages || []).map((msg) => msg.id);
    if (messageIds.length) {
      setImageByMessageId((prev) => {
        const next = { ...prev };
        messageIds.forEach((id) => {
          if (next[id]) {
            URL.revokeObjectURL(next[id]);
            delete next[id];
          }
        });
        return next;
      });
    }
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
    setReplyImageById((prev) => {
      const next = { ...prev };
      delete next[ticketId];
      return next;
    });
    setReplyImageNameById((prev) => {
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
      setToast("No se pudo cargar el ticket.");
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

  useEffect(() => {
    selectedTicketIds.forEach((ticketId) => {
      const detail = details[ticketId];
      if (!detail || !detail.messages) {
        return;
      }
      detail.messages.forEach((msg) => {
        if (!msg.telegram_file_id || imageByMessageId[msg.id]) {
          return;
        }
        apiFetchBinary(`/admin/tickets/messages/${msg.id}/image`)
          .then(({ buffer, contentType }) => {
            const blob = new Blob([buffer], {
              type: contentType || "application/octet-stream",
            });
            const url = URL.createObjectURL(blob);
            setImageByMessageId((prev) => ({ ...prev, [msg.id]: url }));
          })
          .catch(() => {
            // ignore image errors
          });
      });
    });
  }, [details, imageByMessageId, selectedTicketIds]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }
    const timer = setTimeout(() => setToast(""), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleReply = async (ticketId) => {
    const message = (replyById[ticketId] || "").trim();
    const imageDataUrl = replyImageById[ticketId] || "";
    if (!message && !imageDataUrl) {
      return;
    }
    try {
      await apiFetch(`/admin/tickets/${ticketId}/reply`, {
        method: "POST",
        body: JSON.stringify({
          message,
          image_data_url: imageDataUrl || undefined,
        }),
      });
      setDetailMessages((prev) => ({
        ...prev,
        [ticketId]: "Respuesta enviada.",
      }));
      setToast("Respuesta enviada.");
      setReplyById((prev) => ({ ...prev, [ticketId]: "" }));
      setReplyImageById((prev) => ({ ...prev, [ticketId]: "" }));
      setReplyImageNameById((prev) => ({ ...prev, [ticketId]: "" }));
      await loadDetail(ticketId);
    } catch (err) {
      setDetailErrors((prev) => ({
        ...prev,
        [ticketId]: "No se pudo enviar la respuesta.",
      }));
      setToast("No se pudo enviar la respuesta.");
    }
  };

  const handleAllowImage = async (ticketId) => {
    try {
      const data = await apiFetch(`/admin/tickets/${ticketId}/allow-image`, {
        method: "POST",
      });
      setDetails((prev) => ({
        ...prev,
        [ticketId]: {
          ...prev[ticketId],
          ticket: {
            ...prev[ticketId]?.ticket,
            allow_image: data?.ticket?.allow_image ?? true,
          },
        },
      }));
      setToast("Imagen permitida.");
    } catch (err) {
      setToast("No se pudo permitir la imagen.");
    }
  };

  const handleReplyImage = (ticketId, file) => {
    if (!file) {
      return;
    }
    if (!file.type || !file.type.startsWith("image/")) {
      setToast("La imagen debe ser un archivo válido.");
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setToast("La imagen supera el límite de 6MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setReplyImageById((prev) => ({ ...prev, [ticketId]: reader.result || "" }));
      setReplyImageNameById((prev) => ({
        ...prev,
        [ticketId]: file.name || "imagen",
      }));
    };
    reader.onerror = () => {
      setToast("No se pudo leer la imagen.");
    };
    reader.readAsDataURL(file);
  };

  const handleClose = async (ticketId) => {
    try {
      await apiFetch(`/admin/tickets/${ticketId}/close`, { method: "POST" });
      setDetailMessages((prev) => ({
        ...prev,
        [ticketId]: "Ticket cerrado.",
      }));
      setToast("Ticket cerrado.");
      await loadDetail(ticketId);
    } catch (err) {
      setDetailErrors((prev) => ({
        ...prev,
        [ticketId]: "No se pudo cerrar el ticket.",
      }));
      setToast("No se pudo cerrar el ticket.");
    }
  };

  const numberById = useMemo(() => {
    const map = new Map();
    const sorted = [...items].sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return aTime - bTime;
    });
    sorted.forEach((item, index) => {
      map.set(item.id, String(index + 1).padStart(4, "0"));
    });
    return map;
  }, [items]);

  const getTicketNumber = (ticketId) => numberById.get(ticketId) || "----";

  const handleCopy = async (label, value) => {
    if (value === undefined || value === null) {
      return;
    }
    try {
      await navigator.clipboard.writeText(String(value));
      setToast(`${label} copiado.`);
    } catch (err) {
      setToast(`No se pudo copiar ${label}.`);
    }
  };

  const formatStatusLabel = (statusValue) => {
    if (!statusValue) {
      return "-";
    }
    const key = String(statusValue).toUpperCase();
    const map = {
      OPEN: "ABIERTO",
      CLOSED: "CERRADO",
    };
    return map[key] || statusValue;
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
                <th align="left">Username</th>
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
                  <td align="left">{getTicketNumber(ticket.id)}</td>
                  <td align="left">{formatStatusLabel(ticket.status)}</td>
                  <td align="left">
                    {ticket.telegram_username ? (
                      <button
                        type="button"
                        className="orders-copy"
                        onClick={() =>
                          handleCopy("Username", `@${ticket.telegram_username}`)
                        }
                      >
                        @{ticket.telegram_username}
                      </button>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td align="left">
                    {ticket.telegram_id ? (
                      <button
                        type="button"
                        className="orders-copy"
                        onClick={() => handleCopy("Telegram ID", ticket.telegram_id)}
                      >
                        {ticket.telegram_id}
                      </button>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td align="left">{ticket.last_message_preview || "-"}</td>
                  <td align="left">{ticket.has_admin_reply ? "Si" : "No"}</td>
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
              <section
                key={ticketId}
                className="card orders-detail-card"
                style={{ position: "relative" }}
              >
                {isLoading && <p>Cargando...</p>}
                {!isLoading && detail && detail.ticket && (
                  <>
                    <div className="orders-detail-header">
                      <h2>Ticket #{getTicketNumber(detail.ticket.id)}</h2>
                      <button
                        type="button"
                        className="link-button"
                        style={{ position: "absolute", top: "16px", right: "16px" }}
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
                        <p>Estado: {formatStatusLabel(detail.ticket.status)}</p>
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
                        <div className="orders-inline-line">
                          <span className="orders-copy-label">Telegram ID:</span>
                          {detail.user?.telegram_id ? (
                            <button
                              type="button"
                              className="orders-copy"
                              onClick={() =>
                                handleCopy("Telegram ID", detail.user.telegram_id)
                              }
                            >
                              {detail.user.telegram_id}
                            </button>
                          ) : (
                            <span>-</span>
                          )}
                        </div>
                        <div className="orders-inline-line">
                          <span className="orders-copy-label">Username:</span>
                          {detail.user?.telegram_username ? (
                            <button
                              type="button"
                              className="orders-copy"
                              onClick={() =>
                                handleCopy("Username", `@${detail.user.telegram_username}`)
                              }
                            >
                              @{detail.user.telegram_username}
                            </button>
                          ) : (
                            <span>-</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="orders-detail-separator"></div>
                    <div className="orders-detail-section">
                      <h3>Conversación</h3>
                      <div className="ticket-thread" style={{ maxHeight: "220px", overflowY: "auto" }}>
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
                              {msg.message_text && <div>{msg.message_text}</div>}
                              {msg.telegram_file_id && (
                                imageByMessageId[msg.id] ? (
                                  <img
                                    src={imageByMessageId[msg.id]}
                                    alt="Imagen del ticket"
                                    style={{ maxWidth: "220px", borderRadius: "8px" }}
                                  />
                                ) : (
                                  <div className="muted">Cargando imagen...</div>
                                )
                              )}
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
                        <label>
                          Imagen (opcional)
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(event) =>
                              handleReplyImage(ticketId, event.target.files[0])
                            }
                          />
                          {replyImageNameById[ticketId] && (
                            <div className="muted">
                              Archivo: {replyImageNameById[ticketId]}
                            </div>
                          )}
                        </label>
                      </div>
                      <div className="actions">
                        <button
                          type="button"
                          onClick={() => handleReply(ticketId)}
                          disabled={!replyValue.trim() && !replyImageById[ticketId]}
                        >
                          Enviar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAllowImage(ticketId)}
                          disabled={detail.ticket.allow_image}
                        >
                          {detail.ticket.allow_image ? "Imagen permitida" : "Permitir imagen"}
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
