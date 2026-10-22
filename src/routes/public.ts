import type { Context } from "hono";
import fs from "fs";
import path from "path";
import { config } from "../config.js";
import { defaultModelRegistry, getModelEndpoint, ModelDefinition } from "../models/registry.js";
import { defaultProviderRegistry } from "../providers/index.js";
import { validateBody } from "../middleware/validation.js";
import { microToUsdString, quoteRequest, referenceRequest } from "../pricing/index.js";
import { getJob, getJobByRequest, getRefundByRequest, getRequest, getStats } from "../ledger/index.js";
import { getDatabase } from "../ledger/db.js";
import { receiptSigner, SignedReceipt } from "../receipts/index.js";
import { apiError, gatewayInitError, isGatewayReady } from "../payments/gateway.js";
import { payoutAccount } from "../workers/payouts.js";

const startedAt = Date.now();
let lastSync: { at: string; unverified: Record<string, string>; errors: string[] } | null = null;

export function recordCatalogSync(report: { unverified: Record<string, string>; errors: string[] }) {
  lastSync = { at: new Date().toISOString(), unverified: report.unverified, errors: report.errors };
}

function modelView(m: ModelDefinition) {
  const from = quoteRequest(m, referenceRequest(m));
  return {
    id: m.slug,
    name: m.displayName,
    modality: m.modality,
    provider: m.provider,
    upstream_model: m.upstreamModelId,
    endpoint: getModelEndpoint(m),
    from_price: from.formattedPrice,
    from_price_request: from.units,
    cost_basis: m.cost,
    cost_source: m.costSource,
    margin_percent: from.marginPercent,
    payment_flow: m.modality === "chat" ? "authorization" : "upfront",
    limits: m.limits,
    sizes: m.image?.sizes,
    durations: m.video?.durations,
    aspect_ratios: m.video?.aspectRatios,
    voices: m.voices,
    audio_formats: m.audioFormats,
    description: m.description,
    tags: m.tags,
  };
}

export async function handleHealth(c: Context): Promise<Response> {
  let ledger = "unavailable";
  try {
    const db = await getDatabase();
    await db.query("SELECT 1");
    ledger = db.kind;
  } catch {
    // reported below
  }
  const ready = isGatewayReady() && ledger !== "unavailable";
  const models = defaultModelRegistry.getEnabledModels();
  const body = {
    status: ready ? "healthy" : "degraded",
    ready,
    version: "3.0.0",
    product: "Moltworld",
    error: ready ? undefined : gatewayInitError() ?? (ledger === "unavailable" ? "Ledger unavailable" : undefined),
    public_domain: config.publicDomain,
    network: config.isMainnet ? "mainnet" : "testnet",
    network_caip2: config.networkCaip2,
    usdc_asset_id: config.usdcAsaId,
    pay_to: config.payToAddress,
    facilitator: config.facilitatorUrl,
    ledger,
    providers: defaultProviderRegistry.listConfiguredProviders(),
    mock_providers: config.mockProviders,
    enabled_models: models.length,
    models_by_modality: {
      chat: models.filter((m) => m.modality === "chat").length,
      image: models.filter((m) => m.modality === "image").length,
      voice: models.filter((m) => m.modality === "voice").length,
      video: models.filter((m) => m.modality === "video").length,
    },
    catalog_sync: lastSync,
    pricing: { model: "cost_plus_per_request", margin_percent: Math.round(config.priceMargin * 100), min_price: `$${config.priceMinFloor}` },
    receipts: { kid: receiptSigner.kid, persistent_key: !receiptSigner.ephemeral, keys_url: `${config.publicDomain}/.well-known/moltworld-receipts.json` },
    payouts_enabled: !!payoutAccount(),
    uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
  };
  return c.json(body, ready ? 200 : 503);
}

export function handleListModels(c: Context): Response {
  const modality = c.req.query("modality");
  const models = defaultModelRegistry
    .getEnabledModels()
    .filter((m) => defaultProviderRegistry.supports(m))
    .filter((m) => !modality || m.modality === modality);
  const body: Record<string, unknown> = { object: "list", data: models.map(modelView) };
  if (c.req.query("include") === "unavailable") {
    body.unavailable = defaultModelRegistry
      .getAllModels()
      .filter((m) => !models.includes(m) && (!modality || m.modality === modality))
      .map((m) => ({
        id: m.slug,
        name: m.displayName,
        reason: defaultModelRegistry.getUnavailableReason(m) ?? `provider '${m.provider}' is not configured`,
      }));
  }
  return c.json(body);
}

/** Free price quote for an exact request body; identical to the amount the 402 challenge will ask for. */
export async function handleQuote(c: Context): Promise<Response> {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return apiError(c, 400, "invalid_json", "Body must be JSON: { \"model\": \"<slug>\", ...request }.");
  }
  const slug = typeof body?.model === "string" ? body.model : "";
  const model = defaultModelRegistry.getModel(slug);
  if (!model) return apiError(c, 404, "model_not_found", `Unknown model '${slug}'.`);
  const { model: _ignored, ...request } = body;
  const result = validateBody(request, model);
  if (!result.valid) return apiError(c, 400, "validation_error", result.error);
  const quote = quoteRequest(model, result.request);
  return c.json({
    model: model.slug,
    name: model.displayName,
    available: defaultModelRegistry.isAvailable(model) && defaultProviderRegistry.supports(model),
    endpoint: getModelEndpoint(model),
    payment_flow: model.modality === "chat" ? "authorization" : "upfront",
    quote,
    note:
      model.modality === "chat"
        ? "Chat is charged for the full max_tokens budget; the unused part is credited back as a USDC rebate."
        : "Charged up front; refunded in full if the upstream fails.",
  });
}

function operatorWallets(): string[] {
  const wallets = new Set<string>([config.payToAddress]);
  for (const w of (process.env.OPERATOR_WALLETS ?? "").split(",").map((s) => s.trim()).filter(Boolean)) wallets.add(w);
  const fleetPath = path.join(process.cwd(), ".mainnet_fleet.json");
  if (fs.existsSync(fleetPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(fleetPath, "utf-8"));
      if (Array.isArray(data)) for (const item of data) if (item?.address) wallets.add(item.address);
    } catch {
      // ignore malformed fleet file
    }
  }
  return [...wallets];
}

export async function handleStats(c: Context): Promise<Response> {
  const excluded = operatorWallets();
  const s = await getStats(excluded);
  const explorer = config.isMainnet ? "https://lora.algokit.io/mainnet/transaction/" : "https://lora.algokit.io/testnet/transaction/";
  const netMicro = s.grossMicro - s.rebatedMicro - s.refundedMicro;
  return c.json({
    network: config.isMainnet ? "mainnet" : "testnet",
    metrics: {
      paid_requests: s.paidRequests,
      completed_requests: s.completedRequests,
      uncharged_failures: s.failedUncharged,
      refunded_requests: s.refundedRequests,
      paid_requests_24h: s.last24hRequests,
      gross_usdc: microToUsdString(s.grossMicro),
      rebated_usdc: microToUsdString(s.rebatedMicro),
      refunded_usdc: microToUsdString(s.refundedMicro),
      net_revenue_usdc: microToUsdString(Math.max(0, netMicro)),
      upstream_cost_usd: Number(s.upstreamCostUsd.toFixed(6)),
      unique_paying_wallets: s.uniquePayers,
      repeat_paying_wallets: s.repeatPayers,
      repeat_payer_rate: s.uniquePayers ? Number((s.repeatPayers / s.uniquePayers).toFixed(4)) : 0,
      completed_by_modality: s.byModality,
    },
    recent_settlements: s.recent.map((r) => ({
      request_id: r.id,
      model: r.model,
      modality: r.modality,
      amount: microToUsdString(r.amount_micro),
      txid: r.txid,
      explorer_url: r.txid ? `${explorer}${r.txid}` : null,
      at: r.created_at,
    })),
    methodology:
      "Counted from the gateway ledger. Every settled request carries its on-chain txid, so each figure can be checked against Algorand.",
    timestamp: new Date().toISOString(),
  });
}

export async function handleGetJob(c: Context): Promise<Response> {
  const job = await getJob(c.req.param("id") ?? "");
  if (!job) return apiError(c, 404, "job_not_found", "No such job.");
  const request = await getRequest(job.request_id);
  const refund = job.status === "failed" ? await getRefundByRequest(job.request_id) : undefined;
  return c.json({
    id: job.id,
    object: "video.job",
    status: job.status,
    model: job.model_slug,
    video_url: job.status === "completed" ? (job.requires_proxy ? `${config.publicDomain}/v1/jobs/${job.id}/content` : job.video_url) : null,
    error: job.error,
    request_id: job.request_id,
    receipt_url: `${config.publicDomain}/v1/receipts/${job.request_id}`,
    refund: refund ? { status: refund.status, txid: refund.txid, amount: microToUsdString(refund.amount_micro) } : null,
    paid: request ? microToUsdString(request.amount_micro) : null,
    created_at: job.created_at,
    completed_at: job.completed_at,
  });
}

export async function handleJobContent(c: Context): Promise<Response> {
  const job = await getJob(c.req.param("id") ?? "");
  if (!job || job.status !== "completed") return apiError(c, 404, "job_not_ready", "Video is not ready.");
  if (!job.requires_proxy) return c.redirect(job.video_url!, 302);
  const model = defaultModelRegistry.getModel(job.model_slug);
  const provider = model && defaultProviderRegistry.getProvider(model.provider);
  if (!model || !provider?.fetchVideoContent) return apiError(c, 502, "upstream_error", "Video content unavailable.");
  const upstream = await provider.fetchVideoContent(model, job.upstream_job_id!);
  return new Response(upstream.body, {
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "video/mp4", "Cache-Control": "private, max-age=3600" },
  });
}

export async function handleGetReceipt(c: Context): Promise<Response> {
  const request = await getRequest(c.req.param("id") ?? "");
  if (!request) return apiError(c, 404, "receipt_not_found", "No such request.");
  const job = request.modality === "video" ? await getJobByRequest(request.id) : undefined;
  const refund = await getRefundByRequest(request.id);
  const receipt = request.receipt as SignedReceipt | null;
  return c.json({
    request_id: request.id,
    status: request.status,
    receipt,
    signature_valid: receipt ? receiptSigner.verify(receipt) : false,
    amount: microToUsdString(request.amount_micro),
    rebate: microToUsdString(request.rebate_micro),
    txid: request.txid,
    job: job ? { id: job.id, status: job.status } : null,
    refund: refund ? { status: refund.status, txid: refund.txid, amount: microToUsdString(refund.amount_micro) } : null,
    verify:
      "Check `sig` with the key from /.well-known/moltworld-receipts.json over the canonical JSON (sorted keys) of the receipt without `sig`; compare responseSha256 with sha256 of the response body bytes you received.",
  });
}

export function handleReceiptKeys(c: Context): Response {
  return c.json(
    {
      issuer: config.publicDomain,
      algorithm: "Ed25519",
      encoding: "publicKey is the raw 32-byte key, base64; signatures are base64url",
      canonicalization: "JSON with object keys sorted recursively, no whitespace, receipt without `sig`",
      keys: receiptSigner.publicKeys(),
      pay_to: config.payToAddress,
    },
    200,
    { "Cache-Control": "public, max-age=300" }
  );
}
