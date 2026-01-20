import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

import { apiFetch, getAuthToken } from "../../lib/api";
import { IconBroadcasts } from "../../components/PanelIcons";

const SEGMENT_OPTIONS = [
  { value: "ALL_USERS", label: "Todos" },
  { value: "BUYERS", label: "Compradores" },
  { value: "AFFILIATES", label: "Afiliados" },
  { value: "CUSTOM", label: "Personalizado" },
  { value: "GROUPS", label: "Grupos" },
  { value: "CHANNELS", label: "Canales" },
];

function parseTelegramIds(value) {
  return value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter((item) => item && /^[0-9]+$/.test(item));
}

function parseChatIds(value) {
  return value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter((item) => item && /^-?[0-9]+$/.test(item));
}

const formatSegmentLabel = (segment) => {
  if (segment === "BUYERS_AFFILIATES") {
    return "Compradores y afiliados";
  }
  const option = SEGMENT_OPTIONS.find((item) => item.value === segment);
  return option ? option.label : segment;
};

const formatStatusLabel = (status) => {
  if (!status) {
    return "-";
  }
  const key = String(status).toUpperCase();
  const map = {
    DRAFT: "Borrador",
    SENT: "Enviado",
    FAILED: "Fallido",
  };
  return map[key] || status;
};

export default function BroadcastsPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [selectedBroadcastIds, setSelectedBroadcastIds] = useState([]);
  const [details, setDetails] = useState({});
  const [detailLoading, setDetailLoading] = useState({});
  const [detailErrors, setDetailErrors] = useState({});
  const [detailMessages, setDetailMessages] = useState({});
  const [message, setMessage] = useState("");
  const [segments, setSegments] = useState(["ALL_USERS"]);
  const [customIdsText, setCustomIdsText] = useState("");
  const [chatIdsText, setChatIdsText] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [imageName, setImageName] = useState("");
  const [imageCleared, setImageCleared] = useState(false);
  const [buttons, setButtons] = useState([]);
  const [editingId, setEditingId] = useState("");
  const [createError, setCreateError] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState("");
  const listMaxHeight = 42 + 5 * 52;

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    const loadBroadcasts = async () => {
      try {
        let page = 1;
        let totalPages = 1;
        const all = [];
        while (page <= totalPages) {
          const params = new URLSearchParams({
            page: String(page),
            page_size: "50",
          });
          const data = await apiFetch(`/admin/broadcasts?${params.toString()}`);
          all.push(...(data.items || []));
          totalPages = data.total_pages || 1;
          page += 1;
        }
        setItems(all);
        setError("");
      } catch (err) {
        setError("No se pudo cargar las difusiones.");
        setToast("No se pudo cargar las difusiones.");
      }
    };

    loadBroadcasts();
  }, []);

  const removeDetail = useCallback((broadcastId) => {
    setDetails((prev) => {
      const next = { ...prev };
      delete next[broadcastId];
      return next;
    });
    setDetailErrors((prev) => {
      const next = { ...prev };
      delete next[broadcastId];
      return next;
    });
    setDetailMessages((prev) => {
      const next = { ...prev };
      delete next[broadcastId];
      return next;
    });
  }, []);

  const loadDetail = useCallback(async (broadcastId) => {
    if (!broadcastId) {
      return;
    }
    setDetailLoading((prev) => ({ ...prev, [broadcastId]: true }));
    setDetailErrors((prev) => ({ ...prev, [broadcastId]: "" }));
    try {
      const data = await apiFetch(`/admin/broadcasts/${broadcastId}`);
      setDetails((prev) => ({ ...prev, [broadcastId]: data }));
    } catch (err) {
      setDetailErrors((prev) => ({
        ...prev,
        [broadcastId]: "No se pudo cargar la difusión.",
      }));
    } finally {
      setDetailLoading((prev) => ({ ...prev, [broadcastId]: false }));
    }
  }, []);

  const handleViewBroadcast = async (broadcastId) => {
    if (!broadcastId) {
      return;
    }
    setSelectedBroadcastIds((prev) => {
      if (prev.includes(broadcastId)) {
        removeDetail(broadcastId);
        return prev.filter((id) => id !== broadcastId);
      }
      const next = [broadcastId, ...prev.filter((id) => id !== broadcastId)];
      if (next.length > 3) {
        const removed = next.pop();
        if (removed) {
          removeDetail(removed);
        }
      }
      return next;
    });
    await loadDetail(broadcastId);
  };

  useEffect(() => {
    selectedBroadcastIds.forEach((broadcastId) => {
      if (!details[broadcastId] && !detailLoading[broadcastId]) {
        loadDetail(broadcastId);
      }
    });
  }, [detailLoading, details, loadDetail, selectedBroadcastIds]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }
    const timer = setTimeout(() => setToast(""), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

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

  const getBroadcastNumber = (broadcastId) => numberById.get(broadcastId) || "----";

  const toggleSegment = (value) => {
    setSegments((prev) => {
      if (prev.includes(value)) {
        return prev.filter((item) => item !== value);
      }
      return [...prev, value];
    });
  };

  const setCreateErrorMessage = (message) => {
    setCreateError(message);
    if (message) {
      setToast(message);
    }
  };

  const isValidUrl = (value) => {
    if (!value) {
      return false;
    }
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch (err) {
      return false;
    }
  };

  const handleImageFile = async (file) => {
    if (!file) {
      return;
    }
    if (imageDataUrl) {
      setCreateErrorMessage("Solo se permite una imagen por difusión. Quita la actual.");
      return;
    }
    if (!file.type || !file.type.startsWith("image/")) {
      setCreateErrorMessage("La imagen debe ser un archivo válido.");
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setCreateErrorMessage("La imagen supera el límite de 6MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageDataUrl(reader.result || "");
      setImageName(file.name || "imagen");
      setImageCleared(false);
      setCreateError("");
    };
    reader.onerror = () => {
      setCreateErrorMessage("No se pudo leer la imagen.");
    };
    reader.readAsDataURL(file);
  };

  const addButton = () => {
    setButtons((prev) => [...prev, { text: "", url: "" }]);
  };

  const updateButton = (index, key, value) => {
    setButtons((prev) =>
      prev.map((button, i) => (i === index ? { ...button, [key]: value } : button))
    );
  };

  const removeButton = (index) => {
    setButtons((prev) => prev.filter((_, i) => i !== index));
  };

  const startEdit = (broadcast) => {
    if (!broadcast) {
      return;
    }
    setEditingId(broadcast.id);
    setShowCreate(true);
    setMessage(broadcast.message_text || "");
    setSegments([broadcast.segment || "ALL_USERS"]);
    setCustomIdsText("");
    setChatIdsText("");
    setButtons(Array.isArray(broadcast.buttons) ? broadcast.buttons : []);
    setImageDataUrl("");
    setImageName(broadcast.image_filename ? `Imagen actual: ${broadcast.image_filename}` : "");
    setImageCleared(false);
  };

  const resetCreateForm = () => {
    setEditingId("");
    setMessage("");
    setCustomIdsText("");
    setChatIdsText("");
    setImageDataUrl("");
    setImageName("");
    setImageCleared(false);
    setButtons([]);
    setSegments(["ALL_USERS"]);
    setCreateErrorMessage("");
    setShowCreate(false);
  };

    const handleSaveBroadcast = async (broadcastId, nextSaved) => {
    try {
      const data = await apiFetch(`/admin/broadcasts/${broadcastId}`, {
        method: "PATCH",
        body: JSON.stringify({ saved: nextSaved }),
      });
      setItems((prev) =>
        prev.map((item) => (item.id === broadcastId ? data.broadcast : item))
      );
      setToast(nextSaved ? "Difusión guardada." : "Difusión desguardada.");
    } catch (err) {
      setToast("No se pudo guardar la difusión.");
    }
  };

  const handleDeleteBroadcast = async (broadcast) => {
    if (!broadcast) {
      return;
    }
    if (broadcast.saved) {
      const confirmed = window.confirm("Esta difusión está guardada. ¿Eliminar?");
      if (!confirmed) {
        return;
      }
    }
    try {
      await apiFetch(`/admin/broadcasts/${broadcast.id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((item) => item.id !== broadcast.id));
      setToast("Difusión eliminada.");
    } catch (err) {
      setToast("No se pudo eliminar la difusión.");
    }
  };

  const handleSend = async (broadcastId) => {
    const detail = details[broadcastId];
    if (!detail || !detail.broadcast) {
      return;
    }
    setDetailMessages((prev) => ({ ...prev, [broadcastId]: "" }));
    setDetailErrors((prev) => ({ ...prev, [broadcastId]: "" }));
    setDetailLoading((prev) => ({ ...prev, [broadcastId]: true }));
    try {
      const payload = {};
      if (detail.broadcast.segment === "CUSTOM"
        && Array.isArray(detail.broadcast.custom_telegram_ids)
      ) {
        payload.telegram_ids = detail.broadcast.custom_telegram_ids;
      }
      if (
        (detail.broadcast.segment === "GROUPS"
          || detail.broadcast.segment === "CHANNELS")
        && Array.isArray(detail.broadcast.chat_ids)
      ) {
        payload.chat_ids = detail.broadcast.chat_ids;
      }
      const data = await apiFetch(`/admin/broadcasts/${broadcastId}/send`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setDetails((prev) => ({ ...prev, [broadcastId]: data }));
      setDetailMessages((prev) => ({
        ...prev,
        [broadcastId]: "Difusión enviada.",
      }));
      if (data?.result) {
        setToast(
          `Enviados: ${data.result.sent_count} · Fallidos: ${data.result.failed_count}`
        );
      } else {
        setToast("Difusión enviada.");
      }
    } catch (err) {
      setDetailErrors((prev) => ({
        ...prev,
        [broadcastId]: "No se pudo enviar la difusión.",
      }));
      setToast("No se pudo enviar la difusión.");
    } finally {
      setDetailLoading((prev) => ({ ...prev, [broadcastId]: false }));
    }
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    setCreateErrorMessage("");
    setCreateLoading(true);
    try {
      if (!message.trim() && !imageDataUrl && !imageName) {
        setCreateErrorMessage("Escribe un mensaje o agrega una imagen.");
        return;
      }
      if (segments.length === 0) {
        setCreateErrorMessage("Selecciona al menos un segmento.");
        return;
      }
      if (editingId && segments.length !== 1) {
        setCreateErrorMessage("Selecciona un solo segmento para editar.");
        return;
      }
      const telegramIds = parseTelegramIds(customIdsText);
      const chatIds = parseChatIds(chatIdsText);
      if (segments.includes("CUSTOM") && telegramIds.length === 0) {
        setCreateErrorMessage("Debes ingresar Telegram IDs válidos.");
        return;
      }
      if (
        (segments.includes("GROUPS") || segments.includes("CHANNELS"))
        && chatIds.length === 0
      ) {
        setCreateErrorMessage("Debes ingresar Chat IDs válidos.");
        return;
      }
      const cleanedButtons = buttons
        .map((button) => ({
          text: String(button.text || "").trim(),
          url: String(button.url || "").trim(),
        }))
        .filter((button) => button.text || button.url);
      const invalidButton = cleanedButtons.find(
        (button) => !button.text || !button.url || !isValidUrl(button.url)
      );
      if (invalidButton) {
        setCreateErrorMessage("Revisa los botones: texto y URL válida (http/https).");
        return;
      }
      if (editingId) {
        const payload = {
          message,
          segment: segments[0],
        };
        if (imageDataUrl) {
          payload.image_data_url = imageDataUrl;
        }
        if (imageCleared) {
          payload.clear_image = true;
        }
        payload.buttons = cleanedButtons;
        try {
          const data = await apiFetch(`/admin/broadcasts/${editingId}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          });
          setItems((prev) =>
            prev.map((item) => (item.id === editingId ? data.broadcast : item))
          );
          setToast("Difusión actualizada.");
          resetCreateForm();
          return;
        } catch (err) {
          setCreateErrorMessage("No se pudo actualizar la difusión.");
          return;
        }
      }

      const created = [];
      let sentTotal = 0;
      let failedTotal = 0;
      let hadError = false;
      for (const segment of segments) {
        const payload = {
          message,
          segment,
        };
        if (imageDataUrl) {
          payload.image_data_url = imageDataUrl;
        }
        if (cleanedButtons.length > 0) {
          payload.buttons = cleanedButtons;
        }
        if (segment === "CUSTOM") {
          payload.telegram_ids = telegramIds;
        }
        if (segment === "GROUPS" || segment === "CHANNELS") {
          payload.chat_ids = chatIds;
        }
        try {
          const data = await apiFetch("/admin/broadcasts", {
            method: "POST",
            body: JSON.stringify(payload),
          });
          if (!data?.broadcast?.id) {
            hadError = true;
            continue;
          }
          const sendPayload = {};
          if (segment === "CUSTOM") {
            sendPayload.telegram_ids = telegramIds;
          }
          if (segment === "GROUPS" || segment === "CHANNELS") {
            sendPayload.chat_ids = chatIds;
          }
          try {
            const sendData = await apiFetch(
              `/admin/broadcasts/${data.broadcast.id}/send`,
              {
                method: "POST",
                body: JSON.stringify(sendPayload),
              }
            );
            if (sendData?.result) {
              sentTotal += sendData.result.sent_count || 0;
              failedTotal += sendData.result.failed_count || 0;
            }
            created.push(sendData?.broadcast || data.broadcast);
          } catch (err) {
            created.push(data.broadcast);
            hadError = true;
          }
        } catch (err) {
          hadError = true;
        }
      }
      if (created.length > 0) {
        setItems((prev) => [...created, ...prev]);
      }
      if (hadError) {
        setCreateErrorMessage("Algunas difusiones no se pudieron enviar.");
        if (sentTotal > 0 || failedTotal > 0) {
          setToast(`Enviados: ${sentTotal} · Fallidos: ${failedTotal}`);
        }
        return;
      }
      if (sentTotal > 0 || failedTotal > 0) {
        setToast(`Enviados: ${sentTotal} · Fallidos: ${failedTotal}`);
      } else {
        setToast("Difusión enviada.");
      }
      resetCreateForm();
    } catch (err) {
      setCreateErrorMessage("No se pudo crear la difusión.");
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <main className="page">
      <section className="card orders-card" style={{ width: "100%" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <h1 className="icon-inline"><IconBroadcasts className="panel-icon" /> Difusiones</h1>
          <button
            type="button"
            className="link-button"
            onClick={() => setShowCreate((prev) => !prev)}
          >
            {showCreate ? "Ocultar" : "Crear"}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="orders-list" style={{ maxHeight: `${listMaxHeight}px`, overflowY: "auto" }}>
          <table className="orders-table">
            <thead>
              <tr>
                <th align="left">Número</th>
                <th align="left">Estado</th>
                <th align="left">Segmento</th>
                <th align="left">Creado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((broadcast) => (
                <tr
                  key={broadcast.id}
                  className={
                    selectedBroadcastIds.includes(broadcast.id) ? "orders-row-active" : ""
                  }
                  style={broadcast.saved ? { background: "rgba(34, 197, 94, 0.12)" } : undefined}
                >
                  <td>Número: {getBroadcastNumber(broadcast.id)}</td>
                  <td>{formatStatusLabel(broadcast.status)}</td>
                  <td>{formatSegmentLabel(broadcast.segment)}</td>
                  <td>{broadcast.created_at ? new Date(broadcast.created_at).toLocaleString() : "-"}</td>
                  <td>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "nowrap" }}>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => handleViewBroadcast(broadcast.id)}
                      >
                        Ver
                      </button>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => handleSaveBroadcast(broadcast.id, !broadcast.saved)}
                        style={broadcast.saved ? { opacity: 0.6 } : undefined}
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => startEdit(broadcast)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => handleDeleteBroadcast(broadcast)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {showCreate && (
        <section
          className="card orders-card"
          style={{
            width: "40%",
            marginTop: "20px",
            marginLeft: 0,
            marginRight: "auto",
            textAlign: "center",
          }}
        >
          <h2>{editingId ? "Editar difusión" : "Nueva difusión"}</h2>
          {createError && <p className="error">{createError}</p>}
          <form className="form" onSubmit={handleCreate}>
            <label>
              Mensaje
              <textarea value={message} onChange={(event) => setMessage(event.target.value)} />
            </label>
            <label>
              Imagen (opcional)
              <div
                style={{
                  border: "1px dashed #ff4d00",
                  borderRadius: "10px",
                  padding: "12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  alignItems: "flex-start",
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const file = event.dataTransfer.files && event.dataTransfer.files[0];
                  handleImageFile(file);
                }}
              >
                <input
                  type="file"
                  accept="image/*"
                  disabled={Boolean(imageDataUrl)}
                  onChange={(event) => handleImageFile(event.target.files[0])}
                />
                <span>
                  {imageName ? `Archivo: ${imageName}` : "Arrastra o selecciona una imagen."}
                </span>
                {imageDataUrl && (
                  <img
                    src={imageDataUrl}
                    alt="Vista previa"
                    style={{ maxWidth: "160px", borderRadius: "8px" }}
                  />
                )}
                {imageName && (
                  <button
                    type="button"
                    className="link-button"
                    style={{ background: "none" }}
                    onClick={() => {
                      setImageDataUrl("");
                      setImageName("");
                      setImageCleared(true);
                    }}
                  >
                    Quitar imagen
                  </button>
                )}
              </div>
            </label>
            <label>
              Botones (opcional)
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {buttons.map((button, index) => (
                  <div
                    key={`button-${index}`}
                    style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}
                  >
                    <input
                      type="text"
                      placeholder="Texto"
                      value={button.text}
                      onChange={(event) => updateButton(index, "text", event.target.value)}
                    />
                    <input
                      type="url"
                      placeholder="https://..."
                      value={button.url}
                      onChange={(event) => updateButton(index, "url", event.target.value)}
                    />
                    <button
                      type="button"
                      className="link-button"
                      style={{ background: "none" }}
                      onClick={() => removeButton(index)}
                    >
                      Quitar
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="link-button"
                  style={{
                    border: "1px solid #ff4d00",
                    width: "30%",
                    margin: "0 auto",
                  }}
                  onClick={addButton}
                >
                  Agregar botón
                </button>
              </div>
            </label>
            <label>
              Segmentos
              <div className="checkbox-row">
                {SEGMENT_OPTIONS.map((option) => (
                  <label key={option.value}>
                    <input
                      type="checkbox"
                      checked={segments.includes(option.value)}
                      onChange={() => toggleSegment(option.value)}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </label>
            {segments.includes("CUSTOM") && (
              <label>
                Telegram IDs (separados por coma o espacio)
                <textarea
                  value={customIdsText}
                  onChange={(event) => setCustomIdsText(event.target.value)}
                  placeholder="123456789, 987654321"
                />
              </label>
            )}
            {(segments.includes("GROUPS") || segments.includes("CHANNELS")) && (
              <label>
                Chat IDs de grupos/canales (separados por coma o espacio)
                <textarea
                  value={chatIdsText}
                  onChange={(event) => setChatIdsText(event.target.value)}
                  placeholder="-1001234567890, -1009876543210"
                />
              </label>
            )}
            <div className="actions">
              <button type="submit" disabled={createLoading}>
                {createLoading
                  ? editingId
                    ? "Guardando..."
                    : "Enviando..."
                  : editingId
                  ? "Guardar cambios"
                  : "Enviar"}
              </button>
              {editingId && (
                <button type="button" className="link-button" onClick={resetCreateForm}>
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </section>
      )}
      {selectedBroadcastIds.length > 0 && (
        <div className="orders-detail-wrap">
          {selectedBroadcastIds.map((broadcastId) => {
            const detail = details[broadcastId];
            const isLoading = detailLoading[broadcastId];
            const errorMessage = detailErrors[broadcastId];
            const message = detailMessages[broadcastId];
            const broadcast = detail?.broadcast;
            const result = detail?.result;

            return (
              <section key={broadcastId} className="card orders-detail-card">
                {isLoading && <p>Cargando...</p>}
                {!isLoading && broadcast && (
                  <>
                    <div className="orders-detail-header">
                      <h2>Difusión Número: {getBroadcastNumber(broadcast.id)}</h2>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => handleViewBroadcast(broadcast.id)}
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
                      <p>Número: {getBroadcastNumber(broadcast.id)}</p>
                      <p>Estado: {formatStatusLabel(broadcast.status)}</p>
                        <p>Segmento: {formatSegmentLabel(broadcast.segment)}</p>
                        <p>
                          Creado:{" "}
                          {broadcast.created_at
                            ? new Date(broadcast.created_at).toLocaleString()
                            : "-"}
                        </p>
                        <p>
                          Enviado:{" "}
                          {broadcast.sent_at
                            ? new Date(broadcast.sent_at).toLocaleString()
                            : "-"}
                        </p>
                      </div>
                      <div className="orders-detail-section">
                        <h3>Mensaje</h3>
                        <div className="detail-textbox">
                          {broadcast.message_text || "-"}
                        </div>
                      </div>
                    </div>
                    {(broadcast.segment === "CUSTOM"
                      || broadcast.segment === "GROUPS"
                      || broadcast.segment === "CHANNELS") && (
                      <>
                        <div className="orders-detail-separator"></div>
                        <div className="orders-detail-section">
                          <h3>Destinatarios</h3>
                          <div className="detail-textbox">
                            {(broadcast.segment === "GROUPS" || broadcast.segment === "CHANNELS")
                              ? (broadcast.chat_ids || []).join(", ") || "-"
                              : (broadcast.custom_telegram_ids || []).join(", ") || "-"}
                          </div>
                        </div>
                      </>
                    )}
                    {result && (
                      <>
                        <div className="orders-detail-separator"></div>
                        <div className="orders-detail-section">
                          <h3>Resultado</h3>
                          <div className="detail-textbox">
                            Objetivo: {result.target_count}{"\n"}
                            Enviados: {result.sent_count}{"\n"}
                            Fallidos: {result.failed_count}
                          </div>
                        </div>
                      </>
                    )}
                    <div className="orders-detail-actions">
                      <div className="actions">
                        <button
                          type="button"
                          onClick={() => handleSend(broadcast.id)}
                          disabled={isLoading}
                        >
                          Enviar
                        </button>
                      </div>
                    </div>
                  </>
                )}
                {!isLoading && !broadcast && errorMessage && (
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
