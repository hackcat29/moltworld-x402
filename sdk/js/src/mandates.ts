import algosdk from "algosdk";
import { canonicalJson } from "./receipts.js";

/**
 * Owner-side mandate tooling. The owner never signs a program they have not
 * checked: verifyDraft() re-assembles the program from the requested limits and
 * refuses anything that differs by a single byte.
 */

export interface MandateTerms {
  payTo: string;
  assetId: number;
  maxPerCallMicro: number;
  expiryRound: number;
  salt: Uint8Array;
}

function uvarint(value: number): number[] {
  let v = BigInt(value);
  const out: number[] = [];
  do {
    let byte = Number(v & 0x7fn);
    v >>= 7n;
    if (v > 0n) byte |= 0x80;
    out.push(byte);
  } while (v > 0n);
  return out;
}

export function assembleMandate(t: MandateTerms): Uint8Array {
  const payTo = algosdk.decodeAddress(t.payTo).publicKey;
  const b: number[] = [8];
  const txn = (f: number) => b.push(0x31, f);
  const int = (v: number) => b.push(0x81, ...uvarint(v));
  const bytes = (x: Uint8Array) => b.push(0x80, ...uvarint(x.length), ...x);
  const zero = () => b.push(0x32, 3);
  const eq = () => b.push(0x12, 0x44);
  txn(16); int(4); eq();
  txn(17); int(t.assetId); eq();
  txn(20); bytes(payTo); eq();
  txn(18); int(t.maxPerCallMicro); b.push(0x0e, 0x44);
  txn(21); zero(); eq();
  txn(19); zero(); eq();
  txn(32); zero(); eq();
  txn(1); int(0); eq();
  txn(4); int(t.expiryRound); b.push(0x0e, 0x44);
  bytes(t.salt); b.push(0x48);
  int(1);
  return new Uint8Array(b);
}

export interface MandateDraft {
  mandate_id: string;
  program_b64: string;
  terms: { pay_to: string; asset_id: number; max_per_call_micro: number; expiry_round: number; current_round: number };
  registration: Record<string, unknown>;
}

/** Throws unless the draft is exactly a Moltworld mandate with the limits you asked for. */
export function verifyDraft(
  draft: MandateDraft,
  expected: { payTo: string; maxPerCallMicro: number; assetId: number; maxValidRounds?: number }
): Uint8Array {
  if (expected.maxValidRounds !== undefined && draft.terms.expiry_round - draft.terms.current_round > expected.maxValidRounds) {
    throw new Error("Mandate draft is valid for longer than requested. Do not sign it.");
  }
  const program = new Uint8Array(Buffer.from(draft.program_b64, "base64"));
  // The salt is the 16 bytes before the final `pop` (1 byte) and `pushint 1` (2 bytes).
  const salt = program.slice(program.length - 3 - 16, program.length - 3);
  const rebuilt = assembleMandate({
    payTo: expected.payTo,
    assetId: expected.assetId,
    maxPerCallMicro: expected.maxPerCallMicro,
    expiryRound: draft.terms.expiry_round,
    salt,
  });
  if (!Buffer.from(rebuilt).equals(Buffer.from(program))) {
    throw new Error("Mandate draft does not match the requested payee, asset or per-call limit. Do not sign it.");
  }
  if (new algosdk.LogicSigAccount(program).address().toString() !== draft.mandate_id) {
    throw new Error("Mandate id does not match the program.");
  }
  return program;
}

export function signOwnerMessage(message: Record<string, unknown>, sk: Uint8Array): string {
  return Buffer.from(algosdk.signBytes(new TextEncoder().encode(canonicalJson(message)), sk)).toString("base64");
}

/** What an agent needs to pay under a mandate. Contains no private key. */
export interface MandateCredential {
  owner: string;
  programB64: string;
  delegationSigB64: string;
}

export function createMandateSigner(credential: MandateCredential) {
  const lsig = new algosdk.LogicSigAccount(new Uint8Array(Buffer.from(credential.programB64, "base64")));
  lsig.lsig.sig = new Uint8Array(Buffer.from(credential.delegationSigB64, "base64"));
  // A delegated LogicSig also carries the delegating account's public key.
  lsig.sigkey = algosdk.decodeAddress(credential.owner).publicKey;
  if (!lsig.verify()) throw new Error("Mandate credential's delegation signature does not match the owner.");
  return {
    address: credential.owner,
    async signTransactions(txns: Uint8Array[], indexesToSign?: number[]): Promise<(Uint8Array | null)[]> {
      return txns.map((bytes, i) => {
        if (indexesToSign && !indexesToSign.includes(i)) return null;
        const txn = algosdk.decodeUnsignedTransaction(bytes);
        if (txn.sender.toString() !== credential.owner) throw new Error("Mandate signer only signs payments from the owner account.");
        return algosdk.signLogicSigTransactionObject(txn, lsig).blob;
      });
    },
  };
}

/**
 * Owner flow in one call: draft on the gateway, verify the program locally,
 * delegate it, register caps. Returns the credential to hand to the agent.
 */
export async function createMandate(
  baseUrl: string,
  owner: algosdk.Account,
  options: { maxPerCallUsd: number; dailyCapUsd: number; validDays?: number; allowedModels?: string[]; label?: string },
  fetch: typeof globalThis.fetch = globalThis.fetch
): Promise<{ mandateId: string; credential: MandateCredential }> {
  const base = baseUrl.replace(/\/$/, "");
  const health = await (await fetch(`${base}/health`)).json();
  const res = await fetch(`${base}/v1/mandates/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner: owner.addr.toString(),
      max_per_call_usd: options.maxPerCallUsd,
      daily_cap_usd: options.dailyCapUsd,
      valid_days: options.validDays ?? 30,
      allowed_models: options.allowedModels,
      label: options.label,
    }),
  });
  if (!res.ok) throw new Error(`Mandate draft failed: ${await res.text()}`);
  const draft = (await res.json()) as MandateDraft;
  const program = verifyDraft(draft, {
    payTo: health.pay_to,
    assetId: Number(health.usdc_asset_id),
    maxPerCallMicro: Math.ceil(options.maxPerCallUsd * 1_000_000),
    maxValidRounds: Math.ceil(((options.validDays ?? 30) + 1) * 31_000),
  });
  const lsig = new algosdk.LogicSigAccount(program);
  lsig.sign(owner.sk);
  const delegationSigB64 = Buffer.from(lsig.lsig.sig!).toString("base64");
  const registration = { ...draft.registration, issued_at: Math.floor(Date.now() / 1000) };
  const reg = await fetch(`${base}/v1/mandates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ program_b64: draft.program_b64, delegation_sig: delegationSigB64, registration, owner_sig: signOwnerMessage(registration, owner.sk) }),
  });
  if (!reg.ok) throw new Error(`Mandate registration failed: ${await reg.text()}`);
  return { mandateId: draft.mandate_id, credential: { owner: owner.addr.toString(), programB64: draft.program_b64, delegationSigB64 } };
}

export async function revokeMandate(
  baseUrl: string,
  owner: algosdk.Account,
  mandateId: string,
  fetch: typeof globalThis.fetch = globalThis.fetch
): Promise<void> {
  const message = { action: "revoke", mandate_id: mandateId, issued_at: Math.floor(Date.now() / 1000) };
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/mandates/${mandateId}/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...message, owner_sig: signOwnerMessage(message, owner.sk) }),
  });
  if (!res.ok) throw new Error(`Revoke failed: ${await res.text()}`);
}
