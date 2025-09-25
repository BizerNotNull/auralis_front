const CHAT_MODEL_CUSTOM_VALUE = "__custom__";

const RAW_FALLBACK_CHAT_MODELS = [
  {
    provider: "openai",
    name: "gpt-oss-120b",
    display_name: "GPT-OSS 120B",
    description: "默认通用模型，兼容 OpenAI Chat Completions 协议。",
    capabilities: ["chat", "stream"],
    recommended: true,
  },
  {
    provider: "openai",
    name: "deepseek/deepseek-v3.1-terminus",
    display_name: "DeepSeek Terminus v3.1",
    description: "注重复杂推理的旗舰模型，适合深入分析任务。",
    capabilities: ["chat", "reasoning"],
  },
  {
    provider: "openai",
    name: "x-ai/grok-4-fast",
    display_name: "Grok-4 Fast",
    description: "实时搜索增强，响应速度快，适合需要快速反馈的场景。",
    capabilities: ["chat", "search"],
  },
  {
    provider: "openai",
    name: "qwen3-max",
    display_name: "Qwen 3 Max",
    description: "多语言表现优秀的大模型，擅长长文本理解与创作。",
    capabilities: ["chat", "multilingual"],
  },
  {
    provider: "openai",
    name: "MiniMax-M1",
    display_name: "MiniMax M1",
    description: "均衡型模型，适合通用助理和内容创作。",
    capabilities: ["chat"],
  },
  {
    provider: "openai",
    name: "doubao-seed-1.6",
    display_name: "Doubao Seed 1.6",
    description: "语义理解稳定，可作入门业务接入模型。",
    capabilities: ["chat"],
  },
];

function pickFirstString(record, ...keys) {
  if (!record) {
    return "";
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function pickStringArray(record, ...keys) {
  if (!record) {
    return [];
  }
  for (const key of keys) {
    const value = record[key];
    if (!Array.isArray(value)) {
      continue;
    }
    const normalized = value
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter(Boolean);
    if (normalized.length) {
      return normalized;
    }
  }
  return [];
}

function pickBoolean(record, ...keys) {
  if (!record) {
    return false;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true") {
        return true;
      }
      if (normalized === "false") {
        return false;
      }
    }
  }
  return false;
}

export function normalizeChatModels(list) {
  if (!Array.isArray(list)) {
    return [];
  }

  const result = [];
  const seen = new Set();

  for (const item of list) {
    const provider = pickFirstString(
      item,
      "provider",
      "provider_name",
      "providerName",
    );
    const name = pickFirstString(
      item,
      "name",
      "model",
      "model_name",
      "modelName",
    );
    if (!provider || !name) {
      continue;
    }

    const hashKey = `${provider.toLowerCase()}:::${name}`;
    if (seen.has(hashKey)) {
      continue;
    }
    seen.add(hashKey);

    const displayName =
      pickFirstString(item, "display_name", "displayName", "label", "title") ||
      name;
    const description = pickFirstString(item, "description", "desc", "summary");
    const providerLabel =
      pickFirstString(
        item,
        "provider_label",
        "providerLabel",
        "vendor",
        "vendor_label",
      ) || provider;
    const capabilities = pickStringArray(
      item,
      "capabilities",
      "tags",
      "features",
    );
    const recommended = pickBoolean(
      item,
      "recommended",
      "default",
      "is_default",
    );

    result.push({
      key: `${provider}:::${name}`,
      provider,
      providerLabel,
      name,
      displayName,
      description,
      capabilities,
      recommended,
    });
  }

  return result;
}

export function sortChatModels(models) {
  if (!Array.isArray(models)) {
    return [];
  }
  if (models.length <= 1) {
    return [...models];
  }
  const recommended = [];
  const others = [];
  for (const model of models) {
    if (model?.recommended) {
      recommended.push(model);
    } else {
      others.push(model);
    }
  }
  return [...recommended, ...others];
}

export function findChatModel(models, provider, name) {
  if (!Array.isArray(models)) {
    return null;
  }
  const normalizedProvider = (provider ?? "").trim().toLowerCase();
  const normalizedName = (name ?? "").trim();
  if (!normalizedProvider || !normalizedName) {
    return null;
  }
  return (
    models.find((model) => {
      if (!model) {
        return false;
      }
      const modelProvider = (model.provider ?? "").toLowerCase();
      return (
        modelProvider === normalizedProvider && model.name === normalizedName
      );
    }) ?? null
  );
}

const FALLBACK_CHAT_MODELS = normalizeChatModels(RAW_FALLBACK_CHAT_MODELS);

export { CHAT_MODEL_CUSTOM_VALUE, FALLBACK_CHAT_MODELS };
