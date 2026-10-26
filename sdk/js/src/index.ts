import algosdk from "algosdk";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { toClientAvmSigner } from "@x402/avm";
import { ExactAvmScheme } from "@x402/avm/exact/client";
import { checkReceipt, decodeReceiptHeader, MoltworldReceipt, ReceiptCheck } from "./receipts.js";
import { createMandateSigner, MandateCredential, mandateTermsFromProgram } from "./mandates.js";
import { CappedMandateScheme } from "./mandateScheme.js";
import { fromBase64, toBase64 } from "./encoding.js";

export * from "./receipts.js";
export * from "./mandates.js";
export * from "./encoding.js";
export * from "./counter.js";
export { CappedMandateScheme } from "./mandateScheme.js";

const NETWORKS = {
  mainnet: ["algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=", "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73k"],
  testnet: ["algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=", "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDe"],
};

export interface AvmSigner {
  address: string;
  signTransactions(txns: Uint8Array[], indexesToSign?: number[]): Promise<(Uint8Array | null)[]>;
}

export interface MoltworldClientOptions {
  baseUrl?: string;
  /** One of: an x402 AVM signer, a 25-word mnemonic, a base64 64-byte secret key, or a mandate credential. */
  signer?: AvmSigner;
  mnemonic?: string;
  privateKeyBase64?: string;
  mandate?: MandateCredential;
  /** The agent's own key (base64 secret), required with a mandate that is bound to it. */
  agentKey?: string;
  /** Hard per-request cap enforced before anything is signed. Default $1. */
  maxPerRequestUsd?: number;
  /** Total spend cap for this client instance. */
  budgetUsd?: number;
  /** Refuse to pay any address other than this (defaults to the gateway's published payTo). */
  expectedPayTo?: string;
  algodUrl?: string;
  fetch?: typeof fetch;
}

export interface PaidResult<T> {
  data: T;
  requestId: string | null;
  receipt: MoltworldReceipt | null;
  /** Receipt signature and request/response hashes checked against the gateway key. */
  verification: ReceiptCheck | null;
  paidMicro: number;
  replayed: boolean;
}

export class MoltworldError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string, readonly body?: unknown) {
    super(message);
    this.name = "MoltworldError";
  }
}

export class MoltworldClient {
  readonly baseUrl: string;
  private readonly baseFetch: typeof fetch;
  private paidFetch: ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) | null = null;
  private readonly signer: AvmSigner;
  private readonly options: MoltworldClientOptions;
  private spentMicro = 0;
  private keys: Map<string, string> | null = null;
  private payTo: string | null = null;

  constructor(options: MoltworldClientOptions) {
    this.options = options;
    this.baseUrl = (options.baseUrl ?? "https://moltworld.xyz").replace(/\/$/, "");
    // Bound so it can be called as a method; browsers reject fetch with a foreign `this`.
    this.baseFetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    if (options.signer) this.signer = options.signer;
    else if (options.mandate) this.signer = createMandateSigner(options.mandate, options.agentKey);
    else if (options.mnemonic) this.signer = toClientAvmSigner(toBase64(algosdk.mnemonicToSecretKey(options.mnemonic).sk));
    else if (options.privateKeyBase64) this.signer = toClientAvmSigner(options.privateKeyBase64);
    else throw new Error("MoltworldClient needs a signer, mnemonic, privateKeyBase64 or mandate.");
  }

  get address(): string {
    return this.signer.address;
  }

  get spentUsd(): number {
    return this.spentMicro / 1_000_000;
  }

  private async getJson(path: string): Promise<any> {
    const res = await this.baseFetch(`${this.baseUrl}${path}`);
    if (!res.ok) throw new MoltworldError(`GET ${path} failed`, res.status, undefined, await res.text());
    return res.json();
  }

  private async init() {
    if (this.paidFetch) return;
    const health = await this.getJson("/health");
    this.payTo = this.options.expectedPayTo ?? health.pay_to;
    const networks = String(health.network) === "mainnet" ? NETWORKS.mainnet : NETWORKS.testnet;
    // A mandate capped on-chain pays in a group that also calls the spend counter.
    const capped = this.options.mandate ? mandateTermsFromProgram(fromBase64(this.options.mandate.programB64))?.counter : undefined;
    const client = x402Client.fromConfig({
      schemes: networks.map((network) => ({
        network: network as any,
        client: capped
          ? (new CappedMandateScheme(this.options.mandate!, this.options.agentKey, this.options.algodUrl) as any)
          : new ExactAvmScheme(this.signer as any, this.options.algodUrl ? { algodUrl: this.options.algodUrl } : undefined),
      })),
      spendControls: { maxAmountPerPayment: `$${this.options.maxPerRequestUsd ?? 1}` },
    });
    client.onBeforePaymentCreation(async ({ selectedRequirements }) => {
      const amount = Number(selectedRequirements.amount);
      if (selectedRequirements.payTo !== this.payTo) {
        return { abort: true, reason: `Refusing to pay ${selectedRequirements.payTo}; expected ${this.payTo}.` };
      }
      if (this.options.budgetUsd !== undefined && this.spentMicro + amount > this.options.budgetUsd * 1_000_000) {
        return { abort: true, reason: `Budget of $${this.options.budgetUsd} would be exceeded.` };
      }
    });
    client.onAfterPaymentCreation(async ({ selectedRequirements }) => {
      this.spentMicro += Number(selectedRequirements.amount);
    });
    this.paidFetch = wrapFetchWithPayment(this.baseFetch, client);
  }

  /** Public keys that sign receipts, cached per client. */
  async receiptKeys(): Promise<Map<string, string>> {
    if (!this.keys) {
      const doc = await this.getJson("/.well-known/moltworld-receipts.json");
      this.keys = new Map(doc.keys.map((k: any) => [k.kid, k.publicKey]));
    }
    return this.keys;
  }

  async models(modality?: "chat" | "image" | "voice" | "video") {
    return (await this.getJson(`/v1/models${modality ? `?modality=${modality}` : ""}`)).data;
  }

  /** Exact price of a request body, without paying. */
  async quote(model: string, body: Record<string, unknown>) {
    const res = await this.baseFetch(`${this.baseUrl}/v1/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, model }),
    });
    const json: any = await res.json();
    if (!res.ok) throw new MoltworldError(json?.error?.message ?? "Quote failed", res.status, json?.error?.code, json);
    return json.quote as { microUsdc: number; formattedPrice: string; units: Record<string, number> };
  }

  async call<T = any>(path: string, body: Record<string, unknown>): Promise<PaidResult<T>> {
    await this.init();
    const requestBytes = JSON.stringify(body);
    const res = await this.paidFetch!(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBytes,
    });
    const bytes = new Uint8Array(await res.arrayBuffer());
    const text = new TextDecoder().decode(bytes);
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    if (!res.ok) {
      throw new MoltworldError(data?.error?.message ?? `HTTP ${res.status}`, res.status, data?.error?.code, data);
    }
    const header = res.headers.get("moltworld-receipt");
    const receipt = header ? decodeReceiptHeader(header) : null;
    let verification: ReceiptCheck | null = null;
    if (receipt) {
      const key = (await this.receiptKeys()).get(receipt.kid);
      verification = key
        ? checkReceipt(receipt, key, { request: requestBytes, response: bytes })
        : { signatureValid: false, requestMatches: null, responseMatches: null, ok: false };
    }
    return {
      data,
      requestId: res.headers.get("moltworld-request-id"),
      receipt,
      verification,
      paidMicro: receipt?.amountMicro ?? 0,
      replayed: res.headers.get("moltworld-replay") === "true",
    };
  }

  chat(model: string, body: { messages: Array<{ role: "system" | "user" | "assistant"; content: string }>; max_tokens?: number; temperature?: number }) {
    return this.call(`/v1/models/${model}/chat/completions`, body);
  }

  image(model: string, body: { prompt: string; n?: number; size?: string }) {
    return this.call(`/v1/models/${model}/images/generations`, body);
  }

  speech(model: string, body: { input: string; voice?: string; response_format?: string; speed?: number }) {
    return this.call(`/v1/models/${model}/audio/speech`, body);
  }

  video(model: string, body: { prompt: string; duration?: number; aspect_ratio?: string }) {
    return this.call(`/v1/models/${model}/videos/generations`, body);
  }

  market(slug: string, body: Record<string, unknown>) {
    return this.call(`/v1/market/${slug}/call`, body);
  }

  async job(jobId: string) {
    return this.getJson(`/v1/jobs/${encodeURIComponent(jobId)}`);
  }

  /** Polls a video job until it completes or fails (failed jobs are refunded by the gateway). */
  async waitForJob(jobId: string, { timeoutMs = 15 * 60_000, intervalMs = 5000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const job = await this.job(jobId);
      if (job.status === "completed" || job.status === "failed") return job;
      if (Date.now() > deadline) throw new Error(`Job ${jobId} still ${job.status} after ${timeoutMs}ms.`);
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  async receipt(requestId: string) {
    return this.getJson(`/v1/receipts/${encodeURIComponent(requestId)}`);
  }
}
