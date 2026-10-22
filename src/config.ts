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
  openrouterApiKey?: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  googleAiApiKey?: string;
  deepseekApiKey?: string;
  falKey?: string;
  elevenlabsApiKey?: string;
  databaseUrl?: string;
  redisUrl?: string;
  receiptSigningKey?: string;
  refundMnemonic?: string;
  priceMargin: number;
  priceMinFloor: number;
  mockProviders: boolean;
  rateLimitMaxRequests: number;
  rateLimitWindowMs: number;
  requestTimeoutMs: number;
  upstreamTimeoutMs: number;
}

const networkEnv = (process.env.ALGORAND_NETWORK || process.env.NETWORK || "testnet").toLowerCase();
const isMainnet = networkEnv === "mainnet" || networkEnv === "prod" || networkEnv === "production";

let payToAddress = process.env.AVM_ADDRESS?.trim();
if (!payToAddress) {
  if (isMainnet) {
    throw new Error(
      "Missing required environment variable AVM_ADDRESS for Algorand Mainnet production deployment."
    );
  }
  payToAddress = DEFAULT_TESTNET_PAYTO;
}

export const config: GatewayConfig = {
  env: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "3000", 10),
  publicDomain: process.env.PUBLIC_DOMAIN || "https://moltworld.xyz",
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
  openrouterApiKey: process.env.OPENROUTER_API_KEY?.trim(),
  openaiApiKey: process.env.OPENAI_API_KEY?.trim(),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY?.trim(),
  googleAiApiKey: process.env.GOOGLE_AI_API_KEY?.trim(),
  deepseekApiKey: process.env.DEEPSEEK_API_KEY?.trim(),
  falKey: process.env.FAL_KEY?.trim(),
  elevenlabsApiKey: process.env.ELEVENLABS_API_KEY?.trim(),
  databaseUrl: process.env.DATABASE_URL?.trim(),
  redisUrl: process.env.REDIS_URL?.trim(),
  receiptSigningKey: process.env.RECEIPT_SIGNING_KEY?.trim(),
  refundMnemonic: process.env.REFUND_WALLET_MNEMONIC?.trim(),
  priceMargin: parseFloat(process.env.PRICE_MARGIN || "0.30"),
  priceMinFloor: parseFloat(process.env.PRICE_MIN_FLOOR || "0.001"),
  mockProviders: process.env.MOCK_PROVIDERS === "true" || process.env.NODE_ENV === "test",
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX || "60", 10),
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10), // 1 minute
  requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS || "30000", 10), // 30s
  upstreamTimeoutMs: parseInt(process.env.UPSTREAM_TIMEOUT_MS || "25000", 10), // 25s
};
