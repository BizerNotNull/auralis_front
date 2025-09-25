import { NextResponse } from "next/server";

const TOKEN_COOKIE_NAMES = ["token", "jwt", "access_token", "authToken"];
const ADMIN_PATH_PREFIX = "/admin";
const AUTH_ME_ENDPOINT = "/api/auth/me";
const ADMIN_ROLE_NAME = "admin";
const PUBLIC_PATHS = new Set(["/", "/login", "/register", "/401"]);
const PUBLIC_ASSET_PREFIXES = [
  "/_next/",
  "/live2d/",
  "/yumi/",
  "/favicon.ico",
];

const PUBLIC_FILE_EXTENSIONS = new Set([
  "js",
  "css",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "ico",
  "json",
  "moc3",
  "wav",
  "mp3",
  "webp",
  "bmp",
]);

function normalizePathname(pathname) {
  if (!pathname) {
    return "/";
  }
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.replace(/\/+$/, "");
  }
  return pathname;
}

function isPublicPath(pathname) {
  return PUBLIC_PATHS.has(normalizePathname(pathname));
}

function isStaticAssetPath(pathname) {
  if (!pathname) {
    return false;
  }

  for (const prefix of PUBLIC_ASSET_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      return true;
    }
  }

  const lastSlash = pathname.lastIndexOf('/');
  const lastSegment = lastSlash >= 0 ? pathname.slice(lastSlash + 1) : pathname;
  if (!lastSegment || !lastSegment.includes('.')) {
    return false;
  }

  const ext = lastSegment.slice(lastSegment.lastIndexOf('.') + 1).toLowerCase();
  return PUBLIC_FILE_EXTENSIONS.has(ext);
}

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

function buildUnauthorizedResponse(request) {
  const url = request.nextUrl.clone();
  url.pathname = "/401";
  url.search = "";

  return NextResponse.rewrite(url, { status: 401 });
}

async function ensureAdminRole(request, authorization) {
  if (!authorization) {
    return false;
  }

  const profileUrl = new URL(AUTH_ME_ENDPOINT, request.url);

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

    return roles.some((role) => typeof role === "string" && role.trim().toLowerCase() === ADMIN_ROLE_NAME);
  } catch (error) {
    console.warn("Failed to verify admin role in middleware", error);
    return false;
  }
}

function extractAuthorizationContext(request) {
  const cookieToken = TOKEN_COOKIE_NAMES.map((name) => request.cookies.get(name)?.value?.trim()).find(Boolean);
  const authorizationHeader = request.headers.get("authorization");
  return normalizeBearerAuthorization(authorizationHeader, cookieToken);
}

export async function middleware(request) {
  const pathname = request.nextUrl.pathname || "/";

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }
  if (isStaticAssetPath(pathname)) {
    return NextResponse.next();
  }

  const { bearer, token } = extractAuthorizationContext(request);
  if (!token) {
    return buildUnauthorizedResponse(request);
  }

  if (pathname.startsWith(ADMIN_PATH_PREFIX)) {
    const hasAdminRole = await ensureAdminRole(request, bearer);
    if (!hasAdminRole) {
      return buildUnauthorizedResponse(request);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|api).*)"],
};
