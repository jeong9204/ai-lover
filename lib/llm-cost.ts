export interface LLMTokenUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number | null;
}

interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-sonnet-5": {
    inputPerMillion: 2,
    outputPerMillion: 10,
  },
};

function pricingForModel(model: string): ModelPricing | null {
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];
  if (model.startsWith("claude-sonnet-5")) return MODEL_PRICING["claude-sonnet-5"];
  return null;
}

export function calculateLLMCost(input: {
  model: string;
  inputTokens: number;
  outputTokens: number;
}): number | null {
  const pricing = pricingForModel(input.model);
  if (!pricing) return null;

  const inputCost = (input.inputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (input.outputTokens / 1_000_000) * pricing.outputPerMillion;
  return Number((inputCost + outputCost).toFixed(8));
}

export function buildLLMTokenUsage(input: {
  model: string;
  inputTokens: number;
  outputTokens: number;
}): LLMTokenUsage {
  const totalTokens = input.inputTokens + input.outputTokens;
  return {
    model: input.model,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    totalTokens,
    estimatedCostUsd: calculateLLMCost(input),
  };
}
