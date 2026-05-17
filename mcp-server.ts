import { Buffer } from "node:buffer";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { resolveInstances, getInstanceConfig, type ResolvedConfig } from "./src/config.ts";
import { AdGuardClient } from "./src/adguard-client.ts";
import { registerSecret, redact } from "./src/security.ts";
import * as toolFactories from "./src/tools/index.ts";

const cfg: ResolvedConfig = resolveInstances(process.env);
for (const inst of Object.values(cfg.instances)) {
  registerSecret(inst.password);
  const basicValue = "Basic " + Buffer.from(`${inst.username}:${inst.password}`).toString("base64");
  registerSecret(basicValue);
}

const getClient = (name?: string) => new AdGuardClient(getInstanceConfig(cfg, name));

const tools = [
  toolFactories.createAdguardStatusTool(getClient),
  toolFactories.createAdguardStatsTool(getClient),
  toolFactories.createAdguardQueryLogTool(getClient),
  toolFactories.createAdguardListFilterListsTool(getClient),
  toolFactories.createAdguardListUserRulesTool(getClient),
  toolFactories.createAdguardListClientsTool(getClient),
  toolFactories.createAdguardListBlockedServicesCatalogTool(getClient),
  toolFactories.createAdguardAddUserRuleTool(getClient),
  toolFactories.createAdguardRemoveUserRuleTool(getClient),
  toolFactories.createAdguardAddFilterListTool(getClient),
  toolFactories.createAdguardRemoveFilterListTool(getClient),
  toolFactories.createAdguardToggleFilterListTool(getClient),
  toolFactories.createAdguardSetClientBlockedServicesTool(getClient),
  toolFactories.createAdguardReplaceUserRulesTool(getClient),
  toolFactories.createAdguardToggleProtectionTool(getClient),
];

const toolMap = new Map(tools.map((t) => [t.name, t]));

const server = new Server({ name: "adguard-mcp", version: "0.1.0" }, { capabilities: { tools: {} } });

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
