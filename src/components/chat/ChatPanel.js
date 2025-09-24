/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveAssetUrl } from "@/lib/media";
import { useRouter } from "next/navigation";

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
  const token = pickStoredToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  headers.set("Accept", "application/json");
  return headers;
}

function formatTimestamp(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString();
}

function clamp(number, min, max) {
  if (!Number.isFinite(number)) {
    return min;
  }
  return Math.min(Math.max(number, min), max);
}

function parseExtras(rawExtras) {
  if (!rawExtras) {
    return null;
  }
  if (typeof rawExtras === "object" && !Array.isArray(rawExtras)) {
    return rawExtras;
  }
  if (typeof rawExtras === "string") {
    try {
      return JSON.parse(rawExtras);
    } catch (error) {
      console.warn("Failed to parse message extras", error);
      return null;
    }
  }
  return null;
}

const EMOTION_DISPLAY_LABELS = {
  happy: "开心",
  sad: "伤心",
  angry: "生气",
  surprised: "惊讶",
  gentle: "温柔",
  confident: "自信",
  neutral: "平静",
};

const EMOTION_MOTION_FALLBACKS = {
  happy: "happy_jump",
  sad: "sad_drop",
  angry: "angry_point",
  surprised: "surprised_react",
  gentle: "gentle_wave",
  confident: "pose_proud",
  neutral: "idle_emphatic",
};

function normalizeEmotionMeta(rawEmotion) {
  if (!rawEmotion) {
    return null;
  }

  const resolveLabel = (value) => {
    if (typeof value !== "string") {
      return "";
    }
    return value.trim().toLowerCase();
  };

  const fallbackMotion = (label) => EMOTION_MOTION_FALLBACKS[label] ?? "";

  if (typeof rawEmotion === "string") {
    const label = resolveLabel(rawEmotion) || "neutral";
    const normalizedLabel = EMOTION_DISPLAY_LABELS[label] ? label : "neutral";
    const displayLabel =
      EMOTION_DISPLAY_LABELS[normalizedLabel] ?? normalizedLabel;
    const motion = fallbackMotion(normalizedLabel);
    const baseIntensity = normalizedLabel === "neutral" ? 0.35 : 0.7;
    return {
      label: normalizedLabel,
      display_label: displayLabel,
      intensity: baseIntensity,
      confidence: 0.45,
      suggested_motion: motion,
      suggestedMotion: motion,
      hold_ms: undefined,
      holdMs: undefined,
      reason: "",
    };
  }

  if (typeof rawEmotion !== "object") {
    return null;
  }

  const labelCandidate = [
    rawEmotion.label,
    rawEmotion.Label,
    rawEmotion.emotion,
    rawEmotion.Emotion,
    rawEmotion.type,
    rawEmotion.Type,
  ]
    .map(resolveLabel)
    .find((value) => value);
  const normalizedLabel = EMOTION_DISPLAY_LABELS[labelCandidate]
    ? labelCandidate
    : "neutral";
  const displayLabel =
    EMOTION_DISPLAY_LABELS[normalizedLabel] ?? normalizedLabel;

  const intensityCandidate = [
    rawEmotion.intensity,
    rawEmotion.Intensity,
    rawEmotion.score,
    rawEmotion.Score,
  ].find((value) => value !== undefined && value !== null && value !== "");
  let intensityValue = Number(intensityCandidate);
  if (!Number.isFinite(intensityValue)) {
    intensityValue = normalizedLabel === "neutral" ? 0.35 : 0.65;
  }
  const minIntensity = normalizedLabel === "neutral" ? 0.25 : 0.55;
  const intensity = clamp(Math.max(intensityValue, minIntensity), 0, 1);

  const confidenceCandidate = [
    rawEmotion.confidence,
    rawEmotion.Confidence,
  ].find((value) => value !== undefined && value !== null && value !== "");
  let confidenceValue = Number(confidenceCandidate);
  if (!Number.isFinite(confidenceValue)) {
    confidenceValue = 0.45;
  }
  const confidence = clamp(Math.max(confidenceValue, 0.35), 0, 1);

  const motionCandidate = [
    rawEmotion.suggested_motion,
    rawEmotion.SuggestedMotion,
    rawEmotion.motion,
    rawEmotion.Motion,
  ].find((value) => typeof value === "string" && value.trim());
  const fallback = fallbackMotion(normalizedLabel);
  const motionKey = motionCandidate ? motionCandidate.trim() : fallback;

  const holdCandidate = [
    rawEmotion.hold_ms,
    rawEmotion.holdMs,
    rawEmotion.duration_ms,
    rawEmotion.DurationMs,
  ].find((value) => value !== undefined && value !== null && value !== "");
  let holdMs;
  const holdNumber = Number(holdCandidate);
  if (Number.isFinite(holdNumber) && holdNumber >= 0) {
    holdMs = holdNumber;
  }

  const reason =
    [rawEmotion.reason, rawEmotion.Reason].find(
      (value) => typeof value === "string" && value.trim(),
    ) || "";

  return {
    label: normalizedLabel,
    display_label: displayLabel,
    intensity,
    confidence,
    suggested_motion: motionKey,
    suggestedMotion: motionKey,
    hold_ms: holdMs,
    holdMs,
    reason,
  };
}

function normalizeMessage(message) {
  if (!message || typeof message !== "object") {
    return null;
  }
  const extras = parseExtras(message.extras ?? message.Extras);
  return {
    ...message,
    id: message.id ?? message.ID ?? null,
    clientId: message.clientId ?? null,
    role: message.role ?? message.Role ?? "assistant",
    content: message.content ?? message.Content ?? "",
    created_at: message.created_at ?? message.createdAt ?? null,
    extrasParsed: extras,
  };
}

function getMessageKey(message) {
  return (
    message?.id ??
    message?.clientId ??
    `${message?.role ?? "assistant"}-${message?.created_at ?? "unknown"}`
  );
}

export default function ChatPanel({
  agentId,
  agent,
  live2DRef,
  live2DStatus,
  live2DError,
}) {
  const [userId, setUserId] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const [profileStatus, setProfileStatus] = useState({
    loading: false,
    error: null,
  });
  const [conversationStatus, setConversationStatus] = useState({
    loading: false,
    error: null,
  });
  const [messages, setMessages] = useState([]);
  const [messagesStatus, setMessagesStatus] = useState({
    loading: false,
    error: null,
  });
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const recognitionRef = useRef(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [clearStatus, setClearStatus] = useState({
    loading: false,
    error: null,
    success: false,
  });

  const router = useRouter();

  const [voiceStatus, setVoiceStatus] = useState({
    loading: false,
    error: null,
    enabled: false,
    defaultVoice: "",
  });
  const [voiceOptions, setVoiceOptions] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState("");
  const [speechSpeed, setSpeechSpeed] = useState(1.0);
  const [speechPitch, setSpeechPitch] = useState(1.0);
  const [emotionHint, setEmotionHint] = useState("");
  const [speechAutoPlay, setSpeechAutoPlay] = useState(true);
  const [speechError, setSpeechError] = useState(null);
  const [activeSpeechId, setActiveSpeechId] = useState(null);

  const audioContextRef = useRef(null);
  const speechQueueRef = useRef([]);
  const currentSpeechRef = useRef(null);
  const playedSpeechIdsRef = useRef(new Set());
  const speechAutoPlayRef = useRef(true);
  const ambientEmotionTimeoutRef = useRef(null);
  const lastEmotionPreviewIdRef = useRef(null);
  const initialMessagesLoadedRef = useRef(false);
  const lastVoiceIdRef = useRef(null);
  const userSelectedVoiceRef = useRef(false);

  const handleUnauthorizedResponse = useCallback(
    (response) => {
      if (response?.status === 401) {
        router.replace("/401");
        return true;
      }
      return false;
    },
    [router],
  );

  const agentAvatar = resolveAssetUrl(
    agent?.avatar_url ?? agent?.avatarUrl ?? "",
  );
  const agentAltText = `${agent?.name ?? "Agent"} avatar`;
  const agentInitial = (() => {
    const source = typeof agent?.name === "string" ? agent.name.trim() : "";
    if (!source) {
      return "A";
    }
    return source.charAt(0).toUpperCase();
  })();

  const speechErrorHandler = useCallback((event) => {
    console.warn("Speech recognition error", event?.error);
    setIsListening(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    const RecognitionClass =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition ||
      window.mozSpeechRecognition;

    if (!RecognitionClass) {
      setVoiceSupported(false);
      return undefined;
    }

    const recognition = new RecognitionClass();
    recognition.lang = "zh-CN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = speechErrorHandler;
    recognition.onresult = (event) => {
      const transcript = event?.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) {
        setInputValue((prev) => (prev ? `${prev} ${transcript}` : transcript));
      }
    };

    recognitionRef.current = recognition;
    setVoiceSupported(true);

    return () => {
      recognition.onerror = null;
      recognition.onresult = null;
      recognition.onstart = null;
      recognition.onend = null;
      recognitionRef.current = null;
    };
  }, [speechErrorHandler]);

  const applyEmotionToAvatar = useCallback(
    (emotionInput, options = {}) => {
      if (typeof window === "undefined") {
        return;
      }
      const controls = live2DRef?.current;
      if (!controls) {
        return;
      }
      const normalized = normalizeEmotionMeta(emotionInput);
      if (!normalized) {
        return;
      }
      if (ambientEmotionTimeoutRef.current) {
        window.clearTimeout(ambientEmotionTimeoutRef.current);
        ambientEmotionTimeoutRef.current = null;
      }
      const motionKey =
        normalized.suggested_motion ??
        normalized.suggestedMotion ??
        EMOTION_MOTION_FALLBACKS[normalized.label] ??
        (normalized.label === "neutral" ? "idle_emphatic" : "");
      try {
        controls.setEmotion?.(normalized);
        if (controls.setMouthOpen) {
          const target = clamp(
            0.3 + (normalized.intensity ?? 0.55) * 0.55,
            0,
            0.95,
          );
          controls.setMouthOpen(target, 220);
        }
      } catch (error) {
        console.warn("Live2D setEmotion failed", error);
      }
      if (motionKey) {
        try {
          controls.playMotion?.(motionKey, {
            intensity: clamp((normalized.intensity ?? 0.6) * 1.1, 0.2, 1),
          });
        } catch (error) {
          console.warn("Live2D playMotion failed", error);
        }
      }
      const { autoReset = true, holdMs } = options;
      if (!autoReset) {
        return;
      }
      const duration =
        typeof holdMs === "number" && holdMs >= 0
          ? holdMs
          : Math.max(1800, Math.floor((normalized.intensity ?? 0.5) * 4800));
      ambientEmotionTimeoutRef.current = window.setTimeout(() => {
        try {
          controls.setEmotion?.({ label: "neutral", intensity: 0.32 });
          controls.clearEmotion?.();
          if (controls.setMouthOpen) {
            controls.setMouthOpen(0.18, 200);
          }
        } catch (error) {
          console.warn("Live2D reset emotion failed", error);
        } finally {
          ambientEmotionTimeoutRef.current = null;
        }
      }, duration);
    },
    [live2DRef],
  );

  const stopSpeechPlayback = useCallback(() => {
    const current = currentSpeechRef.current;
    if (typeof window !== "undefined" && ambientEmotionTimeoutRef.current) {
      window.clearTimeout(ambientEmotionTimeoutRef.current);
      ambientEmotionTimeoutRef.current = null;
    }
    if (current?.audio) {
      try {
        current.audio.pause();
      } catch (error) {
        console.warn("Failed to pause audio", error);
      }
    }
    let cleanupHandled = false;
    if (current?.cleanup) {
      try {
        current.cleanup();
        cleanupHandled = true;
      } catch (error) {
        console.warn("Failed to cleanup speech playback", error);
      }
    }
    if (!cleanupHandled) {
      applyEmotionToAvatar(
        { label: "neutral", intensity: 0.3 },
        { autoReset: false },
      );
    }
    currentSpeechRef.current = null;
    speechQueueRef.current = [];
    lastEmotionPreviewIdRef.current = null;
    setActiveSpeechId(null);
    const controls = live2DRef?.current;
    if (controls?.setMouthOpen) {
      controls.setMouthOpen(0, 0);
    }
    if (!cleanupHandled) {
      controls?.clearEmotion?.();
    }
  }, [applyEmotionToAvatar, live2DRef]);

  const ensureAudioContext = useCallback(() => {
    if (typeof window === "undefined") {
      return null;
    }
    const AudioCtx =
      window.AudioContext ||
      window.webkitAudioContext ||
      window.mozAudioContext;
    if (!AudioCtx) {
      return null;
    }
    let ctx = audioContextRef.current;
    if (!ctx || ctx.state === "closed") {
      try {
        ctx = new AudioCtx();
        audioContextRef.current = ctx;
      } catch (error) {
        console.warn("Failed to create AudioContext", error);
        return null;
      }
    }
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }, []);

  const scheduleNextSpeech = useCallback(() => {
    if (currentSpeechRef.current) {
      return;
    }
    const next = speechQueueRef.current.shift();
    if (!next) {
      return;
    }
    if (typeof window !== "undefined" && ambientEmotionTimeoutRef.current) {
      window.clearTimeout(ambientEmotionTimeoutRef.current);
      ambientEmotionTimeoutRef.current = null;
    }
    const normalizedEmotion = normalizeEmotionMeta(next.emotion);
    const speech = next.speech;
    const source = speech?.audio_base64;
    if (!source) {
      scheduleNextSpeech();
      return;
    }
    const mime = speech?.mime_type || "audio/mpeg";
    const audio = new Audio(`data:${mime};base64,${source}`);
    audio.preload = "auto";
    audio.crossOrigin = "anonymous";
    const cleanupFns = [];
    const controls = live2DRef?.current;
    const cleanup = () => {
      cleanupFns.forEach((fn) => {
        try {
          fn();
        } catch (error) {
          console.warn("Speech cleanup failed", error);
        }
      });
      cleanupFns.length = 0;
      if (typeof window !== "undefined" && ambientEmotionTimeoutRef.current) {
        window.clearTimeout(ambientEmotionTimeoutRef.current);
        ambientEmotionTimeoutRef.current = null;
      }
      if (controls?.setMouthOpen) {
        controls.setMouthOpen(0, 0);
      }
      if (normalizedEmotion) {
        applyEmotionToAvatar(
          { label: "neutral", intensity: 0.3 },
          { autoReset: false },
        );
        controls?.clearEmotion?.();
      } else if (controls?.clearEmotion) {
        controls.clearEmotion();
      }
      currentSpeechRef.current = null;
      setActiveSpeechId(null);
      lastEmotionPreviewIdRef.current = null;
    };
    const finishPlayback = () => {
      cleanup();
      scheduleNextSpeech();
    };
    const handlePlay = () => {
      const ctx = ensureAudioContext();
      if (!ctx) {
        const intervalId = window.setInterval(() => {
          if (audio.paused) {
            return;
          }
          const simulated = 0.35 + Math.random() * 0.4;
          if (controls?.setMouthOpen) {
            controls.setMouthOpen(clamp(simulated, 0, 1), 150);
          }
        }, 120);
        cleanupFns.push(() => window.clearInterval(intervalId));
        return;
      }
      let sourceNode = null;
      let analyser = null;
      let frameId = null;
      try {
        sourceNode = ctx.createMediaElementSource(audio);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.2;
        const timeDomain = new Uint8Array(analyser.fftSize);
        const freqDomain = new Uint8Array(analyser.frequencyBinCount);
        sourceNode.connect(analyser);
        analyser.connect(ctx.destination);
        const tick = () => {
          if (audio.paused) {
            return;
          }
          analyser.getByteTimeDomainData(timeDomain);
          let sumSquares = 0;
          for (let i = 0; i < timeDomain.length; i += 1) {
            const centered = timeDomain[i] - 128;
            sumSquares += centered * centered;
          }
          const rms = Math.sqrt(sumSquares / timeDomain.length) / 128;
          analyser.getByteFrequencyData(freqDomain);
          let peak = 0;
          for (let i = 0; i < freqDomain.length; i += 1) {
            if (freqDomain[i] > peak) {
              peak = freqDomain[i];
            }
          }
          const combined = Math.max(rms * 1.8, peak / 255);
          const eased = Math.pow(combined, 0.85);
          const level = clamp(eased, 0, 1);
          if (controls?.setMouthOpen) {
            controls.setMouthOpen(level, 140);
          }
          frameId = requestAnimationFrame(tick);
        };
        frameId = requestAnimationFrame(tick);
      } catch (error) {
        console.warn("Failed to attach analyser", error);
      }
      cleanupFns.push(() => {
        if (frameId) {
          cancelAnimationFrame(frameId);
          frameId = null;
        }
        if (analyser) {
          try {
            analyser.disconnect();
          } catch (error) {
            console.warn("Failed to disconnect analyser", error);
          }
        }
        if (sourceNode) {
          try {
            sourceNode.disconnect();
          } catch (error) {
            console.warn("Failed to disconnect source", error);
          }
        }
      });
    };
    const handleError = (event) => {
      console.warn("Speech playback error", event);
      playedSpeechIdsRef.current.delete(next.id);
      setSpeechError("语音播放失败，请点击语音按钮重新播放。");
      finishPlayback();
    };
    const handleEnded = () => {
      finishPlayback();
    };
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    cleanupFns.push(() => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    });
    currentSpeechRef.current = {
      audio,
      cleanup,
      messageId: next.id,
      emotion: normalizedEmotion,
    };
    setActiveSpeechId(next.id);
    setSpeechError(null);
    lastEmotionPreviewIdRef.current = next.id;
    if (normalizedEmotion) {
      applyEmotionToAvatar(normalizedEmotion, { autoReset: false });
    } else if (controls?.setEmotion) {
      controls.setEmotion({ label: "neutral", intensity: 0.35 });
    }
    const playPromise = audio.play();
    if (playPromise?.catch) {
      playPromise.catch((error) => {
        console.warn("Autoplay failed", error);
        playedSpeechIdsRef.current.delete(next.id);
        setSpeechError("浏览器阻止了自动播放，请在消息中点击“播放语音”重试。");
        finishPlayback();
      });
    }
  }, [applyEmotionToAvatar, ensureAudioContext, live2DRef]);

  const registerSpeech = useCallback(
    (message, options = {}) => {
      const { enqueue = true, force = false, markPlayed = true } = options;
      if (!message) {
        return;
      }
      const extras = message.extrasParsed;
      const speech = extras?.speech;
      const emotion = normalizeEmotionMeta(extras?.emotion);
      if (!speech?.audio_base64) {
        return;
      }
      const id = message.id ?? message.clientId;
      if (!id) {
        return;
      }
      const alreadyPlayed = playedSpeechIdsRef.current.has(id);
      if (!force && alreadyPlayed) {
        return;
      }
      if (!force && !speechAutoPlayRef.current) {
        if (markPlayed && !alreadyPlayed) {
          playedSpeechIdsRef.current.add(id);
        }
        if (enqueue && emotion) {
          const holdDuration =
            emotion?.hold_ms ??
            emotion?.holdMs ??
            Math.max(1600, Math.floor((emotion.intensity ?? 0.5) * 3200));
          applyEmotionToAvatar(emotion, {
            holdMs: holdDuration,
            autoReset: true,
          });
          lastEmotionPreviewIdRef.current = id;
        }
        return;
      }
      if (markPlayed && !alreadyPlayed) {
        playedSpeechIdsRef.current.add(id);
      }
      if (!enqueue) {
        return;
      }
      speechQueueRef.current.push({
        id,
        speech,
        emotion,
      });
      scheduleNextSpeech();
    },
    [applyEmotionToAvatar, scheduleNextSpeech],
  );

  useEffect(
    () => () => {
      stopSpeechPlayback();
      const ctx = audioContextRef.current;
      if (ctx && typeof ctx.close === "function") {
        ctx.close().catch(() => {});
      }
    },
    [stopSpeechPlayback],
  );

  useEffect(() => {
    speechAutoPlayRef.current = speechAutoPlay;
    if (!speechAutoPlay) {
      stopSpeechPlayback();
    }
  }, [speechAutoPlay, stopSpeechPlayback]);

  useEffect(() => {
    if (!agentId) {
      setVoiceOptions([]);
      setVoiceStatus((prev) => ({
        ...prev,
        enabled: false,
        defaultVoice: "",
        error: null,
      }));
      return;
    }
    let aborted = false;
    setVoiceStatus((prev) => ({ ...prev, loading: true, error: null }));
    (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/tts/voices`, {
          method: "GET",
          headers: deriveHeaders(),
          credentials: "include",
        });
        if (aborted) {
          return;
        }
        if (!response.ok) {
          throw new Error(`请求语音列表失败: ${response.status}`);
        }
        const data = await response.json();
        const voices = Array.isArray(data?.voices) ? data.voices : [];
        setVoiceOptions(voices);
        setVoiceStatus({
          loading: false,
          error: null,
          enabled: Boolean(data?.enabled),
          defaultVoice: data?.default_voice ?? "",
        });
        if (!userSelectedVoiceRef.current) {
          const preferred =
            agent?.voice_id ??
            agent?.voiceId ??
            data?.default_voice ??
            (voices.length > 0 ? voices[0].id : "");
          if (preferred) {
            setSelectedVoice(String(preferred));
          }
        }
      } catch (error) {
        if (aborted) {
          return;
        }
        console.error(error);
        setVoiceStatus({
          loading: false,
          error: error?.message ?? "加载语音列表失败",
          enabled: false,
          defaultVoice: "",
        });
      }
    })();
    return () => {
      aborted = true;
    };
  }, [agentId, agent?.voiceId, agent?.voice_id]);

  const selectedVoiceOption = useMemo(() => {
    if (!selectedVoice) {
      return null;
    }
    const target = String(selectedVoice).toLowerCase();
    return (
      voiceOptions.find((item) => String(item.id).toLowerCase() === target) ??
      null
    );
  }, [selectedVoice, voiceOptions]);

  useEffect(() => {
    if (!selectedVoiceOption) {
      return;
    }
    const voiceId = selectedVoiceOption.id;
    if (lastVoiceIdRef.current === voiceId) {
      return;
    }
    lastVoiceIdRef.current = voiceId;
    const settings = selectedVoiceOption.settings ?? {};
    const rawSpeed =
      settings.default_speed ?? settings.DefaultSpeed ?? speechSpeed ?? 1.0;
    const rawPitch =
      settings.default_pitch ?? settings.DefaultPitch ?? speechPitch ?? 1.0;
    const speedRange = settings.speed_range ??
      settings.SpeedRange ?? [0.5, 1.6];
    const pitchRange = settings.pitch_range ??
      settings.PitchRange ?? [0.7, 1.4];
    const minSpeed = Number(speedRange?.[0] ?? 0.5);
    const maxSpeed = Number(speedRange?.[1] ?? 1.6);
    const minPitch = Number(pitchRange?.[0] ?? 0.7);
    const maxPitch = Number(pitchRange?.[1] ?? 1.4);
    setSpeechSpeed(() => clamp(Number(rawSpeed) || 1.0, minSpeed, maxSpeed));
    setSpeechPitch(() => clamp(Number(rawPitch) || 1.0, minPitch, maxPitch));
    if (!settings.supports_emotion && emotionHint) {
      setEmotionHint("");
    }
  }, [selectedVoiceOption, emotionHint, speechPitch, speechSpeed]);

  const loadProfile = useCallback(async () => {
    if (!agentId) {
      return;
    }
    setProfileStatus({ loading: true, error: null });
    try {
      const response = await fetch(`${API_BASE_URL}/auth/profile`, {
        method: "GET",
        headers: deriveHeaders(),
        credentials: "include",
      });

      if (handleUnauthorizedResponse(response)) {
        setProfileStatus({ loading: false, error: null });
        return;
      }

      if (!response.ok) {
        throw new Error(`Profile request failed with ${response.status}`);
      }
      const data = await response.json();
      if (typeof data?.id === "number" || typeof data?.id === "string") {
        setUserId(String(data.id));
      } else {
        throw new Error("Profile response missing id");
      }
      setProfileStatus({ loading: false, error: null });
    } catch (error) {
      console.error(error);
      setProfileStatus({
        loading: false,
        error: error?.message ?? "Failed to load profile",
      });
    }
  }, [agentId, handleUnauthorizedResponse]);

  const initializeConversation = useCallback(async () => {
    if (!agentId || !userId) {
      return;
    }
    setConversationStatus({ loading: true, error: null });
    try {
      const response = await fetch(
        `${API_BASE_URL}/agents/${agentId}/conversations`,
        {
          method: "POST",
          headers: deriveHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify({ user_id: Number(userId) }),
        },
      );

      if (handleUnauthorizedResponse(response)) {
        setConversationStatus({ loading: false, error: null });
        return;
      }

      if (!response.ok) {
        throw new Error(`Conversation init failed with ${response.status}`);
      }
      const data = await response.json();
      const conversation = data?.conversation;
      if (conversation?.id) {
        setConversationId(String(conversation.id));
      }
      const initialMessages = Array.isArray(data?.messages)
        ? data.messages
        : [];
      const normalized = initialMessages
        .map((item) => normalizeMessage(item))
        .filter(Boolean);
      setMessages(normalized);
      if (!initialMessagesLoadedRef.current) {
        normalized.forEach((item) =>
          registerSpeech(item, { enqueue: false, markPlayed: true }),
        );
      }
      setConversationStatus({ loading: false, error: null });
    } catch (error) {
      console.error(error);
      setConversationStatus({
        loading: false,
        error: error?.message ?? "Failed to initialise conversation",
      });
    }
  }, [agentId, userId, handleUnauthorizedResponse, registerSpeech]);

  const loadMessages = useCallback(async () => {
    if (!agentId || !userId) {
      return;
    }
    setMessagesStatus((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const url = new URL(`${API_BASE_URL}/llm/messages`);
      url.searchParams.set("agent_id", agentId);
      url.searchParams.set("user_id", userId);

      const response = await fetch(url, {
        method: "GET",
        headers: deriveHeaders(),
        credentials: "include",
      });

      if (handleUnauthorizedResponse(response)) {
        setMessagesStatus({ loading: false, error: null });
        return;
      }

      if (!response.ok) {
        throw new Error(`Messages request failed with ${response.status}`);
      }

      const data = await response.json();
      const items = Array.isArray(data)
        ? data
        : Array.isArray(data?.messages)
          ? data.messages
          : [];
      const normalized = items
        .map((item) => normalizeMessage(item))
        .filter(Boolean);
      setMessages(normalized);
      if (!initialMessagesLoadedRef.current) {
        normalized.forEach((item) =>
          registerSpeech(item, { enqueue: false, markPlayed: true }),
        );
        initialMessagesLoadedRef.current = true;
      } else {
        normalized.forEach((item) => registerSpeech(item, { enqueue: true }));
      }
      setMessagesStatus({ loading: false, error: null });
    } catch (error) {
      console.error(error);
      setMessagesStatus({
        loading: false,
        error: error?.message ?? "Failed to load messages",
      });
    }
  }, [agentId, userId, handleUnauthorizedResponse, registerSpeech]);

  const handleClearConversation = useCallback(async () => {
    if (!agentId || !userId) {
      setClearStatus({
        loading: false,
        error: "Missing agent or user information. Please refresh.",
        success: false,
      });
      return;
    }

    const numericUserId = Number(userId);
    if (Number.isNaN(numericUserId)) {
      setClearStatus({
        loading: false,
        error: "Unable to determine user identity. Please refresh.",
        success: false,
      });
      return;
    }

    setClearStatus({ loading: true, error: null, success: false });
    try {
      const response = await fetch(
        `${API_BASE_URL}/agents/${agentId}/conversations`,
        {
          method: "DELETE",
          headers: deriveHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify({ user_id: numericUserId }),
        },
      );

      if (handleUnauthorizedResponse(response)) {
        setClearStatus({ loading: false, error: null, success: false });
        return;
      }

      if (!response.ok && response.status !== 204) {
        throw new Error(`Clear conversation failed with ${response.status}`);
      }

      setMessages([]);
      setConversationId(null);
      setInputValue("");
      setSendError(null);
      playedSpeechIdsRef.current.clear();
      speechQueueRef.current = [];
      stopSpeechPlayback();
      initialMessagesLoadedRef.current = false;

      await initializeConversation();
      await loadMessages();

      setClearStatus({ loading: false, error: null, success: true });
    } catch (error) {
      console.error(error);
      setClearStatus({
        loading: false,
        error: error?.message ?? "Failed to clear conversation",
        success: false,
      });
    }
  }, [
    agentId,
    userId,
    initializeConversation,
    loadMessages,
    handleUnauthorizedResponse,
    stopSpeechPlayback,
  ]);

  useEffect(() => {
    (async () => {
      await loadProfile();
    })();
  }, [loadProfile]);

  useEffect(() => {
    setMessages([]);
    setConversationId(null);
    setClearStatus({ loading: false, error: null, success: false });
    playedSpeechIdsRef.current.clear();
    speechQueueRef.current = [];
    stopSpeechPlayback();
    initialMessagesLoadedRef.current = false;
    setSpeechError(null);
    lastVoiceIdRef.current = null;
    userSelectedVoiceRef.current = false;
    setSelectedVoice("");
    setEmotionHint("");
  }, [agentId, stopSpeechPlayback]);

  useEffect(() => {
    if (!agentId || !userId) {
      return;
    }
    (async () => {
      await initializeConversation();
      await loadMessages();
    })();
  }, [agentId, userId, initializeConversation, loadMessages]);

  const handleSend = useCallback(
    async (event) => {
      event?.preventDefault?.();
      if (!agentId || !userId) {
        setSendError("Missing agent or user information. Please refresh.");
        return;
      }
      const trimmed = inputValue.trim();
      if (!trimmed) {
        return;
      }
      setIsSending(true);
      setSendError(null);

      const optimisticMessage = {
        id: `temp-${Date.now()}`,
        clientId: `temp-${Date.now()}-${Math.random()}`,
        role: "user",
        content: trimmed,
        created_at: new Date().toISOString(),
        optimistic: true,
        extrasParsed: null,
      };
      setMessages((prev) => [...prev, optimisticMessage]);
      setInputValue("");

      const targetVoice = selectedVoice || voiceStatus.defaultVoice || "";
      const settings = selectedVoiceOption?.settings ?? {};
      const speedRange = settings.speed_range ??
        settings.SpeedRange ?? [0.5, 1.6];
      const pitchRange = settings.pitch_range ??
        settings.PitchRange ?? [0.7, 1.4];
      const payload = {
        agent_id: agentId,
        user_id: userId,
        role: "user",
        content: trimmed,
      };
      if (targetVoice) {
        payload.voice_id = targetVoice;
      }
      const minSpeed = Number(speedRange?.[0] ?? 0.5);
      const maxSpeed = Number(speedRange?.[1] ?? 1.6);
      const minPitch = Number(pitchRange?.[0] ?? 0.7);
      const maxPitch = Number(pitchRange?.[1] ?? 1.4);
      const safeSpeed = clamp(Number(speechSpeed) || 1.0, minSpeed, maxSpeed);
      const safePitch = clamp(Number(speechPitch) || 1.0, minPitch, maxPitch);
      payload.speech_speed = Number(safeSpeed.toFixed(3));
      payload.speech_pitch = Number(safePitch.toFixed(3));
      if (emotionHint) {
        payload.emotion_hint = emotionHint;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/llm/messages`, {
          method: "POST",
          headers: deriveHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify(payload),
        });

        if (handleUnauthorizedResponse(response)) {
          setMessages((prev) =>
            prev.filter(
              (item) =>
                getMessageKey(item) !== getMessageKey(optimisticMessage),
            ),
          );
          return;
        }

        if (!response.ok) {
          throw new Error(`Send failed with status ${response.status}`);
        }

        const data = await response.json();
        if (data?.conversation_id) {
          setConversationId(String(data.conversation_id));
        }

        const normalizedUser =
          normalizeMessage(data?.user_message) ??
          normalizeMessage(optimisticMessage);
        const normalizedAssistant = normalizeMessage(data?.assistant_message);

        setMessages((prev) => {
          const withoutOptimistic = prev.filter(
            (item) => getMessageKey(item) !== getMessageKey(optimisticMessage),
          );
          const next = [...withoutOptimistic];
          if (normalizedUser) {
            next.push(normalizedUser);
          }
          if (normalizedAssistant) {
            next.push(normalizedAssistant);
          }
          return next;
        });

        if (normalizedAssistant) {
          registerSpeech(normalizedAssistant);
        } else {
          await loadMessages();
        }

        if (data?.assistant_error) {
          setSendError(data.assistant_error);
        }
      } catch (error) {
        console.error(error);
        setSendError(error?.message ?? "Failed to send message");
        setMessages((prev) =>
          prev.filter(
            (item) => getMessageKey(item) !== getMessageKey(optimisticMessage),
          ),
        );
        setInputValue(trimmed);
      } finally {
        setIsSending(false);
      }
    },
    [
      agentId,
      userId,
      inputValue,
      selectedVoice,
      voiceStatus.defaultVoice,
      speechSpeed,
      speechPitch,
      emotionHint,
      selectedVoiceOption,
      handleUnauthorizedResponse,
      registerSpeech,
      loadMessages,
    ],
  );

  const handleVoiceToggle = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      return;
    }
    try {
      if (isListening) {
        recognition.stop();
      } else {
        recognition.start();
      }
    } catch (error) {
      console.warn("Speech recognition toggle failed", error);
      setIsListening(false);
    }
  }, [isListening]);

  const handleReplaySpeech = useCallback(
    (message) => {
      setSpeechError(null);
      registerSpeech(message, {
        enqueue: true,
        force: true,
        markPlayed: false,
      });
    },
    [registerSpeech],
  );

  const orderedMessages = useMemo(() => {
    return [...messages].sort((a, b) => {
      const aTime = new Date(a?.created_at ?? 0).getTime();
      const bTime = new Date(b?.created_at ?? 0).getTime();
      return aTime - bTime;
    });
  }, [messages]);

  const emptyState =
    !messagesStatus.loading &&
    !conversationStatus.loading &&
    orderedMessages.length === 0;

  const live2DReady = live2DStatus === "ready";

  const speedRange = selectedVoiceOption?.settings?.speed_range ?? [0.5, 1.6];
  const pitchRange = selectedVoiceOption?.settings?.pitch_range ?? [0.7, 1.4];
  const voiceSupportsEmotion = Boolean(
    selectedVoiceOption?.settings?.supports_emotion ?? false,
  );
  const availableEmotions = Array.isArray(selectedVoiceOption?.emotions)
    ? selectedVoiceOption.emotions
    : [];

  return (
    <section className="flex h-full w-full max-h-[85vh] sm:min-h-[480px] lg:max-h-[720px] flex-col overflow-hidden rounded-3xl border border-white/30 bg-white/70 shadow-xl backdrop-blur">
      <header className="flex items-start justify-between gap-3 border-b border-white/40 bg-white/80 p-4">
        <div className="flex items-center gap-3">
          {agentAvatar ? (
            <img
              src={agentAvatar}
              alt={agentAltText}
              className="h-14 w-14 rounded-full object-cover shadow"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-200 text-base font-semibold text-gray-600">
              {agentInitial}
            </div>
          )}
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Smart Chat {agent?.name ? `- ${agent.name}` : ""}
            </h2>
            <p className="text-xs text-gray-500">
              Browse historical messages and craft new prompts with text or
              voice.
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
              <span>
                Live2D:{" "}
                {live2DReady
                  ? "已就绪"
                  : live2DStatus === "error"
                    ? "加载失败"
                    : (live2DStatus ?? "待机")}
              </span>
              {live2DError ? (
                <span className="text-red-400">{live2DError}</span>
              ) : null}
              {voiceStatus.loading ? <span>语音配置加载中...</span> : null}
              {voiceStatus.error ? (
                <span className="text-red-400">{voiceStatus.error}</span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {messagesStatus.loading && <span>Syncing...</span>}
          {messagesStatus.error && !messagesStatus.loading ? (
            <span className="text-red-500">{messagesStatus.error}</span>
          ) : null}
        </div>
      </header>

      {voiceStatus.enabled ? (
        <div className="border-b border-white/40 bg-white/70 px-4 py-3 text-xs text-gray-600">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2">
                <span className="text-gray-500">语音</span>
                <select
                  className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs focus:border-blue-400 focus:outline-none"
                  value={selectedVoice}
                  onChange={(event) => {
                    setSelectedVoice(event.target.value);
                    userSelectedVoiceRef.current = true;
                  }}
                >
                  {voiceOptions.length === 0 ? (
                    <option value="">暂无可用语音</option>
                  ) : (
                    voiceOptions.map((voice) => (
                      <option key={voice.id} value={voice.id}>
                        {voice.name ?? voice.id}
                      </option>
                    ))
                  )}
                </select>
              </label>

              <label className="flex items-center gap-2">
                <span className="text-gray-500">情绪</span>
                <select
                  className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs focus:border-blue-400 focus:outline-none"
                  value={emotionHint}
                  onChange={(event) => setEmotionHint(event.target.value)}
                  disabled={
                    !voiceSupportsEmotion || availableEmotions.length === 0
                  }
                >
                  <option value="">自动</option>
                  {availableEmotions.map((emotion) => (
                    <option key={emotion} value={emotion}>
                      {emotion}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2">
                <span className="text-gray-500">自动播报</span>
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-400"
                  checked={speechAutoPlay}
                  onChange={(event) => setSpeechAutoPlay(event.target.checked)}
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-3">
                <span className="text-gray-500">语速</span>
                <input
                  type="range"
                  min={Number(speedRange?.[0] ?? 0.5)}
                  max={Number(speedRange?.[1] ?? 1.6)}
                  step="0.02"
                  value={speechSpeed}
                  onChange={(event) =>
                    setSpeechSpeed(
                      clamp(
                        Number(event.target.value),
                        Number(speedRange?.[0] ?? 0.5),
                        Number(speedRange?.[1] ?? 1.6),
                      ),
                    )
                  }
                  className="h-2 w-40 rounded-lg bg-gray-200"
                />
                <span className="w-12 text-right font-medium text-gray-700">
                  {speechSpeed.toFixed(2)}x
                </span>
              </label>

              <label className="flex items-center gap-3">
                <span className="text-gray-500">音调</span>
                <input
                  type="range"
                  min={Number(pitchRange?.[0] ?? 0.7)}
                  max={Number(pitchRange?.[1] ?? 1.4)}
                  step="0.02"
                  value={speechPitch}
                  onChange={(event) =>
                    setSpeechPitch(
                      clamp(
                        Number(event.target.value),
                        Number(pitchRange?.[0] ?? 0.7),
                        Number(pitchRange?.[1] ?? 1.4),
                      ),
                    )
                  }
                  className="h-2 w-40 rounded-lg bg-gray-200"
                />
                <span className="w-12 text-right font-medium text-gray-700">
                  {speechPitch.toFixed(2)}x
                </span>
              </label>
            </div>

            {speechError ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700">
                {speechError}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
          {profileStatus.error && (
            <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {profileStatus.error}
            </div>
          )}

          {conversationStatus.error && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              {conversationStatus.error}
            </div>
          )}

          {messagesStatus.error && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              {messagesStatus.error}
            </div>
          )}

          {sendError && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              {sendError}
            </div>
          )}

          {clearStatus.error && (
            <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {clearStatus.error}
            </div>
          )}

          {clearStatus.success && (
            <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-600">
              Chat history cleared. A fresh conversation has started.
            </div>
          )}

          {speechError && !voiceStatus.enabled ? (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              {speechError}
            </div>
          ) : null}

          {emptyState ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
              No messages yet. Start the conversation whenever you are ready.
            </div>
          ) : (
            <ul className="space-y-3">
              {orderedMessages.map((message) => {
                const role = message?.role ?? "assistant";
                const isUser = role.toLowerCase() === "user";
                const bubbleClasses = isUser
                  ? "bg-blue-500 text-white"
                  : "bg-gray-100 text-gray-900";
                const isSpeaking =
                  activeSpeechId != null &&
                  message?.id != null &&
                  activeSpeechId === message.id;
                const messageExtras = message?.extrasParsed ?? {};
                const speech = messageExtras?.speech;
                const emotionMeta = normalizeEmotionMeta(
                  messageExtras?.emotion,
                );
                const timestamp = formatTimestamp(message?.created_at);
                return (
                  <li
                    key={getMessageKey(message)}
                    className={`flex items-start gap-3 ${isUser ? "justify-end" : ""}`}
                  >
                    {!isUser ? (
                      agentAvatar ? (
                        <img
                          src={agentAvatar}
                          alt={agentAltText}
                          className="mt-1 h-8 w-8 rounded-full object-cover shadow"
                        />
                      ) : (
                        <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                          {agentInitial}
                        </div>
                      )
                    ) : null}
                    <div
                      className={`flex max-w-[80%] flex-col ${isUser ? "items-end" : "items-start"}`}
                    >
                      <div
                        className={`whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm shadow ${bubbleClasses} ${isSpeaking ? "ring-2 ring-blue-400" : ""}`}
                      >
                        {message?.content ?? ""}
                      </div>
                      <span
                        className={`mt-1 text-xs ${isUser ? "text-right" : "text-left"} text-gray-400`}
                      >
                        {isUser ? "You" : role}
                        {timestamp ? ` - ${timestamp}` : ""}
                        {message?.optimistic ? " - Sending" : ""}
                        {message?.err_msg ? ` | ${message.err_msg}` : ""}
                        {isSpeaking ? " • Speaking" : ""}
                      </span>
                      {!isUser && speech ? (
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
                          <button
                            type="button"
                            onClick={() => handleReplaySpeech(message)}
                            className="flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1 text-[11px] text-gray-600 transition hover:border-blue-400 hover:text-blue-500"
                          >
                            ▶ 重播语音
                          </button>
                          {isSpeaking ? (
                            <button
                              type="button"
                              onClick={stopSpeechPlayback}
                              className="flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1 text-[11px] text-gray-600 transition hover:border-red-400 hover:text-red-500"
                            >
                              ⏹ 停止播报
                            </button>
                          ) : null}
                          {speech?.voice_id ? (
                            <span>音色: {speech.voice_id}</span>
                          ) : null}
                          {emotionMeta?.display_label || emotionMeta?.label ? (
                            <span>
                              情绪:{" "}
                              {emotionMeta?.display_label ?? emotionMeta?.label}
                              {typeof emotionMeta?.intensity === "number"
                                ? ` (${emotionMeta.intensity.toFixed(2)})`
                                : ""}
                            </span>
                          ) : null}
                          {speech?.provider ? (
                            <span>引擎: {speech.provider}</span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    {isUser ? (
                      <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-xs font-medium text-white shadow">
                        You
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <form
          onSubmit={handleSend}
          className="border-t border-white/40 bg-white/80 p-4"
        >
          <div className="flex flex-col gap-3">
            <textarea
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              placeholder={
                userId
                  ? "Type a question or use voice input"
                  : "Loading user context..."
              }
              disabled={!userId || isSending}
              rows={3}
              className="w-full resize-none rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 shadow focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100"
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleVoiceToggle}
                  disabled={!voiceSupported || !userId || isSending}
                  className="flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-600 transition hover:border-blue-400 hover:text-blue-500 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300"
                >
                  <span>
                    {voiceSupported
                      ? isListening
                        ? "Stop voice"
                        : "Voice input"
                      : "Voice unavailable"}
                  </span>
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${isListening ? "bg-green-500" : "bg-gray-300"}`}
                    aria-hidden
                  />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleClearConversation}
                  disabled={clearStatus.loading || !userId}
                  className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-600 transition hover:border-red-400 hover:text-red-500 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300"
                >
                  {clearStatus.loading ? "Clearing..." : "Clear chat"}
                </button>
                <button
                  type="button"
                  onClick={loadMessages}
                  disabled={messagesStatus.loading}
                  className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-600 transition hover:border-blue-400 hover:text-blue-500 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300"
                >
                  Refresh history
                </button>
                <button
                  type="submit"
                  disabled={isSending || !inputValue.trim() || !userId}
                  className="rounded-full bg-blue-500 px-5 py-2 text-sm font-medium text-white shadow transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-blue-300"
                >
                  {isSending ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}
