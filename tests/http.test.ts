import { randomUUID } from "node:crypto";
import { request } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createHttpServer, type HttpServerHandle } from "../src/http.ts";
import { startFakeAdGuard, type FakeAdGuard } from "./fake-adguard.ts";
import { redact } from "../src/security.ts";

const TOKEN = randomUUID();
const env = {
  ADGUARD_DEFAULT_INSTANCE: "primary",
  ADGUARD_PRIMARY_URL: "https://adguard.example.com",
  ADGUARD_PRIMARY_USERNAME: "test-admin",
  ADGUARD_PRIMARY_PASSWORD: "test-upstream-secret",
  ADGUARDHOME_SYNC_URL: "https://sync.example.com",
  ADGUARDHOME_SYNC_USERNAME: "sync-admin",
  ADGUARDHOME_SYNC_PASSWORD: "test-sync-secret",
  ADGUARD_MCP_HTTP_TOKEN: TOKEN,
  ADGUARD_MCP_HTTP_PORT: "0",
  ADGUARD_MCP_HTTP_HOST: undefined,
};
let http: HttpServerHandle | undefined;
let fake: FakeAdGuard | undefined;
const connections: { client: Client; transport: StreamableHTTPClientTransport }[] = [];
afterEach(async () => {
  for (const { client, transport } of connections.splice(0)) {
    await transport.terminateSession().catch(() => undefined);
    await client.close();
  }
  await http?.close();
  await fake?.close();
  http = undefined;
  fake = undefined;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function configure(extra = {}) {
  for (const [name, value] of Object.entries({ ...env, ...extra })) vi.stubEnv(name, value);
}
async function start(extra = {}) {
  configure(extra);
  http = await createHttpServer();
  return `http://localhost:${http.port}`;
}
async function connect(url: string) {
  const transport = new StreamableHTTPClientTransport(new URL(`${url}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
  });
  const client = new Client({ name: "http-test", version: "1" });
  connections.push({ client, transport });
  await client.connect(transport);
  return { client, transport };
}

describe("authenticated Streamable HTTP", () => {
  it.each([undefined, "Bearer wrong-token"])("rejects invalid authentication: %s", async (authorization) => {
    const url = await start();
    const response = await fetch(`${url}/mcp`, { method: "POST", headers: authorization ? { authorization } : {} });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(await response.text()).toBe("Unauthorized");
  });

  it("exposes only liveness without authentication", async () => {
    const response = await fetch(`${await start()}/healthz`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("lists tools using the SDK client and terminates its session", async () => {
    const url = await start();
    const { client, transport } = await connect(url);
    const result = await client.listTools();
    expect(result.tools).toHaveLength(50);
    expect(result.tools.some((t) => t.name === "adguard_status")).toBe(true);
    const id = transport.sessionId;
    expect(id).toBeTruthy();
    await transport.terminateSession();
    const stale = await fetch(`${url}/mcp`, {
      headers: { authorization: `Bearer ${TOKEN}`, "mcp-session-id": id!, accept: "text/event-stream" },
    });
    expect(stale.status).toBe(404);
  });

  it.each([
    { origin: "https://evil.example.com" },
    { origin: "null" },
    { origin: "http://localhost.evil.example.com" },
    { host: "evil.example.com" },
    { host: "localhost@evil.example.com" },
  ])("rejects rebinding headers %j", async (headers) => {
    const url = await start();
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(`${url}/mcp`, { method: "POST", headers: { ...headers, authorization: `Bearer ${TOKEN}` } }, (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      });
      req.on("error", reject);
      req.end();
    });
    expect(status).toBe(403);
  });

  it("accepts a loopback Origin", async () => {
    const url = await start();
    const response = await fetch(`${url}/mcp`, { method: "POST", headers: { origin: url } });
    expect(response.status).toBe(401);
  });

  it.each([undefined, "", "   ", env.ADGUARD_PRIMARY_USERNAME, env.ADGUARD_PRIMARY_PASSWORD,
    env.ADGUARDHOME_SYNC_USERNAME, env.ADGUARDHOME_SYNC_PASSWORD,
    ...["test-admin:test-upstream-secret", "sync-admin:test-sync-secret"].flatMap((pair) => [
      pair, Buffer.from(pair).toString("base64"), `Basic ${Buffer.from(pair).toString("base64")}`,
    ]),
  ])("refuses missing, blank, or reused credentials (%#)", async (token) => {
    configure({ ADGUARD_MCP_HTTP_TOKEN: token });
    await expect(createHttpServer()).rejects.toThrow(/ADGUARD_MCP_HTTP_TOKEN/);
  });

  it("checks Sync aliases and URL userinfo credentials", async () => {
    configure({ ADGUARDHOME_SYNC_URL: undefined, ADGUARDHOME_SYNC_USERNAME: undefined,
      ADGUARDHOME_SYNC_PASSWORD: undefined, ADGUARD_SYNC_URL: "https://sync.example.com",
      ADGUARD_SYNC_USERNAME: "alias-admin", ADGUARD_SYNC_PASSWORD: "alias-secret",
      ADGUARD_MCP_HTTP_TOKEN: "alias-secret" });
    await expect(createHttpServer()).rejects.toThrow(/ADGUARD_MCP_HTTP_TOKEN/);
    configure({ ADGUARD_PRIMARY_URL: "https://url-admin:url%2Dsecret@adguard.example.com",
      ADGUARD_MCP_HTTP_TOKEN: "url-secret" });
    await expect(createHttpServer()).rejects.toThrow(/ADGUARD_MCP_HTTP_TOKEN/);
  });

  it("registers the HTTP token for redaction", async () => {
    await start();
    expect(redact(`Bearer ${TOKEN}`)).toBe("Bearer REDACTED");
  });

  it.each(["-1", "65536", "abc", "3000suffix", "1.5"])("refuses invalid port %s", async (port) => {
    configure({ ADGUARD_MCP_HTTP_PORT: port });
    await expect(createHttpServer()).rejects.toThrow(/ADGUARD_MCP_HTTP_PORT/);
  });

  it("limits request bytes before JSON parsing", async () => {
    const url = await start();
    const response = await fetch(`${url}/mcp`, {
      method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: "x".repeat(1_048_577),
    });
    expect(response.status).toBe(413);
  });

  it("limits chunked bodies without a Content-Length", async () => {
    const url = await start();
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(`${url}/mcp`, {
        method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      }, (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      });
      req.on("error", reject);
      req.write("x".repeat(600_000));
      req.end("x".repeat(600_000));
    });
    expect(status).toBe(413);
  });

  it("expires idle sessions even with an SSE channel open", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const url = await start();
    const { transport } = await connect(url);
    const id = transport.sessionId!;
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 31 * 60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    const response = await fetch(`${url}/mcp`, {
      headers: { authorization: `Bearer ${TOKEN}`, "mcp-session-id": id, accept: "text/event-stream" },
    });
    expect(response.status).toBe(404);
  });

  it("keeps write and destructive confirmation local to each call across sessions", async () => {
    fake = await startFakeAdGuard([
      { method: "POST", path: "/control/rewrite/add", status: 200, body: {} },
      { method: "POST", path: "/control/querylog_clear", status: 200, body: {} },
      { method: "POST", path: "/api/v1/sync", status: 200, body: {} },
      { method: "POST", path: "/api/v1/clear-logs", status: 200, body: {} },
    ]);
    const url = await start({ ADGUARD_PRIMARY_URL: fake.baseUrl, ADGUARDHOME_SYNC_URL: fake.baseUrl });
    const [a, b] = await Promise.all([connect(url), connect(url)]);
    expect(a.transport.sessionId).not.toBe(b.transport.sessionId);
    for (const [name, args, destructive] of [
      ["adguard_add_rewrite", { domain: "test.example.com", answer: "answer.example.com" }, false],
      ["adguard_clear_query_log", {}, true],
      ["adguard_sync_run", {}, false],
      ["adguard_sync_clear_logs", {}, true],
    ] as const) {
      const [confirmed, unconfirmed] = await Promise.all([
        a.client.callTool({ name, arguments: { ...args, confirm: true, ...(destructive ? { destructive: true } : {}) } }),
        b.client.callTool({ name, arguments: { ...args, ...(destructive ? { confirm: true } : {}) } }),
      ]);
      expect(confirmed.isError).not.toBe(true);
      expect(unconfirmed.isError).toBe(true);
      expect((await a.client.callTool({ name, arguments: args })).isError).toBe(true);
    }
    expect(fake.requests.map((r) => r.path)).toEqual([
      "/control/rewrite/add", "/control/querylog_clear", "/api/v1/sync", "/api/v1/clear-logs",
    ]);
    expect(fake.requests.map((r) => r.body)).toEqual([
      JSON.stringify({ domain: "test.example.com", answer: "answer.example.com" }), "", "", "",
    ]);
    // Removing one session must leave the other's SDK connection usable.
    await a.transport.terminateSession();
    expect((await b.client.listTools()).tools.some((t) => t.name === "adguard_status")).toBe(true);
  });

  it("closes active sessions and the listener idempotently", async () => {
    const url = await start();
    await connect(url);
    await Promise.all([http!.close(), http!.close()]);
    await expect(fetch(`${url}/healthz`)).rejects.toThrow();
  });
});
