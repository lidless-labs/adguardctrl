import { Type } from "@sinclair/typebox";
import type { SyncClientFactory } from "./_util.ts";
import { jsonToolResult } from "./_util.ts";
import { assertDestructive } from "../gates.ts";

const Schema = Type.Object({
  confirm: Type.Boolean({ description: "Must be true. Tier-3 destructive gate." }),
  destructive: Type.Boolean({ description: "Must be true. Tier-3 destructive gate. Clears AdGuardHome Sync logs." }),
}, { additionalProperties: false });

const NAME = "adguard_sync_clear_logs";

export function createAdguardSyncClearLogsTool(getSyncClient: SyncClientFactory) {
  return {
    name: NAME,
    label: "adguard sync: clear logs",
    description: "Clear AdGuardHome Sync in-memory logs via POST /api/v1/clear-logs. Tier-3 destructive; requires confirm:true and destructive:true.",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      assertDestructive(raw, NAME);
      const client = getSyncClient();
      await client.post("/api/v1/clear-logs");
      return jsonToolResult({ cleared: true });
    },
  };
}
