import { NextResponse } from "next/server";

import { AUTH_UPSTREAM_BASE_URL, resolveAuthorization } from "../me/helpers";

const AUTH_COOKIE_KEYS = ["token", "jwt", "access_token"];

function clearAuthCookies(response) {
  if (!response) {
    return;
  }
  for (const name of AUTH_COOKIE_KEYS) {
    try {
      response.cookies.delete(name);
    } catch (error) {
      // ignore cookie deletion issues
    }
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
  const authorization = resolveAuthorization(request);
  if (!authorization) {
    const response = NextResponse.json({ message: "Logged out" }, { status: 200 });
    clearAuthCookies(response);
    return response;
  }

  try {
    const upstreamResponse = await fetch(`${AUTH_UPSTREAM_BASE_URL}/auth/logout`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: authorization,
      },
      cache: "no-store",
    });

    const text = await upstreamResponse.text();
    const headers = new Headers();
    const contentType = upstreamResponse.headers.get("content-type");
    if (contentType) {
      headers.set("content-type", contentType);
    }

    const response = new NextResponse(text, {
      status: upstreamResponse.status,
      headers,
    });

    clearAuthCookies(response);

    return response;
  } catch (error) {
    const response = NextResponse.json({ message: "Upstream auth service unreachable" }, { status: 502 });
    clearAuthCookies(response);
    return response;
  }
}
