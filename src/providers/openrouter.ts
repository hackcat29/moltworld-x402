import {
  AIProvider,
  ChatCompletionRequest,
  ChatCompletionResponse,
  AudioSpeechRequest,
  AudioSpeechResponse,
} from "./types.js";

export class OpenRouterProvider implements AIProvider {
  readonly id = "openrouter";

  constructor(
    private readonly apiKey: string,
    private readonly timeoutMs: number = 25000
  ) {
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is required to initialize OpenRouterProvider.");
    }
  }

  async chatComplete(
    modelIdentifier: string,
    request: ChatCompletionRequest,
    modelSlug: string
  ): Promise<ChatCompletionResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const payload: Record<string, unknown> = {
        model: modelIdentifier,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        usage: { include: true },
        provider: {
          allow_fallbacks: false, // Disallow routing to different model architectures
        },
      };

      if (request.max_tokens) {
        payload.max_tokens = request.max_tokens;
      }

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://moltworld.xyz",
          "X-Title": "Moltworld x402 AI Gateway",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorDetail = `Status ${response.status}`;
        try {
          const errBody = await response.json();
          if (errBody?.error?.message) {
            errorDetail = String(errBody.error.message);
          }
        } catch {
          // ignore parsing error
        }
        errorDetail = errorDetail.replace(this.apiKey, "[REDACTED]");
        throw new Error(`Upstream OpenRouter model error: ${errorDetail}`);
      }

      const data = await response.json();

      const choices = (data.choices || []).map((choice: any, idx: number) => ({
        index: choice.index ?? idx,
        message: {
          role: choice.message?.role || "assistant",
          content: choice.message?.content || choice.message?.reasoning || "",
        },
        finish_reason: choice.finish_reason || "stop",
      }));

      if (!choices.length || !choices[0].message.content.trim()) {
        throw new Error("Upstream OpenRouter model returned an empty completion.");
      }

      const upstreamCostUsd =
        typeof data.usage?.cost === "number"
          ? data.usage.cost
          : typeof data.usage?.total_cost === "number"
          ? data.usage.total_cost
          : undefined;

      return {
        id: data.id || `chatcmpl-moltworld-${Date.now()}`,
        object: "chat.completion",
        created: data.created || Math.floor(Date.now() / 1000),
        model: modelSlug,
        choices,
        usage: data.usage
          ? {
              prompt_tokens: data.usage.prompt_tokens || 0,
              completion_tokens: data.usage.completion_tokens || 0,
              total_tokens: data.usage.total_tokens || 0,
            }
          : undefined,
        upstreamProvider: "openrouter",
        upstreamModel: data.model || modelIdentifier,
        upstreamCostUsd,
      };
    } catch (err: any) {
      if (err.name === "AbortError") {
        throw new Error(`Upstream model request timed out after ${this.timeoutMs}ms.`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  async generateSpeech(
    modelIdentifier: string,
    request: AudioSpeechRequest,
    modelSlug: string
  ): Promise<AudioSpeechResponse> {
    // OpenRouter audio modality for gpt-audio models
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://moltworld.xyz",
          "X-Title": "Moltworld x402 AI Gateway",
        },
        body: JSON.stringify({
          model: modelIdentifier,
          modalities: ["text", "audio"],
          audio: { voice: request.voice || "alloy", format: request.response_format || "wav" },
          messages: [{ role: "user", content: request.input }],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = (await response.text()).replace(this.apiKey, "[REDACTED]");
        throw new Error(`OpenRouter audio generation error: ${errText}`);
      }

      const data = await response.json();
      const audioData = data.choices?.[0]?.message?.audio;
      if (!audioData?.data) {
        throw new Error("Upstream model did not return audio synthesis data.");
      }

      const format = request.response_format || "wav";
      const audioB64 = audioData.data;
      const audioUrl = `data:audio/${format};base64,${audioB64}`;

      return {
        id: `audio-or-${Date.now()}`,
        object: "audio.speech",
        created: Math.floor(Date.now() / 1000),
        model: modelSlug,
        audio_url: audioUrl,
        audio_b64: audioB64,
        format,
        duration_seconds: parseFloat((request.input.length / 15).toFixed(2)),
        character_count: request.input.length,
        upstreamProvider: "openrouter",
        upstreamModel: modelIdentifier,
        upstreamCostUsd: typeof data.usage?.cost === "number" ? data.usage.cost : undefined,
      };
    } catch (err: any) {
      if (err.name === "AbortError") {
        throw new Error(`Upstream voice generation timed out after ${this.timeoutMs}ms.`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}
