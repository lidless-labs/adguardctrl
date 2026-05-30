import { describe, it, expect, afterEach } from "vitest";
import { startFakeAdGuard, FakeAdGuard } from "./fake-adguard.ts";
import { AdGuardClient, AdGuardClientError, AdGuardUnreachableError } from "../src/adguard-client.ts";

let fake: FakeAdGuard | null = null;

afterEach(async () => {
  if (fake) await fake.close();
  fake = null;
});

describe("AdGuardClient", () => {
  it("sends HTTP basic auth with configured creds", async () => {
    fake = await startFakeAdGuard([
      { method: "GET", path: "/control/status", status: 200, body: { version: "v0.107.50", protection_enabled: true } },
    ]);
    const c = new AdGuardClient({ url: fake.baseUrl, username: "admin", password: "hunter2" });
    const r = await c.get("/control/status");
    expect(r).toEqual({ version: "v0.107.50", protection_enabled: true });
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0].authHeader).toBe("Basic " + Buffer.from("admin:hunter2").toString("base64"));
  });

  it("throws AdGuardClientError on 4xx", async () => {
    fake = await startFakeAdGuard([
      { method: "GET", path: "/control/status", status: 401, body: { message: "unauthorized" } },
    ]);
    const c = new AdGuardClient({ url: fake.baseUrl, username: "x", password: "y" });
    await expect(c.get("/control/status")).rejects.toThrow(AdGuardClientError);
  });

  it("retries once on 5xx then throws AdGuardUnreachableError", async () => {
    fake = await startFakeAdGuard([
      { method: "GET", path: "/control/status", status: 502, body: { message: "bad gateway" } },
    ]);
    const c = new AdGuardClient({ url: fake.baseUrl, username: "x", password: "y" }, { retryDelayMs: 5 });
    await expect(c.get("/control/status")).rejects.toThrow(AdGuardUnreachableError);
    expect(fake.requests).toHaveLength(2);
  });

  it("posts JSON body", async () => {
    fake = await startFakeAdGuard([
      { method: "POST", path: "/control/filtering/set_rules", status: 200, body: {} },
    ]);
    const c = new AdGuardClient({ url: fake.baseUrl, username: "u", password: "p" });
    await c.post("/control/filtering/set_rules", { rules: ["||example.com^"] });
    expect(fake.requests[0].method).toBe("POST");
    expect(JSON.parse(fake.requests[0].body)).toEqual({ rules: ["||example.com^"] });
  });

  it("treats successful non-JSON responses as success without retrying", async () => {
    fake = await startFakeAdGuard([
      { method: "POST", path: "/control/querylog_clear", status: 200, body: "OK" },
    ]);
    const c = new AdGuardClient({ url: fake.baseUrl, username: "u", password: "p" }, { retryDelayMs: 5 });
    await expect(c.post("/control/querylog_clear", undefined)).resolves.toBe("OK");
    expect(fake.requests).toHaveLength(1);
  });

  it("emits PUT with JSON body", async () => {
    fake = await startFakeAdGuard([
      { method: "PUT", path: "/control/blocked_services/update", status: 200, body: {} },
    ]);
    const client = new AdGuardClient({ url: fake.baseUrl, username: "u", password: "p" });
    await client.put("/control/blocked_services/update", { ids: ["youtube"], schedule: null });
    const req = fake.requests.find((q) => q.method === "PUT")!;
    expect(req.method).toBe("PUT");
    expect(JSON.parse(req.body)).toEqual({ ids: ["youtube"], schedule: null });
  });

  it("does not include the basic-auth header in thrown error messages", async () => {
    fake = await startFakeAdGuard([
      { method: "GET", path: "/control/status", status: 401, body: { message: "unauthorized" } },
    ]);
    const c = new AdGuardClient({ url: fake.baseUrl, username: "admin", password: "super-secret" });
    try {
      await c.get("/control/status");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).not.toContain("super-secret");
      expect(msg).not.toContain("admin:super-secret");
    }
  });
});
