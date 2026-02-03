import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

import { apiFetch, getAuthToken } from "../lib/api";
import { IconImages } from "../components/PanelIcons";

const BOT_IMAGE_FIELDS = [
  { key: "main_image_url", label: "Inicio" },
  { key: "shop_section_image_url", label: "Tienda" },
  { key: "cart_image_url", label: "Carrito" },
  { key: "community_image_url", label: "Comunidad" },
  { key: "affiliate_panel_image_url", label: "Afiliados" },
  { key: "support_image_url", label: "Soporte" },
  { key: "payment_methods_image_url", label: "Elige método" },
];

const CRYPTO_ASSET_OPTIONS = [
  { key: "btc", label: "Cripto BTC" },
  { key: "usdt_tron", label: "Cripto USDT Tron" },
  { key: "usdt_bsc", label: "Cripto USDT BSC" },
  { key: "ltc", label: "Cripto LTC" },
];

const emptyAssets = {
  main_image_url: "",
  shop_section_image_url: "",
  cart_image_url: "",
  community_image_url: "",
  affiliate_panel_image_url: "",
  support_image_url: "",
  payment_methods_image_url: "",
};

const emptyCryptoAssets = {
  btc: "",
  usdt_tron: "",
  usdt_bsc: "",
  ltc: "",
};

function parseCryptoAssetImages(value) {
  if (!value) {
    return { ...emptyCryptoAssets };
  }
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object") {
      return { ...emptyCryptoAssets, ...parsed };
    }
  } catch (error) {
    // Fall back to legacy string below.
  }
  return { ...emptyCryptoAssets, btc: String(value) };
}

export default function ImagesPage() {
  const router = useRouter();
  const [assets, setAssets] = useState(emptyAssets);
  const [methods, setMethods] = useState([]);
  const [cryptoAssets, setCryptoAssets] = useState(emptyCryptoAssets);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [savingAssets, setSavingAssets] = useState(false);
  const [savingMethods, setSavingMethods] = useState(false);

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/login");
    }
  }, [router]);

  const loadData = async () => {
    try {
      const [assetsRes, methodsRes] = await Promise.all([
        apiFetch("/admin/bot-assets"),
        apiFetch("/admin/payment-methods"),
      ]);
      const nextAssets = assetsRes?.assets || {};
      setAssets({ ...emptyAssets, ...nextAssets });
      const nextMethods = Array.isArray(methodsRes?.methods)
        ? methodsRes.methods
        : [];
      setMethods(nextMethods);
      const cryptoMethod = nextMethods.find(
        (item) => String(item?.key || "").toUpperCase() === "CRYPTO"
      );
      setCryptoAssets(parseCryptoAssetImages(cryptoMethod?.asset_images || ""));
      setError("");
    } catch (err) {
      setError("No se pudieron cargar las imágenes del bot.");
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const orderedMethods = useMemo(() => {
    return [...methods].sort((a, b) => {
      const orderA = a?.sort_order ?? 999;
      const orderB = b?.sort_order ?? 999;
      if (orderA !== orderB) {
        return Number(orderA) - Number(orderB);
      }
      return String(a?.label || a?.key || "").localeCompare(
        String(b?.label || b?.key || "")
      );
    });
  }, [methods]);

  const handleAssetChange = (key, value) => {
    setAssets((prev) => ({ ...prev, [key]: value }));
  };

  const handleMethodImageChange = (key, value) => {
    setMethods((prev) =>
      prev.map((method) =>
        method.key === key ? { ...method, image_url: value } : method
      )
    );
  };

  const handleCryptoAssetChange = (key, value) => {
    setCryptoAssets((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveAssets = async () => {
    setSavingAssets(true);
    setMessage("");
    setError("");
    try {
      const payload = {};
      BOT_IMAGE_FIELDS.forEach((field) => {
        payload[field.key] = assets[field.key] || "";
      });
      const data = await apiFetch("/admin/bot-assets", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setAssets({ ...emptyAssets, ...(data?.assets || {}) });
      setMessage("Imágenes del bot actualizadas.");
    } catch (err) {
      setError("No se pudieron guardar las imágenes del bot.");
    } finally {
      setSavingAssets(false);
    }
  };

  const handleSaveMethodImages = async () => {
    setSavingMethods(true);
    setMessage("");
    setError("");
    try {
      const payloads = methods.map((method) => {
        const isCrypto = String(method?.key || "").toUpperCase() === "CRYPTO";
        return {
          method_key: method.key,
          label: method.label,
          description: method.description,
          destination: method.destination,
          asset_images: isCrypto ? JSON.stringify(cryptoAssets) : method.asset_images,
          image_url: method.image_url,
          markup: method.markup,
          sort_order: method.sort_order,
          enabled: method.enabled,
        };
      });
      await Promise.all(
        payloads.map((payload) =>
          apiFetch("/admin/payment-methods", {
            method: "POST",
            body: JSON.stringify(payload),
          })
        )
      );
      await loadData();
      setMessage("Imágenes de métodos actualizadas.");
    } catch (err) {
      setError("No se pudieron guardar las imágenes de métodos.");
    } finally {
      setSavingMethods(false);
    }
  };

  return (
    <main className="page images-page">
      <section className="card images-card">
        <div className="images-header">
          <h1 className="icon-inline">
            <IconImages className="panel-icon" /> Imagenes
          </h1>
          <p className="muted">Pega los enlaces y actualiza.</p>
        </div>
        {message && <p className="muted">{message}</p>}
        {error && <p className="error">{error}</p>}
        <h3 className="images-section-title">Bot</h3>
        <ol className="images-list">
          {BOT_IMAGE_FIELDS.map((field) => (
            <li key={field.key}>
              <span className="images-label">{field.label}</span>
              <input
                className="images-input"
                type="text"
                value={assets[field.key] || ""}
                onChange={(event) => handleAssetChange(field.key, event.target.value)}
                placeholder="https://..."
              />
            </li>
          ))}
        </ol>
        <div className="images-actions">
          <button type="button" onClick={handleSaveAssets} disabled={savingAssets}>
            {savingAssets ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </section>

      <section className="card images-card">
        <h3 className="images-section-title">Métodos de pago</h3>
        <ol className="images-list">
          {orderedMethods.map((method) => (
            <li key={method.key}>
              <span className="images-label">
                Pago {method.label || method.key}
              </span>
              <input
                className="images-input"
                type="text"
                value={method.image_url || ""}
                onChange={(event) =>
                  handleMethodImageChange(method.key, event.target.value)
                }
                placeholder="https://..."
              />
            </li>
          ))}
        </ol>
        <h3 className="images-section-title">Cripto</h3>
        <ol className="images-list">
          {CRYPTO_ASSET_OPTIONS.map((asset) => (
            <li key={asset.key}>
              <span className="images-label">{asset.label}</span>
              <input
                className="images-input"
                type="text"
                value={cryptoAssets[asset.key] || ""}
                onChange={(event) =>
                  handleCryptoAssetChange(asset.key, event.target.value)
                }
                placeholder="https://..."
              />
            </li>
          ))}
        </ol>
        <div className="images-actions">
          <button type="button" onClick={handleSaveMethodImages} disabled={savingMethods}>
            {savingMethods ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </section>
    </main>
  );
}
