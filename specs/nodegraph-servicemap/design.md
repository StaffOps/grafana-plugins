# Design: servicemap (node graph panel)

## Architecture

Frontend-only Grafana panel plugin (React + TypeScript). The panel is **datasource-agnostic
at render time**: it consumes the `DataFrame`s Grafana passes in (`PanelProps.data.series`),
transforms them into a graph model (nodes + edges), and renders. Topology data comes from
PromQL queries the user configures as panel targets; trace drill-down builds an Explore link
to a user-selected trace datasource.

```
Prometheus-compatible DS (service graph metrics)      Trace DS (e.g. Tempo)
        │  PromQL targets (client/server labels)               ▲
        ▼                                                       │ TraceQL Explore link
  Grafana panel query runner                                    │
        │  data.series (DataFrame[])                            │
        ▼                                                       │
  ┌──────────────────────────────────────────────┐             │
  │ servicemap panel                               │             │
  │  1. transform: series → GraphModel             │             │
  │  2. layout: force-directed | radial | dag      │─────────────┘ (edge click)
  │  3. render: SVG (nodes, edges, tooltip)        │
  └──────────────────────────────────────────────┘
```

## Data flow

### Topology queries (user-configured PromQL targets)

The panel expects instant-vector results labeled by `client`/`server`. Recommended targets
(documented in the plugin README so users can paste them):

```promql
# A) edge request rate  → edge thickness
sum by (client, server, connection_type) (rate(traces_service_graph_request_total[$__rate_interval]))

# B) edge error rate    → edge color (ratio computed as B / A per pair)
sum by (client, server) (rate(traces_service_graph_request_failed_total[$__rate_interval]))

# C) edge latency p95   → tooltip / optional encoding
histogram_quantile(0.95,
  sum by (client, server, le) (rate(traces_service_graph_request_server_seconds_bucket[$__rate_interval])))
```

The transform matches series across targets by the `(client, server)` key (refId or a metric-name
heuristic selects which target is rate/error/latency; explicit mapping available in panel options).

### Graph model

```
Node  = { id: service, inRate, outRate, totalRate }   // derived from union of clients+servers
Edge  = { source: client, target: server, rate, errorRatio, p95, connectionType }
```

Nodes are derived (not queried): the union of all `client` and `server` label values, with
`totalRate` = sum of incident edge rates. Virtual/isolated nodes handled via `connection_type`.

### Layout (3 interchangeable modes — MVP)

All three consume the same `GraphModel` and output positioned nodes; the active mode is a panel option:

| Mode | Approach | Reads best for |
|------|----------|----------------|
| `force` (default) | `d3-force` physics simulation | general topology, emergent clusters, cyclic graphs |
| `radial` | concentric rings around a focus node | ego-network ("who does X talk to") |
| `dag` | layered by call direction (client→server) | call-flow / dependency direction |

To compare modes during the MVP, the user places one panel per mode on a dashboard.

### Drill-down (edge → trace datasource)

On edge click, build a Grafana Explore URL for the configured trace datasource with a TraceQL
query scoped to the pair:

```
{ resource.service.name = "<server>" }   // + client filter when the client maps to a service.name
```

The `client`/`server` ↔ `resource.service.name` correspondence is **validated at implementation
time** against the target datasource (not assumed); if names diverge, a mapping option is exposed.

## Components

| Component | Responsibility |
|-----------|----------------|
| `module.ts` | Registers the `PanelPlugin` + panel options builder |
| `transform/` | Pure functions: `DataFrame[]` → `GraphModel` (nodes/edges). **Highest test value.** |
| `layout/` | Pure functions: `GraphModel` → positioned graph for each mode (force/radial/dag). Deterministic seeding for testability. |
| `components/ServiceMapPanel.tsx` | SVG rendering, hover tooltip, edge click → Explore link |
| `options.ts` / `types.ts` | Panel options (query mapping, layout, error thresholds, trace datasource UID) |

## Rationale (decisions and trade-offs)

### Decision 1: Consume panel `data.series` instead of querying datasources from the plugin

**Choice**: the user configures PromQL targets on the panel; the plugin transforms the returned series.

**Justification, strongest first**:
1. **Idiomatic Grafana** — panels render `data.series`; issuing datasource queries from a panel fights the query runner (time range, variables, caching).
2. **Datasource-agnostic** — works with any Prometheus-compatible source, not tied to one specific instance.
3. **Testable** — the transform is a pure function over `DataFrame[]`, trivial to unit-test to ≥90%.

**Accepted trade-offs**:
| Cost | Reality |
|------|---------|
| User must paste the recommended queries | Documented in README; a sane default target set ships with the panel |

**When to reopen**: if UX demands zero-config topology, revisit a datasource-driven fetch.

### Decision 2: One plugin with 3 layout modes (not 3 plugins)

**Choice**: a single panel plugin exposes `force` / `radial` / `dag` as a layout option.

**Justification, strongest first**:
1. **DRY** — transform, rendering, tooltip, and drill-down are shared; only the layout function differs. Three plugins would triplicate everything.
2. **Comparison is still possible** — placing one panel per mode on a dashboard yields "one of each" for MVP validation.
3. **Cheap to extend** — a new layout is one more pure function, not a new plugin.

**Accepted trade-offs**:
| Cost | Reality |
|------|---------|
| Users can't install a single layout in isolation | A layout is a config toggle, not a distribution unit — isolation adds no value |

**When to reopen**: if a layout grows its own heavy dependencies/UX, split it out.

### Decision 3: `d3-force` for layout (not a heavyweight graph lib)

**Choice**: `d3-force` for force-directed + hand-rolled radial and a simple layered DAG.

**Justification, strongest first**:
1. **Small, focused, well-known** — avoids pulling a large all-in-one graph lib for a first plugin.
2. **Deterministic seeding** possible → layout logic is unit-testable.
3. Keeps the door open to extract a reusable `graph-core` when a 2nd graph plugin arrives.

**Accepted trade-offs**:
| Cost | Reality |
|------|---------|
| We render SVG ourselves (no built-in interactions) | The interactions we need (hover, click, focus) are few and specific |

**When to reopen**: if we need advanced graph interactions across multiple plugins, evaluate a shared engine in `graph-core`.

## Invariants

- Transform and layout logic are **pure functions** (no Grafana runtime coupling) → unit-testable.
- No secrets, endpoints, or environment-specific identifiers committed; local Grafana reads URLs from a gitignored `.env`.
- Frontend-only; no backend.

## External dependencies

| Dependency | Purpose |
|------------|---------|
| `@grafana/data`, `@grafana/ui`, `@grafana/runtime` | Panel API, theme, Explore link building |
| `d3-force` | Force-directed layout |
| Prometheus-compatible datasource (PromQL) | Topology substrate (service graph metrics) |
| Trace datasource, e.g. Tempo (TraceQL) | Trace drill-down target |
| Docker `node:20` + Grafana image | Local build/test + provisioned dev environment |

## Open choices (decide after the MVP)

- **Plugin ID**: `staffops-servicemap-panel` (publisher-namespaced per Grafana convention; unrelated to license).
- **Visual encoding** (thickness=RPS, color=error ratio, node size=total traffic) — adjustable as panel options; revisit after seeing the MVP.
- **Extra interactivity** (focus/neighbors, path highlighting, label filter) — incremental after the MVP core.
