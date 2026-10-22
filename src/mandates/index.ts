import algosdk from "algosdk";
import crypto from "crypto";
import { canonicalJson } from "../receipts/index.js";

/**
 * Agent spending mandates.
 *
 * An owner delegates a small, auditable LogicSig program to an agent. The agent
 * can then sign x402 payments *as the owner's account*, but the Algorand
 * protocol itself only lets those payments:
 *   - be USDC asset transfers,
 *   - go to Moltworld's payTo address and nowhere else,
 *   - carry at most `maxPerCallMicro` per transaction,
 *   - pay zero fee (the x402 facilitator sponsors fees), never close out or rekey,
 *   - be valid only until `expiryRound`.
 * Moltworld additionally enforces, per registered mandate, a rolling 24h spend
 * cap and a model allow-list, and refuses payments from revoked mandates. Because
 * the payee is pinned to Moltworld, a server-side revocation stops all spending.
 */

export interface MandateTerms {
  payTo: string;
  assetId: number;
  maxPerCallMicro: number;
  expiryRound: number;
  /** 16 random bytes so every mandate has a distinct program (and id). */
  salt: Uint8Array;
}

const OP = {
  txn: 0x31,
  global: 0x32,
  pushbytes: 0x80,
  pushint: 0x81,
  eq: 0x12,
  lte: 0x0e,
  assert: 0x44,
  pop: 0x48,
} as const;

const TXN = { Fee: 1, LastValid: 4, TypeEnum: 16, XferAsset: 17, AssetAmount: 18, AssetSender: 19, AssetReceiver: 20, AssetCloseTo: 21, RekeyTo: 32 } as const;
const GLOBAL_ZERO_ADDRESS = 3;
const TYPE_AXFER = 4;
const TEAL_VERSION = 8;

function uvarint(value: number | bigint): number[] {
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

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

/** TEAL source of a mandate. Kept byte-for-byte equivalent to assembleMandate(). */
export function mandateTeal(t: MandateTerms): string {
  const payTo = algosdk.decodeAddress(t.payTo).publicKey;
  return [
    `#pragma version ${TEAL_VERSION}`,
    "// Moltworld agent spending mandate (delegated LogicSig)",
    "txn TypeEnum", `pushint ${TYPE_AXFER}`, "==", "assert",
    "txn XferAsset", `pushint ${t.assetId}`, "==", "assert",
    "txn AssetReceiver", `pushbytes 0x${hex(payTo)}`, "==", "assert",
    "txn AssetAmount", `pushint ${t.maxPerCallMicro}`, "<=", "assert",
    "txn AssetCloseTo", "global ZeroAddress", "==", "assert",
    "txn AssetSender", "global ZeroAddress", "==", "assert",
    "txn RekeyTo", "global ZeroAddress", "==", "assert",
    "txn Fee", "pushint 0", "==", "assert",
    "txn LastValid", `pushint ${t.expiryRound}`, "<=", "assert",
    `pushbytes 0x${hex(t.salt)}`, "pop",
    "pushint 1",
    "",
  ].join("\n");
}

/** Assembles the mandate program locally, so verification never depends on an algod endpoint. */
export function assembleMandate(t: MandateTerms): Uint8Array {
  if (t.salt.length !== 16) throw new Error("Mandate salt must be 16 bytes.");
  const payTo = algosdk.decodeAddress(t.payTo).publicKey;
  const b: number[] = [TEAL_VERSION];
  const txn = (field: number) => b.push(OP.txn, field);
  const pushint = (v: number) => b.push(OP.pushint, ...uvarint(v));
  const pushbytes = (bytes: Uint8Array) => b.push(OP.pushbytes, ...uvarint(bytes.length), ...bytes);
  const zero = () => b.push(OP.global, GLOBAL_ZERO_ADDRESS);

  txn(TXN.TypeEnum); pushint(TYPE_AXFER); b.push(OP.eq, OP.assert);
  txn(TXN.XferAsset); pushint(t.assetId); b.push(OP.eq, OP.assert);
  txn(TXN.AssetReceiver); pushbytes(payTo); b.push(OP.eq, OP.assert);
  txn(TXN.AssetAmount); pushint(t.maxPerCallMicro); b.push(OP.lte, OP.assert);
  txn(TXN.AssetCloseTo); zero(); b.push(OP.eq, OP.assert);
  txn(TXN.AssetSender); zero(); b.push(OP.eq, OP.assert);
  txn(TXN.RekeyTo); zero(); b.push(OP.eq, OP.assert);
  txn(TXN.Fee); pushint(0); b.push(OP.eq, OP.assert);
  txn(TXN.LastValid); pushint(t.expiryRound); b.push(OP.lte, OP.assert);
  pushbytes(t.salt); b.push(OP.pop);
  pushint(1);
  return new Uint8Array(b);
}

function readUvarint(bytes: Uint8Array, offset: number): { value: number; next: number } {
  let result = 0n;
  let shift = 0n;
  let i = offset;
  for (;;) {
    if (i >= bytes.length) throw new Error("truncated varint");
    const byte = bytes[i++];
    result |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7n;
    if (shift > 63n) throw new Error("varint too long");
  }
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("integer too large");
  return { value: Number(result), next: i };
}

/**
 * Recognises a mandate program and extracts its terms. Returns null for any other
 * program. Recognition is strict: the program must re-assemble to identical bytes.
 */
export function parseMandateProgram(program: Uint8Array): MandateTerms | null {
  try {
    const ints: number[] = [];
    const blobs: Uint8Array[] = [];
    for (let i = 1; i < program.length; ) {
      const op = program[i++];
      if (op === OP.pushint) {
        const r = readUvarint(program, i);
        ints.push(r.value);
        i = r.next;
      } else if (op === OP.pushbytes) {
        const r = readUvarint(program, i);
        blobs.push(program.slice(r.next, r.next + r.value));
        i = r.next + r.value;
      } else if (op === OP.txn || op === OP.global) {
        i++;
      }
    }
    // pushints: TYPE_AXFER, asset, max, 0 (fee), expiry, 1 ; pushbytes: payTo, salt
    if (ints.length !== 6 || blobs.length !== 2 || blobs[0].length !== 32) return null;
    const terms: MandateTerms = {
      payTo: algosdk.encodeAddress(blobs[0]),
      assetId: ints[1],
      maxPerCallMicro: ints[2],
      expiryRound: ints[4],
      salt: blobs[1],
    };
    const rebuilt = assembleMandate(terms);
    return Buffer.from(rebuilt).equals(Buffer.from(program)) ? terms : null;
  } catch {
    return null;
  }
}

/** A mandate's id is the program's own Algorand address (hash of the program). */
export function mandateId(program: Uint8Array): string {
  return new algosdk.LogicSigAccount(program).address().toString();
}

export function newMandateSalt(): Uint8Array {
  return new Uint8Array(crypto.randomBytes(16));
}

/** Verifies the owner's delegation signature over the program ("Program" || program). */
export function verifyDelegation(program: Uint8Array, signatureB64: string, owner: string): boolean {
  try {
    const sig = Buffer.from(signatureB64, "base64");
    const message = Buffer.concat([Buffer.from("Program"), Buffer.from(program)]);
    const publicKey = algosdk.decodeAddress(owner).publicKey;
    return crypto.verify(
      null,
      message,
      crypto.createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(publicKey)]), format: "der", type: "spki" }),
      sig
    );
  } catch {
    return false;
  }
}

/** Owner-signed control messages (register / revoke) use algosdk's "MX"-prefixed signBytes. */
export function verifyOwnerMessage(message: Record<string, unknown>, signatureB64: string, owner: string): boolean {
  try {
    return algosdk.verifyBytes(new TextEncoder().encode(canonicalJson(message)), Buffer.from(signatureB64, "base64"), owner);
  } catch {
    return false;
  }
}

export function signOwnerMessage(message: Record<string, unknown>, sk: Uint8Array): string {
  return Buffer.from(algosdk.signBytes(new TextEncoder().encode(canonicalJson(message)), sk)).toString("base64");
}

/** Pulls the LogicSig program out of an x402 AVM payment payload, if the payment is lsig-signed. */
export function logicSigProgramFromPayload(payload: any): Uint8Array | null {
  try {
    const group: string[] = payload?.payload?.paymentGroup;
    const index: number = payload?.payload?.paymentIndex ?? 0;
    if (!Array.isArray(group) || !group[index]) return null;
    const stxn = algosdk.decodeSignedTransaction(Buffer.from(group[index], "base64"));
    return stxn.lsig?.logic ?? null;
  } catch {
    return null;
  }
}

/**
 * Canonical identity of an x402 AVM payment: the Algorand txid of its payment
 * transaction. Re-encoding the same signed payment cannot produce a new key.
 */
export function paymentTxidFromPayload(payload: any): string | null {
  try {
    const group: string[] = payload?.payload?.paymentGroup;
    const index: number = payload?.payload?.paymentIndex ?? 0;
    return algosdk.decodeSignedTransaction(Buffer.from(group[index], "base64")).txn.txID();
  } catch {
    return null;
  }
}

export function paymentTxidFromHeader(header: string): string | null {
  try {
    return paymentTxidFromPayload(JSON.parse(Buffer.from(header, "base64").toString("utf8")));
  } catch {
    return null;
  }
}

export function payerFromPayload(payload: any): string | null {
  try {
    const group: string[] = payload?.payload?.paymentGroup;
    const index: number = payload?.payload?.paymentIndex ?? 0;
    const stxn = algosdk.decodeSignedTransaction(Buffer.from(group[index], "base64"));
    return stxn.txn.sender.toString();
  } catch {
    return null;
  }
}
