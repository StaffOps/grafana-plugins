# Changelog

All notable changes to this repository are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html),
and commit messages follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

Each plugin is versioned independently and keeps its own changelog:

- [staffops-servicemap-panel](packages/staffops-servicemap-panel/CHANGELOG.md)
- [staffops-aigent-squad-chat-app](packages/staffops-aigent-squad-chat-app/CHANGELOG.md)

This file summarises repository-level changes and the tagged releases. A `v*` tag publishes the
unsigned `staffops-servicemap-panel` build as a GitHub Release.

## [Unreleased]

### Added

- `staffops-aigent-squad-chat-app`: Grafana app plugin, a chat client for AIgent Squad through the
  Grafana LLM app (`@grafana/llm`), version 1.0.0, not yet released.
- MkDocs documentation site published to GitHub Pages.
- Backstage `catalog-info.yaml`, technology tags and TechDocs.

### Fixed

- Mermaid labels quoted for Mermaid v11 in the docs site.
- ESLint errors in `staffops-servicemap-panel`.

## [0.2.0] - 2026-07-07

### Added

- `staffops-servicemap-panel` 0.2.0: DAG service map from Tempo service-graph metrics, with health,
  animated traffic, cascade filters, node kind, zoom and pan, multi-hop drill isolation and an
  enriched node tooltip (environment, namespace, workload, cluster, service). Details in the
  [panel changelog](packages/staffops-servicemap-panel/CHANGELOG.md).
- CI (build, typecheck, lint, unit tests) and a tag-triggered release workflow at the repo root.

### Fixed

- Drilldown to Grafana Explore uses the URL schema of Grafana 11+.
- CI installs the workspace with pnpm.

[Unreleased]: https://github.com/StaffOps/grafana-plugins/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/StaffOps/grafana-plugins/releases/tag/v0.2.0
