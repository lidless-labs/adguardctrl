// content-guard: allow private-ipv4 file
import { describe, it, expect, afterEach } from "vitest";
import { startFakeAdGuard, FakeAdGuard } from "../fake-adguard.ts";
import { AdGuardClient } from "../../src/adguard-client.ts";
import { createAdguardListClientsTool } from "../../src/tools/adguard_list_clients.ts";

let fake: FakeAdGuard | null = null;
afterEach(async () => { if (fake) await fake.close(); fake = null; });

describe("adguard_list_clients", () => {
  it("returns the clients payload", async () => {
    fake = await startFakeAdGuard([
      { method: "GET", path: "/control/clients", status: 200,
        body: { clients: [{ name: "family-laptop", ids: ["192.168.1.55"], blocked_services: ["youtube"] }] } },
    ]);
    const tool = createAdguardListClientsTool(() => new AdGuardClient({ url: fake!.baseUrl, username: "u", password: "p" }));
    const r = await tool.execute("id", {});
    const payload = JSON.parse(r.content[0].text);
    expect(payload.clients).toHaveLength(1);
  });
});
