import { describe, expect, it } from "vitest";
import pkg from "../package.json";
import lock from "../package-lock.json";
import manifest from "../openclaw.plugin.json";

describe("package manifests", () => {
  it("keeps the OpenClaw plugin version aligned with the npm package version", () => {
    expect(manifest.version).toBe(pkg.version);
  });

  it("keeps the package lock root version aligned with the npm package version", () => {
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages[""].version).toBe(pkg.version);
  });
});
