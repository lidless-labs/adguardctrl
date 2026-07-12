import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { operatorErrorMessage } from "@lidless-labs/effect-operator-kit";
import { AdGuardClient } from "./src/adguard-client.ts";
import { AdGuardSyncClient } from "./src/adguard-sync-client.ts";
import {
  resolveInstances,
  resolveSyncConfig,
  getInstanceConfig,
  getSyncConfig,
} from "./src/config.ts";
import { redactTlsSecrets } from "./src/tools/adguard_tls_status.ts";

const VERSION = "0.3.0";

export class UsageError extends Error {}

// AGH FilteringReason values that mean "this query was blocked", mirrored from
// the query-log tool so `--blocked-only` filters the same way the MCP tool does.
const BLOCKED_REASONS = [
  "FilteredBlackList",
  "FilteredSafeBrowsing",
  "FilteredParental",
  "FilteredInvalid",
  "FilteredSafeSearch",
  "FilteredBlockedService",
];

export type Parsed =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "mcp" }
  | { kind: "status"; json: boolean; instance?: string }
  | { kind: "stats"; json: boolean; instance?: string }
  | {
      kind: "querylog";
      json: boolean;
      instance?: string;
      limit: number;
      client?: string;
      domain?: string;
      blockedOnly: boolean;
    }
  | { kind: "check-host"; json: boolean; instance?: string; host: string; client?: string; qtype?: string }
  | { kind: "clients-list"; json: boolean; instance?: string }
  | { kind: "rules-list"; json: boolean; instance?: string }
  | { kind: "filters-list"; json: boolean; instance?: string }
  | { kind: "blocked-services-list"; json: boolean; instance?: string }
  | { kind: "blocked-services-catalog"; json: boolean; instance?: string }
  | { kind: "rewrites-list"; json: boolean; instance?: string }
  | { kind: "rewrites-settings"; json: boolean; instance?: string }
  | { kind: "dns-config"; json: boolean; instance?: string }
  | { kind: "safesearch"; json: boolean; instance?: string }
  | { kind: "access-list"; json: boolean; instance?: string }
  | { kind: "querylog-config"; json: boolean; instance?: string }
  | { kind: "stats-config"; json: boolean; instance?: string }
  | { kind: "dhcp-status"; json: boolean; instance?: string }
  | { kind: "dhcp-interfaces"; json: boolean; instance?: string }
  | { kind: "tls-status"; json: boolean; instance?: string }
  | { kind: "sync-status"; json: boolean }
  | { kind: "sync-health"; json: boolean }
  | { kind: "sync-logs"; json: boolean };

export const HELP = `adguardctrl - read-only operator CLI for AdGuard Home and AdGuardHome Sync

Usage:
  adguardctrl <command> [subcommand] [options]

AdGuard Home (read-only):
  status                       Server status (version, protection, running)
  stats                        24h DNS query statistics
  querylog                     Recent DNS queries
  check-host <host>            Test what AGH would do with a hostname
  clients list                 Configured clients
  rules list                   Custom user-rules block
  filters list                 Subscribed filter lists
  blocked-services list        Global blocked-services list + schedule
  blocked-services catalog     Services AGH can block per-client
  rewrites list                DNS rewrite rules
  rewrites settings            DNS rewrite enabled state
  dns-config                   DNS server config (upstreams, cache, ...)
  safesearch                   SafeSearch state + per-engine flags
  access-list                  Allowed/disallowed clients, blocked hosts
  querylog-config              Query-log settings
  stats-config                 Statistics settings
  dhcp status                  DHCP server settings, leases, status
  dhcp interfaces              Network interfaces available to DHCP
  tls status                   TLS config + validation (private key redacted)

AdGuardHome Sync (read-only):
  sync status                  Origin/replica status
  sync health                  Health probe (exit 1 if not healthy)
  sync logs                    In-memory Sync logs

Other:
  help                         Show this help
  mcp                          Start the MCP server over stdio

Global options:
  --instance <name>            Target a named AdGuard instance (default: configured default)
  --json                       Emit raw JSON instead of human-readable text
  --version, -v                Print version
  --help, -h                   Show help

querylog options:
  --limit <n>                  Max entries, 1-500              (default 50)
  --client <ip|name>           Filter by client
  --domain <name>              Filter by domain
  --blocked-only               Only blocked queries

check-host options:
  --client <ip|name>           Simulate the lookup against a client
  --qtype <type>               DNS query type (A, AAAA, HTTPS, ...)

Environment:
  ADGUARD_<NAME>_URL / _USERNAME / _PASSWORD   One block per instance
  ADGUARD_DEFAULT_INSTANCE                      Default instance name
  ADGUARDHOME_SYNC_URL / _USERNAME / _PASSWORD  AdGuardHome Sync server`;

function takeFlag(args: string[], name: string): boolean {
  const i = args.indexOf(name);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
}

function takeOption(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const v = args[i + 1];
  if (v === undefined || v.startsWith("--")) throw new UsageError(`${name} requires a value`);
  args.splice(i, 2);
  return v;
}

function ensureNoExtra(args: string[]): void {
  if (args.length) throw new UsageError(`Unexpected arguments: ${args.join(" ")}`);
}

function requireInt(v: string, name: string, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new UsageError(`${name} must be an integer in [${min}, ${max}]`);
  }
  return n;
}

export function parseArgs(argv: string[]): Parsed {
  const args = [...argv];
  if (args.includes("-h") || args.includes("--help")) return { kind: "help" };
  if (args.includes("-v") || args.includes("--version")) return { kind: "version" };

  const cmd = args.shift();
  if (!cmd || cmd === "help") return { kind: "help" };
  if (cmd === "mcp") {
    ensureNoExtra(args);
    return { kind: "mcp" };
  }

  // Pull global options out of the remaining args before dispatching.
  const json = takeFlag(args, "--json");
  const instance = takeOption(args, "--instance");

  switch (cmd) {
    case "status":
      ensureNoExtra(args);
      return { kind: "status", json, instance };
    case "stats":
      ensureNoExtra(args);
      return { kind: "stats", json, instance };
    case "querylog": {
      const limitStr = takeOption(args, "--limit");
      const client = takeOption(args, "--client");
      const domain = takeOption(args, "--domain");
      const blockedOnly = takeFlag(args, "--blocked-only");
      ensureNoExtra(args);
      const limit = limitStr === undefined ? 50 : requireInt(limitStr, "--limit", 1, 500);
      return { kind: "querylog", json, instance, limit, client, domain, blockedOnly };
    }
    case "check-host": {
      const client = takeOption(args, "--client");
      const qtype = takeOption(args, "--qtype");
      const host = args.shift();
      if (!host || host.startsWith("--")) throw new UsageError("check-host requires a <host>");
      ensureNoExtra(args);
      return { kind: "check-host", json, instance, host, client, qtype };
    }
    case "clients":
      return parseSub(args, json, instance, "clients", { list: "clients-list" });
    case "rules":
      return parseSub(args, json, instance, "rules", { list: "rules-list" });
    case "filters":
      return parseSub(args, json, instance, "filters", { list: "filters-list" });
    case "blocked-services":
      return parseSub(args, json, instance, "blocked-services", {
        list: "blocked-services-list",
        catalog: "blocked-services-catalog",
      });
    case "rewrites":
      return parseSub(args, json, instance, "rewrites", {
        list: "rewrites-list",
        settings: "rewrites-settings",
      });
    case "dns-config":
      ensureNoExtra(args);
      return { kind: "dns-config", json, instance };
    case "safesearch":
      ensureNoExtra(args);
      return { kind: "safesearch", json, instance };
    case "access-list":
      ensureNoExtra(args);
      return { kind: "access-list", json, instance };
    case "querylog-config":
      ensureNoExtra(args);
      return { kind: "querylog-config", json, instance };
    case "stats-config":
      ensureNoExtra(args);
      return { kind: "stats-config", json, instance };
    case "dhcp":
      return parseSub(args, json, instance, "dhcp", {
        status: "dhcp-status",
        interfaces: "dhcp-interfaces",
      });
    case "tls":
      return parseSub(args, json, instance, "tls", { status: "tls-status" });
    case "sync":
      return parseSyncSub(args, json);
    default:
      throw new UsageError(`Unknown command: ${cmd}`);
  }
}

// Dispatch a "<cmd> <subcommand>" pair (instance-bearing commands) to its Parsed kind.
function parseSub(
  args: string[],
  json: boolean,
  instance: string | undefined,
  cmd: string,
  map: Record<string, Parsed["kind"]>,
): Parsed {
  const sub = args.shift();
  if (!sub) throw new UsageError(`${cmd} requires a subcommand: ${Object.keys(map).join(" | ")}`);
  const kind = map[sub];
  if (!kind) throw new UsageError(`Unknown ${cmd} subcommand: ${sub}. Expected: ${Object.keys(map).join(" | ")}`);
  ensureNoExtra(args);
  return { kind, json, instance } as Parsed;
}

// Sync subcommands never take an --instance (there is a single Sync server).
function parseSyncSub(args: string[], json: boolean): Parsed {
  const sub = args.shift();
  const map: Record<string, "sync-status" | "sync-health" | "sync-logs"> = {
    status: "sync-status",
    health: "sync-health",
    logs: "sync-logs",
  };
  if (!sub) throw new UsageError(`sync requires a subcommand: ${Object.keys(map).join(" | ")}`);
  const kind = map[sub];
  if (!kind) throw new UsageError(`Unknown sync subcommand: ${sub}. Expected: ${Object.keys(map).join(" | ")}`);
  ensureNoExtra(args);
  return { kind, json };
}

// ---------- renderers (concise human-readable; --json bypasses these) ----------

function fmtList(label: string, items: unknown[]): string {
  if (items.length === 0) return `${label}: (none)`;
  return `${label} (${items.length}):\n` + items.map((i) => `  ${typeof i === "string" ? i : JSON.stringify(i)}`).join("\n");
}

function renderStatus(s: any): string {
  const lines = [
    `protection_enabled: ${s.protection_enabled}`,
    `running: ${s.running}`,
    `version: ${s.version ?? "(unknown)"}`,
  ];
  if (s.dns_port !== undefined) lines.push(`dns_port: ${s.dns_port}`);
  if (Array.isArray(s.dns_addresses)) lines.push(`dns_addresses: ${s.dns_addresses.join(", ")}`);
  return lines.join("\n");
}

function renderStats(s: any): string {
  const lines: string[] = [];
  if (s.num_dns_queries !== undefined) lines.push(`dns_queries: ${s.num_dns_queries}`);
  if (s.num_blocked_filtering !== undefined) lines.push(`blocked_filtering: ${s.num_blocked_filtering}`);
  if (s.num_replaced_safebrowsing !== undefined) lines.push(`replaced_safebrowsing: ${s.num_replaced_safebrowsing}`);
  if (s.num_replaced_safesearch !== undefined) lines.push(`replaced_safesearch: ${s.num_replaced_safesearch}`);
  if (s.avg_processing_time !== undefined) lines.push(`avg_processing_time: ${s.avg_processing_time}`);
  const tops = (arr: unknown): string[] =>
    Array.isArray(arr)
      ? arr.slice(0, 5).map((e) => {
          const [k, v] = Object.entries(e as Record<string, unknown>)[0] ?? ["?", "?"];
          return `  ${k}: ${v}`;
        })
      : [];
  const topBlocked = tops(s.top_blocked_domains);
  if (topBlocked.length) lines.push("top_blocked_domains:", ...topBlocked);
  const topClients = tops(s.top_clients);
  if (topClients.length) lines.push("top_clients:", ...topClients);
  return lines.length ? lines.join("\n") : JSON.stringify(s, null, 2);
}

function renderQuerylog(log: any): string {
  const data = Array.isArray(log?.data) ? log.data : [];
  if (data.length === 0) return "No query-log entries.";
  const lines = [`${data.length} entr${data.length === 1 ? "y" : "ies"}:`];
  for (const e of data) {
    const name = e?.question?.name ?? e?.question?.host ?? "?";
    const reason = e?.reason ?? "?";
    const client = e?.client ?? "?";
    const when = e?.time ?? "";
    lines.push(`  ${when}  ${client}  ${name}  [${reason}]`);
  }
  return lines.join("\n");
}

function renderCheckHost(r: any): string {
  const lines = [`reason: ${r.reason ?? "?"}`];
  if (r.filter_id !== undefined) lines.push(`filter_id: ${r.filter_id}`);
  if (r.rule) lines.push(`rule: ${r.rule}`);
  if (Array.isArray(r.rules) && r.rules.length) lines.push(`rules: ${r.rules.map((x: any) => x.text ?? JSON.stringify(x)).join(", ")}`);
  if (Array.isArray(r.cname) ? r.cname.length : r.cname) lines.push(`cname: ${Array.isArray(r.cname) ? r.cname.join(", ") : r.cname}`);
  if (Array.isArray(r.ip_addrs) && r.ip_addrs.length) lines.push(`ip_addrs: ${r.ip_addrs.join(", ")}`);
  return lines.join("\n");
}

function renderClients(r: any): string {
  const clients = Array.isArray(r?.clients) ? r.clients : [];
  const auto = Array.isArray(r?.auto_clients) ? r.auto_clients : [];
  const lines = [`configured clients (${clients.length}):`];
  for (const c of clients) {
    const ids = Array.isArray(c.ids) ? c.ids.join(", ") : "";
    lines.push(`  ${c.name ?? "?"}  [${ids}]`);
  }
  lines.push(`auto-discovered clients: ${auto.length}`);
  return lines.join("\n");
}

function renderFilters(r: any): string {
  const filters = Array.isArray(r?.filters) ? r.filters : [];
  const whitelist = Array.isArray(r?.whitelist_filters) ? r.whitelist_filters : [];
  const lines = [`filtering_enabled: ${r?.enabled}`, `filters (${filters.length}):`];
  for (const f of filters) {
    lines.push(`  [${f.enabled ? "x" : " "}] ${f.name ?? "?"}  rules=${f.rules_count ?? "?"}  ${f.url ?? ""}`);
  }
  lines.push(`whitelist filters: ${whitelist.length}`);
  return lines.join("\n");
}

function renderRules(r: any): string {
  const rules = Array.isArray(r?.rules) ? r.rules : [];
  return fmtList("user rules", rules);
}

function renderBlockedServices(r: any): string {
  // The /get response may be an array of ids or { ids, schedule }.
  const ids = Array.isArray(r) ? r : Array.isArray(r?.ids) ? r.ids : [];
  return fmtList("blocked services", ids);
}

function renderBlockedServicesCatalog(r: any): string {
  const services = Array.isArray(r?.blocked_services)
    ? r.blocked_services
    : Array.isArray(r)
      ? r
      : [];
  const names = services.map((s: any) => (typeof s === "string" ? s : s.id ?? s.name ?? JSON.stringify(s)));
  return fmtList("catalog services", names);
}

function renderRewrites(r: any): string {
  const list = Array.isArray(r) ? r : [];
  if (list.length === 0) return "No DNS rewrites.";
  const lines = [`rewrites (${list.length}):`];
  for (const e of list) lines.push(`  ${e.domain ?? "?"} -> ${e.answer ?? "?"}`);
  return lines.join("\n");
}

function renderRewriteSettings(r: any): string {
  return `rewrite_enabled: ${r?.enabled}`;
}

function renderDnsConfig(r: any): string {
  const lines: string[] = [];
  if (Array.isArray(r.upstream_dns)) lines.push(`upstream_dns (${r.upstream_dns.length}):`, ...r.upstream_dns.map((u: string) => `  ${u}`));
  if (Array.isArray(r.bootstrap_dns)) lines.push(`bootstrap_dns: ${r.bootstrap_dns.join(", ")}`);
  if (r.upstream_mode !== undefined) lines.push(`upstream_mode: ${r.upstream_mode}`);
  if (r.cache_size !== undefined) lines.push(`cache_size: ${r.cache_size}`);
  if (r.blocking_mode !== undefined) lines.push(`blocking_mode: ${r.blocking_mode}`);
  if (r.ratelimit !== undefined) lines.push(`ratelimit: ${r.ratelimit}`);
  return lines.length ? lines.join("\n") : JSON.stringify(r, null, 2);
}

function renderSafesearch(r: any): string {
  const lines = [`enabled: ${r?.enabled}`];
  for (const [k, v] of Object.entries(r ?? {})) {
    if (k === "enabled") continue;
    lines.push(`  ${k}: ${v}`);
  }
  return lines.join("\n");
}

function renderAccessList(r: any): string {
  const allowed = Array.isArray(r?.allowed_clients) ? r.allowed_clients : [];
  const disallowed = Array.isArray(r?.disallowed_clients) ? r.disallowed_clients : [];
  const blocked = Array.isArray(r?.blocked_hosts) ? r.blocked_hosts : [];
  return [
    fmtList("allowed_clients", allowed),
    fmtList("disallowed_clients", disallowed),
    fmtList("blocked_hosts", blocked),
  ].join("\n");
}

function renderKeyVals(r: any): string {
  if (!r || typeof r !== "object") return String(r);
  return Object.entries(r)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.length}]` : typeof v === "object" ? JSON.stringify(v) : v}`)
    .join("\n");
}

function renderDhcpStatus(r: any): string {
  const lines = [`enabled: ${r?.enabled}`];
  if (r?.interface_name) lines.push(`interface: ${r.interface_name}`);
  const leases = Array.isArray(r?.leases) ? r.leases : [];
  const staticLeases = Array.isArray(r?.static_leases) ? r.static_leases : [];
  lines.push(`leases: ${leases.length}`, `static_leases: ${staticLeases.length}`);
  return lines.join("\n");
}

function renderDhcpInterfaces(r: any): string {
  if (!r || typeof r !== "object") return JSON.stringify(r, null, 2);
  const names = Object.keys(r);
  return fmtList("interfaces", names);
}

function renderTlsStatus(r: any): string {
  const lines = [`enabled: ${r?.enabled}`];
  if (r?.server_name) lines.push(`server_name: ${r.server_name}`);
  if (r?.port_https !== undefined) lines.push(`port_https: ${r.port_https}`);
  if (r?.port_dns_over_tls !== undefined) lines.push(`port_dns_over_tls: ${r.port_dns_over_tls}`);
  if (r?.valid_cert !== undefined) lines.push(`valid_cert: ${r.valid_cert}`);
  if (r?.not_after) lines.push(`not_after: ${r.not_after}`);
  if (r?.warning_validation) lines.push(`warning: ${r.warning_validation}`);
  return lines.join("\n");
}

function renderSyncStatus(r: any): string {
  if (!r || typeof r !== "object") return String(r);
  const lines: string[] = [];
  if (r.origin) lines.push(`origin: ${typeof r.origin === "object" ? JSON.stringify(r.origin) : r.origin}`);
  if (Array.isArray(r.replicas)) lines.push(`replicas: ${r.replicas.length}`);
  return lines.length ? lines.join("\n") : renderKeyVals(r);
}

export interface CliDeps {
  out: (s: string) => void;
  err: (s: string) => void;
  makeClient: (instance?: string) => AdGuardClient;
  makeSyncClient: () => AdGuardSyncClient;
  startServer: () => Promise<void>;
}

export async function run(argv: string[], deps: CliDeps): Promise<number> {
  let parsed: Parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    deps.err(error instanceof Error ? error.message : String(error));
    deps.err("");
    deps.err(HELP);
    return 2;
  }

  if (parsed.kind === "help") {
    deps.out(HELP);
    return 0;
  }
  if (parsed.kind === "version") {
    deps.out(VERSION);
    return 0;
  }
  if (parsed.kind === "mcp") {
    await deps.startServer();
    return 0;
  }

  try {
    return await dispatch(parsed, deps);
  } catch (error) {
    deps.err(operatorErrorMessage(error));
    return 1;
  }
}

type DispatchKind = Exclude<Parsed["kind"], "help" | "version" | "mcp">;

async function dispatch(parsed: Extract<Parsed, { kind: DispatchKind }>, deps: CliDeps): Promise<number> {
  const emit = (raw: unknown, render: () => string, json: boolean): number => {
    deps.out(json ? JSON.stringify(raw, null, 2) : render());
    return 0;
  };

  switch (parsed.kind) {
    case "status": {
      const c = deps.makeClient(parsed.instance);
      const r = await c.get("/control/status");
      return emit(r, () => renderStatus(r), parsed.json);
    }
    case "stats": {
      const c = deps.makeClient(parsed.instance);
      const r = await c.get("/control/stats");
      return emit(r, () => renderStats(r), parsed.json);
    }
    case "querylog": {
      const c = deps.makeClient(parsed.instance);
      const params = new URLSearchParams();
      params.set("limit", String(parsed.limit));
      if (parsed.blockedOnly) for (const reason of BLOCKED_REASONS) params.append("reason", reason);
      const searchTerms: string[] = [];
      if (parsed.client) searchTerms.push(parsed.client);
      if (parsed.domain) searchTerms.push(parsed.domain);
      if (searchTerms.length) params.set("search", searchTerms.join(" "));
      const r = await c.get(`/control/querylog?${params.toString()}`);
      return emit(r, () => renderQuerylog(r), parsed.json);
    }
    case "check-host": {
      const c = deps.makeClient(parsed.instance);
      const params = new URLSearchParams({ name: parsed.host });
      if (parsed.client) params.set("client", parsed.client);
      if (parsed.qtype) params.set("qtype", parsed.qtype);
      const r = await c.get(`/control/filtering/check_host?${params.toString()}`);
      return emit(r, () => renderCheckHost(r), parsed.json);
    }
    case "clients-list": {
      const c = deps.makeClient(parsed.instance);
      const r = await c.get("/control/clients");
      return emit(r, () => renderClients(r), parsed.json);
    }
    case "rules-list": {
      const c = deps.makeClient(parsed.instance);
      const status = await c.get<{ user_rules?: string[] }>("/control/filtering/status");
      const r = { rules: status.user_rules ?? [] };
      return emit(r, () => renderRules(r), parsed.json);
    }
    case "filters-list": {
      const c = deps.makeClient(parsed.instance);
      const r = await c.get("/control/filtering/status");
      return emit(r, () => renderFilters(r), parsed.json);
    }
    case "blocked-services-list": {
      const c = deps.makeClient(parsed.instance);
      const r = await c.get("/control/blocked_services/get");
      return emit(r, () => renderBlockedServices(r), parsed.json);
    }
    case "blocked-services-catalog": {
      const c = deps.makeClient(parsed.instance);
      const r = await c.get("/control/blocked_services/all");
      return emit(r, () => renderBlockedServicesCatalog(r), parsed.json);
    }
    case "rewrites-list": {
      const c = deps.makeClient(parsed.instance);
      const r = await c.get("/control/rewrite/list");
      return emit(r, () => renderRewrites(r), parsed.json);
    }
    case "rewrites-settings": {
      const c = deps.makeClient(parsed.instance);
      const r = await c.get("/control/rewrite/settings");
      return emit(r, () => renderRewriteSettings(r), parsed.json);
    }
    case "dns-config": {
      const c = deps.makeClient(parsed.instance);
      const r = await c.get("/control/dns_info");
      return emit(r, () => renderDnsConfig(r), parsed.json);
    }
    case "safesearch": {
      const c = deps.makeClient(parsed.instance);
      const r = await c.get("/control/safesearch/status");
      return emit(r, () => renderSafesearch(r), parsed.json);
    }
    case "access-list": {
      const c = deps.makeClient(parsed.instance);
      const r = await c.get("/control/access/list");
      return emit(r, () => renderAccessList(r), parsed.json);
    }
    case "querylog-config": {
      const c = deps.makeClient(parsed.instance);
      const r = await c.get("/control/querylog/config");
      return emit(r, () => renderKeyVals(r), parsed.json);
    }
    case "stats-config": {
      const c = deps.makeClient(parsed.instance);
      const r = await c.get("/control/stats/config");
      return emit(r, () => renderKeyVals(r), parsed.json);
    }
    case "dhcp-status": {
      const c = deps.makeClient(parsed.instance);
      const r = await c.get("/control/dhcp/status");
      return emit(r, () => renderDhcpStatus(r), parsed.json);
    }
    case "dhcp-interfaces": {
      const c = deps.makeClient(parsed.instance);
      const r = await c.get("/control/dhcp/interfaces");
      return emit(r, () => renderDhcpInterfaces(r), parsed.json);
    }
    case "tls-status": {
      const c = deps.makeClient(parsed.instance);
      const raw = await c.get("/control/tls/status");
      const r = redactTlsSecrets(raw);
      return emit(r, () => renderTlsStatus(r), parsed.json);
    }
    case "sync-status": {
      const c = deps.makeSyncClient();
      const r = await c.get("/api/v1/status");
      return emit(r, () => renderSyncStatus(r), parsed.json);
    }
    case "sync-health": {
      const c = deps.makeSyncClient();
      const r = await c.head("/healthz");
      deps.out(parsed.json ? JSON.stringify(r, null, 2) : `healthy: ${r.ok}`);
      return r.ok ? 0 : 1;
    }
    case "sync-logs": {
      const c = deps.makeSyncClient();
      const logs = await c.get<string>("/api/v1/logs");
      const r = { logs };
      deps.out(parsed.json ? JSON.stringify(r, null, 2) : String(logs ?? ""));
      return 0;
    }
  }
}

// True when this module is the process entrypoint. process.argv[1] is often a
// symlink (npm installs the bin as a link); resolve it before comparing.
const isEntrypoint = (() => {
  const arg = process.argv[1];
  if (typeof arg !== "string") return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(arg)).href;
  } catch {
    return false;
  }
})();

if (isEntrypoint) {
  const env = process.env;
  run(process.argv.slice(2), {
    out: (s) => process.stdout.write(`${s}\n`),
    err: (s) => process.stderr.write(`${s}\n`),
    makeClient: (instance) => new AdGuardClient(getInstanceConfig(resolveInstances(env), instance)),
    makeSyncClient: () => new AdGuardSyncClient(getSyncConfig(resolveSyncConfig(env))),
    startServer: async () => {
      const { startServer } = await import("./mcp-server.ts");
      await startServer();
    },
  })
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      process.stderr.write(`${operatorErrorMessage(error)}\n`);
      process.exitCode = 1;
    });
}
