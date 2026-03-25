import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

import { apiFetch, getAuthToken } from "../lib/api";
import { IconImages } from "../components/PanelIcons";
import Toast from "../components/Toast";

const BOT_IMAGE_FIELDS = [
  { baseKey: "main", label: "Inicio" },
  { baseKey: "shop_section", label: "Panel: Tienda" },
  { baseKey: "cart", label: "Panel: Carrito" },
  { baseKey: "community", label: "Panel: Comunidad" },
  { baseKey: "affiliate_panel", label: "Panel: Afiliados" },
  { baseKey: "affiliate_invoice", label: "Factura afiliado" },
  { baseKey: "support", label: "Panel: Soporte" },
  { baseKey: "payment_methods", label: "Panel: Elige método de pago" },
  { baseKey: "wallet", label: "Panel: Mi saldo" },
  { baseKey: "wallet_topup", label: "Panel: Recargar saldo" },
  { baseKey: "wallet_history", label: "Panel: Historial wallet" },
];

const CRYPTO_ASSET_OPTIONS = [
  { key: "btc", label: "Cripto BTC" },
  { key: "usdt_tron", label: "Cripto USDT Tron" },
  { key: "usdt_bsc", label: "Cripto USDT BSC" },
  { key: "ltc", label: "Cripto LTC" },
];

const emptyAssets = BOT_IMAGE_FIELDS.reduce((acc, field) => {
  acc[`${field.baseKey}_image_url`] = "";
  acc[`${field.baseKey}_image_file_id`] = "";
  return acc;
}, {});

function getAssetUrlKey(baseKey) {
  return `${baseKey}_image_url`;
}

function getAssetFileIdKey(baseKey) {
  return `${baseKey}_image_file_id`;
}

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
  const [cryptoAssetFileIds, setCryptoAssetFileIds] = useState(emptyCryptoAssets);
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
    let loadedAssets = false;
    let loadedMethods = false;

    try {
      const assetsRes = await apiFetch("/admin/bot-assets");
      const nextAssets = assetsRes?.assets || {};
      setAssets({ ...emptyAssets, ...nextAssets });
      loadedAssets = true;
    } catch (_err) {
      loadedAssets = false;
    }

    try {
      const methodsRes = await apiFetch("/admin/payment-methods");
      const nextMethods = Array.isArray(methodsRes?.methods)
        ? methodsRes.methods
        : [];
      setMethods(nextMethods);
      const cryptoMethod = nextMethods.find(
        (item) => String(item?.key || "").toUpperCase() === "CRYPTO"
      );
      setCryptoAssets(parseCryptoAssetImages(cryptoMethod?.asset_images || ""));
      setCryptoAssetFileIds(parseCryptoAssetImages(cryptoMethod?.asset_file_ids || ""));
      loadedMethods = true;
    } catch (_err) {
      loadedMethods = false;
    }

    if (!loadedAssets && !loadedMethods) {
      setToast("No se pudieron cargar las imágenes ni los métodos de pago.");
    } else if (!loadedAssets) {
      setToast("No se pudieron cargar las imágenes del bot.");
    } else if (!loadedMethods) {
      setToast("No se pudieron cargar las imágenes de métodos de pago.");
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

  const handleMethodFileIdChange = (key, value) => {
    setMethods((prev) =>
      prev.map((method) =>
        method.key === key ? { ...method, image_file_id: value } : method
      )
    );
  };

  const handleCryptoAssetChange = (key, value) => {
    setCryptoAssets((prev) => ({ ...prev, [key]: value }));
  };

  const handleCryptoAssetFileIdChange = (key, value) => {
    setCryptoAssetFileIds((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveAssets = async () => {
    setSavingAssets(true);
    setToast("");
    try {
      const payload = {};
      BOT_IMAGE_FIELDS.forEach((field) => {
        payload[getAssetUrlKey(field.baseKey)] = assets[getAssetUrlKey(field.baseKey)] || "";
        payload[getAssetFileIdKey(field.baseKey)] = assets[getAssetFileIdKey(field.baseKey)] || "";
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
          asset_file_ids: isCrypto ? JSON.stringify(cryptoAssetFileIds) : method.asset_file_ids,
          image_url: method.image_url,
          image_file_id: method.image_file_id,
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
          <p className="muted">Pega la URL o el Telegram file_id. Si hay file_id, el bot lo usa primero.</p>
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
            <li key={field.baseKey}>
              <span className="images-label">{field.label}</span>
              <input
                className="images-input"
                type="text"
                value={assets[getAssetUrlKey(field.baseKey)] || ""}
                onChange={(event) =>
                  handleAssetChange(getAssetUrlKey(field.baseKey), event.target.value)
                }
                placeholder="https://..."
              />
              <input
                className="images-input"
                type="text"
                value={assets[getAssetFileIdKey(field.baseKey)] || ""}
                onChange={(event) =>
                  handleAssetChange(getAssetFileIdKey(field.baseKey), event.target.value)
                }
                placeholder="Telegram file_id"
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
              <input
                className="images-input"
                type="text"
                value={method.image_file_id || ""}
                onChange={(event) =>
                  handleMethodFileIdChange(method.key, event.target.value)
                }
                placeholder="Telegram file_id"
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
              <input
                className="images-input"
                type="text"
                value={method.image_file_id || ""}
                onChange={(event) =>
                  handleMethodFileIdChange(method.key, event.target.value)
                }
                placeholder="Telegram file_id"
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
              <input
                className="images-input"
                type="text"
                value={cryptoAssetFileIds[asset.key] || ""}
                onChange={(event) =>
                  handleCryptoAssetFileIdChange(asset.key, event.target.value)
                }
                placeholder="Telegram file_id"
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
