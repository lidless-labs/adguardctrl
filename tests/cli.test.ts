// content-guard: allow private-ipv4 file
import { describe, expect, it, vi } from "vitest";
import { UsageError, parseArgs, run, type CliDeps } from "../cli.ts";
import type { AdGuardClient } from "../src/adguard-client.ts";
import type { AdGuardSyncClient } from "../src/adguard-sync-client.ts";

function capture(
  client: Partial<AdGuardClient> = {},
  syncClient: Partial<AdGuardSyncClient> = {},
  startServer = vi.fn().mockResolvedValue(undefined),
) {
  const out: string[] = [];
  const err: string[] = [];
  const madeWith: Array<string | undefined> = [];
  const deps: CliDeps = {
    out: (s) => out.push(s),
    err: (s) => err.push(s),
    makeClient: (instance) => {
      madeWith.push(instance);
      return client as AdGuardClient;
    },
    makeSyncClient: () => syncClient as AdGuardSyncClient,
    startServer,
  };
  return { out, err, deps, startServer, madeWith };
}

describe("parseArgs", () => {
  it("routes simple instance-bearing reads with defaults", () => {
    expect(parseArgs(["status"])).toEqual({ kind: "status", json: false, instance: undefined });
    expect(parseArgs(["stats", "--json"])).toEqual({ kind: "stats", json: true, instance: undefined });
    expect(parseArgs(["dns-config"])).toEqual({ kind: "dns-config", json: false, instance: undefined });
    expect(parseArgs(["safesearch"])).toEqual({ kind: "safesearch", json: false, instance: undefined });
    expect(parseArgs(["access-list"])).toEqual({ kind: "access-list", json: false, instance: undefined });
    expect(parseArgs(["querylog-config"])).toEqual({ kind: "querylog-config", json: false, instance: undefined });
    expect(parseArgs(["stats-config"])).toEqual({ kind: "stats-config", json: false, instance: undefined });
  });

  it("honors the global --instance flag", () => {
    expect(parseArgs(["status", "--instance", "secondary"])).toEqual({
      kind: "status",
      json: false,
      instance: "secondary",
    });
    expect(parseArgs(["clients", "list", "--instance", "livingroom", "--json"])).toEqual({
      kind: "clients-list",
      json: true,
      instance: "livingroom",
    });
  });

  it("parses subcommand pairs", () => {
    expect(parseArgs(["clients", "list"])).toEqual({ kind: "clients-list", json: false, instance: undefined });
    expect(parseArgs(["rules", "list"])).toEqual({ kind: "rules-list", json: false, instance: undefined });
    expect(parseArgs(["filters", "list"])).toEqual({ kind: "filters-list", json: false, instance: undefined });
    expect(parseArgs(["blocked-services", "list"])).toEqual({ kind: "blocked-services-list", json: false, instance: undefined });
    expect(parseArgs(["blocked-services", "catalog"])).toEqual({ kind: "blocked-services-catalog", json: false, instance: undefined });
    expect(parseArgs(["rewrites", "list"])).toEqual({ kind: "rewrites-list", json: false, instance: undefined });
    expect(parseArgs(["rewrites", "settings"])).toEqual({ kind: "rewrites-settings", json: false, instance: undefined });
    expect(parseArgs(["dhcp", "status"])).toEqual({ kind: "dhcp-status", json: false, instance: undefined });
    expect(parseArgs(["dhcp", "interfaces"])).toEqual({ kind: "dhcp-interfaces", json: false, instance: undefined });
    expect(parseArgs(["tls", "status"])).toEqual({ kind: "tls-status", json: false, instance: undefined });
  });

  it("parses sync subcommands (no instance)", () => {
    expect(parseArgs(["sync", "status"])).toEqual({ kind: "sync-status", json: false });
    expect(parseArgs(["sync", "health", "--json"])).toEqual({ kind: "sync-health", json: true });
    expect(parseArgs(["sync", "logs"])).toEqual({ kind: "sync-logs", json: false });
  });

  it("parses querylog with filters", () => {
    expect(parseArgs(["querylog", "--limit", "5", "--client", "192.0.2.10", "--domain", "ads.example", "--blocked-only"])).toEqual({
      kind: "querylog",
      json: false,
      instance: undefined,
      limit: 5,
      client: "192.0.2.10",
      domain: "ads.example",
      blockedOnly: true,
    });
    expect(parseArgs(["querylog"])).toEqual({
      kind: "querylog",
      json: false,
      instance: undefined,
      limit: 50,
      client: undefined,
      domain: undefined,
      blockedOnly: false,
    });
  });

  it("parses check-host with its positional and options", () => {
    expect(parseArgs(["check-host", "youtube.com", "--client", "kid-tablet", "--qtype", "AAAA"])).toEqual({
      kind: "check-host",
      json: false,
      instance: undefined,
      host: "youtube.com",
      client: "kid-tablet",
      qtype: "AAAA",
    });
  });

  it("routes help, version, and mcp", () => {
    expect(parseArgs([])).toEqual({ kind: "help" });
    expect(parseArgs(["help"])).toEqual({ kind: "help" });
    expect(parseArgs(["--help"])).toEqual({ kind: "help" });
    expect(parseArgs(["-v"])).toEqual({ kind: "version" });
    expect(parseArgs(["mcp"])).toEqual({ kind: "mcp" });
  });

  it("rejects bad input with UsageError", () => {
    expect(() => parseArgs(["bogus"])).toThrow(UsageError);
    expect(() => parseArgs(["status", "extra"])).toThrow(UsageError);
    expect(() => parseArgs(["clients"])).toThrow(UsageError);
    expect(() => parseArgs(["clients", "delete"])).toThrow(UsageError);
    expect(() => parseArgs(["sync", "wipe"])).toThrow(UsageError);
    expect(() => parseArgs(["check-host"])).toThrow(UsageError);
    expect(() => parseArgs(["querylog", "--limit", "9999"])).toThrow(UsageError);
    expect(() => parseArgs(["status", "--instance"])).toThrow(UsageError);
  });
});

describe("run", () => {
  it("prints human status output and exits 0", async () => {
    const client = { get: vi.fn().mockResolvedValue({ protection_enabled: true, running: true, version: "v0.107.50" }) };
    const { out, deps, madeWith } = capture(client);
    expect(await run(["status", "--instance", "primary"], deps)).toBe(0);
    expect(client.get).toHaveBeenCalledWith("/control/status");
    expect(madeWith).toEqual(["primary"]);
    const text = out.join("\n");
    expect(text).toContain("protection_enabled: true");
    expect(text).toContain("v0.107.50");
  });

  it("emits raw JSON with --json", async () => {
    const payload = { protection_enabled: false, running: true };
    const client = { get: vi.fn().mockResolvedValue(payload) };
    const { out, deps } = capture(client);
    expect(await run(["status", "--json"], deps)).toBe(0);
    expect(JSON.parse(out.join("\n"))).toEqual(payload);
  });

  it("builds the querylog query string from filters", async () => {
    const client = { get: vi.fn().mockResolvedValue({ data: [] }) };
    const { deps } = capture(client);
    expect(await run(["querylog", "--limit", "3", "--client", "192.0.2.11", "--domain", "ads.example", "--blocked-only"], deps)).toBe(0);
    const url = client.get.mock.calls[0][0] as string;
    expect(url).toContain("/control/querylog?");
    expect(url).toContain("limit=3");
    expect(url).toContain("search=192.0.2.11+ads.example");
    expect(url).toContain("reason=FilteredBlackList");
  });

  it("reduces rules to the user_rules array", async () => {
    const client = { get: vi.fn().mockResolvedValue({ user_rules: ["||a.com^", "@@||b.com^"] }) };
    const { out, deps } = capture(client);
    expect(await run(["rules", "list", "--json"], deps)).toBe(0);
    expect(JSON.parse(out.join("\n"))).toEqual({ rules: ["||a.com^", "@@||b.com^"] });
    expect(client.get).toHaveBeenCalledWith("/control/filtering/status");
  });

  it("redacts the TLS private key", async () => {
    const client = { get: vi.fn().mockResolvedValue({ enabled: true, private_key: "SECRET-KEY-MATERIAL" }) };
    const { out, deps } = capture(client);
    expect(await run(["tls", "status", "--json"], deps)).toBe(0);
    const parsed = JSON.parse(out.join("\n"));
    expect(parsed.private_key).toBe("[REDACTED]");
    expect(out.join("\n")).not.toContain("SECRET-KEY-MATERIAL");
  });

  it("calls the sync client for sync commands", async () => {
    const syncClient = { get: vi.fn().mockResolvedValue({ origin: "ok", replicas: [] }) };
    const { deps } = capture({}, syncClient);
    expect(await run(["sync", "status"], deps)).toBe(0);
    expect(syncClient.get).toHaveBeenCalledWith("/api/v1/status");
  });

  it("returns exit 1 when sync health is not ok", async () => {
    const syncClient = { head: vi.fn().mockResolvedValue({ ok: false }) };
    const { out, deps } = capture({}, syncClient);
    expect(await run(["sync", "health"], deps)).toBe(1);
    expect(out.join("\n")).toContain("healthy: false");
  });

  it("returns exit 0 when sync health is ok", async () => {
    const syncClient = { head: vi.fn().mockResolvedValue({ ok: true }) };
    const { deps } = capture({}, syncClient);
    expect(await run(["sync", "health"], deps)).toBe(0);
  });

  it("returns exit 1 and prints the error on client failure", async () => {
    const client = { get: vi.fn().mockRejectedValue(new Error("AdGuard unreachable: connect ECONNREFUSED")) };
    const { err, deps } = capture(client);
    expect(await run(["stats"], deps)).toBe(1);
    expect(err.join("\n")).toContain("ECONNREFUSED");
  });

  it("returns exit 2 and prints help on usage error", async () => {
    const { err, deps } = capture();
    expect(await run(["bogus"], deps)).toBe(2);
    expect(err.join("\n")).toContain("Usage:");
  });

  it("prints version without constructing a client", async () => {
    const make = vi.fn();
    const deps: CliDeps = {
      out: () => {},
      err: () => {},
      makeClient: make,
      makeSyncClient: vi.fn(),
      startServer: vi.fn().mockResolvedValue(undefined),
    };
    expect(await run(["--version"], deps)).toBe(0);
    expect(make).not.toHaveBeenCalled();
  });

  it("delegates `mcp` to startServer()", async () => {
    const { deps, startServer } = capture();
    expect(await run(["mcp"], deps)).toBe(0);
    expect(startServer).toHaveBeenCalledOnce();
  });
});
