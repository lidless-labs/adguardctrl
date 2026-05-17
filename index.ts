// NOTE: openclaw/plugin-sdk/plugin-entry's AnyAgentTool expects
// AgentToolResult<unknown> (with a `details` field), but our tool factories
// return MCP-shaped { content: [{ type: "text", text }] } results so the same
// tool objects can be served over the MCP stdio transport in mcp-server.ts.
// The runtime registration is duck-typed and works fine; we cast through
// `unknown` to bridge the intentional structural mismatch.
import { Buffer } from "node:buffer";
import { definePluginEntry, type AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";
import { resolveInstances, getInstanceConfig, type ResolvedConfig } from "./src/config.ts";
import { AdGuardClient } from "./src/adguard-client.ts";
import { registerSecret, redact } from "./src/security.ts";
import * as tools from "./src/tools/index.ts";

interface ToolLike {
  name: string;
  execute: (id: string, args: Record<string, unknown>) => Promise<unknown>;
  [key: string]: unknown;
}

export function withRedactedErrors<T extends ToolLike>(tool: T): T {
  const orig = tool.execute.bind(tool);
  return {
    ...tool,
    execute: async (id: string, args: Record<string, unknown>) => {
      try {
        return await orig(id, args);
      } catch (e) {
        const msg = redact((e as Error).message) as string;
        return { content: [{ type: "text", text: JSON.stringify({ error: msg }) }], isError: true };
      }
    },
  };
}

function makeFactory(cfg: ResolvedConfig) {
  for (const inst of Object.values(cfg.instances)) {
    registerSecret(inst.password);
    const basicValue = "Basic " + Buffer.from(`${inst.username}:${inst.password}`).toString("base64");
    registerSecret(basicValue);
  }
  return (name?: string) => {
    const ic = getInstanceConfig(cfg, name);
    return new AdGuardClient(ic);
  };
}

export default definePluginEntry({
  id: "adguard",
  name: "AdGuard",
  description: "AdGuard Home control: status/stats/query log + user-rule and filter-list management + per-client service blocks. Multi-instance via env. Three-tier write gating.",
  register(api) {
    if (api.registrationMode !== "full") return;
    const cfg = resolveInstances(process.env);
    const getClient = makeFactory(cfg);
    const register = (t: ToolLike) => api.registerTool(withRedactedErrors(t) as unknown as AnyAgentTool);
    register(tools.createAdguardStatusTool(getClient));
    register(tools.createAdguardStatsTool(getClient));
    register(tools.createAdguardQueryLogTool(getClient));
    register(tools.createAdguardListFilterListsTool(getClient));
    register(tools.createAdguardListUserRulesTool(getClient));
    register(tools.createAdguardListClientsTool(getClient));
    register(tools.createAdguardListBlockedServicesCatalogTool(getClient));
    register(tools.createAdguardAddUserRuleTool(getClient));
    register(tools.createAdguardRemoveUserRuleTool(getClient));
    register(tools.createAdguardAddFilterListTool(getClient));
    register(tools.createAdguardRemoveFilterListTool(getClient));
    register(tools.createAdguardToggleFilterListTool(getClient));
    register(tools.createAdguardSetClientBlockedServicesTool(getClient));
    register(tools.createAdguardReplaceUserRulesTool(getClient));
    register(tools.createAdguardToggleProtectionTool(getClient));
  },
});
