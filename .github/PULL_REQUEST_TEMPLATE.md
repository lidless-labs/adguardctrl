<!--
Thanks for sending a patch. Keep this short; delete sections that do not apply.
See CONTRIBUTING.md for what lands easily and what needs an issue first.
-->

## What and why

<!-- One or two sentences on the user-visible change and the problem it solves. -->

Closes #

## Type of change

- [ ] Bug fix
- [ ] New tool / argument
- [ ] Docs
- [ ] Refactor with no tool-surface change
- [ ] Write-tier or public-surface change (tier move, env-var rename, argument rename) — opened an issue first per CONTRIBUTING.md

## Checklist

- [ ] `./scripts/verify` passes locally (`npm run typecheck`, `npm test`, `npm run build`)
- [ ] Added or updated tests covering the change (suite mocks `fetch`; no live AdGuard Home calls)
- [ ] Any new write or destructive tool calls its gate (`assertConfirmedWrite` / `assertDestructive`) before its network request
- [ ] Updated the `Unreleased` section of `CHANGELOG.md` for any user-visible effect
- [ ] README tool counts and tier lists stay in sync with `buildAllTools()`
- [ ] No personal details, real hostnames, real AdGuard Home URLs, credentials, or unredacted absolute paths in code, tests, docs, or this PR (the `content-guard` hook will fail otherwise)
- [ ] Conventional commit messages, no AI co-authorship trailers
