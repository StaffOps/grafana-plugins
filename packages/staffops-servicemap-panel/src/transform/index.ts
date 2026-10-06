/**
 * Transform module: converts Grafana DataFrame[] into a GraphModel.
 *
 * Node identity precedence (per side):
 *   1. k8s_deployment_name (client_k8s_deployment_name / server_k8s_deployment_name)
 *   2. service.name bare (client / server) — v1 backward-compat
 *
 * Each node carries env/namespace/service_name/eks_cluster.
 * Edges annotated with connection_type, virtual_node, cross-boundary flags.
 *
 * Pure functions with no Grafana runtime coupling — only depends on
 * @grafana/data types for DataFrame shape, which are type-only imports
 * at runtime.
 */

import { DataFrame, Field } from '@grafana/data';
import {
  GraphModel,
  GraphNode,
  GraphEdge,
  QueryRoleMapping,
  ConnectionTypeFilter,
  HealthFilter,
} from '../types';
import type { HealthStatus } from '../viz';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts a numeric value from a field at an index, returning 0 for NaN/undefined.
 */
function safeNumericValue(field: Field | undefined, index: number): number {
  if (!field) {
    return 0;
  }
  const val = field.values[index];
  if (val === null || val === undefined || Number.isNaN(val)) {
    return 0;
  }
  return typeof val === 'number' ? val : 0;
}

/**
 * Finds a field by name (case-insensitive) in a DataFrame.
 */
function findField(frame: DataFrame, name: string): Field | undefined {
  const lower = name.toLowerCase();
  return frame.fields.find((f) => f.name.toLowerCase() === lower);
}

/**
 * Gets string value from a field at an index.
 */
function stringValue(field: Field | undefined, index: number): string {
  if (!field) {
    return '';
  }
  const val = field.values[index];
  return val != null ? String(val).trim() : '';
}

/**
 * Composite key for (client_workload, server_workload) pair.
 */
function edgeKey(clientWorkload: string, serverWorkload: string): string {
  return `${clientWorkload}\x00${serverWorkload}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Unresolved workload heuristic
// ─────────────────────────────────────────────────────────────────────────────

/** Pattern for ReplicaSet hash suffix (6–10 hex chars at end). */
const REPLICASET_HASH_RE = /-[a-f0-9]{6,10}$/;

/**
 * Returns true if a single name is empty, 'app', or matches the ReplicaSet hash pattern.
 */
function isNameUnresolved(name: string): boolean {
  if (!name) {
    return true;
  }
  if (name === 'app') {
    return true;
  }
  return REPLICASET_HASH_RE.test(name);
}

/**
 * Returns true if the resolved node id is "unresolved" — meaning it is
 * empty, 'app', or matches the ReplicaSet hash pattern.
 */
export function isUnresolvedWorkload(resolvedId: string): boolean {
  return isNameUnresolved(resolvedId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-boundary detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detects whether an edge crosses an environment boundary.
 */
export function isCrossEnvironment(clientEnv: string, serverEnv: string): boolean {
  if (!clientEnv || !serverEnv) {
    return false;
  }
  return clientEnv !== serverEnv;
}

/**
 * Detects whether an edge crosses a namespace boundary.
 */
export function isCrossNamespace(clientNs: string, serverNs: string): boolean {
  if (!clientNs || !serverNs) {
    return false;
  }
  return clientNs !== serverNs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Frame classification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determines which role a DataFrame fulfills based on the refId
 * and the user-provided query mapping.
 */
function classifyFrame(
  frame: DataFrame,
  mapping: QueryRoleMapping
): 'rate' | 'error' | 'latency' | null {
  const refId = (frame.refId ?? '').trim();
  if (refId === mapping.rateRefId) {
    return 'rate';
  }
  if (refId === mapping.errorRefId) {
    return 'error';
  }
  if (refId === mapping.latencyRefId) {
    return 'latency';
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Node identity resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves the node identity from the priority chain.
 * Returns k8sDeploymentName if non-empty and non-trivial (not 'app', not ReplicaSet hash),
 * otherwise falls back to the bare service.name.
 *
 * Priority: k8sDeploymentName > bare (service.name)
 * Returns empty string only if BOTH are empty.
 */
function resolveNodeId(k8sDeploymentName: string, bare: string): string {
  // k8s_deployment_name is preferred when present AND non-trivial
  if (k8sDeploymentName && k8sDeploymentName !== 'app' && !REPLICASET_HASH_RE.test(k8sDeploymentName)) {
    return k8sDeploymentName;
  }
  // Fall back to bare service.name if available
  if (bare) {
    return bare;
  }
  // Last resort — use k8s_deployment_name even if unresolved (identity needed)
  return k8sDeploymentName;
}

// ─────────────────────────────────────────────────────────────────────────────
// Edge accumulator (intermediate)
// ─────────────────────────────────────────────────────────────────────────────

interface EdgeAccumulator {
  source: string;
  target: string;
  rate: number;
  errorRate: number;
  p95: number;
  connectionType: string;
  virtualNode: string;
  clientEnvironment: string;
  serverEnvironment: string;
  clientNamespace: string;
  serverNamespace: string;
  clientServiceName: string;
  serverServiceName: string;
  clientEksCluster: string;
  serverEksCluster: string;
  clientK8sDeploymentName: string;
  serverK8sDeploymentName: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main transform
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transforms Grafana DataFrames into a GraphModel keyed by workload.
 *
 * Node identity precedence per side:
 *   1. k8s_deployment_name (client_k8s_deployment_name / server_k8s_deployment_name)
 *   2. bare service.name (client / server) — v1 backward-compat
 *
 * @param frames - DataFrames from panel query runner
 * @param mapping - User-configured query role mapping
 * @returns GraphModel with nodes and edges
 */
export function transformToGraph(frames: DataFrame[], mapping: QueryRoleMapping): GraphModel {
  if (!frames || frames.length === 0) {
    return { nodes: [], edges: [] };
  }

  const edgeMap = new Map<string, EdgeAccumulator>();

  for (const frame of frames) {
    if (!frame.fields || frame.fields.length === 0 || frame.length === 0) {
      continue;
    }

    const role = classifyFrame(frame, mapping);
    if (!role) {
      continue;
    }

    // Node identity columns — precedence: k8s_deployment_name > bare client/server
    const clientK8sDeployField = findField(frame, 'client_k8s_deployment_name');
    const serverK8sDeployField = findField(frame, 'server_k8s_deployment_name');
    const clientBareField = findField(frame, 'client');
    const serverBareField = findField(frame, 'server');

    // At least one pair of identity columns must exist
    if (!clientK8sDeployField && !clientBareField) {
      continue;
    }
    if (!serverK8sDeployField && !serverBareField) {
      continue;
    }

    // M2 metadata columns
    const clientEnvField = findField(frame, 'client_deployment_environment');
    const serverEnvField = findField(frame, 'server_deployment_environment');
    const clientNsField = findField(frame, 'client_service_namespace');
    const serverNsField = findField(frame, 'server_service_namespace');
    const clientServiceNameField = findField(frame, 'client_service_name');
    const serverServiceNameField = findField(frame, 'server_service_name');
    const clientEksField = findField(frame, 'client_eks_cluster');
    const serverEksField = findField(frame, 'server_eks_cluster');
    const connectionTypeField = findField(frame, 'connection_type');
    const virtualNodeField = findField(frame, 'virtual_node');

    // Value field: typically named "Value" for instant vectors
    const valueField =
      findField(frame, 'Value') ??
      frame.fields.find((f) => f.type === 'number' && f.name.toLowerCase() !== 'time');

    for (let i = 0; i < frame.length; i++) {
      // Resolve node identity per side: k8s_deployment_name -> bare
      const clientK8sDeploy = stringValue(clientK8sDeployField, i);
      const serverK8sDeploy = stringValue(serverK8sDeployField, i);
      const clientBare = stringValue(clientBareField, i);
      const serverBare = stringValue(serverBareField, i);

      const clientNodeId = resolveNodeId(clientK8sDeploy, clientBare);
      const serverNodeId = resolveNodeId(serverK8sDeploy, serverBare);

      if (!clientNodeId || !serverNodeId) {
        continue;
      }

      const key = edgeKey(clientNodeId, serverNodeId);
      let acc = edgeMap.get(key);
      if (!acc) {
        acc = {
          source: clientNodeId,
          target: serverNodeId,
          rate: 0,
          errorRate: 0,
          p95: 0,
          connectionType: '',
          virtualNode: '',
          clientEnvironment: '',
          serverEnvironment: '',
          clientNamespace: '',
          serverNamespace: '',
          clientServiceName: '',
          serverServiceName: '',
          clientEksCluster: '',
          serverEksCluster: '',
          clientK8sDeploymentName: clientK8sDeploy,
          serverK8sDeploymentName: serverK8sDeploy,
        };
        edgeMap.set(key, acc);
      }

      const value = safeNumericValue(valueField, i);

      switch (role) {
        case 'rate':
          acc.rate = value;
          if (connectionTypeField) {
            const ct = stringValue(connectionTypeField, i);
            if (ct) {
              acc.connectionType = ct;
            }
          }
          if (virtualNodeField) {
            const vn = stringValue(virtualNodeField, i);
            if (vn) {
              acc.virtualNode = vn;
            }
          }
          // Capture metadata from rate frame (most complete)
          if (clientEnvField) {
            acc.clientEnvironment = stringValue(clientEnvField, i) || acc.clientEnvironment;
          }
          if (serverEnvField) {
            acc.serverEnvironment = stringValue(serverEnvField, i) || acc.serverEnvironment;
          }
          if (clientNsField) {
            acc.clientNamespace = stringValue(clientNsField, i) || acc.clientNamespace;
          }
          if (serverNsField) {
            acc.serverNamespace = stringValue(serverNsField, i) || acc.serverNamespace;
          }
          if (clientServiceNameField) {
            acc.clientServiceName = stringValue(clientServiceNameField, i) || acc.clientServiceName;
          }
          if (serverServiceNameField) {
            acc.serverServiceName = stringValue(serverServiceNameField, i) || acc.serverServiceName;
          }
          if (clientEksField) {
            acc.clientEksCluster = stringValue(clientEksField, i) || acc.clientEksCluster;
          }
          if (serverEksField) {
            acc.serverEksCluster = stringValue(serverEksField, i) || acc.serverEksCluster;
          }
          break;
        case 'error':
          acc.errorRate = value;
          break;
        case 'latency':
          acc.p95 = value;
          break;
      }
    }
  }

  // Build edges with computed errorRatio + cross-boundary flags
  const edges: GraphEdge[] = [];
  const nodeMap = new Map<string, {
    inRate: number;
    outRate: number;
    environment: string;
    namespace: string;
    serviceName: string;
    eksCluster: string;
    isVirtualServer: boolean;
    isVirtualClient: boolean;
    isDatabase: boolean;
    k8sDeploymentName: string;
  }>();

  const ensureNode = (id: string) => {
    if (!nodeMap.has(id)) {
      nodeMap.set(id, {
        inRate: 0,
        outRate: 0,
        environment: '',
        namespace: '',
        serviceName: '',
        eksCluster: '',
        isVirtualServer: false,
        isVirtualClient: false,
        isDatabase: false,
        k8sDeploymentName: '',
      });
    }
    return nodeMap.get(id)!;
  };

  for (const acc of edgeMap.values()) {
    const errorRatio = acc.rate > 0 ? Math.min(acc.errorRate / acc.rate, 1) : 0;

    edges.push({
      source: acc.source,
      target: acc.target,
      rate: acc.rate,
      errorRatio,
      p95: acc.p95,
      connectionType: acc.connectionType,
      crossEnvironment: isCrossEnvironment(acc.clientEnvironment, acc.serverEnvironment),
      crossNamespace: isCrossNamespace(acc.clientNamespace, acc.serverNamespace),
      clientEnvironment: acc.clientEnvironment,
      serverEnvironment: acc.serverEnvironment,
      clientNamespace: acc.clientNamespace,
      serverNamespace: acc.serverNamespace,
      virtualNode: acc.virtualNode,
    });

    // Source node (client side)
    const srcNode = ensureNode(acc.source);
    srcNode.outRate += acc.rate;
    if (acc.clientEnvironment) {
      srcNode.environment = acc.clientEnvironment;
    }
    if (acc.clientNamespace) {
      srcNode.namespace = acc.clientNamespace;
    }
    if (acc.clientServiceName) {
      srcNode.serviceName = acc.clientServiceName;
    }
    if (acc.clientEksCluster) {
      srcNode.eksCluster = acc.clientEksCluster;
    }
    if (acc.virtualNode === 'client') {
      srcNode.isVirtualClient = true;
    }
    if (acc.clientK8sDeploymentName) {
      srcNode.k8sDeploymentName = acc.clientK8sDeploymentName;
    }

    // Target node (server side)
    const tgtNode = ensureNode(acc.target);
    tgtNode.inRate += acc.rate;
    if (acc.serverEnvironment) {
      tgtNode.environment = acc.serverEnvironment;
    }
    if (acc.serverNamespace) {
      tgtNode.namespace = acc.serverNamespace;
    }
    if (acc.serverServiceName) {
      tgtNode.serviceName = acc.serverServiceName;
    }
    if (acc.serverEksCluster) {
      tgtNode.eksCluster = acc.serverEksCluster;
    }
    if (acc.virtualNode === 'server') {
      tgtNode.isVirtualServer = true;
    }
    if (acc.connectionType === 'database') {
      tgtNode.isDatabase = true;
    }
    if (acc.serverK8sDeploymentName) {
      tgtNode.k8sDeploymentName = acc.serverK8sDeploymentName;
    }
  }

  // Build nodes
  const nodes: GraphNode[] = [];
  for (const [id, data] of nodeMap.entries()) {
    nodes.push({
      id,
      inRate: data.inRate,
      outRate: data.outRate,
      totalRate: data.inRate + data.outRate,
      environment: data.environment || undefined,
      namespace: data.namespace || undefined,
      serviceName: data.serviceName || undefined,
      eksCluster: data.eksCluster || undefined,
      workload: data.k8sDeploymentName || undefined,
      unresolvedWorkload: isUnresolvedWorkload(id),
      isVirtualServer: data.isVirtualServer || undefined,
      isVirtualClient: data.isVirtualClient || undefined,
      isDatabase: data.isDatabase || undefined,
    });
  }

  // Sort nodes alphabetically for determinism
  nodes.sort((a, b) => a.id.localeCompare(b.id));

  return { nodes, edges };
}

// ─────────────────────────────────────────────────────────────────────────────
// M2: Filtering (connection_type + virtual-node toggles)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Options for filterGraph.
 */
export interface FilterOptions {
  connectionTypeFilter: ConnectionTypeFilter;
  showVirtualClients: boolean;
  showVirtualServers: boolean;
}

/**
 * Filters a GraphModel by connection_type and virtual-node visibility.
 * Returns a new model with only matching edges and their incident nodes.
 * Pure function — does not mutate input.
 */
export function filterGraph(model: GraphModel, opts: FilterOptions): GraphModel {
  if (!model || model.edges.length === 0) {
    return { nodes: [], edges: [] };
  }

  // Filter edges
  let filteredEdges = model.edges;

  // connection_type filter
  if (opts.connectionTypeFilter !== 'all') {
    if (opts.connectionTypeFilter === 'services') {
      // Only show edges that are NOT database or messaging_system
      filteredEdges = filteredEdges.filter(
        (e) => e.connectionType !== 'database' && e.connectionType !== 'messaging_system'
      );
    } else {
      // Show only the selected type
      filteredEdges = filteredEdges.filter((e) => e.connectionType === opts.connectionTypeFilter);
    }
  }

  // Virtual node filtering
  if (!opts.showVirtualClients) {
    filteredEdges = filteredEdges.filter((e) => e.virtualNode !== 'client');
  }
  if (!opts.showVirtualServers) {
    filteredEdges = filteredEdges.filter((e) => e.virtualNode !== 'server');
  }

  // Rebuild nodes from remaining edges
  const nodeIds = new Set<string>();
  for (const edge of filteredEdges) {
    nodeIds.add(edge.source);
    nodeIds.add(edge.target);
  }

  const filteredNodes = model.nodes.filter((n) => nodeIds.has(n.id));

  return { nodes: filteredNodes, edges: filteredEdges };
}

// ─────────────────────────────────────────────────────────────────────────────
// M2: Either-side matching filter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Filters edges by matching a value on either the client or server side.
 * Returns a new model with only matching edges and their incident nodes.
 */
export function filterByEitherSide(
  model: GraphModel,
  field: 'environment' | 'namespace' | 'workload',
  value: string
): GraphModel {
  if (!model || !value || model.edges.length === 0) {
    return model || { nodes: [], edges: [] };
  }

  const filteredEdges = model.edges.filter((edge) => {
    switch (field) {
      case 'environment':
        return edge.clientEnvironment === value || edge.serverEnvironment === value;
      case 'namespace':
        return edge.clientNamespace === value || edge.serverNamespace === value;
      case 'workload':
        return edge.source === value || edge.target === value;
    }
  });

  const nodeIds = new Set<string>();
  for (const e of filteredEdges) {
    nodeIds.add(e.source);
    nodeIds.add(e.target);
  }

  return {
    nodes: model.nodes.filter((n) => nodeIds.has(n.id)),
    edges: filteredEdges,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Health filter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Filters a GraphModel by node health status.
 * Pure function — does not mutate input.
 *
 * @param model - The graph model to filter.
 * @param healthMap - Pre-computed node health map (node id → HealthStatus).
 * @param filter - Which nodes to keep: 'all', 'healthy', or 'unhealthy'.
 * @returns Filtered GraphModel.
 */
export function filterByHealth(
  model: GraphModel,
  healthMap: Map<string, HealthStatus>,
  filter: HealthFilter
): GraphModel {
  if (!model || filter === 'all') {
    return model;
  }

  if (filter === 'healthy') {
    // Show all healthy nodes and edges where both endpoints are healthy.
    // Nodes without edges still appear (they are healthy leaf/root services).

    const healthyNodes = new Set<string>();
    for (const node of model.nodes) {
      if ((healthMap.get(node.id) ?? 'ok') === 'ok') {
        healthyNodes.add(node.id);
      }
    }

    if (healthyNodes.size === 0) {
      return { nodes: [], edges: [] };
    }

    const filteredEdges = model.edges.filter(
      (e) => healthyNodes.has(e.source) && healthyNodes.has(e.target)
    );

    return {
      nodes: model.nodes.filter((n) => healthyNodes.has(n.id)),
      edges: filteredEdges,
    };
  }

  // 'unhealthy' — show unhealthy nodes + full upstream path (all parents
  // that lead to them). This gives context: the user sees WHERE traffic
  // originates and the complete chain to the problematic node.

  // 1. Identify unhealthy seed nodes
  const unhealthyNodes = new Set<string>();
  for (const node of model.nodes) {
    const status = healthMap.get(node.id) ?? 'ok';
    if (status === 'warn' || status === 'crit') {
      unhealthyNodes.add(node.id);
    }
  }

  if (unhealthyNodes.size === 0) {
    return { nodes: [], edges: [] };
  }

  // 2. Build reverse adjacency (target → sources) for upstream BFS
  const reverseAdj = new Map<string, string[]>();
  for (const edge of model.edges) {
    if (!reverseAdj.has(edge.target)) {
      reverseAdj.set(edge.target, []);
    }
    reverseAdj.get(edge.target)!.push(edge.source);
  }

  // 3. BFS upstream from every unhealthy node to collect all ancestors
  const visibleNodes = new Set(unhealthyNodes);
  const queue = Array.from(unhealthyNodes);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const parent of reverseAdj.get(current) ?? []) {
      if (!visibleNodes.has(parent)) {
        visibleNodes.add(parent);
        queue.push(parent);
      }
    }
  }

  // 4. Include downstream children ONLY if they are also unhealthy (cascading)
  for (const edge of model.edges) {
    if (unhealthyNodes.has(edge.source) && unhealthyNodes.has(edge.target)) {
      visibleNodes.add(edge.target);
    }
  }

  // 5. Keep edges where both endpoints are visible
  const filteredEdges = model.edges.filter(
    (e) => visibleNodes.has(e.source) && visibleNodes.has(e.target)
  );

  return {
    nodes: model.nodes.filter((n) => visibleNodes.has(n.id)),
    edges: filteredEdges,
  };
}
