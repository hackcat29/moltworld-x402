import { Context } from "hono";
import fs from "fs";
import path from "path";
import { config } from "../config.js";
import { defaultModelRegistry, getModelEndpoint, getModelDiscoveryDescription } from "../models/registry.js";
import { defaultProviderRegistry } from "../providers/index.js";
import {
  validateChatCompletionRequest,
  validateImageRequest,
  validateAudioRequest,
  validateVideoRequest,
} from "../middleware/validation.js";
import { ModelModality } from "../providers/types.js";
import { calculateRequestQuote } from "../pricing/index.js";
import { dbStore } from "../store/db.js";
import { receiptService } from "../receipts/index.js";

const startTime = Date.now();
let isGatewayReady = false;
let gatewayInitError: string | null = null;

export function setGatewayReady(ready: boolean, error?: string): void {
  isGatewayReady = ready;
  gatewayInitError = error || null;
}

export function isReady(): boolean {
  return isGatewayReady;
}

function loadOperatorWallets(): Set<string> {
  const wallets = new Set<string>();
  if (config.payToAddress) wallets.add(config.payToAddress);

  const fleetPath = path.join(process.cwd(), ".mainnet_fleet.json");
  if (fs.existsSync(fleetPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(fleetPath, "utf-8"));
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item?.address) wallets.add(item.address);
        }
      }
    } catch {}
  }
  return wallets;
}

export function handleHealth(c: Context): Response {
  if (!isGatewayReady) {
    return c.json(
      {
        status: "degraded",
        ready: false,
        version: "2.0.0",
        product: "Moltworld x402 AI Gateway",
        error: gatewayInitError || "x402 Facilitator unavailable. Gateway failing closed to protect user funds.",
        timestamp: new Date().toISOString(),
      },
      503
    );
  }

  const models = defaultModelRegistry.getEnabledModels();

  return c.json({
    status: "healthy",
    ready: true,
    version: "2.0.0",
    product: "Moltworld",
    public_domain: config.publicDomain,
    network: config.isMainnet ? "mainnet" : "testnet",
    network_caip2: config.networkCaip2,
    usdc_asset_id: config.usdcAsaId,
    pay_to: config.payToAddress,
    facilitator: config.facilitatorUrl,
    bazaar_enabled: true,
    tag: "x402-global-challenge",
    modalities_supported: ["chat", "image", "voice", "video"],
    enabled_models: models.length,
    models_by_modality: {
      chat: models.filter((m) => m.modality === "chat").length,
      image: models.filter((m) => m.modality === "image").length,
      voice: models.filter((m) => m.modality === "voice").length,
      video: models.filter((m) => m.modality === "video").length,
    },
    pricing_model: "cost_plus_dynamic_quote",
    margin_percent: Math.round(config.priceMargin * 100),
    receipt_verification_endpoint: `${config.publicDomain}/.well-known/moltworld-receipts.json`,
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
  });
}

export function handleListModels(c: Context): Response {
  const modalityFilter = c.req.query("modality") as ModelModality | undefined;
  let models = defaultModelRegistry.getEnabledModels();

  if (modalityFilter) {
    models = models.filter((m) => m.modality === modalityFilter);
  }

  return c.json({
    object: "list",
data: models.map((m) => {
      const baseQuote = calculateRequestQuote(m);
      return {
        id: m.slug,
        name: m.displayName,
        modality: m.modality,
        price: m.price,
        base_quote: baseQuote.formattedPrice,
        rates: m.rates,
        endpoint: getModelEndpoint(m),
        max_tokens: m.limits.maxOutputTokens,
        max_input_tokens: m.limits.maxInputTokens,
        max_duration_seconds: m.limits.maxDurationSeconds,
        description: getModelDiscoveryDescription(m),
        tags: m.tags || [],
      };
    }),
  });
}

function extractModelSlug(c: Context): string {
  const param = c.req.param("model");
  if (param) return param;
  const match = c.req.path.match(/^\/v1\/models\/([^/]+)\//);
  return match ? match[1] : "";
}

// ----------------------------------------------------
// Chat Completion Handler
// ----------------------------------------------------
export async function handleChatCompletion(c: Context): Promise<Response> {
  const modelSlug = extractModelSlug(c);
  const model = defaultModelRegistry.getModel(modelSlug);

  if (!model || !model.enabled || model.modality !== "chat") {
    return c.json(
      {
        error: {
          message: `Model '${modelSlug}' is not found or is not a chat model. Available chat models: ${defaultModelRegistry
            .getModelsByModality("chat")
            .map((m) => m.slug)
            .join(", ")}`,
          type: "invalid_request_error",
          code: "model_not_found",
        },
      },
      404
    );
  }

  if (!isGatewayReady) {
    return c.json(
      {
        error: {
          message: "Gateway payment verification is currently unavailable. Failing closed.",
          type: "service_unavailable",
          code: "facilitator_unavailable",
        },
      },
      503
    );
  }

  if (!defaultProviderRegistry.hasProvider(model.provider)) {
    return c.json(
      {
        error: {
          message: `Provider '${model.provider}' for model '${modelSlug}' is not available or configured. Failing closed.`,
          type: "service_unavailable",
          code: "provider_unconfigured",
        },
      },
      503
    );
  }

  const validationResult = await validateChatCompletionRequest(c, model);
  if (!validationResult.valid) {
    return c.json(
      {
        error: {
          message: validationResult.error,
          type: "invalid_request_error",
          code: "validation_error",
        },
      },
      400
    );
  }

  const requestId = c.req.header("x-request-id") || `chatcmpl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const idempotencyKey = c.req.header("idempotency-key");

  if (idempotencyKey) {
    const existing = await dbStore.getRequestByIdempotencyKey(idempotencyKey);
    if (existing && existing.status === "completed" && existing.response_payload) {
      return c.json(existing.response_payload);
    }
  }

  const requestHash = receiptService.hashData(validationResult.request);
  const quote = calculateRequestQuote(model, validationResult.request);
  const payer = c.req.header("x-payer-address") || "anonymous-payer";

  await dbStore.saveRequest({
    id: requestId,
    idempotency_key: idempotencyKey,
    payer_address: payer,
    pay_to_address: config.payToAddress,
    network: config.networkCaip2,
    txid: c.req.header("x-txid") || null,
    model_slug: model.slug,
    modality: "chat",
    quote_amount_usd: quote.finalPriceUsd,
    quote_microusdc: quote.microUsdc,
    payment_flow: "authorization",
    status: "pending",
    request_hash: requestHash,
  });

  const provider = defaultProviderRegistry.getProvider(model.provider);
  try {
    const completion = await provider.chatComplete(
      model.upstreamModelId,
      validationResult.request,
      model.slug
    );

    const responseHash = receiptService.hashData(completion);
    const receipt = receiptService.signReceipt({
      requestId,
      txid: c.req.header("x-txid") || `tx-${Date.now()}`,
      network: config.networkCaip2,
      payer,
      payTo: config.payToAddress,
      amountUsd: quote.formattedPrice,
      amountMicroUsdc: quote.microUsdc,
      modelSlug: model.slug,
      modality: "chat",
      upstreamProvider: completion.upstreamProvider || model.provider,
      upstreamModel: completion.upstreamModel || model.upstreamModelId,
      requestSha256: requestHash,
      responseSha256: responseHash,
    });

    await dbStore.updateRequestStatus(requestId, "completed", {
      upstream_provider: completion.upstreamProvider || model.provider,
      upstream_model: completion.upstreamModel || model.upstreamModelId,
      upstream_cost_usd: completion.upstreamCostUsd,
      response_hash: responseHash,
      response_payload: completion,
    });

    c.header("Moltworld-Receipt", JSON.stringify(receipt));
    return c.json({
      ...completion,
      moltworld: {
        receipt,
      },
    });
  } catch (err: any) {
    await dbStore.updateRequestStatus(requestId, "failed", {
      error_message: err.message,
    });
    return c.json(
      {
        error: {
          message: err.message || "Failed to generate completion from upstream provider.",
          type: "api_error",
          code: "provider_error",
        },
      },
      502
    );
  }
}

// ----------------------------------------------------
// Image Generation Handler
// ----------------------------------------------------
export async function handleImageGeneration(c: Context): Promise<Response> {
  const modelSlug = extractModelSlug(c);
  const model = defaultModelRegistry.getModel(modelSlug);

  if (!model || !model.enabled || model.modality !== "image") {
    return c.json(
      {
        error: {
          message: `Model '${modelSlug}' is not found or is not an image model. Available image models: ${defaultModelRegistry
            .getModelsByModality("image")
            .map((m) => m.slug)
            .join(", ")}`,
          type: "invalid_request_error",
          code: "model_not_found",
        },
      },
      404
    );
  }

  if (!isGatewayReady) {
    return c.json(
      {
        error: {
          message: "Gateway payment verification is currently unavailable. Failing closed.",
          type: "service_unavailable",
          code: "facilitator_unavailable",
        },
      },
      503
    );
  }

  if (!defaultProviderRegistry.hasProvider(model.provider)) {
    return c.json(
      {
        error: {
          message: `Provider '${model.provider}' for model '${modelSlug}' is not available or configured. Failing closed.`,
          type: "service_unavailable",
          code: "provider_unconfigured",
        },
      },
      503
    );
  }

  const validationResult = await validateImageRequest(c, model);
  if (!validationResult.valid) {
    return c.json(
      {
        error: {
          message: validationResult.error,
          type: "invalid_request_error",
          code: "validation_error",
        },
      },
      400
    );
  }

  const requestId = c.req.header("x-request-id") || `img-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const idempotencyKey = c.req.header("idempotency-key");

  if (idempotencyKey) {
    const existing = await dbStore.getRequestByIdempotencyKey(idempotencyKey);
    if (existing && existing.status === "completed" && existing.response_payload) {
      return c.json(existing.response_payload);
    }
  }

  const requestHash = receiptService.hashData(validationResult.request);
  const quote = calculateRequestQuote(model, validationResult.request);
  const payer = c.req.header("x-payer-address") || "anonymous-payer";

  await dbStore.saveRequest({
    id: requestId,
    idempotency_key: idempotencyKey,
    payer_address: payer,
    pay_to_address: config.payToAddress,
    network: config.networkCaip2,
    txid: c.req.header("x-txid") || null,
    model_slug: model.slug,
    modality: "image",
    quote_amount_usd: quote.finalPriceUsd,
    quote_microusdc: quote.microUsdc,
    payment_flow: "upfront",
    status: "settled",
    request_hash: requestHash,
  });

  const provider = defaultProviderRegistry.getProvider(model.provider);
  try {
    if (!provider.generateImage) {
      throw new Error(`Provider '${provider.id}' does not implement image generation.`);
    }
    const response = await provider.generateImage(
      model.upstreamModelId,
      validationResult.request,
      model.slug
    );

    const responseHash = receiptService.hashData(response);
    const receipt = receiptService.signReceipt({
      requestId,
      txid: c.req.header("x-txid") || `tx-${Date.now()}`,
      network: config.networkCaip2,
      payer,
      payTo: config.payToAddress,
      amountUsd: quote.formattedPrice,
      amountMicroUsdc: quote.microUsdc,
      modelSlug: model.slug,
      modality: "image",
      upstreamProvider: response.upstreamProvider || model.provider,
      upstreamModel: response.upstreamModel || model.upstreamModelId,
      requestSha256: requestHash,
      responseSha256: responseHash,
    });

    await dbStore.updateRequestStatus(requestId, "completed", {
      upstream_provider: response.upstreamProvider || model.provider,
      upstream_model: response.upstreamModel || model.upstreamModelId,
      upstream_cost_usd: response.upstreamCostUsd,
      response_hash: responseHash,
      response_payload: response,
    });

    c.header("Moltworld-Receipt", JSON.stringify(receipt));
    return c.json({
      ...response,
      moltworld: {
        receipt,
      },
    });
  } catch (err: any) {
    await dbStore.updateRequestStatus(requestId, "failed", {
      error_message: err.message,
    });
    return c.json(
      {
        error: {
          message: err.message || "Failed to generate image from upstream provider.",
          type: "api_error",
          code: "provider_error",
        },
      },
      502
    );
  }
}

// ----------------------------------------------------
// Voice / Audio Speech Handler
// ----------------------------------------------------
export async function handleAudioSpeech(c: Context): Promise<Response> {
  const modelSlug = extractModelSlug(c);
  const model = defaultModelRegistry.getModel(modelSlug);

  if (!model || !model.enabled || model.modality !== "voice") {
    return c.json(
      {
        error: {
          message: `Model '${modelSlug}' is not found or is not a voice model. Available voice models: ${defaultModelRegistry
            .getModelsByModality("voice")
            .map((m) => m.slug)
            .join(", ")}`,
          type: "invalid_request_error",
          code: "model_not_found",
        },
      },
      404
    );
  }

  if (!isGatewayReady) {
    return c.json(
      {
        error: {
          message: "Gateway payment verification is currently unavailable. Failing closed.",
          type: "service_unavailable",
          code: "facilitator_unavailable",
        },
      },
      503
    );
  }

  if (!defaultProviderRegistry.hasProvider(model.provider)) {
    return c.json(
      {
        error: {
          message: `Provider '${model.provider}' for model '${modelSlug}' is not available or configured. Failing closed.`,
          type: "service_unavailable",
          code: "provider_unconfigured",
        },
      },
      503
    );
  }

  const validationResult = await validateAudioRequest(c, model);
  if (!validationResult.valid) {
    return c.json(
      {
        error: {
          message: validationResult.error,
          type: "invalid_request_error",
          code: "validation_error",
        },
      },
      400
    );
  }

  const requestId = c.req.header("x-request-id") || `audio-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const idempotencyKey = c.req.header("idempotency-key");

  if (idempotencyKey) {
    const existing = await dbStore.getRequestByIdempotencyKey(idempotencyKey);
    if (existing && existing.status === "completed" && existing.response_payload) {
      return c.json(existing.response_payload);
    }
  }

  const requestHash = receiptService.hashData(validationResult.request);
  const quote = calculateRequestQuote(model, validationResult.request);
  const payer = c.req.header("x-payer-address") || "anonymous-payer";

  await dbStore.saveRequest({
    id: requestId,
    idempotency_key: idempotencyKey,
    payer_address: payer,
    pay_to_address: config.payToAddress,
    network: config.networkCaip2,
    txid: c.req.header("x-txid") || null,
    model_slug: model.slug,
    modality: "voice",
    quote_amount_usd: quote.finalPriceUsd,
    quote_microusdc: quote.microUsdc,
    payment_flow: "authorization",
    status: "pending",
    request_hash: requestHash,
  });

  const provider = defaultProviderRegistry.getProvider(model.provider);
  try {
    if (!provider.generateSpeech) {
      throw new Error(`Provider '${provider.id}' does not implement speech generation.`);
    }
    const response = await provider.generateSpeech(
      model.upstreamModelId,
      validationResult.request,
      model.slug
    );

    const responseHash = receiptService.hashData(response);
    const receipt = receiptService.signReceipt({
      requestId,
      txid: c.req.header("x-txid") || `tx-${Date.now()}`,
      network: config.networkCaip2,
      payer,
      payTo: config.payToAddress,
      amountUsd: quote.formattedPrice,
      amountMicroUsdc: quote.microUsdc,
      modelSlug: model.slug,
      modality: "voice",
      upstreamProvider: response.upstreamProvider || model.provider,
      upstreamModel: response.upstreamModel || model.upstreamModelId,
      requestSha256: requestHash,
      responseSha256: responseHash,
    });

    await dbStore.updateRequestStatus(requestId, "completed", {
      upstream_provider: response.upstreamProvider || model.provider,
      upstream_model: response.upstreamModel || model.upstreamModelId,
      upstream_cost_usd: response.upstreamCostUsd,
      response_hash: responseHash,
      response_payload: response,
    });

    c.header("Moltworld-Receipt", JSON.stringify(receipt));
    return c.json({
      ...response,
      moltworld: {
        receipt,
      },
    });
  } catch (err: any) {
    await dbStore.updateRequestStatus(requestId, "failed", {
      error_message: err.message,
    });
    return c.json(
      {
        error: {
          message: err.message || "Failed to synthesize speech from upstream provider.",
          type: "api_error",
          code: "provider_error",
        },
      },
      502
    );
  }
}

// ----------------------------------------------------
// Video Generation Handler (Upfront Async Job Queue)
// ----------------------------------------------------
export async function handleVideoGeneration(c: Context): Promise<Response> {
  const modelSlug = extractModelSlug(c);
  const model = defaultModelRegistry.getModel(modelSlug);

  if (!model || !model.enabled || model.modality !== "video") {
    return c.json(
      {
        error: {
          message: `Model '${modelSlug}' is not found or is not a video model. Available video models: ${defaultModelRegistry
            .getModelsByModality("video")
            .map((m) => m.slug)
            .join(", ")}`,
          type: "invalid_request_error",
          code: "model_not_found",
        },
      },
      404
    );
  }

  if (!isGatewayReady) {
    return c.json(
      {
        error: {
          message: "Gateway payment verification is currently unavailable. Failing closed.",
          type: "service_unavailable",
          code: "facilitator_unavailable",
        },
      },
      503
    );
  }

  if (!defaultProviderRegistry.hasProvider(model.provider)) {
    return c.json(
      {
        error: {
          message: `Provider '${model.provider}' for model '${modelSlug}' is not available or configured. Failing closed.`,
          type: "service_unavailable",
          code: "provider_unconfigured",
        },
      },
      503
    );
  }

  const validationResult = await validateVideoRequest(c, model);
  if (!validationResult.valid) {
    return c.json(
      {
        error: {
          message: validationResult.error,
          type: "invalid_request_error",
          code: "validation_error",
        },
      },
      400
    );
  }

  const requestId = c.req.header("x-request-id") || `vid-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const idempotencyKey = c.req.header("idempotency-key");

  if (idempotencyKey) {
    const existing = await dbStore.getRequestByIdempotencyKey(idempotencyKey);
    if (existing && existing.status === "completed" && existing.response_payload) {
      return c.json(existing.response_payload);
    }
  }

  const requestHash = receiptService.hashData(validationResult.request);
  const quote = calculateRequestQuote(model, validationResult.request);
  const payer = c.req.header("x-payer-address") || "anonymous-payer";

  await dbStore.saveRequest({
    id: requestId,
    idempotency_key: idempotencyKey,
    payer_address: payer,
    pay_to_address: config.payToAddress,
    network: config.networkCaip2,
    txid: c.req.header("x-txid") || null,
    model_slug: model.slug,
    modality: "video",
    quote_amount_usd: quote.finalPriceUsd,
    quote_microusdc: quote.microUsdc,
    payment_flow: "upfront",
    status: "settled",
    request_hash: requestHash,
  });

  const provider = defaultProviderRegistry.getProvider(model.provider);
  try {
    if (!provider.generateVideo) {
      throw new Error(`Provider '${provider.id}' does not implement video generation.`);
    }
    const response = await provider.generateVideo(
      model.upstreamModelId,
      validationResult.request,
      model.slug
    );

    const jobId = response.id || `job-${Date.now()}`;
    await dbStore.saveJob({
      id: jobId,
      request_id: requestId,
      payer_address: payer,
      model_slug: model.slug,
      status: response.status === "completed" ? "completed" : "processing",
      video_url: response.video_url || null,
    });

    const responseHash = receiptService.hashData(response);
    const receipt = receiptService.signReceipt({
      requestId,
      txid: c.req.header("x-txid") || `tx-${Date.now()}`,
      network: config.networkCaip2,
      payer,
      payTo: config.payToAddress,
      amountUsd: quote.formattedPrice,
      amountMicroUsdc: quote.microUsdc,
      modelSlug: model.slug,
      modality: "video",
      upstreamProvider: response.upstreamProvider || model.provider,
      upstreamModel: response.upstreamModel || model.upstreamModelId,
      requestSha256: requestHash,
      responseSha256: responseHash,
    });

    await dbStore.updateRequestStatus(requestId, "completed", {
      upstream_provider: response.upstreamProvider || model.provider,
      upstream_model: response.upstreamModel || model.upstreamModelId,
      upstream_cost_usd: response.upstreamCostUsd,
      response_hash: responseHash,
      response_payload: response,
    });

    c.header("Moltworld-Receipt", JSON.stringify(receipt));

    // Return 202 Accepted with polling job endpoint
    return c.json(
      {
        ...response,
        poll_endpoint: `/v1/jobs/${jobId}`,
        moltworld: {
          receipt,
        },
      },
      response.status === "processing" ? 202 : 200
    );
  } catch (err: any) {
    await dbStore.updateRequestStatus(requestId, "failed", {
      error_message: err.message,
    });
    return c.json(
      {
        error: {
          message: err.message || "Failed to generate video from upstream provider.",
          type: "api_error",
          code: "provider_error",
        },
      },
      502
    );
  }
}
