// NOTE: openclaw/plugin-sdk/plugin-entry's AnyAgentTool expects
// AgentToolResult<unknown> (with a `details` field), but our tool factories
// return MCP-shaped { content: [{ type: "text", text }] } results so the same
// tool objects can be served over the MCP stdio transport in mcp-server.ts.
// The runtime registration is duck-typed and works fine; we cast through
// `unknown` to bridge the intentional structural mismatch.
import { Buffer } from "node:buffer";
import { definePluginEntry, type AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";
import { resolveInstances, resolveSyncConfig, getInstanceConfig, getSyncConfig, type ResolvedConfig, type SyncConfig } from "./src/config.ts";
import { AdGuardClient } from "./src/adguard-client.ts";
import { AdGuardSyncClient } from "./src/adguard-sync-client.ts";
import { registerSecret, redact } from "./src/security.ts";
import { buildAllTools } from "./src/tools/index.ts";

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

function registerSyncSecrets(syncCfg: SyncConfig | undefined) {
  if (!syncCfg?.password) return;
  registerSecret(syncCfg.password);
  if (syncCfg.username) {
    const basicValue = "Basic " + Buffer.from(`${syncCfg.username}:${syncCfg.password}`).toString("base64");
    registerSecret(basicValue);
  }
}

function makeSyncFactory(syncCfg: SyncConfig | undefined) {
  registerSyncSecrets(syncCfg);
  return () => new AdGuardSyncClient(getSyncConfig(syncCfg));
}

export default definePluginEntry({
  id: "adguard",
  name: "AdGuard",
  description: "AdGuard Home control: status/stats/query log + user-rule and filter-list management + per-client service blocks. Multi-instance via env. Three-tier write gating.",
  register(api) {
    if (api.registrationMode !== "full") return;
    const cfg = resolveInstances(process.env);
    const syncCfg = resolveSyncConfig(process.env);
    const getClient = makeFactory(cfg);
    const getSyncClient = makeSyncFactory(syncCfg);
    const register = (t: ToolLike) => api.registerTool(withRedactedErrors(t) as unknown as AnyAgentTool);
    for (const t of buildAllTools(getClient, getSyncClient)) register(t as unknown as ToolLike);
  },
});
