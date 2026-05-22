// content-guard: allow private-ipv4 file
import { describe, it, expect } from "vitest";
import {
  resolveInstances,
  getInstanceConfig,
  UnknownInstanceError,
  NoInstancesError,
  PartialInstanceConfigError,
  UnknownDefaultInstanceError,
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
