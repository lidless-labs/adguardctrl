import { describe, it, expect, afterEach } from "vitest";
import { startFakeAdGuard, FakeAdGuard } from "./fake-adguard.ts";
import { AdGuardClient } from "../src/adguard-client.ts";
import { AdGuardSyncClient } from "../src/adguard-sync-client.ts";
import * as toolFactories from "../src/tools/index.ts";
import { buildAllTools } from "../src/tools/index.ts";

let fake: FakeAdGuard | null = null;
afterEach(async () => { if (fake) await fake.close(); fake = null; });

describe("integration", () => {
  // Pulls from the same canonical registration array used by both the MCP stdio
  // entry (mcp-server.ts) and the OpenClaw plugin entry (index.ts). If a new tool
  // is added to src/tools/index.ts but not to buildAllTools, this test breaks.
  it("buildAllTools registers all 33 production tools with unique names", () => {
    const dummy = () => new AdGuardClient({ url: "http://x", username: "u", password: "p" });
    const syncDummy = () => new AdGuardSyncClient({ url: "http://sync" });
    const created = buildAllTools(dummy, syncDummy);
    expect(created).toHaveLength(33);
    const names = created.map((t) => t.name);
    expect(new Set(names).size).toBe(33);
    for (const n of names) expect(n).toMatch(/^adguard_/);
  });

  it("end-to-end: status read + user rule add via the fake server", async () => {
    fake = await startFakeAdGuard([
      { method: "GET", path: "/control/status", status: 200, body: { version: "v0.107.50", protection_enabled: true } },
      { method: "GET", path: "/control/filtering/status", status: 200, body: { user_rules: [] } },
      { method: "POST", path: "/control/filtering/set_rules", status: 200, body: {} },
    ]);
    const mkClient = () => new AdGuardClient({ url: fake!.baseUrl, username: "u", password: "p" });
    const status = toolFactories.createAdguardStatusTool(mkClient);
    const addRule = toolFactories.createAdguardAddUserRuleTool(mkClient);

    const sr = await status.execute("id", {});
    expect(JSON.parse(sr.content[0].text).version).toBe("v0.107.50");

    const ar = await addRule.execute("id", { rule: "@@||t.co^", confirm: true });
    const payload = JSON.parse(ar.content[0].text);
    expect(payload.added).toBe("@@||t.co^");
  });
});
