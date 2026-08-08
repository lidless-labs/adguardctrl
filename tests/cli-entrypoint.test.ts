import { execFileSync, spawnSync } from "node:child_process";
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
