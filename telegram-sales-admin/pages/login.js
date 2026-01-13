import { useEffect, useState } from "react";
import { useRouter } from "next/router";

import { getApiBaseUrl, getAuthToken, setAuthToken } from "../lib/api";

export default function Login() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [requestId, setRequestId] = useState("");

  useEffect(() => {
    if (getAuthToken()) {
      router.replace("/orders");
    }
  }, [router]);

  useEffect(() => {
    if (!waiting || !requestId) {
      return;
    }
    const baseUrl = getApiBaseUrl();
    const interval = setInterval(async () => {
      try {
        const response = await fetch(
          `${baseUrl}/admin/auth/status?request_id=${encodeURIComponent(requestId)}`
        );
        const data = await response.json();
        if (data.status === "APPROVED" && data.token) {
          setAuthToken(data.token);
          router.replace("/orders");
          return;
        }
        if (data.status === "DENIED") {
          setError("Solicitud rechazada. Intenta de nuevo.");
          setWaiting(false);
          setRequestId("");
          return;
        }
        if (data.status === "EXPIRED") {
          setError("La solicitud expiro. Intenta de nuevo.");
          setWaiting(false);
          setRequestId("");
        }
      } catch (err) {
        setError("No se pudo validar la solicitud.");
        setWaiting(false);
        setRequestId("");
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [requestId, router, waiting]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Ingresa usuario y clave.");
      return;
    }
    if (waiting) {
      return;
    }
    setError("");
    try {
      const response = await fetch(`${getApiBaseUrl()}/admin/auth/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim(),
        }),
      });
      if (response.status === 401) {
        setError("Credenciales invalidas.");
        return;
      }
      if (!response.ok) {
        setError("No se pudo iniciar la solicitud.");
        return;
      }
      const data = await response.json();
      setWaiting(true);
      setRequestId(data.request_id);
    } catch (err) {
      setError("No se pudo iniciar la solicitud.");
    }
  };

  return (
    <main className="page">
      <section className="card">
        <h1>Inicio de Sesión Admin</h1>
        <p className="muted">
          Ingresa usuario y clave, luego confirma en Telegram.
        </p>
        {error && <p className="error">{error}</p>}
        <form className="form" onSubmit={handleSubmit}>
          <label>
            Usuario
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Usuario"
              disabled={waiting}
            />
          </label>
          <label>
            Clave
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Clave"
              disabled={waiting}
            />
          </label>
          {waiting && (
            <p className="muted">Esperando confirmacion en Telegram...</p>
          )}
          <button type="submit" disabled={waiting}>
            Ingresar
          </button>
        </form>
      </section>
    </main>
  );
}
