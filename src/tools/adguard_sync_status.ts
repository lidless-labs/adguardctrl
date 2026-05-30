import { Type } from "@sinclair/typebox";
import type { SyncClientFactory } from "./_util.ts";
import { jsonToolResult } from "./_util.ts";

const Schema = Type.Object({}, { additionalProperties: false });

export function createAdguardSyncStatusTool(getSyncClient: SyncClientFactory) {
  return {
    name: "adguard_sync_status",
    label: "adguard sync: status",
    description: "Get AdGuardHome Sync origin/replica status via GET /api/v1/status.",
    parameters: Schema,
    execute: async (_id: string, _raw: Record<string, unknown>) => {
      const client = getSyncClient();
      const status = await client.get("/api/v1/status");
      return jsonToolResult(status);
    },
  };
}
