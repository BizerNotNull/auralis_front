/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Live2DContainer from "@/components/Live2DContainer";
import { resolveAssetUrl } from "@/lib/media";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

const DEFAULT_LIVE2D_MODEL = {
  id: "default-yumi",
  key: "default-yumi",
  name: "默认：Yumi",
  entry_url: "/yumi/yumi.model3.json",
  preview_url: "/yumi/yumi.png",
  storage_type: "local",
};

function normalizeLive2DModels(list) {
  if (!Array.isArray(list)) {
    return [];
  }

  return list
    .map((item) => {
      const entryUrl =
        typeof item?.entry_url === "string" ? item.entry_url.trim() : "";
      if (!entryUrl) {
        return null;
      }

      const name =
        typeof item?.name === "string" && item.name.trim()
          ? item.name.trim()
          : entryUrl;
      const description =
        typeof item?.description === "string" && item.description.trim()
          ? item.description.trim()
          : undefined;
      const preview =
        typeof item?.preview_url === "string" ? item.preview_url.trim() : "";
      const storageType =
        typeof item?.storage_type === "string" && item.storage_type.trim()
          ? item.storage_type.trim()
          : "local";

      return {
        id: item?.id ?? item?.key ?? entryUrl,
        key: item?.key ?? null,
        name,
        description,
        entry_url: entryUrl,
        preview_url: preview,
        storage_type: storageType,
      };
    })
    .filter(Boolean);
}

function deriveHeaders(extra, options = {}) {
  const headers = new Headers(extra);
  headers.set("Accept", "application/json");
  if (options.contentType) {
    headers.set("Content-Type", options.contentType);
  }
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
    live2d_model_id: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);

  const [avatarFile, setAvatarFile] = useState(null);

  const [modelList, setModelList] = useState([]);
  const [modelListStatus, setModelListStatus] = useState({
    loading: false,
    error: null,
  });
  const live2DRef = useRef(null);
  const [live2DStatus, setLive2DStatus] = useState("init");
  const [live2DError, setLive2DError] = useState(null);

  const avatarPreviewUrl = useMemo(() => {
    if (!avatarFile) {
      return "";
    }
    return URL.createObjectURL(avatarFile);
  }, [avatarFile]);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  useEffect(() => {
    let aborted = false;
    setModelListStatus({ loading: true, error: null });

    (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/live2d/models`, {
          method: "GET",
          headers: deriveHeaders(),
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`Live2D models request failed with ${response.status}`);
        }
        const data = await response.json();
        if (aborted) {
          return;
        }
        const list = normalizeLive2DModels(data?.models);
        setModelList(list);
        setModelListStatus({ loading: false, error: null });
      } catch (error) {
        if (aborted) {
          return;
        }
        console.error(error);
        setModelList([]);
        setModelListStatus({
          loading: false,
          error: error?.message ?? "加载 Live2D 模型列表失败",
        });
      }
    })();

    return () => {
      aborted = true;
    };
  }, []);

  const availableModels = useMemo(() => {
    const combined = [DEFAULT_LIVE2D_MODEL, ...modelList];
    const unique = [];
    const seen = new Set();

    for (const item of combined) {
      if (!item) {
        continue;
      }
      const entry =
        typeof item.entry_url === "string" ? item.entry_url.trim() : "";
      if (!entry || seen.has(entry)) {
        continue;
      }
      seen.add(entry);
      unique.push(item);
    }

    return unique;
  }, [modelList]);

  const selectedModelUrl = (values.live2d_model_id ?? "").trim();

  useEffect(() => {
    if (!selectedModelUrl && availableModels.length > 0) {
      setValues((prev) => ({
        ...prev,
        live2d_model_id: availableModels[0].entry_url,
      }));
    }
  }, [availableModels, selectedModelUrl, setValues]);

  const selectedModel = useMemo(() => {
    if (!selectedModelUrl) {
      return null;
    }
    return (
      availableModels.find(
        (model) => (model.entry_url ?? "").trim() === selectedModelUrl,
      ) ?? null
    );
  }, [availableModels, selectedModelUrl]);

  const previewModelUrl = selectedModel?.entry_url ?? "";
  const resolvedModelUrl = previewModelUrl
    ? resolveAssetUrl(previewModelUrl)
    : "";
  const previewImageUrl = selectedModel?.preview_url ?? "";
  const previewImageSrc = previewImageUrl
    ? resolveAssetUrl(previewImageUrl)
    : "";
  const selectedModelDescription = selectedModel?.description ?? "";

  const live2DStatusLabel = useMemo(() => {
    switch (live2DStatus) {
      case "loading":
        return "模型加载中...";
      case "ready":
        return "模型预览已就绪";
      case "error":
        return "模型加载失败";
      default:
        return "等待选择模型";
    }
  }, [live2DStatus]);

  useEffect(() => {
    setLive2DStatus("init");
    setLive2DError(null);
  }, [resolvedModelUrl]);

  const handleModelSelect = useCallback(
    (entryUrl) => {
      setValues((prev) => ({
        ...prev,
        live2d_model_id: entryUrl,
      }));
    },
    [setValues],
  );

  const handleLive2DStatusChange = useCallback((status, message) => {
    setLive2DStatus(status);
    setLive2DError(message ?? null);
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleAvatarChange = (event) => {
    const file = event.target?.files?.[0];
    if (file) {
      setAvatarFile(file);
    } else {
      setAvatarFile(null);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess(null);
    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("name", values.name.trim());

      if (values.persona_desc.trim()) {
        formData.append("persona_desc", values.persona_desc.trim());
      }
      if (values.opening_line.trim()) {
        formData.append("opening_line", values.opening_line.trim());
      }
      if (values.first_turn_hint.trim()) {
        formData.append("first_turn_hint", values.first_turn_hint.trim());
      }

      const provider = values.model_provider.trim() || "openai";
      const modelName = values.model_name.trim() || "gpt-oss-120b";
      formData.append("model_provider", provider);
      formData.append("model_name", modelName);

      const temperature = Number(values.temperature);
      const maxTokens = Number(values.max_tokens);
      if (!Number.isNaN(temperature)) {
        formData.append("temperature", String(temperature));
      }
      if (!Number.isNaN(maxTokens) && maxTokens > 0) {
        formData.append("max_tokens", String(maxTokens));
      }

      if (avatarFile) {
        formData.append("avatar", avatarFile);
      }
      if (values.live2d_model_id && values.live2d_model_id.trim()) {
        formData.append("live2d_model_id", values.live2d_model_id.trim());
      }

      const response = await fetch(`${API_BASE_URL}/agents`, {
        method: "POST",
        headers: deriveHeaders(),
        credentials: "include",
        body: formData,
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
      setAvatarFile(null);
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
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6">
        <div className="flex flex-col gap-3 text-slate-700 sm:flex-row sm:items-end sm:justify-between">
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

        <div className="flex flex-col gap-8 lg:flex-row">
          <div className="flex justify-center lg:w-[420px]">
            <div className="flex w-full max-w-[420px] flex-col items-center gap-4 rounded-3xl border border-white/60 bg-white/80 p-5 shadow-xl backdrop-blur">
              <div className="flex w-full flex-col items-center gap-1 text-center">
                <span className="text-base font-semibold text-slate-800">
                  {selectedModel?.name ?? "Live2D 模型"}
                </span>
                {selectedModelDescription ? (
                  <span className="line-clamp-3 text-xs text-slate-500">
                    {selectedModelDescription}
                  </span>
                ) : null}
              </div>
              <div className="w-full rounded-2xl border border-slate-200/70 bg-white/70 p-3 shadow-inner">
                <Live2DContainer
                  key={resolvedModelUrl || "live2d-empty"}
                  ref={live2DRef}
                  modelUrl={resolvedModelUrl}
                  width={360}
                  height={480}
                  background="transparent"
                  onStatusChange={handleLive2DStatusChange}
                />
              </div>
              {live2DError ? (
                <p className="text-xs text-red-500">{live2DError}</p>
              ) : (
                <p className="text-xs text-slate-500">{live2DStatusLabel}</p>
              )}
              {previewImageSrc ? (
                <div className="w-full rounded-xl bg-white/80 p-2 text-center">
                  <span className="text-[11px] text-slate-400">静态预览</span>
                  <img
                    src={previewImageSrc}
                    alt={`${selectedModel?.name ?? "Live2D"} 静态预览`}
                    className="mt-1 w-full rounded-lg object-contain"
                    loading="lazy"
                  />
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex-1 rounded-3xl border border-slate-200/60 bg-white/80 p-8 shadow-2xl backdrop-blur">
            <form className="space-y-6" onSubmit={handleSubmit}>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-slate-600">头像</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
                {avatarPreviewUrl ? (
                  <img
                    src={avatarPreviewUrl}
                    alt="新头像预览"
                    className="mt-2 h-24 w-24 rounded-full object-cover shadow"
                  />
                ) : (
                  <p className="mt-1 text-xs text-slate-400">
                    支持 JPG、PNG、GIF、WebP，建议尺寸不超过 5 MB。
                  </p>
                )}
                {avatarFile ? (
                  <button
                    type="button"
                    onClick={() => setAvatarFile(null)}
                    className="mt-2 w-fit rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 transition hover:border-red-300 hover:text-red-500"
                  >
                    移除已选择的头像
                  </button>
                ) : null}
              </label>

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-600">
                    选择 Live2D 模型
                  </span>
                  {modelListStatus.loading ? (
                    <span className="text-xs text-slate-400">加载中...</span>
                  ) : modelListStatus.error ? (
                    <span className="text-xs text-red-500">{modelListStatus.error}</span>
                  ) : (
                    <span className="text-xs text-slate-400">
                      {availableModels.length} 个可用
                    </span>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {availableModels.length ? (
                    availableModels.map((model) => {
                      const entry = (model.entry_url ?? "").trim();
                      const active = entry === selectedModelUrl;
                      const cover =
                        typeof model.preview_url === "string" && model.preview_url.trim()
                          ? resolveAssetUrl(model.preview_url)
                          : "";
                      const description = model.description ?? "";
                      return (
                        <button
                          key={model.id ?? entry}
                          type="button"
                          onClick={() => handleModelSelect(entry)}
                          className={`group relative flex flex-col rounded-2xl border bg-white/90 p-3 text-left shadow-sm transition ${
                            active
                              ? "border-blue-500 ring-2 ring-blue-200"
                              : "border-slate-200 hover:border-blue-300 hover:shadow-md"
                          }`}
                          aria-pressed={active}
                        >
                          <div className="aspect-[4/5] w-full overflow-hidden rounded-xl bg-slate-100">
                            {cover ? (
                              <img
                                src={cover}
                                alt={`${model.name} 预览`}
                                className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                                无预览图
                              </div>
                            )}
                          </div>
                          <div className="mt-2 flex items-start justify-between gap-2">
                            <div className="flex flex-1 flex-col">
                              <span className="text-sm font-medium text-slate-700">
                                {model.name}
                              </span>
                              {description ? (
                                <span className="mt-1 line-clamp-2 text-xs text-slate-500">
                                  {description}
                                </span>
                              ) : null}
                            </div>
                            {active ? (
                              <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-semibold text-blue-600">
                                已选
                              </span>
                            ) : null}
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                      暂无可用的 Live2D 模型，请先在后台添加。
                    </div>
                  )}
                </div>
              </section>

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
      </div>

    </div>
  );
}

