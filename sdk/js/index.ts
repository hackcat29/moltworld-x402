import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { toClientAvmSigner, ExactAvmScheme } from "@x402/avm";
import algosdk from "algosdk";
import crypto from "crypto";

export interface MoltworldClientConfig {
  baseUrl?: string;
  mnemonic?: string;
  logicSig?: {
    logic: string;
    sig: string;
  };
  maxPriceUsd?: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface MoltworldResponse<T> {
  data: T;
  receipt?: any;
  quote?: any;
}

export class MoltworldClient {
  private baseUrl: string;
  private maxPriceUsd: number;
  private paymentFetch: typeof fetch;

  constructor(clientConfig: MoltworldClientConfig) {
    this.baseUrl = (clientConfig.baseUrl || "https://moltworld.xyz").replace(/\/$/, "");
    this.maxPriceUsd = clientConfig.maxPriceUsd ?? 10.0;

    let signer: any;

    if (clientConfig.mnemonic) {
      const account = algosdk.mnemonicToSecretKey(clientConfig.mnemonic);
      signer = toClientAvmSigner({
        address: account.addr,
        signTransactions: async (txns: algosdk.Transaction[]) => {
          return txns.map((t) => t.signTxn(account.sk));
        },
      });
    } else if (clientConfig.logicSig) {
      const logic = new Uint8Array(Buffer.from(clientConfig.logicSig.logic, "base64"));
      const lsig = new algosdk.LogicSigAccount(logic);
      if (clientConfig.logicSig.sig) {
        lsig.lsig.sig = new Uint8Array(Buffer.from(clientConfig.logicSig.sig, "base64"));
      }
      signer = toClientAvmSigner({
        address: lsig.address(),
        signTransactions: async (txns: algosdk.Transaction[]) => {
          return txns.map((t) => algosdk.signLogicSigTransactionObject(t, lsig).blob);
        },
      });
    } else {
      throw new Error("MoltworldClient requires either mnemonic or logicSig for x402 payments.");
    }

    const client = new x402Client();
    client.registerScheme("exact", new ExactAvmScheme(signer));
    this.paymentFetch = wrapFetchWithPayment(fetch, client);
  }

  async quote(model: string, requestBody: any): Promise<any> {
    const res = await fetch(`${this.baseUrl}/v1/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, ...requestBody }),
    });
    if (!res.ok) {
      throw new Error(`Quote failed: ${await res.text()}`);
    }
    return res.json();
  }

  async chat(
    model: string,
    messages: ChatMessage[],
    options: { temperature?: number; max_tokens?: number } = {}
  ): Promise<MoltworldResponse<any>> {
    const url = `${this.baseUrl}/v1/models/${model}/chat/completions`;
    const res = await this.paymentFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, ...options }),
    });

    if (!res.ok) {
      throw new Error(`Moltworld chat request failed: Status ${res.status} - ${await res.text()}`);
    }

    const data = await res.json();
    const receiptHeader = res.headers.get("Moltworld-Receipt");
    const receipt = receiptHeader ? JSON.parse(receiptHeader) : data?.moltworld?.receipt;

    return { data, receipt };
  }

  async image(
    model: string,
    prompt: string,
    options: { n?: number; size?: string } = {}
  ): Promise<MoltworldResponse<any>> {
    const url = `${this.baseUrl}/v1/models/${model}/images/generations`;
    const res = await this.paymentFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, ...options }),
    });

    if (!res.ok) {
      throw new Error(`Moltworld image request failed: Status ${res.status} - ${await res.text()}`);
    }

    const data = await res.json();
    const receiptHeader = res.headers.get("Moltworld-Receipt");
    const receipt = receiptHeader ? JSON.parse(receiptHeader) : data?.moltworld?.receipt;

    return { data, receipt };
  }

  async voice(
    model: string,
    input: string,
    options: { voice?: string; speed?: number; response_format?: string } = {}
  ): Promise<MoltworldResponse<any>> {
    const url = `${this.baseUrl}/v1/models/${model}/audio/speech`;
    const res = await this.paymentFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input, ...options }),
    });

    if (!res.ok) {
      throw new Error(`Moltworld voice request failed: Status ${res.status} - ${await res.text()}`);
    }

    const data = await res.json();
    const receiptHeader = res.headers.get("Moltworld-Receipt");
    const receipt = receiptHeader ? JSON.parse(receiptHeader) : data?.moltworld?.receipt;

    return { data, receipt };
  }

  async video(
    model: string,
    prompt: string,
    options: { duration?: number; aspect_ratio?: "16:9" | "9:16" | "1:1"; pollIntervalMs?: number; maxWaitMs?: number } = {}
  ): Promise<MoltworldResponse<any>> {
    const url = `${this.baseUrl}/v1/models/${model}/videos/generations`;
    const res = await this.paymentFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, duration: options.duration || 5, aspect_ratio: options.aspect_ratio || "16:9" }),
    });

    if (!res.ok && res.status !== 202) {
      throw new Error(`Moltworld video request failed: Status ${res.status} - ${await res.text()}`);
    }

    const initialData = await res.json();
    const receiptHeader = res.headers.get("Moltworld-Receipt");
    const receipt = receiptHeader ? JSON.parse(receiptHeader) : initialData?.moltworld?.receipt;

    if (initialData.status === "completed" && initialData.video_url) {
      return { data: initialData, receipt };
    }

    // Poll video job endpoint
    const pollEndpoint = initialData.poll_endpoint || `/v1/jobs/${initialData.id}`;
    const pollUrl = `${this.baseUrl}${pollEndpoint}`;
    const pollInterval = options.pollIntervalMs || 3000;
    const maxWait = options.maxWaitMs || 120000; // 2 min
    const deadline = Date.now() + maxWait;

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      const jobRes = await fetch(pollUrl);
      if (jobRes.ok) {
        const jobData = await jobRes.json();
        if (jobData.status === "completed") {
          return { data: jobData, receipt };
        }
        if (jobData.status === "failed") {
          throw new Error(`Video generation job failed: ${jobData.error || "Unknown error"}`);
        }
      }
    }

    return { data: initialData, receipt };
  }

  verifyReceipt(receipt: any): boolean {
    try {
      const pubKey = crypto.createPublicKey({
        key: Buffer.from(receipt.publicKey, "base64"),
        format: "der",
        type: "spki",
      });

      const { signature, publicKey, anchorTxid, ...unsignedPayload } = receipt;
      const canonical = Buffer.from(JSON.stringify(unsignedPayload));
      const sig = Buffer.from(signature, "base64");

      return crypto.verify(null, canonical, pubKey, sig);
    } catch {
      return false;
    }
  }
}
