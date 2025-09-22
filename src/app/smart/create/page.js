"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

function deriveHeaders(extra) {
  const headers = new Headers(extra);
  headers.set("Accept", "application/json");
  headers.set("Content-Type", "application/json");
  return headers;
}

export default function CreateAgentPage() {
  const router = useRouter();
  const [values, setValues] = useState({
    name: "",
    persona_desc: "",
    opening_line: "",
    first_turn_hint: "",
    model_provider: "openai",
    model_name: "gpt-oss-120b",
    temperature: "0.3",
    max_tokens: "1024",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess(null);
    setSubmitting(true);

    try {
      const payload = {
        name: values.name.trim(),
        persona_desc: values.persona_desc.trim() || undefined,
        opening_line: values.opening_line.trim() || undefined,
        first_turn_hint: values.first_turn_hint.trim() || undefined,
        model_provider: values.model_provider.trim() || "openai",
        model_name: values.model_name.trim() || "gpt-oss-120b",
      };

      const temperature = Number(values.temperature);
      const maxTokens = Number(values.max_tokens);
      if (!Number.isNaN(temperature)) {
        payload.temperature = temperature;
      }
      if (!Number.isNaN(maxTokens) && maxTokens > 0) {
        payload.max_tokens = maxTokens;
      }

      const response = await fetch(`${API_BASE_URL}/agents`, {
        method: "POST",
        headers: deriveHeaders(),
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Create agent failed with ${response.status}`);
      }

      const data = await response.json();
      setSuccess({
        id: data?.agent?.id,
        name: data?.agent?.name,
      });
      setValues((prev) => ({
        ...prev,
        name: "",
        persona_desc: "",
        opening_line: "",
        first_turn_hint: "",
      }));
    } catch (caught) {
      console.error(caught);
      setError(caught?.message ?? "Failed to create agent");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 py-10">
      <div className="mx-auto w-full max-w-3xl rounded-3xl border border-slate-200/60 bg-white/80 p-8 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              创建智能体
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              配置基础信息和大模型参数，快速生成一个新的虚拟助手。
            </p>
          </div>
          <Link
            href={`/smart/${success?.id ?? ""}`}
            className="text-sm text-blue-500 hover:text-blue-600"
          >
            {success?.id ? "查看智能体" : "返回聊天"}
          </Link>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-slate-600">
                智能体名称 *
              </span>
              <input
                name="name"
                value={values.name}
                onChange={handleChange}
                required
                maxLength={100}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                placeholder="例如：云岚助理"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-slate-600">
                开场话术
              </span>
              <input
                name="opening_line"
                value={values.opening_line}
                onChange={handleChange}
                maxLength={200}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                placeholder="欢迎语，例如：很高兴见到你，我们开始聊天吧"
              />
            </label>
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-slate-600">
              人格/角色设定
            </span>
            <textarea
              name="persona_desc"
              value={values.persona_desc}
              onChange={handleChange}
              rows={4}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="描述智能体的语气、背景、能力等"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-slate-600">对话提示</span>
            <textarea
              name="first_turn_hint"
              value={values.first_turn_hint}
              onChange={handleChange}
              rows={3}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="针对首轮对话的补充提示"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-slate-600">
                模型提供方 *
              </span>
              <input
                name="model_provider"
                value={values.model_provider}
                onChange={handleChange}
                required
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                placeholder="openai"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-slate-600">
                模型名称 *
              </span>
              <input
                name="model_name"
                value={values.model_name}
                onChange={handleChange}
                required
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                placeholder="gpt-4o-mini"
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-slate-600">
                温度 (0-2)
              </span>
              <input
                name="temperature"
                value={values.temperature}
                onChange={handleChange}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                placeholder="0.3"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-slate-600">
                最大输出 Token
              </span>
              <input
                name="max_tokens"
                value={values.max_tokens}
                onChange={handleChange}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                placeholder="1024"
              />
            </label>
          </div>

          {error ? (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </p>
          ) : null}

          {success ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-600">
              智能体创建成功，编号 {success.id}。
              <button
                type="button"
                className="ml-2 font-semibold text-emerald-700 underline"
                onClick={() => router.push(`/smart/${success.id}`)}
              >
                前往聊天
              </button>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-3">
            <Link
              href="/"
              className="rounded-full border border-slate-200 px-5 py-2 text-sm text-slate-600 transition hover:border-blue-400 hover:text-blue-500"
            >
              返回首页
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-blue-500 px-5 py-2 text-sm font-medium text-white shadow transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              {submitting ? "创建中..." : "创建智能体"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
