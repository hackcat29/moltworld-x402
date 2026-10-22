import { ModelDefinition } from "../models/registry.js";
import { config } from "../config.js";

export interface PriceQuote {
  modelSlug: string;
  modality: string;
  estimatedInputTokens?: number;
  maxOutputTokens?: number;
  durationSeconds?: number;
  characterCount?: number;
  imageCount?: number;
  rawUpstreamCostUsd: number;
  marginPercent: number;
  finalPriceUsd: number;
  formattedPrice: string; // e.g. "$0.003254"
  microUsdc: number; // 6 decimal places integer
}

export function formatUsdcPrice(amountUsd: number): string {
  // Ensure minimum floor
  const floor = Math.max(config.priceMinFloor, amountUsd);
  // Round to nearest micro-USDC (6 decimal places)
  const microUsdc = Math.ceil(floor * 1_000_000);
  const formatted = (microUsdc / 1_000_000).toFixed(6).replace(/(\.\d*?[1-9])0+$|\.000000$/, "$1");
  return `$${formatted}`;
}

export function calculateRequestQuote(model: ModelDefinition, body?: any): PriceQuote {
  const margin = config.priceMargin; // e.g. 0.30 (30%)
  let rawCost = 0;
  let estimatedInputTokens: number | undefined;
  let maxOutputTokens: number | undefined;
  let durationSeconds: number | undefined;
  let characterCount: number | undefined;
  let imageCount: number | undefined;

  switch (model.modality) {
    case "chat": {
      const messages = Array.isArray(body?.messages) ? body.messages : [];
      const totalChars = messages.reduce(
        (acc: number, m: any) => acc + (typeof m?.content === "string" ? m.content.length : 0),
        0
      );
      // Rough token estimation: ~3.8 chars per token for multilingual/code
      estimatedInputTokens = Math.max(10, Math.ceil(totalChars / 3.8));
      maxOutputTokens =
        typeof body?.max_tokens === "number" && body.max_tokens > 0
          ? Math.min(body.max_tokens, model.limits.maxOutputTokens || 2048)
          : Math.min(1024, model.limits.maxOutputTokens || 2048);

      const inRate = (model.rates?.inputPerMillionUsd ?? 1.0) / 1_000_000;
      const outRate = (model.rates?.outputPerMillionUsd ?? 2.0) / 1_000_000;

      rawCost = estimatedInputTokens * inRate + maxOutputTokens * outRate;
      break;
    }

    case "image": {
      imageCount = Math.max(1, Math.min(Number(body?.n) || 1, 4));
      const unitRate = model.rates?.unitRateUsd ?? 0.04;
      rawCost = imageCount * unitRate;
      break;
    }

    case "voice": {
      const input = typeof body?.input === "string" ? body.input : "";
      characterCount = Math.max(1, input.length);
      const ratePer1k = model.rates?.unitRateUsd ?? 0.03;
      rawCost = (characterCount / 1000) * ratePer1k;
      break;
    }

    case "video": {
      durationSeconds = Math.max(1, Math.min(Number(body?.duration) || 5, model.limits.maxDurationSeconds || 10));
      const ratePerSec = model.rates?.unitRateUsd ?? 0.05;
      rawCost = durationSeconds * ratePerSec;
      break;
    }
  }

  // Parse model base price floor
  const baseMatch = /^\$(\d+)(?:\.(\d+))?$/.exec(model.price);
  const basePriceUsd = baseMatch ? parseFloat(`${baseMatch[1]}.${baseMatch[2] || "0"}`) : 0;

  // Cost plus margin, clamped to model base price and global floor
  const finalPrice = Math.max(config.priceMinFloor, basePriceUsd, rawCost * (1 + margin));
  const microUsdc = Math.ceil(finalPrice * 1_000_000);
  const formattedPrice = formatUsdcPrice(finalPrice);

  return {
    modelSlug: model.slug,
    modality: model.modality,
    estimatedInputTokens,
    maxOutputTokens,
    durationSeconds,
    characterCount,
    imageCount,
    rawUpstreamCostUsd: parseFloat(rawCost.toFixed(6)),
    marginPercent: Math.round(margin * 100),
    finalPriceUsd: parseFloat(finalPrice.toFixed(6)),
    formattedPrice,
    microUsdc,
  };
}
