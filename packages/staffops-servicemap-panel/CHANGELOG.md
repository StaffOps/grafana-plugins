# Changelog

## Unreleased (2026-07-07 session — WIP)

Work-in-progress toward better spatial distribution of nodes on large graphs.

### Added
- `docker-compose.prod-test.yaml` at repo root — standalone Grafana (latest)
  that installs the plugin from GitHub Release (port 3001). Simulates prod-like
  setup for validation.
- `AGENTS.md` — new section "Running Grafana locally" documenting the per-plugin
  dev environment (docker-compose, .env, provisioning, hot reload).
- `README.md` — expanded "Quick start" with concrete steps to run the dev Grafana.

### Changed
- `MIN_FIT_SCALE` raised from 0.45 → 0.75 (`src/view/index.ts`). Initial load
  now shows nodes at a more readable zoom level for large graphs (32+ nodes).
  User can still zoom out further manually.

### Attempted & Reverted (not shipped)
- **Viewport-proportional spacing** — layout gaps scaled by panel width/height.
  Reverted: didn't produce visible improvement.
- **Semantic zoom** — nodes/edges/labels compensated inversely to zoom scale.
  Reverted: caused nodes to overlap into a ball at lower zoom levels.
- **Radial layout** — hub-centered concentric rings for star-topology graphs.
  Reverted: ring radius too small, all nodes collapsed into center.
- **Zoom-driven re-layout** — layout recalculated with scale factor on wheel.
  Reverted: auto-fit reset loop canceled the zoom every time.
- **Large-graph fixed scale** — skip fitView for >20 nodes, use k=0.6.
  Reverted: did not improve UX.

### Still TODO (goal not yet reached)
- User wants: when zooming in, nodes should dynamically **redistribute to fill
  the visible panel area** (not just magnify the same positions). The desired
  behavior is shown in `~/Downloads/service-map-3.png` — zoom in makes nodes
  spread and fill the viewport. Current zoom is camera-only (viewBox). Needs a
  layout approach that adapts node positions to the visible viewport, not just
  the full world.

---

## 0.2.0

DAG service-map panel milestone: service-scoped topology, enriched node
tooltip, and a working trace drilldown on Grafana 11+/13.

### Added
- Node hover tooltip now shows environment / namespace / workload
  (k8s deployment name) / cluster (eks_cluster) / service.
- `k8s_deployment_name` dimension exposed in the topology query.

### Changed
- Dashboard scoped to a single `Service` variable.
- Node visuals simplified: removed the "unresolved workload" indicator
  (dashed outline, badge, tooltip line); the transform-side detection
  logic is retained.

### Fixed
- Drilldown to Grafana Explore now uses the modern
  `?schemaVersion=1&panes=…` URL schema. The previous `?left=…` schema
  is ignored by Grafana 11+ (13.x here), which made Explore open empty.

### Security
- Hardened TraceQL/LogQL value escaping to also strip newline, carriage
  return, and null characters.
