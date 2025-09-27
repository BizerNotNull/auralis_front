import { NextResponse } from "next/server";

import { AUTH_UPSTREAM_BASE_URL, resolveAuthorization } from "../../me/helpers";

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
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const response = await fetch(
      `${AUTH_UPSTREAM_BASE_URL}/auth/tokens/purchase`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: authorization,
        },
        cache: "no-store",
        body: JSON.stringify(payload),
      },
    );

    const text = await response.text();
    const headers = new Headers();
    const contentType = response.headers.get("content-type");
    if (contentType) {
      headers.set("content-type", contentType);
    }

    return new NextResponse(text, {
      status: response.status,
      headers,
    });
  } catch (error) {
    return NextResponse.json(
      { message: "Upstream auth service unreachable" },
      { status: 502 },
    );
  }
}
