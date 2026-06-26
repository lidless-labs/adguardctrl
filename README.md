<!-- content-guard: allow private-ipv4 file -->
<h1 align="center">adguard-mcp</h1>

<p align="center">
  <strong>An MCP server that puts AdGuard Home DNS filtering in front of your AI client, with a three-tier write gate so the model can read freely but cannot disable protection or wipe your rules on a hallucinated call.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/@solomonneas/adguard-mcp?style=for-the-badge&label=npm" alt="npm version">
  <img src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge" alt="MIT license">
  <img src="https://img.shields.io/badge/MCP-server-8A2BE2?style=for-the-badge" alt="MCP server">
  <img src="https://img.shields.io/badge/status-WIP-orange?style=for-the-badge" alt="Work in progress">
</p>

<p align="center">
  <a href="https://lidless.dev/adguard-mcp"><strong>Website</strong></a>
</p>

adguard-mcp is an MCP server for AdGuard Home, the self-hosted DNS sinkhole. It exists so you can inspect and tune network-wide DNS filtering from an AI assistant instead of clicking through a web dashboard across every box. What sets it apart from a raw HTTP wrapper is a three-tier write gate: reads are open, writes require an explicit `confirm: true`, and destructive operations additionally require `destructive: true`, so an agent cannot turn off filtering or overwrite the rules block by accident.

## What it does

adguard-mcp is an open-source MCP server for AdGuard Home that exposes DNS-filtering control to any Model Context Protocol client (Claude Desktop, Claude Code, Codex CLI, OpenClaw, Hermes). It speaks the AdGuard Home API across one or more instances, plus optional AdGuardHome Sync status and control, and surfaces 33 tools split into three gating tiers: 14 reads, 13 safe writes, and 6 destructive operations. Reads cover server status, stats, the DNS query log, filter lists, named clients, and a `check_host` lookup that shows exactly what AdGuard would do with a hostname. Writes manage user rules, filter-list subscriptions, per-client blocked services, SafeSearch, SafeBrowsing, and global protection, each behind the gate. It is built for homelab operators running one or several AdGuard Home boxes who want to query and adjust DNS filtering from an assistant without handing it an unguarded admin API.

## Tools

**Reads (14):** `adguard_status`, `adguard_stats`, `adguard_query_log`, `adguard_list_filter_lists`, `adguard_list_user_rules`, `adguard_list_clients`, `adguard_list_blocked_services_catalog`, `adguard_check_host`, `adguard_get_blocked_services`, `adguard_get_dns_config`, `adguard_get_safesearch_settings`, `adguard_sync_status`, `adguard_sync_health`, `adguard_sync_logs`.

| Tool | Description |
|---|---|
| `adguard_status` | Server status + protection state (`GET /control/status`). |
| `adguard_stats` | Stats window: top queries, blocked counts, clients (`GET /control/stats`). |
| `adguard_query_log` | DNS query log slice with filters (`GET /control/querylog`). |
| `adguard_list_filter_lists` | Subscribed blocklists + allowlists (`GET /control/filtering/status`). |
| `adguard_list_user_rules` | Custom user rules (`GET /control/filtering/status`). |
| `adguard_list_clients` | Configured named clients (`GET /control/clients`). |
| `adguard_list_blocked_services_catalog` | Available service IDs to block (`GET /control/blocked_services/services`). |
| `adguard_check_host` | Test what AGH would do with a hostname: filter decision, matched rules, CNAME chain, IPs (`GET /control/filtering/check_host`). |
| `adguard_get_blocked_services` | Global blocked-services list + weekly schedule (`GET /control/blocked_services/get`). |
| `adguard_get_dns_config` | DNS upstreams, bootstrap, cache, parallel resolution, blocking mode (`GET /control/dns_info`). |
| `adguard_get_safesearch_settings` | SafeSearch enabled state + per-engine flags (`GET /control/safesearch/status`). |
| `adguard_sync_status` | AdGuardHome Sync origin/replica status (`GET /api/v1/status`). |
| `adguard_sync_health` | AdGuardHome Sync health check (`HEAD /healthz`). |
| `adguard_sync_logs` | AdGuardHome Sync in-memory logs (`GET /api/v1/logs`). |

**Safe writes (13, require `confirm: true`):** `adguard_add_user_rule`, `adguard_remove_user_rule`, `adguard_add_filter_list`, `adguard_remove_filter_list`, `adguard_toggle_filter_list`, `adguard_set_client_blocked_services`, `adguard_refresh_filter_lists`, `adguard_add_client`, `adguard_update_client`, `adguard_set_blocked_services`, `adguard_toggle_safesearch`, `adguard_toggle_safebrowsing`, `adguard_sync_run`.

| Tool | Description |
|---|---|
| `adguard_add_user_rule` | Append a single user filter rule (`POST /control/filtering/set_rules`). |
| `adguard_remove_user_rule` | Remove a single user filter rule by exact match (`POST /control/filtering/set_rules`). |
| `adguard_add_filter_list` | Subscribe to a new blocklist or allowlist URL (`POST /control/filtering/add_url`). |
| `adguard_remove_filter_list` | Unsubscribe from a filter list by URL (`POST /control/filtering/remove_url`). |
| `adguard_toggle_filter_list` | Enable or disable a subscribed filter list (`POST /control/filtering/set_url`). |
| `adguard_set_client_blocked_services` | Set per-client blocked services + schedule (`POST /control/clients/update`). |
| `adguard_refresh_filter_lists` | Force refresh subscribed filter lists immediately (`POST /control/filtering/refresh`). |
| `adguard_add_client` | Register a new named client with per-client settings (`POST /control/clients/add`). |
| `adguard_update_client` | Full update for an existing named client; body is nested `{name, data}` (`POST /control/clients/update`). |
| `adguard_set_blocked_services` | Set GLOBAL blocked services + optional weekly schedule; accepts HH:MM strings or ms (`PUT /control/blocked_services/update`). |
| `adguard_toggle_safesearch` | Enable or disable SafeSearch globally with per-engine flags (`PUT /control/safesearch/settings`). |
| `adguard_toggle_safebrowsing` | Enable or disable AGH SafeBrowsing (`POST /control/safebrowsing/enable` or `/disable`). |
| `adguard_sync_run` | Trigger AdGuardHome Sync immediately (`POST /api/v1/sync`). |

**Destructive (6, require `confirm: true` + `destructive: true`):** `adguard_replace_user_rules`, `adguard_toggle_protection`, `adguard_delete_client`, `adguard_clear_query_log`, `adguard_reset_stats`, `adguard_sync_clear_logs`.

| Tool | Description |
|---|---|
| `adguard_replace_user_rules` | Wholesale replace the user rules block (`POST /control/filtering/set_rules`). |
| `adguard_toggle_protection` | Enable or disable global filtering; off stops ALL blocking (`POST /control/protection`). |
| `adguard_delete_client` | Remove a configured named client; per-client rules and stats are lost (`POST /control/clients/delete`). |
| `adguard_clear_query_log` | Wipe the DNS query log (`POST /control/querylog_clear`). |
| `adguard_reset_stats` | Zero the stats window (`POST /control/stats_reset`). |
| `adguard_sync_clear_logs` | Clear AdGuardHome Sync in-memory logs (`POST /api/v1/clear-logs`). |

## Quickstart

Install globally:

```
npm install -g @solomonneas/adguard-mcp
```

Or run via npx with no install:

```
npx -y @solomonneas/adguard-mcp
```

Then wire it into an MCP client. The minimal config for any client that speaks the standard `mcpServers` shape (Claude Desktop, Claude Code):

```json
{
  "mcpServers": {
    "adguard": {
      "command": "npx",
      "args": ["-y", "@solomonneas/adguard-mcp"],
      "env": {
        "ADGUARD_PRIMARY_URL": "http://192.0.2.10",
        "ADGUARD_PRIMARY_USERNAME": "admin",
        "ADGUARD_PRIMARY_PASSWORD": "your-password"
      }
    }
  }
}
```

Once connected, ask your client to call `adguard_status` to confirm it can reach the box. Reads work immediately; writes need the `confirm: true` flag and destructive ops also need `destructive: true`.

## Configuration

Set per-instance env vars. At least one instance is required.

```
ADGUARD_PRIMARY_URL=http://192.0.2.10
ADGUARD_PRIMARY_USERNAME=admin
ADGUARD_PRIMARY_PASSWORD=<password>

# Optional second instance:
ADGUARD_SECONDARY_URL=http://192.0.2.11
ADGUARD_SECONDARY_USERNAME=admin
ADGUARD_SECONDARY_PASSWORD=<password>

# Optional: which instance is default when a tool omits the `instance` arg:
ADGUARD_DEFAULT_INSTANCE=primary
```

Instance names are derived from the env-var middle segment (case-insensitive). Add `ADGUARD_LIVINGROOM_URL/USERNAME/PASSWORD` and the MCP picks it up on next start.

Every tool accepts optional `instance: "<name>"` to address a non-default box.

AdGuardHome Sync is optional and uses a separate env prefix so it does not collide with AdGuard Home instance names:

```
ADGUARDHOME_SYNC_URL=http://192.0.2.10:8080

# Optional, only when the Sync API is configured with Basic auth:
ADGUARDHOME_SYNC_USERNAME=sync
ADGUARDHOME_SYNC_PASSWORD=<password>
```

`ADGUARD_SYNC_URL/USERNAME/PASSWORD` is also accepted as an alias and is reserved for the Sync server, not an AdGuard Home instance named `sync`.

If neither Sync URL env var is set, Sync tools remain listed but return a clear config error when called.

## Setup per client

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows): use the `mcpServers` block from [Quickstart](#quickstart).

### Claude Code

```bash
claude mcp add adguard -s user -- npx -y @solomonneas/adguard-mcp
```

Then export env vars in your shell (`~/.bashrc`, `~/.zshrc`) or pass `--env` flags.

### OpenClaw

Plugin loads automatically once installed. Config goes in your `~/.openclaw/openclaw.json` `plugins.entries.adguard` (or use the bundled `openclaw.plugin.json`):

```json
{
  "plugins": {
    "entries": {
      "adguard": {
        "package": "@solomonneas/adguard-mcp",
        "activation": { "onStartup": true }
      }
    }
  }
}
```

Env vars from `~/.openclaw/workspace/.env` are inherited by the plugin.

### Hermes Agent

Add to `~/.config/hermes/agents.yaml`:

```yaml
mcp_servers:
  adguard:
    command: npx
    args: ["-y", "@solomonneas/adguard-mcp"]
    env:
      ADGUARD_PRIMARY_URL: http://192.0.2.10
      ADGUARD_PRIMARY_USERNAME: admin
      ADGUARD_PRIMARY_PASSWORD: your-password
```

### Codex CLI

`~/.codex/config.toml`:

```toml
[mcp_servers.adguard]
command = "npx"
args = ["-y", "@solomonneas/adguard-mcp"]

[mcp_servers.adguard.env]
ADGUARD_PRIMARY_URL = "http://192.0.2.10"
ADGUARD_PRIMARY_USERNAME = "admin"
ADGUARD_PRIMARY_PASSWORD = "your-password"
```

## Safety

- Credentials only live in memory after env-load and are redacted from logs and error messages.
- Tier 2 writes require an explicit `confirm: true` arg; the JSON schema documents this on every write tool.
- Tier 3 destructive ops additionally require `destructive: true`. The model cannot disable protection or overwrite the rules block from a hallucinated tool call.

## Why not just give the agent the AdGuard Home API?

- **The raw AdGuard Home API has no agent-safety layer.** Every endpoint is one call away, including the ones that disable all blocking or wipe your rules. adguard-mcp keeps reads open and gates writes behind `confirm: true` and destructive ops behind `destructive: true`, so a hallucinated tool call cannot silently break your network.
- **`curl` or a generic HTTP MCP server** would mean the model hand-builds request bodies, handles Basic auth, and remembers which AdGuard quirk applies (the nested `{name, data}` client body, milliseconds-from-midnight schedules, the `PUT` vs `POST` split). adguard-mcp encodes those as typed tools with descriptions, so the model picks an intent, not an HTTP shape.
- **A single-instance integration** does not match a real homelab. adguard-mcp resolves any number of instances from env vars by name and lets every tool target a non-default box with one `instance` arg, plus optional AdGuardHome Sync control alongside.
- **Clicking the web dashboard** works, but not from inside an assistant and not across several boxes at once. This is the same control surface, available to the agent you already have open.

## What adguard-mcp is not

adguard-mcp is not a hosted service, a replacement for the AdGuard Home dashboard, or an autonomous network manager.

It does not:

- run a daemon, scheduler, or background process
- store or proxy your DNS traffic
- make any write without an explicit `confirm: true` flag from the caller
- perform a destructive operation without `confirm: true` and `destructive: true` together
- talk to AdGuard's hosted DNS product; it targets self-hosted AdGuard Home instances you run

## License

MIT. See [LICENSE](LICENSE).
