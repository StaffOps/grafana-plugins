/**
 * Core graph model types for the service map panel.
 * These types are used by transform, layout, and rendering layers.
 */

/** A node in the service graph (keyed by workload). */
export interface GraphNode {
  id: string;
  /** Sum of incoming edge rates (this node as server). */
  inRate: number;
  /** Sum of outgoing edge rates (this node as client). */
  outRate: number;
  /** inRate + outRate (total incident traffic). */
  totalRate: number;
  /** Deployment environment from the side where this node appears. */
  environment?: string;
  /** Service namespace from the side where this node appears. */
  namespace?: string;
  /** service.name from the side where this node appears. */
  serviceName?: string;
  /** EKS cluster from the side where this node appears. */
  eksCluster?: string;
  /** k8s deployment name (workload) from the side where this node appears. */
  workload?: string;
  /** True when workload name is unresolved (generic 'app' or ReplicaSet hash). */
  unresolvedWorkload?: boolean;
  /** Whether this node represents a virtual_node=server (external dependency). */
  isVirtualServer?: boolean;
  /** Whether this node represents a virtual_node=client (external caller). */
  isVirtualClient?: boolean;
  /** Whether this is a database node (connection_type=database on its server side). */
  isDatabase?: boolean;
}

/** A directed edge representing a client→server call relationship. */
export interface GraphEdge {
  /** Client workload (source node id). */
  source: string;
  /** Server workload (target node id). */
  target: string;
  /** Request rate (req/s). */
  rate: number;
  /** Error ratio (0–1). */
  errorRatio: number;
  /** 95th percentile latency in seconds. */
  p95: number;
  /** Connection type label value (e.g. "database", "messaging_system", ""). */
  connectionType: string;
  /** True when client and server are in different environments. */
  crossEnvironment?: boolean;
  /** True when client and server are in different namespaces. */
  crossNamespace?: boolean;
  /** Client-side environment for this edge. */
  clientEnvironment?: string;
  /** Server-side environment for this edge. */
  serverEnvironment?: string;
  /** Client-side namespace for this edge. */
  clientNamespace?: string;
  /** Server-side namespace for this edge. */
  serverNamespace?: string;
  /** virtual_node value from the source row. */
  virtualNode?: string;
}

/** The complete graph model produced by the transform step. */
export interface GraphModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** A positioned node (output of layout algorithms). */
export interface PositionedNode extends GraphNode {
  x: number;
  y: number;
  /** Zero-based index of this node within its DAG layer (for label staggering). */
  layerIndex?: number;
  /** Zero-based DAG layer (column/rank) this node belongs to. */
  layer?: number;
  /** Total number of layers in the graph (for first/last column detection). */
  totalLayers?: number;
  /** True when this node's layer was wrapped into multiple sub-columns. */
  wrapped?: boolean;
}

/** Graph model with positioned nodes (ready for rendering). */
export interface PositionedGraph {
  nodes: PositionedNode[];
  edges: GraphEdge[];
}

/**
 * Query role mapping: tells the transform which refId corresponds to
 * which metric role. The user configures these in panel options.
 */
export interface QueryRoleMapping {
  /** refId for the rate query (request rate per edge). */
  rateRefId: string;
  /** refId for the error query (failed request rate per edge). */
  errorRefId: string;
  /** refId for the latency query (p95 histogram_quantile per edge). */
  latencyRefId: string;
}

/** Allowed connection_type filter values. */
export type ConnectionTypeFilter = 'all' | 'database' | 'messaging_system' | 'services';

/** Layout direction for the DAG. */
export type LayoutDirection = 'top-down' | 'left-right';

/** Allowed health filter values. */
export type HealthFilter = 'all' | 'healthy' | 'unhealthy';

/** Panel options for the service map panel. */
export interface ServiceMapOptions {
  /** Error ratio threshold above which edges are highlighted as critical (0–1). */
  errorThreshold: number;
  /** Warning threshold for error ratio (0–1). Below crit, above ok. Default 0.01. */
  warnThreshold?: number;
  /** Whether to animate traffic particles along edges. Default true. */
  animate?: boolean;
  /** Whether to display RPS/err%/p95 labels on edges. Default false. */
  showEdgeLabels?: boolean;
  /** UID of the trace datasource used for drill-down (e.g. Tempo). */
  traceDatasourceUid: string;
  /** Maps query refIds to their semantic roles. */
  queryMapping: QueryRoleMapping;

  // ─── Milestone 2 options ─────────────────────────────────────────────────

  /** Filter edges by connection_type. 'all' shows everything. Default 'all'. */
  connectionTypeFilter?: ConnectionTypeFilter;
  /** Filter nodes by health status. Default 'all'. */
  healthFilter?: HealthFilter;
  /** DAG layout direction. Default 'top-down'. */
  layoutDirection?: LayoutDirection;
  /** Show virtual_node=client nodes (external callers). Default false. */
  showVirtualClients?: boolean;
  /** Show virtual_node=server nodes (external dependencies). Default true. */
  showVirtualServers?: boolean;
  /** Number of hops for blast-radius highlight on node click. Default 1. */
  blastRadiusHops?: number;
  /** UID of the Loki datasource for log drill-down. */
  logsDatasourceUid?: string;
  /** URL template for service dashboard link. Use ${workload}, ${namespace}, ${serviceName}. */
  dashboardUrlTemplate?: string;
  /** refId of the optional alerts query series for alert-overlay badges. */
  alertsRefId?: string;
}
