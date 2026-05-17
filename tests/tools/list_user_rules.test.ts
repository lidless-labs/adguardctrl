import { describe, it, expect, afterEach } from "vitest";
import { startFakeAdGuard, FakeAdGuard } from "../fake-adguard.ts";
import { AdGuardClient } from "../../src/adguard-client.ts";
import { createAdguardListUserRulesTool } from "../../src/tools/adguard_list_user_rules.ts";

let fake: FakeAdGuard | null = null;
afterEach(async () => { if (fake) await fake.close(); fake = null; });

describe("adguard_list_user_rules", () => {
  it("returns only the user_rules array", async () => {
    fake = await startFakeAdGuard([
      { method: "GET", path: "/control/filtering/status", status: 200,
        body: { filters: [], user_rules: ["@@||t.co^", "||badsite.com^"] } },
    ]);
    const tool = createAdguardListUserRulesTool(() => new AdGuardClient({ url: fake!.baseUrl, username: "u", password: "p" }));
    const r = await tool.execute("id", {});
    const payload = JSON.parse(r.content[0].text);
    expect(payload.rules).toEqual(["@@||t.co^", "||badsite.com^"]);
  });
});
