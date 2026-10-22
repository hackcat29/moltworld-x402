import { ModelModality } from "../providers/types.js";

export interface ModelLimits {
  maxInputTokens?: number;
  maxOutputTokens?: number;
  maxMessages?: number;
  maxPromptChars?: number;
  maxDurationSeconds?: number;
}

export interface ModelPricingRates {
  inputPerMillionUsd?: number;
  outputPerMillionUsd?: number;
  unitRateUsd?: number; // per image, per 1k characters, or per video second
}

export interface ModelDefinition {
  slug: string;
  displayName: string;
  modality: ModelModality;
  provider: string; // e.g. "openrouter", "openai", "fal", "elevenlabs"
  upstreamModelId: string;
  price: string; // Base / minimum price e.g. "$0.003"
  rates?: ModelPricingRates;
  limits: ModelLimits;
  enabled: boolean;
  description: string;
  tags?: string[];
}

export function getModelEndpoint(model: ModelDefinition): string {
  switch (model.modality) {
    case "chat":
      return `/v1/models/${model.slug}/chat/completions`;
    case "image":
      return `/v1/models/${model.slug}/images/generations`;
    case "voice":
      return `/v1/models/${model.slug}/audio/speech`;
    case "video":
      return `/v1/models/${model.slug}/videos/generations`;
  }
}

export function getModelDiscoveryDescription(model: ModelDefinition): string {
  switch (model.modality) {
    case "chat":
      return `Send chat messages to ${model.displayName} and receive a JSON assistant reply with completion choices.`;
    case "image":
      return `Send a text prompt to ${model.displayName} and receive generated image URLs or base64 image data in JSON.`;
    case "voice":
      return `Send text to ${model.displayName} and receive a JSON speech result with an audio URL and format.`;
    case "video":
      return `Send a text prompt to ${model.displayName} and receive a JSON video result with a video URL, status, and duration.`;
  }
}

export const INITIAL_MODELS: ModelDefinition[] = [
  // ----------------------------------------------------
  // Chat Models (OpenRouter Verified Active Upstreams)
  // ----------------------------------------------------
  {
    slug: "gpt",
    displayName: "GPT-4o Mini",
    modality: "chat",
    provider: process.env.GPT_PROVIDER || "openrouter",
    upstreamModelId: process.env.GPT_UPSTREAM_MODEL || "openai/gpt-4o-mini",
    price: process.env.PRICE_GPT || "$0.003",
    rates: { inputPerMillionUsd: 0.15, outputPerMillionUsd: 0.60 },
    limits: {
      maxInputTokens: 4096,
      maxOutputTokens: 2048,
      maxMessages: 50,
      maxPromptChars: 32000,
    },
    enabled: true,
    description: "GPT inference through Moltworld: send chat messages and receive a normalized AI response.",
    tags: ["chat", "gpt", "openai", "x402-global-challenge"],
  },
  {
    slug: "gpt-4o",
    displayName: "GPT-4o",
    modality: "chat",
    provider: process.env.GPT4O_PROVIDER || "openrouter",
    upstreamModelId: process.env.GPT4O_UPSTREAM_MODEL || "openai/gpt-4o",
    price: process.env.PRICE_GPT4O || "$0.005",
    rates: { inputPerMillionUsd: 2.50, outputPerMillionUsd: 10.00 },
    limits: {
      maxInputTokens: 4096,
      maxOutputTokens: 1024,
      maxMessages: 50,
      maxPromptChars: 32000,
    },
    enabled: true,
    description: "GPT-4o flagship inference through Moltworld: state-of-the-art reasoning and knowledge.",
    tags: ["chat", "gpt-4o", "openai", "flagship", "x402-global-challenge"],
  },
  {
    slug: "claude-sonnet",
    displayName: "Claude Sonnet 4.5",
    modality: "chat",
    provider: process.env.CLAUDE_SONNET_PROVIDER || "openrouter",
    upstreamModelId: process.env.CLAUDE_SONNET_UPSTREAM_MODEL || "anthropic/claude-sonnet-4.5",
    price: process.env.PRICE_CLAUDE_SONNET || "$0.006",
    rates: { inputPerMillionUsd: 3.00, outputPerMillionUsd: 15.00 },
    limits: {
      maxInputTokens: 4096,
      maxOutputTokens: 1024,
      maxMessages: 50,
      maxPromptChars: 32000,
    },
    enabled: true,
    description: "Claude Sonnet 4.5 hybrid reasoning & coding intelligence through Moltworld.",
    tags: ["chat", "claude", "anthropic", "reasoning", "x402-global-challenge"],
  },
  {
    slug: "gemini",
    displayName: "Gemini 2.5 Flash",
    modality: "chat",
    provider: process.env.GEMINI_PROVIDER || "openrouter",
    upstreamModelId: process.env.GEMINI_UPSTREAM_MODEL || "google/gemini-2.5-flash",
    price: process.env.PRICE_GEMINI || "$0.002",
    rates: { inputPerMillionUsd: 0.30, outputPerMillionUsd: 2.50 },
    limits: {
      maxInputTokens: 4096,
      maxOutputTokens: 2048,
      maxMessages: 50,
      maxPromptChars: 32000,
    },
    enabled: true,
    description: "Gemini inference through Moltworld: send chat messages and receive a normalized AI response.",
    tags: ["chat", "gemini", "google", "x402-global-challenge"],
  },
  {
    slug: "gemini-lite",
    displayName: "Gemini 2.5 Flash Lite",
    modality: "chat",
    provider: "openrouter",
    upstreamModelId: "google/gemini-2.5-flash-lite",
    price: process.env.PRICE_GEMINI_LITE || "$0.001",
    rates: { inputPerMillionUsd: 0.10, outputPerMillionUsd: 0.40 },
    limits: {
      maxInputTokens: 4096,
      maxOutputTokens: 2048,
      maxMessages: 50,
      maxPromptChars: 32000,
    },
    enabled: true,
    description: "Gemini 2.5 Flash Lite ultra-low latency & cost-efficient inference through Moltworld.",
    tags: ["chat", "gemini", "google", "lite", "cheap", "x402-global-challenge"],
  },
  {
    slug: "gemini-pro",
    displayName: "Gemini 2.5 Pro",
    modality: "chat",
    provider: process.env.GEMINI_PRO_PROVIDER || "openrouter",
    upstreamModelId: process.env.GEMINI_PRO_UPSTREAM_MODEL || "google/gemini-2.5-pro",
    price: process.env.PRICE_GEMINI_PRO || "$0.004",
    rates: { inputPerMillionUsd: 1.25, outputPerMillionUsd: 10.00 },
    limits: {
      maxInputTokens: 4096,
      maxOutputTokens: 1024,
      maxMessages: 50,
      maxPromptChars: 32000,
    },
    enabled: true,
    description: "Gemini 2.5 Pro frontier reasoning and complex analysis through Moltworld.",
    tags: ["chat", "gemini", "google", "pro", "x402-global-challenge"],
  },
  {
    slug: "deepseek",
    displayName: "DeepSeek V3",
    modality: "chat",
    provider: process.env.DEEPSEEK_PROVIDER || "openrouter",
    upstreamModelId: process.env.DEEPSEEK_UPSTREAM_MODEL || "deepseek/deepseek-chat",
    price: process.env.PRICE_DEEPSEEK || "$0.001",
    rates: { inputPerMillionUsd: 0.26, outputPerMillionUsd: 1.03 },
    limits: {
      maxInputTokens: 4096,
      maxOutputTokens: 2048,
      maxMessages: 50,
      maxPromptChars: 32000,
    },
    enabled: true,
    description: "DeepSeek inference through Moltworld: send chat messages and receive a normalized AI response.",
    tags: ["chat", "deepseek", "x402-global-challenge"],
  },
  {
    slug: "llama",
    displayName: "Llama 3.3 70B",
    modality: "chat",
    provider: process.env.LLAMA_PROVIDER || "openrouter",
    upstreamModelId: process.env.LLAMA_UPSTREAM_MODEL || "meta-llama/llama-3.3-70b-instruct",
    price: process.env.PRICE_LLAMA || "$0.001",
    rates: { inputPerMillionUsd: 0.10, outputPerMillionUsd: 0.32 },
    limits: {
      maxInputTokens: 4096,
      maxOutputTokens: 2048,
      maxMessages: 50,
      maxPromptChars: 32000,
    },
    enabled: true,
    description: "Llama 3.3 70B open-weights flagship inference through Moltworld.",
    tags: ["chat", "llama", "meta", "open-source", "x402-global-challenge"],
  },
  {
    slug: "gpt-6-astra",
    displayName: "GPT-6 Astra",
    modality: "chat",
    provider: "openrouter",
    upstreamModelId: "openai/gpt-6-astra",
    price: process.env.PRICE_GPT_6_ASTRA || "$0.80",
    rates: { inputPerMillionUsd: 10.00, outputPerMillionUsd: 50.00 },
    limits: {
      maxInputTokens: 4096,
      maxOutputTokens: 4096,
      maxMessages: 50,
      maxPromptChars: 32000,
    },
    enabled: true,
    description: "GPT-6 Astra next-generation frontier reasoning and long-horizon agentic planning through Moltworld.",
    tags: ["chat", "gpt", "openai", "gpt-6", "astra", "frontier", "x402-global-challenge"],
  },
  {
    slug: "gpt-6-sol",
    displayName: "GPT-6 Sol",
    modality: "chat",
    provider: "openrouter",
    upstreamModelId: "openai/gpt-6-sol",
    price: process.env.PRICE_GPT_6_SOL || "$0.70",
    rates: { inputPerMillionUsd: 2.00, outputPerMillionUsd: 10.00 },
    limits: {
      maxInputTokens: 4096,
      maxOutputTokens: 4096,
      maxMessages: 50,
      maxPromptChars: 32000,
    },
    enabled: true,
    description: "GPT-6 Sol frontier intelligence balancing maximum depth with production latency through Moltworld.",
    tags: ["chat", "gpt", "openai", "gpt-6", "sol", "frontier", "x402-global-challenge"],
  },
  {
    slug: "gpt-5.4-pro",
    displayName: "GPT-5.4 Pro",
    modality: "chat",
    provider: "openrouter",
    upstreamModelId: "openai/gpt-5.4-pro",
    price: process.env.PRICE_GPT_5_4_PRO || "$0.60",
    rates: { inputPerMillionUsd: 30.00, outputPerMillionUsd: 180.00 },
    limits: {
      maxInputTokens: 4096,
      maxOutputTokens: 4096,
      maxMessages: 50,
      maxPromptChars: 32000,
    },
    enabled: true,
    description: "GPT-5.4 Pro frontier reasoning & maximum depth intelligence through Moltworld.",
    tags: ["chat", "gpt", "openai", "pro", "frontier", "x402-global-challenge"],
  },
  {
    slug: "gpt-5.2-pro",
    displayName: "GPT-5.2 Pro",
    modality: "chat",
    provider: "openrouter",
    upstreamModelId: "openai/gpt-5.2-pro",
    price: process.env.PRICE_GPT_5_2_PRO || "$0.50",
    rates: { inputPerMillionUsd: 21.00, outputPerMillionUsd: 168.00 },
    limits: {
      maxInputTokens: 4096,
      maxOutputTokens: 4096,
      maxMessages: 50,
      maxPromptChars: 32000,
    },
    enabled: true,
    description: "GPT-5.2 Pro elite multi-step reasoning and deep knowledge synthesis through Moltworld.",
    tags: ["chat", "gpt", "openai", "pro", "x402-global-challenge"],
  },
  {
    slug: "gpt-5-pro",
    displayName: "GPT-5 Pro",
    modality: "chat",
    provider: "openrouter",
    upstreamModelId: "openai/gpt-5-pro",
    price: process.env.PRICE_GPT_5_PRO || "$0.35",
    rates: { inputPerMillionUsd: 15.00, outputPerMillionUsd: 120.00 },
    limits: {
      maxInputTokens: 4096,
      maxOutputTokens: 4096,
      maxMessages: 50,
      maxPromptChars: 32000,
    },
    enabled: true,
    description: "GPT-5 Pro next-generation reasoning and technical problem solving through Moltworld.",
    tags: ["chat", "gpt", "openai", "pro", "x402-global-challenge"],
  },
  {
    slug: "o3-pro",
    displayName: "o3 Pro",
    modality: "chat",
    provider: "openrouter",
    upstreamModelId: "openai/o3-pro",
    price: process.env.PRICE_O3_PRO || "$0.25",
    rates: { inputPerMillionUsd: 20.00, outputPerMillionUsd: 80.00 },
    limits: {
      maxInputTokens: 4096,
      maxOutputTokens: 4096,
      maxMessages: 50,
      maxPromptChars: 32000,
    },
    enabled: true,
    description: "o3 Pro rigorous chain-of-thought mathematical and algorithmic reasoning through Moltworld.",
    tags: ["chat", "o3", "openai", "reasoning", "x402-global-challenge"],
  },
  {
    slug: "claude-fable-5.1",
    displayName: "Claude Fable 5.1",
    modality: "chat",
    provider: "openrouter",
    upstreamModelId: "anthropic/claude-fable-5.1",
    price: process.env.PRICE_CLAUDE_FABLE_5_1 || "$0.15",
    rates: { inputPerMillionUsd: 10.00, outputPerMillionUsd: 50.00 },
    limits: {
      maxInputTokens: 4096,
      maxOutputTokens: 4096,
      maxMessages: 50,
      maxPromptChars: 32000,
    },
    enabled: true,
    description: "Claude Fable 5.1 high-end creative, narrative, and synthesis intelligence through Moltworld.",
    tags: ["chat", "claude", "anthropic", "fable", "x402-global-challenge"],
  },
  {
    slug: "claude-opus-5",
    displayName: "Claude Opus 5",
    modality: "chat",
    provider: "openrouter",
    upstreamModelId: "anthropic/claude-opus-5",
    price: process.env.PRICE_CLAUDE_OPUS_5 || "$0.055",
    rates: { inputPerMillionUsd: 5.00, outputPerMillionUsd: 25.00 },
    limits: {
      maxInputTokens: 4096,
      maxOutputTokens: 4096,
      maxMessages: 50,
      maxPromptChars: 32000,
    },
    enabled: true,
    description: "Claude Opus 5 deep context analysis, literature synthesis, and complex reasoning through Moltworld.",
    tags: ["chat", "claude", "anthropic", "opus", "x402-global-challenge"],
  },
  {
    slug: "claude-opus-5.5",
    displayName: "Claude Opus 5.5",
    modality: "chat",
    provider: "openrouter",
    upstreamModelId: "anthropic/claude-opus-5.5",
    price: process.env.PRICE_CLAUDE_OPUS_5_5 || "$0.060",
    rates: { inputPerMillionUsd: 4.00, outputPerMillionUsd: 20.00 },
    limits: {
      maxInputTokens: 4096,
      maxOutputTokens: 4096,
      maxMessages: 50,
      maxPromptChars: 32000,
    },
    enabled: true,
    description: "Claude Opus 5.5 enhanced analytical capabilities and code comprehension through Moltworld.",
    tags: ["chat", "claude", "anthropic", "opus", "x402-global-challenge"],
  },
  {
    slug: "gpt-5.4",
    displayName: "GPT-5.4",
    modality: "chat",
    provider: "openrouter",
    upstreamModelId: "openai/gpt-5.4",
    price: process.env.PRICE_GPT_5_4 || "$0.022",
    rates: { inputPerMillionUsd: 2.50, outputPerMillionUsd: 15.00 },
    limits: {
      maxInputTokens: 4096,
      maxOutputTokens: 4096,
      maxMessages: 50,
      maxPromptChars: 32000,
    },
    enabled: true,
    description: "GPT-5.4 versatile multi-domain intelligence and production reasoning through Moltworld.",
    tags: ["chat", "gpt", "openai", "x402-global-challenge"],
  },
  {
    slug: "gpt-5.2",
    displayName: "GPT-5.2",
    modality: "chat",
    provider: "openrouter",
    upstreamModelId: "openai/gpt-5.2",
    price: process.env.PRICE_GPT_5_2 || "$0.020",
    rates: { inputPerMillionUsd: 1.75, outputPerMillionUsd: 14.00 },
    limits: {
      maxInputTokens: 4096,
      maxOutputTokens: 4096,
      maxMessages: 50,
      maxPromptChars: 32000,
    },
    enabled: true,
    description: "GPT-5.2 balanced reasoning and fast instruction execution through Moltworld.",
    tags: ["chat", "gpt", "openai", "x402-global-challenge"],
  },
  {
    slug: "gpt-5.6-sol",
    displayName: "GPT-5.6 Sol",
    modality: "chat",
    provider: "openrouter",
    upstreamModelId: "openai/gpt-5.6-sol",
    price: process.env.PRICE_GPT_5_6_SOL || "$0.040",
    rates: { inputPerMillionUsd: 4.00, outputPerMillionUsd: 20.00 },
    limits: {
      maxInputTokens: 4096,
      maxOutputTokens: 4096,
      maxMessages: 50,
      maxPromptChars: 32000,
    },
    enabled: true,
    description: "GPT-5.6 Sol solar-class high-throughput instruction execution through Moltworld.",
    tags: ["chat", "gpt", "openai", "sol", "x402-global-challenge"],
  },
  {
    slug: "gemini-3.1-pro",
    displayName: "Gemini 3.1 Pro",
    modality: "chat",
    provider: "openrouter",
    upstreamModelId: "google/gemini-3.1-pro-preview",
    price: process.env.PRICE_GEMINI_3_1_PRO || "$0.035",
    rates: { inputPerMillionUsd: 2.00, outputPerMillionUsd: 12.00 },
    limits: {
      maxInputTokens: 4096,
      maxOutputTokens: 4096,
      maxMessages: 50,
      maxPromptChars: 32000,
    },
    enabled: true,
    description: "Gemini 3.1 Pro preview next-generation multimodal logic and code synthesis through Moltworld.",
    tags: ["chat", "gemini", "google", "pro", "x402-global-challenge"],
  },
  {
    slug: "gpt-5.6-terra",
    displayName: "GPT-5.6 Terra",
    modality: "chat",
    provider: "openrouter",
    upstreamModelId: "openai/gpt-5.6-terra",
    price: process.env.PRICE_GPT_5_6_TERRA || "$0.035",
    rates: { inputPerMillionUsd: 2.00, outputPerMillionUsd: 12.00 },
    limits: {
      maxInputTokens: 4096,
      maxOutputTokens: 4096,
      maxMessages: 50,
      maxPromptChars: 32000,
    },
    enabled: true,
    description: "GPT-5.6 Terra high-throughput terrestrial intelligence engine through Moltworld.",
    tags: ["chat", "gpt", "openai", "terra", "x402-global-challenge"],
  },
  {
    slug: "claude-sonnet-5",
    displayName: "Claude Sonnet 5",
    modality: "chat",
    provider: "openrouter",
    upstreamModelId: "anthropic/claude-sonnet-5",
    price: process.env.PRICE_CLAUDE_SONNET_5 || "$0.030",
    rates: { inputPerMillionUsd: 2.00, outputPerMillionUsd: 10.00 },
    limits: {
      maxInputTokens: 4096,
      maxOutputTokens: 4096,
      maxMessages: 50,
      maxPromptChars: 32000,
    },
    enabled: true,
    description: "Claude Sonnet 5 agile frontier reasoning, refactoring, and code generation through Moltworld.",
    tags: ["chat", "claude", "anthropic", "sonnet", "x402-global-challenge"],
  },
  {
    slug: "claude-sonnet-5.5",
    displayName: "Claude Sonnet 5.5",
    modality: "chat",
    provider: "openrouter",
    upstreamModelId: "anthropic/claude-sonnet-5.5",
    price: process.env.PRICE_CLAUDE_SONNET_5_5 || "$0.040",
    rates: { inputPerMillionUsd: 2.00, outputPerMillionUsd: 10.00 },
    limits: {
      maxInputTokens: 4096,
      maxOutputTokens: 4096,
      maxMessages: 50,
      maxPromptChars: 32000,
    },
    enabled: true,
    description: "Claude Sonnet 5.5 refined frontier reasoning, refactoring, and code generation through Moltworld.",
    tags: ["chat", "claude", "anthropic", "sonnet", "x402-global-challenge"],
  },

  // ----------------------------------------------------
  // Image Generation Models (fal.ai Upstream)
  // ----------------------------------------------------
  {
    slug: "recraft-v4.1-flash",
    displayName: "Recraft V4.1 Flash",
    modality: "image",
    provider: "fal",
    upstreamModelId: "fal-ai/recraft-v3",
    price: process.env.PRICE_RECRAFT_FLASH || "$0.05",
    rates: { unitRateUsd: 0.04 },
    limits: {
      maxPromptChars: 3000,
    },
    enabled: true,
    description: "Recraft V4.1 Flash ultra-fast design & vector raster generation through Moltworld.",
    tags: ["image", "recraft", "fast", "vector", "x402-global-challenge"],
  },
  {
    slug: "flux-2-pro",
    displayName: "FLUX.2 Pro",
    modality: "image",
    provider: "fal",
    upstreamModelId: "fal-ai/flux-pro/v1.1",
    price: process.env.PRICE_FLUX_PRO || "$0.20",
    rates: { unitRateUsd: 0.05 },
    limits: {
      maxPromptChars: 4000,
    },
    enabled: true,
    description: "FLUX.2 Pro frontier photorealistic and typographic image generation through Moltworld.",
    tags: ["image", "flux", "bfl", "photorealistic", "x402-global-challenge"],
  },
  {
    slug: "qwen-image-3",
    displayName: "Qwen Image 3",
    modality: "image",
    provider: "fal",
    upstreamModelId: "fal-ai/qwen-image",
    price: process.env.PRICE_QWEN_IMAGE || "$0.20",
    rates: { unitRateUsd: 0.04 },
    limits: {
      maxPromptChars: 3000,
    },
    enabled: true,
    description: "Qwen Image 3 advanced visual composition and prompt coherence through Moltworld.",
    tags: ["image", "qwen", "creative", "x402-global-challenge"],
  },
  {
    slug: "seedream-5.0",
    displayName: "ByteDance Seedream 5.0",
    modality: "image",
    provider: "fal",
    upstreamModelId: "fal-ai/bytedance/seedream",
    price: process.env.PRICE_SEEDREAM || "$0.25",
    rates: { unitRateUsd: 0.05 },
    limits: {
      maxPromptChars: 3000,
    },
    enabled: true,
    description: "ByteDance Seedream 5.0 cinematic styling and aesthetic fidelity through Moltworld.",
    tags: ["image", "bytedance", "seedream", "x402-global-challenge"],
  },
  {
    slug: "grok-imagine-image",
    displayName: "Grok Imagine Image 2.0",
    modality: "image",
    provider: "fal",
    upstreamModelId: "fal-ai/flux-pro",
    price: process.env.PRICE_GROK_IMAGE || "$0.25",
    rates: { unitRateUsd: 0.05 },
    limits: {
      maxPromptChars: 3000,
    },
    enabled: true,
    description: "xAI Grok Imagine Image 2.0 uninhibited artistic rendering through Moltworld.",
    tags: ["image", "grok", "xai", "art", "x402-global-challenge"],
  },
  {
    slug: "recraft-v3",
    displayName: "Recraft V3",
    modality: "image",
    provider: "fal",
    upstreamModelId: "fal-ai/recraft-v3",
    price: process.env.PRICE_RECRAFT || "$0.25",
    rates: { unitRateUsd: 0.04 },
    limits: {
      maxPromptChars: 3000,
    },
    enabled: true,
    description: "Recraft V3 vector and brand graphic generation through Moltworld.",
    tags: ["image", "recraft", "vector", "design", "x402-global-challenge"],
  },

  // ----------------------------------------------------
  // Voice / Audio Speech Models (OpenAI, OpenRouter & ElevenLabs)
  // ----------------------------------------------------
  {
    slug: "gpt-audio-mini",
    displayName: "GPT Audio Mini",
    modality: "voice",
    provider: "openrouter",
    upstreamModelId: "openai/gpt-audio-mini",
    price: process.env.PRICE_GPT_AUDIO_MINI || "$0.02",
    rates: { inputPerMillionUsd: 0.60, outputPerMillionUsd: 2.40 },
    limits: {
      maxPromptChars: 1000,
    },
    enabled: true,
    description: "OpenAI GPT Audio Mini lightweight expressive voice synthesis through Moltworld.",
    tags: ["voice", "tts", "openai", "audio", "fast", "x402-global-challenge"],
  },
  {
    slug: "tts-1",
    displayName: "OpenAI TTS-1",
    modality: "voice",
    provider: "openai",
    upstreamModelId: "tts-1",
    price: process.env.PRICE_TTS1 || "$0.10",
    rates: { unitRateUsd: 0.015 }, // per 1k characters
    limits: {
      maxPromptChars: 1000,
    },
    enabled: true,
    description: "OpenAI TTS-1 text-to-speech synthesis through Moltworld.",
    tags: ["voice", "tts", "openai", "speech", "x402-global-challenge"],
  },
  {
    slug: "tts-1-hd",
    displayName: "OpenAI TTS-1 HD",
    modality: "voice",
    provider: "openai",
    upstreamModelId: "tts-1-hd",
    price: process.env.PRICE_TTS1_HD || "$0.20",
    rates: { unitRateUsd: 0.030 }, // per 1k characters
    limits: {
      maxPromptChars: 1000,
    },
    enabled: true,
    description: "OpenAI TTS-1 HD high-definition text-to-speech synthesis through Moltworld.",
    tags: ["voice", "tts", "hd", "audio", "x402-global-challenge"],
  },
  {
    slug: "gpt-audio",
    displayName: "GPT Audio",
    modality: "voice",
    provider: "openrouter",
    upstreamModelId: "openai/gpt-audio",
    price: process.env.PRICE_GPT_AUDIO || "$0.20",
    rates: { inputPerMillionUsd: 2.50, outputPerMillionUsd: 10.00 },
    limits: {
      maxPromptChars: 1000,
    },
    enabled: true,
    description: "OpenAI GPT Audio natural conversational speech generation through Moltworld.",
    tags: ["voice", "tts", "openai", "conversational", "x402-global-challenge"],
  },
  {
    slug: "eleven-multilingual",
    displayName: "ElevenLabs Multilingual V2",
    modality: "voice",
    provider: "elevenlabs",
    upstreamModelId: "eleven_multilingual_v2",
    price: process.env.PRICE_ELEVENLABS || "$0.20",
    rates: { unitRateUsd: 0.030 }, // per 1k characters
    limits: {
      maxPromptChars: 1000,
    },
    enabled: true,
    description: "ElevenLabs Multilingual V2 lifelike voice cloning and expressive synthesis through Moltworld.",
    tags: ["voice", "elevenlabs", "multilingual", "cloning", "x402-global-challenge"],
  },

  // ----------------------------------------------------
  // Video Generation Models (fal.ai & OpenAI)
  // ----------------------------------------------------
  {
    slug: "veo-3.1-fast",
    displayName: "Google Veo 3.1 Fast",
    modality: "video",
    provider: "fal",
    upstreamModelId: "fal-ai/veo2",
    price: process.env.PRICE_VEO_FAST || "$0.25",
    rates: { unitRateUsd: 0.05 }, // per second
    limits: {
      maxPromptChars: 2500,
      maxDurationSeconds: 5,
    },
    enabled: true,
    description: "Google Veo 3.1 Fast high-frame-rate video synthesis through Moltworld.",
    tags: ["video", "google", "veo", "cinematic", "x402-global-challenge"],
  },
  {
    slug: "kling-v3.0-std",
    displayName: "Kling Video V3.0",
    modality: "video",
    provider: "fal",
    upstreamModelId: "fal-ai/kling-video/v1/standard/text-to-video",
    price: process.env.PRICE_KLING_STD || "$0.275",
    rates: { unitRateUsd: 0.055 },
    limits: {
      maxPromptChars: 2500,
      maxDurationSeconds: 5,
    },
    enabled: true,
    description: "Kling Video V3.0 Standard dynamic camera motion video generation through Moltworld.",
    tags: ["video", "kling", "motion", "x402-global-challenge"],
  },
  {
    slug: "wan-3.0",
    displayName: "Alibaba Wan 3.0",
    modality: "video",
    provider: "fal",
    upstreamModelId: "fal-ai/wan/v2.1",
    price: process.env.PRICE_WAN || "$0.30",
    rates: { unitRateUsd: 0.06 },
    limits: {
      maxPromptChars: 2500,
      maxDurationSeconds: 5,
    },
    enabled: true,
    description: "Alibaba Wan 3.0 ultra-realistic physics-accurate video generation through Moltworld.",
    tags: ["video", "alibaba", "wan", "physics", "x402-global-challenge"],
  },
  {
    slug: "hailuo-3",
    displayName: "MiniMax Hailuo H3",
    modality: "video",
    provider: "fal",
    upstreamModelId: "fal-ai/minimax/video-01",
    price: process.env.PRICE_HAILUO || "$0.40",
    rates: { unitRateUsd: 0.08 },
    limits: {
      maxPromptChars: 2000,
      maxDurationSeconds: 5,
    },
    enabled: true,
    description: "MiniMax Hailuo H3 expressive character and action video synthesis through Moltworld.",
    tags: ["video", "minimax", "hailuo", "action", "x402-global-challenge"],
  },
  {
    slug: "sora-2-pro",
    displayName: "OpenAI Sora 2 Pro",
    modality: "video",
    provider: "openai",
    upstreamModelId: "sora-2-pro",
    price: process.env.PRICE_SORA_PRO || "$1.00",
    rates: { unitRateUsd: 0.20 },
    limits: {
      maxPromptChars: 2500,
      maxDurationSeconds: 5,
    },
    enabled: true,
    description: "OpenAI Sora 2 Pro state-of-the-art cinematic video intelligence through Moltworld.",
    tags: ["video", "openai", "sora", "pro", "cinematic", "x402-global-challenge"],
  },
];

export class ModelRegistry {
  private models: Map<string, ModelDefinition> = new Map();

  constructor(initialModels: ModelDefinition[] = INITIAL_MODELS) {
    for (const model of initialModels) {
      this.registerModel(model);
    }
  }

  registerModel(model: ModelDefinition): void {
    this.models.set(model.slug.toLowerCase(), model);
  }

  getModel(slug: string): ModelDefinition | undefined {
    return this.models.get(slug.toLowerCase());
  }

  getEnabledModels(): ModelDefinition[] {
    return Array.from(this.models.values()).filter((m) => m.enabled);
  }

  getModelsByModality(modality: ModelModality): ModelDefinition[] {
    return this.getEnabledModels().filter((m) => m.modality === modality);
  }

  getAllModels(): ModelDefinition[] {
    return Array.from(this.models.values());
  }
}

export const defaultModelRegistry = new ModelRegistry();
