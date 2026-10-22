import { config } from "../config.js";
import { ModelDefinition, ModelRegistry } from "./registry.js";

/**
 * Keeps the catalog honest at runtime:
 *  - a model whose upstream id the provider does not list is marked unverified
 *    and is neither advertised nor sold (fail closed);
 *  - chat token rates follow OpenRouter's live price list;
 *  - fal.ai unit prices follow fal's pricing API when FAL_KEY is configured;
 *  - COST_<SLUG> environment variables override any of the above.
 */

type FetchLike = typeof fetch;

export interface SyncReport {
  verified: string[];
  unverified: Record<string, string>;
  repriced: string[];
  errors: string[];
}

function envOverrideName(slug: string): string {
  return `COST_${slug.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

/** COST_<SLUG> is "in,out" per million tokens for chat, otherwise the per-unit USD rate. */
export function applyEnvCostOverride(model: ModelDefinition, env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env[envOverrideName(model.slug)];
  if (!raw) return false;
  if (model.cost.kind === "tokens") {
    const [input, output] = raw.split(",").map(Number);
    if (!Number.isFinite(input) || !Number.isFinite(output)) return false;
    model.cost = { kind: "tokens", inputPerMillionUsd: input, outputPerMillionUsd: output };
  } else {
    const usd = Number(raw);
    if (!Number.isFinite(usd)) return false;
    model.cost = { ...model.cost, usd };
  }
  model.costSource = "env-override";
  return true;
}

async function syncOpenRouter(models: ModelDefinition[], registry: ModelRegistry, report: SyncReport, fetchImpl: FetchLike) {
  const res = await fetchImpl("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`OpenRouter model list returned ${res.status}`);
  const data = (await res.json()) as { data: Array<{ id: string; pricing?: Record<string, string> }> };
  const byId = new Map(data.data.map((m) => [m.id, m]));

  for (const model of models) {
    const listed = byId.get(model.upstreamModelId);
    if (!listed) {
      registry.markUnverified(model.slug, `upstream '${model.upstreamModelId}' is not listed by OpenRouter`);
      report.unverified[model.slug] = model.upstreamModelId;
      continue;
    }
    registry.clearUnverified(model.slug);
    report.verified.push(model.slug);
    if (model.cost.kind === "tokens" && listed.pricing) {
      const input = Number(listed.pricing.prompt) * 1_000_000;
      const output = Math.max(
        Number(listed.pricing.completion),
        Number(listed.pricing.internal_reasoning ?? 0)
      ) * 1_000_000;
      if (Number.isFinite(input) && Number.isFinite(output) && output > 0) {
        model.cost = { kind: "tokens", inputPerMillionUsd: Number(input.toFixed(6)), outputPerMillionUsd: Number(output.toFixed(6)) };
        model.costSource = "openrouter-live";
        report.repriced.push(model.slug);
      }
    }
  }
}

async function syncFal(models: ModelDefinition[], registry: ModelRegistry, report: SyncReport, fetchImpl: FetchLike) {
  for (const model of models) {
    const url = `https://api.fal.ai/v1/models?endpoint_id=${encodeURIComponent(model.upstreamModelId)}`;
    let res: Response | undefined;
    // The public directory rate-limits bursts; back off briefly instead of failing the model.
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetchImpl(url, {
        headers: config.falKey ? { Authorization: `Key ${config.falKey}` } : {},
        signal: AbortSignal.timeout(15000),
      });
      if (res.status !== 429) break;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
    if (!res) continue;
    if (!res.ok) {
      report.errors.push(`fal model lookup for ${model.slug} returned ${res.status}`);
      continue;
    }
    const data = (await res.json()) as { models?: Array<{ endpoint_id: string; metadata?: { status?: string } }> };
    const entry = data.models?.find((m) => m.endpoint_id === model.upstreamModelId);
    if (!entry) {
      registry.markUnverified(model.slug, `fal endpoint '${model.upstreamModelId}' does not exist`);
      report.unverified[model.slug] = model.upstreamModelId;
      continue;
    }
    if (entry.metadata?.status && entry.metadata.status !== "active") {
      registry.markUnverified(model.slug, `fal endpoint '${model.upstreamModelId}' is ${entry.metadata.status}`);
      report.unverified[model.slug] = model.upstreamModelId;
      continue;
    }
    registry.clearUnverified(model.slug);
    report.verified.push(model.slug);
  }

  if (!config.falKey) return;
  const ids = models.map((m) => m.upstreamModelId);
  const query = ids.map((id) => `endpoint_id=${encodeURIComponent(id)}`).join("&");
  const res = await fetchImpl(`https://api.fal.ai/v1/models/pricing?${query}`, {
    headers: { Authorization: `Key ${config.falKey}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    report.errors.push(`fal pricing API returned ${res.status}; keeping static unit prices`);
    return;
  }
  const pricing = (await res.json()) as { prices?: Array<{ endpoint_id: string; unit_price: number; unit: string }> };
  for (const price of pricing.prices ?? []) {
    const model = models.find((m) => m.upstreamModelId === price.endpoint_id);
    if (!model || !Number.isFinite(price.unit_price)) continue;
    const unit = price.unit.toLowerCase();
    if (model.cost.kind === "per_image" && (unit === "image" || unit === "images")) {
      model.cost = { kind: "per_image", usd: price.unit_price };
    } else if (model.cost.kind === "per_image" && unit.startsWith("megapixel")) {
      // Moltworld's largest size is ~1.8 MP; price every image at 2 MP to stay on the safe side.
      model.cost = { kind: "per_image", usd: price.unit_price * 2 };
    } else if (model.cost.kind === "per_second" && unit.startsWith("second")) {
      model.cost = { kind: "per_second", usd: price.unit_price };
    } else if (model.cost.kind === "per_second" && unit === "video") {
      // Per-video pricing: spread over the shortest allowed duration so longer clips stay covered.
      model.cost = { kind: "per_second", usd: price.unit_price / (model.video?.durations[0] ?? 5) };
    } else {
      report.errors.push(`fal pricing unit '${price.unit}' for ${model.slug} not understood; keeping static price`);
      continue;
    }
    model.costSource = "fal-live";
    report.repriced.push(model.slug);
  }
}

export async function syncCatalog(registry: ModelRegistry, fetchImpl: FetchLike = fetch): Promise<SyncReport> {
  const report: SyncReport = { verified: [], unverified: {}, repriced: [], errors: [] };
  const all = registry.getAllModels().filter((m) => m.enabled);

  if (!config.skipUpstreamVerification) {
    const openrouter = all.filter((m) => m.provider === "openrouter");
    const fal = all.filter((m) => m.provider === "fal");
    // Nothing is sold until its upstream has been seen at least once.
    for (const m of [...openrouter, ...fal]) {
      if (!registry.wasVerified(m.slug)) registry.markUnverified(m.slug, "upstream verification pending");
    }
    try {
      await syncOpenRouter(openrouter, registry, report, fetchImpl);
    } catch (err: any) {
      // Models verified on an earlier run stay up; never-verified ones stay off.
      for (const m of openrouter) {
        if (!registry.wasVerified(m.slug)) registry.markUnverified(m.slug, "OpenRouter model list unavailable");
      }
      report.errors.push(`OpenRouter sync failed: ${err.message}`);
    }
    try {
      await syncFal(fal, registry, report, fetchImpl);
    } catch (err: any) {
      for (const m of fal) {
        if (!registry.wasVerified(m.slug)) registry.markUnverified(m.slug, "fal.ai model directory unavailable");
      }
      report.errors.push(`fal sync failed: ${err.message}`);
    }
  }

  for (const model of all) {
    if (applyEnvCostOverride(model)) report.repriced.push(model.slug);
  }
  return report;
}

/** Re-sync periodically so prices track upstream changes. */
export function scheduleCatalogSync(registry: ModelRegistry, intervalMs = 60 * 60 * 1000): NodeJS.Timeout {
  const timer = setInterval(() => {
    syncCatalog(registry).catch((err) => console.error("Catalog re-sync failed:", err));
  }, intervalMs);
  timer.unref();
  return timer;
}
