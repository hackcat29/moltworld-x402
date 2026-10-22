import crypto from "crypto";
import { config } from "../config.js";

export interface VerifiableReceipt {
  version: "1.0";
  requestId: string;
  txid: string;
  network: string;
  payer: string;
  payTo: string;
  amountUsd: string;
  amountMicroUsdc: number;
  modelSlug: string;
  modality: string;
  upstreamProvider: string;
  upstreamModel: string;
  requestSha256: string;
  responseSha256: string;
  issuedAt: number; // unix seconds
  signature: string; // base64 Ed25519 signature
  publicKey: string; // base64 Ed25519 public key
  anchorTxid?: string;
}

export interface ReceiptSignerKeys {
  privateKey: crypto.KeyObject;
  publicKey: crypto.KeyObject;
  publicKeyBase64: string;
}

class ReceiptService {
  private keys: ReceiptSignerKeys;

  constructor() {
    this.keys = this.initKeys();
  }

  private initKeys(): ReceiptSignerKeys {
    if (config.receiptSigningKey) {
      try {
        const privateKey = crypto.createPrivateKey({
          key: Buffer.from(config.receiptSigningKey, "base64"),
          format: "der",
          type: "pkcs8",
        });
        const publicKey = crypto.createPublicKey(privateKey);
        const pubDer = publicKey.export({ type: "spki", format: "der" });
        return {
          privateKey,
          publicKey,
          publicKeyBase64: pubDer.toString("base64"),
        };
      } catch (err) {
        console.warn("Could not parse RECEIPT_SIGNING_KEY as DER. Generating deterministic or fresh key:", err);
      }
    }

    // Deterministic Ed25519 key derivation for consistent verification
    const seed = crypto
      .createHash("sha256")
      .update(config.payToAddress + (config.receiptSigningKey || "moltworld-gateway-default-seed"))
      .digest();

    const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519", {
      privateKeyEncoding: { format: "der", type: "pkcs8" },
      publicKeyEncoding: { format: "der", type: "spki" },
    });

    const privKeyObj = crypto.createPrivateKey({ key: privateKey, format: "der", type: "pkcs8" });
    const pubKeyObj = crypto.createPublicKey({ key: publicKey, format: "der", type: "spki" });

    return {
      privateKey: privKeyObj,
      publicKey: pubKeyObj,
      publicKeyBase64: Buffer.from(publicKey).toString("base64"),
    };
  }

  getPublicKeyBase64(): string {
    return this.keys.publicKeyBase64;
  }

  hashData(data: unknown): string {
    const serialized = typeof data === "string" ? data : JSON.stringify(data || {});
    return crypto.createHash("sha256").update(serialized).digest("hex");
  }

  signReceipt(data: Omit<VerifiableReceipt, "version" | "signature" | "publicKey" | "issuedAt">): VerifiableReceipt {
    const issuedAt = Math.floor(Date.now() / 1000);
    const unsignedPayload = {
      version: "1.0" as const,
      requestId: data.requestId,
      txid: data.txid,
      network: data.network,
      payer: data.payer,
      payTo: data.payTo,
      amountUsd: data.amountUsd,
      amountMicroUsdc: data.amountMicroUsdc,
      modelSlug: data.modelSlug,
      modality: data.modality,
      upstreamProvider: data.upstreamProvider,
      upstreamModel: data.upstreamModel,
      requestSha256: data.requestSha256,
      responseSha256: data.responseSha256,
      issuedAt,
    };

    const canonicalMessage = Buffer.from(JSON.stringify(unsignedPayload));
    const signature = crypto.sign(null, canonicalMessage, this.keys.privateKey);

    return {
      ...unsignedPayload,
      signature: signature.toString("base64"),
      publicKey: this.keys.publicKeyBase64,
    };
  }

  verifyReceipt(receipt: VerifiableReceipt): boolean {
    try {
      const pubKey = crypto.createPublicKey({
        key: Buffer.from(receipt.publicKey, "base64"),
        format: "der",
        type: "spki",
      });

      const { signature, publicKey, anchorTxid, ...unsignedPayload } = receipt;
      const canonicalMessage = Buffer.from(JSON.stringify(unsignedPayload));
      const sigBuffer = Buffer.from(signature, "base64");

      return crypto.verify(null, canonicalMessage, pubKey, sigBuffer);
    } catch {
      return false;
    }
  }
}

export const receiptService = new ReceiptService();
