import { useEffect, useState } from "react";
import { useRouter } from "next/router";

import { getAdminKey, setAdminKey } from "../lib/api";

export default function Login() {
  const router = useRouter();
  const [adminKey, setKey] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (getAdminKey()) {
      router.replace("/orders");
    }
  }, [router]);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!adminKey.trim()) {
      setError("Ingresa la Admin Key.");
      return;
    }
    setAdminKey(adminKey.trim());
    router.push("/orders");
  };

  return (
    <main className="page">
      <section className="card">
        <h1>Admin Login</h1>
        <p className="muted">Ingresa tu Admin Key para acceder.</p>
        {error && <p className="error">{error}</p>}
        <form className="form" onSubmit={handleSubmit}>
          <label>
            Admin Key
            <input
              type="password"
              value={adminKey}
              onChange={(event) => setKey(event.target.value)}
              placeholder="ADMIN_KEY"
            />
          </label>
          <button type="submit">Ingresar</button>
        </form>
      </section>
    </main>
  );
}
