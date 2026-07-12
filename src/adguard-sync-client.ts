import { Effect } from "effect";
import {
  exponentialRetry,
  sendRequest,
  UnexpectedStatusError,
  withRetry,
  type AuthStrategy,
  type HttpMethod,
  type OperatorError,
} from "@lidless-labs/effect-operator-kit";
import { redact } from "./security.ts";
import { registerSecret } from "./security.ts";

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
  private baseUrl: URL;
  private auth: AuthStrategy | undefined;

  constructor(private cfg: SyncClientConfig, opts: AdGuardSyncClientOptions = {}) {
    if (cfg.username && cfg.password) {
      this.authHeader = "Basic " + Buffer.from(`${cfg.username}:${cfg.password}`).toString("base64");
      registerSecret(cfg.password);
      registerSecret(this.authHeader);
      this.auth = {
        apply: (headers) => {
          headers.set("authorization", this.authHeader!);
          return Effect.succeed(headers);
        },
      };
    }
    this.retryDelayMs = opts.retryDelayMs ?? 1000;
    this.baseUrl = baseUrlForConcat(cfg.url);
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
    const reqPath = pathForConcat(path);
    const httpEffect = (() => {
      try {
        return sendRequest<string>(
          {
            baseUrl: this.baseUrl,
            auth: this.auth,
            timeoutMs: 2_147_483_647,
            fetch: fetchWithPlainHeaders,
            redact: identityRedact,
          },
          {
            method: method as HttpMethod,
            path: reqPath,
            body,
            responseType: method === "HEAD" ? "none" : "text",
            expectedStatuses: successStatuses,
            statusMapper: ({ status, method, path, bodyText, expectedStatuses }) =>
              new UnexpectedStatusError({ status, method, path, body: bodyText, expected: expectedStatuses }),
          },
        );
      } catch (error) {
        throw new AdGuardSyncUnreachableError(errorMessage(error));
      }
    })();
    const effect = withRetry(
      httpEffect,
      exponentialRetry({
        maxAttempts: 2,
        initialDelayMs: this.retryDelayMs,
        maxDelayMs: this.retryDelayMs,
        jitter: false,
        shouldRetry: (error) =>
          error._tag === "TransportError" ||
          error._tag === "TimeoutError" ||
          (error._tag === "UnexpectedStatusError" && error.status >= 500),
      }),
    ).pipe(
      Effect.map((res) => (method === "HEAD" ? undefined as T : parseSuccessBody<T>(res.bodyText))),
      Effect.mapError((error) => toSyncError(error)),
    );

    return Effect.runPromise(Effect.either(effect)).then((result) => {
      if (result._tag === "Right") return result.right;
      throw result.left;
    });
  }
}

const successStatuses = Array.from({ length: 100 }, (_, i) => 200 + i);

function toSyncError(error: OperatorError): AdGuardSyncClientError | AdGuardSyncUnreachableError {
  if (error._tag === "UnexpectedStatusError") {
    if (error.status >= 500) return new AdGuardSyncUnreachableError(`HTTP ${error.status}`);
    return new AdGuardSyncClientError(error.status, extractErrorMessage(error.body));
  }
  if (error._tag === "TransportError") {
    return new AdGuardSyncUnreachableError(errorMessage(error.cause));
  }
  if (error._tag === "TimeoutError") return new AdGuardSyncUnreachableError("The operation was aborted.");
  if (error._tag === "ParseError") return new AdGuardSyncUnreachableError(error.message);
  return new AdGuardSyncUnreachableError(String(error));
}

function extractErrorMessage(text: string): string {
  let msg = text;
  try { msg = (JSON.parse(text) as { message?: string }).message ?? text; } catch {}
  return redact(msg) as string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function identityRedact(value: string): string {
  return value;
}

function baseUrlForConcat(raw: string): URL {
  return new URL(raw.replace(/\/+$/, "") + "/");
}

function pathForConcat(path: string): string {
  return path.replace(/^\/+/, "");
}

function fetchWithPlainHeaders(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> {
  const headers = init?.headers instanceof Headers ? Object.fromEntries(init.headers.entries()) : init?.headers;
  return fetch(input.toString(), { ...init, headers });
}

function parseSuccessBody<T>(text: string): T {
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}
