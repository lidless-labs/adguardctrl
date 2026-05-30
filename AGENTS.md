# Repository Guidance

## Project Shape
- This package is a TypeScript MCP server for AdGuard Home and AdGuardHome Sync. It exposes 33 tools across read, safe-write, and destructive tiers.
- `mcp-server.ts` is the stdio MCP entry point. `index.ts` is the OpenClaw plugin entry point. Both must register tools through `buildAllTools()` in `src/tools/index.ts`.
- Tool implementations live one per file under `src/tools/`. Keep the explicit import/export list in `src/tools/index.ts` as the canonical registration list.

## Safety Rules
- Reads do not require a gate. Tier-2 writes must call `assertConfirmedWrite(raw, NAME)` before making any network request. Tier-3 destructive tools must call `assertDestructive(raw, NAME)` before making any network request.
- Do not forward `instance`, `confirm`, `destructive`, or future gate-only fields to AdGuard Home request bodies.
- Keep credential handling in `src/security.ts` and register any derived secret forms, especially Basic auth header values, before serving tools.
- Never run tools against real AdGuard Home instances during tests or reviews unless the user explicitly asks for a live operation.
- Never run live AdGuardHome Sync actions such as `adguard_sync_run` or `adguard_sync_clear_logs` unless the user explicitly asks for a live operation.

## AdGuard API Gotchas
- `adguard_update_client` must send the nested body `{ name, data }`; it is not a flat merge.
- `adguard_set_blocked_services` uses `PUT /control/blocked_services/update`.
- `adguard_clear_query_log` uses `POST /control/querylog_clear`.
- `adguard_reset_stats` uses `POST /control/stats_reset`.
- Weekly blocked-service schedules use milliseconds from midnight. User-facing tools may accept `HH:MM` and convert with `hhmmToMs()`.

## AdGuardHome Sync API Gotchas
- Sync config uses `ADGUARDHOME_SYNC_URL` plus optional `ADGUARDHOME_SYNC_USERNAME/PASSWORD`. `ADGUARD_SYNC_URL/USERNAME/PASSWORD` is also accepted as an alias and is reserved for Sync, not for an AdGuard Home instance named `sync`.
- `/healthz` is unauthenticated upstream and should be checked with `HEAD`.
- Authenticated API routes are `/api/v1/status`, `/api/v1/logs`, `/api/v1/sync`, and `/api/v1/clear-logs` when Sync has API credentials configured.
- `adguard_sync_run` is a Tier-2 write because it pushes origin configuration to replicas. `adguard_sync_clear_logs` is Tier-3 because it deletes local Sync logs.

## Verification
- Smallest meaningful checks:
  - `npm test -- tests/<specific>.test.ts` for a targeted change.
  - `npm run typecheck` for API or type changes.
  - `npm test` before claiming broad behavior is green.
  - `npm run build` for packaging or entry-point changes.
- `npm pack --dry-run` verifies the publish payload. Expected payload is small and limited to `dist`, `openclaw.plugin.json`, `README.md`, `LICENSE`, and `package.json`.

## Documentation
- Keep README tool counts and tier lists in sync with `buildAllTools()`.
- Design docs in `docs/` are useful context, but the code and tests are the current source of truth when docs drift.
