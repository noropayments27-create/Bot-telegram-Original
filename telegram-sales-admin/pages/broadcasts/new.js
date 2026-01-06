import { useEffect, useState } from "react";
import { useRouter } from "next/router";

import { apiFetch, getAdminKey } from "../../lib/api";

const SEGMENT_OPTIONS = [
  { value: "ALL_USERS", label: "Todos" },
  { value: "CUSTOM", label: "Custom" },
];

function parseTelegramIds(value) {
  return value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter((item) => item && /^[0-9]+$/.test(item));
}

export default function NewBroadcastPage() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [segment, setSegment] = useState("ALL_USERS");
  const [customIdsText, setCustomIdsText] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!getAdminKey()) {
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

      const data = await apiFetch("/admin/broadcasts", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (data && data.broadcast && data.broadcast.id) {
        router.push(`/broadcasts/${data.broadcast.id}`);
      } else {
        setError("No se pudo crear el broadcast.");
      }
    } catch (err) {
      setError("No se pudo crear el broadcast.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page">
      <section className="card" style={{ width: "min(700px, 100%)" }}>
        <h1>Nuevo broadcast</h1>
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
