// content-guard: allow private-ipv4 file
import { describe, it, expect, afterEach } from "vitest";
import { startFakeAdGuard, FakeAdGuard } from "../fake-adguard.ts";
import { AdGuardClient } from "../../src/adguard-client.ts";
import { createAdguardCheckHostTool } from "../../src/tools/adguard_check_host.ts";

let fake: FakeAdGuard | null = null;
afterEach(async () => { if (fake) await fake.close(); fake = null; });

describe("adguard_check_host", () => {
  it("issues GET with query params and returns the filter decision", async () => {
    fake = await startFakeAdGuard([
      { method: "GET", path: "/control/filtering/check_host?name=youtube.com&client=192.168.1.5&qtype=A", status: 200, body: { reason: "FilteredBlackList", rules: [{ filter_list_id: 1, text: "||youtube.com^" }], service_name: "", cname: "", ip_addrs: [] } },
    ]);
    const tool = createAdguardCheckHostTool(() => new AdGuardClient({ url: fake!.baseUrl, username: "u", password: "p" }));
    const r = await tool.execute("id", { host: "youtube.com", qtype: "A", client: "192.168.1.5" });
    const payload = JSON.parse(r.content[0].text);
    expect(payload.reason).toBe("FilteredBlackList");
    const req = fake.requests[0];
    expect(req.path).toMatch(/^\/control\/filtering\/check_host\?/);
    expect(req.path).toContain("name=youtube.com");
    expect(req.path).toContain("client=192.168.1.5");
    expect(req.path).toContain("qtype=A");
  });

  it("omits client and qtype query params when not provided", async () => {
    fake = await startFakeAdGuard([
      { method: "GET", path: "/control/filtering/check_host?name=example.com", status: 200, body: { reason: "NotFilteredNotFound", rules: [], service_name: "", cname: "", ip_addrs: [] } },
    ]);
    const tool = createAdguardCheckHostTool(() => new AdGuardClient({ url: fake!.baseUrl, username: "u", password: "p" }));
    await tool.execute("id", { host: "example.com" });
    const req = fake.requests[0];
    expect(req.path).toContain("name=example.com");
    expect(req.path).not.toContain("client=");
    expect(req.path).not.toContain("qtype=");
  });
});
