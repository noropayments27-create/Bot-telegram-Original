import { useEffect, useRef, useState } from "react";
import {
  IconDashboard,
  IconInventory,
  IconOrders,
} from "../components/PanelIcons";
import { useRouter } from "next/router";

import {
  apiFetch,
  clearAuthToken,
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
  const [createIsFree, setCreateIsFree] = useState(false);
  const [createLastPrice, setCreateLastPrice] = useState("0");
  const [createSimpleStock, setCreateSimpleStock] = useState("");
  const [createSimpleUnlimited, setCreateSimpleUnlimited] = useState(false);
  const [createMode, setCreateMode] = useState("SIMPLE");
  const [createShowStock, setCreateShowStock] = useState(true);
  const [createUnique, setCreateUnique] = useState(false);
  const [createStep, setCreateStep] = useState("details");
  const [createDeliveryType, setCreateDeliveryType] = useState("TEXT");
  const [createDeliveryPayload, setCreateDeliveryPayload] = useState({
    text: "",
    url: "",
    expires_at: "",
    telegram_file_id: "",
    filename: "",
  });
  const [createDescription, setCreateDescription] = useState(
    Array.from({ length: 8 }, () => "⌾ ").join("\n")
  );
  const [editProductName, setEditProductName] = useState("");
  const [editCategory, setEditCategory] = useState("tienda");
  const [editPrice, setEditPrice] = useState("0");
  const [editIsFree, setEditIsFree] = useState(false);
  const [editLastPrice, setEditLastPrice] = useState("0");
  const [editDescription, setEditDescription] = useState(
    Array.from({ length: 8 }, () => "⌾ ").join("\n")
  );
  const [editShowStock, setEditShowStock] = useState(true);
  const [editUnique, setEditUnique] = useState(false);
  const [editStockMode, setEditStockMode] = useState("SIMPLE");
  const [editStep, setEditStep] = useState("details");
  const [editDeliveryType, setEditDeliveryType] = useState("TEXT");
  const [editDeliveryPayload, setEditDeliveryPayload] = useState({
    text: "",
    url: "",
    expires_at: "",
    telegram_file_id: "",
    filename: "",
  });
  const [toast, setToast] = useState("");
  const createDescRefs = useRef([]);
  const editDescRefs = useRef([]);
  const [manualUnit, setManualUnit] = useState({
    username: "",
    password: "",
    duration_value: "",
    duration_unit: "months",
    notes: "",
  });
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

  const getDescriptionLines = (value) =>
    ensureDescriptionTemplate(value)
      .split("\n")
      .map((line) => line.replace(/^⌾\s*/, ""));

  const updateDescriptionLine = (value, setter, index, text) => {
    const lines = getDescriptionLines(value);
    lines[index] = text;
    const nextValue = lines.map((line) => `⌾ ${line}`).join("\n");
    setter(nextValue);
  };

  const handleDescriptionLineKeyDown = (event, refs, index) => {
    if (event.key === "Tab" || event.key === "Enter") {
      event.preventDefault();
      const nextIndex = Math.min(index + 1, refs.current.length - 1);
      const nextEl = refs.current[nextIndex];
      if (nextEl) {
        nextEl.focus();
      }
    }
  };

  const canProceedToDeliveryCreate = () => {
    if (!createName.trim()) {
      notifyWarning("Completa el nombre del producto.");
      return false;
    }
    if (Number(createPrice || 0) <= 0 && !createIsFree) {
      notifyWarning("El precio no puede ser 0. Usa el botón Gratis.");
      return false;
    }
    if (
      createMode === "SIMPLE"
      && !createSimpleUnlimited
      && !createUnique
      && (createSimpleStock === "" || Number(createSimpleStock) <= 0)
    ) {
      notifyWarning("Ingresa el stock o marca Ilimitado/Unico.");
      return false;
    }
    return true;
  };

  const canProceedToDeliveryEdit = () => {
    if (!editProductName.trim()) {
      notifyWarning("Completa el nombre del producto.");
      return false;
    }
    if (Number(editPrice || 0) <= 0 && !editIsFree) {
      notifyWarning("El precio no puede ser 0. Usa el botón Gratis.");
      return false;
    }
    if (
      editStockMode === "SIMPLE"
      && !simpleUnlimited
      && !editUnique
      && (simpleStock === "" || Number(simpleStock) <= 0)
    ) {
      notifyWarning("Ingresa el stock o marca Ilimitado/Unico.");
      return false;
    }
    return true;
  };

  const setStockToggle = (mode) => {
    if (mode === "stock") {
      setEditShowStock(true);
      setSimpleUnlimited(false);
      setEditUnique(false);
      if (!simpleStock) {
        setSimpleStock("1");
      }
      return;
    }
    if (mode === "unlimited") {
      setEditShowStock(true);
      setSimpleUnlimited(true);
      setEditUnique(false);
      setSimpleStock("");
      return;
    }
    if (mode === "unique") {
      setEditShowStock(true);
      setSimpleUnlimited(false);
      setEditUnique(true);
      setSimpleStock("");
    }
  };

  const setCreateStockToggle = (mode) => {
    if (mode === "stock") {
      setCreateShowStock(true);
      setCreateSimpleUnlimited(false);
      setCreateUnique(false);
      if (!createSimpleStock) {
        setCreateSimpleStock("1");
      }
      return;
    }
    if (mode === "unlimited") {
      setCreateShowStock(true);
      setCreateSimpleUnlimited(true);
      setCreateUnique(false);
      setCreateSimpleStock("");
      return;
    }
    if (mode === "unique") {
      setCreateShowStock(true);
      setCreateSimpleUnlimited(false);
      setCreateUnique(true);
      setCreateSimpleStock("");
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
      PRODUCT_NOT_UNITS: "El producto no está en modo UNITS.",
      DELIVERY_TYPE_INVALID: "El tipo de entrega es inválido.",
      DUPLICATE_IN_DB: "La unidad ya existe en la base de datos.",
      UNIT_FIELDS_REQUIRED: "Completa todos los campos de la unidad.",
      UNIT_DURATION_UNIT_REQUIRED: "Selecciona la unidad de duración.",
      UNIT_NOT_AVAILABLE: "Solo se pueden eliminar unidades disponibles.",
      PAYLOAD_INVALID_JSON: "El payload no es JSON válido.",
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
        notifyError("No se pudo cargar el catálogo.");
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
    }, 20000);
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
    setEditCategory(getCategoryKey(data?.product));
    setEditPrice(
      data?.product?.price === null || data?.product?.price === undefined
        ? "0"
        : normalizePriceValue(data.product.price)
    );
    setEditIsFree(Number(data?.product?.price || 0) <= 0);
    setEditLastPrice(
      Number(data?.product?.price || 0) > 0
        ? normalizePriceValue(data.product.price)
        : "0"
    );
    setEditDescription(
      ensureDescriptionTemplate(data?.product?.description || "")
    );
    setEditShowStock(
      data?.product?.show_stock === undefined ? true : Boolean(data.product.show_stock)
    );
    setEditUnique(Boolean(data?.product?.unique_purchase));
    setEditStockMode(data?.product?.stock_mode || "SIMPLE");
    setEditDeliveryType(String(data?.product?.delivery_type || "TEXT").toUpperCase());
    setEditDeliveryPayload({
      text: data?.product?.delivery_payload?.text
        || data?.product?.delivery_payload?.message
        || "",
      url: data?.product?.delivery_payload?.url || "",
      expires_at: data?.product?.delivery_payload?.expires_at
        || data?.product?.delivery_payload?.expires
        || "",
      telegram_file_id: data?.product?.delivery_payload?.telegram_file_id
        || data?.product?.delivery_payload?.file_id
        || "",
      filename: data?.product?.delivery_payload?.filename || "",
    });
    if (data?.product?.stock_mode === "SIMPLE" && data?.product?.unique_purchase) {
      setSimpleStock("");
      setSimpleUnlimited(false);
    }
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
      notifyMessage("Guardado con exito: nombre");
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
    const original = String(originalName || "").trim();
    const upper = original.toUpperCase();
    const prefixes = ["SHOP", "METODOS", "VIP", "WEB"];
    for (const base of prefixes) {
      const basePrefix = `${base} `;
      if (upper.startsWith(basePrefix)) {
        return `${basePrefix}${trimmedName}`;
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
    if (Number(createPrice || 0) <= 0 && !createIsFree) {
      notifyWarning("El precio no puede ser 0. Usa el botón Gratis.");
      return;
    }
    if (createStep !== "delivery") {
      notifyWarning("Completa los campos y pulsa Siguiente.");
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
          delivery_type: createDeliveryType,
          delivery_payload: createDeliveryPayload,
          description: buildDescriptionPayload(createDescription),
        }),
      });
      const created = data.product;
      await loadProducts({ silent: true });
      setCreateName("");
      setCreatePrice("0");
      setCreateIsFree(false);
      setCreateLastPrice("0");
      setCreateMode("SIMPLE");
      setCreateShowStock(true);
      setCreateUnique(false);
      setCreateSimpleStock("");
      setCreateSimpleUnlimited(false);
      setCreateDescription(Array.from({ length: 8 }, () => "⌾ ").join("\n"));
      setCreateDeliveryType("TEXT");
      setCreateDeliveryPayload({
        text: "",
        url: "",
        expires_at: "",
        telegram_file_id: "",
        filename: "",
      });
      setCreateStep("details");
      setCreateOpen(false);
      notifyMessage("Producto creado");
      if (createMode === "SIMPLE") {
        const normalizedSimpleStock = createUnique
          ? ""
          : createSimpleUnlimited
            ? ""
            : createSimpleStock === ""
              ? "0"
              : createSimpleStock;
        await apiFetch("/admin/stock/simple/set", {
          method: "POST",
          body: JSON.stringify({
            product_id: created.id,
            stock_qty: normalizedSimpleStock,
            unlimited: createSimpleUnlimited || createUnique,
            unique_purchase: createUnique,
          }),
        });
      }
    } catch (err) {
      notifyError(resolveErrorMessage(err, "No se pudo crear el producto."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveProduct = async () => {
    if (isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    setError("");
    setMessage("");
    setWarning("");
    try {
      await saveProductEdits({ silent: false });
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
      notifyMessage("Producto eliminado");
    } catch (err) {
      notifyError("No se pudo eliminar el producto.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecalculateProducts = async () => {
    if (!window.confirm("¿Recalcular códigos y SKU de todos los productos activos?")) {
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      await apiFetch("/admin/products/recalculate", { method: "POST" });
      await loadProducts({ silent: true });
      notifyMessage("Códigos y SKU recalculados.");
    } catch (err) {
      notifyError(resolveErrorMessage(err, "No se pudo recalcular."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const getCategoryKey = (product) => {
    const code = String(product?.code || "").toUpperCase();
    if (code.startsWith("T")) return "tienda";
    if (code.startsWith("M")) return "metodos";
    if (code.startsWith("V")) return "vip";
    if (code.startsWith("W")) return "programas";
    const rawName = String(product?.name || "").toUpperCase();
    if (rawName.startsWith("SHOP ")) return "tienda";
    if (rawName.startsWith("METODOS ")) return "metodos";
    if (rawName.startsWith("VIP ")) return "vip";
    if (rawName.startsWith("WEB ")) return "programas";
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
    acc[option.key] = productsByMode.filter(
      (item) => getCategoryKey(item) === option.key
    ).length;
    return acc;
  }, {});


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
      notifyMessage(label ? `${label} copiado` : "Copiado al portapapeles");
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
      notifyMessage("Hold liberado.");
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

  const saveProductEdits = async ({ silent = false } = {}) => {
    if (!detail?.product) {
      return false;
    }
    const trimmedName = editProductName.trim();
    if (!trimmedName) {
      notifyError("El nombre no puede estar vacío.");
      return false;
    }
    if (editStep !== "delivery") {
      notifyWarning("Completa los campos y pulsa Siguiente.");
      return false;
    }
    const normalizedPrice = editPrice === "" ? "0" : editPrice;
    const normalizedSimpleStock = simpleUnlimited
      ? ""
      : simpleStock === ""
        ? "0"
        : simpleStock;
    setEditIsFree(Number(normalizedPrice || 0) <= 0);
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
          delivery_type: editDeliveryType,
          delivery_payload: editDeliveryPayload,
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
            stock_qty: editUnique ? "" : normalizedSimpleStock,
            unlimited: simpleUnlimited || editUnique,
            unique_purchase: editUnique,
          }),
        });
      }
      if (!silent) {
        notifyMessage("Cambios actualizados y reflejados en el panel y el bot.");
      }
      await loadInspect({ productId: detail.product.id });
      await loadUnits({ productId: detail.product.id }, unitsStatus);
      await loadHolds({ productId: detail.product.id });
      return true;
    } catch (err) {
      notifyError(resolveErrorMessage(err, "No se pudo actualizar el producto."));
      return false;
    }
  };

  const handleManualUnitAdd = async () => {
    if (!detail?.product) {
      return;
    }
    if (isSubmitting) {
      return;
    }
    const username = String(manualUnit.username || "").trim();
    const password = String(manualUnit.password || "").trim();
    const durationValue = String(manualUnit.duration_value || "").trim();
    const durationUnit = String(manualUnit.duration_unit || "").trim();
    const notes = String(manualUnit.notes || "").trim();
    if (!username || !password || !durationValue || !durationUnit || !notes) {
      notifyWarning("Completa todos los campos para agregar la unidad.");
      return;
    }
    setIsSubmitting(true);
    try {
      const saved = await saveProductEdits({ silent: true });
      if (!saved) {
        return;
      }
      await apiFetch("/admin/stock/units/add", {
        method: "POST",
        body: JSON.stringify({
          product_id: detail.product.id,
          ...manualUnit,
        }),
      });
      setManualUnit({
        username: "",
        password: "",
        duration_value: "",
        duration_unit: "months",
        notes: "",
      });
      notifyMessage("Unidad agregada.");
      await loadUnits({ productId: detail.product.id }, unitsStatus);
    } catch (err) {
      notifyError(resolveErrorMessage(err, "No se pudo agregar la unidad."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnitDelete = async (unitId) => {
    if (!detail?.product || !unitId || isSubmitting) {
      return;
    }
    const confirmed = window.confirm("¿Eliminar esta unidad?");
    if (!confirmed) {
      return;
    }
    setIsSubmitting(true);
    try {
      await apiFetch(`/admin/stock/units/${unitId}/delete`, { method: "POST" });
      notifyMessage("Unidad eliminada.");
      await loadUnits({ productId: detail.product.id }, unitsStatus);
    } catch (err) {
      notifyError(resolveErrorMessage(err, "No se pudo eliminar la unidad."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const createDescriptionLines = getDescriptionLines(createDescription);
  const editDescriptionLines = getDescriptionLines(editDescription);
  const manualUnitComplete = Boolean(
    String(manualUnit.username || "").trim()
    && String(manualUnit.password || "").trim()
    && String(manualUnit.duration_value || "").trim()
    && String(manualUnit.duration_unit || "").trim()
    && String(manualUnit.notes || "").trim()
  );
  const simpleAvailable = products
    .filter((item) => item.stock_mode === "SIMPLE")
    .reduce((sum, item) => sum + Number(item.available_stock || 0), 0);
  const unitsAvailable = products
    .filter((item) => item.stock_mode === "UNITS")
    .reduce((sum, item) => sum + Number(item.available_stock || 0), 0);
  const formatAvailableLabel = (value) => (value === 0 || value === 1 ? "Disponible" : "Disponibles");

  return (
    <>
      <main className="page inventory-page">

      <section className="card inventory-search inventory-card">
        <h2 className="icon-inline"><IconInventory className="panel-icon" /> Selecciona</h2>
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
            <div className="mode-value">{simpleAvailable}</div>
            <div className="mode-subtitle">En Stock</div>
            <div className="mode-subtitle">{formatAvailableLabel(simpleAvailable)}</div>
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
            <div className="mode-value">{unitsAvailable}</div>
            <div className="mode-subtitle">En Stock</div>
            <div className="mode-subtitle">{formatAvailableLabel(unitsAvailable)}</div>
          </button>
        </div>
      </section>

      {modeFilter && (
        <section className="card inventory-list inventory-card">
          <div className="inventory-header">
            <div>
              <h2 className="icon-inline"><IconInventory className="panel-icon" /> Categorías</h2>
              <p className="muted">Selecciona una categoría o crea un producto nuevo.</p>
            </div>
            <div className="inventory-actions">
              <button type="button" onClick={() => setCreateOpen((prev) => !prev)}>
                {createOpen ? "Cerrar" : "Agregar producto"}
              </button>
              <button type="button" onClick={handleRecalculateProducts}>
                Recalcular códigos
              </button>
            </div>
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
                  <div className="price-input-row">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={createPrice}
                      onChange={(event) => {
                        const nextValue = normalizePriceInput(event.target.value);
                        setCreatePrice(nextValue);
                        if (createIsFree) {
                          setCreateIsFree(false);
                        }
                        if (Number(nextValue || 0) > 0) {
                          setCreateLastPrice(nextValue);
                        }
                      }}
                    />
                    <button
                      type="button"
                      className={`stock-toggle ${createIsFree ? "active" : ""}`}
                      onClick={() => {
                        if (createIsFree) {
                          setCreateIsFree(false);
                          setCreatePrice(createLastPrice || "0");
                        } else {
                          setCreatePrice("0");
                          setCreateIsFree(true);
                        }
                      }}
                      title="Producto gratis: 1 por usuario."
                    >
                      Gratis
                    </button>
                  </div>
                  {createIsFree && <span className="price-free-label">Gratis</span>}
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
                {createStep === "delivery" ? (
                  <div className="create-product__description">
                    <span>Entrega del producto</span>
                    <div className="delivery-panel">
                      <label>
                        Tipo de entrega
                        <select
                          value={createDeliveryType}
                          onChange={(event) => setCreateDeliveryType(event.target.value)}
                        >
                          <option value="TEXT">TEXTO</option>
                          <option value="LINK">LINK</option>
                          <option value="EXPIRING_LINK">LINK EXPIRABLE</option>
                          <option value="IMAGE">IMAGEN</option>
                          <option value="VIDEO">VIDEO</option>
                          <option value="FILE">ARCHIVO</option>
                        </select>
                      </label>
                      {createDeliveryType === "TEXT" && (
                        <label>
                          Texto de entrega
                          <textarea
                            rows={6}
                            value={createDeliveryPayload.text || ""}
                            onChange={(event) =>
                              setCreateDeliveryPayload((prev) => ({
                                ...prev,
                                text: event.target.value,
                              }))
                            }
                          />
                        </label>
                      )}
                      {createDeliveryType === "LINK" && (
                        <label>
                          Link
                          <input
                            type="text"
                            value={createDeliveryPayload.url || ""}
                            onChange={(event) =>
                              setCreateDeliveryPayload((prev) => ({
                                ...prev,
                                url: event.target.value,
                              }))
                            }
                          />
                        </label>
                      )}
                      {createDeliveryType === "EXPIRING_LINK" && (
                        <>
                          <label>
                            Link
                            <input
                              type="text"
                              value={createDeliveryPayload.url || ""}
                              onChange={(event) =>
                                setCreateDeliveryPayload((prev) => ({
                                  ...prev,
                                  url: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <label>
                            Expira en
                            <input
                              type="text"
                              value={createDeliveryPayload.expires_at || ""}
                              onChange={(event) =>
                                setCreateDeliveryPayload((prev) => ({
                                  ...prev,
                                  expires_at: event.target.value,
                                }))
                              }
                            />
                          </label>
                        </>
                      )}
                      {(createDeliveryType === "IMAGE"
                        || createDeliveryType === "VIDEO"
                        || createDeliveryType === "FILE") && (
                        <>
                          <label>
                            URL de archivo
                            <input
                              type="text"
                              value={createDeliveryPayload.url || ""}
                              onChange={(event) =>
                                setCreateDeliveryPayload((prev) => ({
                                  ...prev,
                                  url: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <label>
                            Telegram file_id (opcional)
                            <input
                              type="text"
                              value={createDeliveryPayload.telegram_file_id || ""}
                              onChange={(event) =>
                                setCreateDeliveryPayload((prev) => ({
                                  ...prev,
                                  telegram_file_id: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <label>
                            Nombre de archivo (opcional)
                            <input
                              type="text"
                              value={createDeliveryPayload.filename || ""}
                              onChange={(event) =>
                                setCreateDeliveryPayload((prev) => ({
                                  ...prev,
                                  filename: event.target.value,
                                }))
                              }
                            />
                          </label>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="create-product__description">
                    <span>Descripción (máx 8 líneas)</span>
                    <div className="description-editor" role="textbox">
                      {createDescriptionLines.map((line, index) => (
                        <div key={`create-line-${index}`} className="description-line">
                          <span className="description-bullet" aria-hidden="true">⌾</span>
                          <input
                            ref={(el) => {
                              createDescRefs.current[index] = el;
                            }}
                            type="text"
                            value={line}
                            onChange={(event) =>
                              updateDescriptionLine(
                                createDescription,
                                setCreateDescription,
                                index,
                                event.target.value
                              )
                            }
                            onKeyDown={(event) =>
                              handleDescriptionLineKeyDown(event, createDescRefs, index)
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="create-product__options">
                {createMode === "SIMPLE" && (
                  <div className="simple-stock-row">
                    <div className="stock-input-field">
                      <label>
                        Stock actual
                        <input
                          type="number"
                          min="0"
                          value={createSimpleStock}
                          disabled={createUnique || createSimpleUnlimited}
                          onChange={(event) => setCreateSimpleStock(event.target.value)}
                        />
                      </label>
                    </div>
                    <div className="stock-toggle-group">
                      <button
                        type="button"
                        className={`stock-toggle ${!createUnique && !createSimpleUnlimited ? "active" : ""}`}
                        onClick={() => setCreateStockToggle("stock")}
                        title="Stock limitado: descuenta el stock disponible."
                      >
                        Stock
                      </button>
                      <button
                        type="button"
                        className={`stock-toggle ${createSimpleUnlimited ? "active" : ""}`}
                        onClick={() => setCreateStockToggle("unlimited")}
                        title="Stock ilimitado: no descuenta stock."
                      >
                        Ilimitado
                      </button>
                      <button
                        type="button"
                        className={`stock-toggle ${createUnique ? "active" : ""}`}
                        onClick={() => setCreateStockToggle("unique")}
                        title="Compra unica por usuario y stock ilimitado."
                      >
                        Unico
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="create-product__actions">
                {createStep !== "delivery" ? (
                  <button
                    type="button"
                    className="save-button"
                    onClick={() => {
                      if (canProceedToDeliveryCreate()) {
                        setCreateStep("delivery");
                      }
                    }}
                    disabled={isSubmitting}
                  >
                    Siguiente
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setCreateStep("details")}
                      disabled={isSubmitting}
                    >
                      Volver
                    </button>
                    <button
                      type="button"
                      className="save-button"
                      onClick={handleCreateProduct}
                      disabled={isSubmitting}
                    >
                      Crear
                    </button>
                  </>
                )}
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
                      (item) => getCategoryKey(item) === categoryFilter
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
                              SKU: {item.sku_key || "-"}
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
                <h2 className="icon-inline"><IconDashboard className="panel-icon" /> Resumen rápido</h2>
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
                    <div className="summary-label">Total UNIDADES</div>
                  </div>
                </div>
              </section>

              <section className="card inventory-holds inventory-card">
                <div className="inventory-header">
                  <div>
                    <h2 className="icon-inline"><IconOrders className="panel-icon" /> Holds activos</h2>
                    <p className="muted">Retenciones de stock en tiempo real.</p>
                  </div>
                  <span className="pill pill-highlight">Retenidos: {holdsHeldQty}</span>
                </div>
                {holdsActive.length === 0 ? (
                  <p>No hay holds activos.</p>
                ) : (
                  <div className="table-scroll">
                    <table className="holds-table" style={{ width: "100%", marginTop: "12px" }}>
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
                                <div className="hold-order-id">
                                  {hold.order_id || "—"}
                                </div>
                                {hold.order_id && (
                                  <div className="hold-actions-inline">
                                    <button
                                      type="button"
                                      onClick={() => copyText(hold.order_id, "Pedido")}
                                    >
                                      Copiar
                                    </button>
                                    <button type="button" onClick={() => openRelease(hold)}>
                                      Liberar
                                    </button>
                                  </div>
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
                              <td></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {releaseTarget && (
                  <section className="card emergency-panel inventory-card">
                    <h3 className="icon-inline"><IconOrders className="panel-icon" /> Liberar hold (EMERGENCIA)</h3>
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
              </section>

              {editStockMode === "UNITS" && (
                <section className="card inner-card units-summary-card">
                  <h3 className="icon-inline"><IconInventory className="panel-icon" /> Resumen UNITS</h3>
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
                  <div className="units-table-wrapper">
                    <table className="units-table">
                      <thead>
                        <tr>
                          <th align="left">ID</th>
                          <th align="left">Estado</th>
                          <th align="left">Usuario</th>
                          <th align="left">Contraseña</th>
                          <th align="left">Duracion</th>
                          <th align="left">Creada</th>
                          <th align="left">Carga útil</th>
                          <th align="left">Acciones</th>
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
                            <td>{unit.username || "-"}</td>
                            <td>{unit.password_masked || "-"}</td>
                            <td>
                              {unit.duration_value
                                ? `${unit.duration_value} ${unit.duration_unit || ""}`.trim()
                                : "-"}
                            </td>
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
                            <td>
                              <button
                                type="button"
                                className="ghost"
                                onClick={() => handleUnitDelete(unit.id)}
                                disabled={isSubmitting || unit.status !== "AVAILABLE"}
                                title={
                                  unit.status !== "AVAILABLE"
                                    ? "Solo se puede eliminar si esta disponible"
                                    : "Eliminar unidad"
                                }
                              >
                                Eliminar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </div>

            <div className="inventory-column">
              <section className="card inventory-product inventory-card">
                <div className="inventory-header">
                  <div>
                    <h2 className="icon-inline"><IconInventory className="panel-icon" /> Producto</h2>
                  </div>
                  <div className="actions">
                    <button type="button" onClick={() => copyText(detail.product.id, "ID")}>
                      Copiar ID
                    </button>
                    {detail.product.sku_key && (
                      <button
                        type="button"
                        onClick={() => copyText(detail.product.sku_key, "SKU")}
                      >
                        Copiar SKU
                      </button>
                    )}
                  </div>
                </div>
                <div className="product-grid">
                  <div>
                    <p><strong>SKU:</strong> {detail.product.sku_key || "-"}</p>
                    <p><strong>ID:</strong> {detail.product.id}</p>
                  </div>
                </div>
                <div className="product-edit">
                  <h3 className="icon-inline"><IconInventory className="panel-icon" /> Editar producto</h3>
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
                    <div className="price-input-row">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={editPrice}
                        onChange={(event) => {
                          const nextValue = normalizePriceInput(event.target.value);
                          setEditPrice(nextValue);
                          if (editIsFree) {
                            setEditIsFree(false);
                          }
                          if (Number(nextValue || 0) > 0) {
                            setEditLastPrice(nextValue);
                          }
                        }}
                      />
                        <button
                          type="button"
                          className={`stock-toggle ${editIsFree ? "active" : ""}`}
                          onClick={() => {
                            if (editIsFree) {
                              setEditIsFree(false);
                              setEditPrice(editLastPrice || "0");
                            } else {
                              setEditPrice("0");
                              setEditIsFree(true);
                            }
                          }}
                          title="Producto gratis: 1 por usuario."
                        >
                          Gratis
                        </button>
                    </div>
                    {editIsFree && <span className="price-free-label">Gratis</span>}
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
                        <div className="stock-input-field">
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
                        </div>
                        <div className="stock-toggle-group">
                          <button
                            type="button"
                            className={`stock-toggle ${!editUnique && !simpleUnlimited ? "active" : ""}`}
                            onClick={() => setStockToggle("stock")}
                            title="Stock limitado: descuenta el stock disponible."
                          >
                            Stock
                          </button>
                          <button
                            type="button"
                            className={`stock-toggle ${simpleUnlimited ? "active" : ""}`}
                            onClick={() => setStockToggle("unlimited")}
                            title="Stock ilimitado: no descuenta stock."
                          >
                            Ilimitado
                          </button>
                          <button
                            type="button"
                            className={`stock-toggle ${editUnique ? "active" : ""}`}
                            onClick={() => setStockToggle("unique")}
                            title="Compra unica por usuario y stock ilimitado."
                          >
                            Unico
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                  {editStep === "delivery" && editStockMode === "SIMPLE" ? (
                    <div className="product-edit__description">
                      <span>Entrega del producto</span>
                      <div className="delivery-panel">
                        <label>
                          Tipo de entrega
                          <select
                            value={editDeliveryType}
                            onChange={(event) => setEditDeliveryType(event.target.value)}
                          >
                            <option value="TEXT">TEXTO</option>
                            <option value="LINK">LINK</option>
                            <option value="EXPIRING_LINK">LINK EXPIRABLE</option>
                            <option value="IMAGE">IMAGEN</option>
                            <option value="VIDEO">VIDEO</option>
                            <option value="FILE">ARCHIVO</option>
                          </select>
                        </label>
                        {editDeliveryType === "TEXT" && (
                          <label>
                            Texto de entrega
                            <textarea
                              rows={6}
                              value={editDeliveryPayload.text || ""}
                              onChange={(event) =>
                                setEditDeliveryPayload((prev) => ({
                                  ...prev,
                                  text: event.target.value,
                                }))
                              }
                            />
                          </label>
                        )}
                        {editDeliveryType === "LINK" && (
                          <label>
                            Link
                            <input
                              type="text"
                              value={editDeliveryPayload.url || ""}
                              onChange={(event) =>
                                setEditDeliveryPayload((prev) => ({
                                  ...prev,
                                  url: event.target.value,
                                }))
                              }
                            />
                          </label>
                        )}
                        {editDeliveryType === "EXPIRING_LINK" && (
                          <>
                            <label>
                              Link
                              <input
                                type="text"
                                value={editDeliveryPayload.url || ""}
                                onChange={(event) =>
                                  setEditDeliveryPayload((prev) => ({
                                    ...prev,
                                    url: event.target.value,
                                  }))
                                }
                              />
                            </label>
                            <label>
                              Expira en
                              <input
                                type="text"
                                value={editDeliveryPayload.expires_at || ""}
                                onChange={(event) =>
                                  setEditDeliveryPayload((prev) => ({
                                    ...prev,
                                    expires_at: event.target.value,
                                  }))
                                }
                              />
                            </label>
                          </>
                        )}
                        {(editDeliveryType === "IMAGE"
                          || editDeliveryType === "VIDEO"
                          || editDeliveryType === "FILE") && (
                          <>
                            <label>
                              URL de archivo
                              <input
                                type="text"
                                value={editDeliveryPayload.url || ""}
                                onChange={(event) =>
                                  setEditDeliveryPayload((prev) => ({
                                    ...prev,
                                    url: event.target.value,
                                  }))
                                }
                              />
                            </label>
                            <label>
                              Telegram file_id (opcional)
                              <input
                                type="text"
                                value={editDeliveryPayload.telegram_file_id || ""}
                                onChange={(event) =>
                                  setEditDeliveryPayload((prev) => ({
                                    ...prev,
                                    telegram_file_id: event.target.value,
                                  }))
                                }
                              />
                            </label>
                            <label>
                              Nombre de archivo (opcional)
                              <input
                                type="text"
                                value={editDeliveryPayload.filename || ""}
                                onChange={(event) =>
                                  setEditDeliveryPayload((prev) => ({
                                    ...prev,
                                    filename: event.target.value,
                                  }))
                                }
                              />
                            </label>
                          </>
                        )}
                      </div>
                    </div>
                  ) : editStep === "delivery" && editStockMode === "UNITS" ? (
                    <div className="product-edit__description">
                      <span>Entrega (UNITS)</span>
                      <div className="card inner-card manual-units-card">
                        <h3 className="icon-inline"><IconInventory className="panel-icon" /> Unidad manual</h3>
                        <div className="form">
                          <div className="manual-units__grid">
                            <label>
                              👤 Usuario
                              <input
                                type="text"
                                value={manualUnit.username}
                                onChange={(event) =>
                                  setManualUnit((prev) => ({
                                    ...prev,
                                    username: event.target.value,
                                  }))
                                }
                              />
                            </label>
                            <label>
                              🔒 Contraseña
                              <input
                                type="text"
                                value={manualUnit.password}
                                onChange={(event) =>
                                  setManualUnit((prev) => ({
                                    ...prev,
                                    password: event.target.value,
                                  }))
                                }
                              />
                            </label>
                            <label>
                              ⏳ Duracion
                              <div className="manual-units__duration">
                                <input
                                  type="number"
                                  min="1"
                                  value={manualUnit.duration_value}
                                  onChange={(event) =>
                                    setManualUnit((prev) => ({
                                      ...prev,
                                      duration_value: event.target.value,
                                    }))
                                  }
                                />
                                <select
                                  value={manualUnit.duration_unit}
                                  onChange={(event) =>
                                    setManualUnit((prev) => ({
                                      ...prev,
                                      duration_unit: event.target.value,
                                    }))
                                  }
                                >
                                  <option value="days">Dias</option>
                                  <option value="weeks">Semanas</option>
                                  <option value="months">Meses</option>
                                  <option value="years">Años</option>
                                </select>
                              </div>
                            </label>
                            <label className="manual-units__notes">
                              📝 Notas
                              <textarea
                                rows={3}
                                value={manualUnit.notes}
                                onChange={(event) =>
                                  setManualUnit((prev) => ({
                                    ...prev,
                                    notes: event.target.value,
                                  }))
                                }
                              />
                            </label>
                          </div>
                          <button
                            type="button"
                            onClick={handleManualUnitAdd}
                            disabled={isSubmitting || !manualUnitComplete}
                            title={
                              manualUnitComplete
                                ? "Agregar unidad"
                                : "Completa todos los campos para agregar la unidad"
                            }
                          >
                            Agregar unidad
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="product-edit__description">
                      <span>Descripción (máx 8 líneas)</span>
                      <div className="description-editor" role="textbox">
                        {editDescriptionLines.map((line, index) => (
                          <div key={`edit-line-${index}`} className="description-line">
                            <span className="description-bullet" aria-hidden="true">⌾</span>
                            <input
                              ref={(el) => {
                                editDescRefs.current[index] = el;
                              }}
                              type="text"
                              value={line}
                              onChange={(event) =>
                                updateDescriptionLine(
                                  editDescription,
                                  setEditDescription,
                                  index,
                                  event.target.value
                                )
                              }
                              onKeyDown={(event) =>
                                handleDescriptionLineKeyDown(event, editDescRefs, index)
                              }
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="product-edit__actions">
                    {editStep !== "delivery" ? (
                      <button
                        type="button"
                        className="save-button"
                        onClick={() => {
                          if (canProceedToDeliveryEdit()) {
                            setEditStep("delivery");
                          }
                        }}
                        disabled={isSubmitting}
                      >
                        Siguiente
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => setEditStep("details")}
                          disabled={isSubmitting}
                        >
                          Volver
                        </button>
                        <button
                          type="button"
                          className="save-button"
                          onClick={handleSaveProduct}
                          disabled={isSubmitting}
                        >
                          Guardar cambios
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {editStockMode === "UNITS" && <div className="product-units" />}
              </section>
            </div>
          </div>
        </>
      )}
      </main>
      {toast && (
        <div className="toast">
          <span className="toast__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <circle
                cx="12"
                cy="12"
                r="9"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M12 8v5M12 16h.01"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span>{toast}</span>
        </div>
      )}
    </>
  );
}
