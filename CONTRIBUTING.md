# Contributing to adguard-mcp

adguard-mcp is an MCP server that exposes AdGuard Home and AdGuardHome Sync control to AI clients, with a three-tier write gate in front of every change. Patches are welcome. Before you start, please skim this file so we both spend our time on the right things.

## What kinds of changes land easily

- **Bug fixes** in a tool's request shape, response parsing, the config resolver, or the redaction layer.
- **New AdGuard Home or Sync tools** that map a real endpoint, with the correct write tier and a test.
- **Sharper tool descriptions** so the model picks the right tool for an intent.
- **Test coverage** for any of the above (the suite mocks `fetch`; tools are never exercised against a live box).

## What needs a conversation first

- **A change to the write-tier model** (`assertConfirmedWrite`, `assertDestructive`) or to which tier a tool sits in. The tiers are the safety contract; moving a tool between them is a behavior change.
- **Breaking changes** to env-var names, the instance-resolution rules, or a tool's argument names. These are the public surface.
- **Anything that adds a runtime dependency.** The runtime footprint is intentionally small (the MCP SDK and a schema library), and we want to keep it that way.

## What does not land

- Personal details, hostnames, account IDs, live AdGuard Home URLs, or real credentials in code, tests, or docs. Use RFC 5737 documentation IPs (`192.0.2.x`) and placeholder names. The pre-push `content-guard` hook will block anything else.
- A write or destructive tool that issues its network request without first calling its gate (`assertConfirmedWrite` for Tier 2, `assertDestructive` for Tier 3).
- A tool that forwards `instance`, `confirm`, or `destructive` into an AdGuard Home request body. Strip gate-only fields first.
- AI-co-authorship trailers on commits (`Co-Authored-By: <model>`). Conventional commits only.

## Local dev

```bash
git clone https://github.com/lidless-labs/adguard-mcp.git
cd adguard-mcp
npm install
npm test
```

The single gate before reporting any change as done:

```bash
./scripts/verify
```

It runs `npm run typecheck`, `npm test`, and `npm run build`. Report the actual results; never claim success you did not observe.

## Adding a tool

Tools live one per file under `src/tools/`. To add one:

1. Create `src/tools/adguard_<name>.ts` exporting a `create...Tool` factory.
2. Decide the tier. A safe write must call `assertConfirmedWrite(raw, NAME)` before any network request; a destructive tool must call `assertDestructive(raw, NAME)`. Reads need no gate.
3. Register the import, the export, and the `buildAllTools()` entry in `src/tools/index.ts`. That function is the single source of truth for both the MCP stdio entry (`mcp-server.ts`) and the OpenClaw plugin entry (`index.ts`).
4. Add a test under `tests/` that mocks `fetch` and asserts the gate behavior.
5. Update the tool count and the relevant tier list in `README.md`.

Never invent endpoints or API facts. Verify against the AdGuard Home API and the existing client code before citing them.

## Filing issues

Please use the templates under `.github/ISSUE_TEMPLATE/`. Before posting any output, remove tokens, real hostnames, real AdGuard Home URLs, and unredacted absolute paths. A clear repro against documentation IPs is the most useful report.

## License

By contributing you agree that your contribution is licensed under the MIT License, same as the rest of the repo.
