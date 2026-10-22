import readline from "readline";
import { MoltworldClient } from "../js/index.js";

const client = new MoltworldClient({
  baseUrl: process.env.MOLTWORLD_URL || "https://moltworld.xyz",
  mnemonic: process.env.ALGORAND_MNEMONIC,
  logicSig: process.env.ALGORAND_LOGICSIG_BASE64
    ? JSON.parse(Buffer.from(process.env.ALGORAND_LOGICSIG_BASE64, "base64").toString("utf-8"))
    : undefined,
});

const TOOLS = [
  {
    name: "moltworld_quote",
    description: "Get real-time cost-plus pricing quote for any Moltworld model call before spending.",
    inputSchema: {
      type: "object",
      properties: {
        model: { type: "string", description: "Model slug e.g. gpt, claude-sonnet, flux-2-pro" },
        messages: { type: "array", description: "Optional chat messages array" },
        prompt: { type: "string", description: "Prompt for image/video" },
        max_tokens: { type: "integer", description: "Maximum output tokens" },
      },
      required: ["model"],
    },
  },
  {
    name: "moltworld_chat",
    description: "Execute chat completion through Moltworld paid autonomously per call with Algorand USDC.",
    inputSchema: {
      type: "object",
      properties: {
        model: { type: "string", description: "Model slug e.g. gpt-4o, claude-sonnet, gemini-pro" },
        messages: {
          type: "array",
          items: {
            type: "object",
            properties: {
              role: { type: "string", enum: ["system", "user", "assistant"] },
              content: { type: "string" },
            },
            required: ["role", "content"],
          },
        },
        temperature: { type: "number" },
        max_tokens: { type: "integer" },
      },
      required: ["model", "messages"],
    },
  },
  {
    name: "moltworld_generate_image",
    description: "Generate images via FLUX.2 Pro, Recraft V3/V4, Seedream, or Grok Imagine through Moltworld.",
    inputSchema: {
      type: "object",
      properties: {
        model: { type: "string", description: "Image model slug e.g. flux-2-pro, recraft-v4.1-flash" },
        prompt: { type: "string", description: "Image generation prompt" },
        size: { type: "string", enum: ["1024x1024", "1024x1792", "1792x1024", "512x512"] },
      },
      required: ["model", "prompt"],
    },
  },
  {
    name: "moltworld_synthesize_voice",
    description: "Generate high-fidelity audio speech via ElevenLabs Multilingual V2 or OpenAI TTS-1.",
    inputSchema: {
      type: "object",
      properties: {
        model: { type: "string", description: "Voice model slug e.g. eleven-multilingual, tts-1" },
        input: { type: "string", description: "Text input to synthesize" },
        voice: { type: "string", description: "Voice name or ID" },
      },
      required: ["model", "input"],
    },
  },
  {
    name: "moltworld_generate_video",
    description: "Generate video via Sora 2 Pro, Veo 3.1, Kling V3, Wan 3.0, or Hailuo H3 through Moltworld.",
    inputSchema: {
      type: "object",
      properties: {
        model: { type: "string", description: "Video model slug e.g. sora-2-pro, veo-3.1-fast, kling-v3.0-std" },
        prompt: { type: "string", description: "Cinematic video prompt" },
        duration: { type: "integer", minimum: 1, maximum: 10 },
      },
      required: ["model", "prompt"],
    },
  },
  {
    name: "moltworld_verify_receipt",
    description: "Verify the cryptographic Ed25519 signature and hash integrity of any Moltworld receipt.",
    inputSchema: {
      type: "object",
      properties: {
        receipt: { type: "object", description: "Moltworld receipt object" },
      },
      required: ["receipt"],
    },
  },
];

async function handleRpc(msg: any) {
  const { id, method, params } = msg;

  if (method === "tools/list") {
    return { id, result: { tools: TOOLS } };
  }

  if (method === "tools/call") {
    const { name, arguments: args } = params;
    try {
      let resultData: any;

      switch (name) {
        case "moltworld_quote":
          resultData = await client.quote(args.model, args);
          break;
        case "moltworld_chat":
          resultData = await client.chat(args.model, args.messages, {
            temperature: args.temperature,
            max_tokens: args.max_tokens,
          });
          break;
        case "moltworld_generate_image":
          resultData = await client.image(args.model, args.prompt, { size: args.size });
          break;
        case "moltworld_synthesize_voice":
          resultData = await client.voice(args.model, args.input, { voice: args.voice });
          break;
        case "moltworld_generate_video":
          resultData = await client.video(args.model, args.prompt, { duration: args.duration });
          break;
        case "moltworld_verify_receipt":
          resultData = { valid: client.verifyReceipt(args.receipt) };
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(resultData, null, 2) }],
        },
      };
    } catch (err: any) {
      return {
        id,
        error: { code: -32603, message: err.message },
      };
    }
  }

  return { id, error: { code: -32601, message: "Method not found" } };
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on("line", async (line) => {
    if (!line.trim()) return;
    try {
      const msg = JSON.parse(line);
      const res = await handleRpc(msg);
      process.stdout.write(JSON.stringify(res) + "\n");
    } catch (err: any) {
      process.stdout.write(JSON.stringify({ error: { code: -32700, message: "Parse error" } }) + "\n");
    }
  });
}

main().catch(console.error);
