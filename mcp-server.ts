import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { operatorErrorMessage } from "@lidless-labs/effect-operator-kit";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./src/server.ts";

export async function startServer(): Promise<void> {
  const server = createMcpServer();
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
  const start = process.argv.includes("--http")
    ? import("./src/http.ts").then(({ startHttpServer }) => startHttpServer())
    : startServer();
  start.catch((error: unknown) => {
    console.error(`adguard-mcp fatal: ${operatorErrorMessage(error)}`);
    process.exit(1);
  });
}
