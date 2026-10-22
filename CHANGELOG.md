# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Bumped `@lidless-labs/effect-operator-kit` to `1505318b2625fc273c51018389e2c61677e073d7`. Tool results, including error results, are now capped at 90,000 UTF-8 bytes. An oversize result is cut with a `[truncated: output was N bytes, limit is M bytes ...]` marker and carries `structuredContent: { truncated: true, ... }`. Results under the cap keep the existing content-only, 2-space JSON shape.
- `tools/list` now carries tool annotations. The 22 Tier-1 reads declare `readOnlyHint: true`; every Tier-2 write and Tier-3 destructive tool declares `destructiveHint: true`, so clients that prompt on destructive tools prompt on all of them. `buildAllTools` throws at startup if a tool has no entry in `src/tools/annotations.ts`.

### Added
- Tool annotations registry (`src/tools/annotations.ts`) built on the kit's `annotationsFromTiers` and `assertNoDrift`.
- CI workflow (`.github/workflows/ci.yml`) that runs `npm run typecheck`, `npm test`, and `npm run build` on pull requests targeting `master`.

## [0.3.2] - 2026-10-19

### Changed
- README rewritten to lead with what / why / how-it-differs, a centered title and one-liner, npm / license / MCP badges, and a Website link. Added a "What it does" overview with the verified 33-tool count (14 reads / 13 safe writes / 6 destructive), a copy-paste MCP client config, a "Why not just give the agent the AdGuard Home API?" section, and a "What adguard-mcp is not" boundaries section. Documentation IPs normalized to RFC 5737 (`192.0.2.x`).

### Added
- `ADGUARD_REQUEST_TIMEOUT_MS` env var to override per-request HTTP timeouts (default 30000ms; minimum 1000ms).
- Maintainer-health files: `SECURITY.md` (vulnerability reporting, the live-DNS-filter threat model, in/out-of-scope), `CONTRIBUTING.md` (support scope, the write-tier contract, how to add a tool), `CODE_OF_CONDUCT.md`, GitHub issue templates (`bug.yml`, `feature.yml`, `config.yml` with blank issues disabled and contact links), and a pull-request template with a no-PII / content-guard checkbox.

### Fixed
- OpenClaw plugin entry now points at the compiled `./dist/index.js`. The previous `./index.ts` entry was not in the published package, so OpenClaw and ClawHub could not load the plugin from npm.
- `@lidless-labs/effect-operator-kit` is bundled into `dist/` instead of installed from a git dependency, so installs no longer need to build it.
- The npm publish workflow and package metadata from the v0.3.1 release line are now on the default branch, and the publish job audits runtime dependencies only (`npm audit --omit=dev`).
- Refreshed the lockfile with `npm audit fix`; runtime dependencies audit clean.
