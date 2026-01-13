import Link from "next/link";

export default function Dashboard() {
  const navCards = [
    { href: "/orders", label: "Ordenes" },
    { href: "/inventory", label: "Inventario" },
    { href: "/tickets", label: "Tickets" },
    { href: "/broadcasts", label: "Difusiones" },
    { href: "/payouts", label: "Pagos" },
    { href: "/affiliates", label: "Afiliados" },
  ];

  const stats = [
    { label: "Clientes", value: "128" },
    { label: "Ventas totales", value: "42" },
    { label: "Total vendido", value: "$3,580" },
    { label: "Afiliados", value: "19" },
  ];

  return (
    <main className="page">
      <section className="card">
        <h1>Panel Principal</h1>
        <p className="muted">Accesos directos</p>
        <div className="dashboard-grid">
          {navCards.map((item) => (
            <Link key={item.href} href={item.href} className="nav-card">
              {item.label}
            </Link>
          ))}
        </div>
      </section>
      <section className="card" style={{ marginTop: "24px" }}>
        <h2>Resumen</h2>
        <div className="stats-grid">
          {stats.map((stat) => (
            <div key={stat.label} className="stat-card">
              <div className="stat-value">{stat.value}</div>
              <div className="stat-label">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
