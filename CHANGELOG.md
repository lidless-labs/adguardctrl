# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- README rewritten to lead with what / why / how-it-differs, a centered title and one-liner, npm / license / MCP badges, and a Website link. Added a "What it does" overview with the verified 33-tool count (14 reads / 13 safe writes / 6 destructive), a copy-paste MCP client config, a "Why not just give the agent the AdGuard Home API?" section, and a "What adguard-mcp is not" boundaries section. Documentation IPs normalized to RFC 5737 (`192.0.2.x`).

### Added
- Maintainer-health files: `SECURITY.md` (vulnerability reporting, the live-DNS-filter threat model, in/out-of-scope), `CONTRIBUTING.md` (support scope, the write-tier contract, how to add a tool), `CODE_OF_CONDUCT.md`, GitHub issue templates (`bug.yml`, `feature.yml`, `config.yml` with blank issues disabled and contact links), and a pull-request template with a no-PII / content-guard checkbox.
