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
const BUTTON_STYLE_OPTIONS = [
  { value: "", label: "Normal" },
  { value: "primary", label: "Primario" },
  { value: "success", label: "Verde" },
  { value: "danger", label: "Rojo" },
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
  const [buttons, setButtons] = useState([]);
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
      const cleanedButtons = buttons
        .map((button) => {
          const normalized = {
            text: String(button.text || "").trim(),
            url: String(button.url || "").trim(),
          };
          const style = String(button.style || "").trim().toLowerCase();
          const iconCustomEmojiId = String(button.icon_custom_emoji_id || "").trim().replace(/\D/g, "");
          if (["danger", "success", "primary"].includes(style)) {
            normalized.style = style;
          }
          if (iconCustomEmojiId) {
            normalized.icon_custom_emoji_id = iconCustomEmojiId;
          }
          return normalized;
        })
        .filter((button) => button.text || button.url);
      const invalidButton = cleanedButtons.find(
        (button) => !button.text || !/^https?:\/\//i.test(button.url)
      );
      if (invalidButton) {
        setError("Revisa los botones: texto y URL válida.");
        setLoading(false);
        return;
      }
      if (cleanedButtons.length > 0) {
        payload.buttons = cleanedButtons;
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
          <label>
            Botones
            <div className="broadcast-buttons-wrap" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {buttons.map((button, index) => (
                <div key={`new-button-${index}`} className="broadcast-button-row" style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <input
                    type="text"
                    placeholder="Texto"
                    value={button.text || ""}
                    onChange={(event) =>
                      setButtons((prev) => prev.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, text: event.target.value } : item
                      ))
                    }
                  />
                  <input
                    type="url"
                    placeholder="https://..."
                    value={button.url || ""}
                    onChange={(event) =>
                      setButtons((prev) => prev.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, url: event.target.value } : item
                      ))
                    }
                  />
                  <select
                    value={button.style || ""}
                    onChange={(event) =>
                      setButtons((prev) => prev.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, style: event.target.value } : item
                      ))
                    }
                  >
                    {BUTTON_STYLE_OPTIONS.map((option) => (
                      <option key={option.value || "normal"} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Custom emoji ID"
                    value={button.icon_custom_emoji_id || ""}
                    onChange={(event) =>
                      setButtons((prev) => prev.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, icon_custom_emoji_id: event.target.value.replace(/\D/g, "") }
                          : item
                      ))
                    }
                  />
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setButtons((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    Quitar
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="link-button"
                onClick={() => setButtons((prev) => [...prev, { text: "", url: "", style: "" }])}
              >
                Agregar botón
              </button>
            </div>
          </label>
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
