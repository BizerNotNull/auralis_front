import { NextResponse } from "next/server";

const UPSTREAM_BASE_URL =
  process.env.AUTH_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

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
    const upstreamResponse = await fetch(`${UPSTREAM_BASE_URL}/auth/register`, {
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

    return new NextResponse(text, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return NextResponse.json({ message: "Upstream auth service unreachable" }, { status: 502 });
  }
}
