import axios, { AxiosInstance, AxiosResponse, AxiosError } from "axios";

const BASE_URL = "https://app.paymoapp.com/api";

/** Minimum remaining requests before we start preemptive throttling */
const RATE_LIMIT_BUFFER = 2;
/** Max number of automatic retries on 429 */
const MAX_RETRIES = 3;
/** Default wait (ms) when Retry-After header is missing on a 429 */
const DEFAULT_RETRY_MS = 5_000;

interface RateLimitState {
  /** Length in seconds of the current decay period */
  decayPeriod: number | null;
  /** Total requests allowed per decay period */
  limit: number | null;
  /** Remaining requests in the current decay period */
  remaining: number | null;
  /** Timestamp (ms) when the current decay period resets */
  resetsAt: number | null;
}

export interface PaymoProject {
  id: number;
  name: string;
  code: string;
  description: string;
  client_id: number;
  active: boolean;
  billable: boolean;
  created_on: string;
  updated_on: string;
}

export interface PaymoTask {
  id: number;
  name: string;
  code: string;
  project_id: number;
  tasklist_id: number;
  complete: boolean;
  billable: boolean;
  description: string;
  users: number[];
  created_on: string;
  updated_on: string;
}

export interface PaymoEntry {
  id: number;
  task_id: number;
  user_id: number;
  project_id: number;
  date?: string;
  duration?: number;
  start_time?: string;
  end_time?: string;
  description: string;
  added_manually: boolean;
  is_bulk: boolean;
  billed: boolean;
  created_on: string;
  updated_on: string;
}

export interface CreateEntryPayload {
  task_id: number;
  date: string;
  duration: number;
  description: string;
}

export class PaymoClient {
  private client: AxiosInstance;
  private userId: number | null = null;
  private rateLimit: RateLimitState = {
    decayPeriod: null,
    limit: null,
    remaining: null,
    resetsAt: null,
  };

  constructor(apiKey: string) {
    const token = Buffer.from(`${apiKey}:X`).toString("base64");
    this.client = axios.create({
      baseURL: BASE_URL,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Basic ${token}`,
      },
    });

    // ── Response interceptor: track rate-limit headers ──────────
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        this.updateRateLimitState(response);
        return response;
      },
      async (error: AxiosError) => {
        if (error.response) {
          this.updateRateLimitState(error.response);
        }

        // Handle 429 Too Many Requests with automatic retry
        if (error.response?.status === 429) {
          const config = error.config as any;
          config.__retryCount = config.__retryCount || 0;

          if (config.__retryCount >= MAX_RETRIES) {
            return Promise.reject(error);
          }
          config.__retryCount++;

          const retryAfter = Number(error.response.headers["retry-after"]);
          const waitMs = retryAfter > 0 ? retryAfter * 1_000 : DEFAULT_RETRY_MS;

          console.warn(
            `  ⏳ Rate limited — waiting ${(waitMs / 1_000).toFixed(1)}s before retry ` +
              `(attempt ${config.__retryCount}/${MAX_RETRIES})`,
          );

          await PaymoClient.sleep(waitMs);
          return this.client.request(config);
        }

        return Promise.reject(error);
      },
    );
  }

  // ── Rate-limit helpers ────────────────────────────────────────

  /** Parse rate-limit headers from a response and update local state */
  private updateRateLimitState(response: AxiosResponse): void {
    const headers = response.headers;
    const decay = Number(headers["x-ratelimit-decay-period"]);
    const limit = Number(headers["x-ratelimit-limit"]);
    const remaining = Number(headers["x-ratelimit-remaining"]);

    if (!isNaN(decay) && decay > 0) this.rateLimit.decayPeriod = decay;
    if (!isNaN(limit) && limit > 0) this.rateLimit.limit = limit;
    if (!isNaN(remaining) && remaining >= 0) {
      this.rateLimit.remaining = remaining;
      // Estimate when the current window resets
      if (this.rateLimit.decayPeriod) {
        this.rateLimit.resetsAt =
          Date.now() + this.rateLimit.decayPeriod * 1_000;
      }
    }
  }

  /**
   * Wait if we are near the rate limit.
   *
   * Call this before every request that is part of a bulk loop.
   * - If remaining > buffer → proceeds immediately (no delay).
   * - If remaining <= buffer → sleeps until the decay window resets,
   *   distributing the remaining budget evenly.
   */
  async waitIfNeeded(): Promise<void> {
    const { remaining, limit, resetsAt, decayPeriod } = this.rateLimit;

    // No data yet — nothing to throttle
    if (remaining === null || resetsAt === null) return;

    // Reset window has passed — clear stale state
    if (Date.now() >= resetsAt) {
      this.rateLimit.remaining = this.rateLimit.limit;
      this.rateLimit.resetsAt = null;
      return;
    }

    // Still have comfortable headroom
    if (remaining > RATE_LIMIT_BUFFER) return;

    // Close to the limit — spread remaining calls over the time left
    const msLeft = resetsAt - Date.now();
    const callsLeft = Math.max(remaining, 1);
    const delay = Math.ceil(msLeft / callsLeft);

    console.warn(
      `  ⏳ Approaching rate limit (${remaining}/${limit} remaining, ` +
        `window resets in ${(msLeft / 1_000).toFixed(1)}s) — pausing ${(delay / 1_000).toFixed(1)}s`,
    );

    await PaymoClient.sleep(delay);
  }

  static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Get and cache the authenticated user's ID */
  async getUserId(): Promise<number> {
    if (this.userId === null) {
      const data = await this.me();
      this.userId = data.users[0].id;
    }
    return this.userId!;
  }

  async getProjects(activeOnly = true): Promise<PaymoProject[]> {
    const where = activeOnly ? "?where=active=true" : "";
    const response = await this.client.get(`/projects${where}`);
    return response.data.projects;
  }

  async getTasks(projectId?: number): Promise<PaymoTask[]> {
    const where = projectId ? `?where=project_id=${projectId}` : "";
    const response = await this.client.get(`/tasks${where}`);
    return response.data.tasks;
  }

  async createEntry(payload: CreateEntryPayload): Promise<PaymoEntry> {
    const userId = await this.getUserId();
    const response = await this.client.post("/entries", {
      ...payload,
      user_id: userId,
    });
    return response.data.entries[0];
  }

  async getEntries(
    taskId: number,
    dateFrom: string,
    dateTo: string,
  ): Promise<PaymoEntry[]> {
    const userId = await this.getUserId();
    const where = `?where=user_id=${userId} and task_id=${taskId} and time_interval in ("${dateFrom}T00:00:00Z","${dateTo}T23:59:59Z")`;
    const response = await this.client.get(`/entries${where}`);
    return response.data.entries;
  }

  async getEntriesByDate(
    dateFrom: string,
    dateTo: string,
  ): Promise<PaymoEntry[]> {
    const userId = await this.getUserId();
    const where = `?where=user_id=${userId} and time_interval in ("${dateFrom}T00:00:00Z","${dateTo}T23:59:59Z")`;
    const response = await this.client.get(`/entries${where}`);
    return response.data.entries;
  }

  async deleteEntry(entryId: number): Promise<void> {
    await this.client.delete(`/entries/${entryId}`);
  }

  /** Verify credentials by fetching current user */
  async me(): Promise<any> {
    const response = await this.client.get("/me");
    return response.data;
  }
}
