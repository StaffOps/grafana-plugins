# Requirements: servicemap (node graph panel)

## Context

A Grafana **panel plugin** that renders a service topology (node graph) from Tempo
**service graph metrics** exposed by any Prometheus-compatible datasource, with
**drill-down to a trace datasource** (e.g. Tempo). It is the first plugin in the
`grafana-plugins` monorepo and is intended as an open-source, environment-agnostic tool.

Data substrate (standard Tempo metrics-generator output — not tied to any specific deployment):
- `traces_service_graph_request_total{client, server, connection_type}` — edges + request rate.
- `traces_service_graph_request_failed_total{client, server}` — edge errors.
- `traces_service_graph_request_server_seconds_bucket` (+ `_count`/`_sum`) — edge latency histogram.

## User Stories

WHEN the panel receives service graph series (labeled by `client`/`server`) THEN it
SHALL render a node graph where nodes are services and edges are `client → server` calls.

WHEN an edge has request/error/latency data THEN the panel SHALL encode: edge thickness
by request rate, edge color by error ratio, and node size by total incident traffic.

WHEN the user hovers a node or edge THEN the panel SHALL show a tooltip with its key
stats (RPS, error %, p95 latency for edges; total in/out RPS for nodes).

WHEN the user clicks an edge THEN the panel SHALL open a drill-down to the configured
trace datasource (Explore) scoped to that `client → server` pair via a TraceQL query.

WHEN `connection_type` distinguishes edge kinds (e.g. database, messaging, virtual node)
THEN the panel SHALL visually differentiate those edges.

WHEN the graph is rendered THEN the panel SHALL use a single **hierarchical/DAG** layout
(nodes layered by client→server call direction, cycles broken). Radial and force layouts
were evaluated and dropped as less useful for this view.

WHEN the graph is large THEN the panel SHALL remain readable, with a focus/neighbors mode
on node click.

WHEN the panel is built or tested THEN it SHALL require no local language SDK — build/test
run via Docker, rendered in a locally provisioned Grafana pointing at external datasources.

## Acceptance Criteria

- [ ] Panel registered as a Grafana panel plugin (`type: panel`) under `packages/servicemap`.
- [ ] Transforms Prometheus-compatible series with `client`/`server` labels into a nodes/edges graph model.
- [ ] Single hierarchical/DAG layout (layered by call direction, cycles broken).
- [ ] Edge encoding: thickness = request rate, color = error ratio; node size = total traffic.
- [ ] Tooltip on node and edge (RPS / error % / p95).
- [ ] Edge click → trace datasource Explore link with a TraceQL query scoped to the pair.
- [ ] `connection_type` visually differentiated.
- [ ] Panel options: query mapping, layout, error thresholds, trace datasource selection.
- [ ] Unit tests ≥90% coverage for data-transform and layout-model logic.
- [ ] Local docker-compose Grafana renders the panel from real service graph metrics; edge drill-down opens the trace datasource.

## Out of scope

- Datasource plugin (topology comes from existing datasources).
- Go backend (frontend-only).
- Managing the Tempo metrics-generator configuration.
- Building topology directly from raw traces (uses service graph metrics as substrate).
- Shared `graph-core` library (extracted only when a 2nd graph plugin exists).
- Any environment-specific service names, endpoints, or counts (kept out of the codebase).

## Milestone 2 — Workload-native graph + incident views

Builds on v1. Depends on the Tempo metrics-generator now emitting, on both sides of each
edge, `client_`/`server_` × {`deployment_environment`, `service_namespace`,
`service_workload`, `service_name`, `eks_cluster`} plus `connection_type` and `virtual_node`.
Informed by observability + SRE design consultation.

### User Stories

WHEN the graph is built THEN nodes SHALL be keyed by **workload** (`client_service_workload`
→ `server_service_workload`), not by `service.name`.

WHEN a workload has no resolvable deployment name (`service_workload` = `app` or a
ReplicaSet-hash pattern) THEN the node SHALL be visually flagged as "unresolved workload".

WHEN the Environment→Namespace→Workload cascade and the graph filter run THEN they SHALL be
driven by the **native service graph labels** (no `http_*` dependency), and a filter on a
workload/namespace/environment SHALL match edges where it appears on **either** side
(`client_*` OR `server_*`).

WHEN the user filters by `connection_type` THEN the panel SHALL be able to show only
`database`, only `messaging_system`, or only real service-to-service edges; virtual nodes
SHALL be handled asymmetrically — `virtual_node=client` (external callers) hidden by
default, `virtual_node=server` (external dependencies) shown by default; both toggleable.

WHEN the user clicks a node THEN the panel SHALL highlight its **blast radius** — upstream
callers and downstream dependencies (1 hop by default, expandable) — dimming the rest.

WHEN an edge crosses an environment or namespace boundary
(`client_deployment_environment ≠ server_deployment_environment`, or namespace mismatch)
THEN the panel SHALL visually flag it (computed client-side, no extra query).

WHEN the user drills from a node THEN the panel SHALL offer: traces (Tempo, existing), **logs**
(Loki, scoped by namespace + workload/app with fallback), and the service **dashboard**.

WHEN active alerts exist for a workload THEN the panel SHALL badge that node (alerts provided
as an optional extra query series so the panel keeps consuming `data.series`).

### Acceptance Criteria

- [ ] Nodes keyed by `service_workload` (client/server); unresolved-workload flag (regex heuristic).
- [ ] Cascade + graph filter from native labels, either-side matching; `http_*` dependency removed.
- [ ] Topology discovered via instant `count(... ) by (client_service_workload, server_service_workload)`; health via `rate()` — total **3 queries** (topology, rate/error, latency), never per-edge.
- [ ] `connection_type` filter (database / messaging / services) + asymmetric virtual-node toggles.
- [ ] Database edges styled distinctly; node drill for a DB target goes to the **client** spans filtered by `db.system` (no server spans exist).
- [ ] Blast-radius highlight (upstream/downstream, expandable) on node click.
- [ ] Cross-environment / cross-namespace edge highlight (client-side).
- [ ] Node drill-downs: traces (existing), Loki logs, service dashboard.
- [ ] Alert overlay badging nodes with active alerts (optional series; degrades gracefully if absent).
- [ ] Visual channels kept separate: color = health, thickness = RPS, latency = separate mode (V2).
- [ ] Unit tests ≥90% for new pure logic (workload keying, either-side filter, blast-radius traversal, cross-boundary detection, alert/node matching).

### Out of scope (deferred)

- **V2**: latency-mode edge encoding (SLO-aligned thresholds), `eks_cluster` filter (either-side), semantic edge styling refinements, staleness/silent-failure detection.
- **V3**: namespace grouping/coloring toggle, workload↔namespace aggregation, DB/queue saturation signals, time-range comparison, trend glyph, inline "graph confidence %".
- Full metrics-generator health panel (unpaired/dropped spans) → separate platform dashboard.
- Per-service SLO source for thresholds (needs an SLO catalog); until then, global default thresholds.
