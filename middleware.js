import { NextResponse } from "next/server";

const TOKEN_COOKIE_NAMES = ["token", "jwt"];
const ADMIN_PATH_PREFIX = "/admin";

function normalizeBearerAuthorization(rawHeader, token) {
  if (rawHeader && /^Bearer\s+/i.test(rawHeader)) {
    return {
      bearer: rawHeader.trim(),
      token: rawHeader.replace(/^Bearer\s+/i, "").trim(),
    };
  }

  const trimmed = token?.trim();
  if (!trimmed) {
    return { bearer: null, token: "" };
  }

  return {
    bearer: `Bearer ${trimmed}`,
    token: trimmed,
  };
}

async function ensureAdminRole(request, authorization) {
  if (!authorization) {
    return false;
  }

  const profileUrl = new URL("/api/auth/me", request.nextUrl.origin);

  try {
    const response = await fetch(profileUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: authorization,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return false;
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      return false;
    }

    const roles = payload?.user?.roles;
    if (!Array.isArray(roles)) {
      return false;
    }

    return roles.some((role) => typeof role === "string" && role.trim().toLowerCase() === "admin");
  } catch (error) {
    console.warn("Failed to verify admin role in middleware", error);
    return false;
  }
}

export async function middleware(request) {
  const cookieToken = TOKEN_COOKIE_NAMES.map((name) => request.cookies.get(name)?.value?.trim())
    .find((value) => value);
  const authorizationHeader = request.headers.get("authorization");
  const { bearer, token } = normalizeBearerAuthorization(authorizationHeader, cookieToken);

  if (!token) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const pathname = request.nextUrl.pathname || "";
  if (pathname.startsWith(ADMIN_PATH_PREFIX)) {
    const hasAdminRole = await ensureAdminRole(request, bearer);
    if (!hasAdminRole) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/smart/:path*", "/admin/:path*"],
};
