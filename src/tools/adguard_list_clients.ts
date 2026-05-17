import { Type } from "@sinclair/typebox";
import type { ClientFactory } from "./_util.ts";
import { InstanceArg, jsonToolResult } from "./_util.ts";

const Schema = Type.Object({ instance: InstanceArg }, { additionalProperties: false });

export function createAdguardListClientsTool(getClient: ClientFactory) {
  return {
    name: "adguard_list_clients",
    label: "adguard: list clients",
    description: "List configured clients with their per-client blocked services and tags via GET /control/clients.",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const args = raw as { instance?: string };
      const client = getClient(args.instance);
      const out = await client.get("/control/clients");
      return jsonToolResult(out);
    },
  };
}
