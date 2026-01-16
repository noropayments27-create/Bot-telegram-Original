import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { apiFetch, getAuthToken } from "../../lib/api";
import { IconBroadcasts } from "../../components/PanelIcons";

export default function BroadcastsPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState("");
  const [selectedBroadcastIds, setSelectedBroadcastIds] = useState([]);
  const [details, setDetails] = useState({});
  const [detailLoading, setDetailLoading] = useState({});
  const [detailErrors, setDetailErrors] = useState({});
  const [detailMessages, setDetailMessages] = useState({});

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    const loadBroadcasts = async () => {
      try {
        const params = new URLSearchParams({
          page: String(page),
          page_size: "20",
        });

        const data = await apiFetch(`/admin/broadcasts?${params.toString()}`);
        setItems(data.items || []);
        setTotalPages(data.total_pages || 1);
        setError("");
      } catch (err) {
        setError("No se pudo cargar broadcasts.");
      }
    };

    loadBroadcasts();
  }, [page]);

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
        [broadcastId]: "No se pudo cargar el broadcast.",
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

  const handleSend = async (broadcastId) => {
    const detail = details[broadcastId];
    if (!detail || !detail.broadcast) {
      return;
    }
    const confirmed = window.confirm("Enviar este broadcast ahora?");
    if (!confirmed) {
      return;
    }
    setDetailMessages((prev) => ({ ...prev, [broadcastId]: "" }));
    setDetailErrors((prev) => ({ ...prev, [broadcastId]: "" }));
    setDetailLoading((prev) => ({ ...prev, [broadcastId]: true }));
    try {
      const payload = {};
      if (
        detail.broadcast.segment === "CUSTOM"
        && Array.isArray(detail.broadcast.custom_telegram_ids)
      ) {
        payload.telegram_ids = detail.broadcast.custom_telegram_ids;
      }
      const data = await apiFetch(`/admin/broadcasts/${broadcastId}/send`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setDetails((prev) => ({ ...prev, [broadcastId]: data }));
      setDetailMessages((prev) => ({
        ...prev,
        [broadcastId]: "Broadcast enviado.",
      }));
    } catch (err) {
      setDetailErrors((prev) => ({
        ...prev,
        [broadcastId]: "No se pudo enviar el broadcast.",
      }));
    } finally {
      setDetailLoading((prev) => ({ ...prev, [broadcastId]: false }));
    }
  };

  return (
    <main className="page">
      <section className="card orders-card" style={{ width: "min(900px, 100%)" }}>
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
          <Link className="link" href="/broadcasts/new">
            Crear
          </Link>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="orders-list">
          <table className="orders-table">
            <thead>
              <tr>
                <th align="left">ID</th>
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
                >
                  <td>{broadcast.id}</td>
                  <td>{broadcast.status}</td>
                  <td>{broadcast.segment}</td>
                  <td>{broadcast.created_at ? new Date(broadcast.created_at).toLocaleString() : "-"}</td>
                  <td>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => handleViewBroadcast(broadcast.id)}
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
                      <h2>Difusión #{broadcast.id}</h2>
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
                        <p>Estado: {broadcast.status}</p>
                        <p>Segmento: {broadcast.segment}</p>
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
                    {broadcast.segment === "CUSTOM" && (
                      <>
                        <div className="orders-detail-separator"></div>
                        <div className="orders-detail-section">
                          <h3>Destinatarios</h3>
                          <div className="detail-textbox">
                            {(broadcast.custom_telegram_ids || []).join(", ") || "-"}
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
    </main>
  );
}
