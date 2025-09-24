export const AUTH_UPSTREAM_BASE_URL =
  process.env.AUTH_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

export function resolveAuthorization(request) {
  const header = request.headers.get("authorization");
  if (header && header.trim()) {
    return header;
  }

  const token =
    request.cookies.get("token")?.value?.trim() || request.cookies.get("jwt")?.value?.trim();
  if (token) {
    return `Bearer ${token}`;
  }

  return null;
}
