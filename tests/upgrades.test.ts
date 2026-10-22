import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../src/app.js";
import { receiptService } from "../src/receipts/index.js";
import { calculateRequestQuote, formatUsdcPrice } from "../src/pricing/index.js";
import { defaultModelRegistry } from "../src/models/registry.js";
import { dbStore } from "../src/store/db.js";
import { redisStore } from "../src/store/redis.js";
import { refundService } from "../src/refunds/index.js";

describe("Moltworld x402 Gateway - Upgrades & Core Innovations", () => {
  it("POST /v1/quote returns accurate per-request cost-plus quotes", async () => {
    const res = await app.fetch(
      new Request("http://localhost/v1/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt",
          messages: [{ role: "user", content: "Tell me a story about Algorand" }],
          max_tokens: 500,
        }),
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.model).toBe("gpt");
    expect(body.quote).toBeDefined();
    expect(body.quote.marginPercent).toBe(30);
    expect(body.quote.maxOutputTokens).toBe(500);
    expect(body.quote.finalPriceUsd).toBeGreaterThanOrEqual(0.001);
    expect(body.quote.formattedPrice).toMatch(/^\$\d+\.\d+$/);
  });

  it("calculates exact quotes for image, voice, and video modalities", () => {
    const fluxModel = defaultModelRegistry.getModel("flux-2-pro")!;
    const imageQuote = calculateRequestQuote(fluxModel, { n: 2 });
    expect(imageQuote.imageCount).toBe(2);
    expect(imageQuote.finalPriceUsd).toBeGreaterThan(0.05);

    const voiceModel = defaultModelRegistry.getModel("tts-1")!;
    const voiceQuote = calculateRequestQuote(voiceModel, { input: "Hello world from Algorand" });
    expect(voiceQuote.characterCount).toBe(25);
    expect(voiceQuote.finalPriceUsd).toBeGreaterThanOrEqual(0.001);

    const videoModel = defaultModelRegistry.getModel("sora-2-pro")!;
    const videoQuote = calculateRequestQuote(videoModel, { duration: 5 });
    expect(videoQuote.durationSeconds).toBe(5);
    expect(videoQuote.finalPriceUsd).toBe(1.30); // 5s * 0.20 + 30% = 1.30
    expect(videoQuote.formattedPrice).toBe("$1.3");
  });

  it("GET /v1/stats accurately segregates operator test traffic from organic client metrics", async () => {
    const res = await app.fetch(new Request("http://localhost/v1/stats"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.product).toBe("Moltworld x402 AI Gateway");
    expect(body.metrics).toBeDefined();
    expect(body.metrics.operator_test_traffic_requests).toBeDefined();
    expect(body.reporting_policy).toContain("excluded from organic metrics");
  });

  it("GET /.well-known/moltworld-receipts.json exposes valid Ed25519 public key", async () => {
    const res = await app.fetch(new Request("http://localhost/.well-known/moltworld-receipts.json"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.algorithm).toBe("Ed25519");
    expect(body.publicKey).toBeTruthy();
    expect(body.format).toBe("spki-der-base64");
  });

  it("signs and cryptographically verifies receipts with Ed25519", () => {
    const testData = {
      requestId: "test-req-12345",
      txid: "SIMULATED_TXID_ALGORAND_ABCDEF123456",
      network: "algorand:testnet",
      payer: "TESTPAYERADDRESS1234567890ABCDEF",
      payTo: "MERCHANTPAYTOADDRESS1234567890ABC",
      amountUsd: "$0.005",
      amountMicroUsdc: 5000,
      modelSlug: "gpt-4o",
      modality: "chat",
      upstreamProvider: "openrouter",
      upstreamModel: "openai/gpt-4o",
      requestSha256: receiptService.hashData({ prompt: "test prompt" }),
      responseSha256: receiptService.hashData({ output: "test response" }),
    };

    const receipt = receiptService.signReceipt(testData);
    expect(receipt.signature).toBeTruthy();
    expect(receipt.publicKey).toBeTruthy();

    const isValid = receiptService.verifyReceipt(receipt);
    expect(isValid).toBe(true);

    // Tampered receipt must fail verification
    const tampered = { ...receipt, amountUsd: "$0.001" };
    const isTamperedValid = receiptService.verifyReceipt(tampered);
    expect(isTamperedValid).toBe(false);
  });

  it("handles distributed rate limiting with sliding window", async () => {
    const key = `test-limit-${Date.now()}`;
    const first = await redisStore.checkRateLimit(key, 3, 1000);
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(2);

    await redisStore.checkRateLimit(key, 3, 1000);
    await redisStore.checkRateLimit(key, 3, 1000);

    const fourth = await redisStore.checkRateLimit(key, 3, 1000);
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
  });

  it("manages per-payer fund reservations to prevent concurrent double-spending", async () => {
    const payer = "PAYER_WALLET_CONCURRENCY_TEST";
    await redisStore.reservePayerFunds(payer, 5000);
    const reserved = await redisStore.getReservedFunds(payer);
    expect(reserved).toBe(5000);

    await redisStore.releasePayerFunds(payer, 5000);
    const released = await redisStore.getReservedFunds(payer);
    expect(released).toBe(0);
  });

  it("records automated refunds for failed upfront operations", async () => {
    const refundResult = await refundService.processRefund({
      requestId: "req-refund-test-1",
      payerAddress: "PAYER_ADDRESS_REFUND_TEST",
      amountMicroUsdc: 250000,
      reason: "Upstream fal.ai timeout during video generation",
    });

    expect(refundResult.success).toBe(true);
  });
});
