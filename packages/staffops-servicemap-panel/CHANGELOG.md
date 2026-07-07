# Changelog

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
