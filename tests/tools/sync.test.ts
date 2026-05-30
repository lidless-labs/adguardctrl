import { describe, it, expect, afterEach } from "vitest";
import { startFakeAdGuard, FakeAdGuard } from "../fake-adguard.ts";
import { AdGuardSyncClient } from "../../src/adguard-sync-client.ts";
import {
  createAdguardSyncClearLogsTool,
  createAdguardSyncHealthTool,
  createAdguardSyncLogsTool,
  createAdguardSyncRunTool,
  createAdguardSyncStatusTool,
} from "../../src/tools/index.ts";
import { WriteGateError } from "../../src/gates.ts";

let fake: FakeAdGuard | null = null;
afterEach(async () => { if (fake) await fake.close(); fake = null; });
const mk = (f: FakeAdGuard) => () => new AdGuardSyncClient({ url: f.baseUrl, username: "sync", password: "p" });

describe("adguard sync tools", () => {
  it("reads /api/v1/status", async () => {
    fake = await startFakeAdGuard([
      {
        method: "GET",
        path: "/api/v1/status",
        status: 200,
        body: {
          syncRunning: false,
          origin: { host: "primary", url: "http://primary", status: "success", protection_enabled: true },
          replicas: [{ host: "secondary", url: "http://secondary", status: "success", protection_enabled: true }],
        },
      },
    ]);
    const tool = createAdguardSyncStatusTool(mk(fake));
    const r = await tool.execute("id", {});
    const payload = JSON.parse(r.content[0].text);
    expect(payload.syncRunning).toBe(false);
    expect(fake.requests[0].path).toBe("/api/v1/status");
  });

  it("checks /healthz with HEAD", async () => {
    fake = await startFakeAdGuard([{ method: "HEAD", path: "/healthz", status: 200, body: "" }]);
    const tool = createAdguardSyncHealthTool(mk(fake));
    const r = await tool.execute("id", {});
    expect(JSON.parse(r.content[0].text)).toEqual({ ok: true });
    expect(fake.requests[0].method).toBe("HEAD");
  });

  it("reads /api/v1/logs as text", async () => {
    fake = await startFakeAdGuard([{ method: "GET", path: "/api/v1/logs", status: 200, body: "sync complete\n" }]);
    const tool = createAdguardSyncLogsTool(mk(fake));
    const r = await tool.execute("id", {});
    expect(JSON.parse(r.content[0].text)).toEqual({ logs: "sync complete\n" });
  });

  it("refuses to run sync without confirm and posts when confirmed", async () => {
    const blocked = createAdguardSyncRunTool(() => new AdGuardSyncClient({ url: "http://x" }));
    await expect(blocked.execute("id", {})).rejects.toThrow(WriteGateError);

    fake = await startFakeAdGuard([{ method: "POST", path: "/api/v1/sync", status: 200, body: "" }]);
    const tool = createAdguardSyncRunTool(mk(fake));
    const r = await tool.execute("id", { confirm: true });
    expect(JSON.parse(r.content[0].text)).toEqual({ started: true });
    expect(fake.requests[0].path).toBe("/api/v1/sync");
  });

  it("refuses to clear logs without destructive gate and posts when fully confirmed", async () => {
    const blocked = createAdguardSyncClearLogsTool(() => new AdGuardSyncClient({ url: "http://x" }));
    await expect(blocked.execute("id", { confirm: true })).rejects.toThrow(WriteGateError);
    await expect(blocked.execute("id", { destructive: true })).rejects.toThrow(WriteGateError);

    fake = await startFakeAdGuard([{ method: "POST", path: "/api/v1/clear-logs", status: 200, body: "" }]);
    const tool = createAdguardSyncClearLogsTool(mk(fake));
    const r = await tool.execute("id", { confirm: true, destructive: true });
    expect(JSON.parse(r.content[0].text)).toEqual({ cleared: true });
    expect(fake.requests[0].path).toBe("/api/v1/clear-logs");
  });
});
