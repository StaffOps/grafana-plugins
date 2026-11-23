# Handoff

Last updated: 2026-11-23 · Backstage docs-standard rollout · branch `main`

## State

grafana-plugins is a monorepo of frontend-only Grafana plugins, each versioned independently (see
the [README](https://github.com/StaffOps/grafana-plugins/blob/main/README.md) and
[AGENTS.md](https://github.com/StaffOps/grafana-plugins/blob/main/AGENTS.md)). Two plugins exist:
`staffops-servicemap-panel` at 0.2.0, released as tag `v0.2.0` (2026-07-07, unsigned zip), and
`staffops-aigent-squad-chat-app` at 1.0.0, merged on 2026-07-24 and not released. The Backstage
catalog marks the repo `experimental`. The latest CI runs on `main` (2026-11-18) succeed. The last
code change was on 2026-07-24; later commits only touch the Backstage catalog. No work is in progress.

## Done

- Backstage catalog, tags and TechDocs ([`01ea0a6`](https://github.com/StaffOps/grafana-plugins/commit/01ea0a6), [`2d90bd6`](https://github.com/StaffOps/grafana-plugins/commit/2d90bd6))
- Mermaid v11 label fix in the docs site ([`648c397`](https://github.com/StaffOps/grafana-plugins/commit/648c397))
- AIgent Squad Chat app plugin and the MkDocs site on GitHub Pages ([`ab6d742`](https://github.com/StaffOps/grafana-plugins/commit/ab6d742), [`9edf9c7`](https://github.com/StaffOps/grafana-plugins/commit/9edf9c7), [`a39c953`](https://github.com/StaffOps/grafana-plugins/commit/a39c953))
- Service map panel 0.2.0 and root CI/release workflows ([`ed774e4`](https://github.com/StaffOps/grafana-plugins/commit/ed774e4), [`76a0826`](https://github.com/StaffOps/grafana-plugins/commit/76a0826), [`885868a`](https://github.com/StaffOps/grafana-plugins/commit/885868a))

## In progress

- No open pull requests or issues.
- Branch `wip/servicemap-layout-health-filter`: one unmerged commit from 2026-10-06 (layout tweaks,
  health filter, layout direction option), two commits behind `main`. Check with
  `gh api repos/StaffOps/grafana-plugins/compare/main...wip/servicemap-layout-health-filter`.

## Next steps

1. Decide whether to finish or drop the `wip/servicemap-layout-health-filter` branch (suggested, inferred).
2. Release `staffops-aigent-squad-chat-app` 1.0.0; its changelog says "Unreleased" (suggested, inferred).
3. Harden the pnpm build-script allowlist so `pnpm -r build` works (a tracked follow-up in AGENTS.md).
4. Delete the merged branch `feat/aigent-squad-chat` (suggested, inferred).

## Decisions

No ADRs. Decisions live in the specs, written before code:

- `specs/monorepo-foundation/`: one monorepo, per-plugin versions
- `specs/nodegraph-servicemap/` and `specs/aigent-squad-chat/`: the two plugins

## Risks and open questions

- CI and the release workflow only build `packages/staffops-servicemap-panel`; the chat app is not
  built, linted or tested in CI.
- The release is unsigned: Grafana loads it only with `GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS`.
- Pushing `docs/` or `mkdocs.yml` to `main` deploys the public GitHub Pages site.

## How to verify

```bash
gh run list -R StaffOps/grafana-plugins -L 5
docker run --rm -v "$PWD:/w" -w /w node:22 sh -c "npm i -g pnpm@latest >/dev/null && pnpm install"
docker run --rm -v "$PWD:/w" -w /w/packages/staffops-servicemap-panel node:22 npm run test:ci
docker run --rm -v "$PWD:/w" -w /w/packages/staffops-servicemap-panel node:22 npm run build
docker run --rm -v "$PWD:/docs" -w /docs squidfunk/mkdocs-material:9.5.39 build --strict
```
