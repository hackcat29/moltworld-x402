import dotenv from "dotenv";

dotenv.config();

export const TESTNET_GENESIS_HASH = "SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=";
export const MAINNET_GENESIS_HASH = "wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=";

// GoPlausible facilitator uses full base64 hash CAIP-2 format
export const ALGORAND_TESTNET_FACILITATOR_CAIP2 = `algorand:${TESTNET_GENESIS_HASH}`;
export const ALGORAND_MAINNET_FACILITATOR_CAIP2 = `algorand:${MAINNET_GENESIS_HASH}`;

// 32-character truncated CAIP-2 format from @x402/avm
export const ALGORAND_TESTNET_CANONICAL_CAIP2 = "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDe";
export const ALGORAND_MAINNET_CANONICAL_CAIP2 = "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73k";

export const USDC_TESTNET_ASA_ID = "10458941";
export const USDC_MAINNET_ASA_ID = "31566704";

import { Network } from "@x402/core/types";

// Default testnet payTo address (if AVM_ADDRESS is not set during testnet development)
const DEFAULT_TESTNET_PAYTO = "TQWEL54TCBYH3QJLN2OU2QH7XZTHRDZMF2YQIU5B7W2HK6GS7I2TWHDMXU";

export interface GatewayConfig {
  env: string;
  port: number;
  publicDomain: string;
  facilitatorUrl: string;
  isMainnet: boolean;
  networkCaip2: Network;
  networkCanonicalCaip2: Network;
  usdcAsaId: string;
  payToAddress: string;
  algodUrl: string;
  algodToken: string;
  openrouterApiKey?: string;
  openaiApiKey?: string;
  falKey?: string;
  elevenlabsApiKey?: string;
  databaseUrl?: string;
  redisUrl?: string;
  receiptSigningKey?: string;
  payoutMnemonic?: string;
  adminToken?: string;
  priceMargin: number;
  priceMinFloor: number;
  rebateMinPayoutUsd: number;
  creatorPayoutMinUsd: number;
  marketplaceFeePercent: number;
  maxInflightPerPayer: number;
  mockProviders: boolean;
  skipUpstreamVerification: boolean;
  backgroundWorkers: boolean;
  rateLimitMaxRequests: number;
  rateLimitWindowMs: number;
  requestTimeoutMs: number;
  upstreamTimeoutMs: number;
}

const networkEnv = (process.env.ALGORAND_NETWORK || process.env.NETWORK || "testnet").toLowerCase();
const isMainnet = networkEnv === "mainnet" || networkEnv === "prod" || networkEnv === "production";
const isTest = process.env.NODE_ENV === "test" || process.env.VITEST === "true";

let payToAddress = process.env.AVM_ADDRESS?.trim();
if (!payToAddress) {
  if (isMainnet) {
    throw new Error(
      "Missing required environment variable AVM_ADDRESS for Algorand Mainnet production deployment."
    );
  }
  payToAddress = DEFAULT_TESTNET_PAYTO;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`Environment variable ${name} must be a number, got '${raw}'.`);
  return value;
}

export const config: GatewayConfig = {
  env: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "3000", 10),
  publicDomain: (process.env.PUBLIC_DOMAIN || "https://moltworld.xyz").replace(/\/+$/, ""),
  facilitatorUrl: process.env.FACILITATOR_URL || "https://facilitator.goplausible.xyz",
  isMainnet,
  networkCaip2: (isMainnet
    ? ALGORAND_MAINNET_FACILITATOR_CAIP2
    : ALGORAND_TESTNET_FACILITATOR_CAIP2) as Network,
  networkCanonicalCaip2: (isMainnet
    ? ALGORAND_MAINNET_CANONICAL_CAIP2
    : ALGORAND_TESTNET_CANONICAL_CAIP2) as Network,
  usdcAsaId: isMainnet ? USDC_MAINNET_ASA_ID : USDC_TESTNET_ASA_ID,
  payToAddress,
  algodUrl:
    process.env.ALGOD_URL?.trim() ||
    (isMainnet ? "https://mainnet-api.algonode.cloud" : "https://testnet-api.algonode.cloud"),
  algodToken: process.env.ALGOD_TOKEN?.trim() || "",
  openrouterApiKey: process.env.OPENROUTER_API_KEY?.trim() || undefined,
  openaiApiKey: process.env.OPENAI_API_KEY?.trim() || undefined,
  falKey: process.env.FAL_KEY?.trim() || undefined,
  elevenlabsApiKey: process.env.ELEVENLABS_API_KEY?.trim() || undefined,
  databaseUrl: process.env.DATABASE_URL?.trim() || undefined,
  redisUrl: process.env.REDIS_URL?.trim() || undefined,
  receiptSigningKey: process.env.RECEIPT_SIGNING_KEY?.trim() || undefined,
  // Hot wallet used for refunds, usage rebates and creator payouts. It is deliberately
  // separate from AVM_ADDRESS so the revenue address can be a cold or multisig account.
  payoutMnemonic: (process.env.PAYOUT_WALLET_MNEMONIC || process.env.REFUND_WALLET_MNEMONIC)?.trim() || undefined,
  adminToken: process.env.ADMIN_TOKEN?.trim() || undefined,
  priceMargin: num("PRICE_MARGIN", 0.3),
  priceMinFloor: num("PRICE_MIN_FLOOR", 0.001),
  rebateMinPayoutUsd: num("REBATE_MIN_PAYOUT_USD", 0.05),
  creatorPayoutMinUsd: num("CREATOR_PAYOUT_MIN_USD", 1),
  marketplaceFeePercent: num("MARKETPLACE_FEE_PERCENT", 15),
  maxInflightPerPayer: num("MAX_INFLIGHT_PER_PAYER", 4),
  mockProviders: process.env.MOCK_PROVIDERS === "true" || isTest,
  skipUpstreamVerification: process.env.SKIP_UPSTREAM_VERIFICATION === "true" || isTest,
  backgroundWorkers: process.env.BACKGROUND_WORKERS !== "false" && !isTest,
  rateLimitMaxRequests: num("RATE_LIMIT_MAX", 60),
  rateLimitWindowMs: num("RATE_LIMIT_WINDOW_MS", 60000),
  requestTimeoutMs: num("REQUEST_TIMEOUT_MS", 30000),
  upstreamTimeoutMs: num("UPSTREAM_TIMEOUT_MS", 25000),
};

/**
 * Production guardrails. A mainnet gateway that cannot persist its ledger or
 * sign verifiable receipts must not accept money, so startup fails instead.
 */
export function assertProductionConfig(cfg: GatewayConfig = config): void {
  if (!cfg.isMainnet) return;
  const missing: string[] = [];
  if (!cfg.databaseUrl) missing.push("DATABASE_URL");
  if (!cfg.receiptSigningKey) missing.push("RECEIPT_SIGNING_KEY");
  if (cfg.mockProviders) missing.push("MOCK_PROVIDERS must be false");
  if (missing.length) {
    throw new Error(`Refusing to start on mainnet without: ${missing.join(", ")}.`);
  }
}
