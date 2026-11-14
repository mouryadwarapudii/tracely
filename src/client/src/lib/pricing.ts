import pricing from "../constants/pricing.json" with { type: "json" };

export type ModelPrice = { provider: string; input: number; output: number; cheaper?: string };

const MODELS = pricing.models as Record<string, ModelPrice>;
const KEYS = Object.keys(MODELS).sort((a, b) => b.length - a.length);

/** Longest-prefix match, so "gpt-4o-2024-08-06" resolves to "gpt-4o". */
export function findPrice(model: string): (ModelPrice & { key: string }) | null {
  const m = model.toLowerCase().replace(/^.*\//, "");
  for (const key of KEYS) {
    if (m === key || m.startsWith(key)) return { key, ...MODELS[key] };
  }
  return null;
}

export function computeCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = findPrice(model);
  if (!p) return 0;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

export function allPrices(): (ModelPrice & { key: string })[] {
  return Object.entries(MODELS).map(([key, v]) => ({ key, ...v }));
}
