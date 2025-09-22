'use client';

import { useParams } from "next/navigation";
import Live2DContainer from "@/components/Live2DContainer";

const YUMI_MODEL_URL = "/yumi/yumi.model3.json";

export default function SmartPage() {
  const params = useParams();
  const paramsId = params?.id;
  const smartId = Array.isArray(paramsId) ? paramsId[0] : paramsId;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-6">
      <div className="text-lg font-semibold text-gray-800">
        Smart Page ID: {smartId}
      </div>
      <Live2DContainer
        modelUrl={YUMI_MODEL_URL}
        width={400}
        height={600}
        className="bg-white/20"
      />
    </div>
  );
}