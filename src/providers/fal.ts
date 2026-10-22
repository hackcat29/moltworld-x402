import {
  AIProvider,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
  VideoGenerationRequest,
  VideoGenerationResponse,
} from "./types.js";

export class FalProvider implements AIProvider {
  readonly id = "fal";

  constructor(
    private readonly apiKey: string,
    private readonly timeoutMs: number = 60000
  ) {
    if (!apiKey) {
      throw new Error("FAL_KEY is required to initialize FalProvider.");
    }
  }

  async chatComplete(
    _modelIdentifier: string,
    _request: ChatCompletionRequest,
    _modelSlug: string
  ): Promise<ChatCompletionResponse> {
    throw new Error("FalProvider does not implement chat completions.");
  }

  async generateImage(
    modelIdentifier: string,
    request: ImageGenerationRequest,
    modelSlug: string
  ): Promise<ImageGenerationResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const sizeParts = (request.size || "1024x1024").split("x").map(Number);
      const width = sizeParts[0] || 1024;
      const height = sizeParts[1] || 1024;

      const payload = {
        prompt: request.prompt,
        image_size: { width, height },
        num_images: request.n || 1,
        sync_mode: true,
      };

      const response = await fetch(`https://fal.run/${modelIdentifier}`, {
        method: "POST",
        headers: {
          Authorization: `Key ${this.apiKey}`,
          "Content-Type": "application/json",
          "User-Agent": "Moltworld-x402-Gateway/1.0",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errText = `Status ${response.status}`;
        try {
          const errJson = await response.json();
          if (errJson?.detail || errJson?.message) {
            errText = String(errJson.detail || errJson.message);
          }
        } catch {
          errText = await response.text();
        }
        errText = errText.replace(this.apiKey, "[REDACTED]");
        throw new Error(`Upstream fal.ai image generation error: ${errText}`);
      }

      const data = await response.json();
      const images: any[] = data.images || [];

      if (!images.length) {
        throw new Error("Upstream fal.ai returned no generated images.");
      }

      const generatedData = images.map((img: any) => ({
        url: img.url,
        revised_prompt: `[Moltworld Verified x402 - ${modelSlug}]: ${request.prompt}`,
      }));

      return {
        created: Math.floor(Date.now() / 1000),
        data: generatedData,
        upstreamProvider: "fal",
        upstreamModel: modelIdentifier,
      };
    } catch (err: any) {
      if (err.name === "AbortError") {
        throw new Error(`fal.ai image generation timed out after ${this.timeoutMs}ms.`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  async generateVideo(
    modelIdentifier: string,
    request: VideoGenerationRequest,
    modelSlug: string
  ): Promise<VideoGenerationResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const payload = {
        prompt: request.prompt,
        duration: request.duration || 5,
        aspect_ratio: request.aspect_ratio || "16:9",
      };

      // Submit to fal queue for asynchronous generation
      const response = await fetch(`https://queue.fal.run/${modelIdentifier}`, {
        method: "POST",
        headers: {
          Authorization: `Key ${this.apiKey}`,
          "Content-Type": "application/json",
          "User-Agent": "Moltworld-x402-Gateway/1.0",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = (await response.text()).replace(this.apiKey, "[REDACTED]");
        throw new Error(`Upstream fal.ai video queue error: ${errText}`);
      }

      const data = await response.json();
      const jobId = data.request_id || `fal-job-${Date.now()}`;

      return {
        id: jobId,
        jobId,
        object: "video.generation",
        created: Math.floor(Date.now() / 1000),
        model: modelSlug,
        status: "processing",
        video_url: "",
        duration_seconds: request.duration || 5,
        aspect_ratio: request.aspect_ratio || "16:9",
        upstreamProvider: "fal",
        upstreamModel: modelIdentifier,
      };
    } catch (err: any) {
      if (err.name === "AbortError") {
        throw new Error(`fal.ai video queue submission timed out after ${this.timeoutMs}ms.`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  async checkVideoStatus(
    modelIdentifier: string,
    requestId: string
  ): Promise<{ status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED"; videoUrl?: string; error?: string }> {
    const statusRes = await fetch(`https://queue.fal.run/${modelIdentifier}/requests/${requestId}/status`, {
      headers: {
        Authorization: `Key ${this.apiKey}`,
      },
    });

    if (!statusRes.ok) {
      throw new Error(`Failed to check fal.ai job status: Status ${statusRes.status}`);
    }

    const statusData = await statusRes.json();
    if (statusData.status === "COMPLETED") {
      const resultRes = await fetch(`https://queue.fal.run/${modelIdentifier}/requests/${requestId}`, {
        headers: {
          Authorization: `Key ${this.apiKey}`,
        },
      });
      if (resultRes.ok) {
        const resultData = await resultRes.json();
        const videoUrl = resultData.video?.url || resultData.video_url;
        return { status: "COMPLETED", videoUrl };
      }
    }

    return {
      status: statusData.status || "IN_PROGRESS",
      error: statusData.error,
    };
  }
}
