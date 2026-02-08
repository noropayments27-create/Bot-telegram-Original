import { useMemo, useState } from "react";
import { useRouter } from "next/router";

import { getApiBaseUrl, setAuthToken } from "../lib/api";

export default function TelegramAccessPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const redirectTarget = useMemo(() => {
    const orderId = router.query?.orderId;
    if (typeof orderId === "string" && orderId.trim()) {
      return `/orders?orderId=${encodeURIComponent(orderId.trim())}`;
    }
    return "/dashboard";
  }, [router.query]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!password.trim()) {
      setError("Ingresa la clave de acceso.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${getApiBaseUrl()}/admin/auth/direct`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.trim() }),
      });
      const data = await response.json();
      if (!response.ok || !data?.token) {
        setError("Clave inválida. Verifica e intenta nuevamente.");
        setLoading(false);
        return;
      }
      setAuthToken(data.token);
      router.replace(redirectTarget);
    } catch (err) {
      setError("No se pudo validar la clave en este momento.");
      setLoading(false);
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
            <img src="https://i.ibb.co/356LrnLr/bot.png" alt="Acceso admin" />
          </div>
          <form className="login-form" onSubmit={handleSubmit}>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="CLAVE ADMIN"
              disabled={loading}
              required
            />
            <button type="submit" disabled={loading}>
              {loading ? "Validando..." : "Ingresar"}
            </button>
            {error ? <p style={{ color: "#ff6b6b", margin: "10px 0 0" }}>{error}</p> : null}
          </form>
        </div>
      </main>
    </>
  );
}
