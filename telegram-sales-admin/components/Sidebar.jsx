import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import styles from "../styles/Sidebar.module.css";
import { apiFetch, clearAuthToken } from "../lib/api";
import NotificationsBell from "./NotificationsBell";

const NAV_ITEMS = [
  {
    label: "Principal",
    href: "/dashboard",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M5 4h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M5 16h4a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M15 12h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M15 4h4a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    label: "Metodo de pagos",
    href: "/payment-methods",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M3 7h18a2 2 0 0 1 2 2v1H1V9a2 2 0 0 1 2-2"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M1 10h22v6a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2v-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M16 14h3"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    label: "Imagenes",
    href: "/images",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M8 11l2.5 -2.5a1 1 0 0 1 1.4 0l4.1 4.1a1 1 0 0 0 1.4 0l1.6 -1.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M8 9a1 1 0 1 0 0.01 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
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
          d="M14 3v4a1 1 0 0 0 1 1h4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M9 7l1 0" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M9 13l6 0" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M13 17l2 0" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "Inventario",
    href: "/inventory",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 3l8 4.5l0 9l-8 4.5l-8 -4.5l0 -9l8 -4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12 12l8 -4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12 12l0 9"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12 12l-8 -4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
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
          d="M15 5l0 2"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M15 11l0 2"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M15 17l0 2"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M5 5h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-3a2 2 0 0 0 0 -4v-3a2 2 0 0 1 2 -2"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
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
          d="M18.364 19.364a9 9 0 1 0 -12.728 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M15.536 16.536a5 5 0 1 0 -7.072 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M11 13a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
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
          d="M17 8v-3a1 1 0 0 0 -1 -1h-10a2 2 0 0 0 0 4h12a1 1 0 0 1 1 1v3m0 4v3a1 1 0 0 1 -1 1h-12a2 2 0 0 1 -2 -2v-12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M20 12v4h-4a2 2 0 0 1 0 -4h4"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
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
          d="M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M16 3.13a4 4 0 0 1 0 7.75"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M21 21v-2a4 4 0 0 0 -3 -3.85"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

export default function Sidebar({ open, onClose }) {
  const router = useRouter();
  const [totalUsers, setTotalUsers] = useState(null);

  useEffect(() => {
    let active = true;
    const loadTotalUsers = async () => {
      try {
        const data = await apiFetch("/admin/users/total");
        if (!active) {
          return;
        }
        const nextValue = Number(data?.total || 0);
        setTotalUsers(Number.isNaN(nextValue) ? 0 : nextValue);
      } catch (error) {
        if (active) {
          setTotalUsers(null);
        }
      }
    };
    loadTotalUsers();
    return () => {
      active = false;
    };
  }, []);

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

      <div className={styles.sidebarContent}>
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

        <div className={styles.usersCounter}>
          <span className={styles.usersCounterLabel}>Usuarios Totales</span>
          <span className={styles.usersCounterValue}>
            {totalUsers === null ? "—" : totalUsers}
          </span>
        </div>

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
      </div>
    </aside>
  );
}
