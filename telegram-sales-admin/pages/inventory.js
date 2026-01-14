import { useEffect, useState } from "react";
import { useRouter } from "next/router";

import {
  apiFetch,
  clearAuthToken,
  getApiBaseUrl,
  getAuthToken,
} from "../lib/api";

export default function InventoryPage() {
  const router = useRouter();
  const [skuKey, setSkuKey] = useState("");
  const [productId, setProductId] = useState("");
  const [detail, setDetail] = useState(null);
  const [unitsSummary, setUnitsSummary] = useState([]);
  const [unitsSample, setUnitsSample] = useState([]);
  const [unitsStatus, setUnitsStatus] = useState("AVAILABLE");
  const [simpleStock, setSimpleStock] = useState("");
  const [simpleUnlimited, setSimpleUnlimited] = useState(false);
  const [template, setTemplate] = useState("");
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadErrors, setUploadErrors] = useState([]);
  const [message, setMessage] = useState("");
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [holdsActive, setHoldsActive] = useState([]);
  const [holdsHeldQty, setHoldsHeldQty] = useState(0);
  const [releaseTarget, setReleaseTarget] = useState(null);
  const [releaseConfirm, setReleaseConfirm] = useState("");
  const [releaseError, setReleaseError] = useState("");
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState("");
  const [modeFilter, setModeFilter] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [editingProductId, setEditingProductId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createCategory, setCreateCategory] = useState("tienda");
  const [createPrice, setCreatePrice] = useState("0");
  const [createMode, setCreateMode] = useState("SIMPLE");
  const [createShowStock, setCreateShowStock] = useState(true);
  const [createUnique, setCreateUnique] = useState(false);
  const [createDescription, setCreateDescription] = useState(
    Array.from({ length: 8 }, () => "⌾ ").join("\n")
  );
  const [editProductName, setEditProductName] = useState("");
  const [editCategory, setEditCategory] = useState("tienda");
  const [editPrice, setEditPrice] = useState("0");
  const [editDescription, setEditDescription] = useState(
    Array.from({ length: 8 }, () => "⌾ ").join("\n")
  );
  const [editShowStock, setEditShowStock] = useState(true);
  const [editUnique, setEditUnique] = useState(false);
  const [editStockMode, setEditStockMode] = useState("SIMPLE");
  const [toast, setToast] = useState("");
  const unitsSummaryList = unitsSummary.length > 0
    ? unitsSummary
    : detail?.units_summary_mapped || [];

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/login");
    }
  }, [router]);

  const normalizePriceValue = (value) => {
    const numeric = Math.trunc(Number(value));
    return Number.isNaN(numeric) ? "0" : String(numeric);
  };

  const normalizePriceInput = (value) => {
    if (value === "") {
      return "";
    }
    return normalizePriceValue(value);
  };

  const notifyMessage = (text) => {
    setMessage(text);
    setToast(text);
  };

  const notifyWarning = (text) => {
    setWarning(text);
    setToast(text);
  };

  const notifyError = (text) => {
    setError(text);
    setToast(text);
  };

  const notifyReleaseError = (text) => {
    setReleaseError(text);
    setToast(text);
  };

  const setStockToggle = (mode) => {
    if (mode === "stock") {
      setEditShowStock(true);
      setSimpleUnlimited(false);
      setEditUnique(false);
      return;
    }
    if (mode === "unlimited") {
      setEditShowStock(false);
      setSimpleUnlimited(true);
      setEditUnique(false);
      setSimpleStock("");
      return;
    }
    if (mode === "unique") {
      setEditShowStock(false);
      setSimpleUnlimited(false);
      setEditUnique(true);
      setSimpleStock("");
    }
  };

  const resolveErrorMessage = (err, fallback) => {
    const code = err?.payload?.error;
    const mapped = {
      NAME_REQUIRED: "El nombre no puede estar vacío.",
      PRICE_INVALID: "El precio es inválido.",
      STOCK_MODE_INVALID: "El modo de stock es inválido.",
      STOCK_REQUIRED: "Debes indicar el stock o marcarlo como ilimitado.",
      STOCK_INVALID: "El stock es inválido.",
      PRODUCT_NOT_FOUND: "Producto no encontrado.",
      DELIVERY_TYPE_INVALID: "El tipo de entrega es inválido.",
    };
    if (mapped[code]) {
      return mapped[code];
    }
    if (typeof code === "string" && code.trim()) {
      return code;
    }
    return fallback;
  };

  const loadProducts = async (options = {}) => {
    const { silent = false } = options;
    if (!silent) {
      setProductsLoading(true);
      setProductsError("");
    }
    try {
      let page = 1;
      let totalPages = 1;
      const all = [];
      while (page <= totalPages) {
        const data = await apiFetch(
          `/products?active=true&page=${page}&page_size=50`
        );
        const items = Array.isArray(data.items) ? data.items : [];
        all.push(...items);
        totalPages = Number(data.total_pages || totalPages);
        page += 1;
      }
      setProducts(all);
    } catch (err) {
      if (!silent) {
        setProductsError("No se pudo cargar el catálogo.");
        setToast("No se pudo cargar el catálogo.");
      }
    } finally {
      if (!silent) {
        setProductsLoading(false);
      }
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }
    const timeout = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (modeFilter || detail) {
      return undefined;
    }
    const interval = setInterval(() => {
      if (!modeFilter && !detail) {
        loadProducts({ silent: true });
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [detail, modeFilter]);

  const loadInspect = async (identifier) => {
    const params = new URLSearchParams();
    if (identifier.productId) {
      params.set("product_id", identifier.productId);
    }
    if (identifier.skuKey) {
      params.set("sku_key", identifier.skuKey);
    }
    const data = await apiFetch(`/admin/stock/inspect?${params.toString()}`, {
      cache: "no-store",
    });
    setDetail(data);
    setSimpleStock(
      data?.product?.stock_qty === null || data?.product?.stock_qty === undefined
        ? ""
        : String(data.product.stock_qty)
    );
    setSimpleUnlimited(
      data?.product?.stock_qty === null || data?.product?.stock_qty === undefined
    );
    setEditProductName(stripCategoryPrefix(data?.product?.name || ""));
    setEditCategory(getCategoryKey(data?.product?.name || ""));
    setEditPrice(
      data?.product?.price === null || data?.product?.price === undefined
        ? "0"
        : normalizePriceValue(data.product.price)
    );
    setEditDescription(
      ensureDescriptionTemplate(data?.product?.description || "")
    );
    setEditShowStock(
      data?.product?.show_stock === undefined ? true : Boolean(data.product.show_stock)
    );
    setEditUnique(Boolean(data?.product?.unique_purchase));
    setEditStockMode(data?.product?.stock_mode || "SIMPLE");
    setTemplate(data?.product?.delivery_template || "");
    return data;
  };

  const loadHolds = async (identifier) => {
    const params = new URLSearchParams();
    if (identifier.productId) {
      params.set("product_id", identifier.productId);
    }
    if (identifier.skuKey) {
      params.set("sku_key", identifier.skuKey);
    }
    const data = await apiFetch(`/admin/stock/holds/active?${params.toString()}`, {
      cache: "no-store",
    });
    setHoldsActive(data.holds_active || []);
    setHoldsHeldQty(Number(data.held_qty || 0));
  };

  const loadUnits = async (identifier, statusValue) => {
    const params = new URLSearchParams();
    if (identifier.productId) {
      params.set("product_id", identifier.productId);
    }
    if (identifier.skuKey) {
      params.set("sku_key", identifier.skuKey);
    }
    if (statusValue) {
      params.set("status", statusValue);
    }
    params.set("limit", "50");
    const data = await apiFetch(`/admin/stock/units?${params.toString()}`, {
      cache: "no-store",
    });
    setUnitsSummary(data.summary || []);
    setUnitsSample(data.sample || []);
  };

  const handleSelectProduct = async (product) => {
    if (!product?.id) {
      return;
    }
    setProductId(product.id);
    setSkuKey(product.sku_key || "");
    setModeFilter(product.stock_mode || modeFilter);
    setError("");
    setMessage("");
    setWarning("");
    try {
      const data = await loadInspect({ productId: product.id });
      await loadUnits({ productId: data.product.id }, unitsStatus);
      await loadHolds({ productId: data.product.id });
    } catch (err) {
      notifyError("No se pudo cargar el inventario.");
    }
  };

  const handleEditStart = (product) => {
    setEditingProductId(product.id);
    setEditingName(stripCategoryPrefix(product.name || ""));
  };

  const handleEditCancel = () => {
    setEditingProductId(null);
    setEditingName("");
  };

  const handleEditSave = async (product) => {
    const nextName = editingName.trim();
    if (!nextName) {
      notifyError("El nombre no puede estar vacío.");
      return;
    }
    try {
      const finalName = buildNameWithPrefix(product.name, nextName);
      const data = await apiFetch(`/admin/products/${product.id}/name`, {
        method: "POST",
        body: JSON.stringify({ name: finalName }),
      });
      const updated = data.product;
      setProducts((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      );
      if (detail?.product?.id === updated.id) {
        setDetail((prev) => ({
          ...prev,
          product: {
            ...prev.product,
            name: updated.name,
          },
        }));
      }
      setEditingProductId(null);
      setEditingName("");
      setToast("Guardado con exito: nombre");
    } catch (err) {
      notifyError("No se pudo guardar el nombre.");
    }
  };

  function stripCategoryPrefix(name) {
    const cleaned = String(name || "").trim();
    const prefixes = ["SHOP", "METODOS", "VIP", "WEB"];
    const upper = cleaned.toUpperCase();
    for (const base of prefixes) {
      const basePrefix = `${base} `;
      if (!upper.startsWith(basePrefix)) {
        continue;
      }
      const remainder = cleaned.slice(basePrefix.length);
      if (remainder.startsWith("- ")) {
        return remainder.slice(2).trim();
      }
      if (remainder.includes(" - ")) {
        const [maybeCode, rest] = remainder.split(" - ", 2);
        if (/^[0-9]+$/.test(maybeCode.trim())) {
          return rest.trim();
        }
      }
      return remainder.trim();
    }
    return cleaned;
  }

  function buildNameWithPrefix(originalName, displayName) {
    const trimmedName = String(displayName || "").trim();
    if (!trimmedName) {
      return trimmedName;
    }
    const prefixes = ["SHOP", "METODOS", "VIP", "WEB"];
    const cleaned = String(originalName || "").trim();
    const upper = cleaned.toUpperCase();
    for (const base of prefixes) {
      if (upper.startsWith(`${base} `)) {
        return `${base} - ${trimmedName}`;
      }
    }
    return trimmedName;
  }

  function ensureDescriptionTemplate(value) {
    const rawLines = String(value || "").split("\n");
    const lines = [];
    for (let i = 0; i < 8; i += 1) {
      const raw = rawLines[i] || "";
      const withoutMarker = raw.replace(/^⌾\s*/, "");
      lines.push(`⌾ ${withoutMarker}`);
    }
    return lines.join("\n");
  }

  function buildDescriptionPayload(value) {
    const lines = String(value || "")
      .split("\n")
      .map((line) => line.replace(/^⌾\s*/, "").trim())
      .filter((line) => line.length > 0);
    return lines.join("\n");
  }

  const getSkuOrder = (item) => {
    const code = String(item?.code || "").toUpperCase();
    const match = code.match(/^([A-Z])([0-9]{5})$/);
    if (!match) {
      return null;
    }
    return Number(match[2]);
  };

  const handleCreateProduct = async () => {
    const trimmedName = createName.trim();
    if (!trimmedName) {
      notifyError("El nombre no puede estar vacío.");
      return;
    }
    const normalizedPrice = createPrice === "" ? "0" : createPrice;
    setIsSubmitting(true);
    setError("");
    try {
      const data = await apiFetch("/admin/products", {
        method: "POST",
        body: JSON.stringify({
          display_name: trimmedName,
          category_key: createCategory,
          price: normalizedPrice,
          stock_mode: createMode,
          show_stock: createShowStock,
          unique_purchase: createUnique,
          description: buildDescriptionPayload(createDescription),
        }),
      });
      const created = data.product;
      await loadProducts({ silent: true });
      setCreateName("");
      setCreatePrice("0");
      setCreateMode("SIMPLE");
      setCreateShowStock(true);
      setCreateUnique(false);
      setCreateDescription(Array.from({ length: 8 }, () => "⌾ ").join("\n"));
      setCreateOpen(false);
      setToast("Producto creado");
    } catch (err) {
      notifyError(resolveErrorMessage(err, "No se pudo crear el producto."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveProduct = async () => {
    if (!detail?.product) {
      return;
    }
    const trimmedName = editProductName.trim();
    if (!trimmedName) {
      notifyError("El nombre no puede estar vacío.");
      return;
    }
    const normalizedPrice = editPrice === "" ? "0" : editPrice;
    const normalizedSimpleStock = simpleUnlimited
      ? ""
      : simpleStock === ""
        ? "0"
        : simpleStock;
    setIsSubmitting(true);
    setError("");
    setMessage("");
    setWarning("");
    try {
      const data = await apiFetch(`/admin/products/${detail.product.id}/update`, {
        method: "POST",
        body: JSON.stringify({
          display_name: trimmedName,
          category_key: editCategory,
          price: normalizedPrice,
          description: buildDescriptionPayload(editDescription),
          show_stock: editShowStock,
          unique_purchase: editUnique,
          stock_mode: editStockMode,
        }),
      });
      const updated = data.product;
      setProducts((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      );
      if (editStockMode === "SIMPLE") {
        await apiFetch("/admin/stock/simple/set", {
          method: "POST",
          body: JSON.stringify({
            product_id: detail.product.id,
            stock_qty: normalizedSimpleStock,
            unlimited: simpleUnlimited,
          }),
        });
      }
      setToast("Cambios actualizados y reflejados en el panel y el bot.");
      await loadInspect({ productId: detail.product.id });
      await loadUnits({ productId: detail.product.id }, unitsStatus);
      await loadHolds({ productId: detail.product.id });
    } catch (err) {
      notifyError(resolveErrorMessage(err, "No se pudo actualizar el producto."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProduct = async (product) => {
    if (!product?.id) {
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      await apiFetch(`/admin/products/${product.id}/deactivate`, { method: "POST" });
      setProducts((prev) => prev.filter((item) => item.id !== product.id));
      if (detail?.product?.id === product.id) {
        setDetail(null);
        setCategoryFilter(null);
      }
      setToast("Producto eliminado");
    } catch (err) {
      notifyError("No se pudo eliminar el producto.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getCategoryKey = (name) => {
    const raw = String(name || "").toUpperCase();
    if (raw.startsWith("SHOP ")) return "tienda";
    if (raw.startsWith("METODOS ")) return "metodos";
    if (raw.startsWith("VIP ")) return "vip";
    if (raw.startsWith("WEB ")) return "programas";
    return "tienda";
  };

  const categoryOptions = [
    { key: "tienda", label: "Tienda", prefix: "SHOP " },
    { key: "metodos", label: "Métodos", prefix: "METODOS " },
    { key: "vip", label: "Grupos VIP", prefix: "VIP " },
    { key: "programas", label: "Programas y Web", prefix: "WEB " },
  ];

  const productsByMode = products.filter(
    (item) => item.stock_mode === modeFilter
  );

  const categoryCounts = categoryOptions.reduce((acc, option) => {
    acc[option.key] = productsByMode.filter((item) =>
      String(item.name || "").toUpperCase().startsWith(option.prefix)
    ).length;
    return acc;
  }, {});

  const handleTemplateSave = async () => {
    if (!detail?.product) {
      return;
    }
    setIsSubmitting(true);
    setError("");
    setMessage("");
    setWarning("");
    try {
      await apiFetch("/admin/stock/template/set", {
        method: "POST",
        body: JSON.stringify({
          product_id: detail.product.id,
          delivery_template: template,
        }),
      });
      notifyMessage("Guardado con exito: template");
      await loadInspect({ productId: detail.product.id });
      await loadUnits({ productId: detail.product.id }, unitsStatus);
      await loadHolds({ productId: detail.product.id });
    } catch (err) {
      notifyError("No se pudo guardar el template.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpload = async () => {
    if (!detail?.product || !uploadFile) {
      return;
    }
    setIsSubmitting(true);
    setError("");
    setMessage("");
    setWarning("");
    setUploadErrors([]);
    try {
      const token = getAuthToken();
      const formData = new FormData();
      formData.append("file", uploadFile);
      const response = await fetch(
        `${getApiBaseUrl()}/admin/stock/units/upload?product_id=${detail.product.id}`,
        {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          body: formData,
        }
      );
      let data = {};
      try {
        data = await response.json();
      } catch (err) {
        data = {};
      }
      if (response.status === 401) {
        clearAuthToken();
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        notifyError(
          data.error
            ? `No se pudo cargar el CSV: ${data.error}`
            : "No se pudo cargar el CSV."
        );
      } else {
        const insertedCount = data.inserted_count || 0;
        const failedRows = Array.isArray(data.failed_rows) ? data.failed_rows : [];
        if (insertedCount > 0) {
          notifyMessage(`✅ Insertadas: ${insertedCount}`);
        }
        if (failedRows.length > 0) {
          notifyWarning("⚠️ Algunas filas fallaron.");
        }
        if (insertedCount === 0 && failedRows.length > 0) {
          notifyWarning("⚠️ No se insertaron filas. Revisa los errores.");
        }
        setUploadErrors(failedRows);
        await loadInspect({ productId: detail.product.id });
        await loadUnits({ productId: detail.product.id }, unitsStatus);
        await loadHolds({ productId: detail.product.id });
      }
      setUploadFile(null);
    } catch (err) {
      notifyError("No se pudo cargar el CSV.");
      setUploadErrors([]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnitsStatusChange = async (event) => {
    const value = event.target.value;
    setUnitsStatus(value);
    if (detail?.product) {
      await loadUnits({ productId: detail.product.id }, value);
    }
  };

  const copyText = async (value, label) => {
    try {
      await navigator.clipboard.writeText(String(value));
      setToast(label ? `${label} copiado` : "Copiado al portapapeles");
    } catch (err) {
      notifyError("No se pudo copiar al portapapeles.");
    }
  };

  const openRelease = (hold) => {
    setReleaseTarget(hold);
    setReleaseConfirm("");
    setReleaseError("");
  };

  const closeRelease = () => {
    setReleaseTarget(null);
    setReleaseConfirm("");
    setReleaseError("");
  };

  const handleRelease = async () => {
    if (!releaseTarget || releaseConfirm !== "LIBERAR") {
      return;
    }
    setIsSubmitting(true);
    setReleaseError("");
    try {
      await apiFetch(
        `/admin/stock/holds/${releaseTarget.id}/release?product_id=${detail.product.id}`,
        {
          method: "POST",
          body: JSON.stringify({ confirm: true }),
        }
      );
      notifyMessage("✅ Hold liberado.");
      await loadInspect({ productId: detail.product.id });
      await loadHolds({ productId: detail.product.id });
      await loadUnits({ productId: detail.product.id }, unitsStatus);
      closeRelease();
    } catch (err) {
      notifyReleaseError("No se pudo liberar el hold.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="page">
      <h1 className="inventory-title">Inventario</h1>

      <section className="card inventory-search inventory-card">
        <h2>Selecciona</h2>
        {productsError && <p className="error">{productsError}</p>}
        <div className="mode-grid">
          <button
            type="button"
            className={`mode-card ${modeFilter === "SIMPLE" ? "active" : ""}`}
            onClick={() => {
              setModeFilter("SIMPLE");
              setCategoryFilter(null);
              setDetail(null);
            }}
            disabled={productsLoading}
          >
            <div className="mode-title">SIMPLE</div>
            <div className="mode-value">
              {products
                .filter((item) => item.stock_mode === "SIMPLE")
                .reduce((sum, item) => sum + Number(item.available_stock || 0), 0)}
            </div>
            <div className="mode-subtitle">Disponibles</div>
          </button>
          <button
            type="button"
            className={`mode-card ${modeFilter === "UNITS" ? "active" : ""}`}
            onClick={() => {
              setModeFilter("UNITS");
              setCategoryFilter(null);
              setDetail(null);
            }}
            disabled={productsLoading}
          >
            <div className="mode-title">UNITS</div>
            <div className="mode-value">
              {products
                .filter((item) => item.stock_mode === "UNITS")
                .reduce((sum, item) => sum + Number(item.available_stock || 0), 0)}
            </div>
            <div className="mode-subtitle">Disponibles</div>
          </button>
        </div>
      </section>

      {modeFilter && (
        <section className="card inventory-list inventory-card">
          <div className="inventory-header">
            <div>
              <h2>📦 Categorías</h2>
              <p className="muted">Selecciona una categoría o crea un producto nuevo.</p>
            </div>
            <button type="button" onClick={() => setCreateOpen((prev) => !prev)}>
              {createOpen ? "Cerrar" : "Agregar producto"}
            </button>
          </div>
          {createOpen && (
            <div className="create-product">
              <div className="create-product__grid">
                <label>
                  Nombre del producto
                  <input
                    type="text"
                    value={createName}
                    onChange={(event) => setCreateName(event.target.value)}
                    placeholder="Nombre visible en el bot"
                  />
                </label>
                <label>
                  Categoría
                  <select
                    value={createCategory}
                    onChange={(event) => setCreateCategory(event.target.value)}
                  >
                    {categoryOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Precio USD
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={createPrice}
                    onChange={(event) =>
                      setCreatePrice(normalizePriceInput(event.target.value))
                    }
                  />
                </label>
                <label>
                  Modo de stock
                  <select
                    value={createMode}
                    onChange={(event) => setCreateMode(event.target.value)}
                  >
                    <option value="SIMPLE">SIMPLE</option>
                    <option value="UNITS">UNITS</option>
                  </select>
                </label>
                <label className="create-product__description">
                  Descripción (máx 8 líneas)
                  <textarea
                    rows={8}
                    value={createDescription}
                    onChange={(event) =>
                      setCreateDescription(ensureDescriptionTemplate(event.target.value))
                    }
                  />
                </label>
              </div>
              <div className="create-product__options">
                <label>
                  Mostrar stock
                  <select
                    value={createShowStock ? "true" : "false"}
                    onChange={(event) =>
                      setCreateShowStock(event.target.value === "true")
                    }
                  >
                    <option value="true">Sí</option>
                    <option value="false">No</option>
                  </select>
                </label>
                <label>
                  Producto único (1 por cliente)
                  <select
                    value={createUnique ? "true" : "false"}
                    onChange={(event) => setCreateUnique(event.target.value === "true")}
                  >
                    <option value="true">Sí</option>
                    <option value="false">No</option>
                  </select>
                </label>
              </div>
              <div className="create-product__actions">
                <button
                  type="button"
                  className="save-button"
                  onClick={handleCreateProduct}
                  disabled={isSubmitting}
                >
                  Crear
                </button>
              </div>
            </div>
          )}
          {productsLoading && <p className="muted">Cargando...</p>}
          {!productsLoading && (
            <>
              <div className="category-grid">
                {categoryOptions.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    className={`category-button ${
                      categoryFilter === option.key ? "active" : ""
                    }`}
                    onClick={() => {
                      setCategoryFilter(
                        categoryFilter === option.key ? null : option.key
                      );
                      setDetail(null);
                    }}
                  >
                    <span>{option.label}</span>
                    <span className="category-count">
                      {categoryCounts[option.key] || 0}
                    </span>
                  </button>
                ))}
              </div>
              {categoryFilter && !detail && (
                <div className="product-list">
                  {productsByMode
                    .filter(
                      (item) => getCategoryKey(item.name) === categoryFilter
                    )
                    .sort((a, b) => {
                      const aOrder = getSkuOrder(a);
                      const bOrder = getSkuOrder(b);
                      if (aOrder !== null && bOrder !== null && aOrder !== bOrder) {
                        return aOrder - bOrder;
                      }
                      if (a.created_at && b.created_at) {
                        return new Date(a.created_at) - new Date(b.created_at);
                      }
                      if (a.created_at) return -1;
                      if (b.created_at) return 1;
                      return String(a.name || "").localeCompare(String(b.name || ""));
                    })
                    .map((item) => (
                      <div key={item.id} className="product-row">
                        <button
                          type="button"
                          className="product-row__main"
                          onClick={() => handleSelectProduct(item)}
                        >
                          <div>
                            <div className="product-name">
                              {stripCategoryPrefix(item.name)}
                            </div>
                            <div className="muted">
                              SKU: {item.code || item.sku_key || "-"}
                            </div>
                          </div>
                          <div className="product-stock">
                            {item.available_stock ?? "-"}
                          </div>
                        </button>
                        <div className="product-row__actions">
                          {editingProductId === item.id ? (
                            <>
                              <input
                                type="text"
                                value={editingName}
                                onChange={(event) => setEditingName(event.target.value)}
                              />
                              <button type="button" onClick={() => handleEditSave(item)}>
                                Guardar
                              </button>
                              <button type="button" className="ghost" onClick={handleEditCancel}>
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <button type="button" className="ghost" onClick={() => handleEditStart(item)}>
                                Renombrar
                              </button>
                              <button type="button" onClick={() => handleSelectProduct(item)}>
                                Editar
                              </button>
                              <button
                                type="button"
                                className="delete-button"
                                onClick={() => handleDeleteProduct(item)}
                              >
                                Eliminar
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {detail?.product && (
        <>
          <div className="inventory-detail-grid">
            <div className="inventory-column">
              <section className="card inventory-summary inventory-card">
                <h2>📊 Resumen rápido</h2>
                <div className="summary-grid">
                  <div className="summary-card">
                    <div className="summary-value">{detail.available_stock ?? "—"}</div>
                    <div className="summary-label">Disponible</div>
                  </div>
                  <div className="summary-card">
                    <div className="summary-value">{holdsHeldQty}</div>
                    <div className="summary-label">Holds activos</div>
                  </div>
                  <div className="summary-card">
                    <div className="summary-value">{detail.product.stock_mode}</div>
                    <div className="summary-label">Modo stock</div>
                  </div>
                  <div className="summary-card">
                    <div className="summary-value">
                      {unitsSummaryList.reduce((sum, row) => sum + Number(row.count || 0), 0)}
                    </div>
                    <div className="summary-label">Total UNITS</div>
                  </div>
                </div>
              </section>

              <section className="card inventory-holds inventory-card">
                <div className="inventory-header">
                  <div>
                    <h2>⏳ Holds activos</h2>
                    <p className="muted">Retenciones de stock en tiempo real.</p>
                  </div>
                  <span className="pill pill-highlight">Retenidos: {holdsHeldQty}</span>
                </div>
                {holdsActive.length === 0 ? (
                  <p>No hay holds activos.</p>
                ) : (
                  <table style={{ width: "100%", marginTop: "12px" }}>
                    <thead>
                      <tr>
                        <th align="left">Pedido</th>
                        <th align="left">Cant.</th>
                        <th align="left">Expira</th>
                        <th align="left">Restante</th>
                        <th align="left">Creado</th>
                        <th align="left">Estado</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {holdsActive.map((hold) => {
                        const expiresAt = hold.expires_at
                          ? new Date(hold.expires_at)
                          : null;
                        const remainingMs = expiresAt ? expiresAt - new Date() : 0;
                        const minutes = Math.max(Math.floor(remainingMs / 60000), 0);
                        const seconds = Math.max(
                          Math.floor((remainingMs % 60000) / 1000),
                          0
                        );
                        return (
                          <tr key={hold.id}>
                            <td>
                              {hold.order_id || "—"}
                              {hold.order_id && (
                                <button
                                  type="button"
                                  onClick={() => copyText(hold.order_id, "Pedido")}
                                  style={{ marginLeft: "8px" }}
                                >
                                  Copiar
                                </button>
                              )}
                            </td>
                            <td>{hold.qty}</td>
                            <td>
                              {hold.expires_at
                                ? new Date(hold.expires_at).toLocaleString()
                                : "-"}
                            </td>
                            <td>
                              {hold.expires_at ? `${minutes}m ${seconds}s` : "-"}
                            </td>
                            <td>
                              {hold.created_at
                                ? new Date(hold.created_at).toLocaleString()
                                : "-"}
                            </td>
                            <td>{hold.status || "-"}</td>
                            <td>
                              <button type="button" onClick={() => openRelease(hold)}>
                                Liberar
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </section>
            </div>

            <div className="inventory-column">
              <section className="card inventory-product inventory-card">
                <div className="inventory-header">
                  <div>
                    <h2>🧾 Producto</h2>
                    <p className="muted">Datos base y accesos rápidos.</p>
                  </div>
                  <div className="actions">
                    <button type="button" onClick={() => copyText(detail.product.id, "ID")}>
                      Copiar ID
                    </button>
                    {(detail.product.code || detail.product.sku_key) && (
                      <button
                        type="button"
                        onClick={() => copyText(detail.product.code || detail.product.sku_key, "SKU")}
                      >
                        Copiar SKU
                      </button>
                    )}
                  </div>
                </div>
                <div className="product-grid">
                  <div>
                    <p><strong>ID:</strong> {detail.product.id}</p>
                    <p><strong>SKU:</strong> {detail.product.code || detail.product.sku_key || "-"}</p>
                    <p><strong>Nombre:</strong> {stripCategoryPrefix(detail.product.name)}</p>
                  </div>
                  <div>
                    <p><strong>Modo:</strong> {detail.product.stock_mode}</p>
                    <p><strong>Disponible:</strong> {detail.available_stock ?? "-"}</p>
                    <p><strong>Stock actual:</strong> {detail.product.stock_qty ?? "-"}</p>
                    <p>
                      <strong>Producto único:</strong>{" "}
                      {detail.product.unique_purchase ? "Sí" : "No"}
                    </p>
                  </div>
                </div>
                <div className="product-edit">
                  <h3>✏️ Editar producto</h3>
                  <div className="product-edit__grid">
                    <label>
                      Nombre
                      <input
                        type="text"
                        value={editProductName}
                        onChange={(event) => setEditProductName(event.target.value)}
                      />
                    </label>
                    <label>
                      Categoría
                      <select
                        value={editCategory}
                        onChange={(event) => setEditCategory(event.target.value)}
                      >
                        {categoryOptions.map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  <label>
                    Precio USD
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={editPrice}
                      onChange={(event) =>
                        setEditPrice(normalizePriceInput(event.target.value))
                      }
                    />
                  </label>
                    <label>
                      Modo de stock
                      <select
                        value={editStockMode}
                        onChange={(event) => setEditStockMode(event.target.value)}
                      >
                        <option value="SIMPLE">SIMPLE</option>
                        <option value="UNITS">UNITS</option>
                      </select>
                    </label>
                  </div>
                <div className="product-edit__options">
                  {editStockMode === "SIMPLE" && (
                    <>
                      <div className="simple-stock-row">
                        <label>
                          Stock actual
                          <input
                            type="number"
                            min="0"
                            value={simpleStock}
                            disabled={editUnique || simpleUnlimited}
                            onChange={(event) => setSimpleStock(event.target.value)}
                          />
                        </label>
                        <div className="stock-toggle-group">
                          <button
                            type="button"
                            className={`stock-toggle ${!editUnique && !simpleUnlimited ? "active" : ""}`}
                            onClick={() => setStockToggle("stock")}
                          >
                            Stock
                          </button>
                          <button
                            type="button"
                            className={`stock-toggle ${simpleUnlimited ? "active" : ""}`}
                            onClick={() => setStockToggle("unlimited")}
                          >
                            Ilimitado
                          </button>
                          <button
                            type="button"
                            className={`stock-toggle ${editUnique ? "active" : ""}`}
                            onClick={() => setStockToggle("unique")}
                          >
                            Unico
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                  <label className="product-edit__description">
                    Descripción (máx 8 líneas)
                    <textarea
                      rows={8}
                      value={editDescription}
                      onChange={(event) =>
                        setEditDescription(ensureDescriptionTemplate(event.target.value))
                      }
                    />
                  </label>
                  <div className="product-edit__actions">
                    <button
                      type="button"
                      className="save-button"
                      onClick={handleSaveProduct}
                      disabled={isSubmitting}
                    >
                      Guardar cambios
                    </button>
                  </div>
                </div>

                {editStockMode === "UNITS" && (
                  <div className="product-units">
                    <div className="split-grid">
                      <div className="card inner-card">
                        <h3>🧩 Template de entrega</h3>
                        <div className="form">
                          <label>
                            Plantilla
                            <textarea
                              rows={10}
                              value={template}
                              onChange={(event) => setTemplate(event.target.value)}
                            />
                          </label>
                          <button
                            type="button"
                            className="save-button"
                            onClick={handleTemplateSave}
                            disabled={isSubmitting}
                          >
                            Guardar template
                          </button>
                        </div>
                      </div>
                      <div className="card inner-card">
                        <h3>📤 Carga de UNITS (CSV)</h3>
                        <div className="form">
                          <label>
                            Archivo CSV
                            <input
                              type="file"
                              accept=".csv"
                              onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={handleUpload}
                            disabled={isSubmitting || !uploadFile}
                          >
                            {isSubmitting ? "Subiendo..." : "Subir CSV"}
                          </button>
                        </div>
                        {uploadErrors.length > 0 && (
                          <>
                            <h4>Errores de carga</h4>
                            <ul className="error-list">
                              {uploadErrors.map((row, index) => (
                                <li key={`${row.row_number || "row"}-${index}`}>
                                  Fila {row.row_number || "-"}: {row.reason}
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="card inner-card">
                      <h3>📚 Resumen UNITS</h3>
                      <div className="pill-grid">
                        {unitsSummaryList.length > 0 ? (
                          unitsSummaryList.map((row) => (
                            <span key={row.status} className="pill pill-highlight">
                              {row.status}: {row.count}
                            </span>
                          ))
                        ) : (
                          <span className="pill">Sin datos</span>
                        )}
                      </div>
                      <div className="form" style={{ marginTop: "16px" }}>
                        <label>
                          Estado
                          <select value={unitsStatus} onChange={handleUnitsStatusChange}>
                            <option value="">Todos</option>
                            <option value="AVAILABLE">DISPONIBLE</option>
                            <option value="HELD">RETENIDO</option>
                            <option value="DELIVERED">ENTREGADO</option>
                          </select>
                        </label>
                      </div>
                      <table style={{ width: "100%", marginTop: "12px" }}>
                        <thead>
                          <tr>
                            <th align="left">ID</th>
                            <th align="left">Estado</th>
                            <th align="left">ID Externo</th>
                            <th align="left">Usuario</th>
                            <th align="left">Contraseña</th>
                            <th align="left">Inicio</th>
                            <th align="left">Expira</th>
                            <th align="left">Creada</th>
                            <th align="left">Carga útil</th>
                          </tr>
                        </thead>
                        <tbody>
                          {unitsSample.map((unit) => (
                            <tr key={unit.id}>
                              <td>{unit.id.slice(0, 8)}…</td>
                              <td>
                                <span className={`chip chip-${String(unit.status || "").toLowerCase()}`}>
                                  {unit.status}
                                </span>
                              </td>
                              <td>{unit.external_id || "-"}</td>
                              <td>{unit.username || "-"}</td>
                              <td>{unit.password_masked || "-"}</td>
                              <td>{unit.starts_at || "-"}</td>
                              <td>{unit.expires_at || "-"}</td>
                              <td>
                                {unit.created_at
                                  ? new Date(unit.created_at).toLocaleString()
                                  : "-"}
                              </td>
                              <td>
                                <pre className="code" style={{ whiteSpace: "pre-wrap" }}>
                                  {unit.payload_preview || "{}"}
                                </pre>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        </>
      )}
      {releaseTarget && (
        <section className="card emergency-panel inventory-card">
          <h3>🚨 Liberar hold (EMERGENCIA)</h3>
          <p>
            Esto es una accion de emergencia. Escribe <strong>LIBERAR</strong> para
            confirmar.
          </p>
          <div className="form">
            <label>
              Confirmación
              <input
                type="text"
                value={releaseConfirm}
                onChange={(event) => setReleaseConfirm(event.target.value)}
                placeholder="LIBERAR"
              />
            </label>
          </div>
          {releaseError && <p className="error">{releaseError}</p>}
          <div className="actions">
            <button
              type="button"
              onClick={handleRelease}
              disabled={isSubmitting || releaseConfirm !== "LIBERAR"}
            >
              Confirmar liberar
            </button>
            <button type="button" onClick={closeRelease} disabled={isSubmitting}>
              Cancelar
            </button>
          </div>
        </section>
      )}
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
