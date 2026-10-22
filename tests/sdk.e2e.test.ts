import { afterAll, beforeAll, describe, expect, it } from "vitest";
import algosdk from "algosdk";
import { Harness, startHarness } from "./helpers/harness.js";
import { MoltworldClient, MoltworldError, createMandate, revokeMandate, verifyDraft, assembleMandate as sdkAssemble } from "../sdk/js/src/index.js";

let harness: Harness;
let app: any;
let gatewayFetch: typeof fetch;

beforeAll(async () => {
  harness = await startHarness();
  process.env.FACILITATOR_URL = harness.facilitatorUrl;
  process.env.ALGOD_URL = harness.algodUrl;
  const mod = await import("../src/app.js");
  app = mod.app;
  await mod.init();
  gatewayFetch = ((input: RequestInfo | URL, init?: RequestInit) => app.fetch(new Request(input as any, init))) as typeof fetch;
});
afterAll(() => harness.close());

function fundedClient(options: Partial<ConstructorParameters<typeof MoltworldClient>[0]> = {}) {
  const account = algosdk.generateAccount();
  harness.chain.balances.set(account.addr.toString(), 5_000_000);
  return new MoltworldClient({
    baseUrl: "http://localhost",
    privateKeyBase64: Buffer.from(account.sk).toString("base64"),
    algodUrl: harness.algodUrl,
    fetch: gatewayFetch,
    ...options,
  });
}

describe("JS SDK", () => {
  it("pays, and verifies the receipt against the request and response bytes", async () => {
    const client = fundedClient();
    const quote = await client.quote("gpt-4o", { messages: [{ role: "user", content: "hello" }], max_tokens: 500 });
    const result = await client.chat("gpt-4o", { messages: [{ role: "user", content: "hello" }], max_tokens: 500 });
    expect(result.verification?.ok).toBe(true);
    expect(result.verification?.requestMatches).toBe(true);
    expect(result.verification?.responseMatches).toBe(true);
    expect(result.paidMicro).toBe(quote.microUsdc);
    expect(result.receipt?.payer).toBe(client.address);
    expect(client.spentUsd).toBeCloseTo(quote.microUsdc / 1e6, 6);
  });

  it("enforces the per-request cap and session budget before signing", async () => {
    const capped = fundedClient({ maxPerRequestUsd: 0.001 });
    await expect(capped.chat("gpt-4o", { messages: [{ role: "user", content: "x" }], max_tokens: 2000 })).rejects.toThrow(/maxAmountPerPayment|rejected/i);

    const budgeted = fundedClient({ budgetUsd: 0.002 });
    await budgeted.chat("gpt", { messages: [{ role: "user", content: "x" }], max_tokens: 50 });
    await budgeted.chat("gpt", { messages: [{ role: "user", content: "x" }], max_tokens: 50 });
    await expect(budgeted.chat("gpt", { messages: [{ role: "user", content: "x" }], max_tokens: 50 })).rejects.toThrow(/Budget/);
    expect(budgeted.spentUsd).toBeLessThanOrEqual(0.002);
  });

  it("refuses to pay an unexpected address", async () => {
    const client = fundedClient({ expectedPayTo: algosdk.generateAccount().addr.toString() });
    await expect(client.chat("gpt", { messages: [{ role: "user", content: "x" }] })).rejects.toThrow(/Refusing to pay/);
  });

  it("surfaces gateway errors with codes", async () => {
    const client = fundedClient();
    const err = await client.chat("gpt", { messages: [] as any }).catch((e) => e);
    expect(err).toBeInstanceOf(MoltworldError);
    expect(err.status).toBe(400);
  });

  it("creates a mandate, lets an agent pay under it, and revokes it", async () => {
    const owner = algosdk.generateAccount();
    harness.chain.balances.set(owner.addr.toString(), 5_000_000);
    const { mandateId, credential } = await createMandate("http://localhost", owner, { maxPerCallUsd: 0.25, dailyCapUsd: 1 }, gatewayFetch);
    const agent = new MoltworldClient({ baseUrl: "http://localhost", mandate: credential, algodUrl: harness.algodUrl, fetch: gatewayFetch });
    const result = await agent.chat("gpt", { messages: [{ role: "user", content: "paid by mandate" }] });
    expect(result.receipt?.payer).toBe(owner.addr.toString());
    expect(harness.chain.settled.at(-1)!.lsig).toBe(true);

    await revokeMandate("http://localhost", owner, mandateId, gatewayFetch);
    await expect(agent.chat("gpt", { messages: [{ role: "user", content: "after revoke" }] })).rejects.toThrow(/mandate/i);
  });

  it("refuses to sign a draft whose program differs from what was asked", async () => {
    const draftRes = await gatewayFetch("http://localhost/v1/mandates/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner: algosdk.generateAccount().addr.toString(), max_per_call_usd: 0.5, daily_cap_usd: 1 }),
    });
    const draft = await draftRes.json();
    const health = await (await gatewayFetch("http://localhost/health")).json();
    expect(() => verifyDraft(draft, { payTo: health.pay_to, assetId: Number(health.usdc_asset_id), maxPerCallMicro: 500_000 })).not.toThrow();
    expect(() => verifyDraft(draft, { payTo: health.pay_to, assetId: Number(health.usdc_asset_id), maxPerCallMicro: 100_000 })).toThrow(/Do not sign/);
    const evil = algosdk.generateAccount().addr.toString();
    expect(() => verifyDraft(draft, { payTo: evil, assetId: Number(health.usdc_asset_id), maxPerCallMicro: 500_000 })).toThrow();
  });

  it("assembles mandates byte-identically to the gateway", async () => {
    const { assembleMandate } = await import("../src/mandates/index.js");
    const t = { payTo: algosdk.generateAccount().addr.toString(), assetId: 31566704, maxPerCallMicro: 123456, expiryRound: 99999999, salt: new Uint8Array(16).fill(9) };
    expect(Buffer.from(sdkAssemble(t)).equals(Buffer.from(assembleMandate(t)))).toBe(true);
  });
});
