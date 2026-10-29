import { createServer, type Server, type RequestListener } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdGuardClient } from "../src/adguard-client.ts";
import { AdGuardSyncClient } from "../src/adguard-sync-client.ts";

const servers: Server[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((resolve) => {
    s.closeAllConnections();
    s.close(() => resolve());
  })));
});
const factories = [
  ["Home", (url: string, options = {}) => new AdGuardClient({ url, username: "operator", password: "test-secret" }, { retryDelayMs: 0, ...options })],
  ["Sync", (url: string, options = {}) => new AdGuardSyncClient({ url, username: "operator", password: "test-secret" }, { retryDelayMs: 0, ...options })],
] as const;
async function listen(handler: RequestListener) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe.each(factories)("%s client safety", (_name, makeClient) => {
  it.each(["transport", "5xx", "body timeout"])("never replays POST after %s", async (failure) => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls++;
      if (failure === "transport") throw new Error("connection lost after write");
      if (failure === "5xx") return new Response("failed", { status: 503 });
      return new Response(new ReadableStream());
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(makeClient("https://adguard.example", { timeoutMs: 20 }).post("/write", {})).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it("cancels a chunked custom-fetch stream before buffering it in the wrapper", async () => {
    const cancel = vi.fn();
    let chunks = 0;
    const signal: AbortSignal[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      signal.push(init.signal);
      return new Response(new ReadableStream({
        pull(controller) {
          chunks++;
          if (chunks < 20) controller.enqueue(new Uint8Array(32));
          else controller.close();
        }, cancel,
      }));
    }));
    await expect(makeClient("https://adguard.example", { maxResponseBytes: 64 }).get("/status"))
      .rejects.toThrow("Response exceeded the byte limit.");
    expect(cancel).toHaveBeenCalledOnce();
    expect(chunks).toBeLessThan(20);
    expect(signal).toHaveLength(1);
    expect(signal[0]).toBeInstanceOf(AbortSignal);
    expect(signal[0].aborted).toBe(true);
  });

  it.each([0, -1, 1.5, Number.NaN])("rejects invalid byte caps without I/O: %s", async (maxResponseBytes) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(makeClient("https://adguard.example", { maxResponseBytes }).get("/status"))
      .rejects.toThrow("Invalid HTTP request configuration.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("enforces the default 10 MiB cap on an error response", async () => {
    let chunks = 0;
    const cancel = vi.fn();
    const fetchMock = vi.fn(async () => new Response(new ReadableStream({
      pull(controller) {
        chunks++;
        if (chunks <= 12) controller.enqueue(new Uint8Array(1_048_576));
        else controller.close();
      }, cancel,
    }), { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(makeClient("https://adguard.example").get("/status"))
      .rejects.toThrow("Response exceeded the byte limit.");
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("bounds a native chunked response", async () => {
    const url = await listen((_req, res) => {
      res.writeHead(200);
      res.write("x".repeat(40));
      res.end("x".repeat(40));
    });
    await expect(makeClient(url, { maxResponseBytes: 64 }).get("/status"))
      .rejects.toThrow("Response exceeded the byte limit.");
  });

  it("keeps the deadline active for a native stalled response body", async () => {
    const url = await listen((_req, res) => { res.writeHead(200); res.write("partial"); });
    await expect(makeClient(url, { timeoutMs: 30 }).get("/status")).rejects.toThrow(/aborted/);
  });

  it("rejects authenticated redirects without contacting the target", async () => {
    let targetCalls = 0;
    const target = await listen((_req, res) => { targetCalls++; res.end("{}"); });
    const origin = await listen((_req, res) => { res.writeHead(302, { location: `${target}/target` }); res.end(); });
    await expect(makeClient(origin).get("/redirect")).rejects.toThrow("HTTP redirects are disabled.");
    expect(targetCalls).toBe(0);
  });
});

it("does not replay Home PUT on a server error", async () => {
  const fetchMock = vi.fn(async () => new Response("uncertain", { status: 502 }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(new AdGuardClient({ url: "https://adguard.example", username: "operator", password: "test-secret" }, { retryDelayMs: 0 }).put("/write", {})).rejects.toThrow();
  expect(fetchMock).toHaveBeenCalledOnce();
});
