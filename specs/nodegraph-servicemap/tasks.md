# Tasks: servicemap (node graph panel)

Ordered plan. Nothing past Task 2 starts before the spec review gate passes.

- [ ] Task 1: Verify `@grafana/create-plugin` monorepo placement (via Docker) — how the
      current version lays out files/`.config/` inside `packages/`. (depends on: nothing)
- [ ] Task 2: **Review gate** — user confirms requirements + design. (depends on: spec written)
- [ ] Task 3: Scaffold `packages/servicemap` (Panel, id `staffops-servicemap-panel`) and wire
      into the workspace. (depends on: Task 1, Task 2)
- [ ] Task 4: `docker-compose.yaml` — Grafana + provisioned datasources (Prometheus-compatible
      + trace) reading URLs/auth from a gitignored `.env`; allow-list the unsigned plugin.
      (depends on: Task 3)
- [ ] Task 5: Implement `transform/` (DataFrame[] → GraphModel) — pure functions.
      (depends on: Task 3)
- [ ] Task 6: Implement `layout/` — DAG layout (layered Kahn's-algorithm, cycles broken), deterministic
      and testable. (depends on: Task 5)
- [ ] Task 7: Implement `components/ServiceMapPanel.tsx` (SVG render, tooltip, edge→trace-DS link)
      + panel options (incl. layout selector). (depends on: Task 5, Task 6)
- [ ] Task 8: Tests by an **independent author** for transform + all layout modes (+ component
      smoke), coverage ≥90% via Docker. (depends on: Task 5, Task 6, Task 7)
- [ ] Task 9: Validate `client/server` ↔ trace `resource.service.name` mapping against the target
      datasource; finalize the drill-down link. (depends on: Task 7)
- [ ] Task 10: End-to-end local validation — one panel per layout renders from real service graph
      metrics; edge click opens the trace datasource Explore. (depends on: Task 4, Task 7, Task 9)
- [ ] Task 11: Plugin README (recommended queries, options, layouts, dev/run via Docker).
      (depends on: Task 10)

## Verification independence

Per repo convention: the `dev` author of Tasks 5–7 does not write their own tests. Task 8
is authored by an independent `dev` session against the contract (requirements + design),
then `code-review` reviews code + tests. Coverage gate ≥90% is enforced.

## Milestone 2 tasks — Workload-native graph + incident views

Prereq: Tempo metrics-generator emitting `client_`/`server_` dimensions (done by user) with
`enable_client_server_prefix`, `trace_id` removed. Nothing here is committed/harnessed until the
milestone review gate; harness (independent tests + code-review + observability/security) runs on approval.

- [ ] M2-1: Transform — key nodes by `service_workload` (client/server); carry env/namespace/service_name/eks_cluster per node; unresolved-workload flag (regex heuristic). Pure.
- [ ] M2-2: Queries/dashboard — native cascade (env→namespace→workload) from service graph labels; drop `http_*`; either-side filter; topology via instant `count()`, health via `rate()`, latency via histogram_quantile — 3-query budget. (depends: M2-1)
- [ ] M2-3: connection_type filter + asymmetric virtual-node toggles (hide client-virtual, show server-virtual); DB edges styled distinctly. (depends: M2-1)
- [ ] M2-4: Blast-radius traversal (upstream/downstream BFS, expandable) + focus dimming. Pure. (depends: M2-1)
- [ ] M2-5: Cross-env / cross-namespace edge highlight (client-side compare). (depends: M2-1)
- [ ] M2-6: Node drill-downs — Loki logs (namespace+workload/app fallback) + service dashboard link; DB node drill → client spans by `db.system`. (depends: M2-1)
- [ ] M2-7: Alert overlay — optional alert series → match workload/service_name → badge nodes; graceful when absent. (depends: M2-1)
- [ ] M2-8: Independent tests ≥90% for pure logic (workload keying, either-side filter, blast-radius BFS, cross-boundary detection, alert matching, unresolved-workload heuristic). (depends: M2-1..M2-7)
- [ ] M2-9: Milestone review gate → harness (code-review + observability + security) → commit. (depends: M2-8)

Deferred: V2 (latency-mode SLO-aligned, eks_cluster filter, semantic styling, staleness), V3
(namespace grouping, aggregation, saturation, time comparison, trend glyph, graph-confidence).
