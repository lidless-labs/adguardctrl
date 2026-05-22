<!-- content-guard: allow private-ipv4 file -->
# adguard-mcp Design

A Model Context Protocol server that lets AI agents drive AdGuard Home instances over the documented REST API. Lets Claude (and any other MCP-compatible agent) read status/stats/query log and manage user rules, filter list subscriptions, and per-client blocked services across one or more local AdGuard Home boxes.

Mirrors the published pattern of `solomonneas/postiz-mcp`, `solomonneas/jellyfin-mcp`, and `solomonneas/n8n-ops-mcp`: TypeScript, tsup bundler, three-tier write gating, dual publish to npm + ClawHub, five-client README.

## Problem

AdGuard Home runs on the home network (one instance at 192.168.1.10 and a second instance at 192.168.1.11). Day-to-day touchpoints are infrequent but repetitive: add a `@@||t.co^` allow exception when a service breaks, audit recent sinkholes after a job-site fails to load, block youtube on a specific client for an evening, subscribe a new filter list. Each of these requires the operator to open the AdGuard web UI on each instance, click through the same flows by hand, and remember to mirror the change across both boxes when the rule should apply everywhere.

There is no agent-driven surface today. Claude cannot answer "block youtube on the family laptop tonight" or "show me the most-blocked domains in the last 6 hours" without the operator copy-pasting from the UI. There is also no programmatic way to enforce a write-safety policy beyond user discipline: a single mis-click in the UI can disable filtering globally.

## Goal

Ship an MCP server that:

- Exposes 15 tools across read / safe-write / destructive tiers
- Targets one or more AdGuard Home instances via per-instance `<INSTANCE>_URL` / `<INSTANCE>_USERNAME` / `<INSTANCE>_PASSWORD` env vars
- Defaults to a `primary` instance, accepts an explicit `instance: "<name>"` arg on every tool to address a different box
- Gates every write behind an explicit `confirm: true` arg; gates every destructive write behind `confirm: true` + `destructive: true`
- Redacts credentials from all logs and error responses
- Ships as a single npx-runnable binary, dual-published to npm and ClawHub
- Documents setup for Claude Desktop, Claude Code, OpenClaw, Hermes Agent, and Codex CLI

## Non-goals

- DHCP server management. AdGuard can run a DHCP server; we are not driving it in v1.
- DNS rewrites (custom A/CNAME records). Same surface, separate scope.
- Service-discovery via mDNS / Avahi.
- Exporting / importing the full AdGuard config as a file. The web UI already does this; agents do not need a tool for it.
- Multi-tenant / multi-user. Each MCP process speaks for a single operator with one set of credentials per instance.
- Auto-discovery of instances on the LAN. Instances are declared in env. New instances mean a new env block, not auto-detection.

## Architecture

```
~/repos/adguard-mcp/
├── src/
│   ├── adguard-client.ts     # HTTP basic-auth client, per-instance, returns typed responses
│   ├── config.ts             # .env parse, resolve named instances, validate required fields
│   ├── security.ts           # credential redaction for logs + error envelopes
│   ├── gates.ts              # 3-tier check + confirm/destructive arg validation
│   ├── tools/
│   │   ├── adguard_status.ts
│   │   ├── adguard_stats.ts
│   │   ├── adguard_query_log.ts
│   │   ├── adguard_list_filter_lists.ts
│   │   ├── adguard_list_user_rules.ts
│   │   ├── adguard_list_clients.ts
│   │   ├── adguard_list_blocked_services_catalog.ts
│   │   ├── adguard_add_user_rule.ts
│   │   ├── adguard_remove_user_rule.ts
│   │   ├── adguard_add_filter_list.ts
│   │   ├── adguard_remove_filter_list.ts
│   │   ├── adguard_toggle_filter_list.ts
│   │   ├── adguard_set_client_blocked_services.ts
│   │   ├── adguard_replace_user_rules.ts
│   │   └── adguard_toggle_protection.ts
│   └── index.ts              # tool registry export
├── mcp-server.ts             # MCP stdio server: register tools, route requests
├── index.ts                  # npx entry point: load config, start mcp-server
├── openclaw.plugin.json      # OpenClaw plugin manifest
├── tests/
│   ├── fake-adguard.ts       # in-process fake AGH HTTP server for tests
│   └── tools/<one-per-tool>.test.ts
├── docs/                     # design + plan
├── scripts/                  # publish helpers, dev runner
├── README.md                 # 5-client setup
├── package.json              # bin entry: "adguard-mcp": "./dist/index.js"
├── tsup.config.ts
├── tsconfig.json
└── .gitignore                # node_modules, dist, .env, .claude/
```

### Tool registration pattern

Each tool file exports a single object:

```typescript
export const tool = {
  name: 'adguard_status',
  description: '...',
  inputSchema: { ... },           // JSON schema for args
  handler: async (args, ctx) => { ... },
};
```

`mcp-server.ts` imports the array from `src/tools/index.ts` and registers them with the MCP SDK. No magic loaders; explicit list to keep tree-shaking honest.

### Multi-instance resolution

`src/config.ts` reads env once at startup:

```
ADGUARD_PRIMARY_URL=http://192.168.1.10
ADGUARD_PRIMARY_USERNAME=admin
ADGUARD_PRIMARY_PASSWORD=<set in .env>

ADGUARD_SECONDARY_URL=http://192.168.1.11        (optional)
ADGUARD_SECONDARY_USERNAME=<set in .env>
ADGUARD_SECONDARY_PASSWORD=<set in .env>

ADGUARD_DEFAULT_INSTANCE=primary                  (optional; default "primary")
```

Tools accept an optional `instance?: string` arg. Resolution order: arg value → `ADGUARD_DEFAULT_INSTANCE` → `"primary"`. Unknown instance returns a typed error from `gates.ts` (not from the AGH client - we don't want a confusing fetch error). At least one instance must be configured at startup or the server refuses to launch with a clear "no instances configured" error.

Adding a third instance is two lines in `.env` + a server restart. No code change needed - the config reader scans for `ADGUARD_<NAME>_URL` patterns.

### Tool tier definitions (15 tools)

**Tier 1 (read, always allowed):**

| Tool | Description | AGH endpoint |
|---|---|---|
| `adguard_status` | server uptime, version, protection_enabled, DNS port, top-level health | `GET /control/status` |
| `adguard_stats` | 24h DNS query stats with top blocked + top clients | `GET /control/stats` |
| `adguard_query_log` | recent DNS queries, filterable by client / domain / blocked-only / response-status | `GET /control/querylog?...` |
| `adguard_list_filter_lists` | subscribed filter lists with enabled state and rule counts | `GET /control/filtering/status` |
| `adguard_list_user_rules` | the custom rules block (`@@||t.co^`, `||badsite.com^`, etc) | `GET /control/filtering/status` |
| `adguard_list_clients` | configured clients with their per-client blocked services + tags | `GET /control/clients` |
| `adguard_list_blocked_services_catalog` | the catalog of services AGH can block per client (youtube, instagram, tiktok, ...) | `GET /control/blocked_services/services` |

**Tier 2 (safe-write, requires `confirm: true`):**

| Tool | Description | AGH endpoint |
|---|---|---|
| `adguard_add_user_rule` | append a rule to the user rules block | mutate via `GET /control/filtering/status` + `POST /control/filtering/set_rules` |
| `adguard_remove_user_rule` | remove a rule by exact-string match | same |
| `adguard_add_filter_list` | subscribe to a new filter list URL | `POST /control/filtering/add_url` |
| `adguard_remove_filter_list` | unsubscribe a list by URL | `POST /control/filtering/remove_url` |
| `adguard_toggle_filter_list` | enable / disable a subscribed list by URL | `POST /control/filtering/set_url` |
| `adguard_set_client_blocked_services` | per-client youtube/tiktok/etc block list | `POST /control/clients/update` |

**Tier 3 (destructive, requires `confirm: true` + `destructive: true`):**

| Tool | Description | AGH endpoint |
|---|---|---|
| `adguard_replace_user_rules` | replace the entire user-rules block (loses existing rules) | `POST /control/filtering/set_rules` |
| `adguard_toggle_protection` | enable / disable filtering globally (DNS still resolves but no blocking) | `POST /control/protection` |

### Auth

HTTP Basic auth on every API call. Username / password from env per instance. The AdGuard Home REST API accepts Basic on all `/control/*` endpoints; no separate `/control/login` session flow needed for an MCP context. Failed auth surfaces as a typed error from `adguard-client.ts` with no credential bleed.

### Write gating contract

`gates.ts` exports two predicates:

```typescript
assertConfirmedWrite(args, toolName);       // throws unless args.confirm === true
assertDestructive(args, toolName);          // throws unless args.confirm === true && args.destructive === true
```

Every Tier 2 tool calls `assertConfirmedWrite` at the top of its handler. Every Tier 3 tool calls `assertDestructive`. Both predicates throw a structured `WriteGateError` whose message names the tool and the missing args, with no leaked context.

This guarantees that the LLM cannot accidentally mutate state from a hallucinated tool call; the agent must explicitly fill in `confirm: true` (and `destructive: true` for Tier 3), which the JSON schema documents on every tool.

### Security

- Credentials only loaded into memory from `.env` at startup
- Never echoed in error messages
- `security.ts` exports a `redact(value: unknown): unknown` deep-walker that masks anything matching a known credential string before it leaves the process boundary (stderr logging, MCP error responses, tool outputs)
- No persistence layer; no on-disk cache; no secret-derived filenames

### Error handling

- AGH 4xx → typed `AdGuardClientError` with status + sanitized message; bubble to MCP error response
- AGH 5xx / network → retry once after 1s, then fail with `AdGuardUnreachableError`
- Schema validation failure on input → MCP-standard validation error
- Write gate failure → `WriteGateError` (typed, distinct from input validation)

### Testing

- `tests/fake-adguard.ts`: an in-process Node `http.Server` that listens on a random port and serves canned AGH responses keyed by URL + method. Tests start it once per file (or once per test) and tear down after.
- Per-tool tests: each tool gets a `tests/tools/<tool>.test.ts` that builds a fake response, invokes the tool's handler, asserts the request the fake server saw and the response the tool produced.
- Gates tests: prove `assertConfirmedWrite` and `assertDestructive` throw on missing flags and pass through on valid input.
- Config tests: prove unknown instance names error cleanly, missing-required-env errors at server-start, multi-instance resolution works.
- Smoke test that boots `mcp-server.ts` against the fake, lists tools via the MCP SDK, calls one read + one gated write + one destructive call, validates the full path.

Target: ~30-40 tests. All hermetic (no network). Fake-server capture pattern matches the user's `[[mcp-tool-handler-test-pattern]]`.

## Publish + deploy

- npm publish under `solomonneas/adguard-mcp` (scoped name pending check; fall back to `adguard-mcp-solomonneas` if conflicting).
- ClawHub publish via `npx clawhub package publish` per `[[clawhub-cli-publish-flow]]`.
- Auto-redeploy cron extends `~/bin/repo-redeploy.sh` per `[[repo-redeploy-system]]` so commits go live across both target machines within 10 minutes.
- Pre-publish: `pnpm e2e:local` (or `npm test`) passes, `npm run build` produces clean dist, semver bumped.

## Setup for the user (operator-owned)

Build-but-don't-flip per `[[feedback-build-but-dont-flip-preference]]`. The PR ships the code + docs + tests, but does NOT:

- Set the AdGuard env vars in `~/.openclaw/workspace/.env`
- Register the MCP with Claude Code / OpenClaw / Codex CLI configs
- Run any live tool against the actual AGH instances

Operator follow-up after merge:

1. Set `ADGUARD_PRIMARY_URL`, `ADGUARD_PRIMARY_USERNAME`, `ADGUARD_PRIMARY_PASSWORD` (and optionally the SECONDARY variants) in `~/.openclaw/workspace/.env`.
2. Add the MCP to whichever client(s) you want to use it from. README shows the exact JSON snippet for each of the five clients.
3. Run a smoke: `adguard_status` from Claude Code with `instance: "primary"` to confirm auth works. Then `adguard_query_log` with `blocked_only: true, limit: 10` to confirm reads. Skip writes until reads are green.

## Acceptance criteria

1. `npm test` runs hermetic suite green (no network calls to real AGH).
2. `npm run build` produces a `dist/index.js` that runs under `node dist/index.js` and starts an MCP stdio server.
3. `mcp-server.ts` advertises all 15 tools when queried with `tools/list`.
4. Each Tier 2 tool rejects calls missing `confirm: true` with a `WriteGateError`.
5. Each Tier 3 tool rejects calls missing `destructive: true` even when `confirm: true` is present.
6. `adguard-client.ts` redacts credentials from any error path; a synthetic 401 from the fake server does NOT leak the basic-auth header into the test assertion's captured error.
7. Multi-instance: a tool call with `instance: "secondary"` against a config that has only `primary` returns a `UnknownInstanceError` (NOT a fetch error).
8. README contains setup blocks for all 5 clients (Claude Desktop, Claude Code, OpenClaw, Hermes Agent, Codex CLI).
9. `openclaw.plugin.json` validates against the OpenClaw plugin schema and loads cleanly under `openclaw plugin list` with `activation.onStartup: true`.
10. `npm pack` produces a tarball under 1 MB (no accidental `.claude/` or `node_modules/` inclusion).

## Out of scope, captured

- DHCP management surface.
- DNS rewrite management.
- Tag-based bulk client operations.
- Filter list curation (suggesting good lists).
- Audit log / change history beyond AGH's built-in query log.
- A CLI surface in addition to the MCP. If we want one, wrap the same `adguard-client.ts` library in a `bin/adguard` later. v1 ships MCP only.
