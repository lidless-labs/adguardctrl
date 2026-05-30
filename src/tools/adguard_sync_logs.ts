import { Type } from "@sinclair/typebox";
import type { SyncClientFactory } from "./_util.ts";
import { jsonToolResult } from "./_util.ts";

const Schema = Type.Object({}, { additionalProperties: false });

export function createAdguardSyncLogsTool(getSyncClient: SyncClientFactory) {
  return {
    name: "adguard_sync_logs",
    label: "adguard sync: logs",
    description: "Read AdGuardHome Sync in-memory logs via GET /api/v1/logs.",
    parameters: Schema,
    execute: async (_id: string, _raw: Record<string, unknown>) => {
      const client = getSyncClient();
      const logs = await client.get<string>("/api/v1/logs");
      return jsonToolResult({ logs });
    },
  };
}
