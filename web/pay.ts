// Browser payments for the Playground: the Moltworld SDK (x402 over Algorand) with either a
// connected wallet (use-wallet) or an agent mandate as the signer. Bundled by `pnpm vendor`.
import algosdk from "algosdk";
import { custom, NetworkConfigBuilder, NetworkId, WalletManager, type WalletAdapterConfig } from "@txnlab/use-wallet";
import { agentKeyFromSecret, createMandateSigner, fromBase64, fromUtf8, generateAgentKey, mandateAgent, MoltworldClient, type AvmSigner, type MandateCredential } from "../sdk/js/src/index.js";

export { agentKeyFromSecret, generateAgentKey, mandateAgent };

export interface PayConfig {
  origin: string;
  network: "mainnet" | "testnet";
  usdcAssetId: number;
  /** Algod for building payments; the SDK's public default is used when absent. */
  algodUrl?: string;
  /** Base64 secret key of a funded local-ledger account. Only ever set by the offline stack. */
  devWalletKey?: string;
}

export interface WalletOption {
  id: string;
  name: string;
  icon: string;
}

export interface Wallets {
  options: WalletOption[];
  readonly address: string | null;
  connect(id: string): Promise<string>;
  disconnect(): Promise<void>;
  signer(): AvmSigner;
  usdcBalanceMicro(): Promise<number | null>;
  onChange(listener: () => void): () => void;
}

/** Accepts the MOLTWORLD_MANDATE value (base64 JSON) or the raw JSON credential. */
export function parseMandate(text: string): MandateCredential {
  const raw = text.trim();
  const json = raw.startsWith("{") ? raw : fromUtf8(fromBase64(raw));
  const value = JSON.parse(json);
  if (!value || typeof value.owner !== "string" || typeof value.programB64 !== "string" || typeof value.delegationSigB64 !== "string") {
    throw new Error("Not a mandate credential: expected owner, programB64 and delegationSigB64.");
  }
  return value;
}

/** The mandate's id: the address of its program. */
export function mandateId(credential: MandateCredential): string {
  return new algosdk.LogicSigAccount(fromBase64(credential.programB64)).address().toString();
}

/** Throws unless the credential's delegation matches its owner and the agent key is the one it's bound to. */
export function checkMandate(credential: MandateCredential, agentSecretKeyB64?: string): string {
  return createMandateSigner(credential, agentSecretKeyB64).address;
}

function devWallet(secretKeyB64: string): WalletAdapterConfig {
  const sk = fromBase64(secretKeyB64);
  const address = new algosdk.Address(sk.slice(32)).toString();
  const accounts = [{ name: "Local dev wallet", address }];
  return custom({
    metadata: { name: "Local dev wallet", icon: "" },
    provider: {
      connect: async () => accounts,
      resumeSession: async () => accounts,
      disconnect: async () => {},
      async signTransactions(txnGroup, indexesToSign) {
        const group = (txnGroup as Array<Uint8Array | algosdk.Transaction>).flat() as Array<Uint8Array | algosdk.Transaction>;
        return group.map((t, i) => {
          if (indexesToSign && !indexesToSign.includes(i)) return null;
          const txn = t instanceof Uint8Array ? algosdk.decodeUnsignedTransaction(t) : t;
          return txn.sender.toString() === address ? txn.signTxn(sk) : null;
        });
      },
    },
  });
}

export async function createWallets(cfg: PayConfig): Promise<Wallets> {
  const adapters: WalletAdapterConfig[] = [];
  if (cfg.devWalletKey) adapters.push(devWallet(cfg.devWalletKey));
  const [{ pera }, { defly }, { lute }, { kibisis }] = await Promise.all([
    import("@txnlab/use-wallet-pera"),
    import("@txnlab/use-wallet-defly"),
    import("@txnlab/use-wallet-lute"),
    import("@txnlab/use-wallet-kibisis"),
  ]);
  adapters.push(pera(), defly(), lute({ siteName: "Moltworld" }), kibisis());

  const networkId = cfg.network === "mainnet" ? NetworkId.MAINNET : NetworkId.TESTNET;
  const builder = new NetworkConfigBuilder();
  if (cfg.algodUrl) {
    // use-wallet merges in a default port, so pass the URL's own port explicitly.
    const url = new URL(cfg.algodUrl);
    const algod = { token: "", baseServer: `${url.protocol}//${url.hostname}`, port: url.port || (url.protocol === "https:" ? "443" : "80") };
    if (networkId === NetworkId.MAINNET) builder.mainnet({ algod });
    else builder.testnet({ algod });
  }
  const manager = new WalletManager({ wallets: adapters, networks: builder.build(), defaultNetwork: networkId });
  await manager.resumeSessions().catch(() => {});

  const listeners = new Set<() => void>();
  manager.subscribe(() => listeners.forEach((l) => l()));

  return {
    options: manager.wallets.map((w) => ({ id: w.walletKey, name: w.metadata.name, icon: w.metadata.icon })),
    get address() {
      return manager.activeAddress;
    },
    async connect(id) {
      const wallet = manager.getWallet(id as any);
      if (!wallet) throw new Error(`Unknown wallet ${id}.`);
      const accounts = await wallet.connect();
      wallet.setActive();
      if (!accounts.length) throw new Error("The wallet returned no accounts.");
      return manager.activeAddress ?? accounts[0].address;
    },
    async disconnect() {
      await manager.activeWallet?.disconnect();
    },
    signer() {
      const address = manager.activeAddress;
      if (!address) throw new Error("Connect a wallet first.");
      return { address, signTransactions: (txns, indexesToSign) => manager.signTransactions(txns, indexesToSign) };
    },
    async usdcBalanceMicro() {
      const address = manager.activeAddress;
      if (!address) return null;
      try {
        const info = await manager.algodClient.accountAssetInformation(address, cfg.usdcAssetId).do();
        return Number(info.assetHolding?.amount ?? 0);
      } catch {
        return null; // Not opted in to USDC, or the node is unreachable.
      }
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function createClient(cfg: PayConfig, payer: { signer?: AvmSigner; mandate?: MandateCredential; agentKey?: string }, maxPerRequestUsd: number): MoltworldClient {
  return new MoltworldClient({ baseUrl: cfg.origin, ...payer, maxPerRequestUsd, algodUrl: cfg.algodUrl });
}
