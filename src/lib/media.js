import { buildApiUrl } from "./api";

const storageBaseEnv = process.env.NEXT_PUBLIC_STORAGE_BASE_URL;

const RAW_STORAGE_BASE_URL =
  typeof storageBaseEnv === "string" && storageBaseEnv.trim()
    ? storageBaseEnv.trim()
    : "";

const STORAGE_BASE_URL = RAW_STORAGE_BASE_URL;
const STORAGE_BASE = STORAGE_BASE_URL
  ? STORAGE_BASE_URL.endsWith("/")
    ? STORAGE_BASE_URL
    : `${STORAGE_BASE_URL}/`
  : "";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);
const MINIO_CONSOLE_PORT_MAP = new Map([
  ["9001", "9000"],
  ["9443", "9000"],
]);

function resolveAgainstApi(relative) {
  if (!relative) {
    return "";
  }
  try {
    return buildApiUrl(relative);
  } catch (error) {
    return "";
  }
}

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

  const hasLeadingSlash = trimmed.startsWith("/");
  const relative = hasLeadingSlash ? trimmed : `/${trimmed}`;
  if (relative.startsWith("/live2d/")) {
    const apiResolved = resolveAgainstApi(relative);
    if (apiResolved) {
      return apiResolved;
    }
  }
  if (!hasLeadingSlash && STORAGE_BASE) {
    try {
      return normalizeAbsoluteUrl(new URL(trimmed, STORAGE_BASE).toString());
    } catch (error) {
      try {
        return normalizeAbsoluteUrl(new URL(relative, STORAGE_BASE).toString());
      } catch (innerError) {
        // ignore and fall through
      }
    }
  }

  return relative;
}
