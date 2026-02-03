import { useEffect, useState } from "react";
import { useRouter } from "next/router";

import { apiFetch, getAuthToken } from "../../lib/api";

const emptyForm = {
  method_key: "",
  label: "",
  image_url: "",
  markup: "",
  sort_order: "",
  enabled: true,
};

export default function PaymentMethodsPage() {
  const router = useRouter();
  const [methods, setMethods] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingKey, setEditingKey] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/login");
    }
  }, [router]);

  const loadMethods = async () => {
    try {
      const data = await apiFetch("/admin/payment-methods");
      setMethods(Array.isArray(data?.methods) ? data.methods : []);
      setError("");
    } catch (err) {
      setError("No se pudieron cargar los métodos de pago.");
    }
  };

  useEffect(() => {
    loadMethods();
  }, []);

  const handleEdit = (method) => {
    const selected = methods.find((item) => item.key === method.key) || method;
    const markupValue = String(selected.markup ?? "")
      .replace(/\D/g, "")
      .slice(0, 2);
    setEditingKey(selected.key);
    setForm({
      method_key: selected.key ?? "",
      label: selected.label ?? "",
      image_url: selected.image_url ?? "",
      markup: markupValue,
      sort_order: selected.sort_order ?? "",
      enabled: Boolean(selected.enabled),
    });
    setMessage("");
    setError("");
  };

  const handleClear = () => {
    setEditingKey("");
    setForm(emptyForm);
    setMessage("");
    setError("");
  };

  const handleSave = async () => {
    setMessage("");
    setError("");
    if (!form.method_key.trim()) {
      setError("El key es obligatorio.");
      return;
    }
    try {
      const payload = {
        method_key: form.method_key.trim(),
        label: form.label.trim(),
        image_url: form.image_url.trim(),
        markup: form.markup,
        sort_order: form.sort_order === "" ? null : Number(form.sort_order),
        enabled: Boolean(form.enabled),
      };
      const data = await apiFetch("/admin/payment-methods", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setMethods(Array.isArray(data?.methods) ? data.methods : []);
      setMessage(editingKey ? "Método actualizado." : "Método creado.");
      if (!editingKey) {
        setForm(emptyForm);
      }
    } catch (err) {
      setError("No se pudo guardar el método de pago.");
    }
  };

  const handleDelete = async (key) => {
    const confirmed = window.confirm("¿Eliminar este método de pago?");
    if (!confirmed) {
      return;
    }
    try {
      const data = await apiFetch(`/admin/payment-methods/${key}`, {
        method: "DELETE",
      });
      setMethods(Array.isArray(data?.methods) ? data.methods : []);
      if (editingKey === key) {
        handleClear();
      }
    } catch (err) {
      setError("No se pudo eliminar el método de pago.");
    }
  };

  const handleToggle = async (key) => {
    try {
      const data = await apiFetch(`/admin/payment-methods/${key}/toggle`, {
        method: "POST",
      });
      setMethods(Array.isArray(data?.methods) ? data.methods : []);
    } catch (err) {
      setError("No se pudo actualizar el método de pago.");
    }
  };

  return (
    <main className="page payment-methods-page">
      <section className="card payment-methods-card">
        <div className="payment-methods-header">
          <h1 className="payment-methods-title-main">
            <span className="payment-methods-title-icon" aria-hidden="true">💳</span>
            Métodos de pago
          </h1>
        </div>
        {message && <p className="muted">{message}</p>}
        {error && <p className="error">{error}</p>}
        <div className="payment-methods-form">
          <label>
            Key
            <input
              type="text"
              value={form.method_key}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, method_key: event.target.value.toUpperCase() }))
              }
              disabled={Boolean(editingKey)}
              placeholder="NEQUI"
            />
          </label>
          <label>
            Nombre
            <input
              type="text"
              value={form.label}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, label: event.target.value }))
              }
              placeholder="Nequi"
            />
          </label>
          <label>
            Orden
            <input
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={form.sort_order}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  sort_order: event.target.value.replace(/\D/g, "").slice(0, 1),
                }))
              }
              placeholder="1"
              className="payment-methods-order-input"
            />
          </label>
          <label className="payment-methods-checkbox">
            <input
              type="checkbox"
              checked={Boolean(form.enabled)}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, enabled: event.target.checked }))
              }
            />
            Activo
          </label>
          <label className="payment-methods-image">
            Imagen (URL)
            <input
              type="text"
              value={form.image_url}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, image_url: event.target.value }))
              }
              placeholder="https://..."
            />
          </label>
          <label className="payment-methods-markup">
            Markup (%)
            <div className="payment-methods-inline-field">
              <input
                type="text"
                inputMode="numeric"
                maxLength={2}
                value={form.markup}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    markup: event.target.value.replace(/\D/g, "").slice(0, 2),
                  }))
                }
                placeholder="0"
                className="payment-methods-percent-input"
              />
              <span className="payment-methods-percent-suffix">%</span>
            </div>
          </label>
          <div className="payment-methods-actions">
            <button type="button" onClick={handleSave}>
              {editingKey ? "Actualizar" : "Agregar"}
            </button>
            <button type="button" className="plain-button" onClick={handleClear}>
              Limpiar
            </button>
          </div>
        </div>
      </section>

      <section className="card payment-methods-list-card">
        <h3>Lista de métodos</h3>
        <div className="table-scroll">
          <table style={{ width: "100%" }}>
            <thead>
              <tr>
                <th align="left">Key</th>
                <th align="left">Nombre</th>
                <th align="left">Orden</th>
                <th align="left">Estado</th>
                <th align="left">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {methods.map((method) => (
                <tr key={method.key}>
                  <td>{method.key}</td>
                  <td>{method.label}</td>
                  <td>{method.sort_order ?? "-"}</td>
                  <td>{method.enabled ? "Activo" : "Desactivado"}</td>
                  <td>
                    <div className="payment-methods-row-actions">
                      <button type="button" onClick={() => handleEdit(method)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className="plain-button"
                        onClick={() => handleToggle(method.key)}
                      >
                        {method.enabled ? "Desactivar" : "Activar"}
                      </button>
                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => handleDelete(method.key)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {methods.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    Sin métodos registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
