/* eslint-disable @next/next/no-img-element */
import Image from "next/image";
import Link from "next/link";
import { cookies, headers } from "next/headers";

import { resolveAssetUrl } from "@/lib/media";

export const dynamic = "force-dynamic";

const API_BASE_CANDIDATES = [
  process.env.AUTH_API_BASE_URL ?? "",
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "",
];
const DEFAULT_API_BASE_URL = "http://localhost:8080";
const DEFAULT_APP_ORIGIN = "http://localhost:3000";

function resolveRequestOrigin(headerList) {
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  if (!host) {
    return null;
  }
  const forwardedProto = headerList.get("x-forwarded-proto");
  const protocol =
    forwardedProto?.split(",")[0]?.trim() ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${protocol}://${host}`;
}

function normalizeBaseUrl(candidate, headerList) {
  const value = candidate?.trim();
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    const normalizedPath = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
    return `${url.origin}${normalizedPath}`;
  } catch (error) {
    // fall through
  }

  if (value.startsWith("//")) {
    const forwardedProto = headerList.get("x-forwarded-proto");
    const protocol = forwardedProto?.split(",")[0]?.trim() ?? "https";
    return `${protocol}:${value}`.replace(/\/$/, "");
  }

  if (value.startsWith("/")) {
    const origin = resolveRequestOrigin(headerList) ?? "http://localhost:3000";
    return `${origin}${value}`.replace(/\/$/, "");
  }

  if (/^[\w.-]+(:\d+)?(\/.*)?$/.test(value)) {
    const protocol = value.startsWith("localhost") || value.startsWith("127.0.0.1") ? "http" : "https";
    return `${protocol}://${value}`.replace(/\/$/, "");
  }

  return null;
}

function resolveApiBaseUrl(headerList) {
  for (const candidate of API_BASE_CANDIDATES) {
    const normalized = normalizeBaseUrl(candidate, headerList);
    if (normalized) {
      return normalized;
    }
  }

  const fallback = normalizeBaseUrl(DEFAULT_API_BASE_URL, headerList);
  if (fallback) {
    return fallback;
  }

  const origin = resolveRequestOrigin(headerList);
  if (origin) {
    return origin;
  }

  return DEFAULT_API_BASE_URL;
}

function readCookieEntries(cookieStore) {
  try {
    const entries = cookieStore?.getAll?.();
    return Array.isArray(entries) ? entries : [];
  } catch (error) {
    return [];
  }
}

function extractTokenFromCookies(entries) {
  if (!Array.isArray(entries) || !entries.length) {
    return "";
  }

  const candidateKeys = ["token", "jwt", "access_token"];
  for (const key of candidateKeys) {
    const match = entries.find((cookie) => cookie?.name === key);
    const value = match?.value?.trim();
    if (value) {
      return value;
    }
  }

  return "";
}

function isSameOrigin(target, origin) {
  if (!target || !origin) {
    return false;
  }

  try {
    return new URL(target).origin === new URL(origin).origin;
  } catch (error) {
    return false;
  }
}


function serializeCookies(entries) {
  if (!Array.isArray(entries) || !entries.length) {
    return "";
  }
  return entries.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

function extractUserPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const nested = payload?.user ?? payload?.data?.user;
  if (nested && typeof nested === "object") {
    return nested;
  }
  const indicativeKeys = ["id", "username", "display_name", "displayName"];
  if (indicativeKeys.some((key) => key in payload)) {
    return payload;
  }
  return null;
}

function buildEndpoint(baseUrl, pathname) {
  const trimmedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${trimmedBase}${normalizedPath}`;
}

async function fetchCurrentUser(appOrigin, apiBaseUrl, token, cookieHeader) {
  if (!token && !cookieHeader) {
    return null;
  }

  const endpoints = [];
  if (appOrigin) {
    endpoints.push(buildEndpoint(appOrigin, "/api/auth/me"));
  }
  if (token) {
    endpoints.push(buildEndpoint(apiBaseUrl, "/auth/profile"));
  }

  const seen = new Set();

  for (const endpoint of endpoints) {
    if (!endpoint || seen.has(endpoint)) {
      continue;
    }
    seen.add(endpoint);

    try {
      const requestHeaders = new Headers({ Accept: "application/json" });
      if (token) {
        requestHeaders.set("Authorization", `Bearer ${token}`);
      }
      if (cookieHeader && isSameOrigin(endpoint, appOrigin)) {
        requestHeaders.set("Cookie", cookieHeader);
      }

      const response = await fetch(endpoint, {
        method: "GET",
        headers: requestHeaders,
        cache: "no-store",
      });

      if (response.status === 401) {
        continue;
      }

      if (!response.ok) {
        continue;
      }

      const data = await response.json().catch(() => null);
      const userPayload = extractUserPayload(data);
      if (userPayload) {
        return userPayload;
      }
    } catch (error) {
      // try next endpoint
    }
  }

  return null;
}

async function fetchAgents(apiBaseUrl, token) {
  try {
    const headers = new Headers({ Accept: "application/json" });
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    const response = await fetch(buildEndpoint(apiBaseUrl, "/agents"), {
      method: "GET",
      headers,
      cache: "no-store",
    });
    if (!response.ok) {
      return [];
    }

    const data = await response.json().catch(() => null);
    return Array.isArray(data?.agents) ? data.agents : [];
  } catch (error) {
    return [];
  }
}

function formatAgentDescription(agent) {
  const persona = agent?.persona_desc ?? agent?.personaDesc ?? "";
  if (typeof persona === "string" && persona.trim()) {
    return persona.trim();
  }
  const hint = agent?.opening_line ?? agent?.openingLine ?? "";
  if (typeof hint === "string" && hint.trim()) {
    return hint.trim();
  }
  return "暂无简介";
}

export default async function Home() {
  const cookieStore = await cookies();
  const cookieEntries = readCookieEntries(cookieStore);
  const token = extractTokenFromCookies(cookieEntries);

  const headerList = await headers();
  const apiBaseUrl = resolveApiBaseUrl(headerList);
  const appOrigin = resolveRequestOrigin(headerList) ?? DEFAULT_APP_ORIGIN;
  const cookieHeader = serializeCookies(cookieEntries);
  const [user, agents] = await Promise.all([
    fetchCurrentUser(appOrigin, apiBaseUrl, token, cookieHeader),
    fetchAgents(apiBaseUrl, token),
  ]);

  const loggedIn = Boolean(user);
  const displayName = (user?.display_name ?? user?.username ?? "").trim();
  const headerDisplayName = displayName || "我的主页";
  const avatarUrl = typeof user?.avatar_url === "string" ? user.avatar_url : "";
  const visibleAgents = agents.slice(0, 6);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/next.svg" alt="Auralis" width={120} height={28} priority />
            <span className="hidden text-lg font-semibold sm:inline">Auralis 智能体平台</span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 sm:flex">
            <Link href="/smart" className="hover:text-slate-900">
              智能体广场
            </Link>
            <Link href="/smart/create" className="hover:text-slate-900">
              创建智能体
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            {loggedIn ? (
              <Link
                href="/me"
                className="flex items-center gap-3 rounded-full border border-slate-200 bg-white/70 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-blue-300 hover:text-blue-500"
              >
                {avatarUrl ? (
                  <img
                    src={resolveAssetUrl(avatarUrl)}
                    alt={headerDisplayName}
                    className="h-9 w-9 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500 text-xs font-semibold text-white">
                    {headerDisplayName.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span>{headerDisplayName}</span>
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-blue-400 hover:text-blue-500"
                >
                  登录
                </Link>
                <Link
                  href="/register"
                  className="rounded-full bg-blue-500 px-4 py-2 text-sm font-medium text-white shadow transition hover:bg-blue-600"
                >
                  注册
                </Link>
              </>
            )}
          </div>
        </header>

        <main className="flex flex-1 flex-col justify-center">
          <section className="grid items-center gap-12 py-16 md:grid-cols-2">
            <div className="space-y-6">
              <p className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-4 py-1 text-xs font-medium text-blue-600">
                {loggedIn ? `欢迎回来，${headerDisplayName}` : "多模态智能体协作"}
              </p>
              <h1 className="text-4xl font-bold leading-tight tracking-tight text-slate-900 sm:text-5xl">
                机械的心率带动血肉的共鸣
              </h1>
              <p className="text-base text-slate-600">
                在 Auralis，配置属于自己的个性化智能体，结合 Live2D 表演、语音交互与多模态能力，随时与其他人分享。
              </p>
              <div className="flex flex-wrap gap-4">
                {loggedIn ? null : (
                  <>
                    <Link
                      href="/login"
                      className="rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow transition hover:bg-slate-700"
                    >
                      立即登录
                    </Link>
                    <Link
                      href="/register"
                      className="rounded-full border border-slate-200 px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-blue-400 hover:text-blue-500"
                    >
                      创建账号
                    </Link>
                  </>
                )}
              </div>
            </div>
            <div className="relative flex justify-center">
              <div
                className="absolute inset-0 -translate-y-6 scale-110 rounded-full bg-blue-100 opacity-60 blur-3xl"
                aria-hidden
              />
              <Image
                src="/vercel.svg"
                alt="Platform preview"
                width={360}
                height={360}
                className="relative z-10"
                priority
              />
            </div>
          </section>

          <section className="mt-8 rounded-3xl border border-slate-200 bg-white/80 p-8 shadow-xl backdrop-blur">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-6 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">当前智能体</h2>
                <p className="text-sm text-slate-500">
                  {loggedIn
                    ? "探索你的专属智能体，与更多角色建立协作"
                    : "登录解锁属于你的智能体，立即登录"}
                </p>
              </div>
              {!loggedIn ? (
                <Link
                  href="/login"
                  className="self-start rounded-full bg-blue-500 px-5 py-2 text-sm font-medium text-white shadow transition hover:bg-blue-600"
                >
                  立即登录
                </Link>
              ) : null}
            </div>

            {loggedIn ? (
              visibleAgents.length ? (
                <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {visibleAgents.map((agent) => {
                    const agentId = agent?.id ?? agent?.agent_id ?? Math.random();
                    const name = agent?.name ?? `智能体 ${agentId}`;
                    const status = agent?.status ?? "active";
                    const description = formatAgentDescription(agent);
                    const avatar = resolveAssetUrl(agent?.avatar_url ?? agent?.avatarUrl ?? "");

                    return (
                      <article
                        key={agentId}
                        className="flex flex-col gap-4 rounded-3xl border border-white/60 bg-white/90 p-5 shadow-lg backdrop-blur"
                      >
                        <div className="flex items-center gap-4">
                          {avatar ? (
                            <img
                              src={avatar}
                              alt={name}
                              className="h-14 w-14 rounded-2xl object-cover"
                            />
                          ) : (
                            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-sm font-semibold text-blue-500">
                              {name.slice(0, 1).toUpperCase()}
                            </span>
                          )}
                          <div>
                            <h3 className="text-lg font-semibold text-slate-900">{name}</h3>
                            <p className="text-xs text-slate-400">状态：{status}</p>
                          </div>
                        </div>
                        <p className="flex-1 text-sm text-slate-600">{description}</p>
                        <div className="mt-auto">
                          <Link
                            href={`/smart/${agentId}`}
                            className="inline-flex w-full justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-blue-400 hover:text-blue-500"
                          >
                            进入详情
                          </Link>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center text-slate-500">
                  暂无可用智能体，去 <Link href="/smart/create" className="text-blue-500 hover:text-blue-600">创建一个</Link> 吧。
                </div>
              )
            ) : (
              <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center text-slate-500">
                登录解锁属于你的智能体，<Link href="/login" className="text-blue-500 hover:text-blue-600">立即登录</Link>。
              </div>
            )}
          </section>
        </main>

        <footer className="mt-12 border-t border-slate-200 pt-6 text-sm text-slate-500">
          <p>Copyright {new Date().getFullYear()} Auralis By Bizer. 保留所有权利。</p>
        </footer>
      </div>
    </div>
  );
}



