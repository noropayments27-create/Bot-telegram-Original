import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

import { apiFetch, getAuthToken } from "../lib/api";
import { IconImages } from "../components/PanelIcons";
import Toast from "../components/Toast";

const BOT_IMAGE_FIELDS = [
  { key: "main_image_url", label: "Inicio" },
  { key: "shop_section_image_url", label: "Panel: Tienda" },
  { key: "cart_image_url", label: "Panel: Carrito" },
  { key: "community_image_url", label: "Panel: Comunidad" },
  { key: "affiliate_panel_image_url", label: "Panel: Afiliados" },
  { key: "affiliate_invoice_image_url", label: "Factura afiliado" },
  { key: "support_image_url", label: "Panel: Soporte" },
  { key: "payment_methods_image_url", label: "Panel: Elige método de pago" },
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
  affiliate_invoice_image_url: "",
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

function isCryptoMethodEntry(method) {
  const key = String(method?.key || "").trim().toUpperCase();
  const label = String(method?.label || "").trim().toUpperCase();
  if (key === "CRYPTO") {
    return true;
  }
  const cryptoTokens = ["CRYPTO", "BTC", "USDT", "LTC", "TRON", "BSC", "ETH", "BINANCE PAY"];
  return cryptoTokens.some((token) => key.includes(token) || label.includes(token));
}

export default function ImagesPage() {
  const router = useRouter();
  const [assets, setAssets] = useState(emptyAssets);
  const [methods, setMethods] = useState([]);
  const [cryptoAssets, setCryptoAssets] = useState(emptyCryptoAssets);
  const [toast, setToast] = useState("");
  const [isHowToOpen, setIsHowToOpen] = useState(false);
  const [savingAssets, setSavingAssets] = useState(false);
  const [savingMethods, setSavingMethods] = useState(false);

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }
    const timer = setTimeout(() => setToast(""), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

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
    } catch (err) {
      setToast("No se pudieron cargar las imágenes del bot.");
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

  const paymentImageMethods = useMemo(
    () => orderedMethods.filter((method) => !isCryptoMethodEntry(method)),
    [orderedMethods]
  );

  const cryptoImageMethods = useMemo(
    () => orderedMethods.filter((method) => isCryptoMethodEntry(method)),
    [orderedMethods]
  );

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
    setToast("");
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
      setToast("Imágenes del bot actualizadas.");
    } catch (err) {
      setToast("No se pudieron guardar las imágenes del bot.");
    } finally {
      setSavingAssets(false);
    }
  };

  const handleSaveMethodImages = async () => {
    setSavingMethods(true);
    setToast("");
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
      setToast("Imágenes de métodos actualizadas.");
    } catch (err) {
      setToast("No se pudieron guardar las imágenes de métodos.");
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
          <button
            type="button"
            className="images-help-trigger"
            onClick={() => setIsHowToOpen(true)}
          >
            <span className="images-help-trigger__icon" aria-hidden="true">i</span>
            <span>¿Como agregar imagenes? Click acá</span>
          </button>
        </div>
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
          {paymentImageMethods.map((method) => (
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
          {paymentImageMethods.length === 0 && (
            <li>
              <span className="images-label muted">Sin métodos de pago no cripto.</span>
            </li>
          )}
        </ol>
        <h3 className="images-section-title">Cripto</h3>
        <ol className="images-list">
          {cryptoImageMethods.map((method) => (
            <li key={`crypto-${method.key}`}>
              <span className="images-label">Pago {method.label || method.key}</span>
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
      <Toast message={toast} />
      {isHowToOpen && (
        <div
          className="editor-link-overlay"
          role="button"
          tabIndex={0}
          onClick={() => setIsHowToOpen(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setIsHowToOpen(false);
            }
          }}
        >
          <div
            className="editor-link-modal images-help-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Cómo agregar imágenes"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Cómo subir una imagen a IMGBB y obtener el enlace directo</h3>
            <ol className="images-help-steps">
              <li>
                <span className="images-help-step-icon" aria-hidden="true">1</span>
                <div>
                  <strong>Entra a la página</strong>
                  <p>
                    Crea una cuenta GRATIS en:{" "}
                    <a
                      className="images-help-link"
                      href="https://imgbb.com"
                      target="_blank"
                      rel="noreferrer"
                    >
                      https://imgbb.com
                    </a>
                  </p>
                </div>
              </li>
              <li>
                <span className="images-help-step-icon" aria-hidden="true">2</span>
                <div>
                  <strong>Sube tu imagen</strong>
                  <p>
                    Haz clic en “Subir” y selecciona la imagen desde tu PC o móvil.
                  </p>
                </div>
              </li>
              <li>
                <span className="images-help-step-icon" aria-hidden="true">3</span>
                <div>
                  <strong>Espera la carga</strong>
                  <p>
                    La imagen se subirá en unos segundos y te llevará a una pantalla con varios enlaces.
                  </p>
                </div>
              </li>
              <li>
                <span className="images-help-step-icon" aria-hidden="true">4</span>
                <div>
                  <strong>Copia el enlace directo</strong>
                  <p>
                    Busca la opción “Enlaces Directos” y cópialo. Ese link termina normalmente en
                    <code>.jpg</code>, <code>.png</code> o <code>.webp</code>.
                  </p>
                </div>
              </li>
              <li>
                <span className="images-help-step-icon" aria-hidden="true">5</span>
                <div>
                  <strong>Úsalo en tu web</strong>
                  <p>
                    Ese enlace directo es el que debes pegar en el lugar correspondiente.
                  </p>
                </div>
              </li>
            </ol>
            <div className="actions editor-link-actions">
              <button type="button" onClick={() => setIsHowToOpen(false)}>
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
