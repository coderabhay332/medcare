// Price tracker for AI API calls
// Pricing as of 2024, in USD per token

const PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic Claude models (per 1M tokens)
  'claude-haiku-4-5-20251001': { input: 0.0000008, output: 0.000004 },
  'claude-sonnet-4-5': { input: 0.000003, output: 0.000015 },
  'claude-sonnet-4-6': { input: 0.000003, output: 0.000015 },
  // Google Gemini (free tier, cost 0)
  'gemini-2.0-flash-exp': { input: 0, output: 0 },
  'gemini-2.0-flash':     { input: 0, output: 0 },
  'gemini-2.5-flash':     { input: 0, output: 0 },
  'gemini-2.5-flash-lite':{ input: 0, output: 0 },
  'gemini-1.5-flash':     { input: 0, output: 0 },
  'gemini-flash-latest':  { input: 0, output: 0 },
};

export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = PRICING[model];
  if (!pricing) {
    console.warn(`Unknown model: ${model}, assuming cost 0`);
    return 0;
  }
  return (inputTokens * pricing.input) + (outputTokens * pricing.output);
}

export interface AiCost {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}