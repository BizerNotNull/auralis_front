/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveAssetUrl } from "@/lib/media";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";
const PAGE_SIZE = 6;

function pickStoredToken() {
  if (typeof window === "undefined") {
    return null;
  }
  const candidateKeys = ["access_token", "token", "authToken", "jwt"];
  for (const key of candidateKeys) {
    try {
      const value = window.localStorage?.getItem?.(key);
      if (value) {
        return value;
      }
    } catch (error) {
      console.warn("Failed to read localStorage token", error);
    }
  }
  return null;
}

function deriveHeaders(extra) {
  const headers = new Headers(extra);
  const token = pickStoredToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  headers.set("Accept", "application/json");
  return headers;
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString();
}

export default function AgentDirectoryPage() {
  const [agents, setAgents] = useState([]);
  const [status, setStatus] = useState({ loading: false, error: null });
  const [page, setPage] = useState(1);

  const loadAgents = useCallback(async () => {
    setStatus({ loading: true, error: null });
    try {
      const response = await fetch(`${API_BASE_URL}/agents`, {
        method: "GET",
        headers: deriveHeaders(),
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`List agents failed with ${response.status}`);
      }
      const data = await response.json();
      const list = Array.isArray(data?.agents) ? data.agents : [];
      setAgents(list);
      setStatus({ loading: false, error: null });
      setPage(1);
    } catch (error) {
      console.error(error);
      setStatus({
        loading: false,
        error: error?.message ?? "Failed to load agents",
      });
    }
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const totalPages = useMemo(() => {
    if (!agents.length) {
      return 1;
    }
    return Math.max(1, Math.ceil(agents.length / PAGE_SIZE));
  }, [agents.length]);

  const pagedAgents = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return agents.slice(start, start + PAGE_SIZE);
  }, [agents, page]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 py-10">
      <div className="mx-auto w-full max-w-6xl px-6">
        <header className="flex flex-col gap-4 border-b border-slate-200/70 pb-8 text-slate-700 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-wide text-slate-400">Smart Agents</p>
            <h1 className="text-3xl font-semibold text-slate-900">智能体总览</h1>
            <p className="max-w-2xl text-sm text-slate-500">
              使用本页面分页浏览所有已创建的智能体，提供头像预留位，方便后续为每位智能体上传专属形象。
            </p>
          </div>
          <div className="flex items-center gap-3 self-start">
            <button
              type="button"
              onClick={loadAgents}
              disabled={status.loading}
              className="rounded-full border border-slate-200 px-5 py-2 text-sm font-medium text-slate-600 transition hover:border-blue-400 hover:text-blue-500 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              {status.loading ? "正在刷新..." : "刷新列表"}
            </button>
            <Link
              href="/smart/create"
              className="rounded-full bg-blue-500 px-5 py-2 text-sm font-medium text-white shadow transition hover:bg-blue-600"
            >
              创建智能体
            </Link>
          </div>
        </header>

        {status.error ? (
          <div className="mt-6 rounded-3xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-600">
            {status.error}
          </div>
        ) : null}

        {status.loading && !agents.length ? (
          <div className="mt-12 flex justify-center text-sm text-slate-500">
            正在加载智能体...
          </div>
        ) : null}

        {!status.loading && !status.error && !agents.length ? (
          <div className="mt-12 flex flex-col items-center gap-4 rounded-3xl border border-dashed border-slate-200 bg-white/80 px-10 py-16 text-center text-slate-500">
            <p className="text-lg font-medium text-slate-700">暂未创建智能体</p>
            <p className="max-w-md text-sm">
              去创建一个新的智能体，为用户提供更丰富、更个性化的交互体验。
            </p>
            <Link
              href="/smart/create"
              className="rounded-full bg-blue-500 px-5 py-2 text-sm font-medium text-white shadow transition hover:bg-blue-600"
            >
              立即创建
            </Link>
          </div>
        ) : null}

        {agents.length ? (
          <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {pagedAgents.map((agent) => {
              const agentId = agent?.id ?? agent?.ID;
              const persona = agent?.persona_desc ?? agent?.personaDesc ?? "";
              const description = persona || agent?.first_turn_hint || agent?.opening_line || "";
              let tags = [];
              try {
                if (Array.isArray(agent?.tags)) {
                  tags = agent.tags;
                } else if (typeof agent?.tags === "string" && agent.tags.trim()) {
                  const parsed = JSON.parse(agent.tags);
                  if (Array.isArray(parsed)) {
                    tags = parsed;
                  }
                }
              } catch (error) {
                console.warn("Failed to parse agent tags", error);
              }

              const avatarUrl = resolveAssetUrl(agent?.avatar_url ?? agent?.avatarUrl ?? "");

              return (
                <article
                  key={agentId ?? Math.random()}
                  className="flex flex-col rounded-3xl border border-white/60 bg-white/90 p-5 shadow-xl backdrop-blur"
                >
                  <div className="relative mb-4 aspect-[4/3] w-full overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={`${agent?.name ?? `Agent ${agentId ?? ""}`} avatar`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs uppercase tracking-wide text-slate-400">
                        头像预留位
                      </div>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900">
                          {agent?.name ?? `Agent ${agentId}`}
                        </h2>
                        <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">
                          ID: {agentId ?? "--"}
                        </p>
                      </div>
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-500">
                        {agent?.status ?? "active"}
                      </span>
                    </div>

                    {description ? (
                      <p className="mt-3 text-sm text-slate-600">
                        {description}
                      </p>
                    ) : (
                      <p className="mt-3 text-sm italic text-slate-400">暂无简介。</p>
                    )}

                    {tags?.length ? (
                      <ul className="mt-4 flex flex-wrap gap-2 text-xs text-blue-500">
                        {tags.map((tag) => (
                          <li
                            key={`${agentId}-${tag}`}
                            className="rounded-full border border-blue-200 px-3 py-1"
                          >
                            #{tag}
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    <div className="mt-5 flex flex-col gap-2 text-xs text-slate-400">
                      <span>创建时间：{formatDateTime(agent?.created_at ?? agent?.createdAt)}</span>
                      <span>最近更新：{formatDateTime(agent?.updated_at ?? agent?.updatedAt)}</span>
                    </div>

                    <div className="mt-6 flex items-center justify-between">
                      <Link
                        href={`/smart/${agentId ?? ""}`}
                        className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-blue-400 hover:text-blue-500"
                      >
                        查看详情
                      </Link>
                      <button
                        type="button"
                        className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-400 opacity-60"
                        disabled
                      >
                        等待上传头像
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}

        {agents.length > PAGE_SIZE ? (
          <div className="mt-12 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:border-blue-400 hover:text-blue-500 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              上一页
            </button>
            <span className="text-sm text-slate-500">
              {"第 "}
              {page}
              {" 页 / 共 "}
              {totalPages}
              {" 页"}
            </span>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page >= totalPages}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:border-blue-400 hover:text-blue-500 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              下一页
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
