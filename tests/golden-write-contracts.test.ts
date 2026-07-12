import { describe, expect, it, vi } from "vitest";
import type { AdGuardClient } from "../src/adguard-client.ts";
import type { AdGuardSyncClient } from "../src/adguard-sync-client.ts";
import { createAdguardAddUserRuleTool } from "../src/tools/adguard_add_user_rule.ts";
import { createAdguardClearQueryLogTool } from "../src/tools/adguard_clear_query_log.ts";
import { createAdguardReplaceUserRulesTool } from "../src/tools/adguard_replace_user_rules.ts";
import { createAdguardSyncClearLogsTool } from "../src/tools/adguard_sync_clear_logs.ts";
import { createAdguardSyncRunTool } from "../src/tools/adguard_sync_run.ts";
import { createAdguardToggleProtectionTool } from "../src/tools/adguard_toggle_protection.ts";

type Tool = {
  name: string;
  execute: (toolCallId: string, rawParams: Record<string, unknown>) => Promise<unknown>;
};

function fakeClient(): AdGuardClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  } as unknown as AdGuardClient;
}

function fakeSyncClient(): AdGuardSyncClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    head: vi.fn(),
  } as unknown as AdGuardSyncClient;
}

async function executeAsMcp(tool: Tool, rawParams: Record<string, unknown>) {
  try {
    return await tool.execute(tool.name, rawParams);
  } catch (error) {
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error: (error as Error).message }) }],
      isError: true,
    };
  }
}

function expectNoClientApiCalls(client: AdGuardClient): void {
  expect(client.get).not.toHaveBeenCalled();
  expect(client.post).not.toHaveBeenCalled();
  expect(client.put).not.toHaveBeenCalled();
}

function expectNoSyncClientApiCalls(client: AdGuardSyncClient): void {
  expect(client.get).not.toHaveBeenCalled();
  expect(client.post).not.toHaveBeenCalled();
  expect(client.head).not.toHaveBeenCalled();
}

describe("golden confirm and destructive gate refusal contracts", () => {
  it.each([
    {
      name: "adguard_add_user_rule",
      build: (client: AdGuardClient) => createAdguardAddUserRuleTool(() => client),
      params: { rule: "||ads.example^" },
      refusal: {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: 'adguard_add_user_rule is a write operation. Pass {"confirm": true} to proceed.',
            }),
          },
        ],
        isError: true,
      },
    },
    {
      name: "adguard_replace_user_rules",
      build: (client: AdGuardClient) => createAdguardReplaceUserRulesTool(() => client),
      params: { rules: ["@@||example.com^"] },
      refusal: {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: 'adguard_replace_user_rules is a destructive operation. Pass {"confirm": true, "destructive": true} to proceed.',
            }),
          },
        ],
        isError: true,
      },
    },
    {
      name: "adguard_toggle_protection",
      build: (client: AdGuardClient) => createAdguardToggleProtectionTool(() => client),
      params: { enabled: false, confirm: true },
      refusal: {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: 'adguard_toggle_protection is a destructive operation. Pass {"confirm": true, "destructive": true} to proceed.',
            }),
          },
        ],
        isError: true,
      },
    },
    {
      name: "adguard_clear_query_log",
      build: (client: AdGuardClient) => createAdguardClearQueryLogTool(() => client),
      params: { destructive: true },
      refusal: {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: 'adguard_clear_query_log is a destructive operation. Pass {"confirm": true, "destructive": true} to proceed.',
            }),
          },
        ],
        isError: true,
      },
    },
  ])("$name returns the current MCP refusal shape before any client call", async ({ build, params, refusal }) => {
    const client = fakeClient();
    const tool = build(client);

    await expect(executeAsMcp(tool, params)).resolves.toEqual(refusal);
    expectNoClientApiCalls(client);
  });

  it.each([
    {
      name: "adguard_sync_run",
      build: (client: AdGuardSyncClient) => createAdguardSyncRunTool(() => client),
      params: {},
      refusal: {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: 'adguard_sync_run is a write operation. Pass {"confirm": true} to proceed.',
            }),
          },
        ],
        isError: true,
      },
    },
    {
      name: "adguard_sync_clear_logs",
      build: (client: AdGuardSyncClient) => createAdguardSyncClearLogsTool(() => client),
      params: { confirm: true },
      refusal: {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: 'adguard_sync_clear_logs is a destructive operation. Pass {"confirm": true, "destructive": true} to proceed.',
            }),
          },
        ],
        isError: true,
      },
    },
  ])("$name returns the current MCP refusal shape before any sync client call", async ({ build, params, refusal }) => {
    const client = fakeSyncClient();
    const tool = build(client);

    await expect(executeAsMcp(tool, params)).resolves.toEqual(refusal);
    expectNoSyncClientApiCalls(client);
  });
});
