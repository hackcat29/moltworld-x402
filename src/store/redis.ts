import { Redis } from "ioredis";
import { config } from "../config.js";

class RedisStore {
  private client: Redis | null = null;
  private inMemoryReservations: Map<string, number> = new Map();
  private inMemoryRateLimits: Map<string, { count: number; resetAt: number }> = new Map();
  private inMemoryLocks: Map<string, number> = new Map();

  constructor() {
    if (config.redisUrl) {
      try {
        this.client = new Redis(config.redisUrl, {
          maxRetriesPerRequest: 2,
          lazyConnect: true,
          connectTimeout: 3000,
        });
        this.client.connect().catch((err: any) => {
          console.warn("Redis connection failed. Falling back to in-memory store:", err);
          this.client = null;
        });
      } catch (err: any) {
        console.warn("Redis initialization failed. Falling back to in-memory store:", err);
        this.client = null;
      }
    }
  }

  async reservePayerFunds(payer: string, amountMicroUsdc: number, _timeoutSec = 60): Promise<boolean> {
    const key = `reserve:${payer}`;
    if (this.client) {
      try {
        await this.client.incrby(key, amountMicroUsdc);
        await this.client.expire(key, _timeoutSec);
        return true;
      } catch (err) {
        console.error("Redis reservePayerFunds error:", err);
      }
    }
    const current = this.inMemoryReservations.get(key) || 0;
    this.inMemoryReservations.set(key, current + amountMicroUsdc);
    return true;
  }

  async releasePayerFunds(payer: string, amountMicroUsdc: number): Promise<void> {
    const key = `reserve:${payer}`;
    if (this.client) {
      try {
        const newVal = await this.client.decrby(key, amountMicroUsdc);
        if (newVal <= 0) {
          await this.client.del(key);
        }
        return;
      } catch (err) {
        console.error("Redis releasePayerFunds error:", err);
      }
    }
    const current = this.inMemoryReservations.get(key) || 0;
    const nextVal = current - amountMicroUsdc;
    if (nextVal <= 0) {
      this.inMemoryReservations.delete(key);
    } else {
      this.inMemoryReservations.set(key, nextVal);
    }
  }

  async getReservedFunds(payer: string): Promise<number> {
    const key = `reserve:${payer}`;
    if (this.client) {
      try {
        const val = await this.client.get(key);
        return val ? parseInt(val, 10) : 0;
      } catch {}
    }
    return this.inMemoryReservations.get(key) || 0;
  }

  async checkRateLimit(
    key: string,
    maxRequests: number,
    windowMs: number
  ): Promise<{ allowed: boolean; remaining: number; resetMs: number }> {
    const now = Date.now();
    const redisKey = `ratelimit:${key}`;

    if (this.client) {
      try {
        const count = await this.client.incr(redisKey);
        if (count === 1) {
          await this.client.pexpire(redisKey, windowMs);
        }
        const ttl = await this.client.pttl(redisKey);
        const allowed = count <= maxRequests;
        return {
          allowed,
          remaining: Math.max(0, maxRequests - count),
          resetMs: ttl > 0 ? ttl : windowMs,
        };
      } catch (err) {
        console.error("Redis rate limit error:", err);
      }
    }

    const entry = this.inMemoryRateLimits.get(redisKey);
    if (!entry || entry.resetAt <= now) {
      this.inMemoryRateLimits.set(redisKey, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: maxRequests - 1, resetMs: windowMs };
    }

    entry.count++;
    const allowed = entry.count <= maxRequests;
    return {
      allowed,
      remaining: Math.max(0, maxRequests - entry.count),
      resetMs: Math.max(0, entry.resetAt - now),
    };
  }

  async acquireLock(key: string, ttlMs = 10000): Promise<boolean> {
    const now = Date.now();
    const redisKey = `lock:${key}`;

    if (this.client) {
      try {
        const res = await this.client.set(redisKey, "1", "PX", ttlMs, "NX");
        return res === "OK";
      } catch {}
    }

    const expiresAt = this.inMemoryLocks.get(redisKey);
    if (expiresAt && expiresAt > now) {
      return false;
    }
    this.inMemoryLocks.set(redisKey, now + ttlMs);
    return true;
  }

  async releaseLock(key: string): Promise<void> {
    const redisKey = `lock:${key}`;
    if (this.client) {
      try {
        await this.client.del(redisKey);
        return;
      } catch {}
    }
    this.inMemoryLocks.delete(redisKey);
  }
}

export const redisStore = new RedisStore();
