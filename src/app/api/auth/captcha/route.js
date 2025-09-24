import { NextResponse } from "next/server";

const UPSTREAM_BASE_URL =
  process.env.AUTH_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function GET() {
  try {
    const response = await fetch(`${UPSTREAM_BASE_URL}/auth/captcha`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
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
