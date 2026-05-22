// content-guard: allow private-ipv4 file
import { describe, it, expect, afterEach } from "vitest";
import { startFakeAdGuard, FakeAdGuard } from "../fake-adguard.ts";
import { AdGuardClient } from "../../src/adguard-client.ts";
import { createAdguardUpdateClientTool } from "../../src/tools/adguard_update_client.ts";
import { WriteGateError } from "../../src/gates.ts";

let fake: FakeAdGuard | null = null;
afterEach(async () => { if (fake) await fake.close(); fake = null; });

describe("adguard_update_client", () => {
  it("refuses without confirm: true", async () => {
    const tool = createAdguardUpdateClientTool(() => new AdGuardClient({ url: "http://x", username: "u", password: "p" }));
    await expect(tool.execute("id", { name: "laptop", data: { name: "laptop", ids: ["192.168.1.5"] } })).rejects.toThrow(WriteGateError);
  });

  it("posts to /control/clients/update with NESTED {name, data} body", async () => {
    fake = await startFakeAdGuard([
      { method: "POST", path: "/control/clients/update", status: 200, body: {} },
    ]);
    const tool = createAdguardUpdateClientTool(() => new AdGuardClient({ url: fake!.baseUrl, username: "u", password: "p" }));
    const r = await tool.execute("id", {
      confirm: true,
      name: "laptop",
      data: { name: "laptop-renamed", ids: ["192.168.1.5", "192.168.1.6"], filtering_enabled: false },
    });
    const payload = JSON.parse(r.content[0].text);
    expect(payload.updated).toBe(true);
    expect(payload.name).toBe("laptop");
    const req = fake.requests.find((q) => q.method === "POST")!;
    expect(req.path).toBe("/control/clients/update");
    expect(JSON.parse(req.body)).toEqual({
      name: "laptop",
      data: { name: "laptop-renamed", ids: ["192.168.1.5", "192.168.1.6"], filtering_enabled: false },
    });
  });
});
