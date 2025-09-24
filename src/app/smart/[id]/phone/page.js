"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Live2DContainer from "@/components/Live2DContainer";
import ChatPanel from "@/components/chat/ChatPanel";
import { resolveAssetUrl } from "@/lib/media";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";
const YUMI_MODEL_URL = "/yumi/yumi.model3.json";

export default function SmartPhonePage() {
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
  const agentName = agent?.name ? agent.name : agentId || "Unknown";
  const agentDescription = useMemo(() => {
    if (agent?.persona_desc) {
      return agent.persona_desc;
    }
    if (agent?.first_turn_hint) {
      return agent.first_turn_hint;
    }
    return "语音电话模式就绪，随时可以与智能体对话。";
  }, [agent?.persona_desc, agent?.first_turn_hint]);

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
            Voice Call
          </span>
          <h1 className="text-2xl font-semibold text-gray-900">
            {agentName ? `电话通话 · ${agentName}` : "语音通话"}
          </h1>
          <p className="text-sm text-gray-500">
            {agentStatus.error
              ? agentStatus.error
              : agentDescription}
          </p>
          <p className="text-xs text-gray-400">
            提示：请确保麦克风权限已开启，挂断后可通过页面右上角返回文字聊天。
          </p>
        </header>

        <div className="flex flex-1 flex-col gap-6 lg:min-h-[760px]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <div className="flex justify-center lg:w-[500px]">
              <div className="flex w-full max-w-[460px] flex-col items-center rounded-3xl border border-white/40 bg-white/70 p-4 shadow-xl backdrop-blur">
                <Live2DContainer
                  key={live2DModel || "live2d-agent-call"}
                  ref={live2DRef}
                  modelUrl={live2DModel}
                  width={440}
                  height={640}
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
                mode="phone"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
