<!-- content-guard: allow private-ipv4 file -->
# adguard-mcp

MCP server exposing AdGuard Home read/write tools across one or more instances. 28 tools (11 reads / 12 safe-writes / 5 destructive). Three-tier write gating: reads are open, writes require `confirm: true`, destructive ops require `confirm: true` + `destructive: true`.

## Tools

**Reads (11):** `adguard_status`, `adguard_stats`, `adguard_query_log`, `adguard_list_filter_lists`, `adguard_list_user_rules`, `adguard_list_clients`, `adguard_list_blocked_services_catalog`, `adguard_check_host`, `adguard_get_blocked_services`, `adguard_get_dns_config`, `adguard_get_safesearch_settings`.

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

**Safe writes (12, require `confirm: true`):** `adguard_add_user_rule`, `adguard_remove_user_rule`, `adguard_add_filter_list`, `adguard_remove_filter_list`, `adguard_toggle_filter_list`, `adguard_set_client_blocked_services`, `adguard_refresh_filter_lists`, `adguard_add_client`, `adguard_update_client`, `adguard_set_blocked_services`, `adguard_toggle_safesearch`, `adguard_toggle_safebrowsing`.

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

**Destructive (5, require `confirm: true` + `destructive: true`):** `adguard_replace_user_rules`, `adguard_toggle_protection`, `adguard_delete_client`, `adguard_clear_query_log`, `adguard_reset_stats`.

| Tool | Description |
|---|---|
| `adguard_replace_user_rules` | Wholesale replace the user rules block (`POST /control/filtering/set_rules`). |
| `adguard_toggle_protection` | Enable or disable global filtering; off stops ALL blocking (`POST /control/protection`). |
| `adguard_delete_client` | Remove a configured named client; per-client rules and stats are lost (`POST /control/clients/delete`). |
| `adguard_clear_query_log` | Wipe the DNS query log (`POST /control/querylog_clear`). |
| `adguard_reset_stats` | Zero the stats window (`POST /control/stats_reset`). |

## Configuration

Set per-instance env vars. At least one instance is required.

```
ADGUARD_PRIMARY_URL=http://192.168.1.10
ADGUARD_PRIMARY_USERNAME=admin
ADGUARD_PRIMARY_PASSWORD=<password>

# Optional second instance:
ADGUARD_SECONDARY_URL=http://192.168.1.11
ADGUARD_SECONDARY_USERNAME=admin
ADGUARD_SECONDARY_PASSWORD=<password>

# Optional: which instance is default when a tool omits the `instance` arg:
ADGUARD_DEFAULT_INSTANCE=primary
```

Instance names are derived from the env-var middle segment (case-insensitive). Add `ADGUARD_LIVINGROOM_URL/USERNAME/PASSWORD` and the MCP picks it up on next start.

Every tool accepts optional `instance: "<name>"` to address a non-default box.

## Install

```
npm install -g @solomonneas/adguard-mcp
```

Or run via npx:

```
npx -y @solomonneas/adguard-mcp
```

## Setup

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "adguard": {
      "command": "npx",
      "args": ["-y", "@solomonneas/adguard-mcp"],
      "env": {
        "ADGUARD_PRIMARY_URL": "http://192.168.1.10",
        "ADGUARD_PRIMARY_USERNAME": "admin",
        "ADGUARD_PRIMARY_PASSWORD": "your-password"
      }
    }
  }
}
```

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
      ADGUARD_PRIMARY_URL: http://192.168.1.10
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
ADGUARD_PRIMARY_URL = "http://192.168.1.10"
ADGUARD_PRIMARY_USERNAME = "admin"
ADGUARD_PRIMARY_PASSWORD = "your-password"
```

## Safety

- Credentials only live in memory after env-load and are redacted from logs and error messages.
- Tier 2 writes require an explicit `confirm: true` arg; the JSON schema documents this on every write tool.
- Tier 3 destructive ops additionally require `destructive: true`. The model cannot disable protection or overwrite the rules block from a hallucinated tool call.

## License

MIT
