// content-guard: allow private-ipv4 file
import { describe, it, expect, afterEach } from "vitest";
import { startFakeAdGuard, FakeAdGuard } from "../fake-adguard.ts";
import { AdGuardClient } from "../../src/adguard-client.ts";
import { WriteGateError } from "../../src/gates.ts";
import { createAdguardGetAccessListTool } from "../../src/tools/adguard_get_access_list.ts";
import { createAdguardSetAccessListTool } from "../../src/tools/adguard_set_access_list.ts";
import { createAdguardGetQuerylogConfigTool } from "../../src/tools/adguard_get_querylog_config.ts";
import { createAdguardUpdateQuerylogConfigTool } from "../../src/tools/adguard_update_querylog_config.ts";
import { createAdguardGetStatsConfigTool } from "../../src/tools/adguard_get_stats_config.ts";
import { createAdguardUpdateStatsConfigTool } from "../../src/tools/adguard_update_stats_config.ts";
import { createAdguardDhcpStatusTool } from "../../src/tools/adguard_dhcp_status.ts";
import { createAdguardDhcpInterfacesTool } from "../../src/tools/adguard_dhcp_interfaces.ts";
import { createAdguardTlsStatusTool } from "../../src/tools/adguard_tls_status.ts";
import { createAdguardValidateTlsConfigTool } from "../../src/tools/adguard_validate_tls_config.ts";
import { createAdguardTestUpstreamDnsTool } from "../../src/tools/adguard_test_upstream_dns.ts";

let fake: FakeAdGuard | null = null;
afterEach(async () => { if (fake) await fake.close(); fake = null; });
const getClient = (f: FakeAdGuard) => () => new AdGuardClient({ url: f.baseUrl, username: "u", password: "p" });

describe("access list tools", () => {
  it("gets and sets access lists", async () => {
    fake = await startFakeAdGuard([
      { method: "GET", path: "/control/access/list", status: 200, body: { allowed_clients: [], disallowed_clients: ["192.0.2.10"], blocked_hosts: ["bad.example"] } },
      { method: "POST", path: "/control/access/set", status: 200, body: {} },
    ]);
    const get = createAdguardGetAccessListTool(getClient(fake));
    const set = createAdguardSetAccessListTool(getClient(fake));
    const current = await get.execute("id", {});
    expect(JSON.parse(current.content[0].text).blocked_hosts).toEqual(["bad.example"]);
    await expect(set.execute("id", { allowed_clients: [], disallowed_clients: [], blocked_hosts: [] })).rejects.toThrow(WriteGateError);
    await set.execute("id", { allowed_clients: [], disallowed_clients: ["192.0.2.10"], blocked_hosts: ["bad.example"], confirm: true });
    expect(JSON.parse(fake.requests[1].body)).toEqual({ allowed_clients: [], disallowed_clients: ["192.0.2.10"], blocked_hosts: ["bad.example"] });
  });
});

describe("query log and stats config tools", () => {
  it("gets and updates query log config", async () => {
    fake = await startFakeAdGuard([
      { method: "GET", path: "/control/querylog/config", status: 200, body: { enabled: true, interval: 604800000 } },
      { method: "PUT", path: "/control/querylog/config/update", status: 200, body: {} },
    ]);
    const get = createAdguardGetQuerylogConfigTool(getClient(fake));
    const update = createAdguardUpdateQuerylogConfigTool(getClient(fake));
    expect(JSON.parse((await get.execute("id", {})).content[0].text).interval).toBe(604800000);
    await expect(update.execute("id", { config: { enabled: false } })).rejects.toThrow(WriteGateError);
    await update.execute("id", { config: { enabled: false, interval: 86400000 }, confirm: true });
    expect(JSON.parse(fake.requests[1].body)).toEqual({ enabled: false, interval: 86400000 });
  });

  it("gets and updates stats config", async () => {
    fake = await startFakeAdGuard([
      { method: "GET", path: "/control/stats/config", status: 200, body: { enabled: true, interval: 604800000 } },
      { method: "PUT", path: "/control/stats/config/update", status: 200, body: {} },
    ]);
    const get = createAdguardGetStatsConfigTool(getClient(fake));
    const update = createAdguardUpdateStatsConfigTool(getClient(fake));
    expect(JSON.parse((await get.execute("id", {})).content[0].text).enabled).toBe(true);
    await update.execute("id", { config: { enabled: true, interval: 2592000000 }, confirm: true });
    expect(JSON.parse(fake.requests[1].body)).toEqual({ enabled: true, interval: 2592000000 });
  });
});

describe("diagnostic tools", () => {
  it("gets DHCP status and interfaces", async () => {
    fake = await startFakeAdGuard([
      { method: "GET", path: "/control/dhcp/status", status: 200, body: { enabled: false, interface_name: "" } },
      { method: "GET", path: "/control/dhcp/interfaces", status: 200, body: { eth0: { name: "eth0", ipv4_addresses: ["192.0.2.5"] } } },
    ]);
    const status = createAdguardDhcpStatusTool(getClient(fake));
    const interfaces = createAdguardDhcpInterfacesTool(getClient(fake));
    expect(JSON.parse((await status.execute("id", {})).content[0].text).enabled).toBe(false);
    expect(JSON.parse((await interfaces.execute("id", {})).content[0].text).eth0.name).toBe("eth0");
  });

  it("gets and validates TLS config with private keys redacted from output", async () => {
    fake = await startFakeAdGuard([
      { method: "GET", path: "/control/tls/status", status: 200, body: { enabled: true, private_key: "secret-key", valid_cert: true } },
      { method: "POST", path: "/control/tls/validate", status: 200, body: { enabled: true, private_key: "secret-key", valid_pair: true } },
    ]);
    const status = createAdguardTlsStatusTool(getClient(fake));
    const validate = createAdguardValidateTlsConfigTool(getClient(fake));
    expect(JSON.parse((await status.execute("id", {})).content[0].text).private_key).toBe("[REDACTED]");
    await expect(validate.execute("id", { config: { enabled: true } })).rejects.toThrow(WriteGateError);
    const r = await validate.execute("id", { config: { enabled: true, private_key: "secret-key" }, confirm: true });
    expect(JSON.parse(fake.requests[1].body)).toEqual({ enabled: true, private_key: "secret-key" });
    expect(JSON.parse(r.content[0].text).private_key).toBe("[REDACTED]");
  });

  it("tests upstream DNS with the Tier-2 gate", async () => {
    const denied = createAdguardTestUpstreamDnsTool(() => new AdGuardClient({ url: "http://x", username: "u", password: "p" }));
    await expect(denied.execute("id", { bootstrap_dns: ["1.1.1.1"], upstream_dns: ["tls://1.1.1.1"] })).rejects.toThrow(WriteGateError);

    fake = await startFakeAdGuard([
      { method: "POST", path: "/control/test_upstream_dns", status: 200, body: { "tls://1.1.1.1": "OK" } },
    ]);
    const tool = createAdguardTestUpstreamDnsTool(getClient(fake));
    const r = await tool.execute("id", { bootstrap_dns: ["1.1.1.1"], upstream_dns: ["tls://1.1.1.1"], confirm: true });
    expect(JSON.parse(fake.requests[0].body)).toEqual({ bootstrap_dns: ["1.1.1.1"], upstream_dns: ["tls://1.1.1.1"] });
    expect(JSON.parse(r.content[0].text)["tls://1.1.1.1"]).toBe("OK");
  });
});
