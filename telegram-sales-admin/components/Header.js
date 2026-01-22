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
  const formatSequenceNumber = (value, size = 5) => {
    if (!value) {
      return null;
    }
    return String(value).padStart(size, "0");
  };
  const renderNotificationIcon = (type) => {
    const commonProps = {
      className: "bell-item__icon-svg",
      viewBox: "0 0 24 24",
      "aria-hidden": "true",
    };
    if (type === "Orden") {
      return (
        <svg {...commonProps}>
          <rect
            x="4"
            y="6"
            width="16"
            height="12"
            rx="2"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M8 10h8M8 14h6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    }
    if (type === "Ticket") {
      return (
        <svg {...commonProps}>
          <path
            d="M5 5h14v7a3 3 0 0 1-3 3H9l-4 4V5z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      );
    }
    if (type === "Pago") {
      return (
        <svg {...commonProps}>
          <path
            d="M12 4v16M8.5 8.5c0-1.4 1.6-2.5 3.5-2.5s3.5 1.1 3.5 2.5-1.6 2.5-3.5 2.5-3.5 1.1-3.5 2.5 1.6 2.5 3.5 2.5 3.5-1.1 3.5-2.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    }
    return (
      <svg {...commonProps}>
        <circle
          cx="12"
          cy="8"
          r="3"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M5 19a7 7 0 0 1 14 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  };

  useEffect(() => {
    setOpen(false);
    setBellOpen(false);
  }, [router.pathname]);

  useEffect(() => {
    const loadNotifications = async () => {
      try {
        const [
          ordersRes,
          ticketsRes,
          ticketsAllRes,
          payoutsRes,
          affiliatesRes,
        ] = await Promise.all([
          apiFetch("/admin/orders?page=1&page_size=5"),
          apiFetch("/admin/tickets?status=OPEN&page=1&page_size=5"),
          apiFetch("/admin/tickets?page=1&page_size=500"),
          apiFetch("/admin/payouts?status=REQUESTED&page=1&page_size=5"),
          apiFetch("/admin/affiliates?status=PENDING&page=1&page_size=5"),
        ]);

        const orders = (ordersRes.items || [])
          .filter((item) => item.status === "WAITING_PAYMENT")
          .map((item) => ({
          id: item.id,
          type: "Orden",
          status: item.status,
          created_at: item.created_at,
          text: `Orden #${formatSequenceNumber(item.order_number) || "-----"}`,
          href: `/orders/${item.id}`,
        }));

        const allTickets = ticketsAllRes.items || [];
        const ticketNumberMap = new Map();
        [...allTickets]
          .sort((a, b) => {
            const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
            const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
            return aTime - bTime;
          })
          .forEach((item, index) => {
            ticketNumberMap.set(item.id, String(index + 1).padStart(4, "0"));
          });

        const tickets = (ticketsRes.items || [])
          .filter((item) => item.last_message_at || item.last_message_preview)
          .map((item) => ({
          id: item.id,
          type: "Ticket",
          status: item.status,
          created_at: item.last_message_at || item.created_at,
          text: `Ticket #${ticketNumberMap.get(item.id) || "----"}`,
          href: `/tickets?ticketId=${item.id}`,
        }));

        const payouts = (payoutsRes.items || []).map((item) => ({
          id: item.id,
          type: "Pago",
          status: item.status,
          created_at: item.created_at,
          text: `Pago #${formatSequenceNumber(item.payout_number) || "-----"}`,
          href: `/payouts/${item.id}`,
        }));

        const affiliates = (affiliatesRes.items || []).map((item) => ({
          id: item.id,
          type: "Afiliado",
          status: item.status,
          created_at: item.created_at,
          text: `Afiliado #${formatSequenceNumber(item.affiliate_number) || "-----"}`,
          href: `/affiliates`,
        }));

        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        const combined = [...orders, ...tickets, ...payouts, ...affiliates]
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
    : router.pathname.startsWith("/payouts")
    ? "Pago"
    : router.pathname.startsWith("/affiliates")
    ? "Afiliado"
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
            <svg
              className="app-header__bell-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                d="M12 3a5 5 0 0 0-5 5v2.2c0 .9-.3 1.8-.9 2.5L4.5 15.5c-.4.6 0 1.5.8 1.5h13.4c.8 0 1.2-.9.8-1.5l-1.6-2.8c-.6-.7-.9-1.6-.9-2.5V8a5 5 0 0 0-5-5z"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M9.5 19a2.5 2.5 0 0 0 5 0"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
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
                  <span className="bell-item__icon">
                    {renderNotificationIcon(item.type)}
                  </span>
                  <span className="bell-item__content">
                    <div className="bell-item__title">{item.text}</div>
                    <div className="bell-item__meta">
                      {item.type} · {item.status}
                    </div>
                    <div className="bell-item__time">
                      {new Date(item.created_at).toLocaleString()}
                    </div>
                  </span>
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
