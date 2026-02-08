import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

import { setAuthToken } from "../lib/api";

export default function TelegramLoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  const nextPath = useMemo(() => {
    const orderId = router.query?.orderId;
    if (typeof orderId === "string" && orderId.trim()) {
      return `/orders?orderId=${encodeURIComponent(orderId.trim())}`;
    }
    return "/dashboard";
  }, [router.query]);

  useEffect(() => {
    if (!router.isReady) {
      return;
    }
    const token = typeof router.query?.token === "string"
      ? router.query.token.trim()
      : "";
    if (!token) {
      setError("Token de acceso inválido.");
      return;
    }
    setAuthToken(token);
    router.replace(nextPath);
  }, [router, nextPath]);

  return (
    <main className="page page-login">
      <div className="login-container">
        <div className="user-icon-bg">
          <img src="https://i.ibb.co/356LrnLr/bot.png" alt="Acceso Telegram" />
        </div>
        <div className="login-form">
          <p style={{ margin: 0 }}>
            {error || "Validando acceso, espera un momento..."}
          </p>
        </div>
      </div>
    </main>
  );
}
