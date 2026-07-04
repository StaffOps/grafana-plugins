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

WHEN the user selects a layout THEN the panel SHALL render the same graph model using one
of three interchangeable layouts: **force-directed** (default), **radial**, or
**hierarchical/DAG**. This is the MVP mechanism to compare layouts (place one panel per mode).

WHEN the graph is large THEN the panel SHALL remain readable, with a focus/neighbors mode
on node click.

WHEN the panel is built or tested THEN it SHALL require no local language SDK — build/test
run via Docker, rendered in a locally provisioned Grafana pointing at external datasources.

## Acceptance Criteria

- [ ] Panel registered as a Grafana panel plugin (`type: panel`) under `packages/servicemap`.
- [ ] Transforms Prometheus-compatible series with `client`/`server` labels into a nodes/edges graph model.
- [ ] Three selectable layouts: force-directed (default), radial, hierarchical/DAG.
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
