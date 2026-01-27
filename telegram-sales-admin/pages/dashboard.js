import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { apiFetch } from "../lib/api";
import { IconDashboard } from "../components/PanelIcons";

function useCountUp(value, options = {}) {
  const {
    start = 0,
    duration = 10000,
    locale = "es-CO",
    threshold = 0.3,
    delay = 1000,
  } = options;
  const [displayValue, setDisplayValue] = useState(start);
  const targetRef = useRef(null);
  const hasAnimatedRef = useRef(false);
  const inViewRef = useRef(false);
  const displayRef = useRef(displayValue);
  const timerRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    displayRef.current = displayValue;
  }, [displayValue]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
    const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

    const animate = (fromValue, toValue) => {
      if (!Number.isFinite(toValue) || !Number.isFinite(fromValue)) {
        setDisplayValue(toValue);
        return;
      }
      if (fromValue === toValue) {
        setDisplayValue(toValue);
        return;
      }
      const startTime = performance.now();
      const tick = (now) => {
        const t = clamp((now - startTime) / duration, 0, 1);
        const eased = easeOutCubic(t);
        const nextValue = Math.round(
          fromValue + (toValue - fromValue) * eased
        );
        setDisplayValue(nextValue);
        if (t < 1) {
          rafRef.current = requestAnimationFrame(tick);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    if (mediaQuery.matches) {
      setDisplayValue(value);
      hasAnimatedRef.current = true;
      return undefined;
    }

    if (!targetRef.current) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }
          inViewRef.current = true;
          if (hasAnimatedRef.current) {
            return;
          }
          hasAnimatedRef.current = true;
          if (timerRef.current) {
            clearTimeout(timerRef.current);
          }
          timerRef.current = setTimeout(() => {
            animate(start, value);
          }, delay);
          observer.unobserve(entry.target);
        });
      },
      { threshold }
    );

    observer.observe(targetRef.current);

    return () => {
      observer.disconnect();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [delay, duration, start, threshold, value]);

  useEffect(() => {
    if (!inViewRef.current || !hasAnimatedRef.current) {
      return;
    }
    if (value > displayRef.current) {
      const fromValue = displayRef.current;
      const toValue = value;
      const startTime = performance.now();
      const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
      const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
      const tick = (now) => {
        const t = clamp((now - startTime) / duration, 0, 1);
        const eased = easeOutCubic(t);
        const nextValue = Math.round(
          fromValue + (toValue - fromValue) * eased
        );
        setDisplayValue(nextValue);
        if (t < 1) {
          rafRef.current = requestAnimationFrame(tick);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    } else if (value !== displayRef.current) {
      setDisplayValue(value);
    }
  }, [duration, value]);

  const formatted = new Intl.NumberFormat(locale).format(displayValue);
  return { ref: targetRef, value: formatted };
}

export default function Dashboard() {
  const navCards = [
    { href: "/orders", label: "Ordenes", key: "orders" },
    { href: "/inventory", label: "Inventario", key: "inventory" },
    { href: "/tickets", label: "Tickets", key: "tickets" },
    { href: "/broadcasts", label: "Difusiones" },
    { href: "/payouts", label: "Pagos", key: "payouts" },
    { href: "/affiliates", label: "Afiliados", key: "affiliates" },
  ];
  const [stats, setStats] = useState({
    customers: 0,
    totalSales: 0,
    totalRevenueUsd: 0,
    newOrders: 0,
    activeProducts: 0,
    unreadTickets: 0,
    pendingPayouts: 0,
    affiliates: 0,
    pendingAffiliates: 0,
  });
  const [statsError, setStatsError] = useState("");
  const [seenOrdersCount, setSeenOrdersCount] = useState(0);
  const [seenTicketsAt, setSeenTicketsAt] = useState(0);
  const [latestTicketAt, setLatestTicketAt] = useState(0);
  const [seenPayoutsCount, setSeenPayoutsCount] = useState(0);
  const [seenAffiliatesCount, setSeenAffiliatesCount] = useState(0);
  const [resetText, setResetText] = useState("");
  const [resetStatus, setResetStatus] = useState("");
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [paymentMethodsError, setPaymentMethodsError] = useState("");
  const customersCounter = useCountUp(stats.customers);
  const salesCounter = useCountUp(stats.totalSales);
  const revenueCounter = useCountUp(stats.totalRevenueUsd);
  const affiliatesCounter = useCountUp(stats.affiliates);
  const paymentMethodLabels = [
    { key: "NEQUI", label: "Nequi" },
    { key: "BINANCE_ID", label: "Binance ID" },
    { key: "CRYPTO", label: "Cripto" },
    { key: "MERCADOPAGO", label: "Mercado pago" },
    { key: "PAYPAL", label: "Paypal" },
  ];

  const loadSummary = useCallback(async () => {
    try {
      const [data, ticketsRes] = await Promise.all([
        apiFetch("/admin/summary"),
        apiFetch("/admin/tickets?status=OPEN&page=1&page_size=1"),
      ]);
      const nextStats = {
        customers: Number(data.customers || 0),
        totalSales: Number(data.total_sales || 0),
        totalRevenueUsd: Number(data.total_revenue_usd || 0),
        newOrders: Number(data.new_orders || 0),
        activeProducts: Number(data.active_products || 0),
        unreadTickets: Number(data.unread_tickets || 0),
        pendingPayouts: Number(data.pending_payouts || 0),
        affiliates: Number(data.affiliates || 0),
        pendingAffiliates: Number(data.pending_affiliates || 0),
      };
      setStats(nextStats);
      const latestTicket = ticketsRes.items?.[0];
      const latestTicketTime = latestTicket
        ? new Date(latestTicket.last_message_at || latestTicket.created_at).getTime()
        : 0;
      setLatestTicketAt(Number.isNaN(latestTicketTime) ? 0 : latestTicketTime);
      setStatsError("");
    } catch (error) {
      setStatsError("No se pudo cargar el resumen.");
    }
  }, []);

  const loadPaymentMethods = useCallback(async () => {
    try {
      const data = await apiFetch("/admin/payment-methods");
      setPaymentMethods(Array.isArray(data?.methods) ? data.methods : []);
      setPaymentMethodsError("");
    } catch (error) {
      setPaymentMethodsError("No se pudieron cargar los metodos de pago.");
    }
  }, []);

  const handleTogglePaymentMethod = async (methodKey) => {
    try {
      const data = await apiFetch(`/admin/payment-methods/${methodKey}/toggle`, {
        method: "POST",
      });
      if (Array.isArray(data?.methods)) {
        setPaymentMethods(data.methods);
        setPaymentMethodsError("");
      } else {
        await loadPaymentMethods();
      }
    } catch (error) {
      setPaymentMethodsError("No se pudo actualizar el metodo de pago.");
    }
  };

  useEffect(() => {
    loadSummary();
    loadPaymentMethods();
    const interval = setInterval(() => {
      loadSummary();
    }, 20000);
    return () => clearInterval(interval);
  }, [loadPaymentMethods, loadSummary]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const storedOrders = Number(
      window.sessionStorage.getItem("admin_seen_orders_count") || 0
    );
    const storedTicketsAt = Number(
      window.sessionStorage.getItem("admin_seen_tickets_at") || 0
    );
    const storedPayouts = Number(
      window.sessionStorage.getItem("admin_seen_payouts_count") || 0
    );
    const storedAffiliates = Number(
      window.sessionStorage.getItem("admin_seen_affiliates_count") || 0
    );
    if (!Number.isNaN(storedOrders)) {
      setSeenOrdersCount(storedOrders);
    }
    if (!Number.isNaN(storedTicketsAt)) {
      setSeenTicketsAt(storedTicketsAt);
    }
    if (!Number.isNaN(storedPayouts)) {
      setSeenPayoutsCount(storedPayouts);
    }
    if (!Number.isNaN(storedAffiliates)) {
      setSeenAffiliatesCount(storedAffiliates);
    }
  }, []);

  const normalizedReset = resetText.trim().toLowerCase();
  const canReset = normalizedReset === "reiniciar" || normalizedReset === "reset";

  const handleResetStats = async () => {
    if (!canReset) {
      return;
    }
    setResetStatus("processing");
    try {
      await apiFetch("/admin/stats/reset", {
        method: "POST",
        body: JSON.stringify({ confirm: "Reiniciar" }),
      });
      setResetText("");
      setResetStatus("done");
      await loadSummary();
    } catch (error) {
      setResetStatus("error");
    }
  };

  return (
    <main className="page">
      <section className="card">
        <div className="dashboard-header">
          <div>
            <h1 className="icon-inline">
              <IconDashboard className="panel-icon" /> Panel Principal
            </h1>
            <p className="muted">Accesos directos</p>
          </div>
          <div className="dashboard-reset">
            <input
              type="text"
              placeholder="Escribe Reiniciar para habilitar"
              value={resetText}
              onChange={(event) => setResetText(event.target.value)}
              className="dashboard-reset-input"
              aria-label="Confirmar reset de estadisticas"
            />
            {canReset && (
              <button
                type="button"
                onClick={handleResetStats}
                disabled={resetStatus === "processing"}
              >
                Reiniciar
              </button>
            )}
            {resetStatus === "error" && (
              <span className="error">No se pudo reiniciar.</span>
            )}
            {resetStatus === "done" && (
              <span className="muted">Estadisticas reiniciadas.</span>
            )}
          </div>
        </div>
        <div className="dashboard-grid">
          {navCards.map((item) => {
            const isOrders = item.key === "orders";
            const isTickets = item.key === "tickets";
            const isInventory = item.key === "inventory";
            const isPayouts = item.key === "payouts";
            const isAffiliates = item.key === "affiliates";
            const countValue = isOrders
              ? stats.newOrders || 0
              : isInventory
              ? stats.activeProducts || 0
              : isTickets
              ? stats.unreadTickets || 0
              : isPayouts
              ? stats.pendingPayouts || 0
              : isAffiliates
              ? stats.pendingAffiliates || 0
              : null;
            const hasAlert =
              (isOrders && countValue > seenOrdersCount) ||
              (isTickets && latestTicketAt > seenTicketsAt) ||
              (isPayouts && countValue > seenPayoutsCount) ||
              (isAffiliates && countValue > seenAffiliatesCount);
            const badgeText = countValue > 99 ? "99+" : String(countValue);
            const badgeLabel = isOrders
              ? "Nuevas ordenes"
              : isTickets
              ? "Tickets sin leer"
              : isPayouts
              ? "Pagos pendientes"
              : isAffiliates
              ? "Afiliados pendientes"
              : "Notificaciones";
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-card ${hasAlert ? "nav-card--alert" : ""}`}
              >
                {countValue !== null && (
                  <div className="nav-card__count">{countValue}</div>
                )}
                {hasAlert && (
                  <span
                    className="nav-card__badge"
                    aria-label={badgeLabel}
                  >
                    {badgeText}
                  </span>
                )}
                <div className="nav-card__label">{item.label}</div>
              </Link>
            );
          })}
        </div>
      </section>
      <section className="card" style={{ marginTop: "24px" }}>
        <h2 className="icon-inline"><IconDashboard className="panel-icon" /> Resumen</h2>
        {statsError && <p className="error">{statsError}</p>}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value" ref={customersCounter.ref}>
              {customersCounter.value}
            </div>
            <div className="stat-label">Clientes</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" ref={salesCounter.ref}>
              {salesCounter.value}
            </div>
            <div className="stat-label">Ventas totales</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" ref={revenueCounter.ref}>
              {revenueCounter.value} USD
            </div>
            <div className="stat-label">Total vendido</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" ref={affiliatesCounter.ref}>
              {affiliatesCounter.value}
            </div>
            <div className="stat-label">Afiliados</div>
          </div>
        </div>
        <div className="payment-methods-panel">
          {paymentMethodsError && <p className="error">{paymentMethodsError}</p>}
          <div className="payment-methods-row">
            {paymentMethodLabels.map((method) => {
              const current = paymentMethods.find((item) => item.key === method.key);
              const enabled = current ? current.enabled : true;
              return (
                <button
                  key={method.key}
                  type="button"
                  className={`payment-method-toggle${enabled ? "" : " is-disabled"}`}
                  onClick={() => handleTogglePaymentMethod(method.key)}
                  aria-pressed={!enabled}
                  title={enabled ? "Deshabilitar metodo" : "Habilitar metodo"}
                >
                  {method.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
