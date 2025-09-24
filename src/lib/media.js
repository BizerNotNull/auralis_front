const RAW_STORAGE_BASE_URL =
  (typeof process !== "undefined" &&
    typeof process.env?.NEXT_PUBLIC_STORAGE_BASE_URL === "string" &&
    process.env.NEXT_PUBLIC_STORAGE_BASE_URL.trim()) ||
  "";

const STORAGE_BASE_URL = RAW_STORAGE_BASE_URL;
const STORAGE_BASE = STORAGE_BASE_URL
  ? STORAGE_BASE_URL.endsWith("/")
    ? STORAGE_BASE_URL
    : `${STORAGE_BASE_URL}/`
  : "";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);
const MINIO_CONSOLE_PORT_MAP = new Map([
  ["9001", "9000"],
  ["9443", "9000"],
]);

function normalizeAbsoluteUrl(value) {
  let candidate;
  try {
    candidate = new URL(value);
  } catch (error) {
    return value;
  }

  const host = candidate.hostname.toLowerCase();
  if (LOCAL_HOSTNAMES.has(host)) {
    const mappedPort = MINIO_CONSOLE_PORT_MAP.get(candidate.port);
    if (mappedPort) {
      candidate.port = mappedPort;
    }

    if (STORAGE_BASE) {
      try {
        const base = new URL(STORAGE_BASE);
        const rebuilt = new URL(
          `${candidate.pathname}${candidate.search}${candidate.hash}`,
          base,
        );
        return rebuilt.toString();
      } catch (error) {
        // ignore and fall through to raw candidate
      }
    }
  }

  return candidate.toString();
}

export function resolveAssetUrl(rawUrl) {
  const trimmed = (rawUrl ?? "").trim();
  if (!trimmed) {
    return "";
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return normalizeAbsoluteUrl(trimmed);
  }

  if (trimmed.startsWith("//")) {
    const protocol =
      typeof window !== "undefined" && window.location?.protocol
        ? window.location.protocol
        : "https:";
    return resolveAssetUrl(`${protocol}${trimmed}`);
  }

  const relative = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (STORAGE_BASE) {
    try {
      return normalizeAbsoluteUrl(new URL(relative, STORAGE_BASE).toString());
    } catch (error) {
      // ignore and fall through
    }
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${relative}`;
  }

  return relative;
}
