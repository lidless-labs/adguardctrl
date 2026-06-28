import { startServer } from "./mcp-server.ts";

startServer().catch((error: unknown) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`adguard-mcp fatal: ${msg}`);
  process.exit(1);
});
