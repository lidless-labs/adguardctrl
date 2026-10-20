import { defineConfig } from "tsup";

export default defineConfig({
  entry: { "mcp-server": "mcp-server.ts", "mcp-bin": "mcp-bin.ts", "cli": "cli.ts", "index": "index.ts" },
  format: ["esm"],
  target: "node20",
  clean: true,
  dts: false,
  splitting: false,
  sourcemap: false,
  noExternal: ["@lidless-labs/effect-operator-kit"],
  external: [/^openclaw(\/|$)/],
  banner: { js: "#!/usr/bin/env node" },
});
