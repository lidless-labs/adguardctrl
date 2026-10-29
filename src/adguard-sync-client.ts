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
import { DEFAULT_REQUEST_TIMEOUT_MS } from "./config.ts";

export interface AdGuardSyncClientOptions {
  retryDelayMs?: number;
  timeoutMs?: number;
  /** Maximum decoded response bytes. Defaults to the kit's 10 MiB cap. */
  maxResponseBytes?: number;
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
  private timeoutMs: number;
  private maxResponseBytes: number | undefined;
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
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.maxResponseBytes = opts.maxResponseBytes;
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
            timeoutMs: this.timeoutMs,
            maxResponseBytes: this.maxResponseBytes,
            redirect: "error",
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
        // A failed response does not prove a mutation was not applied upstream.
        shouldRetry: (error) =>
          ["GET", "HEAD", "OPTIONS"].includes(method) && (
            error._tag === "TransportError" ||
            error._tag === "TimeoutError" ||
            (error._tag === "UnexpectedStatusError" && error.status >= 500)
          ),
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
  switch (error._tag) {
    case "TransportError": return new AdGuardSyncUnreachableError(redact(errorMessage(error.cause)) as string);
    case "TimeoutError": return new AdGuardSyncUnreachableError("The operation was aborted.");
    case "ResponseTooLargeError": return new AdGuardSyncUnreachableError("Response exceeded the byte limit.");
    case "ConfigError": return new AdGuardSyncUnreachableError(error.key === "redirect"
      ? "HTTP redirects are disabled." : "Invalid HTTP request configuration.");
    case "ParseError": return new AdGuardSyncUnreachableError("Invalid upstream response.");
    case "AuthError":
    case "ForbiddenError":
    case "NotFoundError": return new AdGuardSyncUnreachableError(`HTTP ${error.status}`);
    default: {
      const exhaustive: never = error;
      return exhaustive;
    }
  }
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

/** Convert headers for existing consumers without reading the body or replacing the kit's abort signal. */
async function fetchWithPlainHeaders(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> {
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
