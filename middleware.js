import { NextResponse } from "next/server";

const TOKEN_COOKIE_NAME = "token";

export function middleware(request) {
  const cookieToken = request.cookies.get(TOKEN_COOKIE_NAME)?.value?.trim();
  const authorization = request.headers.get("authorization");
  const headerToken = authorization && /^Bearer\s+/i.test(authorization)
    ? authorization.replace(/^Bearer\s+/i, "").trim()
    : undefined;

  if (!cookieToken && !headerToken) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/smart/:path*", "/admin/:path*"],
};
