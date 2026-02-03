import { useEffect, useState } from "react";
import { useRouter } from "next/router";

import { apiFetch, getAuthToken } from "../../lib/api";
import { IconPayments } from "../../components/PanelIcons";
import GridLayout, { WidthProvider } from "react-grid-layout";

const ResponsiveGridLayout = WidthProvider(GridLayout);

const CRYPTO_DESTINATION_OPTIONS = [
  { key: "btc", label: "BTC" },
  { key: "usdt_tron", label: "USDT Tron" },
  { key: "usdt_bsc", label: "USDT BSC" },
  { key: "ltc", label: "LTC" },
];

const emptyCryptoDestination = {
  btc: "",
  usdt_tron: "",
  usdt_bsc: "",
  ltc: "",
};

function parseCryptoDestination(value) {
  if (!value) {
    return { ...emptyCryptoDestination, legacy: "", isJson: false };
  }
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object") {
      return {
        ...emptyCryptoDestination,
        ...parsed,
        legacy: "",
        isJson: true,
      };
    }
  } catch (error) {
    // Fall back to legacy text below.
  }
  return { ...emptyCryptoDestination, legacy: String(value), isJson: false };
}

function buildCryptoDestination(currentValue, selectedKey, nextValue) {
  const parsed = parseCryptoDestination(currentValue);
  const next = {
    btc: parsed.btc || "",
    usdt_tron: parsed.usdt_tron || "",
    usdt_bsc: parsed.usdt_bsc || "",
    ltc: parsed.ltc || "",
  };
  next[selectedKey] = nextValue;
  return JSON.stringify(next);
}

const emptyForm = {
  method_key: "",
  label: "",
  description: "",
  destination: "",
  asset_images: "",
  image_url: "",
  markup: "",
  sort_order: "",
  enabled: false,
};

const layoutApiKey = "payment-methods";

const defaultFormLayout = [
  { i: "key", x: 0, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
  { i: "label", x: 3, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
  { i: "midline", x: 0, y: 2, w: 12, h: 2, minW: 4, minH: 2 },
  { i: "destination", x: 0, y: 4, w: 8, h: 4, minW: 4, minH: 3 },
  { i: "description", x: 0, y: 8, w: 8, h: 2, minW: 3, minH: 2 },
  { i: "actions", x: 0, y: 10, w: 12, h: 2, minW: 4, minH: 2 },
];

const defaultPageLayout = [
  { i: "header", x: 0, y: 0, w: 12, h: 2, minW: 6, minH: 2 },
  { i: "form", x: 0, y: 2, w: 12, h: 12, minW: 6, minH: 6 },
  { i: "list", x: 0, y: 14, w: 12, h: 12, minW: 6, minH: 6 },
];

const normalizeLayout = (defaults, saved) => {
  if (!Array.isArray(saved)) {
    return defaults;
  }
  const savedMap = new Map(saved.map((item) => [item.i, item]));
  return defaults.map((item) => ({
    ...item,
    ...(savedMap.get(item.i) || {}),
  }));
};

export default function PaymentMethodsPage() {
  const router = useRouter();
  const [methods, setMethods] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingKey, setEditingKey] = useState("");
  const [cryptoDestinationKey, setCryptoDestinationKey] = useState("usdt_bsc");
  const [layoutEditing, setLayoutEditing] = useState(false);
  const [formLayout, setFormLayout] = useState(defaultFormLayout);
  const [pageLayout, setPageLayout] = useState(defaultPageLayout);
  const [layoutStatus, setLayoutStatus] = useState("");
  const [layoutError, setLayoutError] = useState("");
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

  useEffect(() => {
    const loadLayouts = async () => {
      try {
        const data = await apiFetch(`/admin/layouts/${layoutApiKey}`);
        const layout = data?.layout || {};
        setPageLayout(normalizeLayout(defaultPageLayout, layout.page_layout));
        setFormLayout(normalizeLayout(defaultFormLayout, layout.form_layout));
      } catch (err) {
        setLayoutError("No se pudo cargar el diseño.");
      }
    };
    loadLayouts();
  }, []);

  const persistLayout = async (nextPageLayout, nextFormLayout) => {
    try {
      setLayoutStatus("saving");
      setLayoutError("");
      const data = await apiFetch(`/admin/layouts/${layoutApiKey}`, {
        method: "POST",
        body: JSON.stringify({
          page_layout: nextPageLayout,
          form_layout: nextFormLayout,
        }),
      });
      const layout = data?.layout || {};
      setPageLayout(normalizeLayout(defaultPageLayout, layout.page_layout));
      setFormLayout(normalizeLayout(defaultFormLayout, layout.form_layout));
      setLayoutStatus("saved");
    } catch (err) {
      setLayoutStatus("error");
      setLayoutError("No se pudo guardar el diseño.");
    } finally {
      setTimeout(() => setLayoutStatus(""), 1500);
    }
  };

  const handlePageLayoutChange = (nextLayout) => {
    if (!layoutEditing) {
      return;
    }
    setPageLayout(nextLayout);
  };

  const handleFormLayoutChange = (nextLayout) => {
    if (!layoutEditing) {
      return;
    }
    setFormLayout(nextLayout);
  };

  const handleToggleLayoutEditing = async () => {
    if (layoutEditing) {
      setLayoutEditing(false);
      await persistLayout(pageLayout, formLayout);
      return;
    }
    setLayoutEditing(true);
  };

  const handleSaveLayout = async () => {
    await persistLayout(pageLayout, formLayout);
  };

  const handleResetLayout = async () => {
    setPageLayout(defaultPageLayout);
    setFormLayout(defaultFormLayout);
    await persistLayout(defaultPageLayout, defaultFormLayout);
  };

  const handleEdit = (method) => {
    const selected = methods.find((item) => item.key === method.key) || method;
    const markupValue = String(selected.markup ?? "")
      .replace(/\D/g, "")
      .slice(0, 2);
    const isCrypto = String(selected.key || "").toUpperCase() === "CRYPTO";
    if (isCrypto) {
      const parsedDestination = parseCryptoDestination(selected.destination || "");
      const firstMatch = CRYPTO_DESTINATION_OPTIONS.find(
        (option) => parsedDestination[option.key]
      );
      setCryptoDestinationKey(firstMatch ? firstMatch.key : "usdt_bsc");
    }
    setEditingKey(selected.key);
    setForm({
      method_key: selected.key ?? "",
      label: selected.label ?? "",
      description: selected.description ?? "",
      destination: selected.destination ?? "",
      asset_images: selected.asset_images ?? "",
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
        description: form.description.trim(),
        destination: form.destination.trim(),
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


  const isCryptoMethod = form.method_key.trim().toUpperCase() === "CRYPTO";
  const cryptoDestination = isCryptoMethod
    ? parseCryptoDestination(form.destination)
    : null;
  const destinationValue = isCryptoMethod
    ? cryptoDestination.isJson
      ? cryptoDestination[cryptoDestinationKey] || ""
      : cryptoDestination.legacy || ""
    : form.destination;

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

  return (
    <main className="page payment-methods-page">
      <div className="payment-methods-layout-controls">
        <button
          type="button"
          onClick={handleToggleLayoutEditing}
          className={layoutEditing ? "is-active" : ""}
        >
          {layoutEditing ? "Listo" : "Editar diseño"}
        </button>
        {layoutEditing && (
          <>
            <button type="button" onClick={handleSaveLayout}>
              Guardar
            </button>
            <button type="button" className="plain-button" onClick={handleResetLayout}>
              Restablecer
            </button>
          </>
        )}
        {layoutStatus === "saved" && <span className="muted">Diseño guardado.</span>}
        {layoutError && <span className="error">{layoutError}</span>}
      </div>
      <ResponsiveGridLayout
        className="payment-methods-page-grid"
        cols={12}
        rowHeight={32}
        margin={[16, 16]}
        layout={pageLayout}
        onLayoutChange={handlePageLayoutChange}
        isDraggable={layoutEditing}
        isResizable={layoutEditing}
        draggableHandle=".pm-layout-handle"
        compactType={null}
        preventCollision
      >
        <section
          key="header"
          className="card payment-methods-card pm-layout-card payment-methods-header-card"
        >
          {layoutEditing && <div className="pm-layout-handle">⋮⋮</div>}
          <div className="payment-methods-header">
            <h1 className="payment-methods-title-main">
              <IconPayments className="panel-icon" />
              Métodos de pago
            </h1>
          </div>
          {message && <p className="muted">{message}</p>}
          {error && <p className="error">{error}</p>}
        </section>
        <section key="form" className="card payment-methods-card pm-layout-card">
          {layoutEditing && <div className="pm-layout-handle">⋮⋮</div>}
          <div className="payment-methods-form">
            <ResponsiveGridLayout
              className="payment-methods-grid"
              cols={12}
              rowHeight={32}
              margin={[12, 12]}
              layout={formLayout}
              onLayoutChange={handleFormLayoutChange}
              isDraggable={layoutEditing}
              isResizable={layoutEditing}
              draggableHandle=".pm-grid-handle"
              compactType={null}
              preventCollision
            >
            <div key="key" className="pm-grid-item">
              {layoutEditing && <div className="pm-grid-handle">⋮⋮</div>}
              <label>
                Key
                <input
                  type="text"
                  value={form.method_key}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      method_key: event.target.value.toUpperCase(),
                    }))
                  }
                  disabled={Boolean(editingKey)}
                  placeholder="NEQUI"
                />
              </label>
            </div>
            <div key="label" className="pm-grid-item">
              {layoutEditing && <div className="pm-grid-handle">⋮⋮</div>}
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
            </div>
            <div key="midline" className="pm-grid-item">
              {layoutEditing && <div className="pm-grid-handle">⋮⋮</div>}
              <div className="payment-methods-midline">
                {isCryptoMethod && (
                  <div className="payment-methods-crypto-inline">
                    <span className="payment-methods-crypto-label">Tipo de cripto</span>
                    <div className="payment-methods-crypto-buttons">
                      {CRYPTO_DESTINATION_OPTIONS.map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          className={`payment-methods-crypto-button${
                            cryptoDestinationKey === option.key ? " is-active" : ""
                          }`}
                          onClick={() => setCryptoDestinationKey(option.key)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
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
                <label className="payment-methods-order">
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
              </div>
            </div>
            <div key="destination" className="pm-grid-item">
              {layoutEditing && <div className="pm-grid-handle">⋮⋮</div>}
              <label className="payment-methods-destination">
                Direcciones de destino
                <textarea
                  value={destinationValue}
                  onChange={(event) =>
                    setForm((prev) => {
                      if (!isCryptoMethod) {
                        return { ...prev, destination: event.target.value };
                      }
                      const nextDestination = buildCryptoDestination(
                        prev.destination,
                        cryptoDestinationKey,
                        event.target.value
                      );
                      return { ...prev, destination: nextDestination };
                    })
                  }
                  rows={3}
                  placeholder={"Número: 3000000000\nNombre: Juan Perez\nWallet: 0x..."}
                />
              </label>
            </div>
            <div key="description" className="pm-grid-item">
              {layoutEditing && <div className="pm-grid-handle">⋮⋮</div>}
              <label className="payment-methods-description">
                Descripción
                <input
                  type="text"
                  value={form.description}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, description: event.target.value }))
                  }
                  placeholder="Descripción del método"
                />
              </label>
            </div>
            <div key="actions" className="pm-grid-item">
              {layoutEditing && <div className="pm-grid-handle">⋮⋮</div>}
              <div className="payment-methods-actions">
                <button type="button" onClick={handleSave}>
                  {editingKey ? "Actualizar" : "Agregar"}
                </button>
                <button type="button" className="plain-button" onClick={handleClear}>
                  Limpiar
                </button>
              </div>
            </div>
          </ResponsiveGridLayout>
          </div>
        </section>
        <section key="list" className="card payment-methods-list-card pm-layout-card">
          {layoutEditing && <div className="pm-layout-handle">⋮⋮</div>}
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
                    <td>
                      <span
                        className={`payment-methods-status${
                          method.enabled ? " is-active" : ""
                        }`}
                      >
                        {method.enabled ? "Activo" : "Desactivado"}
                      </span>
                    </td>
                    <td>
                      <div className="payment-methods-row-actions">
                        <button type="button" onClick={() => handleEdit(method)}>
                          Editar
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
      </ResponsiveGridLayout>
    </main>
  );
}
