# Security Policy

## Supported versions

adguard-mcp is work in progress. Only the latest published release on the `master` branch receives security fixes. Pin to a released version if you need a known-good build.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security problems. Email **me@solomonneas.dev** with: <!-- content-guard: allow pii/email -->

- A short description of the issue.
- Steps to reproduce (or a minimal proof of concept).
- The version or commit you tested against.
- Whether you would like to be credited in the release notes.

You should get an acknowledgment within 72 hours. If you do not, please follow up - the mail may have been filtered.

## This server controls a live DNS filter

adguard-mcp speaks the AdGuard Home admin API. A call can change what your whole network can resolve, disable filtering, or delete configured clients. The design assumes the AI client on the other end is not fully trusted, which is why the write tiers exist.

- **Reads** need no flag.
- **Safe writes** require an explicit `confirm: true` argument from the caller.
- **Destructive operations** additionally require `destructive: true`. The gate is enforced in code (`assertConfirmedWrite`, `assertDestructive`) before any network request, so a write cannot fire from a default-shaped tool call.

Treat the credentials you put in the env vars as full admin credentials for each AdGuard Home box. Anything that can read the process environment can use them.

## In scope

- A write or destructive tool that fires its network request without its required gate flag.
- Credential leakage: an AdGuard Home password, Basic auth header, or Sync credential appearing in a tool result, log line, or error message (the redaction layer in `src/security.ts` should catch these).
- A tool that forwards gate-only fields (`instance`, `confirm`, `destructive`) into an AdGuard Home request body where they could have an unintended effect.
- Schema or validation flaws that let a malformed argument reach the AdGuard Home API unchecked.

## Out of scope

- Vulnerabilities in AdGuard Home, AdGuardHome Sync, or the MCP SDK themselves. Report those to their respective projects.
- Issues that require an attacker to already read the process environment or the MCP client's config (where the credentials live).
- Running a destructive tool on purpose with both gate flags set. That is the documented contract, not a bug.
- A misconfigured AdGuard Home instance reachable without authentication. Secure the box; this server only relays your credentials.

## Disclosure

We aim to ship a fix within 14 days of confirming a valid report. A coordinated disclosure timeline can be negotiated for issues that need longer.
