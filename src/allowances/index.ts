import algosdk from "algosdk";
import { config } from "../config.js";

export interface AllowancePolicy {
  userAddress: string;
  payToAddress: string;
  usdcAsaId: bigint;
  maxMicroUsdcPerCall: number;
  expiryRound: number;
  dailyCapMicroUsdc?: number;
  allowedModelSlugs?: string[];
}

export function generateAllowanceTeal(policy: AllowancePolicy): string {
  // Stateless LogicSig program enforcing transfer constraints
  return `#pragma version 8
// Algorand x402 Agent Allowance Delegated LogicSig
// Enforces asset, destination, max amount per transaction, and expiry round

txn TypeEnum
int axfer
==
assert

// Asset must be USDC
txn XferAsset
int ${policy.usdcAsaId}
==
assert

// Receiver must be Moltworld payTo address
txn AssetReceiver
addr ${policy.payToAddress}
==
assert

// Amount must not exceed maxMicroUsdcPerCall
txn AssetAmount
int ${policy.maxMicroUsdcPerCall}
<=
assert

// Prohibit account close-out
txn AssetCloseTo
global ZeroAddress
==
assert

// Prohibit account re-keying
txn RekeyTo
global ZeroAddress
==
assert

// Enforce max transaction fee (standard 0.001 ALGO / 1000 microAlgo)
txn Fee
int 2000
<=
assert

// Expiry boundary
txn LastValid
int ${policy.expiryRound}
<=
assert

int 1
return
`;
}

export class AllowanceService {
  private algod: algosdk.Algodv2;

  constructor() {
    const algodServer = config.isMainnet
      ? "https://mainnet-api.algonode.cloud"
      : "https://testnet-api.algonode.cloud";
    this.algod = new algosdk.Algodv2("", algodServer, 443);
  }

  async compilePolicy(policy: AllowancePolicy): Promise<{
    programBytes: Uint8Array;
    programBase64: string;
    logicSigAddress: string;
    teal: string;
  }> {
    const teal = generateAllowanceTeal(policy);
    const compileResult = await this.algod.compile(Buffer.from(teal)).do();
    const programBytes = new Uint8Array(Buffer.from(compileResult.result, "base64"));

    return {
      programBytes,
      programBase64: compileResult.result,
      logicSigAddress: compileResult.hash,
      teal,
    };
  }

  createDelegatedLogicSig(
    programBytes: Uint8Array,
    userAccount: algosdk.Account
  ): algosdk.LogicSigAccount {
    const lsig = new algosdk.LogicSigAccount(programBytes);
    lsig.sign(userAccount.sk);
    return lsig;
  }

  exportDelegatedLogicSig(lsig: algosdk.LogicSigAccount): {
    logic: string;
    sig: string;
    address: string;
  } {
    return {
      logic: Buffer.from(lsig.lsig.logic).toString("base64"),
      sig: lsig.lsig.sig ? Buffer.from(lsig.lsig.sig).toString("base64") : "",
      address: lsig.address().toString(),
    };
  }

  importDelegatedLogicSig(exported: {
    logic: string;
    sig: string;
  }): algosdk.LogicSigAccount {
    const logic = new Uint8Array(Buffer.from(exported.logic, "base64"));
    const lsig = new algosdk.LogicSigAccount(logic);
    if (exported.sig) {
      lsig.lsig.sig = new Uint8Array(Buffer.from(exported.sig, "base64"));
    }
    return lsig;
  }
}

export const allowanceService = new AllowanceService();
