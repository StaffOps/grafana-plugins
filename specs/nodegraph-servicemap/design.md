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
  │  2. layout: dag (hierarchical, layered)        │─────────────┘ (edge click)
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

### Layout (DAG)

The graph uses a single **hierarchical (DAG)** layout: nodes layered by call direction
(client→server) with cycle breaking (Kahn's-algorithm variant). It reads best for service
call-flow / dependency direction. Earlier `radial` and `force` layouts were evaluated and
dropped as less useful for this view (fewer moving parts, no layout selector to reason about).

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
| `layout/` | Pure functions: `GraphModel` → positioned graph using the DAG layout. Deterministic ordering for testability. |
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

### Decision 2: Single DAG layout in one plugin (not multiple plugins/modes)

**Choice**: a single panel plugin with one hierarchical **DAG** layout (force and radial were implemented, then dropped as less useful — removing the layout selector simplifies the UI).

**Justification, strongest first**:
1. **DRY** — transform, rendering, tooltip, and drill-down are shared; only the layout function differs. Three plugins would triplicate everything.
2. **Comparison is still possible** — placing one panel per mode on a dashboard yields "one of each" for MVP validation.
3. **Cheap to extend** — a new layout is one more pure function, not a new plugin.

**Accepted trade-offs**:
| Cost | Reality |
|------|---------|
| Users can't install a single layout in isolation | A layout is a config toggle, not a distribution unit — isolation adds no value |

**When to reopen**: if a layout grows its own heavy dependencies/UX, split it out.

### Decision 3: Hand-rolled layouts, no external layout library

**Choice**: the `dag` layout is implemented from scratch (layered Kahn's-algorithm with cycle breaking). No graph/layout dependency.

**Justification, strongest first**:
1. **Zero layout dependencies** — smaller supply-chain surface, nothing to pin or audit. (An earlier `d3-force`-based force layout was dropped as not useful, which also removed the `d3-force` dependency.)
2. **Deterministic by construction** (sorted ordering / fixed initial conditions) → layout logic is unit-testable without a seeded PRNG.
3. **We render SVG ourselves**, so layouts only need to output coordinates — a full graph lib would be overkill.

**Accepted trade-offs**:
| Cost | Reality |
|------|---------|
| No physics-based "organic" layout | Dropped deliberately — deemed unhelpful for this use case |
| Manual layout maintenance | The two algorithms are small and stable |

**When to reopen**: if a future layout needs advanced graph algorithms, evaluate a dependency (and its license) then — ideally inside a shared `graph-core`.

## Invariants

- Transform and layout logic are **pure functions** (no Grafana runtime coupling) → unit-testable.
- No secrets, endpoints, or environment-specific identifiers committed; local Grafana reads URLs from a gitignored `.env`.
- Frontend-only; no backend.

## External dependencies

| Dependency | Purpose |
|------------|---------|
| `@grafana/data`, `@grafana/ui`, `@grafana/runtime` | Panel API, theme, Explore link building |
| Prometheus-compatible datasource (PromQL) | Topology substrate (service graph metrics) |
| Trace datasource, e.g. Tempo (TraceQL) | Trace drill-down target |
| Docker `node:20` + Grafana image | Local build/test + provisioned dev environment |

## Open choices (decide after the MVP)

- **Plugin ID**: `staffops-servicemap-panel` (publisher-namespaced per Grafana convention; unrelated to license).
- **Visual encoding** (thickness=RPS, color=error ratio, node size=total traffic) — adjustable as panel options; revisit after seeing the MVP.
- **Extra interactivity** (focus/neighbors, path highlighting, label filter) — incremental after the MVP core.

## UI & interactions (v2 — Kiali-inspired, dev-focused)

Designed around the questions a developer asks when opening a service map: *is anything
broken? what talks to my service? where's the traffic? how bad/how much? show me traces.*
Animation applies to the **filtered subgraph** only (env→namespace→service scope keeps it
small), so no global animation/perf fallback is needed — only a soft guard.

### Health model (pure function)

`health(errorRatio)` → `ok | warn | crit` using two panel-option thresholds
(`warnThreshold` default 0.01, `errorThreshold`/crit default 0.05).
- Edge color: ok=green, warn=amber, crit=red (theme-aware; mapped to Grafana semantic colors).
- Node health = worst status among its incident edges → colored ring/border.
- **Accessibility**: color is never the only signal — warn/crit edges also use a dashed
  stroke + an alert glyph, so it reads without color perception.

### Animated traffic

- Particles travel along each edge in the **client→server** direction; particle
  count/speed derived from `rate` via a pure function `flowParams(rate, maxRate)`
  (normalized; clamped min/max). Communicates direction + volume at a glance.
- Rendered with SVG (`<animateMotion>` / CSS `offset-path`) — no new dependency.
- Soft guard: if the (already filtered) graph still exceeds ~N edges, reduce particles /
  fall back to static thickness. Toggle `animate` (default on).

### Focus / context

- Click a node → highlight the node + its incident edges + immediate neighbors; dim the
  rest. Click background → reset. Helps read even a focused subgraph.

### Progressive disclosure

- Default: node = circle (size ∝ totalRate) + truncated label; details on hover
  (node: in/out RPS, health; edge: RPS, err%, p95).
- `showEdgeLabels` toggle (default off) to print RPS/err%/p95 on edges for small graphs.

### Summary + legend

- In-panel summary line for the filtered set: **# services · # edges · aggregate error % ·
  total RPS** — computed by a pure `summarize(model)` function.
- Compact legend: health colors + "moving particle = requests".

### Drill-down

- Edge click → trace datasource Explore, TraceQL scoped to the `client→server` pair (exists).
- Node click (modifier or dedicated affordance) → Explore with `{resource.service.name="<node>"}`.
  Node click without modifier drives Focus mode (above).

### Testable units (for independent test author, ≥90%)

- `health(errorRatio, warn, crit)` — thresholds/branches.
- `flowParams(rate, maxRate)` — normalization, clamping, zero/negative guards.
- `summarize(model)` — counts, aggregate error %, total RPS on edge cases (empty, all-ok).
- `nodeHealth(model)` — worst-incident-edge propagation.
- Component smoke: renders health colors, particles present when animate on, focus dims
  non-neighbors, edge/node labels, node→trace URL correctly encoded.

### Rationale (v2)

**Choice**: enhance the existing SVG renderer in place (health + particles + focus +
summary) rather than adopting a graph/animation library.

**Justification, strongest first**:
1. Keeps the plugin dependency-free and agnostic (no cytoscape/vis); animation via native SVG/CSS.
2. Health/flow/summary are **pure functions** → unit-testable to the ≥90% gate; only the
   render/animation is smoke-tested.
3. Animation scoped to the filtered subgraph makes the signature Kiali effect cheap.

**When to reopen**: if interactions grow (edge bundling, compound nodes, minimap) beyond
what hand-rolled SVG sustains, evaluate a graph engine in a shared `graph-core`.

## Milestone 2 — Workload-native graph + incident views (design)

Design consultation: observability + SRE. Their correctness rules are treated as invariants below.

### Data model change: nodes keyed by workload

The transform builds the graph from `client_service_workload → server_service_workload`
instead of `client → server` (service.name). Each node carries its `deployment_environment`,
`service_namespace`, `service_name`, `eks_cluster` from the corresponding side. Edges keep
rate / errorRatio / p95 / connectionType.

- **Unresolved workload**: when `service_workload` is `app` or matches a ReplicaSet-hash
  pattern (`-[a-f0-9]{6,10}$`), flag the node (dashed outline + note). Root cause is upstream
  (Collector `k8sattributesprocessor` not setting `k8s.deployment.name`); the panel only flags it.

### Native cascade + queries (drops http_*)

Variables are driven by the service graph metric itself:
- `environment`: `label_values(traces_service_graph_request_total, server_deployment_environment)`
- `namespace`: `label_values(...{server_deployment_environment="$environment"}, server_service_namespace)`
- `workload`: `label_values(...{...}, server_service_workload)`

### Invariants (from the consultation — non-negotiable)

1. **Either-side matching.** A filter on workload/namespace/env matches
   `{client_*=~"$v"} OR {server_*=~"$v"}` — never one side only (else half the topology is lost).
2. **Topology via instant `count()`, health via `rate()`.** Discover edges with
   `count(traces_service_graph_request_total) by (client_service_workload, server_service_workload, connection_type)`
   (instant) so low-traffic edges don't vanish; use `rate()` only for weight/health.
3. **3-query budget.** Exactly three queries share the same `by()`: topology (count),
   rate+error, latency (histogram_quantile). Never one query per edge.
4. **Database edges are client-side observations.** `connection_type=database` red = "my calls
   fail", not "DB down". No server spans exist → a DB node's drill goes to the **client** spans
   filtered by `db.system`, not to a (nonexistent) server trace.
5. **Virtual node asymmetry.** `virtual_node=client` = external caller (ingress/cron/CLI) → hide
   by default; `virtual_node=server` = external dependency → show by default. Both toggleable.
6. **One signal per visual channel.** color = health, thickness = RPS, latency = separate mode (V2).

### Feature designs

| Feature | Approach |
|---------|----------|
| Blast radius | On node click, BFS over the graph model: N-hop upstream + downstream sets; dim the complement. Pure traversal, no query. Default 1 hop, expandable. |
| Cross-boundary highlight | Client-side compare of `client_*` vs `server_*` env/namespace per edge → dashed/accented stroke. No extra query. |
| connection_type filter | Panel options + quick toggles (DBs / Queues / Services); virtual-node toggles (client/server). Applied in transform on the already-fetched frames. |
| Node → logs / dashboard | Grafana Explore URL (Loki) scoped by `service_namespace` + `service_workload`/`app` (with fallback); dashboard link by UID template. All URL-encoded like the existing trace drill. |
| Alert overlay | Optional extra target (e.g. `ALERTS{alertstate="firing"}` or an Alertmanager datasource) → transform matches `service_workload`/`service_name` → badge node. Absent series → no badges (graceful). |

### Rationale

**Decision M2-1: workload as node identity (not service.name).**
- Matches how teams reason about ownership, rollouts, blast radius; `service.name` drifts (SDK/assembly names, the `DataPlatform.*` vs `dpm-*` split observed).
- Trade-off: `app`/hash fallbacks create phantom nodes → mitigated by the unresolved flag; real fix is upstream Collector enrichment.
- Reopen if: workload labels prove less stable than service.name in practice.

**Decision M2-2: alerts/logs as data, not bespoke fetches.**
- Alert badges come from an optional query series and logs/dashboard are URL links → keeps the panel's "render `data.series`" contract; no new runtime coupling; degrades gracefully.

**Decision M2-3: incident-first prioritization.**
- V1 answers "what broke / who's affected / where do I look" (blast radius, connection_type, cross-boundary, drills, alerts). Latency-mode, cluster filter, grouping, saturation deferred to V2/V3 — they aid exploration, not first-response.
