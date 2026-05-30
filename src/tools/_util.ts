import { Type } from "@sinclair/typebox";
import type { AdGuardClient } from "../adguard-client.ts";
import type { AdGuardSyncClient } from "../adguard-sync-client.ts";
import type { ResolvedConfig } from "../config.ts";
import { getInstanceConfig } from "../config.ts";

export const InstanceArg = Type.Optional(Type.String({
  description: "Named instance to target (e.g. 'primary', 'secondary'). Default: the configured default instance.",
}));

export type ClientFactory = (instance?: string) => AdGuardClient;
export type SyncClientFactory = () => AdGuardSyncClient;

export function jsonToolResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}

export function makeClientFactory(cfg: ResolvedConfig, build: (ic: ReturnType<typeof getInstanceConfig>) => AdGuardClient): ClientFactory {
  return (instance) => build(getInstanceConfig(cfg, instance));
}

export function hhmmToMs(value: string | number): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`schedule time must be HH:MM or milliseconds, got: ${String(value)}`);
    return value;
  }
  if (typeof value !== "string") {
    throw new Error(`schedule time must be HH:MM string or milliseconds number, got: ${typeof value}`);
  }
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) throw new Error(`schedule time must be HH:MM or milliseconds, got: ${value}`);
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (mm > 59) throw new Error(`invalid HH:MM (minutes > 59): ${value}`);
  if (h > 24 || (h === 24 && mm > 0)) throw new Error(`invalid HH:MM (max 24:00): ${value}`);
  return (h * 60 + mm) * 60 * 1000;
}
