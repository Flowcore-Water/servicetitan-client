/**
 * ServiceTitan API client with OAuth token management, retry, and pagination.
 *
 * Usage:
 *   const st = new ServiceTitanClient();           // reads from env vars
 *   const st = new ServiceTitanClient({ ... });     // explicit config
 *   const trucks = await st.paginateAll("inventory/v2/tenant/{tenantId}/trucks");
 */

export interface ServiceTitanClientConfig {
  clientId?: string;
  clientSecret?: string;
  tenantId?: string;
  appKey?: string;
  apiUrl?: string;
  authUrl?: string;
  /** Max retry attempts for retryable errors (default: 4) */
  maxRetries?: number;
  /** Request timeout in ms (default: 60000) */
  timeoutMs?: number;
}

export interface PageResult<T = Record<string, unknown>> {
  page: number;
  pageSize: number;
  totalCount?: number;
  hasMore: boolean;
  data: T[];
}

const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);
const TOKEN_REFRESH_BUFFER_S = 30;

export class ServiceTitanClient {
  readonly tenantId: string;
  readonly appKey: string;

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly apiUrl: string;
  private readonly authUrl: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;

  private token: string | null = null;
  private tokenExpiresAt = 0;

  constructor(config: ServiceTitanClientConfig = {}) {
    this.clientId = config.clientId ?? env("SERVICETITAN_CLIENT_ID");
    this.clientSecret = config.clientSecret ?? env("SERVICETITAN_CLIENT_SECRET");
    this.tenantId = config.tenantId ?? env("SERVICETITAN_TENANT_ID");
    this.appKey = config.appKey ?? env("SERVICETITAN_APP_KEY");
    this.apiUrl = (config.apiUrl ?? process.env.SERVICETITAN_API_URL ?? "https://api.servicetitan.io").replace(/\/$/, "");
    this.authUrl = config.authUrl ?? process.env.SERVICETITAN_AUTH_URL ?? "https://auth.servicetitan.io/connect/token";
    this.maxRetries = config.maxRetries ?? 4;
    this.timeoutMs = config.timeoutMs ?? 60_000;
  }

  /** Resolve `{tenantId}` placeholder in a path. */
  tenantPath(path: string): string {
    return path.replace(/\{tenantId\}/g, this.tenantId);
  }

  // ── HTTP methods ──────────────────────────────────────────────────

  async get<T = unknown>(path: string, params?: Record<string, string | number>): Promise<T> {
    return this.request<T>("GET", path, undefined, params);
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  async patch<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", path, body);
  }

  async delete<T = void>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  // ── Pagination ────────────────────────────────────────────────────

  /**
   * Fetch a single page of results.
   */
  async getPage<T = Record<string, unknown>>(
    path: string,
    page = 1,
    pageSize = 200,
    params?: Record<string, string | number>,
  ): Promise<PageResult<T>> {
    const allParams = { page, pageSize, ...params };
    return this.get<PageResult<T>>(path, allParams as Record<string, string | number>);
  }

  /**
   * Auto-paginate through all results and return a flat array.
   */
  async paginateAll<T = Record<string, unknown>>(
    path: string,
    pageSize = 200,
    params?: Record<string, string | number>,
  ): Promise<T[]> {
    const results: T[] = [];
    let page = 1;
    while (true) {
      const result = await this.getPage<T>(path, page, pageSize, params);
      results.push(...result.data);
      if (!result.hasMore) break;
      page++;
    }
    return results;
  }

  /**
   * Paginate records modified after a given ISO timestamp (delta sync).
   */
  async fetchModifiedSince<T = Record<string, unknown>>(
    path: string,
    since?: string,
    pageSize = 200,
    deltaParam = "modifiedOnOrAfter",
  ): Promise<T[]> {
    const params: Record<string, string | number> = {};
    if (since) params[deltaParam] = since;
    return this.paginateAll<T>(path, pageSize, params);
  }

  // ── Token management ──────────────────────────────────────────────

  private async ensureToken(): Promise<void> {
    if (this.token && Date.now() / 1000 < this.tokenExpiresAt - TOKEN_REFRESH_BUFFER_S) {
      return;
    }

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    const resp = await fetch(this.authUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!resp.ok) {
      throw new ServiceTitanError(`Token request failed: ${resp.status} ${resp.statusText}`, resp.status);
    }

    const data = (await resp.json()) as { access_token: string; expires_in: number };
    this.token = data.access_token;
    this.tokenExpiresAt = Date.now() / 1000 + data.expires_in;
  }

  /** Reset token cache (useful for tests). */
  resetTokenCache(): void {
    this.token = null;
    this.tokenExpiresAt = 0;
  }

  // ── Core request with retry ───────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string | number>,
  ): Promise<T> {
    const resolvedPath = this.tenantPath(path);
    const url = new URL(`${this.apiUrl}/${resolvedPath}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, String(v));
      }
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const delayMs = Math.min(1000 * 2 ** (attempt - 1), 60_000) + Math.random() * 500;
        await sleep(delayMs);
      }

      try {
        await this.ensureToken();

        const resp = await fetch(url.toString(), {
          method,
          headers: {
            Authorization: `Bearer ${this.token}`,
            "ST-App-Key": this.appKey,
            ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (resp.ok) {
          if (resp.status === 204) return undefined as T;
          return (await resp.json()) as T;
        }

        if (RETRYABLE_STATUS_CODES.has(resp.status)) {
          lastError = new ServiceTitanError(
            `${method} ${resolvedPath} returned ${resp.status}`,
            resp.status,
          );
          continue;
        }

        // Non-retryable error — throw immediately
        const errorBody = await resp.text().catch(() => "");
        throw new ServiceTitanError(
          `${method} ${resolvedPath} failed: ${resp.status} ${resp.statusText} — ${errorBody}`,
          resp.status,
        );
      } catch (err) {
        if (err instanceof ServiceTitanError && !RETRYABLE_STATUS_CODES.has(err.statusCode)) {
          throw err;
        }
        lastError = err instanceof Error ? err : new Error(String(err));
        // Network errors and retryable status codes continue the loop
      }
    }

    throw lastError ?? new Error("Request failed after retries");
  }
}

export class ServiceTitanError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "ServiceTitanError";
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

function env(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
