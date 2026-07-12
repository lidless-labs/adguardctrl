import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Buffer } from "node:buffer";
import { fail, operatorErrorMessage } from "@lidless-labs/effect-operator-kit";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { resolveInstances, resolveSyncConfig, getInstanceConfig, getSyncConfig, type ResolvedConfig } from "./src/config.ts";
import { AdGuardClient } from "./src/adguard-client.ts";
import { AdGuardSyncClient } from "./src/adguard-sync-client.ts";
import { registerSecret, redact } from "./src/security.ts";
import { buildAllTools } from "./src/tools/index.ts";

/** Kit fail() shape with compact JSON (not kit's 2-space pretty-print) and repo redact. */
function mcpToolError(message: string) {
  const failed = fail(message);
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    isError: failed.isError,
  };
}

/**
 * Build the stdio MCP server and connect it. Extracted from the former
 * module-top-level setup so a guarded bin (mcp-bin.ts) and the back-compat
 * direct-run of this file share one code path. Behavior is identical to the
 * prior top-level setup: same secret registration, same tool registration,
 * same draft-07 `$schema` strip on tools/list, same stdio transport.
 */
export async function startServer(): Promise<void> {
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

  const transport = new StdioServerTransport();
  // Strip the draft-07 `$schema` the MCP SDK stamps on tool schemas; Anthropic
  // rejects it ("must match JSON Schema draft 2020-12") when the full tool set
  // is sent, e.g. on subagent spawns. Intercept tools/list output here.
  const __send = transport.send.bind(transport);
  (transport as any).send = (message: any) => {
    const listed = message?.result?.tools;
    if (Array.isArray(listed)) {
      for (const t of listed) {
        if (t?.inputSchema) delete t.inputSchema.$schema;
        if (t?.outputSchema) delete t.outputSchema.$schema;
      }
    }
    return __send(message);
  };
  await server.connect(transport);
}

// True when this module is the process entrypoint. process.argv[1] is often a
// symlink (npm installs the bin as a link); resolve it before comparing so the
// back-compat direct-run of mcp-server.js still starts the server.
const isEntrypoint = (() => {
  const arg = process.argv[1];
  if (typeof arg !== "string") return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(arg)).href;
  } catch {
    return false;
  }
})();

if (isEntrypoint) {
  startServer().catch((error: unknown) => {
    console.error(`adguard-mcp fatal: ${operatorErrorMessage(error)}`);
    process.exit(1);
  });
}
