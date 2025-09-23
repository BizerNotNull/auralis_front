/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

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
  headers.set("Accept", "application/json");
  const token = pickStoredToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

const emptyForm = {
  name: "",
  persona_desc: "",
  opening_line: "",
  first_turn_hint: "",
  model_provider: "",
  model_name: "",
  temperature: "",
  max_tokens: "",
  system_prompt: "",
  status: "active",
  avatar_url: "",
};

export default function AdminAgentsPage() {
  const [profile, setProfile] = useState(null);
  const [profileStatus, setProfileStatus] = useState({ loading: false, error: null });
  const [agents, setAgents] = useState([]);
  const [agentsStatus, setAgentsStatus] = useState({ loading: false, error: null });
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [agentDetail, setAgentDetail] = useState(null);
  const [agentDetailStatus, setAgentDetailStatus] = useState({ loading: false, error: null });
  const [formValues, setFormValues] = useState(emptyForm);
  const [avatarFile, setAvatarFile] = useState(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [submitStatus, setSubmitStatus] = useState({ loading: false, error: null, success: null });

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

  const loadProfile = useCallback(async () => {
    setProfileStatus({ loading: true, error: null });
    try {
      const response = await fetch(`${API_BASE_URL}/auth/profile`, {
        method: "GET",
        headers: deriveHeaders(),
        credentials: "include",
        cache: "no-store",
      });
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
        error: error?.message ?? "Unable to load profile",
      });
    }
  }, []);

  const loadAgents = useCallback(async () => {
    setAgentsStatus({ loading: true, error: null });
    try {
      const response = await fetch(`${API_BASE_URL}/agents`, {
        method: "GET",
        headers: deriveHeaders(),
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`list agents failed with ${response.status}`);
      }
      const data = await response.json();
      const list = Array.isArray(data?.agents) ? data.agents : [];
      setAgents(list);
      setAgentsStatus({ loading: false, error: null });
      if (list.length) {
        const firstId = list[0]?.id ?? list[0]?.ID ?? null;
        setSelectedAgentId((prev) => prev ?? firstId);
      }
    } catch (error) {
      console.error(error);
      setAgents([]);
      setAgentsStatus({
        loading: false,
        error: error?.message ?? "Failed to load agents",
      });
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const roles = useMemo(() => {
    if (!profile?.roles) {
      return [];
    }
    if (Array.isArray(profile.roles)) {
      return profile.roles.map((role) => String(role).toLowerCase());
    }
    if (typeof profile.roles === "string") {
      return profile.roles
        .split(",")
        .map((role) => role.trim().toLowerCase())
        .filter(Boolean);
    }
    return [];
  }, [profile?.roles]);

  const isAdmin = roles.includes("admin");

  useEffect(() => {
    if (isAdmin) {
      loadAgents();
    }
  }, [isAdmin, loadAgents]);

  useEffect(() => {
    if (!selectedAgentId || !isAdmin) {
      return;
    }
    let cancelled = false;
    setAgentDetailStatus({ loading: true, error: null });

    const fetchDetail = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/agents/${selectedAgentId}`, {
          method: "GET",
          headers: deriveHeaders(),
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`load agent detail failed with ${response.status}`);
        }
        const data = await response.json();
        if (!cancelled) {
          setAgentDetail(data);
          setAgentDetailStatus({ loading: false, error: null });
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setAgentDetail(null);
          setAgentDetailStatus({
            loading: false,
            error: error?.message ?? "Failed to load agent detail",
          });
        }
      }
    };

    fetchDetail();

    return () => {
      cancelled = true;
    };
  }, [selectedAgentId, isAdmin]);

  const applyAgentDetail = useCallback((detailData) => {
    if (!detailData?.agent) {
      return;
    }
    const detail = detailData.agent;
    const config = detailData.chat_config ?? detailData.chatConfig ?? {};

    let temperature = "";
    let maxTokens = "";
    const paramsRaw = config.model_params ?? config.modelParams;
    if (paramsRaw) {
      try {
        const parsed = typeof paramsRaw === "string" ? JSON.parse(paramsRaw) : paramsRaw;
        if (parsed && typeof parsed === "object") {
          if (parsed.temperature !== undefined) {
            temperature = String(parsed.temperature);
          }
          if (parsed.max_tokens !== undefined) {
            maxTokens = String(parsed.max_tokens);
          }
        }
      } catch (error) {
        console.warn("Failed to parse model params", error);
      }
    }

    setFormValues({
      name: detail?.name ?? "",
      persona_desc: detail?.persona_desc ?? "",
      opening_line: detail?.opening_line ?? "",
      first_turn_hint: detail?.first_turn_hint ?? "",
      model_provider: config?.model_provider ?? "",
      model_name: config?.model_name ?? "",
      temperature,
      max_tokens: maxTokens,
      system_prompt: config?.system_prompt ?? "",
      status: detail?.status ?? "active",
      avatar_url: detail?.avatar_url ?? detail?.avatarUrl ?? "",
    });
    setAvatarFile(null);
    setRemoveAvatar(false);
  }, []);

  useEffect(() => {
    if (agentDetail?.agent) {
      applyAgentDetail(agentDetail);
    }
  }, [agentDetail, applyAgentDetail]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleStatusChange = (event) => {
    setFormValues((prev) => ({ ...prev, status: event.target.value }));
  };

  const handleAvatarChange = (event) => {
    const file = event.target?.files?.[0];
    if (file) {
      setAvatarFile(file);
      setRemoveAvatar(false);
    } else {
      setAvatarFile(null);
    }
  };

  const toggleRemoveAvatar = () => {
    setAvatarFile(null);
    setRemoveAvatar((prev) => !prev);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!selectedAgentId) {
      return;
    }

    setSubmitStatus({ loading: true, error: null, success: null });
    try {
      const formData = new FormData();
      formData.append("name", formValues.name.trim());
      formData.append("persona_desc", (formValues.persona_desc ?? "").trim());
      formData.append("opening_line", (formValues.opening_line ?? "").trim());
      formData.append("first_turn_hint", (formValues.first_turn_hint ?? "").trim());
      formData.append(
        "model_provider",
        formValues.model_provider.trim() || formValues.model_provider || "openai",
      );
      formData.append(
        "model_name",
        formValues.model_name.trim() || formValues.model_name || "gpt-oss-120b",
      );
      formData.append("system_prompt", formValues.system_prompt ?? "");
      formData.append("status", formValues.status.trim() || "active");

      const temperatureValue = (formValues.temperature ?? "").trim();
      if (temperatureValue !== "") {
        const temperatureNumber = Number(temperatureValue);
        if (!Number.isNaN(temperatureNumber)) {
          formData.append("temperature", String(temperatureNumber));
        }
      }

      const maxTokensValue = (formValues.max_tokens ?? "").trim();
      if (maxTokensValue !== "") {
        const maxTokensNumber = Number(maxTokensValue);
        if (!Number.isNaN(maxTokensNumber)) {
          formData.append("max_tokens", String(maxTokensNumber));
        }
      }

      if (avatarFile) {
        formData.append("avatar", avatarFile);
      }
      if (removeAvatar) {
        formData.append("remove_avatar", "true");
      }

      const response = await fetch(`${API_BASE_URL}/agents/${selectedAgentId}`, {
        method: "PUT",
        headers: deriveHeaders(),
        credentials: "include",
        body: formData,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Failed with status ${response.status}`);
      }

      const data = await response.json();
      const updatedAgent = data?.agent;
      setSubmitStatus({ loading: false, error: null, success: "Changes saved" });
      setAvatarFile(null);
      setRemoveAvatar(false);

      if (updatedAgent) {
        setAgents((prev) =>
          prev.map((item) => {
            const itemId = item?.id ?? item?.ID;
            return itemId === updatedAgent.id ? updatedAgent : item;
          }),
        );
        applyAgentDetail({
          agent: updatedAgent,
          chat_config: data?.chat_config ?? null,
        });
      } else {
        loadAgents();
      }
    } catch (error) {
      console.error(error);
      setSubmitStatus({
        loading: false,
        error: error?.message ?? "Failed to save changes",
        success: null,
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 py-10">
      <div className="mx-auto w-full max-w-7xl px-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Agent Administration</h1>
            <p className="mt-1 text-sm text-slate-500">
              Manage agent metadata, avatars, and model configuration. Admin access is required.
            </p>
          </div>
          <Link
            href="/smart/create"
            className="rounded-full bg-blue-500 px-5 py-2 text-sm font-medium text-white shadow transition hover:bg-blue-600"
          >
            Create Agent
          </Link>
        </div>

        {profileStatus.loading ? (
          <p className="mt-8 text-sm text-slate-500">Loading profile...</p>
        ) : null}

        {profileStatus.error ? (
          <p className="mt-8 text-sm text-red-500">{profileStatus.error}</p>
        ) : null}

        {!profileStatus.loading && !isAdmin ? (
          <div className="mt-10 rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-700">
            Your account does not have administrator privileges. Please contact an administrator if you need access.
          </div>
        ) : null}

        {isAdmin ? (
          <div className="mt-10 grid gap-6 lg:grid-cols-[320px,1fr]">
            <aside className="flex h-fit flex-col gap-4 rounded-3xl border border-white/60 bg-white/90 p-5 shadow-xl backdrop-blur">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700">Agents</h2>
                <button
                  type="button"
                  onClick={loadAgents}
                  className="text-xs text-slate-400 transition hover:text-blue-500"
                  disabled={agentsStatus.loading}
                >
                  {agentsStatus.loading ? "Refreshing..." : "Refresh"}
                </button>
              </div>
              {agentsStatus.error ? (
                <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-500">
                  {agentsStatus.error}
                </p>
              ) : null}
              <ul className="space-y-2">
                {agents.map((agent) => {
                  const agentId = agent?.id ?? agent?.ID;
                  const avatarUrl = agent?.avatar_url ?? agent?.avatarUrl ?? "";
                  const isActive = agentId === selectedAgentId;
                  const name = agent?.name ?? `Agent ${agentId ?? ""}`;
                  const initial = name.trim()?.charAt(0)?.toUpperCase() ?? "A";
                  return (
                    <li key={agentId ?? Math.random()}>
                      <button
                        type="button"
                        onClick={() => setSelectedAgentId(agentId)}
                        className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left text-sm transition ${
                          isActive
                            ? "border-blue-300 bg-blue-50 text-blue-600"
                            : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-500"
                        }`}
                      >
                        {avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt={`${name} avatar`}
                            className="h-9 w-9 rounded-full object-cover shadow"
                          />
                        ) : (
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                            {initial}
                          </div>
                        )}
                        <div className="flex flex-col">
                          <span className="font-medium">{name}</span>
                          <span className="text-xs text-slate-400">Status: {agent?.status ?? "active"}</span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </aside>

            <section className="rounded-3xl border border-white/60 bg-white/90 p-6 shadow-xl backdrop-blur">
              {agentDetailStatus.loading ? (
                <p className="text-sm text-slate-500">Loading agent detail...</p>
              ) : null}

              {agentDetailStatus.error ? (
                <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-500">
                  {agentDetailStatus.error}
                </p>
              ) : null}

              {!agentDetailStatus.loading && agentDetail?.agent ? (
                <form className="space-y-6" onSubmit={handleSubmit}>
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">
                        Edit: {agentDetail.agent.name ?? `Agent ${selectedAgentId ?? ""}`}
                      </h2>
                      <p className="mt-1 text-xs text-slate-400">
                        Update metadata and model configuration, then save to apply the changes.
                      </p>
                    </div>
                    <Link
                      href={`/smart/${selectedAgentId ?? ""}`}
                      className="text-xs text-blue-500 hover:text-blue-600"
                    >
                      Open chat
                    </Link>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="flex flex-col gap-2">
                      <span className="text-sm font-medium text-slate-600">Display name *</span>
                      <input
                        name="name"
                        value={formValues.name}
                        onChange={handleInputChange}
                        required
                        maxLength={100}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      />
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className="text-sm font-medium text-slate-600">Status</span>
                      <select
                        name="status"
                        value={formValues.status}
                        onChange={handleStatusChange}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="active">Active</option>
                        <option value="draft">Draft</option>
                        <option value="paused">Paused</option>
                        <option value="archived">Archived</option>
                      </select>
                    </label>
                  </div>

                  <div className="grid gap-4 md:grid-cols-[200px,1fr]">
                    <div className="flex flex-col gap-2">
                      <span className="text-sm font-medium text-slate-600">Avatar</span>
                      {avatarPreviewUrl ? (
                        <img
                          src={avatarPreviewUrl}
                          alt="Avatar preview"
                          className="h-28 w-28 rounded-full object-cover shadow"
                        />
                      ) : formValues.avatar_url ? (
                        <img
                          src={formValues.avatar_url}
                          alt="Current avatar"
                          className="h-28 w-28 rounded-full object-cover shadow"
                        />
                      ) : (
                        <div className="flex h-28 w-28 items-center justify-center rounded-full border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-400">
                          No avatar
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarChange}
                        className="mt-2 rounded-2xl border border-dashed border-slate-300 bg-white px-3 py-2 text-xs text-slate-500"
                      />
                      {formValues.avatar_url ? (
                        <button
                          type="button"
                          onClick={toggleRemoveAvatar}
                          className="w-fit rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 transition hover:border-red-300 hover:text-red-500"
                        >
                          {removeAvatar ? "Keep existing avatar" : "Remove existing avatar"}
                        </button>
                      ) : null}
                      {avatarFile ? (
                        <button
                          type="button"
                          onClick={() => setAvatarFile(null)}
                          className="w-fit rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 transition hover:border-red-300 hover:text-red-500"
                        >
                          Cancel new upload
                        </button>
                      ) : null}
                    </div>

                    <div className="grid gap-4">
                      <label className="flex flex-col gap-2">
                        <span className="text-sm font-medium text-slate-600">Opening line</span>
                        <input
                          name="opening_line"
                          value={formValues.opening_line}
                          onChange={handleInputChange}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        />
                      </label>
                      <label className="flex flex-col gap-2">
                        <span className="text-sm font-medium text-slate-600">First turn hint</span>
                        <input
                          name="first_turn_hint"
                          value={formValues.first_turn_hint}
                          onChange={handleInputChange}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        />
                      </label>
                      <label className="flex flex-col gap-2">
                        <span className="text-sm font-medium text-slate-600">Persona</span>
                        <textarea
                          name="persona_desc"
                          value={formValues.persona_desc}
                          onChange={handleInputChange}
                          rows={4}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="flex flex-col gap-2">
                      <span className="text-sm font-medium text-slate-600">Model provider *</span>
                      <input
                        name="model_provider"
                        value={formValues.model_provider}
                        onChange={handleInputChange}
                        required
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      />
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className="text-sm font-medium text-slate-600">Model name *</span>
                      <input
                        name="model_name"
                        value={formValues.model_name}
                        onChange={handleInputChange}
                        required
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      />
                    </label>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="flex flex-col gap-2">
                      <span className="text-sm font-medium text-slate-600">Temperature</span>
                      <input
                        name="temperature"
                        value={formValues.temperature}
                        onChange={handleInputChange}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        placeholder="Leave blank to keep current value"
                      />
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className="text-sm font-medium text-slate-600">Max tokens</span>
                      <input
                        name="max_tokens"
                        value={formValues.max_tokens}
                        onChange={handleInputChange}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        placeholder="Leave blank to keep current value"
                      />
                    </label>
                  </div>

                  <label className="flex flex-col gap-2">
                    <span className="text-sm font-medium text-slate-600">System prompt</span>
                    <textarea
                      name="system_prompt"
                      value={formValues.system_prompt}
                      onChange={handleInputChange}
                      rows={6}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      placeholder="Optional system prompt"
                    />
                  </label>

                  {submitStatus.error ? (
                    <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-500">
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
                      {submitStatus.loading ? "Saving..." : "Save changes"}
                    </button>
                    <button
                      type="button"
                      onClick={() => applyAgentDetail(agentDetail)}
                      className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-500 transition hover:border-blue-300 hover:text-blue-500"
                    >
                      Reset form
                    </button>
                  </div>
                </form>
              ) : null}

              {!agentDetailStatus.loading && !agentDetail?.agent ? (
                <p className="text-sm text-slate-500">Select an agent from the list to begin editing.</p>
              ) : null}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
