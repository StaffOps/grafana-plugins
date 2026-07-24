# Development

Everything runs through Docker — **no local Node/pnpm required**. See the pages below.

- [Building & Testing](building.md) — Docker build commands, workspace scripts, coverage
- [Creating a Plugin](creating-a-plugin.md) — scaffold a new panel or app plugin

## TL;DR

```bash
# Build one plugin (from repo root)
docker run --rm -v "$PWD:/app" -w /app node:22-slim sh -c '
  corepack enable && corepack prepare pnpm@9 --activate
  pnpm install --no-frozen-lockfile
  pnpm --filter <plugin-name> test:ci   # tests + coverage
  pnpm --filter <plugin-name> build     # production bundle
'
```

## Conventions

- **Spec-first** — add `specs/<feature>/{requirements,design,tasks}.md` before code.
- **Tests ship with code** — ≥90% line coverage, enforced in CI.
- **In-code docs in English**; standalone docs may follow the repo/user language.
- **No new dependency** when an existing one solves the problem.
