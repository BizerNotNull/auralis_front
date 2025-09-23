/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

export default function ChatPanel({ agentId, agent }) {
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

  const agentAvatar = agent?.avatar_url ?? agent?.avatarUrl ?? "";
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
  }, [agentId]);

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
      if (initialMessages.length > 0) {
        setMessages(initialMessages);
      }
      setConversationStatus({ loading: false, error: null });
    } catch (error) {
      console.error(error);
      setConversationStatus({
        loading: false,
        error: error?.message ?? "Failed to initialise conversation",
      });
    }
  }, [agentId, userId]);

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

      if (!response.ok) {
        throw new Error(`Messages request failed with ${response.status}`);
      }

      const data = await response.json();
      const items = Array.isArray(data)
        ? data
        : Array.isArray(data?.messages)
          ? data.messages
          : [];
      setMessages(items);
      setMessagesStatus({ loading: false, error: null });
    } catch (error) {
      console.error(error);
      setMessagesStatus({
        loading: false,
        error: error?.message ?? "Failed to load messages",
      });
    }
  }, [agentId, userId]);

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
      const response = await fetch(`${API_BASE_URL}/agents/${agentId}/conversations`, {
        method: "DELETE",
        headers: deriveHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ user_id: numericUserId }),
      });

      if (!response.ok && response.status !== 204) {
        throw new Error(`Clear conversation failed with ${response.status}`);
      }

      setMessages([]);
      setConversationId(null);
      setInputValue("");
      setSendError(null);

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
  }, [agentId, userId, initializeConversation, loadMessages]);

  useEffect(() => {
    (async () => {
      await loadProfile();
    })();
  }, [loadProfile]);

  useEffect(() => {
    setMessages([]);
    setConversationId(null);
    setClearStatus({ loading: false, error: null, success: false });
  }, [agentId]);

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
        role: "user",
        content: trimmed,
        created_at: new Date().toISOString(),
        optimistic: true,
      };
      setMessages((prev) => [...prev, optimisticMessage]);
      setInputValue("");

      try {
        const response = await fetch(`${API_BASE_URL}/llm/messages`, {
          method: "POST",
          headers: deriveHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify({
            agent_id: agentId,
            user_id: userId,
            role: "user",
            content: trimmed,
          }),
        });

        if (!response.ok) {
          throw new Error(`Send failed with status ${response.status}`);
        }

        const data = await response.json();
        if (data?.conversation_id) {
          setConversationId(String(data.conversation_id));
        }

        setMessages((prev) => {
          const withoutOptimistic = prev.filter(
            (item) => item.id !== optimisticMessage.id,
          );
          const next = [...withoutOptimistic];
          if (data?.user_message) {
            next.push(data.user_message);
          }
          if (data?.assistant_message) {
            next.push(data.assistant_message);
          }
          return next;
        });

        if (!data?.assistant_message) {
          await loadMessages();
        }

        if (data?.assistant_error) {
          setSendError(data.assistant_error);
        }
      } catch (error) {
        console.error(error);
        setSendError(error?.message ?? "Failed to send message");
        setMessages((prev) =>
          prev.filter((item) => item.id !== optimisticMessage.id),
        );
        setInputValue(trimmed);
      } finally {
        setIsSending(false);
      }
    },
    [agentId, userId, inputValue, loadMessages],
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

  const orderedMessages = useMemo(() => {
    return [...messages].sort((a, b) => {
      const aTime = new Date(a?.created_at ?? a?.createdAt ?? 0).getTime();
      const bTime = new Date(b?.created_at ?? b?.createdAt ?? 0).getTime();
      return aTime - bTime;
    });
  }, [messages]);

  const emptyState =
    !messagesStatus.loading &&
    !conversationStatus.loading &&
    orderedMessages.length === 0;

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
              Browse historical messages and craft new prompts with text or voice.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {messagesStatus.loading && <span>Syncing...</span>}
          {messagesStatus.error && !messagesStatus.loading ? (
            <span className="text-red-500">{messagesStatus.error}</span>
          ) : null}
        </div>
      </header>

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
                return (
                  <li
                    key={
                      message?.id ??
                      `${message.role}-${message.created_at}-${Math.random()}`
                    }
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
                        className={`whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm shadow ${bubbleClasses}`}
                      >
                        {message?.content ?? ""}
                      </div>
                      <span className={`mt-1 text-xs ${isUser ? "text-right" : "text-left"} text-gray-400`}>
                        {isUser ? "You" : role}
                        {formatTimestamp(
                          message?.created_at ?? message?.createdAt,
                        )
                          ? ` - ${formatTimestamp(message?.created_at ?? message?.createdAt)}`
                          : ""}
                        {message?.optimistic ? " - Sending" : ""}
                        {message?.err_msg ? ` | ${message.err_msg}` : ""}
                      </span>
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
            <div className="flex items-center justify-between gap-3">
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
              <div className="flex items-center gap-2">
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



