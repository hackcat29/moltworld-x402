import {
  AIProvider,
  AudioSpeechRequest,
  AudioSpeechResponse,
  ChatCompletionRequest,
  ChatCompletionResponse,
} from "./types.js";

export class ElevenLabsProvider implements AIProvider {
  readonly id = "elevenlabs";

  constructor(
    private readonly apiKey: string,
    private readonly timeoutMs: number = 30000
  ) {
    if (!apiKey) {
      throw new Error("ELEVENLABS_API_KEY is required to initialize ElevenLabsProvider.");
    }
  }

  async chatComplete(
    _modelIdentifier: string,
    _request: ChatCompletionRequest,
    _modelSlug: string
  ): Promise<ChatCompletionResponse> {
    throw new Error("ElevenLabsProvider does not support chat completion.");
  }

  async generateSpeech(
    modelIdentifier: string,
    request: AudioSpeechRequest,
    modelSlug: string
  ): Promise<AudioSpeechResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    // Default high-quality pre-made voice ID (Rachel or Adam)
    const voiceId = request.voice || "21m00Tcm4TlvDq8ikWAM";
    const format = request.response_format || "mp3";

    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": this.apiKey,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text: request.input,
            model_id: modelIdentifier || "eleven_multilingual_v2",
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
            },
          }),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        let errDetail = `Status ${response.status}`;
        try {
          const errJson = await response.json();
          if (errJson?.detail?.message) {
            errDetail = errJson.detail.message;
          }
        } catch {
          errDetail = await response.text();
        }
        errDetail = errDetail.replace(this.apiKey, "[REDACTED]");
        throw new Error(`Upstream ElevenLabs speech synthesis error: ${errDetail}`);
      }

      const audioBuffer = await response.arrayBuffer();
      const base64Audio = Buffer.from(audioBuffer).toString("base64");
      const audioUrl = `data:audio/${format};base64,${base64Audio}`;
      const durationSeconds = parseFloat((request.input.length / 15).toFixed(2));

      return {
        id: `audio-eleven-${Date.now()}`,
        object: "audio.speech",
        created: Math.floor(Date.now() / 1000),
        model: modelSlug,
        audio_url: audioUrl,
        audio_b64: base64Audio,
        format,
        duration_seconds: durationSeconds,
        character_count: request.input.length,
        upstreamProvider: "elevenlabs",
        upstreamModel: modelIdentifier,
      };
    } catch (err: any) {
      if (err.name === "AbortError") {
        throw new Error(`ElevenLabs speech synthesis timed out after ${this.timeoutMs}ms.`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}
