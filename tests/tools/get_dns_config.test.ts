// content-guard: allow private-ipv4 file
import { describe, it, expect, afterEach } from "vitest";
import { startFakeAdGuard, FakeAdGuard } from "../fake-adguard.ts";
import { AdGuardClient } from "../../src/adguard-client.ts";
import { createAdguardGetDnsConfigTool } from "../../src/tools/adguard_get_dns_config.ts";

let fake: FakeAdGuard | null = null;
afterEach(async () => { if (fake) await fake.close(); fake = null; });

describe("adguard_get_dns_config", () => {
  it("returns DNS config including upstreams + cache settings", async () => {
    const payload = { upstream_dns: ["1.1.1.1", "8.8.8.8"], bootstrap_dns: ["9.9.9.9"], cache_size: 4194304, blocking_mode: "default", default_local_ptr_upstreams: ["192.168.1.1"] };
    fake = await startFakeAdGuard([
      { method: "GET", path: "/control/dns_info", status: 200, body: payload },
    ]);
    const tool = createAdguardGetDnsConfigTool(() => new AdGuardClient({ url: fake!.baseUrl, username: "u", password: "p" }));
    const r = await tool.execute("id", {});
    const result = JSON.parse(r.content[0].text);
    expect(result.upstream_dns).toEqual(["1.1.1.1", "8.8.8.8"]);
    expect(result.cache_size).toBe(4194304);
  });
});
