import { Buffer } from "node:buffer";
import { describe, it, expect, beforeEach } from "vitest";
import { withRedactedErrors } from "../index.ts";
import { registerSecret, _resetForTests } from "../src/security.ts";

describe("withRedactedErrors", () => {
  beforeEach(() => {
    _resetForTests();
  });

  it("redacts a registered secret (basic-auth header value) out of a thrown error message", async () => {
    const password = "super-secret-pw";
    const username = "admin";
    const basicValue = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
    registerSecret(password);
    registerSecret(basicValue);

    const raw = {
      name: "boom_tool",
      execute: async (_id: string, _args: Record<string, unknown>) => {
        throw new Error(`AdGuard rejected request (sent header ${basicValue}; password ${password})`);
      },
    };
    const wrapped = withRedactedErrors(raw);

    const result = (await wrapped.execute("boom_tool", {})) as {
      content: { type: string; text: string }[];
      isError: boolean;
    };

    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");

    const payload = JSON.parse(result.content[0].text) as { error: string };
    expect(payload.error).toContain("REDACTED");
    expect(payload.error).not.toContain(basicValue);
    expect(payload.error).not.toContain(password);
  });

  it("passes through successful results unchanged", async () => {
    const raw = {
      name: "ok_tool",
      execute: async (_id: string, _args: Record<string, unknown>) => {
        return { content: [{ type: "text" as const, text: "ok" }] };
      },
    };
    const wrapped = withRedactedErrors(raw);
    const result = await wrapped.execute("ok_tool", {});
    expect(result).toEqual({ content: [{ type: "text", text: "ok" }] });
  });
});
