import { useEffect, useState } from "react";

export default function Dashboard() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  // ✅ Define baseUrl en el scope del componente (ya existe siempre aquí)
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  useEffect(() => {
    console.log("BASE URL:", JSON.stringify(baseUrl));

    const loadHealth = async () => {
      try {
        const response = await fetch(`${baseUrl}/health`);
        if (!response.ok) throw new Error("Health check failed");
        const data = await response.json();
        setHealth(data);
      } catch (err) {
        setError("No se pudo obtener el estado de la API");
      }
    };

    if (baseUrl) {
      loadHealth();
    } else {
      setError("NEXT_PUBLIC_API_BASE_URL no está configurado");
    }
  }, [baseUrl]);

  return (
    <main className="page">
      <section className="card">
        <h1>Dashboard</h1>
        <p className="muted">Estado del servicio</p>
        {error && <p className="error">{error}</p>}
        {health && <pre className="code">{JSON.stringify(health, null, 2)}</pre>}
      </section>
    </main>
  );
}
