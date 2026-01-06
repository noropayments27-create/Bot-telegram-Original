const DEFAULT_BASE_URL = "http://localhost:3001";

export function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_BASE_URL;
}

export function getAdminKey() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem("ADMIN_KEY");
}

export function setAdminKey(value) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem("ADMIN_KEY", value);
}

export function clearAdminKey() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem("ADMIN_KEY");
}

export async function apiFetch(path, options = {}) {
  const baseUrl = getApiBaseUrl();
  const headers = { ...(options.headers || {}) };
  const adminKey = getAdminKey();

  if (adminKey) {
    headers["x-admin-key"] = adminKey;
  }

  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    clearAdminKey();
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
  const adminKey = getAdminKey();

  if (adminKey) {
    headers["x-admin-key"] = adminKey;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    clearAdminKey();
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
