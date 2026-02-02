import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { ArrowLeft, Download } from "lucide-react";

import { apiFetch, apiFetchBinary, getAuthToken } from "../../lib/api";
import { IconAffiliates } from "../../components/PanelIcons";

const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "PENDING", label: "PENDIENTE" },
  { value: "APPROVED", label: "APROBADO" },
  { value: "REJECTED", label: "RECHAZADO" },
];

export default function AffiliatesPage() {
  const botUsername =
    (process.env.NEXT_PUBLIC_BOT_USERNAME || "").replace(/^@/, "") || "tu_bot";
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedAffiliateIds, setSelectedAffiliateIds] = useState([]);
  const [details, setDetails] = useState({});
  const [detailLoading, setDetailLoading] = useState({});
  const [detailErrors, setDetailErrors] = useState({});
  const [detailMessages, setDetailMessages] = useState({});
  const [globalCommissionRate, setGlobalCommissionRate] = useState("");
  const [globalCommissionMessage, setGlobalCommissionMessage] = useState("");
  const [globalCommissionError, setGlobalCommissionError] = useState("");
  const [globalCommissionSaving, setGlobalCommissionSaving] = useState(false);
  const [globalCommissionDuration, setGlobalCommissionDuration] = useState("60");
  const [globalCommissionUnit, setGlobalCommissionUnit] = useState("minutes");
  const [globalCommissionEndsAt, setGlobalCommissionEndsAt] = useState(null);
  const [globalCommissionRemaining, setGlobalCommissionRemaining] = useState("-");
  const [photoUrls, setPhotoUrls] = useState({});
  const [isCommissionOpen, setIsCommissionOpen] = useState(true);
  const [toast, setToast] = useState("");
  const [adjustmentAmountById, setAdjustmentAmountById] = useState({});
  const [adjustmentReasonById, setAdjustmentReasonById] = useState({});
  const [adjustmentStatusById, setAdjustmentStatusById] = useState({});
  const [adjustmentErrorById, setAdjustmentErrorById] = useState({});
  const [invoiceStatusById, setInvoiceStatusById] = useState({});
  const [invoiceErrorById, setInvoiceErrorById] = useState({});
  const [invoiceWatchById, setInvoiceWatchById] = useState({});
  const [deleteOpenById, setDeleteOpenById] = useState({});
  const hasPending = items.some((item) => item.status === "PENDING");
  const invoiceWatchRef = useRef({});
  const detailRefs = useRef({});

  const formatRatePercent = (rate) => {
    const numeric = Number(rate);
    if (!Number.isFinite(numeric)) {
      return "-";
    }
    return `${(numeric * 100).toFixed(2)}%`;
  };

  const formatMoney = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "-";
    }
    return `$${numeric.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  };

  const formatUsdAmount = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "-";
    }
    const formatted = numeric.toLocaleString("en-US", {
      minimumFractionDigits: Number.isInteger(numeric) ? 0 : 2,
      maximumFractionDigits: 2,
    });
    return `$${formatted} USD`;
  };

  const formatAffiliateNumber = (value) => {
    if (!value) {
      return null;
    }
    return String(value).padStart(5, "0");
  };

  const formatDate = (value) => {
    if (!value) {
      return "-";
    }
    return new Date(value).toLocaleDateString();
  };

  const formatCommissionAmount = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "-";
    }
    const rounded = Number.isInteger(numeric)
      ? numeric.toFixed(0)
      : numeric.toFixed(2);
    return `$${rounded} USD`;
  };

  const formatCommissionStatus = (value) => {
    const status = String(value || "").toUpperCase();
    if (status === "EARNED") return "GANADA";
    if (status === "RESERVED") return "RESERVADA";
    if (status === "PAID_OUT") return "PAGADA";
    if (status === "CANCELLED") return "CANCELADA";
    if (status === "REFUNDED") return "REEMBOLSADA";
    return status || "-";
  };

  const formatAdjustmentStatus = (value) => {
    const status = String(value || "").toUpperCase();
    if (status === "EARNED") return "PENDIENTE";
    if (status === "RESERVED") return "RESERVADA";
    if (status === "PAID_OUT") return "PAGADA";
    if (status === "CANCELLED") return "CANCELADA";
    return status || "-";
  };

  const formatInvoiceStatus = (value) => {
    const status = String(value || "").toUpperCase();
    if (status === "PENDING") return "PENDIENTE";
    if (status === "PAID") return "PAGADA";
    if (status === "CANCELLED") return "CANCELADA";
    if (status === "EXPIRED") return "VENCIDA";
    return status || "-";
  };

  const formatApiError = (value, fallback) => {
    const code = String(value || "").toUpperCase();
    if (code === "INVALID_REQUEST") return "Solicitud inválida.";
    if (code === "AFFILIATE_REQUIRED") return "Afiliado requerido.";
    if (code === "AFFILIATE_NOT_FOUND") return "Afiliado no encontrado.";
    if (code === "INVALID_AMOUNT") return "Monto inválido.";
    if (code === "INSUFFICIENT_BALANCE") return "Saldo insuficiente.";
    if (code === "DEBT_PENDING") return "Tienes una deuda pendiente.";
    if (code === "INVOICE_EXPIRED") return "La factura expiró.";
    return fallback;
  };

  const getLevelBaseRate = (levelLabel) => {
    if (levelLabel.includes("Novato")) return 5;
    if (levelLabel.includes("Bronce")) return 8;
    if (levelLabel.includes("Plata")) return 12;
    if (levelLabel.includes("Oro")) return 15;
    if (levelLabel.includes("Diamante")) return 20;
    if (levelLabel.includes("Élite")) return 30;
    return 0;
  };

  const formatApprovedAt = (value) => {
    if (!value) {
      return "-";
    }
    return new Date(value).toLocaleString();
  };

  const getDaysSince = (value) => {
    if (!value) {
      return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    const start = new Date(parsed);
    start.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((today - start) / (24 * 60 * 60 * 1000));
    return Math.max(diffDays, 0);
  };

  const getAffiliateLevel = (salesTotal, earningsTotal, lastSaleAt) => {
    let baseIndex = 0;
    if (salesTotal >= 100 && earningsTotal >= 600) baseIndex = 5;
    else if (salesTotal >= 70 && earningsTotal >= 500) baseIndex = 4;
    else if (salesTotal >= 40 && earningsTotal >= 200) baseIndex = 3;
    else if (salesTotal >= 20 && earningsTotal >= 50) baseIndex = 2;
    else if (salesTotal >= 2 && earningsTotal >= 5) baseIndex = 1;

    let downgradeSteps = 0;
    if (lastSaleAt) {
      const lastSaleTime = new Date(lastSaleAt).getTime();
      const daysSince = Math.max(
        Math.floor((Date.now() - lastSaleTime) / (24 * 60 * 60 * 1000)),
        0
      );
      if (daysSince >= 30) {
        downgradeSteps = Math.floor(daysSince / 30);
      }
    }
    const finalIndex = Math.max(0, baseIndex - downgradeSteps);
    const labels = [
      "Novato 🎖️",
      "Bronce 🥉",
      "Plata 🥈",
      "Oro 🥇",
      "Diamante 💎",
      "Élite 👑",
    ];
    return labels[finalIndex];
  };

  const getLevelMinWithdraw = (levelLabel) => {
    if (levelLabel.includes("Novato")) return 25;
    if (levelLabel.includes("Bronce")) return 20;
    if (levelLabel.includes("Plata")) return 15;
    if (levelLabel.includes("Oro")) return 10;
    if (levelLabel.includes("Diamante")) return 0;
    if (levelLabel.includes("Élite")) return 0;
    return 0;
  };

  const getSalesRankLabel = (rank) => {
    const numeric = Number(rank);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return "🎖️ Novato -";
    }
    if (numeric === 1) return "🥇 Oro #1";
    if (numeric === 2) return "🥈 Plata #2";
    if (numeric === 3) return "🥉 Bronce #3";
    return `🎖️ Novato #${numeric}`;
  };

  const loadAffiliatePhoto = async (telegramId) => {
    if (!telegramId || photoUrls[telegramId]) {
      return;
    }
    try {
      const { buffer, contentType } = await apiFetchBinary(
        `/admin/users/${telegramId}/photo`
      );
      const blob = new Blob([buffer], { type: contentType });
      const url = URL.createObjectURL(blob);
      setPhotoUrls((prev) => ({ ...prev, [telegramId]: url }));
    } catch (err) {
      // ignore missing photos
    }
  };

  const getInitials = (username, telegramId) => {
    const base = (username || "").replace(/^@/, "").trim();
    if (base) {
      return base.slice(0, 2).toUpperCase();
    }
    return String(telegramId || "--").slice(-2);
  };

  const toDecimalRate = (value) => {
    if (value === "" || value === null || value === undefined) {
      return null;
    }
    const cleaned = String(value).replace(",", ".").trim();
    if (cleaned === "") {
      return null;
    }
    const numeric = Number(cleaned);
    if (!Number.isFinite(numeric) || numeric < 0) {
      return null;
    }
    return numeric > 1 ? numeric / 100 : numeric;
  };

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    const loadGlobalCommission = async () => {
      try {
        const data = await apiFetch("/admin/affiliates/commission-rate");
        if (data && data.rate_percent != null) {
          setGlobalCommissionRate(String(data.rate_percent));
        }
        setGlobalCommissionEndsAt(data?.boost_ends_at || null);
      } catch (err) {
        setGlobalCommissionError("No se pudo cargar la comisión global.");
      }
    };
    loadGlobalCommission();
  }, []);

  useEffect(() => {
    const markAffiliatesSeen = async () => {
      try {
        const summary = await apiFetch("/admin/summary");
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(
            "admin_seen_affiliates_count",
            String(summary.pending_affiliates || 0)
          );
        }
      } catch (err) {
        // ignore summary errors
      }
    };
    markAffiliatesSeen();
  }, []);

  const loadAffiliates = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: "20",
      });
      if (status) {
        params.set("status", status);
      }

      const data = await apiFetch(`/admin/affiliates?${params.toString()}`);
      setItems(data.items || []);
      setTotalPages(data.total_pages || 1);
      setError("");
    } catch (err) {
      setError("No se pudo cargar afiliados.");
    }
  }, [page, status]);

  useEffect(() => {
    loadAffiliates();
    const interval = setInterval(loadAffiliates, 20000);
    return () => clearInterval(interval);
  }, [loadAffiliates]);

  useEffect(() => {
    items.forEach((affiliate) => {
      loadAffiliatePhoto(affiliate.telegram_id);
    });
  }, [items]);


  const handleStatusChange = (event) => {
    setStatus(event.target.value);
    setPage(1);
  };

  const handleToggleLock = async (affiliate) => {
    const nextStatus = affiliate.status === "APPROVED" ? "REJECTED" : "APPROVED";
    try {
      await apiFetch(`/admin/affiliates/${affiliate.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      setItems((prev) =>
        prev.map((item) =>
          item.id === affiliate.id ? { ...item, status: nextStatus } : item
        )
      );
      setDetails((prev) => {
        if (!prev[affiliate.id]) {
          return prev;
        }
        return {
          ...prev,
          [affiliate.id]: {
            ...prev[affiliate.id],
            affiliate: {
              ...prev[affiliate.id].affiliate,
              status: nextStatus,
            },
          },
        };
      });
      setToast(
        nextStatus === "APPROVED"
          ? "Afiliado activado."
          : "Afiliado bloqueado."
      );
    } catch (err) {
      const detail = err?.payload?.error || "No se pudo actualizar el estado del afiliado.";
      setToast(detail);
      setError("No se pudo actualizar el estado del afiliado.");
    }
  };

  const handleAdjustment = async (affiliateId, direction) => {
    const amountRaw = adjustmentAmountById[affiliateId];
    const amountValue = Number(amountRaw);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setAdjustmentErrorById((prev) => ({
        ...prev,
        [affiliateId]: "Ingresa un monto válido.",
      }));
      return;
    }
    const reason = String(adjustmentReasonById[affiliateId] || "").trim();

    const amount = direction === "subtract" ? -Math.abs(amountValue) : amountValue;
    setAdjustmentStatusById((prev) => ({ ...prev, [affiliateId]: "saving" }));
    setAdjustmentErrorById((prev) => ({ ...prev, [affiliateId]: "" }));
    try {
      await apiFetch(`/admin/affiliates/${affiliateId}/adjustments`, {
        method: "POST",
        body: JSON.stringify({ amount, reason }),
      });
      setAdjustmentAmountById((prev) => ({ ...prev, [affiliateId]: "" }));
      setAdjustmentReasonById((prev) => ({ ...prev, [affiliateId]: "" }));
      await loadDetail(affiliateId);
      setToast(direction === "subtract" ? "Saldo descontado." : "Saldo agregado.");
    } catch (err) {
      const detail = formatApiError(
        err?.payload?.error,
        "No se pudo ajustar el saldo del afiliado."
      );
      setAdjustmentErrorById((prev) => ({ ...prev, [affiliateId]: detail }));
    } finally {
      setAdjustmentStatusById((prev) => ({ ...prev, [affiliateId]: "" }));
    }
  };

  const handleInvoiceSend = async (affiliateId) => {
    const amountRaw = adjustmentAmountById[affiliateId];
    const reason = String(adjustmentReasonById[affiliateId] || "").trim();
    const amountValue = Number(amountRaw);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setInvoiceErrorById((prev) => ({
        ...prev,
        [affiliateId]: "Ingresa un monto válido.",
      }));
      return;
    }
    setInvoiceStatusById((prev) => ({ ...prev, [affiliateId]: "sending" }));
    setInvoiceErrorById((prev) => ({ ...prev, [affiliateId]: "" }));
    try {
      await apiFetch(`/admin/affiliates/${affiliateId}/invoices`, {
        method: "POST",
        body: JSON.stringify({ amount: amountValue, reason }),
      });
      setAdjustmentAmountById((prev) => ({ ...prev, [affiliateId]: "" }));
      setAdjustmentReasonById((prev) => ({ ...prev, [affiliateId]: "" }));
      await loadDetail(affiliateId);
      await loadAffiliates();
      setToast("Factura enviada.");
    } catch (err) {
      const detail = formatApiError(
        err?.payload?.error,
        "No se pudo enviar la factura."
      );
      setInvoiceErrorById((prev) => ({ ...prev, [affiliateId]: detail }));
    } finally {
      setInvoiceStatusById((prev) => ({ ...prev, [affiliateId]: "" }));
    }
  };

  const handleDeleteAffiliate = async (affiliateId) => {
    const confirmed = window.confirm(
      "¿Eliminar este afiliado y borrar todo su registro?"
    );
    if (!confirmed) {
      return;
    }
    try {
      await apiFetch(`/admin/affiliates/${affiliateId}`, { method: "DELETE" });
      setItems((prev) => prev.filter((item) => item.id !== affiliateId));
      setDetails((prev) => {
        const next = { ...prev };
        delete next[affiliateId];
        return next;
      });
      setSelectedAffiliateIds((prev) => prev.filter((id) => id !== affiliateId));
      setToast("Afiliado eliminado.");
    } catch (err) {
      setToast("No se pudo eliminar el afiliado.");
    }
  };

  const toggleDeleteAffiliate = (affiliateId) => {
    setDeleteOpenById((prev) => ({
      ...prev,
      [affiliateId]: !prev[affiliateId],
    }));
  };

  const handleDownloadAffiliate = async (affiliateId) => {
    if (typeof window === "undefined") {
      setToast("No se pudo generar la imagen.");
      return;
    }
    const node = detailRefs.current[affiliateId];
    if (!node) {
      setToast("No se pudo generar la imagen.");
      return;
    }
    try {
      const { default: html2canvas } = await import("html2canvas");
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
      const canvas = await html2canvas(node, {
        backgroundColor: "#2b2b2b",
        scale: 2,
        useCORS: true,
        ignoreElements: (target) => {
          if (!(target instanceof HTMLElement)) {
            return false;
          }
          return target.dataset.noExport === "true";
        },
      });
      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `afiliado-${affiliateId}.png`;
      link.click();
    } catch (err) {
      console.error("Download affiliate image failed", err);
      setToast("No se pudo generar la imagen. Revisa la consola del navegador.");
    }
  };

  const handleCopy = async (label, value) => {
    try {
      await navigator.clipboard.writeText(String(value ?? ""));
      setToast(`${label} copiado.`);
    } catch (err) {
      setToast(`No se pudo copiar ${label}.`);
    }
  };

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const removeDetail = useCallback((affiliateId) => {
    setDetails((prev) => {
      const next = { ...prev };
      delete next[affiliateId];
      return next;
    });
    setDetailErrors((prev) => {
      const next = { ...prev };
      delete next[affiliateId];
      return next;
    });
    setDetailMessages((prev) => {
      const next = { ...prev };
      delete next[affiliateId];
      return next;
    });
    setDeleteOpenById((prev) => {
      const next = { ...prev };
      delete next[affiliateId];
      return next;
    });
  }, []);

  const loadDetail = useCallback(async (affiliateId) => {
    if (!affiliateId) {
      return;
    }
    setDetailLoading((prev) => ({ ...prev, [affiliateId]: true }));
    setDetailErrors((prev) => ({ ...prev, [affiliateId]: "" }));
    try {
      const data = await apiFetch(`/admin/affiliates/${affiliateId}`);
      if (!data || typeof data !== "object") {
        return;
      }
      setDetails((prev) => ({ ...prev, [affiliateId]: data }));
    } catch (err) {
      setDetailErrors((prev) => ({
        ...prev,
        [affiliateId]: "No se pudo cargar el afiliado.",
      }));
    } finally {
      setDetailLoading((prev) => ({ ...prev, [affiliateId]: false }));
    }
  }, []);

  const handleViewAffiliate = async (affiliateId) => {
    if (!affiliateId) {
      return;
    }
    setSelectedAffiliateIds((prev) => {
      if (prev.includes(affiliateId)) {
        removeDetail(affiliateId);
        return prev.filter((id) => id !== affiliateId);
      }
      const next = [affiliateId, ...prev.filter((id) => id !== affiliateId)];
      if (next.length > 3) {
        const removed = next.pop();
        if (removed) {
          removeDetail(removed);
        }
      }
      return next;
    });
    await loadDetail(affiliateId);
  };

  useEffect(() => {
    selectedAffiliateIds.forEach((affiliateId) => {
      if (!details[affiliateId] && !detailLoading[affiliateId]) {
        loadDetail(affiliateId);
      }
    });
  }, [detailLoading, details, loadDetail, selectedAffiliateIds]);

  const startInvoiceWatch = useCallback(
    (affiliateId, since) => {
      if (invoiceWatchRef.current[affiliateId]?.active) {
        return;
      }
      setInvoiceWatchById((prev) => ({ ...prev, [affiliateId]: true }));
      invoiceWatchRef.current[affiliateId] = {
        active: true,
        since,
      };
      const run = async () => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        while (invoiceWatchRef.current[affiliateId]?.active) {
          try {
            const params = new URLSearchParams({
              since: String(invoiceWatchRef.current[affiliateId]?.since || 0),
            });
            const data = await apiFetch(
              `/admin/affiliates/${affiliateId}/invoices/watch?${params.toString()}`
            );
            if (data?.changed && data?.invoice) {
              const changedAt = new Date(
                data.invoice.paid_at
                  || data.invoice.cancelled_at
                  || data.invoice.expired_at
                  || data.invoice.created_at
                  || Date.now()
              ).getTime();
              const nextSince = Number.isFinite(changedAt)
                ? changedAt + 1
                : Date.now();
              invoiceWatchRef.current[affiliateId].since = nextSince;
              await loadDetail(affiliateId);
              await loadAffiliates();
              invoiceWatchRef.current[affiliateId].active = false;
              setInvoiceWatchById((prev) => ({ ...prev, [affiliateId]: false }));
              break;
            }
            await sleep(2000);
          } catch (err) {
            if (err && err.message === "UNAUTHORIZED") {
              invoiceWatchRef.current[affiliateId].active = false;
              setInvoiceWatchById((prev) => ({ ...prev, [affiliateId]: false }));
              break;
            }
            await sleep(2000);
          }
        }
      };
      run();
    },
    [loadAffiliates, loadDetail]
  );

  const stopInvoiceWatch = useCallback((affiliateId) => {
    if (invoiceWatchRef.current[affiliateId]) {
      invoiceWatchRef.current[affiliateId].active = false;
      delete invoiceWatchRef.current[affiliateId];
    }
    setInvoiceWatchById((prev) => ({ ...prev, [affiliateId]: false }));
  }, []);

  useEffect(() => {
    selectedAffiliateIds.forEach((affiliateId) => {
      const detail = details[affiliateId];
      if (!detail) {
        return;
      }
      const invoices = detail.invoices || [];
      const hasPendingInvoice = invoices.some(
        (invoice) => String(invoice.status || "").toUpperCase() === "PENDING"
      );
      if (!hasPendingInvoice) {
        stopInvoiceWatch(affiliateId);
        return;
      }
      const lastChange = invoices.reduce((maxValue, invoice) => {
        const timestamp = new Date(
          invoice.paid_at
            || invoice.cancelled_at
            || invoice.expired_at
            || invoice.created_at
            || 0
        ).getTime();
        return Math.max(maxValue, timestamp || 0);
      }, 0);
      const nextSince = Number.isFinite(lastChange) ? lastChange + 1 : Date.now();
      startInvoiceWatch(affiliateId, nextSince);
    });
    return () => {
      selectedAffiliateIds.forEach((affiliateId) => {
        stopInvoiceWatch(affiliateId);
      });
    };
  }, [details, selectedAffiliateIds, startInvoiceWatch, stopInvoiceWatch]);

  const handleQuickStatus = async (affiliateId, nextStatus) => {
    try {
      await apiFetch(`/admin/affiliates/${affiliateId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      setDetailMessages((prev) => ({
        ...prev,
        [affiliateId]: `Afiliado ${nextStatus === "APPROVED" ? "aprobado" : "rechazado"}.`,
      }));
      setItems((prev) =>
        prev.map((item) =>
          item.id === affiliateId ? { ...item, status: nextStatus } : item
        )
      );
    } catch (err) {
      setError("No se pudo actualizar el estado del afiliado.");
    }
  };

  const handleSaveGlobalCommission = async () => {
    if (globalCommissionSaving) {
      return;
    }
    setGlobalCommissionSaving(true);
    setGlobalCommissionMessage("");
    setGlobalCommissionError("");
    try {
      const durationValue = Number(globalCommissionDuration);
      const minutes =
        globalCommissionUnit === "hours" ? durationValue * 60 : durationValue;
      if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) {
        setGlobalCommissionError("Ingresa un tiempo válido (1 min a 24 horas).");
        setGlobalCommissionSaving(false);
        return;
      }
      const payload = {
        commission_rate: toDecimalRate(globalCommissionRate),
        duration_minutes: minutes,
      };
      await apiFetch("/admin/affiliates/commission-rate", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const endsAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
      setGlobalCommissionEndsAt(endsAt);
    } catch (err) {
      const errorText =
        (err && err.payload && err.payload.error) ? ` (${err.payload.error})` : "";
      setGlobalCommissionError(`No se pudo actualizar la comisión global.${errorText}`);
    } finally {
      setGlobalCommissionSaving(false);
    }
  };

  const handleStopGlobalCommission = async () => {
    if (globalCommissionSaving) {
      return;
    }
    setGlobalCommissionSaving(true);
    setGlobalCommissionMessage("");
    setGlobalCommissionError("");
    try {
      await apiFetch("/admin/affiliates/commission-rate/stop", { method: "POST" });
      setGlobalCommissionRate("0");
      setGlobalCommissionEndsAt(null);
    } catch (err) {
      const errorText =
        (err && err.payload && err.payload.error) ? ` (${err.payload.error})` : "";
      setGlobalCommissionError(`No se pudo detener la comisión global.${errorText}`);
    } finally {
      setGlobalCommissionSaving(false);
    }
  };

  const formatRemaining = (endsAt) => {
    if (!endsAt) {
      return "-";
    }
    const end = new Date(endsAt);
    if (!Number.isFinite(end.getTime())) {
      return "-";
    }
    const diffMs = end.getTime() - Date.now();
    if (diffMs <= 0) {
      return "Finalizado";
    }
    const totalSeconds = Math.ceil(diffMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  useEffect(() => {
    setGlobalCommissionRemaining(formatRemaining(globalCommissionEndsAt));
    const interval = setInterval(() => {
      setGlobalCommissionRemaining(formatRemaining(globalCommissionEndsAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [globalCommissionEndsAt]);

  return (
    <main className="page affiliates-page">
      <section className="card affiliates-card">
        <div className="affiliates-header">
          <h1 className="icon-inline affiliates-title"><IconAffiliates className="panel-icon" /> Afiliados</h1>
          <div className="affiliates-header-actions">
            <div className="form affiliates-filters">
              <label>
                Estado
                <select
                  className="affiliates-status-select"
                  value={status}
                  onChange={handleStatusChange}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="affiliates-commission-wrap">
              <div className="affiliates-commission-title">
                <svg viewBox="0 0 24 24" aria-hidden="true" className="affiliates-title-icon">
                  <path
                    d="M12 2v20M7 6.5c0-1.9 2.2-3.5 5-3.5s5 1.6 5 3.5-2.2 3.5-5 3.5-5 1.6-5 3.5 2.2 3.5 5 3.5 5-1.6 5-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Comisión global
              </div>
              <div className="affiliates-commission-card">
                {globalCommissionError && <p className="error">{globalCommissionError}</p>}
                <div className="form">
                  <label>
                    <span className="commission-label">Comisión (%)</span>
                    <input
                      className="commission-input"
                      type="number"
                      value={globalCommissionRate}
                      onChange={(event) => {
                        const raw = event.target.value || "";
                        const cleaned = raw.replace(/[^0-9.]/g, "");
                        const parts = cleaned.split(".");
                        const integerPart = (parts[0] || "").slice(0, 2);
                        const decimalPart = (parts[1] || "").slice(0, 2);
                        const value = decimalPart ? `${integerPart}.${decimalPart}` : integerPart;
                        setGlobalCommissionRate(value);
                      }}
                      placeholder="20"
                      min="0"
                      max="99"
                      step="0.01"
                    />
                  </label>
                  <label>
                    <span className="commission-label">Tiempo</span>
                    <div className="commission-duration">
                      <input
                        className="commission-input commission-input-wide"
                        type="number"
                        min="1"
                        max={globalCommissionUnit === "hours" ? "24" : "1440"}
                        value={globalCommissionDuration}
                        onChange={(event) => setGlobalCommissionDuration(event.target.value)}
                      />
                      <select
                        className="commission-input"
                        value={globalCommissionUnit}
                        onChange={(event) => setGlobalCommissionUnit(event.target.value)}
                      >
                        <option value="minutes">Minutos</option>
                        <option value="hours">Horas</option>
                      </select>
                    </div>
                  </label>
                  <button
                    type="button"
                    onClick={handleSaveGlobalCommission}
                    disabled={globalCommissionSaving}
                  >
                    {globalCommissionSaving ? "Guardando..." : "Comenzar"}
                  </button>
                  <button
                    type="button"
                    className="danger-button"
                    onClick={handleStopGlobalCommission}
                    disabled={globalCommissionSaving}
                  >
                    Detener
                  </button>
                </div>
                <p className="muted">Expira en: {globalCommissionRemaining}</p>
              </div>
            </div>
          </div>
        </div>
        {message && <p className="muted">{message}</p>}
        {error && <p className="error">{error}</p>}
        <div className="table-scroll affiliates-table-scroll">
          <table style={{ width: "100%", marginTop: "16px" }}>
            <thead>
              <tr>
                <th align="left">Perfil</th>
                <th align="left" className="affiliate-center">Afiliado</th>
                <th align="left" className="affiliate-center">Telegram ID</th>
                <th align="left" className="affiliate-center">Estado</th>
                <th align="left" className="affiliate-center">Ventas</th>
                <th align="left" className="affiliate-center">Ingreso</th>
                <th align="left" className="affiliate-center">Bloqueo</th>
                <th align="left" className="affiliate-center">
                  {hasPending ? "Acciones" : "Nivel"}
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((affiliate, index) => {
                const displayIndex = (page - 1) * 20 + index + 1;
                return (
                  <tr
                    key={affiliate.id}
                    className={affiliate.status === "REJECTED" ? "affiliate-row-blocked" : ""}
                  >
                    <td>
                      <div className="affiliate-name-cell">
                          <div className="affiliate-avatar">
                            {photoUrls[affiliate.telegram_id] ? (
                              <img
                                src={photoUrls[affiliate.telegram_id]}
                                alt="Avatar"
                              />
                            ) : (
                              getInitials(
                                affiliate.telegram_username,
                                affiliate.telegram_id
                              )
                            )}
                          </div>
                        <div>
                          <button
                            type="button"
                            className="orders-copy"
                            onClick={() =>
                              handleCopy("Username", affiliate.telegram_username)
                            }
                          >
                            {affiliate.telegram_username || "-"}
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="affiliate-center">
                      {`#${formatAffiliateNumber(displayIndex)}`}
                    </td>
                    <td className="affiliate-center">
                      <button
                        type="button"
                        className="orders-copy"
                        onClick={() =>
                          handleCopy("Telegram ID", affiliate.telegram_id)
                        }
                      >
                        {affiliate.telegram_id}
                      </button>
                    </td>
                    <td className="affiliate-center">{formatStatus(affiliate.status)}</td>
                    <td className="affiliate-center">{affiliate.sales_count || 0}</td>
                    <td className="affiliate-center">
                      {formatDate(affiliate.approved_at || affiliate.created_at)}
                    </td>
                    <td className="affiliate-center">
                      <button
                        type="button"
                        className={`lock-button ${
                          affiliate.status === "APPROVED" ? "lock-open" : "lock-closed"
                        }`}
                        onClick={() => handleToggleLock(affiliate)}
                        title={
                          affiliate.status === "APPROVED"
                            ? "Bloquear afiliado"
                            : "Activar afiliado"
                        }
                      >
                        {affiliate.status === "APPROVED" ? (
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path
                              d="M17 9h-7V7a4 4 0 0 1 7.6-1.6"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <rect
                              x="3"
                              y="9"
                              width="14"
                              height="12"
                              rx="2"
                              ry="2"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <rect
                              x="3"
                              y="9"
                              width="18"
                              height="12"
                              rx="2"
                              ry="2"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M7 9V7a5 5 0 0 1 10 0v2"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </button>
                    </td>
                  <td className="affiliate-center">
                    {affiliate.status === "PENDING" ? (
                      <div className="actions" style={{ marginTop: 0 }}>
                        <button
                          type="button"
                          onClick={() => handleQuickStatus(affiliate.id, "APPROVED")}
                        >
                          Aprobar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickStatus(affiliate.id, "REJECTED")}
                        >
                          Rechazar
                        </button>
                      </div>
                    ) : (
                      <span className="muted">
                        {getAffiliateLevel(
                          affiliate.sales_count || 0,
                          Number(affiliate.earnings_total || 0),
                          affiliate.last_sale_at
                        )}
                      </span>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => handleViewAffiliate(affiliate.id)}
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </section>
      {selectedAffiliateIds.length > 0 && (
        <div className="orders-detail-wrap">
          {selectedAffiliateIds.map((affiliateId) => {
            const detail = details[affiliateId];
            const isLoading = detailLoading[affiliateId];
            const errorMessage = detailErrors[affiliateId];
            const detailMessage = detailMessages[affiliateId];
            const affiliate = detail?.affiliate;
            const user = detail?.user;
            const commissions = detail?.commissions || [];
            const salesCount = detail?.affiliate?.sales_count || 0;
            const earningsTotal = Number(detail?.affiliate?.earnings_total || 0);
            const lastSaleAt = detail?.affiliate?.last_sale_at;
            const levelLabel = getAffiliateLevel(salesCount, earningsTotal, lastSaleAt);
            const levelBaseRate = getLevelBaseRate(levelLabel);
            const minWithdrawValue = getLevelMinWithdraw(levelLabel);
            const minWithdrawText =
              minWithdrawValue > 0 ? formatUsdAmount(minWithdrawValue) : "No aplica";
            const salesTodayValue = Number(detail?.affiliate?.sales_today);
            const salesWeekValue = Number(detail?.affiliate?.sales_week);
            const salesMonthValue = Number(detail?.affiliate?.sales_month);
            const salesTodayLabel = Number.isFinite(salesTodayValue) ? salesTodayValue : "-";
            const salesWeekLabel = Number.isFinite(salesWeekValue) ? salesWeekValue : "-";
            const salesMonthLabel = Number.isFinite(salesMonthValue) ? salesMonthValue : "-";
            const approvedDays = getDaysSince(affiliate?.approved_at);
            const inactivityBase = lastSaleAt || affiliate?.approved_at || affiliate?.created_at;
            const inactivityDays = getDaysSince(inactivityBase);
            const dailyStreakValue = Number.isFinite(
              Number(detail?.affiliate?.daily_streak)
            )
              ? Number(detail?.affiliate?.daily_streak)
              : null;
            const referralsTotal = Number.isFinite(
              Number(detail?.affiliate?.referrals_total)
            )
              ? Number(detail?.affiliate?.referrals_total)
              : null;
            const commissionText =
              salesCount < 1 ? "20% (primera venta)" : `${levelBaseRate}%`;
            const statusEmoji =
              affiliate?.status === "APPROVED"
                ? "✅"
                : affiliate?.status === "REJECTED"
                ? "⛔️"
                : "";
            const isDeleteOpen = Boolean(deleteOpenById[affiliateId]);
            const availableBalance = Number(detail?.available_balance || 0);
            const affiliateDebt = Number(detail?.affiliate?.affiliate_debt || 0);
            const netBalanceRaw = Number(availableBalance - affiliateDebt);
            const netBalance = Math.max(netBalanceRaw, 0);
            const debtRemaining = Math.max(affiliateDebt - availableBalance, 0);
            const debtClassName = affiliateDebt > 0 ? "error" : "muted";
            const netClassName = netBalance < 0 ? "error" : "";
            const adjustments = detail?.adjustments || [];
            const invoices = detail?.invoices || [];
            const isInvoiceAdjustment = (adjustment) => {
              const reason = String(adjustment?.reason || "").toLowerCase();
              if (reason.startsWith("factura") || reason.startsWith("invoice")) {
                return true;
              }
              const amount = Math.abs(Number(adjustment?.amount || 0));
              if (!amount) {
                return false;
              }
              return invoices.some((invoice) => {
                const status = String(invoice?.status || "").toUpperCase();
                if (status !== "PAID") {
                  return false;
                }
                const invoiceAmount = Math.abs(Number(invoice?.amount || 0));
                if (invoiceAmount !== amount) {
                  return false;
                }
                const invoiceTime = new Date(
                  invoice?.paid_at || invoice?.created_at || 0
                ).getTime();
                const adjustmentTime = new Date(
                  adjustment?.created_at || 0
                ).getTime();
                if (!Number.isFinite(invoiceTime) || !Number.isFinite(adjustmentTime)) {
                  return false;
                }
                return Math.abs(invoiceTime - adjustmentTime) <= 2 * 60 * 1000;
              });
            };
            const controlItems = [
              ...adjustments
                .filter((item) => !isInvoiceAdjustment(item))
                .map((item) => ({ ...item, type: "ADJUSTMENT" })),
              ...invoices.map((item) => ({ ...item, type: "INVOICE" })),
            ].sort((a, b) => {
              const aTime = new Date(a.created_at || 0).getTime();
              const bTime = new Date(b.created_at || 0).getTime();
              return bTime - aTime;
            });
            const isWatchingInvoice = Boolean(invoiceWatchById[affiliateId]);

            return (
              <section
                key={affiliateId}
                className="card orders-detail-card"
                ref={(node) => {
                  if (node) {
                    detailRefs.current[affiliateId] = node;
                  }
                }}
              >
                {isLoading && <p>Cargando...</p>}
                {!isLoading && affiliate && (
                  <>
                    <div className="orders-detail-header">
                      <h2>
                        Afiliado
                        {affiliate?.affiliate_number
                          ? ` #${formatAffiliateNumber(affiliate.affiliate_number)}`
                          : ""}
                      </h2>
                      <div className="affiliate-detail-actions">
                        <button
                          type="button"
                          className="plain-button"
                          onClick={() => handleViewAffiliate(affiliate.id)}
                          data-no-export="true"
                        >
                          Cerrar
                        </button>
                        <button
                          type="button"
                          className="plain-button"
                          onClick={() => handleDownloadAffiliate(affiliate.id)}
                          data-no-export="true"
                        >
                          <Download size={16} />
                          Descargar
                        </button>
                        <button
                          type="button"
                          className="plain-button"
                          onClick={() => toggleDeleteAffiliate(affiliate.id)}
                          title="Mostrar opciones"
                          data-no-export="true"
                        >
                          <ArrowLeft size={16} />
                        </button>
                        {isDeleteOpen && (
                          <button
                            type="button"
                            className="plain-button"
                            onClick={() => handleDeleteAffiliate(affiliate.id)}
                            data-no-export="true"
                          >
                            Eliminar afiliado
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="orders-detail-separator"></div>
                    <div className="affiliate-detail-table">
                      <div className="affiliate-detail-row affiliate-detail-row--header">
                        <div>Perfil</div>
                        <div className="affiliate-center">Telegram ID</div>
                        <div className="affiliate-center">Estado</div>
                        <div className="affiliate-center">Ventas</div>
                        <div className="affiliate-center">Ingreso</div>
                        <div className="affiliate-center">Bloqueo</div>
                        <div className="affiliate-center">Nivel</div>
                      </div>
                      <div className="affiliate-detail-row affiliate-detail-row--data">
                        <div className="affiliate-name-cell">
                          <div className="affiliate-avatar affiliate-detail-avatar">
                            {photoUrls[user?.telegram_id] ? (
                              <img
                                src={photoUrls[user?.telegram_id]}
                                alt="Avatar"
                              />
                            ) : (
                              getInitials(user?.telegram_username, user?.telegram_id)
                            )}
                          </div>
                          <button
                            type="button"
                            className="orders-copy"
                            onClick={() => handleCopy("Username", user?.telegram_username)}
                          >
                            {user?.telegram_username || "-"}
                          </button>
                        </div>
                        <div className="affiliate-center">
                          <button
                            type="button"
                            className="orders-copy"
                            onClick={() => handleCopy("Telegram ID", user?.telegram_id)}
                          >
                            {user?.telegram_id || "-"}
                          </button>
                        </div>
                        <div className="affiliate-center">{formatStatus(affiliate.status)}</div>
                        <div className="affiliate-center">{detail?.affiliate?.sales_count || 0}</div>
                        <div className="affiliate-center">
                          {formatDate(affiliate.approved_at || affiliate.created_at)}
                        </div>
                        <div className="affiliate-center">
                          <button
                            type="button"
                            className={`lock-button lock-pill ${
                              affiliate.status === "APPROVED" ? "lock-open" : "lock-closed"
                            }`}
                            onClick={() => handleToggleLock(affiliate)}
                            title={
                              affiliate.status === "APPROVED"
                                ? "Bloquear afiliado"
                                : "Activar afiliado"
                            }
                          >
                            {affiliate.status === "APPROVED" ? (
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path
                                  d="M17 9h-7V7a4 4 0 0 1 7.6-1.6"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                                <rect
                                  x="3"
                                  y="9"
                                  width="14"
                                  height="12"
                                  rx="2"
                                  ry="2"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            ) : (
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <rect
                                  x="3"
                                  y="9"
                                  width="18"
                                  height="12"
                                  rx="2"
                                  ry="2"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                                <path
                                  d="M7 9V7a5 5 0 0 1 10 0v2"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </button>
                        </div>
                        <div className="affiliate-center">
                          {levelLabel}
                        </div>
                      </div>
                    </div>
                    <div className="orders-detail-separator"></div>
                    {detailMessage && <p className="muted">{detailMessage}</p>}
                    {errorMessage && <p className="error">{errorMessage}</p>}
                    <div className="orders-detail-grid">
                      <div className="orders-detail-section">
                        <h3>Detalle</h3>
                        <p>
                          📊 Estado: {formatStatus(affiliate.status)} {statusEmoji}
                        </p>
                        <p>
                          💸 Comisión: {commissionText}
                        </p>
                        <p>
                          🏆 Posición top ventas:{" "}
                          {getSalesRankLabel(detail?.affiliate?.sales_rank)}
                        </p>
                        <p>
                          👥 Referidos totales:{" "}
                          {referralsTotal !== null ? referralsTotal : "-"}
                        </p>
                        <p>
                          ⏳ Conteo de inactividad:{" "}
                          {inactivityDays !== null ? `${inactivityDays} días` : "-"}
                        </p>
                        <p>
                          🔥 Racha activa:{" "}
                          {dailyStreakValue !== null ? `${dailyStreakValue} días` : "-"}
                        </p>
                        <p>💵 Mínimo de retiro: {minWithdrawText}</p>
                        <p className={netClassName}>
                          💰 Saldo disponible: {formatUsdAmount(netBalance)}
                        </p>
                        {netBalanceRaw < 0 && (
                          <p className="error">
                            ⚠️ Saldo neto negativo (posible ajuste pendiente o duplicado).
                          </p>
                        )}
                        <p className={debtClassName}>
                          📉 Deuda pendiente: {formatUsdAmount(-debtRemaining)}
                        </p>
                        <p>
                          📅 Ingreso:{" "}
                          {formatApprovedAt(affiliate.approved_at)}
                          {approvedDays !== null ? ` (${approvedDays} días)` : ""}
                        </p>
                        <p>
                          🔗 Link de afiliado:{" "}
                          <button
                            type="button"
                            className="orders-copy"
                            onClick={() =>
                              handleCopy(
                                "Link de afiliado",
                                `https://t.me/${String(botUsername || "").replace(/^@/, "")}?start=${user?.telegram_id || ""}`
                              )
                            }
                          >
                            https://t.me/{botUsername}?start={user?.telegram_id || "-"}
                          </button>
                        </p>
                      </div>
                      <div className="orders-detail-section">
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <h3>Usuario</h3>
                        </div>
                        <p>
                          Telegram ID:{" "}
                          <button
                            type="button"
                            className="orders-copy"
                            onClick={() => handleCopy("Telegram ID", user?.telegram_id)}
                          >
                            {user?.telegram_id || "-"}
                          </button>
                        </p>
                        <p>
                          Username:{" "}
                          <button
                            type="button"
                            className="orders-copy"
                            onClick={() => handleCopy("Username", user?.telegram_username)}
                          >
                            {user?.telegram_username || "-"}
                          </button>
                        </p>
                        <p>
                          ID de Afiliado:{" "}
                          <button
                            type="button"
                            className="orders-copy"
                            onClick={() => handleCopy("ID de Afiliado", affiliate?.id)}
                          >
                            {affiliate?.id || "-"}
                          </button>
                        </p>
                        <div className="orders-detail-subseparator"></div>
                        <h3>Metodos de retiro</h3>
                        <p>
                          Metodo:{" "}
                          {affiliate.wallet_usdt_bsc
                            ? "USDT"
                            : affiliate.wallet_nequi
                            ? "Nequi"
                            : affiliate.binance_id
                            ? "ID de Binance"
                            : "-"}
                        </p>
                        <p>
                          Destino:{" "}
                          <button
                            type="button"
                            className="orders-copy"
                            onClick={() =>
                              handleCopy(
                                "Destino",
                                affiliate.wallet_usdt_bsc
                                  || affiliate.wallet_nequi
                                  || affiliate.binance_id
                              )
                            }
                          >
                            {affiliate.wallet_usdt_bsc
                              || affiliate.wallet_nequi
                              || affiliate.binance_id
                              || "-"}
                          </button>
                        </p>
                        <div className="orders-detail-subseparator"></div>
                        <h3>Ventas Globales</h3>
                        <p>📦 Ventas totales: {salesCount}</p>
                        <p>📅 Ventas del día: {salesTodayLabel}</p>
                        <p>📆 Ventas de la semana: {salesWeekLabel}</p>
                        <p>🗓️ Ventas del mes: {salesMonthLabel}</p>
                      </div>
                    </div>
                    <div className="orders-detail-separator"></div>
                    <div className="orders-detail-section">
                      <h3 className="affiliate-commissions-title">Comisiones recientes</h3>
                      {commissions.length === 0 ? (
                        <p className="muted">Sin comisiones.</p>
                      ) : (
                        <div className="table-scroll affiliate-commissions-scroll">
                          <table style={{ width: "100%", marginTop: "0px" }}>
                            <thead>
                              <tr>
                                <th align="left">Número</th>
                                <th align="left">Orden</th>
                                <th align="left">Comprador</th>
                                <th align="left">Telegram ID</th>
                                <th align="left">Monto</th>
                                <th align="left">Estado</th>
                                <th align="left">Ganado</th>
                                <th align="left">Retirado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {commissions.map((row) => (
                                <tr key={row.id}>
                                  <td>
                                    {row.order_number
                                      ? String(row.order_number).padStart(5, "0")
                                      : "-"}
                                  </td>
                                  <td>
                                    <button
                                      type="button"
                                      className="link-button commission-order-link"
                                      onClick={() =>
                                        router.push(
                                          `/orders?orderId=${encodeURIComponent(
                                            row.order_id
                                          )}`
                                        )
                                      }
                                    >
                                      <span className="truncate-id">{row.order_id}</span>
                                    </button>
                                  </td>
                                  <td>
                                    <button
                                      type="button"
                                      className="orders-copy"
                                      onClick={() =>
                                        handleCopy("Username", row.buyer_username)
                                      }
                                    >
                                      {row.buyer_username || "-"}
                                    </button>
                                  </td>
                                  <td>
                                    <button
                                      type="button"
                                      className="orders-copy"
                                      onClick={() =>
                                        handleCopy("Telegram ID", row.buyer_telegram_id)
                                      }
                                    >
                                      {row.buyer_telegram_id || "-"}
                                    </button>
                                  </td>
                                  <td>{formatCommissionAmount(row.amount)}</td>
                                  <td>{formatCommissionStatus(row.status)}</td>
                                  <td>{formatApprovedAt(row.payment_approved_at)}</td>
                                  <td>
                                    {row.paid_out_at
                                      ? new Date(row.paid_out_at).toLocaleString()
                                      : "-"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                    <div className="orders-detail-separator"></div>
                    <div className="orders-detail-section">
                      <h3>Control de Ganancias</h3>
                      <div className="affiliate-adjustment-form">
                        <div className="affiliate-adjustment-row">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="Monto (USD)"
                            className="commission-input"
                            value={adjustmentAmountById[affiliateId] || ""}
                            onChange={(event) =>
                              setAdjustmentAmountById((prev) => ({
                                ...prev,
                                [affiliateId]: event.target.value,
                              }))
                            }
                          />
                          <input
                            type="text"
                            placeholder="Motivo (opcional)"
                            className="commission-input"
                            value={adjustmentReasonById[affiliateId] || ""}
                            onChange={(event) =>
                              setAdjustmentReasonById((prev) => ({
                                ...prev,
                                [affiliateId]: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="affiliate-adjustment-actions">
                          <button
                            type="button"
                            onClick={() => handleAdjustment(affiliateId, "add")}
                            disabled={adjustmentStatusById[affiliateId] === "saving"}
                          >
                            Agregar saldo
                          </button>
                          <button
                            type="button"
                            className="danger-button"
                            onClick={() => handleAdjustment(affiliateId, "subtract")}
                            disabled={adjustmentStatusById[affiliateId] === "saving"}
                            data-no-export="true"
                          >
                            Quitar saldo
                          </button>
                          <button
                            type="button"
                            onClick={() => handleInvoiceSend(affiliateId)}
                            disabled={invoiceStatusById[affiliateId] === "sending"}
                          >
                            Enviar factura
                          </button>
                        </div>
                        {adjustmentErrorById[affiliateId] && (
                          <p className="error">{adjustmentErrorById[affiliateId]}</p>
                        )}
                        {invoiceErrorById[affiliateId] && (
                          <p className="error">{invoiceErrorById[affiliateId]}</p>
                        )}
                        {adjustmentStatusById[affiliateId] === "saving" && (
                          <p className="muted">Guardando ajuste...</p>
                        )}
                        {invoiceStatusById[affiliateId] === "sending" && (
                          <p className="muted">Enviando factura...</p>
                        )}
                        {isWatchingInvoice && (
                          <p className="muted">Esperando pago o cancelación...</p>
                        )}
                      </div>
                      {controlItems.length === 0 ? (
                        <p className="muted">Sin ajustes registrados.</p>
                      ) : (
                        <div className="table-scroll affiliate-commissions-scroll">
                          <table style={{ width: "100%", marginTop: "0px" }}>
                            <thead>
                              <tr>
                                <th align="left">Fecha</th>
                                <th align="left">Monto</th>
                                <th align="left">Estado</th>
                                <th align="left">Motivo</th>
                              </tr>
                            </thead>
                            <tbody>
                              {controlItems.map((row) => {
                                const amount =
                                  row.type === "INVOICE"
                                    ? -Math.abs(Number(row.amount || 0))
                                    : Number(row.amount || 0);
                                const reason = row.type === "INVOICE"
                                  ? (row.reason ? `Factura: ${row.reason}` : "Factura")
                                  : row.reason || "-";
                                const status = row.type === "INVOICE"
                                  ? formatInvoiceStatus(row.status)
                                  : Number(row.amount || 0) >= 0
                                  ? "Agregado"
                                  : "Descontado";
                                return (
                                  <tr key={`${row.type}-${row.id}`}>
                                    <td>{new Date(row.created_at).toLocaleString()}</td>
                                    <td>{formatCommissionAmount(amount)}</td>
                                    <td>{status}</td>
                                    <td>
                                      <span className="affiliate-reason-truncate">
                                        {reason}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                )}
                {!isLoading && !affiliate && errorMessage && (
                  <p className="error">{errorMessage}</p>
                )}
              </section>
            );
          })}
        </div>
      )}
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
    </main>
  );
}
  const formatStatus = (value) => {
    if (value === "APPROVED") {
      return "APROBADO";
    }
    if (value === "PENDING") {
      return "PENDIENTE";
    }
    if (value === "REJECTED") {
      return "BLOQUEADO";
    }
    return value || "-";
  };
