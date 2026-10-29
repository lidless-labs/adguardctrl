import { expect, it, vi } from "vitest";
import { buildAllTools } from "../src/tools/index.ts";
import { WriteGateError } from "../src/gates.ts";
import type { AdGuardClient } from "../src/adguard-client.ts";
import type { AdGuardSyncClient } from "../src/adguard-sync-client.ts";

it("rejects every unconfirmed registered mutation before constructing a client or doing I/O", async () => {
  const home = vi.fn(() => { throw new Error("client construction is I/O boundary"); }) as unknown as ReturnType<typeof vi.fn<() => AdGuardClient>>;
  const sync = vi.fn(() => { throw new Error("client construction is I/O boundary"); }) as unknown as ReturnType<typeof vi.fn<() => AdGuardSyncClient>>;
  const tools = buildAllTools(home, sync);
  for (const tool of tools.filter((t) => !t.annotations.readOnlyHint)) {
    await expect(tool.execute("test", {}), tool.name).rejects.toBeInstanceOf(WriteGateError);
    if ("destructive" in tool.parameters.properties) {
      await expect(tool.execute("test", { confirm: true }), tool.name).rejects.toBeInstanceOf(WriteGateError);
    }
  }
  expect(home).not.toHaveBeenCalled();
  expect(sync).not.toHaveBeenCalled();
});
