import { createHash, timingSafeEqual } from "node:crypto";
import type { InstanceConfig, SyncConfig } from "./config.ts";

const SECRETS = new Set<string>();

export function registerSecret(s: string): void {
  if (!s || s.length === 0) return;
  SECRETS.add(s);
}

// Matches base64 tokens of at least 12 chars (covers anything realistically
// holding credential material). Allows trailing '=' padding.
const BASE64_TOKEN = /[A-Za-z0-9+/]{12,}={0,2}/g;

function maskBase64Tokens(input: string): string {
  return input.replace(BASE64_TOKEN, (match) => {
    let decoded: string;
    try {
      decoded = Buffer.from(match, "base64").toString("utf8");
    } catch {
      return match;
    }
    for (const secret of SECRETS) {
      if (decoded.includes(secret)) return "REDACTED";
    }
    return match;
  });
}

export function redact(value: unknown): unknown {
  if (typeof value === "string") {
    let out = value;
    for (const secret of SECRETS) out = out.split(secret).join("REDACTED");
    out = maskBase64Tokens(out);
    return out;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = redact(v);
    return out;
  }
  return value;
}

export function _resetForTests(): void {
  SECRETS.clear();
}

/** Hash first so comparison always operates on equal-length buffers. */
export function equalSecret(a: string, b: string): boolean {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

/** Keep upstream credential handling here, including Sync and URL userinfo. */
export function registerHttpToken(value: string | undefined, configs: (InstanceConfig | SyncConfig)[]): string {
  // Header values arrive trimmed, so compare against the trimmed secret.
  const token = (value ?? "").trim();
  if (!token) throw new Error("ADGUARD_MCP_HTTP_TOKEN is required and must not be blank");
  if (token.length < 32) throw new Error("ADGUARD_MCP_HTTP_TOKEN must be at least 32 characters (e.g. openssl rand -hex 32)");
  const credentials: string[] = [];
  for (const cfg of configs) {
    const url = new URL(cfg.url);
    for (const [username, password] of [
      [cfg.username ?? "", cfg.password ?? ""],
      [decodeURIComponent(url.username), decodeURIComponent(url.password)],
    ]) {
      credentials.push(username, password);
      if (username || password) {
        const pair = `${username}:${password}`;
        const encoded = Buffer.from(pair).toString("base64");
        credentials.push(pair, encoded, `Basic ${encoded}`);
      }
    }
  }
  if (credentials.some((credential) => credential && equalSecret(token, credential))) {
    throw new Error("ADGUARD_MCP_HTTP_TOKEN must differ from all AdGuard Home and Sync credentials");
  }
  registerSecret(token);
  return token;
}
