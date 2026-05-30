export interface AdGuardSyncClientOptions {
  retryDelayMs?: number;
}

export interface SyncClientConfig {
  url: string;
  username?: string;
  password?: string;
}

export class AdGuardSyncClientError extends Error {
  constructor(public status: number, message: string) {
    super(`AdGuardHome Sync ${status}: ${message}`);
    this.name = "AdGuardSyncClientError";
  }
}

export class AdGuardSyncUnreachableError extends Error {
  constructor(cause: string) {
    super(`AdGuardHome Sync unreachable: ${cause}`);
    this.name = "AdGuardSyncUnreachableError";
  }
}

export class AdGuardSyncClient {
  private authHeader: string | undefined;
  private retryDelayMs: number;

  constructor(private cfg: SyncClientConfig, opts: AdGuardSyncClientOptions = {}) {
    if (cfg.username && cfg.password) {
      this.authHeader = "Basic " + Buffer.from(`${cfg.username}:${cfg.password}`).toString("base64");
    }
    this.retryDelayMs = opts.retryDelayMs ?? 1000;
  }

  async get<T = unknown>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  async head(path: string): Promise<{ ok: boolean }> {
    await this.request<void>("HEAD", path);
    return { ok: true };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = this.cfg.url.replace(/\/+$/, "") + path;
    const headers: Record<string, string> = {};
    if (this.authHeader) headers.authorization = this.authHeader;
    let bodyStr: string | undefined;
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      bodyStr = JSON.stringify(body);
    }
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, { method, headers, body: bodyStr });
        if (res.status >= 200 && res.status < 300) {
          if (method === "HEAD") return undefined as T;
          const text = await res.text();
          return parseSuccessBody<T>(text);
        }
        if (res.status >= 500) {
          lastErr = new AdGuardSyncUnreachableError(`HTTP ${res.status}`);
          if (attempt === 0) await sleep(this.retryDelayMs);
          continue;
        }
        const errText = await res.text();
        let msg = errText;
        try { msg = (JSON.parse(errText) as { message?: string }).message ?? errText; } catch {}
        throw new AdGuardSyncClientError(res.status, msg);
      } catch (e) {
        if (e instanceof AdGuardSyncClientError) throw e;
        lastErr = new AdGuardSyncUnreachableError((e as Error).message);
        if (attempt === 0) await sleep(this.retryDelayMs);
      }
    }
    throw lastErr ?? new AdGuardSyncUnreachableError("unknown");
  }
}

function parseSuccessBody<T>(text: string): T {
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
