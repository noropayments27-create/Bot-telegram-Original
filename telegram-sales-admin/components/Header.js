import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { apiFetch, clearAuthToken } from "../lib/api";

const NAV_LINKS = [
  { href: "/dashboard", label: "Principal" },
  { href: "/orders", label: "Ordenes" },
  { href: "/inventory", label: "Inventario" },
  { href: "/tickets", label: "Tickets" },
  { href: "/broadcasts", label: "Difusiones" },
  { href: "/payouts", label: "Pagos" },
  { href: "/affiliates", label: "Afiliados" },
];

export default function Header() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const headerRef = useRef(null);

  useEffect(() => {
    setOpen(false);
    setBellOpen(false);
  }, [router.pathname]);

  useEffect(() => {
    const loadNotifications = async () => {
      try {
        const ordersRes = await apiFetch("/admin/orders?page=1&page_size=5");
        const ticketsRes = await apiFetch("/admin/tickets?status=OPEN&page=1&page_size=5");

        const orders = (ordersRes.items || [])
          .filter((item) => item.status === "WAITING_PAYMENT")
          .map((item) => ({
          id: item.id,
          type: "Orden",
          status: item.status,
          created_at: item.created_at,
          text: `Orden ${item.order_number ? `#${String(item.order_number).padStart(5, "0")}` : item.id}`,
          href: `/orders/${item.id}`,
        }));

        const tickets = (ticketsRes.items || []).map((item) => ({
          id: item.id,
          type: "Ticket",
          status: item.status,
          created_at: item.last_message_at || item.created_at,
          text: `Ticket #${item.id}`,
          href: `/tickets/${item.id}`,
        }));

        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        const combined = [...orders, ...tickets]
          .filter((item) => item.created_at)
          .filter((item) => new Date(item.created_at).getTime() >= cutoff)
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .slice(0, 10);

        setNotifications(combined);
      } catch (error) {
        // ignore notification errors
      }
    };

    loadNotifications();
    const interval = setInterval(loadNotifications, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open && !bellOpen) {
      return undefined;
    }
    const handleClickOutside = (event) => {
      if (!headerRef.current || headerRef.current.contains(event.target)) {
        return;
      }
      setOpen(false);
      setBellOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, bellOpen]);

  const hiddenType = router.pathname.startsWith("/orders")
    ? "Orden"
    : router.pathname.startsWith("/tickets")
    ? "Ticket"
    : null;

  const visibleNotifications = hiddenType
    ? notifications.filter((item) => item.type !== hiddenType)
    : notifications;

  const notificationCount = visibleNotifications.length;

  return (
    <header className="app-header" ref={headerRef}>
      <div className="app-header__content">
        <Link className="app-header__logo" href="/dashboard" aria-label="Inicio">
          <img
            src="https://i.ibb.co/BHjWqgf5/No3.png"
            alt="Logo"
          />
        </Link>
        <div className="app-header__actions">
          <button
            type="button"
            className={`app-header__bell ${notificationCount > 0 ? "is-alerting" : ""}`}
            aria-label="Notificaciones"
            onClick={() => setBellOpen((prev) => !prev)}
          >
            🔔
            {notificationCount > 0 && (
              <span className="app-header__bell-badge">
                {notificationCount > 99 ? "99+" : notificationCount}
              </span>
            )}
          </button>
          {bellOpen && (
            <div className="app-header__bell-panel">
              <h4>Notificaciones</h4>
              {visibleNotifications.length === 0 && (
                <p className="muted">Sin notificaciones.</p>
              )}
              {visibleNotifications.map((item) => (
                <button
                  key={`${item.type}-${item.id}`}
                  type="button"
                  className="bell-item bell-item--alert"
                  onClick={() => {
                    setBellOpen(false);
                    router.push(item.href);
                  }}
                >
                  <div className="bell-item__title">{item.text}</div>
                  <div className="bell-item__meta">
                    {item.type} · {item.status}
                  </div>
                  <div className="bell-item__time">
                    {new Date(item.created_at).toLocaleString()}
                  </div>
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            className="app-header__menu"
            aria-label="Abrir menu"
            aria-expanded={open ? "true" : "false"}
            aria-controls="app-header-menu"
            onClick={() => {
              setBellOpen(false);
              setOpen((prev) => !prev);
            }}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>
      <div
        className={`app-header__panel ${open ? "is-open" : ""}`}
        id="app-header-menu"
        role="menu"
      >
        {NAV_LINKS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="app-header__link"
            role="menuitem"
          >
            {item.label}
          </Link>
        ))}
        <button
          type="button"
          className="app-header__logout"
          onClick={() => {
            clearAuthToken();
            router.replace("/login");
          }}
        >
          Cerrar sesion
        </button>
      </div>
      {open && (
        <button
          type="button"
          className="app-header__backdrop"
          aria-label="Cerrar menu"
          onClick={() => setOpen(false)}
        />
      )}
    </header>
  );
}
