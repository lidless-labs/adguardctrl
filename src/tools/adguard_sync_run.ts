import { Type } from "@sinclair/typebox";
import type { SyncClientFactory } from "./_util.ts";
import { jsonToolResult } from "./_util.ts";
import { assertConfirmedWrite } from "../gates.ts";

const Schema = Type.Object({
  confirm: Type.Boolean({ description: "Must be true. Tier-2 safe-write gate. Starts a sync from origin to replicas." }),
}, { additionalProperties: false });

const NAME = "adguard_sync_run";

export function createAdguardSyncRunTool(getSyncClient: SyncClientFactory) {
  return {
    name: NAME,
    label: "adguard sync: run",
    description: "Trigger AdGuardHome Sync immediately via POST /api/v1/sync. Tier-2 write; requires confirm:true.",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      assertConfirmedWrite(raw, NAME);
      const client = getSyncClient();
      await client.post("/api/v1/sync");
      return jsonToolResult({ started: true });
    },
  };
}
