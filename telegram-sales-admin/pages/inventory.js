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

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/login");
    }
  }, [router]);

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

  const handleSearch = async () => {
    setError("");
    setMessage("");
    setWarning("");
    setUploadErrors([]);
    const identifier = {
      productId: productId.trim(),
      skuKey: skuKey.trim(),
    };
    if (!identifier.productId && !identifier.skuKey) {
      setError("Ingresa un product_id o sku_key.");
      return;
    }
    try {
      const data = await loadInspect(identifier);
      await loadUnits({ productId: data.product.id }, unitsStatus);
      await loadHolds({ productId: data.product.id });
    } catch (err) {
      setError("No se pudo cargar el inventario.");
    }
  };

  const handleSimpleSave = async () => {
    if (!detail?.product) {
      return;
    }
    setIsSubmitting(true);
    setError("");
    setMessage("");
    setWarning("");
    try {
      await apiFetch("/admin/stock/simple/set", {
        method: "POST",
        body: JSON.stringify({
          product_id: detail.product.id,
          stock_qty: simpleStock,
        }),
      });
      setMessage("Stock actualizado.");
      await loadInspect({ productId: detail.product.id });
      await loadHolds({ productId: detail.product.id });
    } catch (err) {
      setError("No se pudo actualizar el stock.");
    } finally {
      setIsSubmitting(false);
    }
  };

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
      setMessage("Template guardado.");
      await loadInspect({ productId: detail.product.id });
      await loadUnits({ productId: detail.product.id }, unitsStatus);
      await loadHolds({ productId: detail.product.id });
    } catch (err) {
      setError("No se pudo guardar el template.");
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
        setError(
          data.error
            ? `No se pudo cargar el CSV: ${data.error}`
            : "No se pudo cargar el CSV."
        );
      } else {
        const insertedCount = data.inserted_count || 0;
        const failedRows = Array.isArray(data.failed_rows) ? data.failed_rows : [];
        if (insertedCount > 0) {
          setMessage(`✅ Insertadas: ${insertedCount}`);
        }
        if (failedRows.length > 0) {
          setWarning("⚠️ Algunas filas fallaron.");
        }
        if (insertedCount === 0 && failedRows.length > 0) {
          setWarning("⚠️ No se insertaron filas. Revisa los errores.");
        }
        setUploadErrors(failedRows);
        await loadInspect({ productId: detail.product.id });
        await loadUnits({ productId: detail.product.id }, unitsStatus);
        await loadHolds({ productId: detail.product.id });
      }
      setUploadFile(null);
    } catch (err) {
      setError("No se pudo cargar el CSV.");
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

  const copyText = async (value) => {
    try {
      await navigator.clipboard.writeText(String(value));
    } catch (err) {
      setError("No se pudo copiar al portapapeles.");
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
      setMessage("✅ Hold liberado.");
      await loadInspect({ productId: detail.product.id });
      await loadHolds({ productId: detail.product.id });
      await loadUnits({ productId: detail.product.id }, unitsStatus);
      closeRelease();
    } catch (err) {
      setReleaseError("No se pudo liberar el hold.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="page">
      <section className="card">
        <h1>Inventario</h1>
        <p className="muted">Gestion de stock SIMPLE y UNITS</p>

        {message && <p className="muted">{message}</p>}
        {warning && <p className="muted">{warning}</p>}
        {error && <p className="error">{error}</p>}

        <div className="form">
          <label>
            SKU Key
            <input
              type="text"
              value={skuKey}
              onChange={(event) => setSkuKey(event.target.value)}
              placeholder="sku_key"
            />
          </label>
          <label>
            Product ID
            <input
              type="text"
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
              placeholder="product_id"
            />
          </label>
          <button type="button" onClick={handleSearch} disabled={isSubmitting}>
            Buscar
          </button>
        </div>

        {detail?.product && (
          <>
            <h3>Producto</h3>
            <p>ID: {detail.product.id}</p>
            <p>SKU: {detail.product.sku_key || "-"}</p>
            <p>Nombre: {detail.product.name}</p>
            <p>Modo stock: {detail.product.stock_mode}</p>
            <p>Disponible: {detail.available_stock ?? "-"}</p>
            <div className="actions" style={{ marginTop: "8px" }}>
              <button type="button" onClick={() => copyText(detail.product.id)}>
                Copiar product_id
              </button>
              {detail.product.sku_key && (
                <button type="button" onClick={() => copyText(detail.product.sku_key)}>
                  Copiar sku_key
                </button>
              )}
            </div>

            {detail.product.stock_mode === "SIMPLE" && (
              <>
                <h3>Stock SIMPLE</h3>
                <div className="form">
                  <label>
                    Stock actual
                    <input
                      type="number"
                      min="0"
                      value={simpleStock}
                      onChange={(event) => setSimpleStock(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleSimpleSave}
                    disabled={isSubmitting}
                  >
                    Guardar
                  </button>
                </div>
              </>
            )}

            {detail.product.stock_mode === "UNITS" && (
              <>
                <h3>Template de entrega</h3>
                <div className="form">
                  <label>
                    Template
                    <textarea
                      rows={10}
                      value={template}
                      onChange={(event) => setTemplate(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleTemplateSave}
                    disabled={isSubmitting}
                  >
                    Guardar template
                  </button>
                </div>

                <h3>Carga de UNITS (CSV)</h3>
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

                <h3>Resumen UNITS</h3>
                {detail.units_summary_mapped?.length > 0 && (
                  <ul>
                    {detail.units_summary_mapped.map((row) => (
                      <li key={row.status}>
                        {row.status}: {row.count}
                      </li>
                    ))}
                  </ul>
                )}
                {unitsSummary.length > 0 && (
                  <ul>
                    {unitsSummary.map((row) => (
                      <li key={row.status}>
                        {row.status}: {row.count}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="form">
                  <label>
                    Estado
                    <select value={unitsStatus} onChange={handleUnitsStatusChange}>
                      <option value="">Todos</option>
                      <option value="AVAILABLE">AVAILABLE</option>
                      <option value="HELD">HELD</option>
                      <option value="DELIVERED">DELIVERED</option>
                    </select>
                  </label>
                </div>
                <table style={{ width: "100%", marginTop: "12px" }}>
                  <thead>
                    <tr>
                      <th align="left">ID</th>
                      <th align="left">Estado</th>
                      <th align="left">External ID</th>
                      <th align="left">Usuario</th>
                      <th align="left">Password</th>
                      <th align="left">Inicio</th>
                      <th align="left">Expira</th>
                      <th align="left">Creada</th>
                      <th align="left">Payload</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unitsSample.map((unit) => (
                      <tr key={unit.id}>
                        <td>{unit.id.slice(0, 8)}…</td>
                        <td>{unit.status}</td>
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
                {uploadErrors.length > 0 && (
                  <>
                    <h4>Errores de carga</h4>
                    <ul>
                      {uploadErrors.map((row, index) => (
                        <li key={`${row.row_number || "row"}-${index}`}>
                          Fila {row.row_number || "-"}: {row.reason}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}

            <>
              <h3>Holds activos</h3>
              {holdsActive.length === 0 ? (
                <p>No hay holds activos.</p>
              ) : (
                <>
                  <p>Held qty: {holdsHeldQty}</p>
                  <table style={{ width: "100%", marginTop: "12px" }}>
                    <thead>
                      <tr>
                        <th align="left">Order</th>
                        <th align="left">Qty</th>
                        <th align="left">Expira</th>
                        <th align="left">Restante</th>
                        <th align="left">Creado</th>
                        <th align="left">Status</th>
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
                                  onClick={() => copyText(hold.order_id)}
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
                </>
              )}
            </>
          </>
        )}
      </section>
      {releaseTarget && (
        <section className="card">
          <h3>Liberar hold (EMERGENCIA)</h3>
          <p>
            Esto es una accion de emergencia. Escribe <strong>LIBERAR</strong> para
            confirmar.
          </p>
          <div className="form">
            <label>
              Confirmacion
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
    </main>
  );
}
