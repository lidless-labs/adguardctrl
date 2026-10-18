import { once } from "node:events";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliJs = join(root, "dist", "cli.js");

beforeAll(() => {
  execFileSync("npm", ["run", "build"], { cwd: root, stdio: "pipe" });
});

describe("cli entrypoint", () => {
  it("reports invalid ADGUARD_REQUEST_TIMEOUT_MS via operatorErrorMessage, not FiberFailure", () => {
    const result = spawnSync(process.execPath, [cliJs, "help"], {
      cwd: root,
      env: { ...process.env, ADGUARD_REQUEST_TIMEOUT_MS: "999" },
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr.trim()).toBe("ADGUARD_REQUEST_TIMEOUT_MS must be at least 1000ms");
    expect(result.stderr).not.toContain("FiberFailure");
    expect(result.stderr).not.toContain("triggerUncaughtException");
  });
});

// Exercise built bundles: module entrypoint guards behave differently after bundling.
describe("HTTP entrypoints", () => {
  it.each([
    ["mcp-server.js", "--http"],
    ["mcp-bin.js", "--http"],
    ["cli.js", "mcp", "--http"],
  ])("starts exactly one HTTP listener through %s", async (...args) => {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("ADGUARD")));
    const child = spawn(process.execPath, [join(root, "dist", args[0]), ...args.slice(1)], {
      cwd: root,
      env: { ...env, ADGUARD_PRIMARY_URL: "https://adguard.example.com",
        ADGUARD_PRIMARY_USERNAME: "test-admin", ADGUARD_PRIMARY_PASSWORD: "test-password",
        ADGUARD_MCP_HTTP_TOKEN: "entrypoint-test-token-at-least-32-characters", ADGUARD_MCP_HTTP_PORT: "0" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const exited = once(child, "exit");
    let stderr = "";
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    const ready = new Promise<void>((resolve, reject) => {
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
        if (stderr.includes("HTTP listening on")) resolve();
      });
      child.once("exit", () => reject(new Error(stderr || "HTTP startup exited")));
    });
    const deadline = setTimeout(() => child.kill("SIGKILL"), 5_000);
    try {
      await ready;
      // Give a second startup in the same bundle time to bind or fail.
      await new Promise((resolve) => setTimeout(resolve, 100));
      const listeners = [...stderr.matchAll(/HTTP listening on (http:\/\/[^\s]+)\/mcp/g)];
      expect(listeners).toHaveLength(1);
      const response = await fetch(`${listeners[0][1]}/healthz`);
      expect(await response.json()).toEqual({ status: "ok" });
      expect(stdout).toBe("");
    } finally {
      child.kill("SIGTERM");
      const [code, signal] = await exited;
      clearTimeout(deadline);
      expect({ code, signal }).toEqual({ code: 0, signal: null });
    }
  });
});
