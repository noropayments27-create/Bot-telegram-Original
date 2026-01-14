const DEFAULT_BASE_URL = "http://localhost:3001";
const AUTH_TOKEN_KEY = "ADMIN_TOKEN";
const AUTH_TOKEN_EXPIRES_KEY = "ADMIN_TOKEN_EXPIRES_AT";
const AUTH_TOKEN_TTL_MS = 60 * 60 * 1000;

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

export async function apiFetch(path, options = {}) {
  const baseUrl = getApiBaseUrl();
  const headers = { ...(options.headers || {}) };
  const token = getAuthToken();

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    clearAuthToken();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new Error("UNAUTHORIZED");
  }

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const error = new Error("REQUEST_FAILED");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export async function apiFetchBinary(path, options = {}) {
  const baseUrl = getApiBaseUrl();
  const headers = { ...(options.headers || {}) };
  const token = getAuthToken();

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    clearAuthToken();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new Error("UNAUTHORIZED");
  }

  if (!response.ok) {
    throw new Error("REQUEST_FAILED");
  }

  const buffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || "application/octet-stream";

  return { buffer, contentType };
}
