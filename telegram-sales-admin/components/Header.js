import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

const NAV_LINKS = [
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
  const headerRef = useRef(null);

  useEffect(() => {
    setOpen(false);
  }, [router.pathname]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const handleClickOutside = (event) => {
      if (!headerRef.current || headerRef.current.contains(event.target)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <header className="app-header" ref={headerRef}>
      <div className="app-header__content">
        <Link className="app-header__logo" href="/orders" aria-label="Inicio">
          <img
            src="https://i.ibb.co/BHjWqgf5/No3.png"
            alt="Logo"
          />
        </Link>
        <button
          type="button"
          className="app-header__menu"
          aria-label="Abrir menu"
          aria-expanded={open ? "true" : "false"}
          aria-controls="app-header-menu"
          onClick={() => setOpen((prev) => !prev)}
        >
          <span />
          <span />
          <span />
        </button>
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
