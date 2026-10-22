import { config } from "../config.js";
import { AIProvider } from "./types.js";
import { OpenRouterProvider } from "./openrouter.js";
import { MockProvider } from "./mock.js";
import { DirectOpenAIProvider } from "./direct.js";
import { FalProvider } from "./fal.js";
import { ElevenLabsProvider } from "./elevenlabs.js";

export * from "./types.js";
export * from "./openrouter.js";
export * from "./mock.js";
export * from "./direct.js";
export * from "./fal.js";
export * from "./elevenlabs.js";

export class ProviderRegistry {
  private providers: Map<string, AIProvider> = new Map();

  constructor() {
    this.registerProvider(new MockProvider());

    if (config.openrouterApiKey) {
      this.registerProvider(
        new OpenRouterProvider(config.openrouterApiKey, config.upstreamTimeoutMs)
      );
    }

    if (config.openaiApiKey) {
      this.registerProvider(
        new DirectOpenAIProvider(config.openaiApiKey, config.upstreamTimeoutMs)
      );
    }

    if (config.falKey) {
      this.registerProvider(
        new FalProvider(config.falKey, config.upstreamTimeoutMs * 2)
      );
    }

    if (config.elevenlabsApiKey) {
      this.registerProvider(
        new ElevenLabsProvider(config.elevenlabsApiKey, config.upstreamTimeoutMs)
      );
    }
  }

  registerProvider(provider: AIProvider): void {
    this.providers.set(provider.id.toLowerCase(), provider);
  }

  getProvider(providerId: string): AIProvider {
    if (config.mockProviders) {
      return this.providers.get("mock")!;
    }

    const provider = this.providers.get(providerId.toLowerCase());
    if (provider) {
      return provider;
    }

    // Fail closed! Never silently fall back to mock or an unconfigured provider in production
    throw new Error(
      `Upstream AI provider '${providerId}' is not configured or available. Operation rejected to protect user payment.`
    );
  }

  hasProvider(providerId: string): boolean {
    if (config.mockProviders) return true;
    return this.providers.has(providerId.toLowerCase());
  }

  listConfiguredProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}

export const defaultProviderRegistry = new ProviderRegistry();
