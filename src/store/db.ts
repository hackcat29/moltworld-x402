import pg from "pg";
import { config } from "../config.js";

const { Pool } = pg;

export interface RequestRecord {
  id: string;
  idempotency_key?: string | null;
  payer_address: string;
  pay_to_address: string;
  network: string;
  txid?: string | null;
  model_slug: string;
  modality: string;
  upstream_provider?: string | null;
  upstream_model?: string | null;
  quote_amount_usd: number;
  quote_microusdc: number;
  upstream_cost_usd?: number | null;
  payment_flow: string;
  status: "pending" | "settled" | "completed" | "failed" | "refunded";
  request_hash: string;
  response_hash?: string | null;
  error_message?: string | null;
  response_payload?: any | null;
  created_at: Date;
  updated_at: Date;
}

export interface RefundRecord {
  id: string;
  request_id: string;
  payer_address: string;
  amount_microusdc: number;
  txid?: string | null;
  reason: string;
  status: "completed" | "failed";
  created_at: Date;
}

export interface JobRecord {
  id: string;
  request_id: string;
  payer_address: string;
  model_slug: string;
  status: "queued" | "processing" | "completed" | "failed";
  video_url?: string | null;
  error_message?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface MarketplaceListing {
  id: string;
  slug: string;
  name: string;
  modality: string;
  upstream_url: string;
  creator_address: string;
  price_usd: number;
  creator_share_percent: number;
  enabled: boolean;
  created_at: Date;
}

class DatabaseStore {
  private pool: pg.Pool | null = null;
  private inMemoryRequests: Map<string, RequestRecord> = new Map();
  private inMemoryRefunds: Map<string, RefundRecord> = new Map();
  private inMemoryJobs: Map<string, JobRecord> = new Map();
  private inMemoryListings: Map<string, MarketplaceListing> = new Map();
  private inMemoryIdempotency: Map<string, string> = new Map(); // idempotency_key -> request_id

  constructor() {
    if (config.databaseUrl) {
      try {
        this.pool = new Pool({
          connectionString: config.databaseUrl,
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        });
        this.initPostgresSchema().catch((err) => {
          console.error("Failed to initialize PostgreSQL schema:", err);
        });
      } catch (err) {
        console.warn("Postgres connection failed. Falling back to in-memory store:", err);
        this.pool = null;
      }
    }
  }

  private async initPostgresSchema(): Promise<void> {
    if (!this.pool) return;
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS x402_requests (
          id VARCHAR(64) PRIMARY KEY,
          idempotency_key VARCHAR(128) UNIQUE,
          payer_address VARCHAR(64) NOT NULL,
          pay_to_address VARCHAR(64) NOT NULL,
          network VARCHAR(64) NOT NULL,
          txid VARCHAR(128),
          model_slug VARCHAR(64) NOT NULL,
          modality VARCHAR(32) NOT NULL,
          upstream_provider VARCHAR(32),
          upstream_model VARCHAR(64),
          quote_amount_usd NUMERIC(12, 6) NOT NULL,
          quote_microusdc BIGINT NOT NULL,
          upstream_cost_usd NUMERIC(12, 6),
          payment_flow VARCHAR(32) NOT NULL,
          status VARCHAR(32) NOT NULL,
          request_hash VARCHAR(64) NOT NULL,
          response_hash VARCHAR(64),
          error_message TEXT,
          response_payload JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS x402_refunds (
          id VARCHAR(64) PRIMARY KEY,
          request_id VARCHAR(64) REFERENCES x402_requests(id),
          payer_address VARCHAR(64) NOT NULL,
          amount_microusdc BIGINT NOT NULL,
          txid VARCHAR(128),
          reason TEXT NOT NULL,
          status VARCHAR(32) NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS x402_jobs (
          id VARCHAR(64) PRIMARY KEY,
          request_id VARCHAR(64) REFERENCES x402_requests(id),
          payer_address VARCHAR(64) NOT NULL,
          model_slug VARCHAR(64) NOT NULL,
          status VARCHAR(32) NOT NULL,
          video_url TEXT,
          error_message TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS x402_marketplace_listings (
          id VARCHAR(64) PRIMARY KEY,
          slug VARCHAR(64) UNIQUE NOT NULL,
          name VARCHAR(128) NOT NULL,
          modality VARCHAR(32) NOT NULL,
          upstream_url TEXT NOT NULL,
          creator_address VARCHAR(64) NOT NULL,
          price_usd NUMERIC(12, 6) NOT NULL,
          creator_share_percent NUMERIC(5, 2) NOT NULL,
          enabled BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_requests_payer ON x402_requests(payer_address);
        CREATE INDEX IF NOT EXISTS idx_requests_status ON x402_requests(status);
        CREATE INDEX IF NOT EXISTS idx_requests_created ON x402_requests(created_at);
      `);
    } finally {
      client.release();
    }
  }

  async saveRequest(record: Omit<RequestRecord, "created_at" | "updated_at">): Promise<RequestRecord> {
    const now = new Date();
    const fullRecord: RequestRecord = {
      ...record,
      created_at: now,
      updated_at: now,
    };

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO x402_requests (
            id, idempotency_key, payer_address, pay_to_address, network, txid,
            model_slug, modality, upstream_provider, upstream_model, quote_amount_usd,
            quote_microusdc, upstream_cost_usd, payment_flow, status, request_hash,
            response_hash, error_message, response_payload, created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
          ON CONFLICT (id) DO UPDATE SET
            txid = EXCLUDED.txid,
            upstream_provider = EXCLUDED.upstream_provider,
            upstream_model = EXCLUDED.upstream_model,
            upstream_cost_usd = EXCLUDED.upstream_cost_usd,
            status = EXCLUDED.status,
            response_hash = EXCLUDED.response_hash,
            error_message = EXCLUDED.error_message,
            response_payload = EXCLUDED.response_payload,
            updated_at = NOW()`,
          [
            fullRecord.id,
            fullRecord.idempotency_key || null,
            fullRecord.payer_address,
            fullRecord.pay_to_address,
            fullRecord.network,
            fullRecord.txid || null,
            fullRecord.model_slug,
            fullRecord.modality,
            fullRecord.upstream_provider || null,
            fullRecord.upstream_model || null,
            fullRecord.quote_amount_usd,
            fullRecord.quote_microusdc,
            fullRecord.upstream_cost_usd || null,
            fullRecord.payment_flow,
            fullRecord.status,
            fullRecord.request_hash,
            fullRecord.response_hash || null,
            fullRecord.error_message || null,
            fullRecord.response_payload ? JSON.stringify(fullRecord.response_payload) : null,
            fullRecord.created_at,
            fullRecord.updated_at,
          ]
        );
      } catch (err) {
        console.error("Postgres saveRequest error:", err);
      }
    }

    this.inMemoryRequests.set(fullRecord.id, fullRecord);
    if (fullRecord.idempotency_key) {
      this.inMemoryIdempotency.set(fullRecord.idempotency_key, fullRecord.id);
    }

    return fullRecord;
  }

  async updateRequestStatus(
    id: string,
    status: RequestRecord["status"],
    updates?: {
      txid?: string;
      upstream_provider?: string;
      upstream_model?: string;
      upstream_cost_usd?: number;
      response_hash?: string;
      error_message?: string;
      response_payload?: any;
    }
  ): Promise<void> {
    const existing = this.inMemoryRequests.get(id);
    if (existing) {
      existing.status = status;
      existing.updated_at = new Date();
      if (updates?.txid) existing.txid = updates.txid;
      if (updates?.upstream_provider) existing.upstream_provider = updates.upstream_provider;
      if (updates?.upstream_model) existing.upstream_model = updates.upstream_model;
      if (updates?.upstream_cost_usd !== undefined) existing.upstream_cost_usd = updates.upstream_cost_usd;
      if (updates?.response_hash) existing.response_hash = updates.response_hash;
      if (updates?.error_message) existing.error_message = updates.error_message;
      if (updates?.response_payload) existing.response_payload = updates.response_payload;
    }

    if (this.pool) {
      try {
        await this.pool.query(
          `UPDATE x402_requests SET
            status = $1,
            txid = COALESCE($2, txid),
            upstream_provider = COALESCE($3, upstream_provider),
            upstream_model = COALESCE($4, upstream_model),
            upstream_cost_usd = COALESCE($5, upstream_cost_usd),
            response_hash = COALESCE($6, response_hash),
            error_message = COALESCE($7, error_message),
            response_payload = COALESCE($8, response_payload),
            updated_at = NOW()
          WHERE id = $9`,
          [
            status,
            updates?.txid || null,
            updates?.upstream_provider || null,
            updates?.upstream_model || null,
            updates?.upstream_cost_usd || null,
            updates?.response_hash || null,
            updates?.error_message || null,
            updates?.response_payload ? JSON.stringify(updates.response_payload) : null,
            id,
          ]
        );
      } catch (err) {
        console.error("Postgres updateRequestStatus error:", err);
      }
    }
  }

  async getRequestById(id: string): Promise<RequestRecord | undefined> {
    if (this.pool) {
      try {
        const res = await this.pool.query("SELECT * FROM x402_requests WHERE id = $1", [id]);
        if (res.rows[0]) return res.rows[0];
      } catch {}
    }
    return this.inMemoryRequests.get(id);
  }

  async getRequestByIdempotencyKey(key: string): Promise<RequestRecord | undefined> {
    if (this.pool) {
      try {
        const res = await this.pool.query("SELECT * FROM x402_requests WHERE idempotency_key = $1", [key]);
        if (res.rows[0]) return res.rows[0];
      } catch {}
    }
    const reqId = this.inMemoryIdempotency.get(key);
    return reqId ? this.inMemoryRequests.get(reqId) : undefined;
  }

  async saveRefund(refund: Omit<RefundRecord, "created_at">): Promise<RefundRecord> {
    const fullRefund: RefundRecord = {
      ...refund,
      created_at: new Date(),
    };
    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO x402_refunds (id, request_id, payer_address, amount_microusdc, txid, reason, status, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            fullRefund.id,
            fullRefund.request_id,
            fullRefund.payer_address,
            fullRefund.amount_microusdc,
            fullRefund.txid || null,
            fullRefund.reason,
            fullRefund.status,
            fullRefund.created_at,
          ]
        );
      } catch (err) {
        console.error("Postgres saveRefund error:", err);
      }
    }
    this.inMemoryRefunds.set(fullRefund.id, fullRefund);
    return fullRefund;
  }

  async saveJob(job: Omit<JobRecord, "created_at" | "updated_at">): Promise<JobRecord> {
    const now = new Date();
    const fullJob: JobRecord = { ...job, created_at: now, updated_at: now };
    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO x402_jobs (id, request_id, payer_address, model_slug, status, video_url, error_message, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status,
            video_url = EXCLUDED.video_url,
            error_message = EXCLUDED.error_message,
            updated_at = NOW()`,
          [
            fullJob.id,
            fullJob.request_id,
            fullJob.payer_address,
            fullJob.model_slug,
            fullJob.status,
            fullJob.video_url || null,
            fullJob.error_message || null,
            fullJob.created_at,
            fullJob.updated_at,
          ]
        );
      } catch (err) {
        console.error("Postgres saveJob error:", err);
      }
    }
    this.inMemoryJobs.set(fullJob.id, fullJob);
    return fullJob;
  }

  async getJobById(jobId: string): Promise<JobRecord | undefined> {
    if (this.pool) {
      try {
        const res = await this.pool.query("SELECT * FROM x402_jobs WHERE id = $1", [jobId]);
        if (res.rows[0]) return res.rows[0];
      } catch {}
    }
    return this.inMemoryJobs.get(jobId);
  }

  async getStats(excludeWallets: Set<string> = new Set()): Promise<{
    totalRequests: number;
    completedRequests: number;
    failedRequests: number;
    totalGmvUsdc: number;
    totalUpstreamCostUsd: number;
    uniquePayers: number;
    repeatPayerRate: number;
    operatorTestRequests: number;
  }> {
    const all = Array.from(this.inMemoryRequests.values());
    let operatorCount = 0;
    const clientRequests: RequestRecord[] = [];

    for (const req of all) {
      if (excludeWallets.has(req.payer_address)) {
        operatorCount++;
      } else {
        clientRequests.push(req);
      }
    }

    const completed = clientRequests.filter((r) => r.status === "completed" || r.status === "settled");
    const failed = clientRequests.filter((r) => r.status === "failed");
    const gmv = completed.reduce((sum, r) => sum + Number(r.quote_amount_usd), 0);
    const upstreamCost = completed.reduce((sum, r) => sum + Number(r.upstream_cost_usd || 0), 0);

    const payerCounts = new Map<string, number>();
    for (const r of completed) {
      payerCounts.set(r.payer_address, (payerCounts.get(r.payer_address) || 0) + 1);
    }

    const uniquePayers = payerCounts.size;
    const repeatPayers = Array.from(payerCounts.values()).filter((cnt) => cnt > 1).length;
    const repeatPayerRate = uniquePayers > 0 ? parseFloat((repeatPayers / uniquePayers).toFixed(4)) : 0;

    return {
      totalRequests: clientRequests.length,
      completedRequests: completed.length,
      failedRequests: failed.length,
      totalGmvUsdc: parseFloat(gmv.toFixed(4)),
      totalUpstreamCostUsd: parseFloat(upstreamCost.toFixed(4)),
      uniquePayers,
      repeatPayerRate,
      operatorTestRequests: operatorCount,
    };
  }

  async getAllRequests(limit = 100): Promise<RequestRecord[]> {
    return Array.from(this.inMemoryRequests.values()).slice(-limit).reverse();
  }
}

export const dbStore = new DatabaseStore();
