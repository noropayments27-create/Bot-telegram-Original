import { useEffect, useState } from "react";
import { useRouter } from "next/router";

import { getApiBaseUrl, getAuthToken, setAuthToken } from "../lib/api";

export default function Login() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    return () => {
      document.body.classList.remove("login-success");
    };
  }, []);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }
    const timer = setTimeout(() => setToast(""), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

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
          setToast("✅ Bienvenido al panel, acceso concedido.");
          setTimeout(() => {
            router.replace("/dashboard");
          }, 1000);
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
          remember_me: rememberMe,
        }),
      });
      if (response.status === 401) {
        setError("Credenciales invalidas.");
        setToast("❌ Credenciales incorrectas. Verifica usuario y contraseña.");
        return;
      }
      if (!response.ok) {
        setError("No se pudo iniciar la solicitud.");
        setToast("❌ No se pudo iniciar la solicitud.");
        return;
      }
      const data = await response.json();
      setWaiting(true);
      setRequestId(data.request_id);
      setToast("📩 Solicitud enviada. Revisa tu Telegram.");
    } catch (err) {
      setError("No se pudo iniciar la solicitud.");
      setToast("❌ No se pudo iniciar la solicitud.");
    }
  };

  return (
    <>
      <div className="title-container">
        <h1>Admin Bot</h1>
        <p>Noropayments.shop</p>
      </div>
      <main className="page page-login">
        <div className="login-container">
          <div className="user-icon-bg">
            <img src="https://i.ibb.co/356LrnLr/bot.png" alt="Icono usuario" />
          </div>
          <form className="login-form" onSubmit={handleSubmit}>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="USUARIO"
              disabled={waiting}
              required
            />
            <div className="login-password-field">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="CONTRASEÑA"
                disabled={waiting}
                required
              />
              <button
                type="button"
                className="login-password-toggle"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                disabled={waiting}
              >
                {showPassword ? "🙈" : "👁️"}
              </button>
            </div>
            <label className="remember-me">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
                disabled={waiting}
              />
              Recuerdame
            </label>
            <button type="submit" disabled={waiting}>Inicio</button>
          </form>
        </div>
      </main>
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
    </>
  );
}
