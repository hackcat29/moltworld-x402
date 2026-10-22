import algosdk from "algosdk";
import { config } from "../config.js";
import { dbStore } from "../store/db.js";

const ALGOD_SERVER = config.isMainnet
  ? "https://mainnet-api.algonode.cloud"
  : "https://testnet-api.algonode.cloud";

export class RefundService {
  private algod: algosdk.Algodv2;
  private refundAccount: algosdk.Account | null = null;

  constructor() {
    this.algod = new algosdk.Algodv2("", ALGOD_SERVER, 443);
    if (config.refundMnemonic) {
      try {
        this.refundAccount = algosdk.mnemonicToSecretKey(config.refundMnemonic);
      } catch (err) {
        console.warn("Invalid REFUND_WALLET_MNEMONIC. Automatic on-chain refunds will be recorded in db only:", err);
      }
    }
  }

  async processRefund(params: {
    requestId: string;
    payerAddress: string;
    amountMicroUsdc: number;
    reason: string;
  }): Promise<{ success: boolean; txid?: string; error?: string }> {
    const refundId = `ref-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    let txid: string | null = null;

    if (this.refundAccount) {
      try {
        const sp = await this.algod.getTransactionParams().do();
        const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
          sender: this.refundAccount.addr,
          receiver: params.payerAddress,
          assetIndex: Number(config.usdcAsaId),
          amount: params.amountMicroUsdc,
          suggestedParams: sp,
          note: new Uint8Array(Buffer.from(`x402-refund:${params.requestId}`)),
        });

        const signed = txn.signTxn(this.refundAccount.sk);
        const sendRes = await this.algod.sendRawTransaction(signed).do();
        txid = sendRes.txid;

        await algosdk.waitForConfirmation(this.algod, txid!, 3);
        console.log(`[Refund] Successfully sent ${params.amountMicroUsdc} micro-USDC to ${params.payerAddress}. TxID: ${txid}`);
      } catch (err: any) {
        console.error(`[Refund] On-chain refund transaction failed:`, err);
        await dbStore.saveRefund({
          id: refundId,
          request_id: params.requestId,
          payer_address: params.payerAddress,
          amount_microusdc: params.amountMicroUsdc,
          txid: null,
          reason: `On-chain execution failed: ${err.message}. Original reason: ${params.reason}`,
          status: "failed",
        });
        return { success: false, error: err.message };
      }
    } else {
      console.log(`[Refund] Recorded offline/mock refund of ${params.amountMicroUsdc} micro-USDC to ${params.payerAddress}.`);
    }

    await dbStore.saveRefund({
      id: refundId,
      request_id: params.requestId,
      payer_address: params.payerAddress,
      amount_microusdc: params.amountMicroUsdc,
      txid,
      reason: params.reason,
      status: "completed",
    });

    await dbStore.updateRequestStatus(params.requestId, "refunded", {
      error_message: `Refunded: ${params.reason}`,
    });

    return { success: true, txid: txid || undefined };
  }
}

export const refundService = new RefundService();
