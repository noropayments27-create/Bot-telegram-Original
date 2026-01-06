import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { apiFetch, getAdminKey } from "../../lib/api";

export default function BroadcastsPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getAdminKey()) {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    const loadBroadcasts = async () => {
      try {
        const params = new URLSearchParams({
          page: String(page),
          page_size: "20",
        });

        const data = await apiFetch(`/admin/broadcasts?${params.toString()}`);
        setItems(data.items || []);
        setTotalPages(data.total_pages || 1);
        setError("");
      } catch (err) {
        setError("No se pudo cargar broadcasts.");
      }
    };

    loadBroadcasts();
  }, [page]);

  return (
    <main className="page">
      <section className="card" style={{ width: "min(900px, 100%)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1>Broadcasts</h1>
          <Link className="link" href="/broadcasts/new">
            Crear
          </Link>
        </div>
        {error && <p className="error">{error}</p>}
        <table style={{ width: "100%", marginTop: "16px" }}>
          <thead>
            <tr>
              <th align="left">ID</th>
              <th align="left">Estado</th>
              <th align="left">Segmento</th>
              <th align="left">Creado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((broadcast) => (
              <tr key={broadcast.id}>
                <td>{broadcast.id}</td>
                <td>{broadcast.status}</td>
                <td>{broadcast.segment}</td>
                <td>{broadcast.created_at ? new Date(broadcast.created_at).toLocaleString() : "-"}</td>
                <td>
                  <Link className="link" href={`/broadcasts/${broadcast.id}`}>
                    Ver
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="actions" style={{ marginTop: "16px" }}>
          <button
            type="button"
            onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
            disabled={page <= 1}
          >
            Anterior
          </button>
          <button
            type="button"
            onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
            disabled={page >= totalPages}
          >
            Siguiente
          </button>
        </div>
      </section>
    </main>
  );
}
