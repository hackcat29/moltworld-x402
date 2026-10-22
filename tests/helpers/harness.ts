import http from "http";
import algosdk from "algosdk";
import { x402Facilitator } from "@x402/core/facilitator";
import { ExactAvmScheme as FacilitatorExactAvmScheme } from "@x402/avm/exact/facilitator";
import { ExactAvmScheme as ClientExactAvmScheme } from "@x402/avm/exact/client";
import { toClientAvmSigner } from "@x402/avm";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";

/**
 * End-to-end harness: a mock algod, a facilitator running the reference
 * @x402/avm facilitator logic (signature checks, amount/receiver/asset checks,
 * fee-payer rules) over a simulated ledger, and real @x402 clients that build
 * and sign genuine Algorand transaction groups.
 */

export const TESTNET_GENESIS = "SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=";
export const NETWORKS = [`algorand:${TESTNET_GENESIS}`, "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDe"];
export const USDC = 10458941;

export interface Chain {
  balances: Map<string, number>;
  round: number;
  settled: Array<{ txid: string; from: string; to: string; amount: number; lsig: boolean }>;
  failNextSettle: boolean;
  /** Called for lsig-signed payments so tests can model program evaluation. */
  lsigCheck?: (stxn: algosdk.SignedTransaction) => string | null;
}

function listen(server: http.Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as any;
      resolve(`http://127.0.0.1:${addr.port}`);
    });
  });
}

async function readJson(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
}

export async function startHarness() {
  const chain: Chain = { balances: new Map(), round: 1_000_000, settled: [], failNextSettle: false };

  const algod = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/v2/transactions/params") {
      return send(res, 200, {
        "consensus-version": "test",
        fee: 0,
        "genesis-hash": TESTNET_GENESIS,
        "genesis-id": "testnet-v1.0",
        "last-round": chain.round,
        "min-fee": 1000,
      });
    }
    if (url.pathname === "/v2/status") return send(res, 200, { "last-round": chain.round });
    const asset = url.pathname.match(/^\/v2\/accounts\/([A-Z2-7]+)\/assets\/(\d+)$/);
    if (asset) {
      const amount = chain.balances.get(asset[1]);
      if (amount === undefined) return send(res, 404, { message: "account asset info not found" });
      return send(res, 200, { round: chain.round, "asset-holding": { amount, "asset-id": Number(asset[2]), "is-frozen": false } });
    }
    send(res, 404, { message: `mock algod: no route ${url.pathname}` });
  });
  const algodUrl = await listen(algod);

  const feePayer = algosdk.generateAccount();
  const feePayerAddress = feePayer.addr.toString();

  const evaluate = (signed: Uint8Array[]): string | null => {
    for (const bytes of signed) {
      const stxn = algosdk.decodeSignedTransaction(bytes);
      const txn = stxn.txn;
      if (txn.type !== "axfer") continue;
      const from = txn.sender.toString();
      const amount = Number(txn.assetTransfer!.amount);
      if (stxn.lsig) {
        const problem = chain.lsigCheck?.(stxn) ?? null;
        if (problem) return `logic eval error: ${problem}`;
      }
      const balance = chain.balances.get(from) ?? 0;
      if (balance < amount) return `overspend: ${from} holds ${balance}, needs ${amount}`;
    }
    return null;
  };

  const facilitatorSigner = {
    getAddresses: () => [feePayerAddress],
    signTransaction: async (txnBytes: Uint8Array) => algosdk.decodeUnsignedTransaction(txnBytes).signTxn(feePayer.sk),
    getAlgodClient: () => {
      throw new Error("not used");
    },
    simulateTransactions: async (txns: Uint8Array[]) => {
      const failure = evaluate(txns);
      return { txnGroups: [failure ? { failureMessage: failure } : {}] } as any;
    },
    sendTransactions: async (txns: Uint8Array[]) => {
      if (chain.failNextSettle) {
        chain.failNextSettle = false;
        throw new Error("mock network rejected the group");
      }
      const failure = evaluate(txns);
      if (failure) throw new Error(failure);
      let id = "";
      for (const bytes of txns) {
        const stxn = algosdk.decodeSignedTransaction(bytes);
        const txn = stxn.txn;
        if (txn.type !== "axfer") continue;
        const from = txn.sender.toString();
        const to = txn.assetTransfer!.receiver.toString();
        const amount = Number(txn.assetTransfer!.amount);
        chain.balances.set(from, (chain.balances.get(from) ?? 0) - amount);
        chain.balances.set(to, (chain.balances.get(to) ?? 0) + amount);
        id = txn.txID();
        chain.settled.push({ txid: id, from, to, amount, lsig: !!stxn.lsig });
      }
      return id;
    },
    waitForConfirmation: async () => ({}),
  };

  const facilitator = new x402Facilitator();
  facilitator.register(NETWORKS as any, new FacilitatorExactAvmScheme(facilitatorSigner as any));

  const facilitatorServer = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://x");
      if (req.method === "GET" && url.pathname === "/supported") return send(res, 200, facilitator.getSupported());
      const body = await readJson(req);
      if (req.method === "POST" && url.pathname === "/verify") {
        return send(res, 200, await facilitator.verify(body.paymentPayload, body.paymentRequirements));
      }
      if (req.method === "POST" && url.pathname === "/settle") {
        return send(res, 200, await facilitator.settle(body.paymentPayload, body.paymentRequirements));
      }
      send(res, 404, { error: "not found" });
    } catch (err: any) {
      send(res, 500, { error: err.message });
    }
  });
  const facilitatorUrl = await listen(facilitatorServer);

  return {
    chain,
    algodUrl,
    facilitatorUrl,
    feePayerAddress,
    async close() {
      await new Promise((r) => algod.close(r));
      await new Promise((r) => facilitatorServer.close(r));
    },
  };
}

export type Harness = Awaited<ReturnType<typeof startHarness>>;

/** A funded agent wallet with a payment-enabled fetch bound to the in-process app. */
export function createPayer(harness: Harness, appFetch: (req: Request) => Promise<Response>, usdcMicro = 5_000_000) {
  const account = algosdk.generateAccount();
  const address = account.addr.toString();
  harness.chain.balances.set(address, usdcMicro);
  const signer = toClientAvmSigner(Buffer.from(account.sk).toString("base64"));
  return { account, address, fetch: paymentFetch(harness, appFetch, signer) };
}

export function paymentFetch(harness: Harness, appFetch: (req: Request) => Promise<Response>, signer: any) {
  const client = new x402Client();
  for (const network of NETWORKS) client.register(network as any, new ClientExactAvmScheme(signer, { algodUrl: harness.algodUrl }));
  const base = (input: RequestInfo | URL, init?: RequestInit) => appFetch(new Request(input as any, init));
  return wrapFetchWithPayment(base as typeof fetch, client);
}
