"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Live2DContainer from "@/components/Live2DContainer";
import ChatPanel from "@/components/chat/ChatPanel";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";
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

  useEffect(() => {
    if (!agentId) {
      return;
    }
    let aborted = false;
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
    return "自定义智能体正在等待与您建立连接。";
  }, [agent?.persona_desc, agent?.first_turn_hint]);

  const live2DModel = agent?.live2d_model_id
    ? agent.live2d_model_id
    : YUMI_MODEL_URL;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 py-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6">
        <header className="flex flex-col gap-2 text-gray-700">
          <span className="text-sm uppercase tracking-wide text-gray-400">
            Smart Agent
          </span>
          <h1 className="text-2xl font-semibold text-gray-900">
            {agentName ? `智能体：${agentName}` : "智能体"}
          </h1>
          <p className="text-sm text-gray-500">
            {agentStatus.error ? agentStatus.error : agentDescription}
          </p>
        </header>

        <div className="flex flex-1 flex-col gap-6 lg:h-[720px] lg:flex-row">
          <div className="flex justify-center lg:w-[460px]">
            <div className="flex w-full max-w-[420px] flex-col items-center rounded-3xl border border-white/40 bg-white/70 p-4 shadow-xl backdrop-blur">
              <Live2DContainer
                modelUrl={live2DModel}
                width={400}
                height={600}
                className="bg-white"
                background="transparent"
              />
            </div>
          </div>

          <div className="flex flex-1 min-h-0">
            <ChatPanel agentId={agentId || undefined} agent={agent} />
          </div>
        </div>
      </div>
    </div>
  );
}

