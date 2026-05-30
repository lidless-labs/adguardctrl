import { Buffer } from "node:buffer";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { resolveInstances, resolveSyncConfig, getInstanceConfig, getSyncConfig, type ResolvedConfig } from "./src/config.ts";
import { AdGuardClient } from "./src/adguard-client.ts";
import { AdGuardSyncClient } from "./src/adguard-sync-client.ts";
import { registerSecret, redact } from "./src/security.ts";
import { buildAllTools } from "./src/tools/index.ts";

const cfg: ResolvedConfig = resolveInstances(process.env);
for (const inst of Object.values(cfg.instances)) {
  registerSecret(inst.password);
  const basicValue = "Basic " + Buffer.from(`${inst.username}:${inst.password}`).toString("base64");
  registerSecret(basicValue);
}
const syncCfg = resolveSyncConfig(process.env);
if (syncCfg?.password) {
  registerSecret(syncCfg.password);
  if (syncCfg.username) {
    const basicValue = "Basic " + Buffer.from(`${syncCfg.username}:${syncCfg.password}`).toString("base64");
    registerSecret(basicValue);
  }
}

const getClient = (name?: string) => new AdGuardClient(getInstanceConfig(cfg, name));
const getSyncClient = () => new AdGuardSyncClient(getSyncConfig(syncCfg));

export const tools = buildAllTools(getClient, getSyncClient);

const toolMap = new Map(tools.map((t) => [t.name, t]));

const server = new Server({ name: "adguard-mcp", version: "0.3.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.parameters })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const t = toolMap.get(req.params.name);
  if (!t) {
    return { content: [{ type: "text", text: JSON.stringify({ error: `unknown tool: ${req.params.name}` }) }], isError: true };
  }
  try {
    return await t.execute(req.params.name, (req.params.arguments ?? {}) as Record<string, unknown>);
  } catch (e) {
    const msg = redact((e as Error).message) as string;
    return { content: [{ type: "text", text: JSON.stringify({ error: msg }) }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
