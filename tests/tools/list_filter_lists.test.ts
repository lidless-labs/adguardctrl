import { describe, it, expect, afterEach } from "vitest";
import { startFakeAdGuard, FakeAdGuard } from "../fake-adguard.ts";
import { AdGuardClient } from "../../src/adguard-client.ts";
import { createAdguardListFilterListsTool } from "../../src/tools/adguard_list_filter_lists.ts";

let fake: FakeAdGuard | null = null;
afterEach(async () => { if (fake) await fake.close(); fake = null; });

describe("adguard_list_filter_lists", () => {
  it("returns the filtering status with subscribed lists", async () => {
    fake = await startFakeAdGuard([
      { method: "GET", path: "/control/filtering/status", status: 200,
        body: { filters: [{ url: "https://x", name: "X", enabled: true, rules_count: 100 }], user_rules: ["||a^"] } },
    ]);
    const tool = createAdguardListFilterListsTool(() => new AdGuardClient({ url: fake!.baseUrl, username: "u", password: "p" }));
    const r = await tool.execute("id", {});
    const payload = JSON.parse(r.content[0].text);
    expect(payload.filters).toHaveLength(1);
  });
});
