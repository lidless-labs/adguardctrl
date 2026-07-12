import { afterEach, describe, expect, it, vi } from "vitest";
import { run, type CliDeps } from "../cli.ts";
import { AdGuardClient, AdGuardClientError, AdGuardUnreachableError } from "../src/adguard-client.ts";
import { AdGuardSyncClient } from "../src/adguard-sync-client.ts";
import { getInstanceConfig, resolveInstances } from "../src/config.ts";

function deps(overrides: Partial<CliDeps> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const base: CliDeps = {
    out: (s) => out.push(s),
    err: (s) => err.push(s),
    makeClient: () => ({ get: vi.fn().mockResolvedValue({ ok: true }) }) as unknown as AdGuardClient,
    makeSyncClient: () => ({ get: vi.fn().mockResolvedValue({ ok: true }), head: vi.fn().mockResolvedValue({ ok: true }) }) as unknown as AdGuardSyncClient,
    startServer: vi.fn().mockResolvedValue(undefined),
  };
  return { out, err, deps: { ...base, ...overrides } };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("golden CLI exit and stderr contracts", () => {
  it("returns exit 1 and prints the current missing-config stderr when client construction fails", async () => {
    const captured = deps({
      makeClient: () => new AdGuardClient(getInstanceConfig(resolveInstances({}), undefined)),
    });

    await expect(run(["status"], captured.deps)).resolves.toBe(1);

    expect(captured.out).toEqual([]);
    expect(captured.err).toEqual([
      "No AdGuard instances configured. Set ADGUARD_<NAME>_URL/USERNAME/PASSWORD for at least one instance.",
    ]);
  });

  it("returns exit 2 and prints the current stderr for an unknown command", async () => {
    const captured = deps();

    await expect(run(["nope"], captured.deps)).resolves.toBe(2);

    expect(captured.out).toEqual([]);
    expect(captured.err[0]).toBe("Unknown command: nope");
    expect(captured.err[1]).toBe("");
    expect(captured.err.join("\n")).toContain("Usage:");
  });

  it("returns exit 1 and prints the current stderr for a failed API call", async () => {
    const client = {
      get: vi.fn().mockRejectedValue(new Error("AdGuard unreachable: connect ECONNREFUSED 127.0.0.1:3000")),
    } as unknown as AdGuardClient;
    const captured = deps({ makeClient: () => client });

    await expect(run(["stats"], captured.deps)).resolves.toBe(1);

    expect(captured.out).toEqual([]);
    expect(captured.err).toEqual(["AdGuard unreachable: connect ECONNREFUSED 127.0.0.1:3000"]);
  });

  it("resolves with exit 1 when client construction fails on an API command", async () => {
    const constructionError = new Error("construct failed");
    const captured = deps({
      makeClient: () => {
        throw constructionError;
      },
    });

    await expect(run(["status"], captured.deps)).resolves.toBe(1);
    expect(captured.err).toEqual(["construct failed"]);
  });
});

describe("golden programmatic MCP startup contract", () => {
  it("preserves startup rejection object identity on the mcp path", async () => {
    const startupError = new Error("mcp startup failed");
    const captured = deps({
      startServer: vi.fn().mockRejectedValue(startupError),
    });

    await expect(run(["mcp"], captured.deps)).rejects.toBe(startupError);
    expect(captured.err).toEqual([]);
  });
});

describe("golden HTTP Basic auth header contracts", () => {
  it("sends AdGuard Home Basic auth exactly as currently encoded", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new AdGuardClient({
      url: "https://adguard.example.test/",
      username: "operator",
      password: "pa:ss word",
    });

    await client.get("/control/status");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "GET",
      headers: {
        authorization: `Basic ${Buffer.from("operator:pa:ss word").toString("base64")}`,
      },
    });
  });

  it("sends AdGuardHome Sync Basic auth exactly when username and password are configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new AdGuardSyncClient({
      url: "https://sync.example.test/",
      username: "sync-user",
      password: "sync password",
    });

    await client.get("/api/v1/status");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "GET",
      headers: {
        authorization: `Basic ${Buffer.from("sync-user:sync password").toString("base64")}`,
      },
    });
  });
});

describe("golden retry contracts", () => {
  it("retries AdGuard Home transport errors exactly once", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new AdGuardClient({ url: "https://adguard.example.test", username: "u", password: "p" }, { retryDelayMs: 0 });

    await expect(client.get("/control/status")).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries AdGuard Home 5xx responses exactly once", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(503, { message: "maintenance" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new AdGuardClient({ url: "https://adguard.example.test", username: "u", password: "p" }, { retryDelayMs: 0 });

    await expect(client.get("/control/status")).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry AdGuard Home 4xx responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { message: "unauthorized" }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new AdGuardClient({ url: "https://adguard.example.test", username: "u", password: "p" }, { retryDelayMs: 0 });

    await expect(client.get("/control/status")).rejects.toMatchObject({
      name: "AdGuardClientError",
      status: 401,
      message: "AdGuard 401: unauthorized",
    } satisfies Partial<AdGuardClientError>);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries AdGuardHome Sync transport errors and 5xx responses, but never 4xx", async () => {
    const transportFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", transportFetch);
    const transportClient = new AdGuardSyncClient({ url: "https://sync.example.test" }, { retryDelayMs: 0 });

    await expect(transportClient.get("/api/v1/status")).resolves.toEqual({ ok: true });
    expect(transportFetch).toHaveBeenCalledTimes(2);

    const serverErrorFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(502, { message: "bad gateway" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", serverErrorFetch);
    const serverErrorClient = new AdGuardSyncClient({ url: "https://sync.example.test" }, { retryDelayMs: 0 });

    await expect(serverErrorClient.get("/api/v1/status")).resolves.toEqual({ ok: true });
    expect(serverErrorFetch).toHaveBeenCalledTimes(2);

    const clientErrorFetch = vi.fn().mockResolvedValue(jsonResponse(403, { message: "forbidden" }));
    vi.stubGlobal("fetch", clientErrorFetch);
    const clientErrorClient = new AdGuardSyncClient({ url: "https://sync.example.test" }, { retryDelayMs: 0 });

    await expect(clientErrorClient.get("/api/v1/status")).rejects.toMatchObject({
      name: "AdGuardSyncClientError",
      status: 403,
      message: "AdGuardHome Sync 403: forbidden",
    });
    expect(clientErrorFetch).toHaveBeenCalledTimes(1);
  });

  it("throws the last AdGuard Home 5xx retry failure as unreachable", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(503, { message: "first" }))
      .mockResolvedValueOnce(jsonResponse(502, { message: "second" }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new AdGuardClient({ url: "https://adguard.example.test", username: "u", password: "p" }, { retryDelayMs: 0 });

    await expect(client.get("/control/status")).rejects.toMatchObject({
      name: "AdGuardUnreachableError",
      message: "AdGuard unreachable: HTTP 502",
    } satisfies Partial<AdGuardUnreachableError>);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
