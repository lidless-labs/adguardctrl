// NOTE: openclaw/plugin-sdk/plugin-entry's AnyAgentTool expects
// AgentToolResult<unknown> (with a `details` field), but our tool factories
// return MCP-shaped { content: [{ type: "text", text }] } results so the same
// tool objects can be served over the MCP stdio transport in mcp-server.ts.
// The runtime registration is duck-typed and works fine; we cast through
// `unknown` to bridge the intentional structural mismatch.
import { definePluginEntry, type AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";
import { resolveInstances, getInstanceConfig, type ResolvedConfig } from "./src/config.ts";
import { AdGuardClient } from "./src/adguard-client.ts";
import { registerSecret } from "./src/security.ts";
import * as tools from "./src/tools/index.ts";

function makeFactory(cfg: ResolvedConfig) {
  for (const inst of Object.values(cfg.instances)) registerSecret(inst.password);
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
    api.registerTool(tools.createAdguardStatusTool(getClient) as unknown as AnyAgentTool);
    api.registerTool(tools.createAdguardStatsTool(getClient) as unknown as AnyAgentTool);
    api.registerTool(tools.createAdguardQueryLogTool(getClient) as unknown as AnyAgentTool);
    api.registerTool(tools.createAdguardListFilterListsTool(getClient) as unknown as AnyAgentTool);
    api.registerTool(tools.createAdguardListUserRulesTool(getClient) as unknown as AnyAgentTool);
    api.registerTool(tools.createAdguardListClientsTool(getClient) as unknown as AnyAgentTool);
    api.registerTool(tools.createAdguardListBlockedServicesCatalogTool(getClient) as unknown as AnyAgentTool);
    api.registerTool(tools.createAdguardAddUserRuleTool(getClient) as unknown as AnyAgentTool);
    api.registerTool(tools.createAdguardRemoveUserRuleTool(getClient) as unknown as AnyAgentTool);
    api.registerTool(tools.createAdguardAddFilterListTool(getClient) as unknown as AnyAgentTool);
    api.registerTool(tools.createAdguardRemoveFilterListTool(getClient) as unknown as AnyAgentTool);
    api.registerTool(tools.createAdguardToggleFilterListTool(getClient) as unknown as AnyAgentTool);
    api.registerTool(tools.createAdguardSetClientBlockedServicesTool(getClient) as unknown as AnyAgentTool);
    api.registerTool(tools.createAdguardReplaceUserRulesTool(getClient) as unknown as AnyAgentTool);
    api.registerTool(tools.createAdguardToggleProtectionTool(getClient) as unknown as AnyAgentTool);
  },
});
