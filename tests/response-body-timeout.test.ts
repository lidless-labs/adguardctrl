import { describe, it, expect, afterEach, vi } from "vitest";
import { AdGuardClient } from "../src/adguard-client.ts";
import { AdGuardSyncClient } from "../src/adguard-sync-client.ts";

/** Client timeout under test — short so a fixed implementation fails fast. */
const CLIENT_TIMEOUT_MS = 50;
/** Retry gap between attempts when timeout/retry wiring works. */
const RETRY_DELAY_MS = 5;
/**
 * Outer suite guard: vulnerable code hangs on pending response.text() because
 * sendRequest clears its fetch timer once headers resolve. This wall must stay
 * well below vitest's default test timeout so the regression fails quickly.
 */
const TEST_HARD_WALL_MS = 500;

function stubFetchReturningHangingBody(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((_input: Parameters<typeof fetch>[0], _init?: RequestInit) => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // HTTP 200 headers resolve immediately; body stays open with partial JSON.
        controller.enqueue(new TextEncoder().encode('{"version":"v0.107.50","protection_enabled":true'));
      },
    });
    return Promise.resolve(
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function withHardWall<T>(promise: Promise<T>, wallMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `test hard wall exceeded ${wallMs}ms — response body likely still pending past configured timeout`,
            ),
          ),
        wallMs,
      ),
    ),
  ]);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("response body timeout regression (#10)", () => {
  it("AdGuardClient aborts when 200 headers arrive but the body stream stays open", async () => {
    const fetchMock = stubFetchReturningHangingBody();
    const client = new AdGuardClient(
      { url: "http://127.0.0.1:9", username: "u", password: "p" },
      { timeoutMs: CLIENT_TIMEOUT_MS, retryDelayMs: RETRY_DELAY_MS },
    );

    await expect(
      withHardWall(client.get("/control/status"), TEST_HARD_WALL_MS),
    ).rejects.toMatchObject({
      name: "AdGuardUnreachableError",
      message: "AdGuard unreachable: The operation was aborted.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("AdGuardSyncClient aborts when 200 headers arrive but the body stream stays open", async () => {
    const fetchMock = stubFetchReturningHangingBody();
    const client = new AdGuardSyncClient(
      { url: "http://127.0.0.1:9" },
      { timeoutMs: CLIENT_TIMEOUT_MS, retryDelayMs: RETRY_DELAY_MS },
    );

    await expect(
      withHardWall(client.get("/api/v1/status"), TEST_HARD_WALL_MS),
    ).rejects.toMatchObject({
      name: "AdGuardSyncUnreachableError",
      message: "AdGuardHome Sync unreachable: The operation was aborted.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
