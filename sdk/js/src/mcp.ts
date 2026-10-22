#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { realpathSync } from "fs";
import { pathToFileURL } from "url";
import { MoltworldClient, MoltworldError } from "./index.js";

/**
 * Local MCP server that lets an agent pay Moltworld by itself, within limits:
 *   MOLTWORLD_MANDATE      base64 JSON {owner, programB64, delegationSigB64} (recommended: on-chain limits)
 *   MOLTWORLD_MNEMONIC     or a dedicated low-balance wallet
 *   MOLTWORLD_MAX_PER_REQUEST_USD   default 0.50
 *   MOLTWORLD_BUDGET_USD            default 5 per server session
 *   MOLTWORLD_URL                   default https://moltworld.xyz
 */
function clientFromEnv(): MoltworldClient {
  const mandate = process.env.MOLTWORLD_MANDATE
    ? JSON.parse(Buffer.from(process.env.MOLTWORLD_MANDATE, "base64").toString("utf8"))
    : undefined;
  return new MoltworldClient({
    baseUrl: process.env.MOLTWORLD_URL,
    mandate,
    mnemonic: mandate ? undefined : process.env.MOLTWORLD_MNEMONIC,
    maxPerRequestUsd: Number(process.env.MOLTWORLD_MAX_PER_REQUEST_USD ?? 0.5),
    budgetUsd: Number(process.env.MOLTWORLD_BUDGET_USD ?? 5),
  });
}

const json = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
const failure = (err: unknown) => ({
  isError: true,
  ...json(err instanceof MoltworldError ? { status: err.status, code: err.code, message: err.message } : { message: String((err as any)?.message ?? err) }),
}) as ReturnType<typeof json> & { isError: true };

function paidSummary(result: Awaited<ReturnType<MoltworldClient["call"]>>, client: MoltworldClient) {
  return {
    output: result.data,
    paid_usdc: result.paidMicro / 1_000_000,
    receipt_verified: result.verification?.ok ?? false,
    request_id: result.requestId,
    txid: result.receipt?.txid,
    session_spent_usdc: client.spentUsd,
  };
}

export async function main() {
  const client = clientFromEnv();
  const server = new McpServer({ name: "moltworld-wallet", version: "1.0.0" });
  const chatMessage = z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string() });

  server.registerTool(
    "moltworld_models",
    { description: "List available models with their 'from' price in USDC.", inputSchema: z.object({ modality: z.enum(["chat", "image", "voice", "video"]).optional() }) },
    async ({ modality }) => json((await client.models(modality)).map((m: any) => ({ id: m.id, name: m.name, modality: m.modality, from_price: m.from_price })))
  );

  server.registerTool(
    "moltworld_quote",
    { description: "Exact price of a request before paying.", inputSchema: z.object({ model: z.string(), body: z.record(z.string(), z.unknown()) }) },
    async ({ model, body }) => {
      try {
        return json(await client.quote(model, body));
      } catch (err) {
        return failure(err);
      }
    }
  );

  server.registerTool(
    "moltworld_chat",
    {
      description: "Paid chat completion. Pays automatically in USDC within this server's spend limits; unused max_tokens budget is rebated.",
      inputSchema: z.object({ model: z.string(), messages: z.array(chatMessage).min(1), max_tokens: z.number().int().positive().optional() }),
    },
    async ({ model, messages, max_tokens }) => {
      try {
        return json(paidSummary(await client.chat(model, { messages, max_tokens }), client));
      } catch (err) {
        return failure(err);
      }
    }
  );

  server.registerTool(
    "moltworld_image",
    { description: "Paid image generation (refunded if it fails).", inputSchema: z.object({ model: z.string(), prompt: z.string(), size: z.string().optional(), n: z.number().int().optional() }) },
    async ({ model, prompt, size, n }) => {
      try {
        return json(paidSummary(await client.image(model, { prompt, size, n }), client));
      } catch (err) {
        return failure(err);
      }
    }
  );

  server.registerTool(
    "moltworld_speech",
    { description: "Paid text-to-speech; returns base64 audio.", inputSchema: z.object({ model: z.string(), input: z.string(), voice: z.string().optional() }) },
    async ({ model, input, voice }) => {
      try {
        return json(paidSummary(await client.speech(model, { input, voice }), client));
      } catch (err) {
        return failure(err);
      }
    }
  );

  server.registerTool(
    "moltworld_video",
    {
      description: "Paid video generation. Returns a job; set wait=true to block until the video URL is ready (failed jobs are refunded).",
      inputSchema: z.object({ model: z.string(), prompt: z.string(), duration: z.number().int().optional(), wait: z.boolean().optional() }),
    },
    async ({ model, prompt, duration, wait }) => {
      try {
        const result = await client.video(model, { prompt, duration });
        const summary = paidSummary(result, client);
        if (!wait) return json(summary);
        return json({ ...summary, job: await client.waitForJob((result.data as any).id) });
      } catch (err) {
        return failure(err);
      }
    }
  );

  server.registerTool(
    "moltworld_spend",
    { description: "Wallet address and USDC spent in this session.", inputSchema: z.object({}) },
    async () => json({ address: client.address, session_spent_usdc: client.spentUsd, budget_usdc: Number(process.env.MOLTWORLD_BUDGET_USD ?? 5) })
  );

  await server.connect(new StdioServerTransport());
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
