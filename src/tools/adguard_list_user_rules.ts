import { Type } from "@sinclair/typebox";
import type { ClientFactory } from "./_util.ts";
import { InstanceArg, jsonToolResult } from "./_util.ts";

const Schema = Type.Object({ instance: InstanceArg }, { additionalProperties: false });

export function createAdguardListUserRulesTool(getClient: ClientFactory) {
  return {
    name: "adguard_list_user_rules",
    label: "adguard: list user rules",
    description: "List the custom user-rules block (lines like '@@||t.co^' or '||badsite.com^') via GET /control/filtering/status, returning just the rules array.",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const args = raw as { instance?: string };
      const client = getClient(args.instance);
      const status = await client.get<{ user_rules: string[] }>("/control/filtering/status");
      return jsonToolResult({ rules: status.user_rules ?? [] });
    },
  };
}
