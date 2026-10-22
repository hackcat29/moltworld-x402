import {
  AIProvider,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
  AudioSpeechRequest,
  AudioSpeechResponse,
} from "./types.js";

export class DirectOpenAIProvider implements AIProvider {
  readonly id = "openai";

  constructor(
    private readonly apiKey: string,
    private readonly timeoutMs: number = 25000
  ) {}

  async chatComplete(
    modelIdentifier: string,
    request: ChatCompletionRequest,
    modelSlug: string
  ): Promise<ChatCompletionResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelIdentifier,
          messages: request.messages,
          temperature: request.temperature,
          max_tokens: request.max_tokens,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI chat error: ${err.replace(this.apiKey, "[REDACTED]")}`);
      }

      const data = (await response.json()) as any;
      data.model = modelSlug;
      data.upstreamProvider = "openai";
      data.upstreamModel = modelIdentifier;
      return data;
    } catch (err: any) {
      if (err.name === "AbortError") {
        throw new Error(`OpenAI chat request timed out after ${this.timeoutMs}ms.`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  async generateImage(
    modelIdentifier: string,
    request: ImageGenerationRequest,
    modelSlug: string
  ): Promise<ImageGenerationResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelIdentifier,
          prompt: request.prompt,
          n: request.n || 1,
          size: request.size || "1024x1024",
          response_format: request.response_format || "url",
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI image error: ${err.replace(this.apiKey, "[REDACTED]")}`);
      }

      const data = (await response.json()) as ImageGenerationResponse;
      data.upstreamProvider = "openai";
      data.upstreamModel = modelIdentifier;
      return data;
    } catch (err: any) {
      if (err.name === "AbortError") {
        throw new Error(`OpenAI image generation timed out after ${this.timeoutMs}ms.`);
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const format = request.response_format || "mp3";
      const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelIdentifier,
          input: request.input,
          voice: request.voice || "alloy",
          response_format: format,
          speed: request.speed || 1.0,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI TTS error: ${err.replace(this.apiKey, "[REDACTED]")}`);
      }

      const audioBytes = await response.arrayBuffer();
      const base64Audio = Buffer.from(audioBytes).toString("base64");
      const dataUrl = `data:audio/${format};base64,${base64Audio}`;

      return {
        id: `audio-openai-${Date.now()}`,
        object: "audio.speech",
        created: Math.floor(Date.now() / 1000),
        model: modelSlug,
        audio_url: dataUrl,
        audio_b64: base64Audio,
        format,
        duration_seconds: parseFloat((request.input.length / 15).toFixed(2)),
        character_count: request.input.length,
        upstreamProvider: "openai",
        upstreamModel: modelIdentifier,
      };
    } catch (err: any) {
      if (err.name === "AbortError") {
        throw new Error(`OpenAI speech generation timed out after ${this.timeoutMs}ms.`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}
