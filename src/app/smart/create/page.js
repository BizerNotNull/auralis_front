/* eslint-disable @next/next/no-img-element */

"use client";

import Link from "next/link";

import { useRouter, useSearchParams } from "next/navigation";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Live2DContainer from "@/components/Live2DContainer";

import { getApiBaseUrl } from "@/lib/api";
import { resolveAssetUrl } from "@/lib/media";

import {
  FALLBACK_CHAT_MODELS,
  findChatModel,
  normalizeChatModels,
  sortChatModels,
} from "@/lib/chatModels";

const API_BASE_URL = getApiBaseUrl();

const DEFAULT_LIVE2D_MODEL = {
  id: "default-yumi",

  key: "default-yumi",

  name: "默认：Yumi",

  entry_url: "/yumi/yumi.model3.json",

  preview_url: "/yumi/yumi.png",

  storage_type: "local",
};

const VOICE_PREVIEW_SAMPLE = "你好,欢迎来到Auralis";

const INITIAL_FORM_VALUES = {
  name: "",
  one_sentence_intro: "",
  persona_desc: "",
  opening_line: "",
  first_turn_hint: "",
  model_provider: "openai",
  model_name: "gpt-oss-120b",
  temperature: "0.3",
  max_tokens: "1024",
  live2d_model_id: "",
  voice_id: "",
  avatar_url: "",
  status: "",
};

function isQiniuVoice(option) {
  if (!option || typeof option !== "object") {
    return false;
  }
  const provider = String(option.provider ?? "")
    .trim()
    .toLowerCase();
  if (provider && provider.includes("qiniu")) {
    return true;
  }
  const id = String(option.id ?? "")
    .trim()
    .toLowerCase();
  return id.startsWith("qiniu");
}

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

export default function CreateAgentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editingAgentId = searchParams.get("agent");
  const isEditing = Boolean(editingAgentId);

  const [values, setValues] = useState(INITIAL_FORM_VALUES);

  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState("");

  const [success, setSuccess] = useState(null);

  const [loadingAgent, setLoadingAgent] = useState(false);

  const [loadError, setLoadError] = useState("");

  const [avatarFile, setAvatarFile] = useState(null);

  const [removeAvatar, setRemoveAvatar] = useState(false);

  const [initialAgent, setInitialAgent] = useState(null);

  const [chatModels, setChatModels] = useState(FALLBACK_CHAT_MODELS);

  const [chatModelStatus, setChatModelStatus] = useState({
    loading: false,

    error: null,
  });

  const [modelList, setModelList] = useState([]);

  const [modelListStatus, setModelListStatus] = useState({
    loading: false,

    error: null,
  });

  const live2DRef = useRef(null);
  const voicePreviewAudioRef = useRef(null);

  const [live2DStatus, setLive2DStatus] = useState("init");

  const [live2DError, setLive2DError] = useState(null);
  const [voiceStatus, setVoiceStatus] = useState({
    loading: false,
    error: null,
    enabled: false,
    defaultVoice: "",
  });
  const [voiceOptions, setVoiceOptions] = useState([]);
  const [voicePreviewStatus, setVoicePreviewStatus] = useState({
    loading: false,
    voiceId: "",
    error: null,
  });
  const [voiceSearchTerm, setVoiceSearchTerm] = useState("");

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

  useEffect(() => {
    let aborted = false;

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

        if (aborted) {
          return;
        }

        const list = normalizeChatModels(data?.models);

        setChatModels(list.length ? list : FALLBACK_CHAT_MODELS);

        setChatModelStatus({ loading: false, error: null });
      } catch (error) {
        if (aborted) {
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
      aborted = true;
    };
  }, []);

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
          throw new Error(
            `Live2D models request failed with ${response.status}`,
          );
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

        const qiniuVoices = voices.filter((item) => isQiniuVoice(item));

        setVoiceOptions(qiniuVoices);
        const defaultVoice = (() => {
          const preferred = String(data?.default_voice ?? "").trim();
          if (preferred) {
            const exists = qiniuVoices.some(
              (item) =>
                String(item?.id ?? "")
                  .trim()
                  .toLowerCase() === preferred.toLowerCase(),
            );
            if (exists) {
              return preferred;
            }
          }
          return qiniuVoices.length > 0 ? String(qiniuVoices[0]?.id ?? "") : "";
        })();
        setVoiceStatus({
          loading: false,
          error: null,
          enabled: qiniuVoices.length > 0 && Boolean(data?.enabled),
          defaultVoice,
        });

        const nextVoice = defaultVoice;
        if (nextVoice) {
          setValues((prev) => {
            if (prev.voice_id) {
              return prev;
            }
            return { ...prev, voice_id: String(nextVoice) };
          });
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        console.error(error);
        setVoiceOptions([]);
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
  }, []);

  useEffect(() => {
    return () => {
      stopVoicePreview();
    };
  }, [stopVoicePreview]);

  const populateFormFromAgent = useCallback(
    (agent, config) => {
      if (!agent) {
        return;
      }

      stopVoicePreview();

      let temperature = "";
      let maxTokens = "";
      const paramsRaw = config?.model_params ?? config?.modelParams;
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
        } catch (parseError) {
          console.warn("Failed to parse model params", parseError);
        }
      }

      setValues((prev) => ({
        ...prev,
        name: agent?.name ?? "",
        one_sentence_intro:
          agent?.one_sentence_intro ?? agent?.oneSentenceIntro ?? "",
        persona_desc: agent?.persona_desc ?? "",
        opening_line: agent?.opening_line ?? "",
        first_turn_hint: agent?.first_turn_hint ?? "",
        model_provider: config?.model_provider ?? prev.model_provider,
        model_name: config?.model_name ?? prev.model_name,
        temperature: temperature || prev.temperature,
        max_tokens: maxTokens || prev.max_tokens,
        live2d_model_id: agent?.live2d_model_id ?? "",
        voice_id: agent?.voice_id ?? agent?.voiceId ?? prev.voice_id ?? "",
        avatar_url: agent?.avatar_url ?? prev.avatar_url ?? "",
        status: agent?.status ?? prev.status ?? "",
      }));
      setInitialAgent(agent);
      setAvatarFile(null);
      setRemoveAvatar(false);
    },
    [
      setValues,
      setInitialAgent,
      setAvatarFile,
      setRemoveAvatar,
      stopVoicePreview,
    ],
  );

  useEffect(() => {
    if (!isEditing) {
      setInitialAgent(null);
      setLoadError("");
      setLoadingAgent(false);
      return;
    }

    let cancelled = false;
    setLoadingAgent(true);
    setLoadError("");
    setError("");
    setSuccess(null);

    (async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/agents/${editingAgentId}`,
          {
            method: "GET",
            headers: deriveHeaders(),
            credentials: "include",
            cache: "no-store",
          },
        );
        if (!response.ok) {
          throw new Error(`加载智能体详情失败（${response.status}）`);
        }
        const data = await response.json();
        if (cancelled) {
          return;
        }
        const agent = data?.agent;
        if (!agent) {
          throw new Error("未找到智能体数据");
        }

        const config = data?.chat_config ?? data?.chatConfig ?? {};
        populateFormFromAgent(agent, config);
      } catch (fetchError) {
        if (!cancelled) {
          console.error(fetchError);
          setLoadError(fetchError?.message ?? "加载智能体失败");
        }
      } finally {
        if (!cancelled) {
          setLoadingAgent(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isEditing, editingAgentId, populateFormFromAgent]);

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

  const chatModelOptions = useMemo(
    () => sortChatModels(chatModels),

    [chatModels],
  );

  const selectedVoiceOption = useMemo(() => {
    if (!values.voice_id) {
      return null;
    }
    const target = String(values.voice_id).toLowerCase();
    return (
      voiceOptions.find(
        (item) => String(item?.id ?? "").toLowerCase() === target,
      ) ?? null
    );
  }, [values.voice_id, voiceOptions]);

  const voiceSearchToken = useMemo(
    () => voiceSearchTerm.trim().toLowerCase(),
    [voiceSearchTerm],
  );

  const filteredVoiceOptions = useMemo(() => {
    if (!voiceOptions.length) {
      return [];
    }
    if (!voiceSearchToken) {
      return voiceOptions;
    }
    return voiceOptions.filter((option) => {
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
  }, [voiceOptions, voiceSearchToken]);

  useEffect(() => {
    if (!chatModelOptions.length) {
      return;
    }

    const matched = findChatModel(
      chatModelOptions,
      values.model_provider,
      values.model_name,
    );
    if (matched) {
      return;
    }

    const fallback = chatModelOptions[0];
    if (!fallback) {
      return;
    }

    setValues((prev) => {
      if (
        prev.model_provider === fallback.provider &&
        prev.model_name === fallback.name
      ) {
        return prev;
      }
      return {
        ...prev,
        model_provider: fallback.provider,
        model_name: fallback.name,
      };
    });
  }, [chatModelOptions, setValues, values.model_name, values.model_provider]);

  const selectedChatModel = useMemo(
    () =>
      findChatModel(
        chatModelOptions,

        values.model_provider,

        values.model_name,
      ),

    [chatModelOptions, values.model_provider, values.model_name],
  );

  const chatModelSelectValue = selectedChatModel?.key ?? "";

  const chatModelDescription = selectedChatModel?.description ?? "";

  const chatModelCapabilities = selectedChatModel?.capabilities ?? [];

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

  const displayAvatarUrl = removeAvatar ? "" : values.avatar_url;
  const currentStatus = initialAgent?.status ?? values.status ?? "";

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

      setValues((prev) => ({
        ...prev,

        model_provider: provider,

        model_name: modelName,
      }));
    },

    [setValues],
  );

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

  const handleVoicePreview = useCallback(
    async (voiceId) => {
      const target = String(voiceId ?? "").trim();
      if (!target) {
        setVoicePreviewStatus({
          loading: false,
          voiceId: "",
          error: "请选择音色后再试听",
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
            throw new Error("试听音频缺失");
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
    ],
  );

  const handleChange = useCallback(
    (event) => {
      const { name, value } = event.target;

      setValues((prev) => ({ ...prev, [name]: value }));
      if (name === "voice_id") {
        stopVoicePreview();
      }
    },
    [stopVoicePreview, setValues],
  );

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

    if (isEditing && !editingAgentId) {
      return;
    }

    setError("");
    setSuccess(null);
    setLoadError("");
    setSubmitting(true);

    try {
      const formData = new FormData();

      formData.append("name", values.name.trim());

      if (values.one_sentence_intro.trim()) {
        formData.append("one_sentence_intro", values.one_sentence_intro.trim());
      }

      if (values.persona_desc.trim()) {
        formData.append("persona_desc", values.persona_desc.trim());
      }

      if (values.opening_line.trim()) {
        formData.append("opening_line", values.opening_line.trim());
      }

      if (values.first_turn_hint.trim()) {
        formData.append("first_turn_hint", values.first_turn_hint.trim());
      }

      const provider = values.model_provider.trim();
      const modelName = values.model_name.trim();
      if (!provider || !modelName) {
        throw new Error("请先选择 AI 模型");
      }

      formData.append("model_provider", provider);
      formData.append("model_name", modelName);

      const temperature = Number(values.temperature);
      if (!Number.isNaN(temperature)) {
        formData.append("temperature", String(temperature));
      }

      const maxTokens = Number(values.max_tokens);
      if (!Number.isNaN(maxTokens) && maxTokens > 0) {
        formData.append("max_tokens", String(maxTokens));
      }

      if (avatarFile) {
        formData.append("avatar", avatarFile);
      }

      if (isEditing && removeAvatar) {
        formData.append("remove_avatar", "true");
      }

      if (values.live2d_model_id && values.live2d_model_id.trim()) {
        formData.append("live2d_model_id", values.live2d_model_id.trim());
      }

      const trimmedVoiceId = (values.voice_id ?? "").trim();
      if (trimmedVoiceId) {
        formData.append("voice_id", trimmedVoiceId);
      } else if (voiceStatus.enabled && voiceOptions.length > 0) {
        throw new Error("请选择音色");
      }

      const endpoint = isEditing
        ? `${API_BASE_URL}/agents/${editingAgentId}`
        : `${API_BASE_URL}/agents`;

      const response = await fetch(endpoint, {
        method: isEditing ? "PUT" : "POST",
        headers: deriveHeaders(),
        credentials: "include",
        body: formData,
      });

      if (!response.ok) {
        const textBody = await response.text();
        const message =
          textBody ||
          (isEditing
            ? `Update agent failed with ${response.status}`
            : `Create agent failed with ${response.status}`);
        throw new Error(message);
      }

      const data = await response.json();
      const agent = data?.agent;
      const config = data?.chat_config ?? data?.chatConfig ?? {};

      if (isEditing) {
        populateFormFromAgent(agent ?? initialAgent, config);
        const updatedStatus = agent?.status ?? initialAgent?.status ?? "";
        setSuccess({
          id: agent?.id ?? initialAgent?.id ?? editingAgentId,
          name: agent?.name ?? initialAgent?.name ?? values.name,
          status: updatedStatus,
          mode: "edit",
        });
        setLoadError("");
      } else {
        setSuccess({
          id: agent?.id,
          name: agent?.name,
          status: agent?.status ?? "",
          mode: "create",
        });
        setInitialAgent(agent ?? null);
        setAvatarFile(null);
        setRemoveAvatar(false);
        setLoadError("");
        setValues((prev) => ({
          ...prev,
          name: "",
          one_sentence_intro: "",
          persona_desc: "",
          opening_line: "",
          first_turn_hint: "",
          avatar_url: "",
          status: agent?.status ?? "",
        }));
      }
    } catch (caught) {
      console.error(caught);
      setError(
        caught?.message ??
          (isEditing ? "Failed to update agent" : "Failed to create agent"),
      );
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
              {isEditing ? "编辑智能体" : "创建智能体"}
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              {isEditing
                ? "更新智能体信息后需要等待审核通过才会重新对外展示。"
                : "填写角色信息和模型配置，创建全新的智能体。"}
            </p>
            {isEditing ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusBadgeClasses(
                    currentStatus,
                  )}`}
                >
                  当前状态：{formatStatusLabel(currentStatus)}
                </span>
                {initialAgent?.id ? (
                  <span className="text-[11px] text-slate-400">
                    ID: {initialAgent.id}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          {success?.id ? (
            <Link
              href={`/smart/${success.id}`}
              className="text-sm text-blue-500 hover:text-blue-600"
            >
              查看智能体
            </Link>
          ) : null}
        </div>

        {isEditing && loadingAgent ? (
          <p className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-600">
            正在加载智能体详情...
          </p>
        ) : null}

        {loadError ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
            {loadError}
          </p>
        ) : null}

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

                <div className="mt-2 flex flex-col gap-2">
                  {avatarPreviewUrl ? (
                    <img
                      src={avatarPreviewUrl}
                      alt="头像预览"
                      className="h-24 w-24 rounded-full object-cover shadow"
                    />
                  ) : displayAvatarUrl ? (
                    <img
                      src={resolveAssetUrl(displayAvatarUrl)}
                      alt="当前头像"
                      className="h-24 w-24 rounded-full object-cover shadow"
                    />
                  ) : (
                    <p className="text-xs text-slate-400">
                      支持 JPG、PNG、GIF 或 WebP，大小不超过 5 MB。
                    </p>
                  )}

                  {avatarFile ? (
                    <button
                      type="submit"
                      disabled={submitting || (isEditing && loadingAgent)}
                      className="rounded-full bg-blue-500 px-5 py-2 text-sm font-medium text-white shadow transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-blue-300"
                    >
                      {submitting
                        ? isEditing
                          ? "保存中..."
                          : "创建中..."
                        : isEditing
                          ? "保存修改"
                          : "创建智能体"}
                    </button>
                  ) : null}

                  {isEditing && (displayAvatarUrl || avatarPreviewUrl) ? (
                    <button
                      type="button"
                      onClick={() => setRemoveAvatar((prev) => !prev)}
                      className="w-fit rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 transition hover:border-red-300 hover:text-red-500"
                    >
                      {removeAvatar ? "撤销移除头像" : "移除当前头像"}
                    </button>
                  ) : null}
                </div>
              </label>

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
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <label className="relative flex-1">
                    <span className="sr-only">搜索音色</span>
                    <input
                      id="agent-voice-search"
                      type="text"
                      value={voiceSearchTerm}
                      onChange={(event) =>
                        setVoiceSearchTerm(event.target.value)
                      }
                      placeholder="搜索音色、语言或提供方"
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

                <div className="rounded-2xl border border-slate-200 bg-white/80 p-2 shadow-inner max-h-80 overflow-y-auto">
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
                        const isActive = values.voice_id === value;
                        const isLoadingPreview =
                          voicePreviewStatus.loading &&
                          voicePreviewStatus.voiceId !== value;
                        const isPlayingPreview =
                          !voicePreviewStatus.loading &&
                          voicePreviewStatus.voiceId === value;

                        return (
                          <label
                            key={value}
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
                                  {(option?.language ?? "未知语言") +
                                    " · " +
                                    (option?.provider ?? "未知提供方")}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleVoicePreview(value)}
                                className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-blue-400 hover:text-blue-500 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
                                disabled={
                                  voicePreviewStatus.loading &&
                                  voicePreviewStatus.voiceId !== value
                                }
                              >
                                {isLoadingPreview
                                  ? "加载中..."
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
                              checked={values.voice_id === value}
                              onChange={handleChange}
                              className="sr-only"
                            />
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
                      {voiceOptions.length === 0
                        ? "暂无可选音色，将使用系统默认音色。"
                        : "未找到匹配的音色，请尝试其他关键词。"}
                    </div>
                  )}
                </div>

                {voicePreviewStatus.error ? (
                  <p className="text-xs text-rose-500">
                    {voicePreviewStatus.error}
                  </p>
                ) : null}
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
                  一句话介绍
                </span>

                <textarea
                  name="one_sentence_intro"
                  value={values.one_sentence_intro}
                  onChange={handleChange}
                  rows={2}
                  maxLength={200}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="请用一句话概括智能体的亮点，让用户一眼了解TA"
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-slate-600">
                  人设/角色设定
                </span>

                <textarea
                  name="persona_desc"
                  value={values.persona_desc}
                  onChange={handleChange}
                  rows={4}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="请用详细的描述刻画出智能体的性格、背景与语言习惯"
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-slate-600">
                  对话提示
                </span>

                <textarea
                  name="first_turn_hint"
                  value={values.first_turn_hint}
                  onChange={handleChange}
                  rows={3}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="建议用户在开始对话时的引导语"
                />
              </label>

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
                  <p>
                    {success.mode === "edit"
                      ? "已保存修改。"
                      : `智能体创建成功，编号 ${success.id ?? "--"}。`}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {success.status ? (
                      <span
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusBadgeClasses(
                          success.status,
                        )}`}
                      >
                        状态：{formatStatusLabel(success.status)}
                      </span>
                    ) : null}
                    {success.id ? (
                      <button
                        type="button"
                        className="rounded-full border border-emerald-300 px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:border-emerald-400 hover:text-emerald-800"
                        onClick={() => router.push(`/smart/${success.id}`)}
                      >
                        前往查看
                      </button>
                    ) : null}
                  </div>
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
