/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getApiBaseUrl } from "@/lib/api";
import { resolveAssetUrl } from "@/lib/media";
import AgentRatingSummary from "@/components/AgentRatingSummary";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

const API_BASE_URL = getApiBaseUrl();

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
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
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

function formatCallDuration(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds ?? 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const pad = (value) => value.toString().padStart(2, "0");
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
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

const DEFAULT_RATING_SUMMARY = {
  average_score: 0,
  rating_count: 0,
};

const DEFAULT_REVIEWS_PAGE_SIZE = 10;
const MAX_REVIEWS_PAGE_SIZE = 50;

function normalizeRatingSummary(summary) {
  if (!summary || typeof summary !== "object") {
    return { ...DEFAULT_RATING_SUMMARY };
  }
  const avgValue = Number(
    summary.average_score ?? summary.averageScore ?? summary.average ?? 0,
  );
  const countValue = Number(
    summary.rating_count ?? summary.ratingCount ?? summary.count ?? 0,
  );
  const safeAverage = Number.isFinite(avgValue)
    ? Math.round(avgValue * 10) / 10
    : 0;
  const safeCount =
    Number.isFinite(countValue) && countValue > 0 ? Math.floor(countValue) : 0;
  return {
    average_score: safeAverage,
    rating_count: safeCount,
  };
}

function normalizeUserRating(rating) {
  if (!rating || typeof rating !== "object") {
    return null;
  }
  const scoreValue = Number(rating.score ?? rating.Score ?? rating.rating ?? 0);
  if (!Number.isFinite(scoreValue) || scoreValue <= 0) {
    return null;
  }
  const clampedScore = Math.max(1, Math.min(5, Math.round(scoreValue)));
  const commentValue = (() => {
    const raw = rating.comment ?? rating.Comment ?? "";
    if (typeof raw !== "string") {
      return "";
    }
    return raw.trim();
  })();
  return {
    id: rating.id ?? rating.ID ?? null,
    score: clampedScore,
    comment: commentValue,
    updated_at: rating.updated_at ?? rating.updatedAt ?? null,
  };
}

function normalizePeerRating(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const rawScore = Number(
    entry.score ?? entry.Score ?? entry.rating ?? entry.Rating ?? 0,
  );
  if (!Number.isFinite(rawScore) || rawScore <= 0) {
    return null;
  }
  const score = Math.max(1, Math.min(5, Math.round(rawScore)));

  const idValue = entry.id ?? entry.ID ?? entry.rating_id ?? entry.ratingId ?? null;
  const agentIdValue = entry.agent_id ?? entry.agentId ?? null;
  const userIdValue = entry.user_id ?? entry.userId ?? null;

  const commentValue = (() => {
    const raw = entry.comment ?? entry.Comment ?? "";
    return typeof raw === "string" ? raw : "";
  })();

  const createdAtValue =
    entry.created_at ?? entry.createdAt ?? entry.CreatedAt ?? null;
  const updatedAtValue =
    entry.updated_at ?? entry.updatedAt ?? entry.UpdatedAt ?? createdAtValue;

  const displayNameRaw =
    entry.user_display_name ?? entry.userDisplayName ?? entry.display_name ?? "";
  const userDisplayName =
    typeof displayNameRaw === "string" && displayNameRaw.trim()
      ? displayNameRaw.trim()
      : "匿名用户";

  const avatarRaw =
    entry.user_avatar_url ?? entry.userAvatarUrl ?? entry.avatar_url ?? null;
  const userAvatarUrl =
    typeof avatarRaw === "string" && avatarRaw.trim() ? avatarRaw.trim() : null;

  const normalized = {
    id: idValue != null ? String(idValue) : null,
    agentId: agentIdValue != null ? String(agentIdValue) : null,
    userId: userIdValue != null ? String(userIdValue) : null,
    score,
    comment: commentValue,
    createdAt: createdAtValue ?? null,
    updatedAt: updatedAtValue ?? null,
    userDisplayName,
    userAvatarUrl,
  };

  if (!normalized.id) {
    const fallbackKeyParts = [
      normalized.userId ?? "anonymous",
      normalized.updatedAt ?? normalized.createdAt ?? Date.now().toString(),
      normalized.score,
    ];
    normalized.id = fallbackKeyParts.join(":");
  }

  return normalized;
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
  mode = "chat",
  ratingSummary = DEFAULT_RATING_SUMMARY,
  onRatingSummaryChange,
  showRatingButton = true,
  onRatingControllerChange,
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
  const [currentRatingSummary, setCurrentRatingSummary] = useState(() =>
    normalizeRatingSummary(ratingSummary),
  );
  const [userRating, setUserRating] = useState(null);
  const [ratingStatus, setRatingStatus] = useState({
    loading: false,
    error: null,
  });
  const [ratingModalOpen, setRatingModalOpen] = useState(false);
  const [ratingDraft, setRatingDraft] = useState({ score: 5, comment: "" });
  const [ratingSubmitStatus, setRatingSubmitStatus] = useState({
    loading: false,
    error: null,
    success: false,
  });
  const [peerRatings, setPeerRatings] = useState([]);
  const [peerRatingsStatus, setPeerRatingsStatus] = useState({
    loading: false,
    error: null,
    appending: false,
  });
  const [peerRatingsPageInfo, setPeerRatingsPageInfo] = useState({
    page: 1,
    pageSize: DEFAULT_REVIEWS_PAGE_SIZE,
    total: 0,
  });
  const [reviewsModalOpen, setReviewsModalOpen] = useState(false);
  const [peerRatingsFetched, setPeerRatingsFetched] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const ratingControllerRef = useRef(null);
  const peerRatingsPageSizeRef = useRef(DEFAULT_REVIEWS_PAGE_SIZE);
  const recognitionRef = useRef(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    setCurrentRatingSummary(normalizeRatingSummary(ratingSummary));
  }, [ratingSummary]);

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  useEffect(
    () => () => {
      speechRefreshTimersRef.current.forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      speechRefreshTimersRef.current.clear();
    },
    [],
  );
  const isListeningRef = useRef(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [clearStatus, setClearStatus] = useState({
    loading: false,
    error: null,
    success: false,
  });

  const router = useRouter();
  const notifyRatingSummaryChange = useCallback(
    (summary) => {
      if (typeof onRatingSummaryChange === "function") {
        onRatingSummaryChange(summary);
      }
    },
    [onRatingSummaryChange],
  );

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

  const isPhoneMode = mode === "phone";
  const [phoneCallActive, setPhoneCallActive] = useState(false);
  const [phoneCallError, setPhoneCallError] = useState(null);
  const [callStartedAt, setCallStartedAt] = useState(null);
  const [callDurationSeconds, setCallDurationSeconds] = useState(0);
  const [lastHeardText, setLastHeardText] = useState("");
  const [microphoneActive, setMicrophoneActive] = useState(true);
  const phoneVoiceLoopRef = useRef(false);
  const handleVoiceTranscriptRef = useRef(null);

  const hasMorePeerRatings = peerRatings.length < peerRatingsPageInfo.total;
  const isInitialPeerRatingsLoading =
    peerRatingsStatus.loading && peerRatings.length === 0;

  const audioContextRef = useRef(null);
  const speechQueueRef = useRef([]);
  const currentSpeechRef = useRef(null);
  const playedSpeechIdsRef = useRef(new Set());
  const speechAutoPlayRef = useRef(true);
  const messagesRef = useRef([]);
  const speechRefreshTimersRef = useRef(new Map());
  const loadMessagesRef = useRef(() => {});
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

  const startRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      return false;
    }
    if (isListeningRef.current) {
      return true;
    }
    try {
      recognition.start();
      return true;
    } catch (error) {
      console.warn("Speech recognition start failed", error);
      return false;
    }
  }, []);

  const stopRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      return true;
    }
    if (!isListeningRef.current) {
      return true;
    }
    try {
      recognition.stop();
      return true;
    } catch (error) {
      console.warn("Speech recognition stop failed", error);
      return false;
    }
  }, []);

  const speechErrorHandler = useCallback(
    (event) => {
      console.warn("Speech recognition error", event?.error);
      isListeningRef.current = false;
      setIsListening(false);
      if (isPhoneMode && phoneVoiceLoopRef.current) {
        window.setTimeout(() => {
          startRecognition();
        }, 800);
      }
    },
    [isPhoneMode, startRecognition],
  );

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
    recognition.continuous = isPhoneMode;
    recognition.onstart = () => {
      isListeningRef.current = true;
      setIsListening(true);
    };
    recognition.onend = () => {
      isListeningRef.current = false;
      setIsListening(false);
      if (isPhoneMode && phoneVoiceLoopRef.current) {
        window.setTimeout(() => {
          startRecognition();
        }, 400);
      }
    };
    recognition.onerror = speechErrorHandler;
    recognition.onresult = (event) => {
      const transcript = event?.results?.[0]?.[0]?.transcript?.trim();
      if (!transcript) {
        return;
      }
      if (isPhoneMode && phoneVoiceLoopRef.current) {
        const handler = handleVoiceTranscriptRef.current;
        if (handler) {
          handler(transcript);
        }
      } else {
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
      try {
        recognition.stop();
      } catch (error) {
        console.warn("Speech recognition cleanup failed", error);
      }
      recognitionRef.current = null;
      isListeningRef.current = false;
    };
  }, [isPhoneMode, speechErrorHandler, startRecognition]);

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
      const user =
        data && typeof data === "object" ? (data.user ?? data) : null;
      const identifier =
        user?.id ?? user?.ID ?? user?.user_id ?? user?.userId ?? null;

      if (typeof identifier !== "number" && typeof identifier !== "string") {
        throw new Error("Profile response missing id");
      }

      setUserId(String(identifier));
      setProfileStatus({ loading: false, error: null });
    } catch (error) {
      console.error(error);
      setProfileStatus({
        loading: false,
        error: error?.message ?? "Failed to load profile",
      });
    }
  }, [agentId, handleUnauthorizedResponse]);

  const fetchAgentRatings = useCallback(
    async ({ page = 1, append = false, signal } = {}) => {
      if (!agentId) {
        return;
      }

      const shouldUpdateRatingStatus = !append;
      if (shouldUpdateRatingStatus) {
        setRatingStatus({ loading: true, error: null });
      }
      setPeerRatingsStatus({ loading: true, error: null, appending: append });

      try {
        const currentPageSize = Math.min(
          MAX_REVIEWS_PAGE_SIZE,
          Math.max(1, peerRatingsPageSizeRef.current || DEFAULT_REVIEWS_PAGE_SIZE),
        );
        const requestedPage = Math.max(1, Number(page) || 1);
        const url = new URL(`/agents/${agentId}/ratings`, API_BASE_URL);
        url.searchParams.set("page", String(requestedPage));
        url.searchParams.set("page_size", String(currentPageSize));
        if (userId) {
          url.searchParams.set("user_id", String(userId));
        }

        const response = await fetch(url.toString(), {
          method: "GET",
          headers: deriveHeaders(),
          credentials: "include",
          signal,
        });

        if (handleUnauthorizedResponse(response)) {
          if (shouldUpdateRatingStatus) {
            setRatingStatus({ loading: false, error: null });
          }
          setPeerRatingsStatus({ loading: false, error: null, appending: false });
          if (!append) {
            setPeerRatingsFetched(false);
          }
          return;
        }

        if (!response.ok) {
          throw new Error(`Rating fetch failed with ${response.status}`);
        }

        const data = await response.json();

        const summaryNormalized = normalizeRatingSummary(data?.summary);
        setCurrentRatingSummary(summaryNormalized);
        notifyRatingSummaryChange(summaryNormalized);

        const normalizedUserRating = normalizeUserRating(data?.user_rating);
        setUserRating(normalizedUserRating);
        if (normalizedUserRating) {
          setRatingDraft({
            score: normalizedUserRating.score,
            comment: normalizedUserRating.comment ?? "",
          });
        } else if (!append) {
          setRatingDraft((previous) => ({ ...previous, comment: "" }));
        }

        const normalizedList = Array.isArray(data?.ratings)
          ? data.ratings
              .map((item) => normalizePeerRating(item))
              .filter((item) => item != null)
          : [];

        const userIdString =
          typeof userId === "string" ? userId : userId != null ? String(userId) : null;

        setPeerRatings((previous) => {
          const base = append ? [...previous, ...normalizedList] : normalizedList;
          const seen = new Set();
          const deduped = [];
          for (const item of base) {
            if (!item) {
              continue;
            }
            const key =
              item.id ?? `${item.userId ?? "?"}-${item.updatedAt ?? item.createdAt ?? "?"}`;
            if (seen.has(key)) {
              continue;
            }
            seen.add(key);
            deduped.push(item);
          }
          return deduped;
        });

        const totalCountRaw =
          data?.pagination?.total ?? data?.total_count ?? summaryNormalized.rating_count ?? 0;
        const pageSizeRaw =
          data?.pagination?.page_size ?? data?.page_size ?? currentPageSize;
        const pageRaw = data?.pagination?.page ?? requestedPage;

        const normalizedPageSize = (() => {
          const value = Number(pageSizeRaw);
          if (!Number.isFinite(value) || value <= 0) {
            return currentPageSize;
          }
          return Math.min(MAX_REVIEWS_PAGE_SIZE, Math.max(1, Math.floor(value)));
        })();

        peerRatingsPageSizeRef.current = normalizedPageSize;

        const normalizedPage = (() => {
          const value = Number(pageRaw);
          if (!Number.isFinite(value) || value <= 0) {
            return requestedPage;
          }
          return Math.floor(value);
        })();

        const normalizedTotal = (() => {
          const value = Number(totalCountRaw);
          if (!Number.isFinite(value) || value <= 0) {
            return 0;
          }
          return Math.floor(value);
        })();

        setPeerRatingsPageInfo({
          page: normalizedPage,
          pageSize: normalizedPageSize,
          total: normalizedTotal,
        });

        if (!append) {
          setPeerRatingsFetched(true);
        }

        if (shouldUpdateRatingStatus) {
          setRatingStatus({ loading: false, error: null });
        }
        setPeerRatingsStatus({ loading: false, error: null, appending: false });
      } catch (error) {
        if (error?.name === "AbortError") {
          return;
        }
        console.error(error);
        if (shouldUpdateRatingStatus) {
          setRatingStatus({
            loading: false,
            error: error?.message ?? "Failed to load rating",
          });
        }
        setPeerRatingsStatus({
          loading: false,
          error: error?.message ?? "Failed to load rating",
          appending: false,
        });
        if (!append) {
          setPeerRatingsFetched(false);
        }
      }
    },
    [agentId, userId, handleUnauthorizedResponse, notifyRatingSummaryChange],
  );

  useEffect(() => {
    if (!agentId) {
      setPeerRatings([]);
      setPeerRatingsPageInfo({
        page: 1,
        pageSize: DEFAULT_REVIEWS_PAGE_SIZE,
        total: 0,
      });
      setPeerRatingsFetched(false);
      return;
    }

    setPeerRatingsFetched(false);
    const controller = new AbortController();
    fetchAgentRatings({ page: 1, append: false, signal: controller.signal });

    return () => {
      controller.abort();
    };
  }, [agentId, userId, fetchAgentRatings]);

  useEffect(() => {
    if (!reviewsModalOpen) {
      return;
    }
    if (
      !peerRatingsFetched &&
      !peerRatingsStatus.loading &&
      !peerRatingsStatus.error
    ) {
      fetchAgentRatings({ page: 1, append: false });
    }
  }, [
    reviewsModalOpen,
    peerRatingsFetched,
    peerRatingsStatus.loading,
    peerRatingsStatus.error,
    fetchAgentRatings,
  ]);

  const handleOpenRatingModal = useCallback(() => {
    if (ratingStatus.loading) {
      return;
    }
    if (userRating) {
      setRatingDraft({
        score: userRating.score,
        comment: userRating.comment ?? "",
      });
    } else {
      setRatingDraft((previous) => ({
        ...previous,
        score: Math.max(1, Math.min(5, previous.score || 5)),
        comment: "",
      }));
    }
    setRatingSubmitStatus({ loading: false, error: null, success: false });
    setRatingModalOpen(true);
  }, [ratingStatus.loading, userRating]);

  const handleCloseRatingModal = useCallback(() => {
    if (ratingSubmitStatus.loading) {
      return;
    }
    setRatingModalOpen(false);
    setRatingSubmitStatus({ loading: false, error: null, success: false });
  }, [ratingSubmitStatus.loading]);

  const handleOpenReviewsModal = useCallback(() => {
    setReviewsModalOpen(true);
  }, []);

  const handleCloseReviewsModal = useCallback(() => {
    setReviewsModalOpen(false);
  }, []);

  const handleRefreshPeerRatings = useCallback(() => {
    if (peerRatingsStatus.loading && !peerRatingsStatus.appending) {
      return;
    }
    setPeerRatingsFetched(false);
    fetchAgentRatings({ page: 1, append: false });
  }, [
    fetchAgentRatings,
    peerRatingsStatus.loading,
    peerRatingsStatus.appending,
  ]);

  const handleLoadMorePeerRatings = useCallback(() => {
    if (peerRatingsStatus.loading) {
      return;
    }
    if (peerRatings.length >= peerRatingsPageInfo.total) {
      return;
    }
    const nextPage = peerRatingsPageInfo.page + 1;
    fetchAgentRatings({ page: nextPage, append: true });
  }, [fetchAgentRatings, peerRatingsStatus.loading, peerRatings.length, peerRatingsPageInfo.page, peerRatingsPageInfo.total]);

  const handleRatingScoreChange = useCallback((value) => {
    const normalized = Math.max(1, Math.min(5, Number(value) || 5));
    setRatingDraft((previous) => ({ ...previous, score: normalized }));
  }, []);

  const handleRatingCommentChange = useCallback((event) => {
    setRatingDraft((previous) => ({
      ...previous,
      comment: event?.target?.value ?? "",
    }));
  }, []);

  const handleSubmitRating = useCallback(async () => {
    if (!agentId || !userId) {
      setRatingSubmitStatus({
        loading: false,
        error: "登录后才能评分",
        success: false,
      });
      return;
    }
    const score = Math.max(1, Math.min(5, Number(ratingDraft.score) || 5));
    const comment = (ratingDraft.comment ?? "").trim();

    setRatingSubmitStatus({ loading: true, error: null, success: false });
    try {
      const response = await fetch(
        `${API_BASE_URL}/agents/${agentId}/ratings`,
        {
          method: "PUT",
          headers: deriveHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify({
            user_id: Number(userId),
            score,
            comment,
          }),
        },
      );

      if (handleUnauthorizedResponse(response)) {
        setRatingSubmitStatus({
          loading: false,
          error: null,
          success: false,
        });
        return;
      }

      if (!response.ok) {
        throw new Error(`Rating update failed with ${response.status}`);
      }

      const data = await response.json();
      const summaryNormalized = normalizeRatingSummary(data?.summary);
      setCurrentRatingSummary(summaryNormalized);
      notifyRatingSummaryChange(summaryNormalized);
      setRatingStatus({ loading: false, error: null });

      const normalizedUserRating = normalizeUserRating(data?.rating);
      if (normalizedUserRating) {
        setUserRating(normalizedUserRating);
        setRatingDraft({
          score: normalizedUserRating.score,
          comment: normalizedUserRating.comment ?? "",
        });
      } else {
        const fallbackRating = { score, comment };
        setUserRating(fallbackRating);
        setRatingDraft(fallbackRating);
      }

      setRatingSubmitStatus({ loading: false, error: null, success: true });
      setRatingModalOpen(false);
    } catch (error) {
      console.error(error);
      setRatingSubmitStatus({
        loading: false,
        error: error?.message ?? "提交评分失败",
        success: false,
      });
    }
  }, [
    agentId,
    userId,
    ratingDraft.score,
    ratingDraft.comment,
    notifyRatingSummaryChange,
    handleUnauthorizedResponse,
  ]);

  useEffect(() => {
    if (typeof onRatingControllerChange !== "function") {
      ratingControllerRef.current = null;
      return undefined;
    }
    const controller = {
      open: () => {
        handleOpenRatingModal();
      },
      openRatingForm: () => {
        handleOpenRatingModal();
      },
      openReviews: () => {
        handleOpenReviewsModal();
      },
      refreshReviews: () => {
        handleRefreshPeerRatings();
      },
    };
    ratingControllerRef.current = controller;
    onRatingControllerChange(controller);
    return () => {
      ratingControllerRef.current = null;
      onRatingControllerChange(null);
    };
  }, [handleOpenRatingModal, handleOpenReviewsModal, handleRefreshPeerRatings, onRatingControllerChange]);

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

  const scheduleSpeechRefresh = useCallback(
    (messageId, attempt = 0) => {
      if (!messageId || attempt > 5) {
        return;
      }
      const key = String(messageId);
      if (speechRefreshTimersRef.current.has(key)) {
        window.clearTimeout(speechRefreshTimersRef.current.get(key));
      }
      const delay = Math.min(8000, 1500 * (attempt + 1));
      const timerId = window.setTimeout(async () => {
        speechRefreshTimersRef.current.delete(key);
        await loadMessagesRef.current();
        const target = messagesRef.current.find(
          (item) => String(item?.id ?? item?.ID ?? "") === key,
        );
        const extras = target?.extrasParsed ?? null;
        const speech = extras?.speech;
        const status = extras?.speech_status ?? extras?.speechStatus ?? "";
        if (speech && speech.audio_base64) {
          registerSpeech(target, {
            enqueue: true,
            force: true,
            markPlayed: false,
          });
          return;
        }
        if (status === "pending") {
          scheduleSpeechRefresh(messageId, attempt + 1);
        }
      }, delay);
      speechRefreshTimersRef.current.set(key, timerId);
    },
    [registerSpeech],
  );

  const handleAssistantFinal = useCallback(
    (assistantMessage) => {
      if (!assistantMessage) {
        return;
      }
      const extras = assistantMessage.extrasParsed ?? null;
      const speech = extras?.speech;
      const status = extras?.speech_status ?? extras?.speechStatus ?? "";
      if (speech && speech.audio_base64) {
        registerSpeech(assistantMessage);
        return;
      }
      if (status === "pending") {
        const messageId = assistantMessage.id ?? assistantMessage.ID ?? null;
        if (messageId != null) {
          scheduleSpeechRefresh(messageId, 0);
        }
      }
    },
    [registerSpeech, scheduleSpeechRefresh],
  );

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
        normalized.forEach((item) => {
          registerSpeech(item, { enqueue: false, markPlayed: true });
          if ((item.role ?? item.Role ?? "assistant") === "assistant") {
            handleAssistantFinal(item);
          }
        });
        initialMessagesLoadedRef.current = true;
      } else {
        normalized.forEach((item) => {
          registerSpeech(item, { enqueue: true });
          if ((item.role ?? item.Role ?? "assistant") === "assistant") {
            handleAssistantFinal(item);
          }
        });
      }
      setMessagesStatus({ loading: false, error: null });
    } catch (error) {
      console.error(error);
      setMessagesStatus({
        loading: false,
        error: error?.message ?? "Failed to load messages",
      });
    }
  }, [
    agentId,
    userId,
    handleUnauthorizedResponse,
    registerSpeech,
    handleAssistantFinal,
  ]);

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
      await loadMessagesRef.current();

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
      await loadMessagesRef.current();
    })();
  }, [agentId, userId, initializeConversation, loadMessages]);

  const sendChatMessage = useCallback(
    async (rawContent) => {
      const trimmed = typeof rawContent === "string" ? rawContent.trim() : "";
      if (!trimmed) {
        return { success: false, trimmed };
      }
      if (!agentId || !userId) {
        const errorMessage =
          "Missing agent or user information. Please refresh.";
        setSendError(errorMessage);
        return { success: false, trimmed, error: errorMessage };
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
      const optimisticKey = getMessageKey(optimisticMessage);
      setMessages((prev) => [...prev, optimisticMessage]);

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

      const headers = deriveHeaders({
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      });

      const cleanOptimistic = () => {
        setMessages((prev) =>
          prev.filter((item) => getMessageKey(item) !== optimisticKey),
        );
      };

      try {
        const response = await fetch(`${API_BASE_URL}/llm/messages`, {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify(payload),
        });

        if (handleUnauthorizedResponse(response)) {
          cleanOptimistic();
          return { success: false, trimmed, error: "unauthorized" };
        }

        const contentType = (
          response.headers.get("Content-Type") ?? ""
        ).toLowerCase();

        if (!response.ok) {
          throw new Error(`Send failed with status ${response.status}`);
        }

        let lastAssistant = null;

        const ensureConversationId = (value) => {
          if (!value) {
            return;
          }
          setConversationId(String(value));
        };

        const upsertAssistantMessage = (record, { markFinal } = {}) => {
          const normalized = normalizeMessage(record);
          if (!normalized) {
            return;
          }
          lastAssistant = normalized;
          setMessages((prev) => {
            let replaced = false;
            const updated = prev.map((item) => {
              if (
                String(item?.id ?? item?.ID ?? item?.clientId ?? "") ===
                String(normalized.id ?? normalized.ID ?? "")
              ) {
                replaced = true;
                return normalized;
              }
              if (getMessageKey(item) === optimisticKey) {
                return normalized;
              }
              return item;
            });
            if (!replaced) {
              updated.push(normalized);
            }
            return updated;
          });
          if (markFinal) {
            handleAssistantFinal(normalized);
          }
        };

        const applyAssistantDelta = (messageId, content) => {
          if (!messageId) {
            return;
          }
          setMessages((prev) =>
            prev.map((item) => {
              if (String(item?.id ?? item?.ID ?? "") === String(messageId)) {
                return { ...item, content };
              }
              return item;
            }),
          );
        };

        const replaceUserMessage = (record) => {
          const normalized = normalizeMessage(record);
          if (!normalized) {
            return;
          }
          setMessages((prev) => {
            let replaced = false;
            const updated = prev.map((item) => {
              if (getMessageKey(item) === optimisticKey) {
                replaced = true;
                return normalized;
              }
              if (
                normalized.id != null &&
                String(item?.id ?? item?.ID ?? "") === String(normalized.id)
              ) {
                replaced = true;
                return normalized;
              }
              return item;
            });
            if (!replaced) {
              updated.push(normalized);
            }
            return updated;
          });
        };

        const handleStreamEvent = (eventName, payload) => {
          if (payload && typeof payload === "object") {
            ensureConversationId(
              payload.conversation_id ?? payload.ConversationID ?? null,
            );
          }

          switch (eventName) {
            case "user_message": {
              replaceUserMessage(payload ?? optimisticMessage);
              break;
            }
            case "assistant_placeholder": {
              upsertAssistantMessage(payload);
              break;
            }
            case "assistant_delta": {
              const targetId = payload?.id ?? payload?.ID ?? null;
              const full =
                typeof payload?.full === "string" ? payload.full : "";
              if (targetId && full) {
                applyAssistantDelta(targetId, full);
              }
              break;
            }
            case "assistant_message": {
              upsertAssistantMessage(payload, { markFinal: true });
              break;
            }
            case "error": {
              const message =
                typeof payload?.error === "string" && payload.error
                  ? payload.error
                  : "Assistant response failed.";
              setSendError(message);
              break;
            }
            default:
              break;
          }
        };

        if (contentType.includes("text/event-stream") && response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) {
                break;
              }
              buffer += decoder.decode(value, { stream: true });
              buffer = buffer.replace(/\r\n/g, "\n");
              let boundary = buffer.indexOf("\n\n");
              while (boundary !== -1) {
                const rawEvent = buffer.slice(0, boundary);
                buffer = buffer.slice(boundary + 2);
                boundary = buffer.indexOf("\n\n");
                const trimmed = rawEvent.trim();
                if (!trimmed) {
                  continue;
                }
                const lines = trimmed.split("\n");
                let eventName = "message";
                const dataLines = [];
                for (const line of lines) {
                  if (line.startsWith("event:")) {
                    eventName = line.slice(6).trim();
                  } else if (line.startsWith("data:")) {
                    dataLines.push(line.slice(5).trim());
                  }
                }
                const dataText = dataLines.join("\n");
                let parsed = null;
                if (dataText) {
                  try {
                    parsed = JSON.parse(dataText);
                  } catch (error) {
                    console.warn("Failed to parse SSE payload", error);
                  }
                }
                handleStreamEvent(eventName, parsed);
              }
            }
            buffer = buffer.replace(/\r\n/g, "\n");
            if (buffer.trim()) {
              const lines = buffer.trim().split("\n");
              let eventName = "message";
              const dataLines = [];
              for (const line of lines) {
                if (line.startsWith("event:")) {
                  eventName = line.slice(6).trim();
                } else if (line.startsWith("data:")) {
                  dataLines.push(line.slice(5).trim());
                }
              }
              const dataText = dataLines.join("\n");
              let parsed = null;
              if (dataText) {
                try {
                  parsed = JSON.parse(dataText);
                } catch (error) {
                  console.warn("Failed to parse trailing SSE payload", error);
                }
              }
              handleStreamEvent(eventName, parsed);
            }
          } finally {
            reader.releaseLock();
          }

          cleanOptimistic();
          return { success: true, trimmed, assistant: lastAssistant };
        }

        const data = await response.json().catch(() => null);
        if (data?.conversation_id) {
          setConversationId(String(data.conversation_id));
        }

        const normalizedUser =
          normalizeMessage(data?.user_message) ??
          normalizeMessage(optimisticMessage);
        const normalizedAssistant = normalizeMessage(data?.assistant_message);

        cleanOptimistic();
        setMessages((prev) => {
          const next = [...prev];
          if (normalizedUser) {
            let replaced = false;
            for (let index = 0; index < next.length; index += 1) {
              if (getMessageKey(next[index]) === optimisticKey) {
                next[index] = normalizedUser;
                replaced = true;
                break;
              }
            }
            if (!replaced) {
              next.push(normalizedUser);
            }
          }
          if (normalizedAssistant) {
            let found = false;
            for (let index = 0; index < next.length; index += 1) {
              if (
                String(next[index]?.id ?? next[index]?.ID ?? "") ===
                String(normalizedAssistant.id ?? normalizedAssistant.ID ?? "")
              ) {
                next[index] = normalizedAssistant;
                found = true;
                break;
              }
            }
            if (!found) {
              next.push(normalizedAssistant);
            }
          }
          return next;
        });

        handleAssistantFinal(normalizedAssistant);

        if (data?.assistant_error) {
          setSendError(data.assistant_error);
        }

        return {
          success: true,
          trimmed,
          assistant: normalizedAssistant ?? lastAssistant,
        };
      } catch (error) {
        console.error(error);
        const message = error?.message ?? "Failed to send message";
        setSendError(message);
        cleanOptimistic();
        return { success: false, trimmed, error: message };
      } finally {
        setIsSending(false);
      }
    },
    [
      agentId,
      userId,
      selectedVoice,
      voiceStatus.defaultVoice,
      speechSpeed,
      speechPitch,
      emotionHint,
      selectedVoiceOption,
      handleUnauthorizedResponse,
      handleAssistantFinal,
    ],
  );

  useEffect(() => {
    loadMessagesRef.current = loadMessages;
  }, [loadMessages]);

  const handleSend = useCallback(
    async (event) => {
      event?.preventDefault?.();
      const trimmed = inputValue.trim();
      if (!trimmed) {
        return;
      }
      setInputValue("");
      const result = await sendChatMessage(trimmed);
      if (!result.success) {
        setInputValue(result.trimmed ?? trimmed);
      }
    },
    [inputValue, sendChatMessage],
  );

  const handleVoiceToggle = useCallback(() => {
    if (isListeningRef.current) {
      stopRecognition();
      if (isPhoneMode) {
        setMicrophoneActive(false);
      }
    } else {
      const started = startRecognition();
      if (started && isPhoneMode) {
        setMicrophoneActive(true);
      }
    }
  }, [isPhoneMode, startRecognition, stopRecognition]);

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

  const handleVoiceTranscript = useCallback(
    async (transcript) => {
      if (!isPhoneMode) {
        return;
      }
      const trimmed = typeof transcript === "string" ? transcript.trim() : "";
      if (!trimmed) {
        return;
      }
      setLastHeardText(trimmed);
      const result = await sendChatMessage(trimmed);
      if (!result.success) {
        setPhoneCallError(result.error ?? "语音发送失败，请重试");
      } else {
        setPhoneCallError(null);
      }
    },
    [isPhoneMode, sendChatMessage],
  );

  useEffect(() => {
    handleVoiceTranscriptRef.current = handleVoiceTranscript;
    return () => {
      handleVoiceTranscriptRef.current = null;
    };
  }, [handleVoiceTranscript]);

  useEffect(() => {
    phoneVoiceLoopRef.current =
      isPhoneMode && phoneCallActive && microphoneActive;
  }, [isPhoneMode, phoneCallActive, microphoneActive]);

  useEffect(() => {
    if (!isPhoneMode) {
      setPhoneCallActive(false);
      setCallStartedAt(null);
      setCallDurationSeconds(0);
      setLastHeardText("");
      setPhoneCallError(null);
      setMicrophoneActive(true);
      phoneVoiceLoopRef.current = false;
      return;
    }
  }, [isPhoneMode]);

  useEffect(() => {
    if (!phoneCallActive) {
      setLastHeardText("");
    }
  }, [phoneCallActive]);

  useEffect(() => {
    if (!isPhoneMode) {
      return;
    }
    if (phoneCallActive && microphoneActive) {
      if (!isListeningRef.current) {
        startRecognition();
      }
    } else if (isListeningRef.current) {
      stopRecognition();
    }
  }, [
    isPhoneMode,
    phoneCallActive,
    microphoneActive,
    startRecognition,
    stopRecognition,
  ]);

  useEffect(() => {
    if (!isPhoneMode || !phoneCallActive || !callStartedAt) {
      if (!phoneCallActive) {
        setCallDurationSeconds(0);
      }
      return;
    }
    const tick = () => {
      setCallDurationSeconds(
        Math.max(0, Math.floor((Date.now() - callStartedAt) / 1000)),
      );
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [isPhoneMode, phoneCallActive, callStartedAt]);

  const startPhoneCall = useCallback(() => {
    if (!isPhoneMode || phoneCallActive) {
      return;
    }
    if (!voiceSupported) {
      setPhoneCallError("无法启动语音识别，请检查麦克风权限");
      return;
    }
    setPhoneCallError(null);
    setMicrophoneActive(true);
    setCallDurationSeconds(0);
    setCallStartedAt(Date.now());
    setPhoneCallActive(true);
    phoneVoiceLoopRef.current = true;
    const started = startRecognition();
    if (!started) {
      setPhoneCallError("无法启动语音识别，请检查麦克风权限");
      setPhoneCallActive(false);
      phoneVoiceLoopRef.current = false;
      setCallStartedAt(null);
    }
  }, [isPhoneMode, phoneCallActive, voiceSupported, startRecognition]);

  const stopPhoneCall = useCallback(() => {
    if (!phoneCallActive) {
      return;
    }
    setPhoneCallActive(false);
    phoneVoiceLoopRef.current = false;
    setCallStartedAt(null);
    setCallDurationSeconds(0);
    setLastHeardText("");
    setPhoneCallError(null);
    setMicrophoneActive(true);
    stopRecognition();
    stopSpeechPlayback();
  }, [phoneCallActive, stopRecognition, stopSpeechPlayback]);

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
              {isPhoneMode
                ? `语音模式${agent?.name ? ` - ${agent.name}` : ""}`
                : `${agent?.name ? `  ${agent.name}` : ""}`}
            </h2>
            
            {/* <p className="text-xs text-gray-500">
              {isPhoneMode
                ? "通过语音实时与智能体通话，Live2D 会同步表现情绪。"
                : "Browse historical messages and craft new prompts with text or voice."}
            </p> */}
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
              <span>
                Live2D:{" "}
                {live2DReady
                  ? "已就绪"
                  : live2DStatus === "error"
                    ? "加载失败"
                    : (live2DStatus ?? "加载中")}
              </span>
              {live2DError ? (
                <span className="text-red-400">{live2DError}</span>
              ) : null}
              {voiceStatus.loading ? <span>语音配置加载中...</span> : null}
              {voiceStatus.error ? (
                <span className="text-red-400">{voiceStatus.error}</span>
              ) : null}
              {isPhoneMode ? (
                <>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${phoneCallActive ? "bg-emerald-100 text-emerald-600" : "bg-gray-100 text-gray-500"}`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${phoneCallActive ? "bg-emerald-500" : "bg-gray-400"}`}
                      aria-hidden
                    />
                    {phoneCallActive ? "通话中" : "待命"}
                  </span>
                  <span>
                    {phoneCallActive
                      ? `时长 ${formatCallDuration(callDurationSeconds)}`
                      : "尚未开始通话"}
                  </span>
                  <span>
                    麦克风:{" "}
                    {voiceSupported
                      ? microphoneActive
                        ? isListening
                          ? "识别中"
                          : "待命"
                        : "已静音"
                      : "不可用"}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-gray-500">
          {!isPhoneMode ? (
            <Link
              href={`/smart/${agentId ?? ""}/phone`}
              className="rounded-full border border-blue-200 px-4 py-2 text-xs font-medium text-blue-600 transition hover:border-blue-400 hover:text-blue-500"
            >
              语音模式
            </Link>
          ) : (
            <Link
              href={`/smart/${agentId ?? ""}`}
              className="rounded-full border border-blue-200 px-4 py-2 text-xs font-medium text-blue-600 transition hover:border-blue-400 hover:text-blue-500"
            >
              返回聊天
            </Link>
          )}
          {messagesStatus.loading && <span>Syncing...</span>}
          {messagesStatus.error && !messagesStatus.loading ? (
            <span className="text-red-500">{messagesStatus.error}</span>
          ) : null}
        </div>
      </header>
      {voiceStatus.enabled ? (
        <div className="border-t border-white/40 bg-white/80">
          <div className="space-y-3 px-4 pb-4">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2">
                <span className="text-gray-500">音色</span>
                <select
                  className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs focus:border-blue-400 focus:outline-none"
                  value={selectedVoice || ""}
                  onChange={(event) => {
                    const nextVoice = event.target.value;
                    userSelectedVoiceRef.current = true;
                    setSelectedVoice(nextVoice);
                    setSpeechError(null);
                  }}
                  disabled={voiceStatus.loading || voiceOptions.length === 0}
                >
                  {voiceOptions.length === 0 ? (
                    <option value="">暂无可用音色</option>
                  ) : (
                    voiceOptions.map((option) => {
                      const value = option?.id;
                      if (value == null) {
                        return null;
                      }
                      const label =
                        option?.display_name ??
                        option?.displayName ??
                        option?.name ??
                        option?.nickname ??
                        String(value);
                      return (
                        <option key={String(value)} value={String(value)}>
                          {label}
                        </option>
                      );
                    })
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
                            onClick={() => handleReplaySpeech(message)}
                            className="flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1 text-[11px] text-gray-600 transition hover:border-blue-400 hover:text-blue-500"
                            type="button"
                          >
                            ▶ 重播语音
                          </button>
                          {isSpeaking ? (
                            <button
                              onClick={stopSpeechPlayback}
                              className="flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1 text-[11px] text-gray-600 transition hover-border-red-400 hover:text-red-500"
                              type="button"
                            >
                              ■ 停止播放
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
                            <span>来源: {speech.provider}</span>
                          ) : null}
                        </div>
                      ) : null}

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

        {isPhoneMode ? (
          <div className="border-t border-white/40 bg-white/80 p-4">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={phoneCallActive ? stopPhoneCall : startPhoneCall}
                  className={`rounded-full px-5 py-2 text-sm font-medium text-white shadow transition ${phoneCallActive ? "bg-red-500 hover:bg-red-600" : "bg-blue-500 hover:bg-blue-600"}`}
                >
                  {phoneCallActive ? "挂断" : "开始通话"}
                </button>
                <button
                  onClick={handleVoiceToggle}
                  disabled={!voiceSupported || !phoneCallActive || isSending}
                  className="flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-600 transition hover:border-blue-400 hover:text-blue-500 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300"
                >
                  <span>
                    {voiceSupported
                      ? microphoneActive
                        ? isListening
                          ? "暂停识别"
                          : "恢复识别"
                        : "恢复识别"
                      : "语音不可用"}
                  </span>
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${isListening ? "bg-green-500" : "bg-gray-300"}`}
                    aria-hidden
                  />
                </button>
                <button
                  onClick={loadMessages}
                  disabled={messagesStatus.loading}
                  className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-600 transition hover:border-blue-400 hover:text-blue-500 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300"
                >
                  刷新记录
                </button>
                <button
                  onClick={handleClearConversation}
                  disabled={clearStatus.loading || !userId}
                  className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-600 transition hover:border-red-400 hover:text-red-500 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300"
                >
                  {clearStatus.loading ? "清空中..." : "清空记录"}
                </button>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white/70 px-4 py-3 text-xs text-gray-500">
                {phoneCallError ? (
                  <span className="text-red-500">{phoneCallError}</span>
                ) : phoneCallActive ? (
                  lastHeardText ? (
                    <span>上次识别：{lastHeardText}</span>
                  ) : (
                    <span>正在监听，请直接讲话。</span>
                  )
                ) : (
                  <span>点击“开始通话”以激活麦克风并进入语音交流。</span>
                )}
              </div>
            </div>
          </div>
        ) : (
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
                    onClick={handleClearConversation}
                    disabled={clearStatus.loading || !userId}
                    className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-600 transition hover:border-red-400 hover:text-red-500 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300"
                  >
                    {clearStatus.loading ? "Clearing..." : "Clear chat"}
                  </button>
                  <button
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
        )}
      </div>
      {isMounted && reviewsModalOpen
        ? createPortal(
            <div className="fixed inset-0 z-[990] flex items-center justify-center bg-slate-900/60 px-4">
              <div className="flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white p-6 shadow-2xl">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">用户评价</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      看看大家对这个智能体的真实反馈。
                    </p>
                  </div>
                  <button
                    onClick={handleCloseReviewsModal}
                    className="rounded-full border border-gray-200 p-1.5 text-gray-500 transition hover:border-gray-300 hover:text-gray-700"
                    aria-label="关闭评价列表"
                  >
                    <span className="block h-5 w-5 text-center">×</span>
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <AgentRatingSummary
                    average={currentRatingSummary.average_score}
                    count={currentRatingSummary.rating_count}
                    size="md"
                    className="w-fit"
                  />
                  <button
                    onClick={handleRefreshPeerRatings}
                    disabled={peerRatingsStatus.loading && !peerRatingsStatus.appending}
                    className="rounded-full border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 transition hover:border-gray-300 hover:text-gray-800 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300"
                  >
                    {peerRatingsStatus.loading && !peerRatingsStatus.appending
                      ? "刷新中..."
                      : "刷新"}
                  </button>
                </div>

                {peerRatingsStatus.error ? (
                  <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-600">
                    {peerRatingsStatus.error}
                  </div>
                ) : null}

                <div className="mt-4 flex-1 overflow-y-auto pr-1">
                  {isInitialPeerRatingsLoading ? (
                    <div className="py-10 text-center text-sm text-gray-500">加载中...</div>
                  ) : peerRatings.length === 0 ? (
                    <div className="py-10 text-center text-sm text-gray-500">
                      暂时还没有其他用户的评价。
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4">
                      {peerRatings.map((item) => {
                        const avatarSrc = item?.userAvatarUrl
                          ? resolveAssetUrl(item.userAvatarUrl)
                          : "";
                        const displayName = item?.userDisplayName ?? "匿名用户";
                        const timestamp = formatTimestamp(
                          item?.updatedAt ?? item?.createdAt,
                        );
                        return (
                          <div
                            key={item.id}
                            className="rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm"
                          >
                            <div className="flex items-start gap-3">
                              {avatarSrc ? (
                                <img
                                  src={avatarSrc}
                                  alt={`${displayName} 头像`}
                                  className="h-10 w-10 rounded-full object-cover"
                                />
                              ) : (
                                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-sm font-medium text-amber-600">
                                  {displayName.slice(0, 1)}
                                </span>
                              )}
                              <div className="flex-1">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-gray-900">
                                      {displayName}
                                    </span>
                                    <div className="flex items-center gap-1">
                                      {[1, 2, 3, 4, 5].map((value) => (
                                        <svg
                                          key={value}
                                          viewBox="0 0 24 24"
                                          className={`h-4 w-4 ${
                                            value <= (item?.score ?? 0)
                                              ? "text-amber-500"
                                              : "text-gray-200"
                                          }`}
                                          fill="currentColor"
                                          aria-hidden
                                        >
                                          <path d="M12 2.5l2.89 6.02 6.67.55-5.04 4.46 1.5 6.47L12 16.96l-6.02 3.04 1.5-6.47-5.04-4.46 6.67-.55L12 2.5z" />
                                        </svg>
                                      ))}
                                      <span className="text-xs font-medium text-amber-600">
                                        {item?.score ?? 0}
                                      </span>
                                    </div>
                                  </div>
                                  <span className="text-xs text-gray-400">
                                    {timestamp || "刚刚"}
                                  </span>
                                </div>
                                <p className="mt-2 whitespace-pre-line text-sm text-gray-600">
                                  {item?.comment && item.comment.trim()
                                    ? item.comment.trim()
                                    : "该用户未留下文字评价。"}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs text-gray-400">
                    已显示 {peerRatings.length} 条 / 共 {peerRatingsPageInfo.total} 条
                  </span>
                  {hasMorePeerRatings ? (
                    <button
                      onClick={handleLoadMorePeerRatings}
                      disabled={peerRatingsStatus.loading}
                      className="rounded-full border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 transition hover:border-gray-300 hover:text-gray-800 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300"
                    >
                      {peerRatingsStatus.loading && peerRatingsStatus.appending
                        ? "加载中..."
                        : "加载更多"}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
      {isMounted && ratingModalOpen
        ? createPortal(
            <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 px-4">
              <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      为智能体打分
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      请选择 1-5 分并留下反馈意见，稍后可继续修改。
                    </p>
                  </div>
                  <button
                    onClick={handleCloseRatingModal}
                    className="rounded-full border border-gray-200 p-1.5 text-gray-500 transition hover:border-gray-300 hover:text-gray-700"
                    aria-label="关闭评分弹窗"
                  >
                    <span className="block h-5 w-5 text-center">×</span>
                  </button>
                </div>

                <div className="mt-4 flex flex-col gap-5">
                  <AgentRatingSummary
                    average={currentRatingSummary.average_score}
                    count={currentRatingSummary.rating_count}
                    size="md"
                    className="w-fit"
                  />

                  <div className="flex flex-col items-center gap-3">
                    <div className="flex items-center justify-center gap-2">
                      {[1, 2, 3, 4, 5].map((value) => {
                        const active = ratingDraft.score >= value;
                        return (
                          <button
                            key={value}
                            onClick={() => handleRatingScoreChange(value)}
                            className={`flex h-10 w-10 items-center justify-center rounded-full border transition ${
                              active
                                ? "border-amber-400 bg-amber-50 text-amber-600"
                                : "border-gray-200 bg-gray-50 text-gray-400"
                            }`}
                            aria-label={`${value} 分`}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              className={`h-5 w-5 ${active ? "text-amber-500" : "text-gray-300"}`}
                              fill="currentColor"
                              aria-hidden
                            >
                              <path d="M12 2.5l2.89 6.02 6.67.55-5.04 4.46 1.5 6.47L12 16.96l-6.02 3.04 1.5-6.47-5.04-4.46 6.67-.55L12 2.5z" />
                            </svg>
                          </button>
                        );
                      })}
                    </div>
                    <span className="text-sm text-gray-500">
                      当前选择：{ratingDraft.score} 分
                    </span>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label
                      className="text-sm font-medium text-gray-700"
                      htmlFor="agent-rating-comment"
                    >
                      留下反馈（可选）
                    </label>
                    <textarea
                      id="agent-rating-comment"
                      value={ratingDraft.comment}
                      onChange={handleRatingCommentChange}
                      rows={4}
                      maxLength={500}
                      placeholder="告诉我们这个智能体的表现如何..."
                      className="w-full resize-none rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 shadow focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                    />
                    <span className="self-end text-[11px] text-gray-400">
                      {(ratingDraft.comment ?? "").length}/500
                    </span>
                  </div>

                  {ratingSubmitStatus.error ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-600">
                      {ratingSubmitStatus.error}
                    </div>
                  ) : null}

                  <div className="flex justify-end gap-3">
                    <button
                      onClick={handleCloseRatingModal}
                      className="rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:border-gray-300 hover:text-gray-800"
                      disabled={ratingSubmitStatus.loading}
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSubmitRating}
                      disabled={ratingSubmitStatus.loading || !userId}
                      className="rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-white shadow transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-amber-300"
                    >
                      {ratingSubmitStatus.loading ? "提交中..." : "提交评分"}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}


