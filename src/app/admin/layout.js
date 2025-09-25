import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { AUTH_UPSTREAM_BASE_URL } from "@/app/api/auth/me/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUIRED_ADMIN_ROLE = "admin";
const TOKEN_COOKIE_NAMES = ["token", "jwt", "access_token", "authToken"];

function trimTrailingSlash(value) {
  if (typeof value !== "string") {
    return "";
  }
  if (!value) {
    return "";
  }
  return value.replace(/\/+$/, "");
}

function buildProfileEndpoint() {
  const trimmedBase = trimTrailingSlash(AUTH_UPSTREAM_BASE_URL);
  const base = trimmedBase || "http://localhost:8080";
  return base + "/auth/profile";
}

function resolveAuthorizationToken(cookieStore, headerList) {
  const headerAuth = headerList.get("authorization");
  if (headerAuth && headerAuth.trim()) {
    return headerAuth;
  }

  for (const name of TOKEN_COOKIE_NAMES) {
    const value = cookieStore.get(name)?.value;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        return "Bearer " + trimmed;
      }
    }
  }

  return null;
}

function normalizeRoles(payload) {
  const rawRoles = payload?.roles ?? payload?.user?.roles ?? [];
  if (Array.isArray(rawRoles)) {
    return rawRoles.map((role) => String(role).trim().toLowerCase()).filter(Boolean);
  }
  if (typeof rawRoles === "string") {
    return rawRoles
      .split(",")
      .map((role) => role.trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
}

async function loadProfile(authorization) {
  if (!authorization) {
    return null;
  }

  try {
    const response = await fetch(buildProfileEndpoint(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: authorization,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.warn("Failed to load admin profile in layout", error);
    return null;
  }
}

export default async function AdminLayout({ children }) {
  const cookieStore = cookies();
  const headerList = headers();

  const authorization = resolveAuthorizationToken(cookieStore, headerList);
  const profile = await loadProfile(authorization);
  const roles = normalizeRoles(profile);

  if (!roles.includes(REQUIRED_ADMIN_ROLE)) {
    redirect("/401");
  }

  return <>{children}</>;
}
