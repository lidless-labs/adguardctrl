import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { assertToolAnnotations, type ToolAnnotations } from "@lidless-labs/effect-operator-kit";
import { AdGuardClient } from "../src/adguard-client.ts";
import { AdGuardSyncClient } from "../src/adguard-sync-client.ts";
import { createMcpServer } from "../src/server.ts";
import { TOOL_TIERS } from "../src/tools/annotations.ts";
import { jsonToolResult } from "../src/tools/_util.ts";
import { buildAllTools } from "../src/tools/index.ts";

const dummy = () => new AdGuardClient({ url: "http://x", username: "u", password: "p" });
const syncDummy = () => new AdGuardSyncClient({ url: "http://sync" });

describe("tool annotations", () => {
  const tools = buildAllTools(dummy, syncDummy);

  it("declares explicit hints on every tool and passes the kit audit", () => {
    const byName = new Map<string, ToolAnnotations | undefined>(tools.map((t) => [t.name, t.annotations]));
    assertToolAnnotations(byName);
  });

  it("marks exactly the Tier-1 reads read-only and everything else destructive", () => {
    for (const tool of tools) {
      const isRead = TOOL_TIERS[tool.name] === "read";
      expect(tool.annotations.readOnlyHint, tool.name).toBe(isRead);
      expect(tool.annotations.destructiveHint, tool.name).toBe(!isRead);
    }
    expect(tools.filter((t) => t.annotations.readOnlyHint)).toHaveLength(22);
  });

  it("serves the annotations over tools/list", async () => {
    const server = createMcpServer({ ADGUARD_PRIMARY_URL: "http://adguard.invalid", ADGUARD_PRIMARY_USERNAME: "u", ADGUARD_PRIMARY_PASSWORD: "p" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "annotations-test", version: "0.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const listed = (await client.listTools()).tools;
      expect(listed).toHaveLength(50);
      const status = listed.find((t) => t.name === "adguard_status");
      const clear = listed.find((t) => t.name === "adguard_clear_query_log");
      expect(status?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
      expect(clear?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    } finally {
      await client.close();
      await server.close();
    }
  });
});

describe("jsonToolResult byte cap", () => {
  it("returns a small payload unchanged and content-only", () => {
    expect(jsonToolResult({ a: 1 })).toEqual({ content: [{ type: "text", text: JSON.stringify({ a: 1 }, null, 2) }] });
  });

  it("truncates an oversize payload with the kit marker and a structured flag", () => {
    const result = jsonToolResult({ rows: "é".repeat(80_000) });
    const text = result.content[0].text;
    expect(Buffer.byteLength(JSON.stringify(result), "utf8")).toBeLessThanOrEqual(90_000);
    expect(text).toContain("[truncated: output was");
    expect(result.structuredContent).toMatchObject({ truncated: true, maxBytes: 90_000 });
    expect(result).not.toHaveProperty("details");
  });
});
