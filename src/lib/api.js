const configuredApiBase = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").trim();

const DEFAULT_LOCAL_API_BASE = "http://localhost:8080";
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);

function normalizeBase(value) {
  if (!value) {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed === "/") {
    return "/";
  }
  return trimmed.replace(/\/+$/, "");
}

function resolveBrowserOrigin() {
  if (typeof window === "undefined") {
    return "";
  }
  try {
    const { origin, hostname } = window.location;
    if (!origin) {
      return "";
    }
    if (hostname && !LOCAL_HOSTNAMES.has(hostname.toLowerCase())) {
      return origin.replace(/\/+$/, "");
    }
  } catch (error) {
    // ignore runtime origin detection failures
  }
  return "";
}

export function getApiBaseUrl() {
  const configured = normalizeBase(configuredApiBase);
  if (configured) {
    return configured;
  }

  const browserOrigin = resolveBrowserOrigin();
  if (browserOrigin) {
    return browserOrigin;
  }

  return DEFAULT_LOCAL_API_BASE;
}

export function buildApiUrl(path) {
  const base = getApiBaseUrl();
  if (!base) {
    return path;
  }
  try {
    return new URL(path, base.endsWith("/") ? base : `${base}/`).toString();
  } catch (error) {
    if (path.startsWith("/")) {
      return `${base}${path}`;
    }
    return `${base}/${path}`;
  }
}
