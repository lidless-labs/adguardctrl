// content-guard: allow private-ipv4 file
import { describe, it, expect } from "vitest";
import {
  resolveInstances,
  getInstanceConfig,
  UnknownInstanceError,
  NoInstancesError,
  PartialInstanceConfigError,
  UnknownDefaultInstanceError,
  resolveSyncConfig,
  getSyncConfig,
  NoSyncServerError,
  PartialSyncConfigError,
} from "../src/config.ts";

describe("resolveInstances", () => {
  it("parses a single primary instance", () => {
    const env = {
      ADGUARD_PRIMARY_URL: "http://192.168.1.10",
      ADGUARD_PRIMARY_USERNAME: "admin",
      ADGUARD_PRIMARY_PASSWORD: "secret",
    };
    const cfg = resolveInstances(env);
    expect(cfg.instances.primary).toEqual({
      url: "http://192.168.1.10",
      username: "admin",
      password: "secret",
    });
    expect(cfg.defaultInstance).toBe("primary");
  });

  it("parses multiple instances", () => {
    const env = {
      ADGUARD_PRIMARY_URL: "http://192.168.1.10",
      ADGUARD_PRIMARY_USERNAME: "u1",
      ADGUARD_PRIMARY_PASSWORD: "p1",
      ADGUARD_SECONDARY_URL: "http://192.168.1.11",
      ADGUARD_SECONDARY_USERNAME: "u2",
      ADGUARD_SECONDARY_PASSWORD: "p2",
    };
    const cfg = resolveInstances(env);
    expect(Object.keys(cfg.instances).sort()).toEqual(["primary", "secondary"]);
  });

  it("respects ADGUARD_DEFAULT_INSTANCE", () => {
    const env = {
      ADGUARD_PRIMARY_URL: "http://x",
      ADGUARD_PRIMARY_USERNAME: "u",
      ADGUARD_PRIMARY_PASSWORD: "p",
      ADGUARD_SECONDARY_URL: "http://y",
      ADGUARD_SECONDARY_USERNAME: "u",
      ADGUARD_SECONDARY_PASSWORD: "p",
      ADGUARD_DEFAULT_INSTANCE: "secondary",
    };
    expect(resolveInstances(env).defaultInstance).toBe("secondary");
  });

  it("throws NoInstancesError when no ADGUARD_*_URL is set", () => {
    expect(() => resolveInstances({})).toThrow(NoInstancesError);
  });

  it("throws PartialInstanceConfigError when an instance group is partial", () => {
    const env = {
      ADGUARD_PRIMARY_URL: "http://x",
      ADGUARD_PRIMARY_USERNAME: "u",
      // missing password
      ADGUARD_SECONDARY_URL: "http://y",
      ADGUARD_SECONDARY_USERNAME: "u",
      ADGUARD_SECONDARY_PASSWORD: "p",
    };
    expect(() => resolveInstances(env)).toThrow(PartialInstanceConfigError);
  });

  it("preserves whitespace-only instance fields as configured values", () => {
    const cfg = resolveInstances({
      ADGUARD_PRIMARY_URL: "http://x",
      ADGUARD_PRIMARY_USERNAME: "u",
      ADGUARD_PRIMARY_PASSWORD: " ",
    });

    expect(cfg.instances.primary.password).toBe(" ");
  });

  it("throws a plain Error with repo text when a required instance field is empty", () => {
    let thrown: unknown;
    try {
      resolveInstances({
        ADGUARD_PRIMARY_URL: "http://x",
        ADGUARD_PRIMARY_USERNAME: "u",
        ADGUARD_PRIMARY_PASSWORD: "",
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(PartialInstanceConfigError);
    expect((thrown as Error).message).toBe(
      "Partial AdGuard instance config for 'primary': missing PASSWORD. Set ADGUARD_PRIMARY_URL, ADGUARD_PRIMARY_USERNAME, and ADGUARD_PRIMARY_PASSWORD together, or unset all three.",
    );
  });

  it("throws UnknownDefaultInstanceError when ADGUARD_DEFAULT_INSTANCE is not a configured instance", () => {
    const env = {
      ADGUARD_PRIMARY_URL: "http://x",
      ADGUARD_PRIMARY_USERNAME: "u",
      ADGUARD_PRIMARY_PASSWORD: "p",
      ADGUARD_DEFAULT_INSTANCE: "tertiary",
    };
    expect(() => resolveInstances(env)).toThrow(UnknownDefaultInstanceError);
  });
});

describe("resolveSyncConfig", () => {
  it("returns undefined when AdGuardHome Sync is not configured", () => {
    expect(resolveSyncConfig({})).toBeUndefined();
  });

  it("parses an unauthenticated AdGuardHome Sync API URL", () => {
    expect(resolveSyncConfig({ ADGUARDHOME_SYNC_URL: "http://sync-host:8080" })).toEqual({
      url: "http://sync-host:8080",
    });
  });

  it("supports ADGUARD_SYNC_* as an alias without treating it as an AdGuard Home instance", () => {
    const env = {
      ADGUARD_PRIMARY_URL: "http://192.168.1.10",
      ADGUARD_PRIMARY_USERNAME: "admin",
      ADGUARD_PRIMARY_PASSWORD: "secret",
      ADGUARD_SYNC_URL: "http://sync-host:8080",
      ADGUARD_SYNC_USERNAME: "sync",
      ADGUARD_SYNC_PASSWORD: "sync-secret",
    };
    expect(Object.keys(resolveInstances(env).instances)).toEqual(["primary"]);
    expect(resolveSyncConfig(env)).toEqual({
      url: "http://sync-host:8080",
      username: "sync",
      password: "sync-secret",
    });
  });

  it("parses authenticated AdGuardHome Sync API config", () => {
    expect(resolveSyncConfig({
      ADGUARDHOME_SYNC_URL: "http://sync-host:8080",
      ADGUARDHOME_SYNC_USERNAME: "sync",
      ADGUARDHOME_SYNC_PASSWORD: "secret",
    })).toEqual({
      url: "http://sync-host:8080",
      username: "sync",
      password: "secret",
    });
  });

  it("throws on partial AdGuardHome Sync auth config", () => {
    expect(() => resolveSyncConfig({
      ADGUARDHOME_SYNC_URL: "http://sync-host:8080",
      ADGUARDHOME_SYNC_USERNAME: "sync",
    })).toThrow(PartialSyncConfigError);
  });

  it("throws when getting an unconfigured Sync server", () => {
    expect(() => getSyncConfig(undefined)).toThrow(NoSyncServerError);
  });
});

describe("getInstanceConfig", () => {
  it("resolves a named instance", () => {
    const cfg = resolveInstances({
      ADGUARD_PRIMARY_URL: "http://x",
      ADGUARD_PRIMARY_USERNAME: "u",
      ADGUARD_PRIMARY_PASSWORD: "p",
    });
    expect(getInstanceConfig(cfg, "primary").url).toBe("http://x");
  });

  it("falls back to default when name omitted", () => {
    const cfg = resolveInstances({
      ADGUARD_PRIMARY_URL: "http://x",
      ADGUARD_PRIMARY_USERNAME: "u",
      ADGUARD_PRIMARY_PASSWORD: "p",
    });
    expect(getInstanceConfig(cfg).url).toBe("http://x");
  });

  it("throws UnknownInstanceError on bad name", () => {
    const cfg = resolveInstances({
      ADGUARD_PRIMARY_URL: "http://x",
      ADGUARD_PRIMARY_USERNAME: "u",
      ADGUARD_PRIMARY_PASSWORD: "p",
    });
    expect(() => getInstanceConfig(cfg, "tertiary")).toThrow(UnknownInstanceError);
  });
});
