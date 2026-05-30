import { Type } from "@sinclair/typebox";
import type { SyncClientFactory } from "./_util.ts";
import { jsonToolResult } from "./_util.ts";

const Schema = Type.Object({}, { additionalProperties: false });

export function createAdguardSyncHealthTool(getSyncClient: SyncClientFactory) {
  return {
    name: "adguard_sync_health",
    label: "adguard sync: health",
    description: "Check AdGuardHome Sync health via HEAD /healthz. The endpoint is unauthenticated upstream and returns 2xx only when origin and replicas are healthy.",
    parameters: Schema,
    execute: async (_id: string, _raw: Record<string, unknown>) => {
      const client = getSyncClient();
      const health = await client.head("/healthz");
      return jsonToolResult(health);
    },
  };
}
