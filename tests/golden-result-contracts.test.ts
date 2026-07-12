import { describe, expect, it, vi } from "vitest";
import type { AdGuardClient } from "../src/adguard-client.ts";
import type { AdGuardSyncClient } from "../src/adguard-sync-client.ts";
import { createAdguardGetDnsConfigTool } from "../src/tools/adguard_get_dns_config.ts";
import { createAdguardListClientsTool } from "../src/tools/adguard_list_clients.ts";
import { createAdguardQueryLogTool } from "../src/tools/adguard_query_log.ts";
import { createAdguardStatsTool } from "../src/tools/adguard_stats.ts";
import { createAdguardStatusTool } from "../src/tools/adguard_status.ts";
import { createAdguardSyncHealthTool } from "../src/tools/adguard_sync_health.ts";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details?: unknown;
  isError?: unknown;
};

async function execute(
  tool: { execute: (toolCallId: string, rawParams: Record<string, unknown>) => Promise<unknown> },
  params: Record<string, unknown>,
): Promise<ToolResult> {
  return (await tool.execute("golden-call", params)) as ToolResult;
}

function expectJsonOnlyResult(result: ToolResult, expectedPayload: unknown): void {
  expect(result).toEqual({
    content: [{ type: "text", text: JSON.stringify(expectedPayload, null, 2) }],
  });
  expect(result).not.toHaveProperty("details");
  expect(result).not.toHaveProperty("isError");
}

describe("golden tool result shape contracts", () => {
  it("keeps representative successful tool results as content-only JSON without details or isError", async () => {
    const payloads = {
      status: {
        version: "v0.107.50",
        protection_enabled: true,
        dns_port: 53,
        running: true,
      },
      stats: {
        num_dns_queries: 100,
        num_blocked_filtering: 12,
        avg_processing_time: 0.0042,
      },
      queryLog: {
        data: [
          {
            time: "2026-07-12T12:00:00Z",
            client: "192.0.2.10",
            question: { name: "ads.example", type: "A" },
            reason: "FilteredBlackList",
          },
        ],
      },
      clients: {
        clients: [{ name: "family-laptop", ids: ["192.0.2.55"], blocked_services: ["youtube"] }],
        auto_clients: [],
      },
      dnsConfig: {
        upstream_dns: ["https://dns.example/dns-query"],
        bootstrap_dns: ["9.9.9.9"],
        cache_size: 4_194_304,
      },
      syncHealth: { ok: true },
    };
    const client = {
      get: vi.fn(async (path: string) => {
        switch (path) {
          case "/control/status":
            return payloads.status;
          case "/control/stats":
            return payloads.stats;
          case "/control/querylog?limit=1&reason=FilteredBlackList&search=192.0.2.10+ads.example":
            return payloads.queryLog;
          case "/control/clients":
            return payloads.clients;
          case "/control/dns_info":
            return payloads.dnsConfig;
          default:
            throw new Error(`unexpected path: ${path}`);
        }
      }),
    } as unknown as AdGuardClient;
    const syncClient = {
      head: vi.fn().mockResolvedValue(payloads.syncHealth),
    } as unknown as AdGuardSyncClient;

    const status = await execute(createAdguardStatusTool(() => client), {});
    expectJsonOnlyResult(status, payloads.status);

    const stats = await execute(createAdguardStatsTool(() => client), {});
    expectJsonOnlyResult(stats, payloads.stats);

    const queryLog = await execute(createAdguardQueryLogTool(() => client), {
      limit: 1,
      reasons: ["FilteredBlackList"],
      client: "192.0.2.10",
      domain: "ads.example",
    });
    expectJsonOnlyResult(queryLog, payloads.queryLog);

    const clients = await execute(createAdguardListClientsTool(() => client), {});
    expectJsonOnlyResult(clients, payloads.clients);

    const dnsConfig = await execute(createAdguardGetDnsConfigTool(() => client), {});
    expectJsonOnlyResult(dnsConfig, payloads.dnsConfig);

    const syncHealth = await execute(createAdguardSyncHealthTool(() => syncClient), {});
    expectJsonOnlyResult(syncHealth, payloads.syncHealth);
  });
});
