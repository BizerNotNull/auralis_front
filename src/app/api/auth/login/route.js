
import { NextResponse } from "next/server";

const UPSTREAM_BASE_URL =
  process.env.AUTH_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

const AUTH_COOKIE_NAME = "token";
const AUTH_COOKIE_ALIASES = ["jwt"];
const DEFAULT_COOKIE_MAX_AGE = 60 * 60 * 24;
const FORCE_SECURE_COOKIE =
  String(process.env.AUTH_COOKIE_SECURE ?? process.env.NEXT_PUBLIC_AUTH_COOKIE_SECURE ?? "")
    .toLowerCase()
    .trim() === "true";
const SHOULD_SECURE_COOKIE =
  FORCE_SECURE_COOKIE || (process.env.NODE_ENV ?? "").toLowerCase() === "production";

function resolveCookieMaxAge(expire) {
  if (!expire) {
    return DEFAULT_COOKIE_MAX_AGE;
  }

  const candidate = expire instanceof Date ? expire : new Date(expire);
  if (Number.isNaN(candidate.getTime())) {
    return DEFAULT_COOKIE_MAX_AGE;
  }

  const seconds = Math.floor((candidate.getTime() - Date.now()) / 1000);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return DEFAULT_COOKIE_MAX_AGE;
  }

  return seconds;
}

function resolveCookieExpiry(expire) {
  if (!expire) {
    return null;
  }

  const candidate = expire instanceof Date ? expire : new Date(expire);
  if (Number.isNaN(candidate.getTime())) {
    return null;
  }

  return candidate;
}

function applyAuthCookies(response, token, expire) {
  if (!response || !token) {
    return;
  }

  const maxAge = resolveCookieMaxAge(expire);
  const expires = resolveCookieExpiry(expire);
  const baseCookie = {
    value: token,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge,
    secure: SHOULD_SECURE_COOKIE,
  };

  if (expires) {
    baseCookie.expires = expires;
  }

  response.cookies.set({ name: AUTH_COOKIE_NAME, ...baseCookie });
  for (const alias of AUTH_COOKIE_ALIASES) {
    response.cookies.set({ name: alias, ...baseCookie });
  }
}

function clearAuthCookies(response) {
  if (!response) {
    return;
  }
  response.cookies.delete(AUTH_COOKIE_NAME);
  for (const alias of AUTH_COOKIE_ALIASES) {
    response.cookies.delete(alias);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function POST(request) {
  let payload;

  try {
    payload = await request.json();
  } catch (error) {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const upstreamResponse = await fetch(`${UPSTREAM_BASE_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const text = await upstreamResponse.text();
    const responseHeaders = new Headers();
    const contentType = upstreamResponse.headers.get("content-type");
    if (contentType) {
      responseHeaders.set("content-type", contentType);
    }

    const response = new NextResponse(text, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });

    let parsedBody = null;
    if (contentType && contentType.includes("application/json")) {
      try {
        parsedBody = JSON.parse(text);
      } catch (error) {
        parsedBody = null;
      }
    }

    if (upstreamResponse.ok) {
      const token = parsedBody?.token ?? null;
      const expire = parsedBody?.expire ?? null;
      if (token) {
        applyAuthCookies(response, token, expire);
      }
    } else if (upstreamResponse.status === 401 || upstreamResponse.status === 403) {
      clearAuthCookies(response);
    }

    return response;
  } catch (error) {
    return NextResponse.json({ message: "Upstream auth service unreachable" }, { status: 502 });
  }
}
