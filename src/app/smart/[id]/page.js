"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Live2DContainer from "@/components/Live2DContainer";
import ChatPanel from "@/components/chat/ChatPanel";
import AgentRatingSummary from "@/components/AgentRatingSummary";
import { getApiBaseUrl } from "@/lib/api";
import { resolveAssetUrl } from "@/lib/media";

const API_BASE_URL = getApiBaseUrl();
const YUMI_MODEL_URL = "/yumi/yumi.model3.json";

export default function SmartPage() {
  const params = useParams();
  const paramsId = params?.id;
  const smartId = Array.isArray(paramsId) ? paramsId[0] : paramsId;
  const agentId =
    typeof smartId === "string" ? smartId : (smartId?.toString?.() ?? "");

  const [agentData, setAgentData] = useState(null);
  const [agentStatus, setAgentStatus] = useState({
    loading: false,
    error: null,
  });
  const [ratingSummary, setRatingSummary] = useState({
    average_score: 0,
    rating_count: 0,
  });
  const ratingControllerRef = useRef(null);
  const [ratingControllerReady, setRatingControllerReady] = useState(false);

  const live2DRef = useRef(null);
  const [live2DStatus, setLive2DStatus] = useState("init");
  const [live2DError, setLive2DError] = useState(null);

  const handleLive2DStatusChange = useCallback((status, errorMessage) => {
    setLive2DStatus(status);
    setLive2DError(errorMessage ?? null);
  }, []);

  useEffect(() => {
    if (!agentId) {
      return;
    }
    let aborted = false;
    setLive2DStatus("init");
    setLive2DError(null);
    setAgentStatus({ loading: true, error: null });
    (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/agents/${agentId}`, {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`Agent request failed with ${response.status}`);
        }
        const data = await response.json();
        if (!aborted) {
          setAgentData(data);
          setAgentStatus({ loading: false, error: null });
        }
      } catch (error) {
        if (!aborted) {
          console.error(error);
          setAgentStatus({
            loading: false,
            error: error?.message ?? "Failed to load agent",
          });
        }
      }
    })();

    return () => {
      aborted = true;
    };
  }, [agentId]);

  const agent = agentData?.agent ?? null;

  useEffect(() => {
    if (agent) {
      const avgValue = Number(
        agent?.average_rating ?? agent?.averageRating ?? 0,
      );
      const countValue = Number(agent?.rating_count ?? agent?.ratingCount ?? 0);
      setRatingSummary({
        average_score: Number.isFinite(avgValue)
          ? Math.round(avgValue * 10) / 10
          : 0,
        rating_count:
          Number.isFinite(countValue) && countValue > 0
            ? Math.floor(countValue)
            : 0,
      });
    } else {
      setRatingSummary({
        average_score: 0,
        rating_count: 0,
      });
    }
  }, [agent]);

  const handleRatingSummaryChange = useCallback(
    (summary) => {
      const avgValue = Number(
        summary?.average_score ?? summary?.averageScore ?? 0,
      );
      const countValue = Number(
        summary?.rating_count ?? summary?.ratingCount ?? 0,
      );
      const normalized = {
        average_score: Number.isFinite(avgValue)
          ? Math.round(avgValue * 10) / 10
          : 0,
        rating_count:
          Number.isFinite(countValue) && countValue > 0
            ? Math.floor(countValue)
            : 0,
      };
      setRatingSummary(normalized);
      setAgentData((previous) => {
        if (!previous?.agent) {
          return previous;
        }
        return {
          ...previous,
          agent: {
            ...previous.agent,
            average_rating: normalized.average_score,
            rating_count: normalized.rating_count,
          },
        };
      });
    },
    [setAgentData],
  );

  const handleRatingControllerChange = useCallback((controller) => {
    ratingControllerRef.current = controller;
    setRatingControllerReady(Boolean(controller?.open));
  }, []);

  const handleOpenRatingModalFromHeader = useCallback(() => {
    ratingControllerRef.current?.open?.();
  }, []);

  const agentName = agent?.name ? agent.name : agentId || "Unknown";
  const agentDescription = useMemo(() => {
    const intro = agent?.one_sentence_intro ?? agent?.oneSentenceIntro ?? "";
    if (typeof intro === "string" && intro.trim()) {
      return intro.trim();
    }
    return "自动智能体正在等待主人的介绍。";
  }, [agent?.one_sentence_intro, agent?.oneSentenceIntro]);

  const live2DModelRaw = agent?.live2d_model_id
    ? agent.live2d_model_id
    : YUMI_MODEL_URL;

  const live2DModel = useMemo(() => {
    if (!live2DModelRaw) {
      return "";
    }
    return resolveAssetUrl(live2DModelRaw);
  }, [live2DModelRaw]);

  useEffect(() => {
    setLive2DStatus("init");
    setLive2DError(null);
  }, [live2DModel]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 py-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6">
        <header className="flex flex-col gap-2 text-gray-700">
          <span className="text-sm uppercase tracking-wide text-gray-400">
            Smart Agent
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">
              {agentName ? `智能体：${agentName}` : "智能体"}
            </h1>
            <button
              type="button"
              onClick={handleOpenRatingModalFromHeader}
              disabled={!ratingControllerReady}
              className="rounded-full border border-amber-200 px-4 py-1.5 text-sm font-medium text-amber-600 transition hover:border-amber-300 hover:text-amber-500 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300"
            >
              评价智能体
            </button>
          </div>
          <p className="text-sm text-gray-500">
            {agentStatus.error ? agentStatus.error : agentDescription}
          </p>
          <AgentRatingSummary
            average={ratingSummary.average_score}
            count={ratingSummary.rating_count}
            size="sm"
            className="mt-2 w-fit"
          />
        </header>

        <div className="flex flex-1 flex-col gap-6 lg:h-[720px] lg:flex-row">
          <div className="flex justify-center lg:w-[460px]">
            <div className="flex w-full max-w-[420px] flex-col items-center rounded-3xl border border-white/40 bg-white/70 p-4 shadow-xl backdrop-blur">
              <Live2DContainer
                key={live2DModel || "live2d-agent"}
                ref={live2DRef}
                modelUrl={live2DModel}
                width={400}
                height={600}
                className="bg-white"
                background="transparent"
                onStatusChange={handleLive2DStatusChange}
              />
            </div>
          </div>

          <div className="flex flex-1 min-h-0">
            <ChatPanel
              agentId={agentId || undefined}
              agent={agent}
              live2DRef={live2DRef}
              live2DStatus={live2DStatus}
              live2DError={live2DError}
              ratingSummary={ratingSummary}
              onRatingSummaryChange={handleRatingSummaryChange}
              showRatingButton={false}
              onRatingControllerChange={handleRatingControllerChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
