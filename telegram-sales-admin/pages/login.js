import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Eye, EyeOff, Pin, PinOff } from "lucide-react";

import { getApiBaseUrl, getAuthToken, setAuthToken } from "../lib/api";
import Toast from "../components/Toast";

const PROFILE_IMAGE_STORAGE_KEY = "admin_profile_image_url";
const DEFAULT_PROFILE_IMAGE = "https://i.ibb.co/356LrnLr/bot.png";
const LAST_LOGIN_IDENTIFIER_STORAGE_KEY = "admin_last_login_identifier";
const RESET_STEP_USERNAME = "USERNAME";
const RESET_STEP_OTP = "OTP";
const RESET_STEP_PASSWORD = "PASSWORD";
const RESET_CHANNEL_TELEGRAM = "TELEGRAM";
const RESET_CHANNEL_EMAIL = "EMAIL";
const DEFAULT_LOGIN_REQUEST_TTL_SECONDS = 300;

function extractErrorCode(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  return String(payload.error || "").trim().toUpperCase();
}

function formatCountdown(seconds) {
  const total = Math.max(Number(seconds || 0), 0);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function Login() {
  const router = useRouter();
  const loginBackgroundUrl = String(process.env.NEXT_PUBLIC_LOGIN_BG_URL || "").trim();
  const loginPanelBackgroundUrl =
    loginBackgroundUrl
    || "https://i.ibb.co/TDSnWLfw/vecteezy-abstract-background-with-a-3d-pattern-2928673.jpg";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [requestExpiresAt, setRequestExpiresAt] = useState(0);
  const [approvalRemainingSeconds, setApprovalRemainingSeconds] = useState(0);
  const [rememberMe, setRememberMe] = useState(false);
  const [toast, setToast] = useState("");
  const [profileImage, setProfileImage] = useState(DEFAULT_PROFILE_IMAGE);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetStep, setResetStep] = useState(RESET_STEP_USERNAME);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetInfo, setResetInfo] = useState("");
  const [resetUsername, setResetUsername] = useState("");
  const [resetChallengeId, setResetChallengeId] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetChannel, setResetChannel] = useState(RESET_CHANNEL_TELEGRAM);
  const [resetDeliveryHint, setResetDeliveryHint] = useState("");
  const [lastLoginIdentifier, setLastLoginIdentifier] = useState("");

  useEffect(() => {
    document.body.classList.add("login-no-scroll");
    return () => {
      document.body.classList.remove("login-no-scroll");
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
    if (typeof window === "undefined") {
      return;
    }
    const storedImage = window.localStorage.getItem(PROFILE_IMAGE_STORAGE_KEY);
    const storedIdentifier = window.localStorage.getItem(LAST_LOGIN_IDENTIFIER_STORAGE_KEY);
    if (storedImage) {
      setProfileImage(storedImage);
    }
    if (storedIdentifier) {
      const cleanStoredIdentifier = String(storedIdentifier).trim();
      if (cleanStoredIdentifier) {
        setLastLoginIdentifier(cleanStoredIdentifier);
        setUsername((prev) => (String(prev || "").trim() ? prev : cleanStoredIdentifier));
      }
    }
  }, []);

  const persistLastIdentifier = (value) => {
    const cleanValue = String(value || "").trim();
    if (!cleanValue) {
      return;
    }
    setLastLoginIdentifier(cleanValue);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LAST_LOGIN_IDENTIFIER_STORAGE_KEY, cleanValue);
    }
  };

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
          setToast("Bienvenido al panel, acceso concedido.");
          setWaiting(false);
          setRequestId("");
          setRequestExpiresAt(0);
          setApprovalRemainingSeconds(0);
          setTimeout(() => {
            router.replace("/dashboard");
          }, 600);
          return;
        }
        if (data.status === "DENIED") {
          setError("Solicitud rechazada. Intenta de nuevo.");
          setWaiting(false);
          setRequestId("");
          setRequestExpiresAt(0);
          setApprovalRemainingSeconds(0);
          return;
        }
        if (data.status === "EXPIRED") {
          setError("La solicitud expiro. Intenta de nuevo.");
          setWaiting(false);
          setRequestId("");
          setRequestExpiresAt(0);
          setApprovalRemainingSeconds(0);
        }
      } catch (err) {
        setError("No se pudo validar la solicitud.");
        setWaiting(false);
        setRequestId("");
        setRequestExpiresAt(0);
        setApprovalRemainingSeconds(0);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [requestId, router, waiting]);

  useEffect(() => {
    if (!waiting || !requestExpiresAt) {
      return undefined;
    }

    const updateRemaining = () => {
      const remaining = Math.max(
        Math.ceil((requestExpiresAt - Date.now()) / 1000),
        0
      );
      setApprovalRemainingSeconds(remaining);
      if (remaining <= 0) {
        setError("La solicitud expiro. Intenta de nuevo.");
        setWaiting(false);
        setRequestId("");
        setRequestExpiresAt(0);
      }
    };

    updateRemaining();
    const timer = setInterval(updateRemaining, 1000);
    return () => clearInterval(timer);
  }, [requestExpiresAt, waiting]);

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
      persistLastIdentifier(username.trim());
      const expiresInRaw = Number(data?.expires_in || 0);
      const expiresIn = Number.isFinite(expiresInRaw) && expiresInRaw > 0
        ? Math.floor(expiresInRaw)
        : DEFAULT_LOGIN_REQUEST_TTL_SECONDS;
      setWaiting(true);
      setRequestId(data.request_id);
      setRequestExpiresAt(Date.now() + expiresIn * 1000);
      setApprovalRemainingSeconds(expiresIn);
      setToast("📩 Solicitud enviada. Revisa tu Telegram.");
    } catch (err) {
      setError("No se pudo iniciar la solicitud.");
      setToast("❌ No se pudo iniciar la solicitud.");
    }
  };

  const resetFlowState = (usernameValue = "") => {
    setResetStep(RESET_STEP_USERNAME);
    setResetLoading(false);
    setResetError("");
    setResetInfo("");
    setResetUsername(usernameValue);
    setResetChallengeId("");
    setResetCode("");
    setResetToken("");
    setResetNewPassword("");
    setResetConfirmPassword("");
    setResetChannel(RESET_CHANNEL_TELEGRAM);
    setResetDeliveryHint("");
  };

  const handleToggleReset = () => {
    if (resetOpen) {
      setResetOpen(false);
      resetFlowState("");
      return;
    }
    setResetOpen(true);
    resetFlowState(username.trim());
  };

  const handleResetStart = async () => {
    const cleanUsername = resetUsername.trim();
    if (!cleanUsername) {
      setResetError("Ingresa tu usuario o correo.");
      return;
    }
    setResetLoading(true);
    setResetError("");
    setResetInfo("");
    try {
      const response = await fetch(`${getApiBaseUrl()}/admin/auth/password-reset/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: cleanUsername,
          channel: resetChannel,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const code = extractErrorCode(payload);
        if (code === "OTP_START_COOLDOWN") {
          const retryIn = Number(payload.retry_in || 0);
          setResetError(
            `Espera ${Math.max(retryIn, 1)}s antes de solicitar otro codigo.`
          );
        } else if (code === "OTP_START_RATE_LIMIT") {
          const retryIn = Number(payload.retry_in || 0);
          const retryMinutes = Math.max(Math.ceil(retryIn / 60), 1);
          setResetError(
            `Demasiados intentos de recuperacion. Intenta de nuevo en ${retryMinutes} min.`
          );
        } else {
          setResetError("No se pudo iniciar la recuperacion.");
        }
        return;
      }

      persistLastIdentifier(cleanUsername);
      const challengeId = String(payload.challenge_id || "");
      if (!challengeId || payload?.generic === true) {
        setResetStep(RESET_STEP_USERNAME);
        setResetChallengeId("");
        setResetCode("");
        setResetInfo(
          "Si existe una cuenta con ese usuario o correo, te enviaremos un codigo por el canal configurado."
        );
        setToast("Solicitud enviada. Revisa tu canal de recuperacion.");
        return;
      }
      setResetChallengeId(challengeId);
      const responseChannel = String(payload.channel || "").toUpperCase();
      if (responseChannel === RESET_CHANNEL_EMAIL || responseChannel === RESET_CHANNEL_TELEGRAM) {
        setResetChannel(responseChannel);
      }
      const deliveryHint = String(payload.delivery_hint || "");
      setResetDeliveryHint(deliveryHint);
      setResetStep(RESET_STEP_OTP);
      const channelLabel = responseChannel === RESET_CHANNEL_EMAIL ? "correo" : "Telegram";
      setResetInfo(
        `Te enviamos un codigo a tu ${channelLabel}${deliveryHint ? ` (${deliveryHint})` : ""}.`
      );
      setToast(`Codigo de recuperacion enviado a ${channelLabel}.`);
    } catch (err) {
      setResetError("No se pudo iniciar la recuperacion.");
    } finally {
      setResetLoading(false);
    }
  };

  const handleResetVerify = async () => {
    const cleanCode = String(resetCode || "").trim();
    if (!resetChallengeId || !cleanCode) {
      setResetError("Ingresa el codigo de verificacion.");
      return;
    }

    setResetLoading(true);
    setResetError("");
    setResetInfo("");
    try {
      const response = await fetch(`${getApiBaseUrl()}/admin/auth/password-reset/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challenge_id: resetChallengeId,
          code: cleanCode,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const code = extractErrorCode(payload);
        if (code === "OTP_INVALID") {
          const attemptsLeft = Number(payload.attempts_left);
          if (Number.isFinite(attemptsLeft)) {
            setResetError(`Codigo incorrecto. Intentos restantes: ${Math.max(attemptsLeft, 0)}.`);
          } else {
            setResetError("Codigo incorrecto.");
          }
        } else if (code === "OTP_EXPIRED") {
          setResetError("El codigo expiro. Solicita uno nuevo.");
        } else if (code === "OTP_MAX_ATTEMPTS") {
          setResetError("Se alcanzaron los intentos maximos. Solicita otro codigo.");
        } else if (code === "OTP_ALREADY_USED") {
          setResetError("Este codigo ya fue usado. Solicita uno nuevo.");
        } else {
          setResetError("No se pudo validar el codigo.");
        }
        return;
      }

      setResetToken(String(payload.reset_token || ""));
      const responseChannel = String(payload.channel || "").toUpperCase();
      if (responseChannel === RESET_CHANNEL_EMAIL || responseChannel === RESET_CHANNEL_TELEGRAM) {
        setResetChannel(responseChannel);
      }
      setResetStep(RESET_STEP_PASSWORD);
      setResetInfo("Codigo validado. Define tu nueva contrasena.");
      setToast("Codigo verificado correctamente.");
    } catch (err) {
      setResetError("No se pudo validar el codigo.");
    } finally {
      setResetLoading(false);
    }
  };

  const handleResetComplete = async () => {
    if (!resetToken) {
      setResetError("Token de recuperacion invalido. Vuelve a iniciar el proceso.");
      return;
    }
    if (!resetNewPassword || !resetConfirmPassword) {
      setResetError("Ingresa y confirma la nueva contrasena.");
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setResetError("Las contrasenas no coinciden.");
      return;
    }

    setResetLoading(true);
    setResetError("");
    setResetInfo("");
    try {
      const response = await fetch(`${getApiBaseUrl()}/admin/auth/password-reset/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reset_token: resetToken,
          new_password: resetNewPassword,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const code = extractErrorCode(payload);
        if (code === "PASSWORD_TOO_SHORT") {
          setResetError("La contrasena debe tener al menos 8 caracteres.");
        } else if (code === "PASSWORD_NEEDS_UPPER" || code === "PASSWORD_NEEDS_UPPERCASE") {
          setResetError("La contrasena debe incluir al menos una mayuscula.");
        } else if (code === "PASSWORD_NEEDS_LOWER" || code === "PASSWORD_NEEDS_LOWERCASE") {
          setResetError("La contrasena debe incluir al menos una minuscula.");
        } else if (code === "PASSWORD_NEEDS_NUMBER") {
          setResetError("La contrasena debe incluir al menos un numero.");
        } else if (code === "INVALID_RESET_TOKEN") {
          setResetError("El token expiro o no es valido. Reinicia la recuperacion.");
        } else {
          setResetError("No se pudo actualizar la contrasena.");
        }
        return;
      }

      setPassword("");
      setResetOpen(false);
      resetFlowState("");
      setToast("Contrasena actualizada. Ya puedes iniciar sesion.");
    } catch (err) {
      setResetError("No se pudo actualizar la contrasena.");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <>
      <main className="page page-login">
        <section className="login-split-shell">
          <aside
            className="login-split-visual"
            style={{
              "--login-panel-bg": `url("${loginPanelBackgroundUrl}")`,
            }}
          >
            <div className="login-split-visual-inner">
              <img
                src={profileImage}
                alt="Admin icono"
                className="login-split-visual-logo"
              />
              <p className="login-split-eyebrow">Control Panel</p>
              <h1 className="login-split-heading">
                Accede
                <br />
                al panel
                <br />
                administrativo
              </h1>
            </div>
          </aside>

          <section className="login-split-form-panel">
            <div className="login-split-form-head">
              <h2>Bienvenido</h2>
              <p>Ingresa tus credenciales para continuar.</p>
            </div>

            <form
              className="login-form login-form-modern"
              onSubmit={handleSubmit}
              autoComplete="on"
            >
              <label className="login-field">
                <span>Usuario</span>
                <input
                  type="text"
                  name="username"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="Usuario admin"
                  disabled={waiting}
                  required
                />
              </label>

              <label className="login-field">
                <span>Contrasena</span>
                <div className="login-password-field">
                  <input
                    type={showPassword ? "text" : "password"}
                    name="current-password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Contrasena"
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
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>

              <div className="remember-me login-remember-row">
                <button
                  type="button"
                  className={`remember-me__toggle${rememberMe ? " is-active" : ""}`}
                  onClick={() => setRememberMe((prev) => !prev)}
                  disabled={waiting}
                  aria-pressed={rememberMe}
                  aria-label={rememberMe ? "Recordar activado" : "Recordar desactivado"}
                >
                  {rememberMe ? <Pin size={18} /> : <PinOff size={18} />}
                </button>
                <span className="remember-me__text">Recuerdame en este equipo</span>
              </div>

              <button type="submit" className="login-submit" disabled={waiting}>
                {waiting
                  ? `Esperando aprobacion... (${formatCountdown(approvalRemainingSeconds)})`
                  : "Iniciar sesion"}
              </button>
            </form>

            {error ? <p className="error login-inline-error">{error}</p> : null}

            <div className="login-reset login-reset-modern">
              <button
                type="button"
                className="link-button login-reset-toggle"
                onClick={handleToggleReset}
                disabled={waiting || resetLoading}
              >
                {resetOpen ? "Cerrar recuperacion" : "Olvide mi contrasena"}
              </button>

              {resetOpen ? (
                <div className="login-reset-card">
                  <h4>Recuperar acceso</h4>
                  {resetInfo ? <p className="muted login-reset-info">{resetInfo}</p> : null}
                  {resetError ? <p className="error login-reset-error">{resetError}</p> : null}

                  {resetStep === RESET_STEP_USERNAME ? (
                    <div className="login-reset-group">
                      <label htmlFor="reset-username">Usuario o correo</label>
                      <input
                        id="reset-username"
                        type="text"
                        value={resetUsername}
                        onChange={(event) => setResetUsername(event.target.value)}
                        placeholder="USUARIO O CORREO"
                        autoComplete="username"
                        disabled={resetLoading}
                      />
                      {lastLoginIdentifier && !String(resetUsername || "").trim() ? (
                        <button
                          type="button"
                          className="link-button login-reset-last-id"
                          onClick={() => setResetUsername(lastLoginIdentifier)}
                          disabled={resetLoading}
                        >
                          Usar ultimo: {lastLoginIdentifier}
                        </button>
                      ) : null}
                      <div className="login-reset-channel-picker" role="group" aria-label="Canal de recuperacion">
                        <button
                          type="button"
                          className={`login-reset-channel${resetChannel === RESET_CHANNEL_TELEGRAM ? " is-active" : ""}`}
                          onClick={() => setResetChannel(RESET_CHANNEL_TELEGRAM)}
                          disabled={resetLoading}
                        >
                          Telegram
                        </button>
                        <button
                          type="button"
                          className={`login-reset-channel${resetChannel === RESET_CHANNEL_EMAIL ? " is-active" : ""}`}
                          onClick={() => setResetChannel(RESET_CHANNEL_EMAIL)}
                          disabled={resetLoading}
                        >
                          Correo
                        </button>
                      </div>
                      <button
                        type="button"
                        className="login-reset-button"
                        onClick={handleResetStart}
                        disabled={resetLoading}
                      >
                        {resetLoading ? "Enviando..." : "Enviar codigo"}
                      </button>
                    </div>
                  ) : null}

                  {resetStep === RESET_STEP_OTP ? (
                    <div className="login-reset-group">
                      <label htmlFor="reset-otp">
                        Codigo {resetChannel === RESET_CHANNEL_EMAIL ? "correo" : "Telegram"}
                      </label>
                      {resetDeliveryHint ? (
                        <p className="muted login-reset-info">
                          Destino: {resetDeliveryHint}
                        </p>
                      ) : null}
                      <input
                        id="reset-otp"
                        type="text"
                        value={resetCode}
                        onChange={(event) => setResetCode(event.target.value)}
                        placeholder="000000"
                        autoComplete="one-time-code"
                        inputMode="numeric"
                        maxLength={6}
                        disabled={resetLoading}
                      />
                      <div className="login-reset-actions">
                        <button
                          type="button"
                          className="login-reset-button"
                          onClick={handleResetVerify}
                          disabled={resetLoading}
                        >
                          {resetLoading ? "Validando..." : "Validar codigo"}
                        </button>
                        <button
                          type="button"
                          className="login-reset-button login-reset-button--ghost"
                          onClick={handleResetStart}
                          disabled={resetLoading}
                        >
                          Reenviar
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {resetStep === RESET_STEP_PASSWORD ? (
                    <div className="login-reset-group">
                      <label htmlFor="reset-pass">Nueva contrasena</label>
                      <input
                        id="reset-pass"
                        type="password"
                        value={resetNewPassword}
                        onChange={(event) => setResetNewPassword(event.target.value)}
                        placeholder="Min. 8, mayuscula, minuscula y numero"
                        autoComplete="new-password"
                        disabled={resetLoading}
                      />
                      <label htmlFor="reset-pass-confirm">Confirmar contrasena</label>
                      <input
                        id="reset-pass-confirm"
                        type="password"
                        value={resetConfirmPassword}
                        onChange={(event) => setResetConfirmPassword(event.target.value)}
                        placeholder="Repite la nueva contrasena"
                        autoComplete="new-password"
                        disabled={resetLoading}
                      />
                      <button
                        type="button"
                        className="login-reset-button"
                        onClick={handleResetComplete}
                        disabled={resetLoading}
                      >
                        {resetLoading ? "Guardando..." : "Cambiar contrasena"}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>
        </section>
      </main>
      <Toast message={toast} />
    </>
  );
}
