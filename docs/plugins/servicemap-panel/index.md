# Service Map Panel

- **Plugin ID:** `staffops-servicemap-panel`
- **Type:** panel
- **Package:** `packages/staffops-servicemap-panel`

A directed **service map (DAG)** panel that renders service-to-service topology from Tempo
**service-graph metrics** (a Prometheus-compatible source). It visualizes health, traffic,
and dependencies, and lets you drill from an edge/node into Explore.

## Features

| Feature | Description |
|---------|-------------|
| **DAG layout** | Services as nodes, calls as directed edges, laid out automatically. |
| **Health coloring** | Nodes/edges colored by error rate and latency thresholds. |
| **Animated traffic** | Particles flow along edges proportional to request rate. |
| **Cascade filtering** | Selecting a node isolates its upstream/downstream (multi-hop). |
| **Node kinds** | Distinct styling per node kind (service, database, queue, external). |
| **Zoom / pan** | Interactive navigation of large graphs. |
| **Drill-down** | Jump from a node/edge to Grafana Explore with the relevant query. |

## Data source

The panel consumes **Tempo service-graph metrics** exposed through a Prometheus-compatible
datasource (e.g. `traces_service_graph_request_total`,
`traces_service_graph_request_failed_total`, and the request/duration histograms). No Go
backend — the panel transforms the `DataFrame`s Grafana passes in.

## Install

The panel is distributed as a signed plugin zip (GitHub Releases). For a prod-like local
test it can be installed at startup:

```yaml
environment:
  - GF_INSTALL_PLUGINS=<release-zip-url>;staffops-servicemap-panel
  - GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=staffops-servicemap-panel
```

See [Configuration](configuration.md) for panel options.
