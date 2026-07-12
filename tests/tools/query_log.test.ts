// content-guard: allow private-ipv4 file
import { describe, it, expect, afterEach } from "vitest";
import { startFakeAdGuard, FakeAdGuard } from "../fake-adguard.ts";
import { AdGuardClient } from "../../src/adguard-client.ts";
import { createAdguardQueryLogTool } from "../../src/tools/adguard_query_log.ts";

let fake: FakeAdGuard | null = null;
afterEach(async () => { if (fake) await fake.close(); fake = null; });

describe("adguard_query_log", () => {
  it("passes filter params as query string", async () => {
    fake = await startFakeAdGuard([
      { method: "GET", path: "/control/querylog?limit=10&reason=FilteredBlackList&reason=FilteredSafeBrowsing&reason=FilteredParental&reason=FilteredInvalid&reason=FilteredSafeSearch&reason=FilteredBlockedService", status: 200, body: { data: [] } },
    ]);
    const tool = createAdguardQueryLogTool(() => new AdGuardClient({ url: fake!.baseUrl, username: "u", password: "p" }));
    await tool.execute("id", { limit: 10, blocked_only: true });
    expect(fake.requests[0].path).toBe("/control/querylog?limit=10&reason=FilteredBlackList&reason=FilteredSafeBrowsing&reason=FilteredParental&reason=FilteredInvalid&reason=FilteredSafeSearch&reason=FilteredBlockedService");
    expect(fake.requests[0].path).not.toContain("response_status=");
  });

  it("passes explicit reason filters instead of blocked_only defaults", async () => {
    fake = await startFakeAdGuard([
      { method: "GET", path: "/control/querylog?limit=5&reason=Rewrite&reason=RewriteRule", status: 200, body: { data: [] } },
    ]);
    const tool = createAdguardQueryLogTool(() => new AdGuardClient({ url: fake!.baseUrl, username: "u", password: "p" }));
    await tool.execute("id", { limit: 5, blocked_only: true, reasons: ["Rewrite", "RewriteRule"] });
    expect(fake.requests[0].path).toBe("/control/querylog?limit=5&reason=Rewrite&reason=RewriteRule");
  });

  it("combines client and domain into AGH's single search param (space-joined)", async () => {
    fake = await startFakeAdGuard([
      { method: "GET", path: "/control/querylog?limit=50&search=192.0.2.5+youtube.com", status: 200, body: { data: [] } },
    ]);
    const tool = createAdguardQueryLogTool(() => new AdGuardClient({ url: fake!.baseUrl, username: "u", password: "p" }));
    await tool.execute("id", { limit: 50, client: "192.0.2.5", domain: "youtube.com" });
    expect(fake.requests[0].path).toContain("search=192.0.2.5+youtube.com");
    expect(fake.requests[0].path).not.toContain("domain=youtube.com");
  });

  it("uses search for client-only filter", async () => {
    fake = await startFakeAdGuard([
      { method: "GET", path: "/control/querylog?limit=50&search=192.0.2.5", status: 200, body: { data: [] } },
    ]);
    const tool = createAdguardQueryLogTool(() => new AdGuardClient({ url: fake!.baseUrl, username: "u", password: "p" }));
    await tool.execute("id", { limit: 50, client: "192.0.2.5" });
    expect(fake.requests[0].path).toBe("/control/querylog?limit=50&search=192.0.2.5");
  });

  it("uses search for domain-only filter", async () => {
    fake = await startFakeAdGuard([
      { method: "GET", path: "/control/querylog?limit=50&search=youtube.com", status: 200, body: { data: [] } },
    ]);
    const tool = createAdguardQueryLogTool(() => new AdGuardClient({ url: fake!.baseUrl, username: "u", password: "p" }));
    await tool.execute("id", { limit: 50, domain: "youtube.com" });
    expect(fake.requests[0].path).toBe("/control/querylog?limit=50&search=youtube.com");
  });
});
