const DEFAULT_BASE_URL = "http://localhost:3001";

export function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_BASE_URL;
}

export function getAuthToken() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem("ADMIN_TOKEN");
}

export function setAuthToken(value) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem("ADMIN_TOKEN", value);
}

export function clearAuthToken() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem("ADMIN_TOKEN");
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
  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
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
