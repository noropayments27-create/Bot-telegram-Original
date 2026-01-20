import { useEffect, useState } from "react";
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

export default function NewBroadcastPage() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [segment, setSegment] = useState("ALL_USERS");
  const [customIdsText, setCustomIdsText] = useState("");
  const [chatIdsText, setChatIdsText] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/login");
    }
  }, [router]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const payload = {
        message,
        segment,
      };

      if (segment === "CUSTOM") {
        const telegramIds = parseTelegramIds(customIdsText);
        payload.telegram_ids = telegramIds;
      }
      if (segment === "GROUPS" || segment === "CHANNELS") {
        const chatIds = parseChatIds(chatIdsText);
        payload.chat_ids = chatIds;
      }

      const data = await apiFetch("/admin/broadcasts", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (data && data.broadcast && data.broadcast.id) {
        router.push(`/broadcasts/${data.broadcast.id}`);
      } else {
        setError("No se pudo crear la difusión.");
      }
    } catch (err) {
      setError("No se pudo crear la difusión.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page">
      <section className="card" style={{ width: "min(700px, 100%)" }}>
        <h1 className="icon-inline"><IconBroadcasts className="panel-icon" /> Nueva Difusión</h1>
        {error && <p className="error">{error}</p>}
        <form className="form" onSubmit={handleSubmit}>
          <label>
            Mensaje
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} />
          </label>
          <label>
            Segmento
            <select value={segment} onChange={(event) => setSegment(event.target.value)}>
              {SEGMENT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {segment === "CUSTOM" && (
            <label>
              Telegram IDs (separados por coma o espacio)
              <textarea
                value={customIdsText}
                onChange={(event) => setCustomIdsText(event.target.value)}
                placeholder="123456789, 987654321"
              />
            </label>
          )}
          {(segment === "GROUPS" || segment === "CHANNELS") && (
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
            <button type="submit" disabled={loading}>
              {loading ? "Creando..." : "Crear"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
