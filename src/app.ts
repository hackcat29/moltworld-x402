import { Hono } from "hono";
import { cors } from "hono/cors";
import { paymentMiddleware } from "@x402/hono";
import { createX402Server } from "./x402/server.js";
import {
  requestIdMiddleware,
  securityHeadersMiddleware,
  rateLimitFreeRoutesMiddleware,
  structuredLogger,
  safeErrorHandler,
} from "./middleware/security.js";
import { renderLandingPage } from "./routes/landing.js";
import { handleLlmsTxt, handleX402Discovery } from "./routes/metadata.js";
import { getAgentCard, handleA2a } from "./routes/a2a.js";
import { createMcpRoute } from "./routes/mcp.js";
import {
  handleHealth,
  handleListModels,
  handleChatCompletion,
  handleImageGeneration,
  handleAudioSpeech,
  handleVideoGeneration,
  handleQuote,
  handleStats,
  handleGetJob,
  handleGetReceipt,
  handleReceiptPublicKey,
  setGatewayReady,
} from "./routes/api.js";
import { defaultModelRegistry } from "./models/registry.js";
import { getLogoBytes, getFaviconBytes, getFavicon32Bytes } from "./assets/images.js";

export function createApp(): {
  app: Hono;
  init: () => Promise<void>;
} {
  const app = new Hono();
  const { server, routes } = createX402Server();
  const handleMcp = createMcpRoute(async (request) => app.fetch(request));

  // Global Error Handler
  app.onError(safeErrorHandler);

  // Request ID & Logger
  app.use("*", requestIdMiddleware);
  app.use("*", structuredLogger);
  app.use("*", securityHeadersMiddleware);

  // CORS Configuration
  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: [
        "Content-Type",
        "Authorization",
        "Payment-Signature",
        "Payment-Required",
        "x-request-id",
        "idempotency-key",
      ],
      exposeHeaders: [
        "Payment-Required",
        "Payment-Response",
        "Moltworld-Receipt",
        "x-request-id",
        "Content-Type",
      ],
      maxAge: 86400,
    })
  );

  // Rate Limiting for Free / Unpaid Endpoints
  app.use("/", rateLimitFreeRoutesMiddleware);
  app.use("/health", rateLimitFreeRoutesMiddleware);
  app.use("/v1/models", rateLimitFreeRoutesMiddleware);
  app.use("/v1/stats", rateLimitFreeRoutesMiddleware);
  app.use("/v1/quote", rateLimitFreeRoutesMiddleware);
  app.use("/v1/jobs/*", rateLimitFreeRoutesMiddleware);
  app.use("/v1/receipts/*", rateLimitFreeRoutesMiddleware);
  app.use("/.well-known/*", rateLimitFreeRoutesMiddleware);
  app.use("/llms.txt", rateLimitFreeRoutesMiddleware);
  app.use("/a2a", rateLimitFreeRoutesMiddleware);
  app.use("/mcp", rateLimitFreeRoutesMiddleware);

  // Free Public Endpoints
  app.get("/", renderLandingPage);
  app.get("/health", handleHealth);
  app.get("/v1/models", handleListModels);
  app.post("/v1/quote", handleQuote);
  app.get("/v1/stats", handleStats);
  app.get("/v1/jobs/:id", handleGetJob);
  app.get("/v1/receipts/:id", handleGetReceipt);
  app.get("/.well-known/moltworld-receipts.json", handleReceiptPublicKey);
  app.get("/llms.txt", handleLlmsTxt);
  app.get("/.well-known/x402", handleX402Discovery);
  app.get("/.well-known/agent-card.json", (c) => c.json(getAgentCard(), 200, { "Cache-Control": "public, max-age=300" }));
  app.post("/a2a", (c) => handleA2a(c.req.raw));
  app.all("/mcp", (c) => handleMcp(c.req.raw));

  // Static brand assets (Logo & Favicon)
  app.get("/logo.png", () => {
    return new Response(getLogoBytes() as unknown as BodyInit, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  });

  app.get("/favicon.png", () => {
    return new Response(getFaviconBytes() as unknown as BodyInit, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  });

  app.get("/favicon-32.png", () => {
    return new Response(getFavicon32Bytes() as unknown as BodyInit, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  });

  app.get("/favicon.ico", () => {
    return new Response(getFavicon32Bytes() as unknown as BodyInit, {
      headers: {
        "Content-Type": "image/x-icon",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  });

  app.get("/apple-touch-icon.png", () => {
    return new Response(getLogoBytes() as unknown as BodyInit, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  });

  // x402 Payment Middleware for Protected Routes
  app.use(paymentMiddleware(routes, server, undefined, undefined, false));

  // Explicit Protected Model Routes
  const models = defaultModelRegistry.getEnabledModels();
  for (const model of models) {
    switch (model.modality) {
      case "chat":
        app.post(`/v1/models/${model.slug}/chat/completions`, handleChatCompletion);
        break;
      case "image":
        app.post(`/v1/models/${model.slug}/images/generations`, handleImageGeneration);
        break;
      case "voice":
        app.post(`/v1/models/${model.slug}/audio/speech`, handleAudioSpeech);
        break;
      case "video":
        app.post(`/v1/models/${model.slug}/videos/generations`, handleVideoGeneration);
        break;
    }
  }

  // Generic Parameterized Routes
  app.post("/v1/models/:model/chat/completions", handleChatCompletion);
  app.post("/v1/models/:model/images/generations", handleImageGeneration);
  app.post("/v1/models/:model/audio/speech", handleAudioSpeech);
  app.post("/v1/models/:model/videos/generations", handleVideoGeneration);

  const init = async () => {
    try {
      await server.initialize();
      setGatewayReady(true);
      console.log("x402 Facilitator initialized successfully. Gateway is READY.");
    } catch (err: any) {
      const msg = err?.message || String(err);
      setGatewayReady(false, msg);
      console.error("CRITICAL: x402 Facilitator initialization failed. Gateway failing closed:", msg);
      throw err;
    }
  };

  return { app, init };
}

export const { app, init } = createApp();
