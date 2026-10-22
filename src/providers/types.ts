export type ModelModality = "chat" | "image" | "voice" | "video";

// ----------------------------------------------------
// Chat Types (OpenAI-compatible)
// ----------------------------------------------------
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatMessage;
  finish_reason: string;
}

export interface ChatCompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: ChatCompletionUsage;
  upstreamProvider?: string;
  upstreamModel?: string;
  upstreamCostUsd?: number;
}

// ----------------------------------------------------
// Image Types (OpenAI-compatible)
// ----------------------------------------------------
export interface ImageGenerationRequest {
  prompt: string;
  n?: number;
  size?: string; // e.g. "1024x1024", "1024x1792", "1792x1024"
  response_format?: "url" | "b64_json";
  quality?: "standard" | "hd";
  style?: "vivid" | "natural";
}

export interface GeneratedImageItem {
  url?: string;
  b64_json?: string;
  revised_prompt?: string;
}

export interface ImageGenerationResponse {
  created: number;
  data: GeneratedImageItem[];
  upstreamProvider?: string;
  upstreamModel?: string;
  upstreamCostUsd?: number;
}

// ----------------------------------------------------
// Voice / Audio Types (OpenAI-compatible)
// ----------------------------------------------------
export interface AudioSpeechRequest {
  input: string;
  voice?: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" | string;
  response_format?: "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";
  speed?: number;
}

export interface AudioSpeechResponse {
  id: string;
  object: "audio.speech";
  created: number;
  model: string;
  audio_url: string;
  audio_b64?: string;
  format: string;
  duration_seconds: number;
  character_count: number;
  upstreamProvider?: string;
  upstreamModel?: string;
  upstreamCostUsd?: number;
}

// ----------------------------------------------------
// Video Generation Types
// ----------------------------------------------------
export interface VideoGenerationRequest {
  prompt: string;
  duration?: number; // e.g. 5 or 10 seconds
  aspect_ratio?: "16:9" | "9:16" | "1:1";
  quality?: "standard" | "hd";
}

export interface VideoGenerationResponse {
  id: string;
  object: "video.generation";
  created: number;
  model: string;
  status: "completed" | "processing";
  video_url: string;
  duration_seconds: number;
  aspect_ratio: string;
  upstreamProvider?: string;
  upstreamModel?: string;
  upstreamCostUsd?: number;
  jobId?: string;
}

// ----------------------------------------------------
// Universal Multimodal AI Provider Interface
// ----------------------------------------------------
export interface AIProvider {
  readonly id: string;

  chatComplete(
    modelIdentifier: string,
    request: ChatCompletionRequest,
    modelSlug: string
  ): Promise<ChatCompletionResponse>;

  generateImage?(
    modelIdentifier: string,
    request: ImageGenerationRequest,
    modelSlug: string
  ): Promise<ImageGenerationResponse>;

  generateSpeech?(
    modelIdentifier: string,
    request: AudioSpeechRequest,
    modelSlug: string
  ): Promise<AudioSpeechResponse>;

  generateVideo?(
    modelIdentifier: string,
    request: VideoGenerationRequest,
    modelSlug: string
  ): Promise<VideoGenerationResponse>;
}
