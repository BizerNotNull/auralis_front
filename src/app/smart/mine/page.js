"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

import { getApiBaseUrl } from "@/lib/api";
import { resolveAssetUrl } from "@/lib/media";

const API_BASE_URL = getApiBaseUrl();

function formatStatusLabel(status) {
  if (!status) {
    return "Unknown";
  }
  const trimmed = String(status).trim();
  if (!trimmed) {
    return "Unknown";
  }
  const lower = trimmed.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function statusBadgeClasses(status) {
  switch ((status ?? "").toString().toLowerCase()) {
    case "pending":
      return "border-amber-200 bg-amber-50 text-amber-600";
    case "active":
      return "border-emerald-200 bg-emerald-50 text-emerald-600";
    case "rejected":
      return "border-rose-200 bg-rose-50 text-rose-600";
    case "paused":
      return "border-slate-200 bg-slate-100 text-slate-600";
    case "archived":
      return "border-slate-300 bg-slate-200 text-slate-500";
    default:
      return "border-slate-200 bg-slate-100 text-slate-500";
  }
}

function formatDateTime(value) {
  if (!value) {
    return "--";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }
  return date.toLocaleString();
}

export default function MyAgentsPage() {
  const [agents, setAgents] = useState([]);
  const [status, setStatus] = useState({ loading: false, error: null });

  const loadAgents = useCallback(async () => {
    setStatus({ loading: true, error: null });
    try {
      const response = await fetch(`${API_BASE_URL}/agents/mine`, {
        method: "GET",
        headers: new Headers({ Accept: "application/json" }),
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`加载失败（${response.status}）`);
      }
      const data = await response.json();
      const list = Array.isArray(data?.agents) ? data.agents : [];
      setAgents(list);
      setStatus({ loading: false, error: null });
    } catch (error) {
      console.error(error);
      setAgents([]);
      setStatus({
        loading: false,
        error: error?.message ?? "无法加载我的智能体",
      });
    }
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const hasAgents = agents.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6">
        <div className="flex flex-col gap-3 text-slate-700 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">我的智能体</h1>
            <p className="mt-1 text-sm text-slate-500">
              查看并管理你创建的智能体，更新内容会重新进入审核流程。
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={loadAgents}
              disabled={status.loading}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:border-blue-400 hover:text-blue-500 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              {status.loading ? "刷新中..." : "刷新列表"}
            </button>
            <Link
              href="/smart/create"
              className="rounded-full bg-blue-500 px-4 py-2 text-sm font-medium text-white shadow transition hover:bg-blue-600"
            >
              创建新的智能体
            </Link>
          </div>
        </div>

        {status.error ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
            {status.error}
          </p>
        ) : null}

        {!status.error && !hasAgents && !status.loading ? (
          <div className="rounded-3xl border border-slate-200/60 bg-white/80 px-6 py-10 text-center text-slate-500">
            暂无智能体，点击“创建新的智能体”开始吧。
          </div>
        ) : null}

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => {
            const rawId = agent?.id ?? agent?.ID ?? null;
            const agentId = rawId != null ? String(rawId) : "";
            const avatarUrl = resolveAssetUrl(agent?.avatar_url ?? agent?.avatarUrl ?? "");
            const statusLabel = formatStatusLabel(agent?.status ?? "");
            const badgeClasses = statusBadgeClasses(agent?.status ?? "");
            const updatedAt = formatDateTime(agent?.updated_at ?? agent?.updatedAt);
            const createdAt = formatDateTime(agent?.created_at ?? agent?.createdAt);
            return (
              <article
                key={agentId || Math.random()}
                className="flex h-full flex-col gap-4 rounded-3xl border border-white/60 bg-white/90 p-5 shadow-xl backdrop-blur"
              >
                <div className="flex items-center gap-3">
                  {avatarUrl ? (
                    <Image
                      src={avatarUrl}
                      alt={`${agent?.name ?? `Agent ${agentId}`} avatar`}
                      width={56}
                      height={56}
                      className="h-14 w-14 rounded-full object-cover shadow"
                    />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
                      {(agent?.name ?? "AI").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="flex flex-col gap-1">
                    <h2 className="text-lg font-semibold text-slate-900">
                      {agent?.name ?? `Agent ${agentId || "--"}`}
                    </h2>
                    <span className="text-xs text-slate-400">ID: {agentId || "--"}</span>
                  </div>
                </div>

                <span
                  className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-semibold ${badgeClasses}`}
                >
                  {statusLabel}
                </span>

                {agent?.one_sentence_intro ? (
                  <p className="line-clamp-3 text-sm text-slate-600">
                    {agent.one_sentence_intro}
                  </p>
                ) : (
                  <p className="italic text-sm text-slate-400">暂无简介</p>
                )}

                <div className="mt-auto flex flex-col gap-1 text-xs text-slate-400">
                  <span>更新于：{updatedAt}</span>
                  <span>创建于：{createdAt}</span>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {agentId ? (
                    <Link
                      href={`/smart/create?agent=${agentId}`}
                      className="rounded-full bg-blue-500 px-4 py-2 text-sm font-medium text-white shadow transition hover:bg-blue-600"
                    >
                      编辑
                    </Link>
                  ) : null}
                  {agentId ? (
                    <Link
                      href={`/smart/${agentId}`}
                      className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:border-blue-400 hover:text-blue-500"
                    >
                      查看
                    </Link>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>

        {status.loading ? (
          <p className="text-sm text-slate-500">正在加载你的智能体...</p>
        ) : null}
      </div>
    </div>
  );
}
