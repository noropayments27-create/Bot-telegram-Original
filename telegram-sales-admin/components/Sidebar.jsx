import Link from "next/link";
import { useRouter } from "next/router";

import styles from "../styles/Sidebar.module.css";
import { clearAuthToken } from "../lib/api";
import NotificationsBell from "./NotificationsBell";

const NAV_ITEMS = [
  {
    label: "Principal",
    href: "/dashboard",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M4 4h7v7H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 13h7v7H4z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
    ),
  },
  {
    label: "Ordenes",
    href: "/orders",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M6 4h9l3 3v13H6z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M9 11h6M9 15h6" stroke="currentColor" strokeWidth="2" />
      </svg>
    ),
  },
  {
    label: "Inventario",
    href: "/inventory",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M4 7l8-3 8 3-8 3z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M4 7v8l8 3 8-3V7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    label: "Tickets",
    href: "/tickets",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M4 5h16v10H8l-4 4z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    label: "Difusiones",
    href: "/broadcasts",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M4 12l10-5v10zM14 7l6-2v14l-6-2"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    label: "Pagos",
    href: "/payouts",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M4 7h16v10H4z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M8 11h4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    label: "Afiliados",
    href: "/affiliates",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M7 12a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM17 12a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M2 20c1.5-3 4-4 6-4s4.5 1 6 4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

export default function Sidebar({ open, onClose }) {
  const router = useRouter();

  return (
    <aside className={`${styles.sidebar} ${open ? styles.open : ""}`}>
      <div className={styles.sidebarHeader}>
        <div className={styles.brandGroup}>
          <div className={styles.logoCircle}>
            <img src="https://i.ibb.co/qYq42F7v/noro.png" alt="Noropayments" />
          </div>
          <div className={styles.brandText}>
            <span className={styles.brandTitle}>Noropayments</span>
            <span className={styles.brandSubtitle}>Admin</span>
          </div>
        </div>
        <NotificationsBell variant="sidebar" />
      </div>

      <nav className={styles.nav}>
        {NAV_ITEMS.map((item) => {
          const isActive =
            router.pathname === item.href
            || (item.href !== "/" && router.pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
              onClick={() => {
                if (open && onClose) {
                  onClose();
                }
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.logoutButton}
          onClick={() => {
            clearAuthToken();
            router.replace("/login");
          }}
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
