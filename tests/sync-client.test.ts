import { describe, it, expect, afterEach } from "vitest";
import { startFakeAdGuard, FakeAdGuard } from "./fake-adguard.ts";
import { AdGuardSyncClient, AdGuardSyncClientError, AdGuardSyncUnreachableError } from "../src/adguard-sync-client.ts";

let fake: FakeAdGuard | null = null;

afterEach(async () => {
  if (fake) await fake.close();
  fake = null;
});

describe("AdGuardSyncClient", () => {
  it("sends HTTP basic auth when configured", async () => {
    fake = await startFakeAdGuard([
      { method: "GET", path: "/api/v1/status", status: 200, body: { syncRunning: false, origin: {}, replicas: [] } },
    ]);
    const c = new AdGuardSyncClient({ url: fake.baseUrl, username: "sync", password: "hunter2" });
    await c.get("/api/v1/status");
    expect(fake.requests[0].authHeader).toBe("Basic " + Buffer.from("sync:hunter2").toString("base64"));
  });

  it("does not send auth when sync API is unauthenticated", async () => {
    fake = await startFakeAdGuard([
      { method: "HEAD", path: "/healthz", status: 200, body: "" },
    ]);
    const c = new AdGuardSyncClient({ url: fake.baseUrl });
    await expect(c.head("/healthz")).resolves.toEqual({ ok: true });
    expect(fake.requests[0].authHeader).toBeNull();
  });

  it("throws AdGuardSyncClientError on 4xx", async () => {
    fake = await startFakeAdGuard([
      { method: "GET", path: "/api/v1/status", status: 401, body: { message: "unauthorized" } },
    ]);
    const c = new AdGuardSyncClient({ url: fake.baseUrl });
    await expect(c.get("/api/v1/status")).rejects.toThrow(AdGuardSyncClientError);
  });

  it("retries once on 5xx then throws AdGuardSyncUnreachableError", async () => {
    fake = await startFakeAdGuard([
      { method: "GET", path: "/api/v1/status", status: 502, body: { message: "bad gateway" } },
    ]);
    const c = new AdGuardSyncClient({ url: fake.baseUrl }, { retryDelayMs: 5 });
    await expect(c.get("/api/v1/status")).rejects.toThrow(AdGuardSyncUnreachableError);
    expect(fake.requests).toHaveLength(2);
  });
});
