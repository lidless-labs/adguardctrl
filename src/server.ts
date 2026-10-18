import { Buffer } from "node:buffer";
import { fail, operatorErrorMessage } from "@lidless-labs/effect-operator-kit";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { resolveInstances, resolveSyncConfig, getInstanceConfig, getSyncConfig, resolveRequestTimeoutMs, type ResolvedConfig } from "./config.ts";
import { AdGuardClient } from "./adguard-client.ts";
import { AdGuardSyncClient } from "./adguard-sync-client.ts";
import { registerSecret, redact } from "./security.ts";
import { buildAllTools } from "./tools/index.ts";

/** Kit fail() shape with compact JSON (not kit's 2-space pretty-print) and repo redact. */
function mcpToolError(message: string) {
  const failed = fail(message);
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    isError: failed.isError,
  };
}

/** Each MCP connection owns its server, tool objects, and request handlers. */
export function createMcpServer(env: NodeJS.ProcessEnv = process.env): Server {
  const cfg: ResolvedConfig = resolveInstances(env);
  for (const inst of Object.values(cfg.instances)) {
    registerSecret(inst.password);
    const basicValue = "Basic " + Buffer.from(`${inst.username}:${inst.password}`).toString("base64");
    registerSecret(basicValue);
  }
  const syncCfg = resolveSyncConfig(env);
  if (syncCfg?.password) {
    registerSecret(syncCfg.password);
    if (syncCfg.username) {
      const basicValue = "Basic " + Buffer.from(`${syncCfg.username}:${syncCfg.password}`).toString("base64");
      registerSecret(basicValue);
    }
  }

  const timeoutMs = resolveRequestTimeoutMs(env);
  const getClient = (name?: string) => new AdGuardClient(getInstanceConfig(cfg, name), { timeoutMs });
  const getSyncClient = () => new AdGuardSyncClient(getSyncConfig(syncCfg), { timeoutMs });

  const tools = buildAllTools(getClient, getSyncClient);
  const toolMap = new Map(tools.map((t) => [t.name, t]));

  const server = new Server({ name: "adguard-mcp", version: "0.3.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.parameters })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const t = toolMap.get(req.params.name);
    if (!t) {
      return mcpToolError(`unknown tool: ${req.params.name}`);
    }
    try {
      return await t.execute(req.params.name, (req.params.arguments ?? {}) as Record<string, unknown>);
    } catch (e) {
      return mcpToolError(redact(operatorErrorMessage(e)) as string);
    }
  });

  return server;
}
