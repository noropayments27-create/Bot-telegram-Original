const DEFAULT_BASE_URL = "http://localhost:3001";
const AUTH_TOKEN_KEY = "ADMIN_TOKEN";
const AUTH_TOKEN_EXPIRES_KEY = "ADMIN_TOKEN_EXPIRES_AT";
const AUTH_TOKEN_TTL_MS = 60 * 60 * 1000;
let unauthorizedRedirected = false;
const lastAdminErrorAt = new Map();

export function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_BASE_URL;
}

export function getAuthToken() {
  if (typeof window === "undefined") {
    return null;
  }
  const storage = window.sessionStorage;
  const token = storage.getItem(AUTH_TOKEN_KEY);
  const expiresAt = Number(storage.getItem(AUTH_TOKEN_EXPIRES_KEY) || 0);
  if (!token || !expiresAt || Date.now() >= expiresAt) {
    clearAuthToken();
    return null;
  }
  return token;
}

export function setAuthToken(value) {
  if (typeof window === "undefined") {
    return;
  }
  const storage = window.sessionStorage;
  storage.setItem(AUTH_TOKEN_KEY, value);
  storage.setItem(
    AUTH_TOKEN_EXPIRES_KEY,
    String(Date.now() + AUTH_TOKEN_TTL_MS)
  );
}

export function clearAuthToken() {
  if (typeof window === "undefined") {
    return;
  }
  const storage = window.sessionStorage;
  storage.removeItem(AUTH_TOKEN_KEY);
  storage.removeItem(AUTH_TOKEN_EXPIRES_KEY);
}

function shouldReportAdminError(key, cooldownMs = 30000) {
  const now = Date.now();
  const last = Number(lastAdminErrorAt.get(key) || 0);
  if (last > 0 && now - last < cooldownMs) {
    return false;
  }
  lastAdminErrorAt.set(key, now);
  return true;
}

export async function reportAdminAppError(payload = {}) {
  if (typeof window === "undefined") {
    return;
  }
  const token = getAuthToken();
  if (!token) {
    return;
  }
  const message = String(payload.message || "").trim();
  if (!message) {
    return;
  }
  const route = String(
    payload.route
    || window.location.pathname
    || "/"
  ).trim();
  const code = String(payload.code || "").trim();
  const dedupeKey = `${code}|${route}|${message.slice(0, 140)}`;
  if (!shouldReportAdminError(dedupeKey)) {
    return;
  }
  try {
    await fetch(`${getApiBaseUrl()}/admin/app-errors`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        source: "admin",
        level: payload.level || "error",
        code: code || undefined,
        route,
        message,
        stack: payload.stack || undefined,
        context: payload.context || undefined,
      }),
    });
  } catch (_error) {
    // Ignore secondary reporting failures to avoid loops in the client.
  }
}

export async function apiFetch(path, options = {}) {
  if (unauthorizedRedirected && typeof window !== "undefined") {
    throw new Error("UNAUTHORIZED");
  }
  const baseUrl = getApiBaseUrl();
  const headers = { ...(options.headers || {}) };
  const token = getAuthToken();

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }

  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      cache: "no-store",
      ...options,
      headers,
    });
  } catch (error) {
    if (path !== "/admin/app-errors") {
      reportAdminAppError({
        code: "FETCH_NETWORK_ERROR",
        route: path,
        message: error?.message || "Network request failed",
        stack: error?.stack || undefined,
        context: {
          method: options.method || "GET",
        },
      });
    }
    throw error;
  }

  if (response.status === 401) {
    clearAuthToken();
    if (typeof window !== "undefined") {
      if (!unauthorizedRedirected) {
        unauthorizedRedirected = true;
        window.location.href = "/login";
      }
    }
    throw new Error("UNAUTHORIZED");
  }
  if (response.status === 304) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    if (path !== "/admin/app-errors") {
      reportAdminAppError({
        code: `HTTP_${response.status}`,
        route: path,
        message: `Request failed with status ${response.status}`,
        context: {
          method: options.method || "GET",
          payload,
        },
      });
    }
    const error = new Error("REQUEST_FAILED");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export async function apiFetchBinary(path, options = {}) {
  if (unauthorizedRedirected && typeof window !== "undefined") {
    throw new Error("UNAUTHORIZED");
  }
  const baseUrl = getApiBaseUrl();
  const headers = { ...(options.headers || {}) };
  const token = getAuthToken();

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      cache: "no-store",
      ...options,
      headers,
    });
  } catch (error) {
    if (path !== "/admin/app-errors") {
      reportAdminAppError({
        code: "FETCH_BINARY_NETWORK_ERROR",
        route: path,
        message: error?.message || "Binary request failed",
        stack: error?.stack || undefined,
        context: {
          method: options.method || "GET",
        },
      });
    }
    throw error;
  }

  if (response.status === 401) {
    clearAuthToken();
    if (typeof window !== "undefined") {
      if (!unauthorizedRedirected) {
        unauthorizedRedirected = true;
        window.location.href = "/login";
      }
    }
    throw new Error("UNAUTHORIZED");
  }
  if (response.status === 304) {
    return { buffer: new ArrayBuffer(0), contentType: "application/octet-stream" };
  }

  if (!response.ok) {
    if (path !== "/admin/app-errors") {
      reportAdminAppError({
        code: `HTTP_${response.status}`,
        route: path,
        message: `Binary request failed with status ${response.status}`,
        context: {
          method: options.method || "GET",
        },
      });
    }
    throw new Error("REQUEST_FAILED");
  }

  const buffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || "application/octet-stream";

  return { buffer, contentType };
}
