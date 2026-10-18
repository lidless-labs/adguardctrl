const start = process.argv.includes("--http")
  ? import("./src/http.ts").then(({ startHttpServer }) => startHttpServer())
  : import("./mcp-server.ts").then(({ startServer }) => startServer());

start.catch((error: unknown) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`adguard-mcp fatal: ${msg}`);
  process.exit(1);
});
