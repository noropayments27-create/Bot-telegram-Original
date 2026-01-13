import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { apiFetch } from "../lib/api";

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
    { href: "/payouts", label: "Pagos" },
    { href: "/affiliates", label: "Afiliados" },
  ];
  const [stats, setStats] = useState({
    customers: 0,
    totalSales: 0,
    totalRevenueUsd: 0,
    newOrders: 0,
    activeProducts: 0,
    unreadTickets: 0,
    affiliates: 0,
  });
  const [statsError, setStatsError] = useState("");
  const customersCounter = useCountUp(stats.customers);
  const salesCounter = useCountUp(stats.totalSales);
  const revenueCounter = useCountUp(stats.totalRevenueUsd);
  const affiliatesCounter = useCountUp(stats.affiliates);

  useEffect(() => {
    const loadSummary = async () => {
      try {
        const data = await apiFetch("/admin/summary");
        const nextStats = {
          customers: Number(data.customers || 0),
          totalSales: Number(data.total_sales || 0),
          totalRevenueUsd: Number(data.total_revenue_usd || 0),
          newOrders: Number(data.new_orders || 0),
          activeProducts: Number(data.active_products || 0),
          unreadTickets: Number(data.unread_tickets || 0),
          affiliates: Number(data.affiliates || 0),
        };
        setStats(nextStats);
        setStatsError("");
      } catch (error) {
        setStatsError("No se pudo cargar el resumen.");
      }
    };
    loadSummary();
    const interval = setInterval(() => {
      loadSummary();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <main className="page">
      <section className="card">
        <h1>Panel Principal</h1>
        <p className="muted">Accesos directos</p>
        <div className="dashboard-grid">
          {navCards.map((item) => {
            const isOrders = item.key === "orders";
            const isTickets = item.key === "tickets";
            const isInventory = item.key === "inventory";
            const countValue = isOrders
              ? stats.newOrders || 0
              : isInventory
              ? stats.activeProducts || 0
              : isTickets
              ? stats.unreadTickets || 0
              : null;
            const hasAlert = (isOrders || isTickets) && countValue > 0;
            const badgeText = countValue > 99 ? "99+" : String(countValue);
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
                    aria-label={isOrders ? "Nuevas ordenes" : "Tickets sin leer"}
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
        <h2>Resumen</h2>
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
      </section>
    </main>
  );
}
