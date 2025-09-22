"use client";

const TOKEN_STORAGE_KEYS = ["token", "jwt", "access_token"];
const TOKEN_COOKIE_NAME = "token";

function resolveMaxAge(expire) {
  if (!expire) {
    return 60 * 60 * 24; // fallback 24h
  }
  const parsed = new Date(expire);
  if (Number.isNaN(parsed.getTime())) {
    return 60 * 60 * 24;
  }
  const delta = Math.floor((parsed.getTime() - Date.now()) / 1000);
  if (!Number.isFinite(delta) || delta <= 0) {
    return 60 * 60 * 24;
  }
  return delta;
}

export function persistToken(token, expire) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    for (const key of TOKEN_STORAGE_KEYS) {
      window.localStorage?.setItem?.(key, token);
    }
  } catch (error) {
    console.warn("Failed to persist token in localStorage", error);
  }

  try {
    const maxAge = resolveMaxAge(expire);
    document.cookie = `${TOKEN_COOKIE_NAME}=${token}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
  } catch (error) {
    console.warn("Failed to persist token cookie", error);
  }
}

export function clearToken() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    for (const key of TOKEN_STORAGE_KEYS) {
      window.localStorage?.removeItem?.(key);
    }
  } catch (error) {
    console.warn("Failed to clear token from localStorage", error);
  }

  try {
    document.cookie = `${TOKEN_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
  } catch (error) {
    console.warn("Failed to clear token cookie", error);
  }
}

