import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";

import { apiFetch, apiFetchBinary, getAuthToken } from "../lib/api";
import Toast from "../components/Toast";

function getApiErrorCode(error) {
  if (!error || typeof error !== "object") {
    return "";
  }
  return String(error?.payload?.error || "").trim().toUpperCase();
}

export default function RecoveryProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [telegramId, setTelegramId] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [backupInfo, setBackupInfo] = useState(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupRunning, setBackupRunning] = useState(false);
  const [restoreRunning, setRestoreRunning] = useState(false);
  const [backupStatus, setBackupStatus] = useState("");
  const [backupError, setBackupError] = useState("");
  const [restoreFile, setRestoreFile] = useState(null);
  const [restoreConfirm, setRestoreConfirm] = useState("");
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState("");
  const [restoreError, setRestoreError] = useState("");
  const [restoreDropActive, setRestoreDropActive] = useState(false);
  const restoreInputRef = useRef(null);

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }
    const timer = setTimeout(() => setToast(""), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/admin/auth/recovery-profile");
      setProfile(data || null);
      setTelegramId(data?.telegram_id ? String(data.telegram_id) : "");
      setRecoveryEmail(data?.recovery_email || "");
    } catch (err) {
      setError("No se pudo cargar la configuracion de recuperacion.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBackupStatus = useCallback(async () => {
    try {
      const data = await apiFetch("/admin/ops/backup/latest");
      setBackupInfo(data?.latest || null);
      setBackupRunning(Boolean(data?.running));
      setRestoreRunning(Boolean(data?.restore_running));
      setBackupError("");
    } catch (_error) {
      setBackupRunning(false);
      setRestoreRunning(false);
      setBackupError("No se pudo cargar el estado del backup.");
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    loadBackupStatus();
  }, [loadBackupStatus]);

  const handleSave = async () => {
    if (saving) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        telegram_id: telegramId.trim() || null,
        recovery_email: recoveryEmail.trim() || null,
      };
      const data = await apiFetch("/admin/auth/recovery-profile", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setProfile(data || null);
      setTelegramId(data?.telegram_id ? String(data.telegram_id) : "");
      setRecoveryEmail(data?.recovery_email || "");
      setToast("Canales de recuperacion actualizados.");
    } catch (err) {
      const code = getApiErrorCode(err);
      if (code === "INVALID_TELEGRAM_ID") {
        setError("Telegram ID invalido. Usa solo numeros (5 a 20 digitos).");
      } else if (code === "INVALID_RECOVERY_EMAIL") {
        setError("Correo de recuperacion invalido.");
      } else if (code === "ADMIN_NOT_FOUND") {
        setError("No se encontro la cuenta admin.");
      } else {
        setError("No se pudo guardar la configuracion.");
      }
    } finally {
      setSaving(false);
    }
  };

  const formatBackupDate = (value) => {
    if (!value) {
      return "-";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "-";
    }
    return date.toLocaleString("es-CO", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatBackupSize = (bytes) => {
    const numeric = Number(bytes || 0);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return "-";
    }
    const units = ["B", "KB", "MB", "GB"];
    let value = numeric;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
    return `${value.toFixed(digits)} ${units[unitIndex]}`;
  };

  const handleRunBackupNow = async () => {
    if (backupLoading || restoreLoading) {
      return;
    }
    if (backupRunning) {
      setBackupStatus("Ya hay un backup en curso.");
      return;
    }
    if (restoreRunning) {
      setBackupError("Hay una restauracion en curso. Espera a que termine.");
      return;
    }
    setBackupLoading(true);
    setBackupError("");
    setBackupStatus("Generando backup...");
    try {
      const data = await apiFetch("/admin/ops/backup/run", {
        method: "POST",
      });
      if (data?.backup) {
        setBackupInfo(data.backup);
      }
      const telegram = data?.backup?.telegram;
      const drive = data?.backup?.drive;
      if (telegram?.uploaded && telegram?.fallback_used) {
        const rawError = telegram?.failed?.[0]?.error || "";
        const cleaned = String(rawError)
          .replace(/^TELEGRAM_SEND_FAILED:\s*/i, "")
          .trim();
        if (cleaned) {
          setBackupStatus(
            `Grupo fallo (${cleaned}), pero se envio al admin de respaldo.`
          );
        } else {
          setBackupStatus("Grupo fallo, pero se envio al admin de respaldo.");
        }
      } else if (telegram?.uploaded && telegram?.partial) {
        const rawError = telegram?.failed?.[0]?.error || "";
        const cleaned = String(rawError)
          .replace(/^TELEGRAM_SEND_FAILED:\s*/i, "")
          .trim();
        if (cleaned) {
          setBackupStatus(
            `Backup enviado por Telegram (parcial). Un chat fallo: ${cleaned}`
          );
        } else {
          setBackupStatus("Backup enviado por Telegram (parcial).");
        }
      } else if (telegram?.uploaded) {
        setBackupStatus("Backup generado y enviado por Telegram.");
      } else if (telegram && telegram?.uploaded === false) {
        const rawError = telegram?.error || telegram?.failed?.[0]?.error || "";
        const cleaned = String(rawError)
          .replace(/^TELEGRAM_SEND_FAILED:\s*/i, "")
          .trim();
        if (cleaned) {
          setBackupStatus(`Backup generado, pero Telegram fallo: ${cleaned}`);
        } else {
          setBackupStatus("Backup generado, pero el envio por Telegram fallo.");
        }
      } else if (drive?.uploaded) {
        setBackupStatus("Backup generado y subido a Google Drive.");
      } else if (drive && drive?.uploaded === false) {
        setBackupStatus("Backup generado, pero la subida a Drive fallo.");
      } else {
        setBackupStatus("Backup generado correctamente.");
      }
    } catch (err) {
      const code = getApiErrorCode(err);
      if (code === "BACKUP_COOLDOWN") {
        const retryIn = Number(err?.payload?.retry_in || 0);
        setBackupError(`Espera ${Math.max(retryIn, 1)}s antes de ejecutar otro backup.`);
      } else if (code === "RESTORE_IN_PROGRESS") {
        setBackupError("Hay una restauracion en curso. Espera a que termine.");
      } else {
        setBackupError("No se pudo generar el backup.");
      }
      setBackupStatus("");
    } finally {
      setBackupLoading(false);
      await loadBackupStatus();
    }
  };

  const handleDownloadLatestBackup = async () => {
    try {
      setBackupError("");
      const { buffer } = await apiFetchBinary("/admin/ops/backup/latest/download");
      const blob = new Blob([buffer], { type: "application/gzip" });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = backupInfo?.filename || "backup.sql.gz";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (_error) {
      setBackupError("No se pudo descargar el ultimo backup.");
    }
  };

  const selectRestoreFile = useCallback((file) => {
    if (!file) {
      return;
    }
    const filename = String(file.name || "").trim();
    if (!filename.toLowerCase().endsWith(".sql.gz")) {
      setRestoreFile(null);
      setRestoreError("Archivo invalido. Debe terminar en .sql.gz");
      setRestoreStatus("");
      return;
    }
    setRestoreFile(file);
    setRestoreError("");
    setRestoreStatus("");
  }, []);

  const handleRestoreFileChange = (event) => {
    const file = event.target?.files?.[0] || null;
    selectRestoreFile(file);
    event.target.value = "";
  };

  const openRestoreFileDialog = () => {
    if (restoreLoading) {
      return;
    }
    restoreInputRef.current?.click();
  };

  const handleRestoreDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setRestoreDropActive(false);
    if (restoreLoading) {
      return;
    }
    const file = event.dataTransfer?.files?.[0] || null;
    selectRestoreFile(file);
  };

  const handleRunRestore = async () => {
    if (restoreLoading || backupLoading) {
      return;
    }
    if (restoreRunning) {
      setRestoreError("Ya hay una restauracion en curso.");
      return;
    }
    if (backupRunning) {
      setRestoreError("Hay un backup en curso. Espera a que termine.");
      return;
    }
    if (!restoreFile) {
      setRestoreError("Selecciona un archivo .sql.gz para restaurar.");
      return;
    }
    const confirmValue = restoreConfirm.trim().toUpperCase();
    if (confirmValue !== "REEMPLAZAR") {
      setRestoreError('Debes escribir "REEMPLAZAR" para confirmar.');
      return;
    }

    setRestoreLoading(true);
    setRestoreError("");
    setRestoreStatus("Restaurando base de datos...");
    setBackupError("");
    setBackupStatus("");
    try {
      const query = new URLSearchParams({
        confirm: confirmValue,
        filename: restoreFile.name,
      });
      const data = await apiFetch(`/admin/ops/backup/restore?${query.toString()}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
        },
        body: restoreFile,
      });
      const preBackupPath = String(data?.restore?.pre_backup_path || "").trim();
      if (preBackupPath) {
        setRestoreStatus(`Restauracion completada. Pre-backup: ${preBackupPath}`);
      } else {
        setRestoreStatus("Restauracion completada correctamente.");
      }
      setRestoreFile(null);
      setRestoreConfirm("");
    } catch (err) {
      const code = getApiErrorCode(err);
      if (code === "INVALID_RESTORE_CONFIRM") {
        setRestoreError('Confirmacion invalida. Debes usar "REEMPLAZAR".');
      } else if (code === "BACKUP_RESTORE_INVALID_FILENAME") {
        setRestoreError("Nombre de archivo invalido. Debe terminar en .sql.gz");
      } else if (code === "BACKUP_RESTORE_FILE_REQUIRED") {
        setRestoreError("Debes subir un archivo para restaurar.");
      } else if (code === "BACKUP_RESTORE_TOO_LARGE") {
        const maxMb = Number(err?.payload?.max_mb || 0);
        setRestoreError(
          maxMb > 0
            ? `Archivo demasiado grande. Maximo permitido: ${maxMb} MB.`
            : "Archivo demasiado grande para restaurar."
        );
      } else if (code === "RESTORE_IN_PROGRESS") {
        setRestoreError("Ya hay una restauracion en curso.");
      } else if (code === "BACKUP_IN_PROGRESS") {
        setRestoreError("Hay un backup en curso. Espera e intenta de nuevo.");
      } else if (err?.status === 413) {
        setRestoreError("Archivo demasiado grande para restaurar.");
      } else {
        setRestoreError("No se pudo restaurar la base de datos.");
      }
      setRestoreStatus("");
    } finally {
      setRestoreLoading(false);
      await loadBackupStatus();
    }
  };

  return (
    <>
      <main className="page recovery-profile-page">
        <section className="card recovery-profile-card">
          <div className="inventory-header">
            <h1>Recuperacion de cuenta</h1>
          </div>

          {error ? <p className="error">{error}</p> : null}
          {loading ? <p className="muted">Cargando configuracion...</p> : null}

          {!loading ? (
            <>
              <div className="recovery-profile-meta">
                <p>
                  <strong>Usuario:</strong> {profile?.username || "-"}
                </p>
                <p>
                  <strong>Canal Telegram:</strong>{" "}
                  {profile?.channels?.telegram ? "Activo" : "No configurado"}
                </p>
                <p>
                  <strong>Canal Correo:</strong>{" "}
                  {profile?.channels?.email ? "Activo" : "No configurado"}
                </p>
                <p>
                  <strong>Correo enmascarado:</strong> {profile?.recovery_email_masked || "-"}
                </p>
              </div>

              <div className="form recovery-profile-form">
                <label>
                  Telegram ID de recuperacion
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Ej: 7621162350"
                    value={telegramId}
                    onChange={(event) =>
                      setTelegramId(event.target.value.replace(/\D/g, "").slice(0, 20))
                    }
                    disabled={saving}
                  />
                </label>

                <label>
                  Correo de recuperacion
                  <input
                    type="email"
                    placeholder="admin@dominio.com"
                    value={recoveryEmail}
                    onChange={(event) => setRecoveryEmail(event.target.value)}
                    disabled={saving}
                  />
                </label>
              </div>

              <div className="actions recovery-profile-actions">
                <button type="button" onClick={handleSave} disabled={saving}>
                  {saving ? "Guardando..." : "Guardar cambios"}
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={loadProfile}
                  disabled={saving}
                >
                  Recargar
                </button>
              </div>
            </>
          ) : null}
        </section>
        <section className="dashboard-backup-panel">
          <h3 className="dashboard-backup-title">Respaldo de base de datos</h3>
          <p className="dashboard-backup-subtitle">
            Genera un backup manual inmediato sin esperar el cron programado.
          </p>
          <div className="dashboard-backup-meta">
            <span>
              Ultimo backup: <b>{backupInfo?.filename || "-"}</b>
            </span>
            <span>
              Fecha: <b>{formatBackupDate(backupInfo?.created_at)}</b>
            </span>
            <span>
              Tamano: <b>{formatBackupSize(backupInfo?.size_bytes)}</b>
            </span>
          </div>
          <div className="dashboard-backup-actions">
            <button
              type="button"
              onClick={handleRunBackupNow}
              disabled={backupLoading || backupRunning || restoreLoading || restoreRunning}
            >
              {backupLoading || backupRunning ? "Generando..." : "Generar backup ahora"}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={handleDownloadLatestBackup}
              disabled={!backupInfo?.filename || backupLoading || restoreLoading}
            >
              Descargar ultimo
            </button>
            <button
              type="button"
              className="ghost"
              onClick={loadBackupStatus}
              disabled={backupLoading || restoreLoading}
            >
              Recargar estado
            </button>
          </div>
          <div className="dashboard-backup-restore">
            <h4 className="dashboard-backup-restore-title">Restaurar desde archivo</h4>
            <p className="dashboard-backup-restore-subtitle">
              Sube un archivo .sql.gz para reemplazar la base actual.
            </p>
            <input
              ref={restoreInputRef}
              type="file"
              accept=".sql.gz,application/gzip"
              className="dashboard-backup-file-input"
              onChange={handleRestoreFileChange}
              disabled={restoreLoading}
            />
            <div
              className={[
                "dashboard-backup-dropzone",
                restoreDropActive ? "is-active" : "",
                restoreLoading ? "is-disabled" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={openRestoreFileDialog}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openRestoreFileDialog();
                }
              }}
              onDrop={handleRestoreDrop}
              onDragOver={(event) => {
                event.preventDefault();
                if (!restoreLoading) {
                  setRestoreDropActive(true);
                }
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setRestoreDropActive(false);
              }}
              role="button"
              tabIndex={0}
            >
              {restoreFile ? (
                <p>
                  Archivo listo: <b>{restoreFile.name}</b>
                </p>
              ) : (
                <p>Arrastra el backup aqui o haz clic para seleccionar.</p>
              )}
            </div>
            <div className="dashboard-backup-restore-actions">
              <label>
                Confirma escribiendo REEMPLAZAR
                <input
                  type="text"
                  value={restoreConfirm}
                  onChange={(event) => setRestoreConfirm(event.target.value)}
                  placeholder="REEMPLAZAR"
                  disabled={restoreLoading}
                />
              </label>
              <button
                type="button"
                onClick={handleRunRestore}
                disabled={
                  restoreLoading ||
                  backupLoading ||
                  backupRunning ||
                  restoreRunning ||
                  !restoreFile ||
                  restoreConfirm.trim().toUpperCase() !== "REEMPLAZAR"
                }
              >
                {restoreLoading ? "Restaurando..." : "Restaurar backup"}
              </button>
            </div>
          </div>
          {backupStatus ? <p className="muted">{backupStatus}</p> : null}
          {backupError ? <p className="error">{backupError}</p> : null}
          {backupRunning && !backupLoading ? (
            <p className="muted">Backup en curso...</p>
          ) : null}
          {restoreStatus ? <p className="muted">{restoreStatus}</p> : null}
          {restoreError ? <p className="error">{restoreError}</p> : null}
          {restoreRunning && !restoreLoading ? (
            <p className="muted">Restauracion en curso...</p>
          ) : null}
        </section>
      </main>
      <Toast message={toast} />
    </>
  );
}
