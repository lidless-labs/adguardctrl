// content-guard: allow private-ipv4 file
import { describe, it, expect, afterEach } from "vitest";
import { startFakeAdGuard, FakeAdGuard } from "../fake-adguard.ts";
import { AdGuardClient } from "../../src/adguard-client.ts";
import { WriteGateError } from "../../src/gates.ts";
import { createAdguardListRewritesTool } from "../../src/tools/adguard_list_rewrites.ts";
import { createAdguardAddRewriteTool } from "../../src/tools/adguard_add_rewrite.ts";
import { createAdguardUpdateRewriteTool } from "../../src/tools/adguard_update_rewrite.ts";
import { createAdguardDeleteRewriteTool } from "../../src/tools/adguard_delete_rewrite.ts";
import { createAdguardGetRewriteSettingsTool } from "../../src/tools/adguard_get_rewrite_settings.ts";
import { createAdguardToggleRewritesTool } from "../../src/tools/adguard_toggle_rewrites.ts";

let fake: FakeAdGuard | null = null;
afterEach(async () => { if (fake) await fake.close(); fake = null; });
const getClient = (f: FakeAdGuard) => () => new AdGuardClient({ url: f.baseUrl, username: "u", password: "p" });

describe("rewrite tools", () => {
  it("lists DNS rewrite rules", async () => {
    fake = await startFakeAdGuard([
      { method: "GET", path: "/control/rewrite/list", status: 200, body: [{ domain: "router.home.arpa", answer: "192.0.2.1", enabled: true }] },
    ]);
    const tool = createAdguardListRewritesTool(getClient(fake));
    const r = await tool.execute("id", {});
    expect(JSON.parse(r.content[0].text)[0].domain).toBe("router.home.arpa");
  });

  it("adds a rewrite with the Tier-2 gate", async () => {
    const denied = createAdguardAddRewriteTool(() => new AdGuardClient({ url: "http://x", username: "u", password: "p" }));
    await expect(denied.execute("id", { domain: "nas.home.arpa", answer: "192.0.2.20" })).rejects.toThrow(WriteGateError);

    fake = await startFakeAdGuard([{ method: "POST", path: "/control/rewrite/add", status: 200, body: {} }]);
    const tool = createAdguardAddRewriteTool(getClient(fake));
    await tool.execute("id", { domain: "nas.home.arpa", answer: "192.0.2.20", enabled: false, confirm: true });
    expect(JSON.parse(fake.requests[0].body)).toEqual({ domain: "nas.home.arpa", answer: "192.0.2.20", enabled: false });
  });

  it("updates a rewrite with nested target/update", async () => {
    fake = await startFakeAdGuard([{ method: "PUT", path: "/control/rewrite/update", status: 200, body: {} }]);
    const tool = createAdguardUpdateRewriteTool(getClient(fake));
    const target = { domain: "old.home.arpa", answer: "192.0.2.10" };
    const update = { domain: "new.home.arpa", answer: "192.0.2.11", enabled: true };
    await tool.execute("id", { target, update, confirm: true });
    expect(JSON.parse(fake.requests[0].body)).toEqual({ target, update });
  });

  it("deletes a rewrite", async () => {
    fake = await startFakeAdGuard([{ method: "POST", path: "/control/rewrite/delete", status: 200, body: {} }]);
    const tool = createAdguardDeleteRewriteTool(getClient(fake));
    await tool.execute("id", { domain: "old.home.arpa", answer: "192.0.2.10", confirm: true });
    expect(JSON.parse(fake.requests[0].body)).toEqual({ domain: "old.home.arpa", answer: "192.0.2.10" });
  });

  it("gets and toggles rewrite settings", async () => {
    fake = await startFakeAdGuard([
      { method: "GET", path: "/control/rewrite/settings", status: 200, body: { enabled: true } },
      { method: "PUT", path: "/control/rewrite/settings/update", status: 200, body: {} },
    ]);
    const get = createAdguardGetRewriteSettingsTool(getClient(fake));
    const toggle = createAdguardToggleRewritesTool(getClient(fake));
    const current = await get.execute("id", {});
    expect(JSON.parse(current.content[0].text)).toEqual({ enabled: true });
    await toggle.execute("id", { enabled: false, confirm: true });
    expect(JSON.parse(fake.requests[1].body)).toEqual({ enabled: false });
  });
});
