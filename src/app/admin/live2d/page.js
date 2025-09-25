/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "@/lib/api";
import { resolveAssetUrl } from "@/lib/media";

const API_BASE_URL = getApiBaseUrl();

function pickStoredToken() {
  if (typeof window === "undefined") {
    return null;
  }
  const keys = ["access_token", "token", "authToken", "jwt"];
  for (const key of keys) {
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
  headers.set("Accept", "application/json");
  const token = pickStoredToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

const emptyForm = {
  name: "",
  description: "",
  entry_file: "",
  preview_file: "",
  external_model_url: "",
  external_preview_url: "",
};

function formatTimestamp(seconds) {
  if (!seconds) {
    return "--";
  }
  const date = new Date(Number(seconds) * 1000);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }
  return date.toLocaleString();
}

export default function AdminLive2DPage() {
  const [profile, setProfile] = useState(null);
  const [profileStatus, setProfileStatus] = useState({
    loading: false,
    error: null,
  });

  const [models, setModels] = useState([]);
  const [modelsStatus, setModelsStatus] = useState({
    loading: false,
    error: null,
  });

  const [formValues, setFormValues] = useState(emptyForm);
  const [archiveFile, setArchiveFile] = useState(null);
  const [submitStatus, setSubmitStatus] = useState({
    loading: false,
    error: null,
    success: null,
  });
  const [deleteStatus, setDeleteStatus] = useState({});

  const sortedModels = useMemo(() => {
    return [...models].sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
  }, [models]);

  const loadProfile = useCallback(async () => {
    setProfileStatus({ loading: true, error: null });
    try {
      const response = await fetch(`${API_BASE_URL}/auth/profile`, {
        method: "GET",
        headers: deriveHeaders(),
        credentials: "include",
        cache: "no-store",
      });
      if (response.status === 401 || response.status === 403) {
        setProfile(null);
        setProfileStatus({
          loading: false,
          error: "未登录或权限不足，请先登录管理员账号",
        });
        return;
      }
      if (!response.ok) {
        throw new Error(`profile request failed with ${response.status}`);
      }
      const data = await response.json();
      setProfile(data);
      setProfileStatus({ loading: false, error: null });
    } catch (error) {
      console.error(error);
      setProfile(null);
      setProfileStatus({
        loading: false,
        error: error?.message ?? "无法加载用户信息",
      });
    }
  }, []);

  const loadModels = useCallback(async () => {
    setModelsStatus({ loading: true, error: null });
    try {
      const response = await fetch(`${API_BASE_URL}/live2d/models`, {
        method: "GET",
        headers: deriveHeaders(),
        credentials: "include",
        cache: "no-store",
      });
      if (response.status === 401 || response.status === 403) {
        setModels([]);
        setModelsStatus({
          loading: false,
          error: "未登录或权限不足，请先登录管理员账号",
        });
        return;
      }
      if (!response.ok) {
        throw new Error(`list models failed with ${response.status}`);
      }
      const data = await response.json();
      const list = Array.isArray(data?.models) ? data.models : [];
      setModels(list);
      setModelsStatus({ loading: false, error: null });
    } catch (error) {
      console.error(error);
      setModels([]);
      setModelsStatus({
        loading: false,
        error: error?.message ?? "加载模型列表失败",
      });
    }
  }, []);

  useEffect(() => {
    loadProfile();
    loadModels();
  }, [loadProfile, loadModels]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormValues((prev) => {
      const next = { ...prev, [name]: value };
      if (name === "external_model_url" && value.trim()) {
        setArchiveFile(null);
        next.entry_file = "";
        next.preview_file = "";
      }
      if (
        (name === "entry_file" || name === "preview_file") &&
        value.trim() &&
        (prev.external_model_url.trim() || prev.external_preview_url.trim())
      ) {
        next.external_model_url = "";
        next.external_preview_url = "";
      }
      return next;
    });
  };

  const handleArchiveChange = (event) => {
    const file = event.target?.files?.[0];
    if (file) {
      setArchiveFile(file);
      setFormValues((prev) => ({
        ...prev,
        external_model_url: "",
        external_preview_url: "",
      }));
    } else {
      setArchiveFile(null);
    }
  };

  const resetForm = () => {
    setFormValues(emptyForm);
    setArchiveFile(null);
    setSubmitStatus({ loading: false, error: null, success: null });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitStatus({ loading: true, error: null, success: null });

    try {
      const name = formValues.name.trim();
      if (!name) {
        throw new Error("请输入模型名称");
      }

      const hasArchive = Boolean(archiveFile);
      const externalUrl = formValues.external_model_url.trim();
      const hasExternal = externalUrl !== "";

      if (!hasArchive && !hasExternal) {
        throw new Error("请上传模型压缩包或填写外部模型地址");
      }
      if (hasArchive && hasExternal) {
        throw new Error("仅支持上传压缩包或填写外部链接二选一");
      }

      const formData = new FormData();
      formData.append("name", name);

      if (formValues.description.trim()) {
        formData.append("description", formValues.description.trim());
      }

      if (hasArchive && archiveFile) {
        formData.append("archive", archiveFile);
        if (formValues.entry_file.trim()) {
          formData.append("entry_file", formValues.entry_file.trim());
        }
        if (formValues.preview_file.trim()) {
          formData.append("preview_file", formValues.preview_file.trim());
        }
      }

      if (hasExternal) {
        formData.append("external_model_url", externalUrl);
        if (formValues.external_preview_url.trim()) {
          formData.append(
            "external_preview_url",
            formValues.external_preview_url.trim(),
          );
        }
      }

      const response = await fetch(`${API_BASE_URL}/live2d/models`, {
        method: "POST",
        headers: deriveHeaders(),
        credentials: "include",
        body: formData,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `create model failed with ${response.status}`);
      }

      await loadModels();
      resetForm();
      setSubmitStatus({
        loading: false,
        error: null,
        success: "模型已添加成功",
      });
    } catch (error) {
      console.error(error);
      setSubmitStatus({
        loading: false,
        error: error?.message ?? "提交失败",
        success: null,
      });
    }
  };

  const handleDelete = useCallback(
    async (model) => {
      if (!model?.id) {
        return;
      }
      setDeleteStatus((prev) => ({
        ...prev,
        [model.id]: { loading: true, error: null },
      }));
      try {
        const response = await fetch(
          `${API_BASE_URL}/live2d/models/${model.id}`,
          {
            method: "DELETE",
            headers: deriveHeaders(),
            credentials: "include",
          },
        );
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `delete model failed with ${response.status}`);
        }
        await loadModels();
        setDeleteStatus((prev) => ({
          ...prev,
          [model.id]: { loading: false, error: null },
        }));
      } catch (error) {
        console.error(error);
        setDeleteStatus((prev) => ({
          ...prev,
          [model.id]: {
            loading: false,
            error: error?.message ?? "删除失败",
          },
        }));
      }
    },
    [loadModels],
  );

  const profileName =
    profile?.user?.username ?? profile?.user?.email ?? "未登录";

  return (
    <div className="min-h-screen bg-slate-50 py-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1 text-slate-700">
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Admin Panel
            </p>
            <h1 className="text-2xl font-semibold text-slate-900">
              Live2D 模型管理
            </h1>
            <p className="text-sm text-slate-500">
              新增或删除可供智能体使用的 Live2D 模型资源。
            </p>
          </div>
          <div className="text-right text-xs text-slate-500">
            {profileStatus.loading ? "正在获取用户信息..." : null}
            {profileStatus.error ? profileStatus.error : null}
            {!profileStatus.loading && !profileStatus.error ? (
              <span>当前用户：{profileName}</span>
            ) : null}
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">模型列表</h2>
              <button
                type="button"
                onClick={loadModels}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 transition hover:border-blue-400 hover:text-blue-500"
              >
                刷新
              </button>
            </div>

            {modelsStatus.error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {modelsStatus.error}
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {modelsStatus.loading ? (
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 text-center text-sm text-slate-500 shadow">
                  加载中...
                </div>
              ) : null}

              {!modelsStatus.loading && sortedModels.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-6 text-center text-sm text-slate-500 shadow-inner">
                  暂无模型，请先在右侧上传或添加外部链接。
                </div>
              ) : null}

              {sortedModels.map((model) => {
                const previewUrl = model?.preview_url
                  ? resolveAssetUrl(model.preview_url)
                  : "";
                const entryUrl = model?.entry_url ?? "";
                const removeState = deleteStatus[model.id] ?? {
                  loading: false,
                  error: null,
                };
                return (
                  <div
                    key={model.id ?? model.entry_url}
                    className="flex h-full flex-col gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          {model.name}
                        </p>
                        <p className="text-xs text-slate-400">
                          {model.storage_type === "external" ? "外部资源" : "本地存储"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(model)}
                        disabled={removeState.loading}
                        className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-500 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {removeState.loading ? "删除中..." : "删除"}
                      </button>
                    </div>

                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt={`${model.name} 预览图`}
                        className="aspect-[3/4] w-full rounded-xl object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="aspect-[3/4] w-full rounded-xl border border-dashed border-slate-300 text-center text-xs text-slate-400">
                        <div className="grid h-full place-items-center">无预览图</div>
                      </div>
                    )}

                    {model.description ? (
                      <p className="text-xs text-slate-500">{model.description}</p>
                    ) : null}

                    <div className="rounded-xl bg-slate-100/60 p-3 text-[11px] text-slate-600 break-all">
                      {entryUrl || "--"}
                    </div>

                    <p className="text-[11px] text-slate-400">
                      创建时间：{formatTimestamp(model.created_at)}
                    </p>

                    {removeState.error ? (
                      <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-600">
                        {removeState.error}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="space-y-4 rounded-3xl border border-slate-200/60 bg-white/80 p-6 shadow-xl backdrop-blur">
            <h2 className="text-lg font-semibold text-slate-800">添加模型</h2>
            <p className="text-xs text-slate-500">
              选择上传压缩包（包含 .model3.json 以及资源文件），或直接填写可访问的外部模型地址。
            </p>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <label className="flex flex-col gap-2 text-sm text-slate-600">
                模型名称 *
                <input
                  name="name"
                  value={formValues.name}
                  onChange={handleInputChange}
                  required
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm text-slate-600">
                模型描述
                <textarea
                  name="description"
                  value={formValues.description}
                  onChange={handleInputChange}
                  rows={3}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="可选：用于标记模型用途或来源"
                />
              </label>

              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-4 text-xs text-slate-500">
                <p className="font-medium text-slate-600">上传压缩包（可选）</p>
                <p className="mt-1">压缩包需保留文件夹结构，支持 .zip / .rar，大小建议控制在 200 MB 以内。</p>
                <div className="mt-3 flex items-center gap-3">
                  <input type="file" accept=".zip,.rar" onChange={handleArchiveChange} />
                  {archiveFile ? (
                    <span className="text-[11px] text-slate-600">
                      {archiveFile.name} ({Math.round(archiveFile.size / 1024)} KB)
                    </span>
                  ) : null}
                </div>
              </div>

              {archiveFile ? (
                <div className="grid gap-3">
                  <label className="flex flex-col gap-1 text-xs text-slate-600">
                    入口文件路径（压缩包内）
                    <input
                      name="entry_file"
                      value={formValues.entry_file}
                      onChange={handleInputChange}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      placeholder="例如 MyModel/model.model3.json，可留空自动检测"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-slate-600">
                    预览图片路径（压缩包内，可选）
                    <input
                      name="preview_file"
                      value={formValues.preview_file}
                      onChange={handleInputChange}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      placeholder="例如 MyModel/preview.png"
                    />
                  </label>
                </div>
              ) : 
              (
                <div className="grid gap-3">
                  <label className="flex flex-col gap-1 text-xs text-slate-600">
                    外部模型地址
                    <input
                      name="external_model_url"
                      value={formValues.external_model_url}
                      onChange={handleInputChange}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      placeholder="填写 https:// 或 / 开头的可访问地址"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-slate-600">
                    外部预览图地址（可选）
                    <input
                      name="external_preview_url"
                      value={formValues.external_preview_url}
                      onChange={handleInputChange}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                </div>
              )}

              {submitStatus.error ? (
                <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                  {submitStatus.error}
                </p>
              ) : null}

              {submitStatus.success ? (
                <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-600">
                  {submitStatus.success}
                </p>
              ) : null}

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={submitStatus.loading}
                  className="rounded-full bg-blue-500 px-5 py-2 text-sm font-medium text-white shadow transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-blue-300"
                >
                  {submitStatus.loading ? "提交中..." : "保存模型"}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-500 transition hover:border-blue-300 hover:text-blue-500"
                >
                  重置
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}


