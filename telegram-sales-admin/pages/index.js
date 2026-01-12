import Link from "next/link";

export default function Home() {
  return (
    <main className="page">
      <section className="card">
        <h1>Telegram Sales Admin</h1>
        <p className="muted">Accesos rapidos</p>
        <div className="actions">
          <Link className="link" href="/login">Login</Link>
          <Link className="link" href="/dashboard">Dashboard</Link>
          <Link className="link" href="/inventory">Inventario</Link>
        </div>
      </section>
    </main>
  );
}
