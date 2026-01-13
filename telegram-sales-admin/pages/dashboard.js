import { useEffect, useState } from "react";
import Link from "next/link";

import { apiFetch } from "../lib/api";

export default function Dashboard() {
  const navCards = [
    { href: "/orders", label: "Ordenes", key: "orders" },
    { href: "/inventory", label: "Inventario" },
    { href: "/tickets", label: "Tickets" },
    { href: "/broadcasts", label: "Difusiones" },
    { href: "/payouts", label: "Pagos" },
    { href: "/affiliates", label: "Afiliados" },
  ];

  const [ordersAlertCount, setOrdersAlertCount] = useState(0);
  const [stats, setStats] = useState({
    customers: "0",
    totalSales: "0",
    totalRevenueUsd: "0",
    affiliates: "0",
  });
  const [statsError, setStatsError] = useState("");

  useEffect(() => {
    const readAlert = () => {
      if (typeof window === "undefined") {
        return;
      }
      const raw = window.localStorage.getItem("admin_orders_alert_count") || "0";
      const parsed = parseInt(raw, 10);
      setOrdersAlertCount(Number.isFinite(parsed) ? parsed : 0);
    };
    readAlert();
    const interval = setInterval(readAlert, 5000);
    const handleStorage = () => readAlert();
    window.addEventListener("storage", handleStorage);
    return () => {
      clearInterval(interval);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const clearOrdersAlert = () => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem("admin_orders_alert_count", "0");
    setOrdersAlertCount(0);
  };

  useEffect(() => {
    const loadSummary = async () => {
      try {
        const data = await apiFetch("/admin/summary");
        setStats({
          customers: String(data.customers || 0),
          totalSales: String(data.total_sales || 0),
          totalRevenueUsd: String(data.total_revenue_usd || 0),
          affiliates: String(data.affiliates || 0),
        });
        setStatsError("");
      } catch (error) {
        setStatsError("No se pudo cargar el resumen.");
      }
    };
    const loadAlerts = async () => {
      try {
        const data = await apiFetch("/admin/orders?page=1&page_size=20");
        const items = Array.isArray(data.items) ? data.items : [];
        if (typeof window === "undefined" || items.length === 0) {
          return;
        }
        const latestId = String(items[0].id);
        const lastSeen = window.localStorage.getItem("admin_last_seen_order_id");
        if (!lastSeen) {
          window.localStorage.setItem("admin_last_seen_order_id", latestId);
          window.localStorage.setItem("admin_orders_alert_count", "0");
          setOrdersAlertCount(0);
          return;
        }
        if (lastSeen === latestId) {
          window.localStorage.setItem("admin_orders_alert_count", "0");
          setOrdersAlertCount(0);
          return;
        }
        const foundIndex = items.findIndex(
          (item) => String(item.id) === String(lastSeen)
        );
        const unseenCount = foundIndex === -1 ? items.length : foundIndex;
        window.localStorage.setItem(
          "admin_orders_alert_count",
          String(Math.max(unseenCount, 0))
        );
        setOrdersAlertCount(Math.max(unseenCount, 0));
      } catch (error) {
        // ignore alert errors
      }
    };
    loadSummary();
    loadAlerts();
    const interval = setInterval(() => {
      loadSummary();
      loadAlerts();
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
          const hasAlert = isOrders && ordersAlertCount > 0;
          const badgeText =
            ordersAlertCount > 99 ? "99+" : String(ordersAlertCount);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-card ${hasAlert ? "nav-card--alert" : ""}`}
              onClick={isOrders ? clearOrdersAlert : undefined}
            >
              {hasAlert && (
                <span className="nav-card__badge" aria-label="Nuevas ordenes">
                  {badgeText}
                </span>
              )}
              {item.label}
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
            <div className="stat-value">{stats.customers}</div>
            <div className="stat-label">Clientes</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.totalSales}</div>
            <div className="stat-label">Ventas totales</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.totalRevenueUsd} USD</div>
            <div className="stat-label">Total vendido</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.affiliates}</div>
            <div className="stat-label">Afiliados</div>
          </div>
        </div>
      </section>
    </main>
  );
}
