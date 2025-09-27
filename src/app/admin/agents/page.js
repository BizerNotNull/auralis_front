/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getApiBaseUrl } from "@/lib/api";
import { resolveAssetUrl } from "@/lib/media";
import {
  FALLBACK_CHAT_MODELS,
  findChatModel,
  normalizeChatModels,
  sortChatModels,
} from "@/lib/chatModels";

const API_BASE_URL = getApiBaseUrl();
const VOICE_PREVIEW_SAMPLE = "你好，欢迎来到Auralis";
const PREFERRED_VOICE_PROVIDER_ID = "aliyun-cosyvoice";


function findDefaultVoiceForProvider(providerId, voiceProviders, voiceOptions) {
  const normalized = String(providerId ?? "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }

  let preferredVoiceId = "";
  if (Array.isArray(voiceProviders)) {
    const providerEntry = voiceProviders.find((item) => {
      const idValue = String(item?.id ?? item?.ID ?? "").trim();
      return idValue && idValue.toLowerCase() === normalized;
    });
    preferredVoiceId = providerEntry
      ? String(providerEntry?.default_voice ?? providerEntry?.defaultVoice ?? "").trim()
      : "";
  }

  if (preferredVoiceId && Array.isArray(voiceOptions)) {
    const exists = voiceOptions.some(
      (option) =>
        String(option?.id ?? "")
          .trim()
          .toLowerCase() === preferredVoiceId.toLowerCase(),
    );
    if (exists) {
      return preferredVoiceId;
    }
  }

  if (Array.isArray(voiceOptions)) {
    const match = voiceOptions.find((option) => {
      const providerValue = String(
        option?.provider ?? option?.Provider ?? "",
      )
        .trim()
        .toLowerCase();
      return providerValue === normalized;
    });
    if (match && match.id != null) {
      return String(match.id).trim();
    }
  }

  return "";
}


const STATUS_FILTER_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "rejected", label: "Rejected" },
  { value: "paused", label: "Paused" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" },
];

const SORT_OPTIONS = [
  { value: "hot", label: "Hot" },
  { value: "views", label: "Views" },
  { value: "rating", label: "Rating" },
  { value: "latest", label: "Latest" },
];

const ADMIN_STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "rejected", label: "Rejected" },
  { value: "paused", label: "Paused" },
  { value: "archived", label: "Archived" },
  { value: "draft", label: "Draft" },
];

function formatStatusLabel(status) {
  if (!status) {
    return "Unknown";
  }
  const lower = String(status).toLowerCase();
  if (!lower) {
    return "Unknown";
  }
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function statusBadgeClasses(status) {
  switch (String(status).toLowerCase()) {
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

function deriveHeaders(extra, options = {}) {
  const headers = new Headers(extra);
  headers.set("Accept", "application/json");
  if (options.contentType) {
    headers.set("Content-Type", options.contentType);
  }
  const token = pickStoredToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

const emptyForm = {
  name: "",
  one_sentence_intro: "",
  persona_desc: "",
  opening_line: "",
  first_turn_hint: "",
  model_provider: "",
  model_name: "",
  temperature: "",
  max_tokens: "",
  system_prompt: "",
  status: "active",
  voice_id: "",
  voice_provider: "",
  avatar_url: "",
};

export default function AdminAgentsPage() {
  const [profile, setProfile] = useState(null);
  const [profileStatus, setProfileStatus] = useState({
    loading: false,
    error: null,
  });
  const [agents, setAgents] = useState([]);
  const [agentsStatus, setAgentsStatus] = useState({
    loading: false,
    error: null,
  });
  const [statusFilter, setStatusFilter] = useState("pending");
  const [sortOrder, setSortOrder] = useState("hot");
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [agentDetail, setAgentDetail] = useState(null);
  const [agentDetailStatus, setAgentDetailStatus] = useState({
    loading: false,
    error: null,
  });
  const [formValues, setFormValues] = useState(emptyForm);
  const [avatarFile, setAvatarFile] = useState(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [submitStatus, setSubmitStatus] = useState({
    loading: false,
    error: null,
    success: null,
  });

  const [chatModels, setChatModels] = useState(FALLBACK_CHAT_MODELS);
  const [chatModelStatus, setChatModelStatus] = useState({
    loading: false,
    error: null,
  });

  const voicePreviewAudioRef = useRef(null);
  const [voiceStatus, setVoiceStatus] = useState({
    loading: false,
    error: null,
    enabled: false,
    defaultVoice: "",
  });
  const [voiceOptions, setVoiceOptions] = useState([]);
  const [voiceProviders, setVoiceProviders] = useState([]);
  const [selectedVoiceProvider, setSelectedVoiceProvider] = useState("");
  const [voicePreviewStatus, setVoicePreviewStatus] = useState({
    loading: false,
    voiceId: "",
    error: null,
  });
  const [voiceSearchTerm, setVoiceSearchTerm] = useState("");
  const initialVoiceProviderRef = useRef("");

  const stopVoicePreview = useCallback(() => {
    const audio = voicePreviewAudioRef.current;
    if (audio) {
      try {
        audio.pause();
      } catch (previewError) {
        console.warn("voice preview pause failed", previewError);
      }
      try {
        audio.currentTime = 0;
      } catch (timeError) {
        // ignore reset timing errors
      }
      audio.onended = null;
      audio.onerror = null;
    }
    voicePreviewAudioRef.current = null;
    setVoicePreviewStatus({ loading: false, voiceId: "", error: null });
  }, []);

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
      setProfile(data?.user ?? null);
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
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      if (sortOrder) {
        params.set("sort", sortOrder);
      }
      const query = params.toString() ? `?${params.toString()}` : "";
      const response = await fetch(`${API_BASE_URL}/admin/agents${query}`, {
        method: "GET",
        headers: deriveHeaders(),
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`list admin agents failed with ${response.status}`);
      }
      const data = await response.json();
      const list = Array.isArray(data?.agents) ? data.agents : [];
      setAgents(list);
      setAgentsStatus({ loading: false, error: null });
      if (list.length) {
        const firstIdRaw = list[0]?.id ?? list[0]?.ID ?? null;
        const firstId = firstIdRaw != null ? String(firstIdRaw) : null;
        setSelectedAgentId((prev) => {
          if (!prev) {
            return firstId;
          }
          const normalizedPrev = String(prev);
          const exists = list.some((agent) => {
            const candidate = agent?.id ?? agent?.ID ?? null;
            return candidate != null && String(candidate) === normalizedPrev;
          });
          return exists ? normalizedPrev : firstId;
        });
      } else {
        setSelectedAgentId(null);
        setAgentDetail(null);
      }
    } catch (error) {
      console.error(error);
      setAgents([]);
      setAgentsStatus({
        loading: false,
        error: error?.message ?? "Failed to load agents",
      });
    }
  }, [statusFilter, sortOrder]);

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
    if (!isAdmin) {
      return;
    }

    let cancelled = false;
    setChatModelStatus({ loading: true, error: null });

    (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/llm/models`, {
          method: "GET",
          headers: deriveHeaders(),
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`AI 模型列表请求失败：${response.status}`);
        }
        const data = await response.json();
        if (cancelled) {
          return;
        }
        const list = normalizeChatModels(data?.models);
        setChatModels(list.length ? list : FALLBACK_CHAT_MODELS);
        setChatModelStatus({ loading: false, error: null });
      } catch (error) {
        if (cancelled) {
          return;
        }
        console.error(error);
        setChatModels(FALLBACK_CHAT_MODELS);
        setChatModelStatus({
          loading: false,
          error: error?.message ?? "加载 AI 模型列表失败",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  useEffect(() => {
    let cancelled = false;

    setVoiceStatus((prev) => ({ ...prev, loading: true, error: null }));

    (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/tts/voices`, {
          method: "GET",
          headers: deriveHeaders(),
          credentials: "include",
        });

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          throw new Error(`音色列表加载失败 (${response.status})`);
        }

        const data = await response.json();
        const voices = Array.isArray(data?.voices) ? data.voices : [];
        const providers = Array.isArray(data?.providers) ? data.providers : [];

        setVoiceOptions(voices);
        setVoiceProviders(providers);

        const defaultProviderFromAPI = String(data?.default_provider ?? "").trim();
        const normalizedProviders = providers
          .map((item) => ({
            id: String(item?.id ?? "").trim(),
            enabled: Boolean(item?.enabled),
            defaultVoice: String(
              item?.default_voice ?? item?.defaultVoice ?? "",
            ).trim(),
          }))
          .filter((item) => item.id);

        const providerIdLookup = new Map();
        normalizedProviders.forEach((item) => {
          const key = item.id.toLowerCase();
          if (!providerIdLookup.has(key)) {
            providerIdLookup.set(key, item.id);
          }
        });
        voices.forEach((voice) => {
          const providerId = String(
            voice?.provider ?? voice?.Provider ?? "",
          ).trim();
          if (!providerId) {
            return;
          }
          const key = providerId.toLowerCase();
          if (!providerIdLookup.has(key)) {
            providerIdLookup.set(key, providerId);
          }
        });
        const resolveProviderCandidate = (candidate) => {
          const normalized = String(candidate ?? "")
            .trim()
            .toLowerCase();
          if (!normalized) {
            return "";
          }
          return providerIdLookup.get(normalized) ?? "";
        };

        const determineDefaultProvider = () => {
          const existing = resolveProviderCandidate(
            initialVoiceProviderRef.current,
          );
          if (existing) {
            return existing;
          }
          const preferredByConfig = resolveProviderCandidate(
            PREFERRED_VOICE_PROVIDER_ID,
          );
          if (preferredByConfig) {
            return preferredByConfig;
          }
          const apiDefault = resolveProviderCandidate(defaultProviderFromAPI);
          if (apiDefault) {
            return apiDefault;
          }
          const active = normalizedProviders.find((item) =>
            resolveProviderCandidate(item.id),
          );
          if (active) {
            return resolveProviderCandidate(active.id);
          }
          for (const item of normalizedProviders) {
            const resolved = resolveProviderCandidate(item.id);
            if (resolved) {
              return resolved;
            }
          }
          for (const voice of voices) {
            const resolved = resolveProviderCandidate(
              voice?.provider ?? voice?.Provider ?? "",
            );
            if (resolved) {
              return resolved;
            }
          }
          return "";
        };

        const preferredProvider = determineDefaultProvider();
        const defaultVoiceForProvider = findDefaultVoiceForProvider(
          preferredProvider,
          providers,
          voices,
        );

        setVoiceStatus({
          loading: false,
          error: null,
          enabled: voices.length > 0 && Boolean(data?.enabled),
          defaultVoice: defaultVoiceForProvider,
        });

        setSelectedVoiceProvider(preferredProvider);
        setFormValues((prev) => {
          const updates = {};
          let changed = false;
          if (!String(prev.voice_provider ?? "").trim() && preferredProvider) {
            updates.voice_provider = preferredProvider;
            changed = true;
          }
          if (!String(prev.voice_id ?? "").trim() && defaultVoiceForProvider) {
            updates.voice_id = String(defaultVoiceForProvider);
            changed = true;
          }
          return changed ? { ...prev, ...updates } : prev;
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        console.error(error);
        setVoiceOptions([]);
        setVoiceProviders([]);
        setVoiceStatus({
          loading: false,
          error: error?.message ?? "音色列表加载失败",
          enabled: false,
          defaultVoice: "",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setFormValues]);

  const chatModelOptions = useMemo(
    () => sortChatModels(chatModels),
    [chatModels],
  );

  useEffect(() => {
    if (!chatModelOptions.length) {
      return;
    }

    const provider = (formValues.model_provider ?? "").trim();
    const modelName = (formValues.model_name ?? "").trim();
    if (provider && modelName) {
      return;
    }

    const fallback = chatModelOptions[0];
    if (!fallback) {
      return;
    }

    setFormValues((prev) => ({
      ...prev,
      model_provider: fallback.provider,
      model_name: fallback.name,
    }));
  }, [
    chatModelOptions,
    formValues.model_name,
    formValues.model_provider,
    setFormValues,
  ]);

  const selectedChatModel = useMemo(
    () =>
      findChatModel(
        chatModelOptions,
        formValues.model_provider,
        formValues.model_name,
      ),
    [chatModelOptions, formValues.model_provider, formValues.model_name],
  );

  const chatModelSelectValue = selectedChatModel?.key ?? "";
  const chatModelDescription = selectedChatModel?.description ?? "";
  const chatModelCapabilities = selectedChatModel?.capabilities ?? [];

  const selectedVoiceOption = useMemo(() => {
    if (!formValues.voice_id) {
      return null;
    }
    const target = String(formValues.voice_id).toLowerCase();
    return (
      voiceOptions.find(
        (item) => String(item?.id ?? "").toLowerCase() === target,
      ) ?? null
    );
  }, [formValues.voice_id, voiceOptions]);

  const availableVoiceProviders = useMemo(() => {
    const reorderProviders = (list) => {
      if (!Array.isArray(list) || list.length === 0) {
        return [];
      }
      const normalizedPreferred = PREFERRED_VOICE_PROVIDER_ID.toLowerCase();
      const preferred = [];
      const others = [];
      list.forEach((item) => {
        const normalizedId = String(item?.id ?? "")
          .trim()
          .toLowerCase();
        if (normalizedId && normalizedId === normalizedPreferred) {
          preferred.push(item);
        } else {
          others.push(item);
        }
      });
      return [...preferred, ...others];
    };

    if (voiceProviders.length > 0) {
      const normalizedList = voiceProviders
        .map((item) => {
          const id = String(item?.id ?? "").trim();
          if (!id) {
            return null;
          }
          const label = String(item?.label ?? item?.id ?? id).trim() || id;
          return {
            id,
            label,
            enabled: Boolean(item?.enabled),
          };
        })
        .filter(Boolean);
      return reorderProviders(normalizedList);
    }

    const uniqueProviders = new Map();
    voiceOptions.forEach((option) => {
      const providerId = String(option?.provider ?? option?.Provider ?? "").trim();
      if (!providerId || uniqueProviders.has(providerId)) {
        return;
      }
      uniqueProviders.set(providerId, {
        id: providerId,
        label: providerId,
        enabled: true,
      });
    });
    return reorderProviders(Array.from(uniqueProviders.values()));
  }, [voiceOptions, voiceProviders]);

  const voiceSearchToken = useMemo(
    () => voiceSearchTerm.trim().toLowerCase(),
    [voiceSearchTerm],
  );

  const filteredVoiceOptions = useMemo(() => {
    if (!voiceOptions.length) {
      return [];
    }

    const normalizedProvider = String(selectedVoiceProvider ?? "")
      .trim()
      .toLowerCase();
    const baseList = voiceOptions.filter((option) => {
      if (!normalizedProvider) {
        return true;
      }
      const optionProvider = String(
        option?.provider ?? option?.Provider ?? "",
      )
        .trim()
        .toLowerCase();
      return optionProvider === normalizedProvider;
    });

    if (!voiceSearchToken) {
      return baseList;
    }

    return baseList.filter((option) => {
      const parts = [
        option?.display_name,
        option?.displayName,
        option?.name,
        option?.nickname,
        option?.language,
        option?.provider,
      ]
        .filter((value) => typeof value === "string")
        .map((value) => value.toLowerCase());
      return parts.some((part) => part.includes(voiceSearchToken));
    });
  }, [voiceOptions, selectedVoiceProvider, voiceSearchToken]);

  useEffect(() => {
    const providerValue = String(formValues.voice_provider ?? "").trim();
    if (!providerValue) {
      return;
    }
    setSelectedVoiceProvider((prev) =>
      prev === providerValue ? prev : providerValue,
    );
  }, [formValues.voice_provider]);

  useEffect(() => {
    if (!selectedVoiceProvider) {
      return;
    }
    const currentVoice = String(formValues.voice_id ?? "")
      .trim()
      .toLowerCase();
    const exists = filteredVoiceOptions.some(
      (option) =>
        String(option?.id ?? "")
          .trim()
          .toLowerCase() === currentVoice,
    );
    if (exists) {
      return;
    }
    const fallbackVoice =
      filteredVoiceOptions.length > 0
        ? String(filteredVoiceOptions[0]?.id ?? "")
        : "";
    if (!fallbackVoice && !currentVoice) {
      return;
    }
    setFormValues((prev) => {
      if (fallbackVoice) {
        return { ...prev, voice_id: fallbackVoice };
      }
      if (!prev.voice_id) {
        return prev;
      }
      return { ...prev, voice_id: "" };
    });
  }, [
    filteredVoiceOptions,
    selectedVoiceProvider,
    formValues.voice_id,
    setFormValues,
  ]);

  useEffect(() => {
    return () => {
      stopVoicePreview();
    };
  }, [stopVoicePreview]);

  useEffect(() => {
    if (!selectedAgentId || !isAdmin) {
      return;
    }
    let cancelled = false;
    setAgentDetailStatus({ loading: true, error: null });

    const fetchDetail = async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/agents/${selectedAgentId}`,
          {
            method: "GET",
            headers: deriveHeaders(),
            credentials: "include",
            cache: "no-store",
          },
        );
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

  const applyAgentDetail = useCallback(
    (detailData) => {
      if (!detailData?.agent) {
        return;
      }

      stopVoicePreview();

      const detail = detailData.agent;
      const config = detailData.chat_config ?? detailData.chatConfig ?? {};

      let temperature = "";
      let maxTokens = "";
      const paramsRaw = config.model_params ?? config.modelParams;
      if (paramsRaw) {
        try {
          const parsed =
            typeof paramsRaw === "string" ? JSON.parse(paramsRaw) : paramsRaw;
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

      const voiceProviderValue = String(
        detail?.voice_provider ?? detail?.voiceProvider ?? "",
      ).trim();
      const voiceIdValue = String(
        detail?.voice_id ?? detail?.voiceId ?? "",
      ).trim();

      initialVoiceProviderRef.current = voiceProviderValue;
      if (voiceProviderValue) {
        setSelectedVoiceProvider((prev) =>
          prev === voiceProviderValue ? prev : voiceProviderValue,
        );
      }
      setVoiceSearchTerm("");

      setFormValues({
        name: detail?.name ?? "",
        one_sentence_intro:
          detail?.one_sentence_intro ?? detail?.oneSentenceIntro ?? "",
        persona_desc: detail?.persona_desc ?? "",
        opening_line: detail?.opening_line ?? "",
        first_turn_hint: detail?.first_turn_hint ?? "",
        model_provider: config?.model_provider ?? "",
        model_name: config?.model_name ?? "",
        temperature,
        max_tokens: maxTokens,
        system_prompt: config?.system_prompt ?? "",
        status: detail?.status ?? "pending",
        voice_id: voiceIdValue,
        voice_provider: voiceProviderValue,
        avatar_url: detail?.avatar_url ?? detail?.avatarUrl ?? "",
      });
      setAvatarFile(null);
      setRemoveAvatar(false);
    },
    [
      setFormValues,
      setAvatarFile,
      setRemoveAvatar,
      stopVoicePreview,
      setSelectedVoiceProvider,
      setVoiceSearchTerm,
    ],
  );

  useEffect(() => {
    if (agentDetail?.agent) {
      applyAgentDetail(agentDetail);
    }
  }, [agentDetail, applyAgentDetail]);

  const handleChatModelPresetChange = useCallback(
    (event) => {
      const key = event.target.value;
      if (!key) {
        return;
      }
      const [providerRaw, nameRaw] = key.split(":::", 2);
      const provider = (providerRaw ?? "").trim();
      const modelName = (nameRaw ?? "").trim();
      if (!provider || !modelName) {
        return;
      }
      setFormValues((prev) => ({
        ...prev,
        model_provider: provider,
        model_name: modelName,
      }));
    },
    [setFormValues],
  );

  const handleVoiceProviderChange = useCallback(
    (event) => {
      const rawValue = event?.target?.value ?? "";
      const nextProvider = String(rawValue).trim();

      stopVoicePreview();
      setSelectedVoiceProvider(nextProvider);
      setVoiceSearchTerm("");

      setFormValues((prev) => {
        const nextState = { ...prev, voice_provider: nextProvider };
        const normalizedProvider = nextProvider.toLowerCase();
        const currentVoice = String(prev.voice_id ?? "").trim();
        let keepCurrent = false;
        if (currentVoice && normalizedProvider) {
          const currentOption = voiceOptions.find(
            (option) =>
              String(option?.id ?? "")
                .trim()
                .toLowerCase() === currentVoice.toLowerCase(),
          );
          if (currentOption) {
            const optionProvider = String(
              currentOption?.provider ?? currentOption?.Provider ?? "",
            )
              .trim()
              .toLowerCase();
            keepCurrent = optionProvider === normalizedProvider;
          }
        }

        if (!keepCurrent) {
          const fallbackVoice = findDefaultVoiceForProvider(
            nextProvider,
            voiceProviders,
            voiceOptions,
          );
          nextState.voice_id = fallbackVoice || "";
        }

        return nextState;
      });
    },
    [
      setFormValues,
      setSelectedVoiceProvider,
      setVoiceSearchTerm,
      stopVoicePreview,
      voiceOptions,
      voiceProviders,
    ],
  );

  const handleVoicePreview = useCallback(
    async (voiceId) => {
      const target = String(voiceId ?? "").trim();
      if (!target) {
        setVoicePreviewStatus({
          loading: false,
          voiceId: "",
          error: "请先选择音色再试听",
        });
        return;
      }

      if (
        voicePreviewStatus.voiceId === target &&
        !voicePreviewStatus.loading
      ) {
        stopVoicePreview();
        return;
      }

      stopVoicePreview();
      setVoicePreviewStatus({ loading: true, voiceId: target, error: null });

      const option =
        voiceOptions.find(
          (item) =>
            String(item?.id ?? "").toLowerCase() === target.toLowerCase(),
        ) ?? null;

      const providerForPreview = String(
        selectedVoiceProvider ||
          formValues.voice_provider ||
          option?.provider ||
          option?.Provider ||
          "",
      ).trim();

      let audioSrc = option?.sample_url ?? option?.sampleUrl ?? "";

      try {
        if (!audioSrc) {
          const response = await fetch(`${API_BASE_URL}/tts/preview`, {
            method: "POST",
            headers: deriveHeaders({}, { contentType: "application/json" }),
            credentials: "include",
            body: JSON.stringify({
              text: VOICE_PREVIEW_SAMPLE,
              voice_id: target,
              provider: providerForPreview,
            }),
          });
          if (!response.ok) {
            const fallbackMessage = await response.text();
            throw new Error(fallbackMessage || `试听失败 (${response.status})`);
          }
          const data = await response.json();
          const speech = data?.speech ?? {};
          const base64 = speech?.audio_base64 ?? "";
          const mime = speech?.mime_type ?? "audio/mpeg";
          if (!base64) {
            throw new Error("音频内容缺失");
          }
          audioSrc = `data:${mime};base64,${base64}`;
        }

        const audio = new Audio(audioSrc);
        voicePreviewAudioRef.current = audio;
        audio.onended = () => {
          voicePreviewAudioRef.current = null;
          setVoicePreviewStatus({ loading: false, voiceId: "", error: null });
        };
        audio.onerror = () => {
          voicePreviewAudioRef.current = null;
          setVoicePreviewStatus({
            loading: false,
            voiceId: "",
            error: "音频播放失败",
          });
        };
        let playbackAborted = false;
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.then === "function") {
          try {
            await playPromise;
          } catch (playbackError) {
            if (playbackError?.name === "AbortError") {
              playbackAborted = true;
              console.debug("Voice preview playback interrupted");
            } else {
              throw playbackError;
            }
          }
        }
        if (playbackAborted) {
          return;
        }
        setVoicePreviewStatus({ loading: false, voiceId: target, error: null });
      } catch (error) {
        if (error?.name === "AbortError") {
          console.debug("Voice preview playback cancelled");
          return;
        }
        console.error(error);
        voicePreviewAudioRef.current = null;
        setVoicePreviewStatus({
          loading: false,
          voiceId: "",
          error: error?.message ?? "试听失败",
        });
      }
    },
    [
      voiceOptions,
      voicePreviewStatus.loading,
      voicePreviewStatus.voiceId,
      stopVoicePreview,
      selectedVoiceProvider,
      formValues.voice_provider,
    ],
  );

  const handleVoiceSelect = useCallback(
    (voiceId) => {
      const nextVoiceId = String(voiceId ?? "").trim();
      if (!nextVoiceId) {
        return;
      }

      setFormValues((prev) => {
        if (prev.voice_id === nextVoiceId) {
          return prev;
        }
        return { ...prev, voice_id: nextVoiceId };
      });
      stopVoicePreview();
    },
    [setFormValues, stopVoicePreview],
  );

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    if (name === "voice_id") {
      stopVoicePreview();
    }
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleStatusChange = (event) => {
    setFormValues((prev) => ({ ...prev, status: event.target.value }));
  };

  const handleFilterChange = (event) => {
    const value = event.target.value;
    setStatusFilter(value);
    setSelectedAgentId(null);
    setAgentDetail(null);
  };

  const handleSortOrderChange = (event) => {
    const value = event.target.value;
    setSortOrder(value);
    setSelectedAgentId(null);
    setAgentDetail(null);
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
      formData.append(
        "one_sentence_intro",
        (formValues.one_sentence_intro ?? "").trim(),
      );
      formData.append("persona_desc", (formValues.persona_desc ?? "").trim());
      formData.append("opening_line", (formValues.opening_line ?? "").trim());
      formData.append(
        "first_turn_hint",
        (formValues.first_turn_hint ?? "").trim(),
      );
      const provider = (formValues.model_provider ?? "").trim();
      const modelName = (formValues.model_name ?? "").trim();
      if (!provider || !modelName) {
        throw new Error("请先选择一个可用的 AI 模型");
      }
      formData.append("model_provider", provider);
      formData.append("model_name", modelName);
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

      const voiceIdValue = (formValues.voice_id ?? "").trim();
      if (voiceIdValue) {
        formData.append("voice_id", voiceIdValue);
        const voiceProviderValue = (formValues.voice_provider ?? "").trim();
        if (voiceProviderValue) {
          formData.append("voice_provider", voiceProviderValue);
        }
      } else if (voiceStatus.enabled && voiceOptions.length > 0) {
        throw new Error("请选择音色");
      }

      if (avatarFile) {
        formData.append("avatar", avatarFile);
      }
      if (removeAvatar) {
        formData.append("remove_avatar", "true");
      }

      const response = await fetch(
        `${API_BASE_URL}/agents/${selectedAgentId}`,
        {
          method: "PUT",
          headers: deriveHeaders(),
          credentials: "include",
          body: formData,
        },
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Failed with status ${response.status}`);
      }

      const data = await response.json();
      const updatedAgent = data?.agent;
      const statusAfterUpdate = updatedAgent?.status ?? formValues.status;
      setSubmitStatus({
        loading: false,
        error: null,
        success: `Changes saved. Status: ${formatStatusLabel(statusAfterUpdate)}`,
      });
      setAvatarFile(null);
      setRemoveAvatar(false);

      if (updatedAgent) {
        const updatedId = updatedAgent?.id ?? updatedAgent?.ID ?? null;
        if (updatedId != null) {
          setAgents((prev) =>
            prev.map((item) => {
              const itemId = item?.id ?? item?.ID ?? null;
              return itemId != null && String(itemId) === String(updatedId)
                ? updatedAgent
                : item;
            }),
          );
        }
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
            <h1 className="text-2xl font-semibold text-slate-900">
              Agent Administration
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Manage agent metadata, avatars, and model configuration. Admin
              access is required.
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
            Your account does not have administrator privileges. Please contact
            an administrator if you need access.
          </div>
        ) : null}

        {isAdmin ? (
          <div className="mt-10 grid gap-6 lg:grid-cols-[320px,1fr]">
            <aside className="flex h-fit flex-col gap-4 rounded-3xl border border-white/60 bg-white/90 p-5 shadow-xl backdrop-blur">
              <div className="flex items-center justify-between gap-3">
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
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Status filter
                </label>
                <select
                  value={statusFilter}
                  onChange={handleFilterChange}
                  disabled={agentsStatus.loading}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:text-slate-300"
                >
                  {STATUS_FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Sort by
                </label>
                <select
                  value={sortOrder}
                  onChange={handleSortOrderChange}
                  disabled={agentsStatus.loading}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:text-slate-300"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              {agentsStatus.error ? (
                <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-500">
                  {agentsStatus.error}
                </p>
              ) : null}
              <ul className="space-y-2">
                {agents.map((agent) => {
                  const rawId = agent?.id ?? agent?.ID;
                  const agentId = rawId != null ? String(rawId) : "";
                  const activeId =
                    selectedAgentId != null ? String(selectedAgentId) : "";
                  const avatarUrl = resolveAssetUrl(
                    agent?.avatar_url ?? agent?.avatarUrl ?? "",
                  );
                  const isActive = agentId !== "" && agentId === activeId;
                  const name = agent?.name ?? `Agent ${agentId || ""}`;
                  const initial = name.trim()?.charAt(0)?.toUpperCase() ?? "A";
                  const status = agent?.status ?? "";
                  const statusLabel = formatStatusLabel(status);
                  const statusClasses = statusBadgeClasses(status);
                  const viewCountRaw = Number(
                    agent?.view_count ?? agent?.viewCount ?? 0,
                  );
                  const viewCount = Number.isFinite(viewCountRaw)
                    ? Math.max(0, Math.floor(viewCountRaw))
                    : 0;
                  const viewCountLabel = viewCount.toLocaleString("en-US");
                  return (
                    <li key={agentId || Math.random()}>
                      <button
                        type="button"
                        onClick={() => setSelectedAgentId(agentId)}
                        className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-left text-sm transition ${
                          isActive
                            ? "border-blue-300 bg-blue-50 text-blue-600"
                            : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-500"
                        }`}
                      >
                        <div className="flex items-center gap-3">
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
                            <span className="text-[11px] text-slate-400">
                              ID: {agentId || "--"}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              Views {viewCountLabel}
                            </span>
                          </div>
                        </div>
                        <span
                          className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${statusClasses}`}
                        >
                          {statusLabel}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </aside>

            <section className="rounded-3xl border border-white/60 bg-white/90 p-6 shadow-xl backdrop-blur">
              {agentDetailStatus.loading ? (
                <p className="text-sm text-slate-500">
                  Loading agent detail...
                </p>
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
                        Edit:{" "}
                        {agentDetail.agent.name ??
                          `Agent ${selectedAgentId ?? ""}`}
                      </h2>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusBadgeClasses(
                            agentDetail.agent.status ?? "",
                          )}`}
                        >
                          {formatStatusLabel(agentDetail.agent.status ?? "")}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          ID:{" "}
                          {agentDetail.agent.id ?? agentDetail.agent.ID ?? "--"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        Update metadata and model configuration, then save to
                        apply the changes.
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
                      <span className="text-sm font-medium text-slate-600">
                        Display name *
                      </span>
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
                      <span className="text-sm font-medium text-slate-600">
                        Status
                      </span>
                      <select
                        name="status"
                        value={formValues.status}
                        onChange={handleStatusChange}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      >
                        {ADMIN_STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="grid gap-4 md:grid-cols-[200px,1fr]">
                    <div className="flex flex-col gap-2">
                      <span className="text-sm font-medium text-slate-600">
                        Avatar
                      </span>
                      {avatarPreviewUrl ? (
                        <img
                          src={avatarPreviewUrl}
                          alt="Avatar preview"
                          className="h-28 w-28 rounded-full object-cover shadow"
                        />
                      ) : formValues.avatar_url ? (
                        <img
                          src={resolveAssetUrl(formValues.avatar_url)}
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
                          {removeAvatar
                            ? "Keep existing avatar"
                            : "Remove existing avatar"}
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
                        <span className="text-sm font-medium text-slate-600">
                          Opening line
                        </span>
                        <input
                          name="opening_line"
                          value={formValues.opening_line}
                          onChange={handleInputChange}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        />
                      </label>
                      <label className="flex flex-col gap-2">
                        <span className="text-sm font-medium text-slate-600">
                          First turn hint
                        </span>
                        <input
                          name="first_turn_hint"
                          value={formValues.first_turn_hint}
                          onChange={handleInputChange}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        />
                      </label>
                      <label className="flex flex-col gap-2">
                        <span className="text-sm font-medium text-slate-600">
                          One sentence intro
                        </span>
                        <textarea
                          name="one_sentence_intro"
                          value={formValues.one_sentence_intro}
                          onChange={handleInputChange}
                          rows={2}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        />
                      </label>
                      <label className="flex flex-col gap-2">
                        <span className="text-sm font-medium text-slate-600">
                          Persona
                        </span>
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

                  <section className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-600">
                        选择 AI 模型
                      </span>
                      {chatModelStatus.loading ? (
                        <span className="text-xs text-slate-400">
                          加载中...
                        </span>
                      ) : chatModelStatus.error ? (
                        <span className="text-xs text-amber-500">
                          {chatModelStatus.error}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">
                          {chatModelOptions.length} 个可选
                        </span>
                      )}
                    </div>
                    <select
                      value={chatModelSelectValue}
                      onChange={handleChatModelPresetChange}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="" disabled>
                        请选择一个可用模型
                      </option>
                      {chatModelOptions.map((model) => (
                        <option key={model.key} value={model.key}>
                          {model.displayName} · {model.providerLabel}
                          {model.recommended ? "（推荐）" : ""}
                        </option>
                      ))}
                    </select>
                    {selectedChatModel ? (
                      <div className="text-xs text-slate-500">
                        {chatModelDescription ? (
                          <p>{chatModelDescription}</p>
                        ) : null}
                        {chatModelCapabilities.length ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {chatModelCapabilities.map((capability) => (
                              <span
                                key={`${selectedChatModel?.key ?? "preset"}-${capability}`}
                                className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-600"
                              >
                                {capability}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-xs text-amber-600">
                        当前配置未在列表中，保存时会沿用原模型：
                        {formValues.model_provider || "未选择"} /{" "}
                        {formValues.model_name || "未选择"}。
                      </p>
                    )}
                  </section>
                  <p className="text-xs text-slate-400">
                    当前将使用：{formValues.model_provider || "未选择"} /{" "}
                    {formValues.model_name || "未选择"}
                  </p>

                  <section className="space-y-3">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-sm font-medium text-slate-600">
                        音色选择
                      </span>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {voiceStatus.loading ? (
                          <span className="text-slate-400">音色列表加载中...</span>
                        ) : null}
                        {voiceStatus.error ? (
                          <span className="text-rose-500">{voiceStatus.error}</span>
                        ) : null}
                        {!voiceStatus.loading && !voiceStatus.error ? (
                          <span className="text-slate-400">
                            {filteredVoiceOptions.length} 个候选
                          </span>
                        ) : null}
                    <span className="text-slate-400">推荐使用cosyvoice,双流式传输延迟更低</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                        {availableVoiceProviders.length > 0 ? (
                          <label className="flex items-center gap-2 text-xs font-medium text-slate-600 sm:text-sm">
                            <span>提供商</span>
                            <select
                              value={selectedVoiceProvider}
                              onChange={handleVoiceProviderChange}
                              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                            >
                              {availableVoiceProviders.map((provider) => (
                                <option
                                  key={provider.id}
                                  value={provider.id}
                                  disabled={!provider.enabled}
                                >
                                  {provider.label}
                                  {!provider.enabled ? "（未启用）" : ""}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}

                        <label className="relative flex-1">
                          <span className="sr-only">搜索音色</span>
                          <input
                            type="text"
                            value={voiceSearchTerm}
                            onChange={(event) => setVoiceSearchTerm(event.target.value)}
                            placeholder="搜索音色或提供商"
                            className="w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                          />
                          {voiceSearchTerm ? (
                            <button
                              type="button"
                              onClick={() => setVoiceSearchTerm("")}
                              className="absolute inset-y-0 right-3 flex items-center text-xs text-slate-400 transition hover:text-slate-600"
                              aria-label="清除搜索"
                            >
                              清除
                            </button>
                          ) : null}
                        </label>
                      </div>
                    </div>

                    <div className="max-h-80 overflow-y-auto rounded-2xl border border-slate-200 bg-white/80 p-2 shadow-inner">
                      {filteredVoiceOptions.length > 0 ? (
                        <div className="grid gap-3 md:grid-cols-2">
                          {filteredVoiceOptions.map((option) => {
                            const rawId = option?.id;
                            if (rawId == null) {
                              return null;
                            }
                            const value = String(rawId);
                            const label =
                              option?.display_name ??
                              option?.displayName ??
                              option?.name ??
                              option?.nickname ??
                              value;
                            const languageLabel = option?.language ?? "未知语言";
                            const providerLabel =
                              option?.provider ?? option?.Provider ?? "未知提供商";
                            const isActive = formValues.voice_id === value;
                            const isLoadingPreview =
                              voicePreviewStatus.loading &&
                              voicePreviewStatus.voiceId !== value;
                            const isPlayingPreview =
                              !voicePreviewStatus.loading &&
                              voicePreviewStatus.voiceId === value;

                            return (
                              <label
                                key={value}
                                onClick={() => handleVoiceSelect(value)}
                                className={`group flex cursor-pointer flex-col gap-2 rounded-2xl border p-4 transition ${
                                  isActive
                                    ? "border-blue-500 bg-blue-50/70 shadow"
                                    : "border-slate-200 bg-white hover:border-blue-300"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex flex-col">
                                    <span className="text-sm font-semibold text-slate-700">
                                      {label}
                                    </span>
                                    <span className="text-xs text-slate-400">
                                      {languageLabel} · {providerLabel}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      handleVoiceSelect(value);
                                      handleVoicePreview(value);
                                    }}
                                    className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-blue-400 hover:text-blue-500 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
                                    disabled={
                                      voicePreviewStatus.loading &&
                                      voicePreviewStatus.voiceId !== value
                                    }
                                  >
                                    {isLoadingPreview
                                      ? "试听中..."
                                      : isPlayingPreview
                                        ? "停止"
                                        : "试听"}
                                  </button>
                                </div>
                                {option?.description ? (
                                  <p className="text-xs text-slate-500">
                                    {option.description}
                                  </p>
                                ) : null}
                                <input
                                  type="radio"
                                  name="voice_id"
                                  value={value}
                                  checked={formValues.voice_id === value}
                                  onChange={handleInputChange}
                                  className="sr-only"
                                />
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
                          {voiceStatus.loading
                            ? "音色列表加载中，请稍候..."
                            : voiceOptions.length === 0
                              ? "暂无可用音色，请检查语音服务配置。"
                              : "未找到匹配音色，请尝试调整筛选条件。"}
                        </div>
                      )}
                    </div>

                    {voicePreviewStatus.error ? (
                      <p className="text-xs text-rose-500">
                        {voicePreviewStatus.error}
                      </p>
                    ) : null}
                  </section>
                  <p className="text-xs text-slate-400">
                    当前音色：
                    {selectedVoiceOption
                      ? `${
                          selectedVoiceOption?.display_name ??
                          selectedVoiceOption?.displayName ??
                          selectedVoiceOption?.name ??
                          selectedVoiceOption?.nickname ??
                          selectedVoiceOption?.id ??
                          ""
                        } / ${
                          selectedVoiceOption?.provider ??
                          selectedVoiceOption?.Provider ??
                          "未知提供商"
                        }`
                      : voiceStatus.enabled
                        ? "未选择"
                        : "语音服务未开启"}
                  </p>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="flex flex-col gap-2">
                      <span className="text-sm font-medium text-slate-600">
                        Temperature
                      </span>
                      <input
                        name="temperature"
                        value={formValues.temperature}
                        onChange={handleInputChange}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        placeholder="Leave blank to keep current value"
                      />
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className="text-sm font-medium text-slate-600">
                        Max tokens
                      </span>
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
                    <span className="text-sm font-medium text-slate-600">
                      System prompt
                    </span>
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
                <p className="text-sm text-slate-500">
                  Select an agent from the list to begin editing.
                </p>
              ) : null}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}



