import { NextResponse } from "next/server";

import { AUTH_UPSTREAM_BASE_URL, resolveAuthorization } from "../helpers";

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

  let inboundFormData;
  try {
    inboundFormData = await request.formData();
  } catch (error) {
    return NextResponse.json({ message: "Invalid form data" }, { status: 400 });
  }

  if (!inboundFormData?.has("avatar")) {
    return NextResponse.json({ message: "Avatar file is required" }, { status: 400 });
  }

  const upstreamFormData = new FormData();
  inboundFormData.forEach((value, key) => {
    upstreamFormData.append(key, value);
  });

  try {
    const response = await fetch(`${AUTH_UPSTREAM_BASE_URL}/auth/profile/avatar`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: authorization,
      },
      cache: "no-store",
      body: upstreamFormData,
    });

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
    return NextResponse.json({ message: "Upstream auth service unreachable" }, { status: 502 });
  }
}
