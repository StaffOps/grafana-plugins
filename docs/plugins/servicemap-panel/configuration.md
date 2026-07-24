# Service Map Panel — Configuration

The panel is configured like any Grafana panel: add it to a dashboard, point it at a
datasource that exposes Tempo service-graph metrics, and adjust the panel options.

## Data requirements

The panel expects service-graph series (Prometheus-compatible). Typical queries:

```promql
# Request rate per edge (client → server)
sum by (client, server) (rate(traces_service_graph_request_total[$__rate_interval]))

# Error rate per edge
sum by (client, server) (rate(traces_service_graph_request_failed_total[$__rate_interval]))

# Latency (p99) per edge
histogram_quantile(0.99,
  sum by (client, server, le) (rate(traces_service_graph_request_server_seconds_bucket[$__rate_interval])))
```

The transform layer pairs `client`/`server` labels into edges and aggregates the metrics
into node/edge health.

## Panel options

| Option | Effect |
|--------|--------|
| **Health thresholds** | Error-rate / latency cutoffs that drive node & edge coloring. |
| **Traffic animation** | Toggle animated particles; density scales with request rate. |
| **Node kind mapping** | Map label values to node kinds (service / database / queue / external) for styling. |
| **Cascade / isolation** | Enable click-to-isolate upstream/downstream (multi-hop) filtering. |
| **Drill-down target** | The Explore datasource/query template opened when drilling from a node/edge. |

## Local development

```bash
cd packages/staffops-servicemap-panel
cp .env.example .env      # set METRICS_URL and TEMPO_URL
# build + run a local Grafana with the panel (via Docker)
```

See [Building & Testing](../../development/building.md) for the Docker build commands.
