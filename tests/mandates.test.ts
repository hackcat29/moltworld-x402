import { describe, expect, it } from "vitest";
import algosdk from "algosdk";
import {
  assembleMandate,
  mandateId,
  mandateTeal,
  newMandateSalt,
  parseMandateProgram,
  signOwnerMessage,
  verifyDelegation,
  verifyOwnerMessage,
} from "../src/mandates/index.js";

const PAY_TO = "NAPHTASVPDGRYORRYM237OSPA26R2TRRG4XFRRFK7K5H64H6HIIIZZIIXY";
const TESTNET_ALGOD = "https://testnet-api.algonode.cloud";
const TESTNET_USDC = 10458941;

const terms = (overrides: Partial<Parameters<typeof assembleMandate>[0]> = {}) => ({
  payTo: PAY_TO,
  assetId: TESTNET_USDC,
  maxPerCallMicro: 250_000,
  expiryRound: 90_000_000,
  salt: newMandateSalt(),
  ...overrides,
});

async function online(): Promise<boolean> {
  if (process.env.NETWORK_TESTS === "false") return false;
  try {
    return (await fetch(`${TESTNET_ALGOD}/health`, { signal: AbortSignal.timeout(4000) })).ok;
  } catch {
    return false;
  }
}

describe("mandate program", () => {
  it("round-trips terms through assemble/parse", () => {
    const t = terms();
    const parsed = parseMandateProgram(assembleMandate(t));
    expect(parsed).toEqual(t);
  });

  it("does not recognise a tampered program", () => {
    const program = assembleMandate(terms());
    const tampered = new Uint8Array(program);
    tampered[tampered.length - 1] = 0; // pushint 1 -> pushint 0
    expect(parseMandateProgram(tampered)).toBeNull();
    expect(parseMandateProgram(new Uint8Array([8, 0x81, 1]))).toBeNull();
  });

  it("gives each mandate a distinct id", () => {
    expect(mandateId(assembleMandate(terms()))).not.toBe(mandateId(assembleMandate(terms())));
  });

  it("verifies the owner's delegation and control-message signatures", () => {
    const owner = algosdk.generateAccount();
    const other = algosdk.generateAccount();
    const program = assembleMandate(terms());
    const lsig = new algosdk.LogicSigAccount(program);
    lsig.sign(owner.sk);
    const sig = Buffer.from(lsig.lsig.sig!).toString("base64");
    expect(verifyDelegation(program, sig, owner.addr.toString())).toBe(true);
    expect(verifyDelegation(program, sig, other.addr.toString())).toBe(false);

    const message = { action: "revoke", mandate_id: "X", issued_at: 1 };
    expect(verifyOwnerMessage(message, signOwnerMessage(message, owner.sk), owner.addr.toString())).toBe(true);
    expect(verifyOwnerMessage({ ...message, issued_at: 2 }, signOwnerMessage(message, owner.sk), owner.addr.toString())).toBe(false);
  });
});

describe("mandate program on Algorand testnet", () => {
  it("compiles to exactly the locally assembled bytes", async (ctx) => {
    if (!(await online())) return ctx.skip();
    for (const t of [terms(), terms({ maxPerCallMicro: 1, expiryRound: 1 }), terms({ maxPerCallMicro: 2 ** 40 })]) {
      const res = await fetch(`${TESTNET_ALGOD}/v2/teal/compile`, { method: "POST", body: mandateTeal(t) });
      const { result } = await res.json();
      expect(result).toBe(Buffer.from(assembleMandate(t)).toString("base64"));
    }
  });

  it("is enforced by the AVM: over-limit, wrong payee and fee-bearing payments are rejected by logic", async (ctx) => {
    if (!(await online())) return ctx.skip();
    const algod = new algosdk.Algodv2("", TESTNET_ALGOD, 443);
    const sp = await algod.getTransactionParams().do();
    const owner = algosdk.generateAccount();
    const t = terms({ expiryRound: Number(sp.lastValid) + 10 });
    const lsig = new algosdk.LogicSigAccount(assembleMandate(t));
    lsig.sign(owner.sk);

    const simulate = async (amount: number, receiver = PAY_TO, fee = 0) => {
      const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender: owner.addr,
        receiver,
        assetIndex: TESTNET_USDC,
        amount,
        suggestedParams: { ...sp, fee: BigInt(fee), flatFee: true },
      });
      const signed = algosdk.decodeSignedTransaction(algosdk.signLogicSigTransactionObject(txn, lsig).blob);
      const request = new algosdk.modelsv2.SimulateRequest({
        txnGroups: [new algosdk.modelsv2.SimulateRequestTransactionGroup({ txns: [signed] })],
      });
      const result = await algod.simulateTransactions(request).do();
      return result.txnGroups[0].failureMessage ?? "";
    };

    // Within terms: the program approves; the unfunded test account then fails on balance.
    const ok = await simulate(t.maxPerCallMicro);
    expect(ok).not.toMatch(/rejected by logic|logic eval/i);
    for (const failure of [
      await simulate(t.maxPerCallMicro + 1),
      await simulate(1, algosdk.generateAccount().addr.toString()),
      await simulate(1, PAY_TO, 1000),
    ]) {
      expect(failure).toMatch(/rejected by logic|assert failed|logic eval/i);
    }
  });
});
