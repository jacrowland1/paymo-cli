import axios, { AxiosInstance, AxiosResponse, AxiosError } from "axios";
import { RateLimiter } from "./utils/rateLimiter";
import {
  PaymoProject,
  PaymoTask,
  CreateEntryPayload,
  PaymoEntry,
} from "./types";

const BASE_URL = "https://app.paymoapp.com/api";

/** Max number of automatic retries on 429 */
const MAX_RETRIES = 3;
/** Default wait (ms) when Retry-After header is missing on a 429 */
const DEFAULT_RETRY_MS = 5_000;

export class PaymoClient {
  private client: AxiosInstance;
  private userId: number | null = null;
  public rateLimiter = new RateLimiter();

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
        this.rateLimiter.updateFromResponse(response);
        return response;
      },
      async (error: AxiosError) => {
        if (error.response) {
          this.rateLimiter.updateFromResponse(error.response);
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

          await RateLimiter.sleep(waitMs);
          return this.client.request(config);
        }

        return Promise.reject(error);
      },
    );
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
