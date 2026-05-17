import { Type } from "@sinclair/typebox";
import type { ClientFactory } from "./_util.ts";
import { InstanceArg, jsonToolResult } from "./_util.ts";

const Schema = Type.Object({ instance: InstanceArg }, { additionalProperties: false });

export function createAdguardListFilterListsTool(getClient: ClientFactory) {
  return {
    name: "adguard_list_filter_lists",
    label: "adguard: list filter lists",
    description: "List subscribed filter lists with enabled state and rule counts via GET /control/filtering/status.",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const args = raw as { instance?: string };
      const client = getClient(args.instance);
      const status = await client.get("/control/filtering/status");
      return jsonToolResult(status);
    },
  };
}
