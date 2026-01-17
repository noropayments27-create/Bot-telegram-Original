import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";

import { apiFetch } from "../lib/api";
import styles from "../styles/NotificationsBell.module.css";

export default function NotificationsBell({ variant = "sidebar" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [lastSeenAt, setLastSeenAt] = useState(0);
  const wrapperRef = useRef(null);
  const storageKey = `admin_notifications_seen_at_${variant}`;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const storedValue = Number(window.sessionStorage.getItem(storageKey) || 0);
    if (storedValue) {
      setLastSeenAt(storedValue);
    }
  }, [storageKey]);

  useEffect(() => {
    const loadNotifications = async () => {
      try {
        const [ordersRes, ticketsRes] = await Promise.all([
          apiFetch("/admin/orders?page=1&page_size=5"),
          apiFetch("/admin/tickets?status=OPEN&page=1&page_size=5"),
        ]);

        const orders = (ordersRes.items || [])
          .filter((item) => item.status === "WAITING_PAYMENT")
          .map((item) => ({
            id: item.id,
            type: "Orden",
            status: item.status,
            created_at: item.created_at,
            text: `Orden ${item.order_number ? `#${String(item.order_number).padStart(5, "0")}` : item.id}`,
            href: `/orders?orderId=${item.id}`,
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
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        const path = router.pathname || "";
        const filtered = combined.filter((item) => {
          if (item.type === "Orden" && path.startsWith("/orders")) {
            return false;
          }
          if (item.type === "Ticket" && path.startsWith("/tickets")) {
            return false;
          }
          return true;
        });

        setNotifications(filtered.slice(0, 10));
      } catch (error) {
        // ignore notification errors
      }
    };

    loadNotifications();
    const interval = setInterval(loadNotifications, 5000);
    return () => clearInterval(interval);
  }, [router.pathname]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const handleClickOutside = (event) => {
      if (!wrapperRef.current || wrapperRef.current.contains(event.target)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [router.pathname]);

  useEffect(() => {
    const path = router.pathname || "";
    if (!path) {
      return;
    }
    setNotifications((prev) =>
      prev.filter((item) => {
        if (item.type === "Orden" && path.startsWith("/orders")) {
          return false;
        }
        if (item.type === "Ticket" && path.startsWith("/tickets")) {
          return false;
        }
        return true;
      })
    );
  }, [router.pathname]);

  const notificationCount = notifications.length;
  const newestAt = notifications.length
    ? Math.max(
        ...notifications
          .map((item) => new Date(item.created_at).getTime())
          .filter((value) => !Number.isNaN(value))
      )
    : 0;
  const unreadCount = notifications.filter((item) => {
    const createdAt = new Date(item.created_at).getTime();
    if (Number.isNaN(createdAt)) {
      return false;
    }
    return createdAt > lastSeenAt;
  }).length;
  const hasUnread = unreadCount > 0;
  const visibleNotifications = useMemo(
    () => notifications.slice(0, 5),
    [notifications]
  );

  return (
    <div
      ref={wrapperRef}
      className={`${styles.wrapper} ${styles[`wrapper${variant}`] || ""}`}
    >
      <button
        type="button"
        className={`${styles.bell} ${hasUnread ? styles.alerting : ""}`}
        aria-label="Notificaciones"
        onClick={() => {
          setOpen((prev) => {
            const nextOpen = !prev;
            if (nextOpen) {
              const seenAt = newestAt || Date.now();
              setLastSeenAt(seenAt);
              if (typeof window !== "undefined") {
                window.sessionStorage.setItem(storageKey, String(seenAt));
              }
            }
            return nextOpen;
          });
        }}
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={styles.bellIcon}
        >
          <path
            d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6"
            fill="none"
            stroke="#ff2400"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M9 17v1a3 3 0 0 0 6 0v-1"
            fill="none"
            stroke="#ff2400"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {unreadCount > 0 && (
          <span className={styles.badge}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className={`${styles.panel} ${styles[`panel${variant}`] || ""}`}>
          <img
            src="/bell.png"
            alt=""
            className={styles.panelIconImg}
            aria-hidden="true"
            onError={() => {
              // fallback to inline SVG if image fails to render
            }}
          />
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={styles.panelIconSvg}
          >
            <path
              d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M9 17v1a3 3 0 0 0 6 0v-1"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <h4 className={styles.panelTitle}>Notificaciones</h4>
          {visibleNotifications.length === 0 && (
            <p className={styles.empty}>Sin notificaciones.</p>
          )}
          {visibleNotifications.map((item) => (
            <button
              key={`${item.type}-${item.id}`}
              type="button"
              className={styles.item}
              onClick={() => {
                setOpen(false);
                router.push(item.href);
              }}
            >
              <div className={styles.itemTitle}>{item.text}</div>
              <div className={styles.itemMeta}>
                {item.type} · {item.status}
              </div>
              <div className={styles.itemTime}>
                {new Date(item.created_at).toLocaleString()}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
