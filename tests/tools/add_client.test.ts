// content-guard: allow private-ipv4 file
import { describe, it, expect, afterEach } from "vitest";
import { startFakeAdGuard, FakeAdGuard } from "../fake-adguard.ts";
import { AdGuardClient } from "../../src/adguard-client.ts";
import { createAdguardAddClientTool } from "../../src/tools/adguard_add_client.ts";
import { WriteGateError } from "../../src/gates.ts";

let fake: FakeAdGuard | null = null;
afterEach(async () => { if (fake) await fake.close(); fake = null; });

describe("adguard_add_client", () => {
  it("refuses without confirm: true", async () => {
    const tool = createAdguardAddClientTool(() => new AdGuardClient({ url: "http://x", username: "u", password: "p" }));
    await expect(tool.execute("id", { name: "laptop", ids: ["192.168.1.5"] })).rejects.toThrow(WriteGateError);
  });

  it("posts to /control/clients/add with full client body and strips instance + confirm", async () => {
    fake = await startFakeAdGuard([
      { method: "POST", path: "/control/clients/add", status: 200, body: {} },
    ]);
    const tool = createAdguardAddClientTool(() => new AdGuardClient({ url: fake!.baseUrl, username: "u", password: "p" }));
    const r = await tool.execute("id", {
      confirm: true,
      name: "laptop",
      ids: ["192.168.1.5", "aa:bb:cc:dd:ee:ff"],
      use_global_settings: false,
      filtering_enabled: true,
      tags: ["device_laptop"],
    });
    const payload = JSON.parse(r.content[0].text);
    expect(payload.added).toBe(true);
    expect(payload.name).toBe("laptop");
    const req = fake.requests.find((q) => q.method === "POST")!;
    expect(req.path).toBe("/control/clients/add");
    expect(JSON.parse(req.body)).toEqual({
      name: "laptop",
      ids: ["192.168.1.5", "aa:bb:cc:dd:ee:ff"],
      use_global_settings: false,
      filtering_enabled: true,
      tags: ["device_laptop"],
    });
  });

  it("never forwards gate fields (confirm, destructive, instance) to AGH", async () => {
    fake = await startFakeAdGuard([
      { method: "POST", path: "/control/clients/add", status: 200, body: {} },
    ]);
    const tool = createAdguardAddClientTool(() => new AdGuardClient({ url: fake!.baseUrl, username: "u", password: "p" }));
    await tool.execute("id", {
      name: "phone",
      ids: ["192.168.1.42"],
      confirm: true,
      destructive: true,
      instance: "primary",
    } as Record<string, unknown>);
    const req = fake.requests.find((q) => q.method === "POST")!;
    const body = JSON.parse(req.body);
    expect(body).not.toHaveProperty("confirm");
    expect(body).not.toHaveProperty("destructive");
    expect(body).not.toHaveProperty("instance");
    expect(body).toEqual({ name: "phone", ids: ["192.168.1.42"] });
  });
});
