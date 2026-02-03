import { useEffect, useState } from "react";
import { useRouter } from "next/router";

import { apiFetch, getAuthToken } from "../../lib/api";
import { IconPayments } from "../../components/PanelIcons";

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

const emptyCryptoAssetImages = {
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

function parseCryptoAssetImages(value) {
  if (!value) {
    return { ...emptyCryptoAssetImages, legacy: "", isJson: false };
  }
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object") {
      return {
        ...emptyCryptoAssetImages,
        ...parsed,
        legacy: "",
        isJson: true,
      };
    }
  } catch (error) {
    // Fall back to legacy text below.
  }
  return { ...emptyCryptoAssetImages, legacy: String(value), isJson: false };
}

function buildCryptoAssetImages(currentValue, selectedKey, nextValue) {
  const parsed = parseCryptoAssetImages(currentValue);
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

export default function PaymentMethodsPage() {
  const router = useRouter();
  const [methods, setMethods] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingKey, setEditingKey] = useState("");
  const [cryptoDestinationKey, setCryptoDestinationKey] = useState("usdt_bsc");
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
    const isCrypto = String(selected.key || "").toUpperCase() === "CRYPTO";
    if (isCrypto) {
      const parsedDestination = parseCryptoDestination(selected.destination || "");
      const parsedAssets = parseCryptoAssetImages(selected.asset_images || "");
      const firstMatch = CRYPTO_DESTINATION_OPTIONS.find(
        (option) => parsedDestination[option.key] || parsedAssets[option.key]
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
        asset_images: form.asset_images.trim(),
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

  const isCryptoMethod = form.method_key.trim().toUpperCase() === "CRYPTO";
  const cryptoDestination = isCryptoMethod
    ? parseCryptoDestination(form.destination)
    : null;
  const cryptoAssetImages = isCryptoMethod
    ? parseCryptoAssetImages(form.asset_images)
    : null;
  const destinationValue = isCryptoMethod
    ? cryptoDestination.isJson
      ? cryptoDestination[cryptoDestinationKey] || ""
      : cryptoDestination.legacy || ""
    : form.destination;
  const cryptoAssetImageValue = isCryptoMethod
    ? cryptoAssetImages.isJson
      ? cryptoAssetImages[cryptoDestinationKey] || ""
      : cryptoAssetImages.legacy || ""
    : "";

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
            <IconPayments className="panel-icon" />
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
          <div className="payment-methods-inline-group">
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
          {isCryptoMethod && (
            <div className="payment-methods-crypto-selector">
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
          {isCryptoMethod && (
            <label className="payment-methods-crypto-image">
              Imagen cripto (URL)
              <input
                type="text"
                value={cryptoAssetImageValue}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    asset_images: buildCryptoAssetImages(
                      prev.asset_images,
                      cryptoDestinationKey,
                      event.target.value
                    ),
                  }))
                }
                placeholder="https://..."
              />
            </label>
          )}
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
