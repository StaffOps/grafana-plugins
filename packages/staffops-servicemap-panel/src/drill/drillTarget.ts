/**
 * Pure function that determines whether a node is drillable (re-root the map).
 *
 * Drillable only for 'service' kind nodes that have both deployment_environment
 * and service_namespace. Database, queue, and external nodes are NOT drillable.
 */

import { GraphNode, GraphEdge } from '../types';
import { classifyNode, NodeKind } from '../viz/nodeKind';

/** The resolved drill target variables for locationService. */
export interface DrillTargetVars {
  environment: string;
  namespace: string;
  service: string;
}

/**
 * Returns the drill target for a node, or null if the node is not drillable.
 *
 * A node is drillable when:
 * 1. Its kind is 'service' (not database/queue/external)
 * 2. It has a non-empty deployment_environment
 * 3. It has a non-empty service_namespace (namespace)
 *
 * @param node - The graph node to evaluate
 * @param edges - All edges in the graph (needed for kind classification)
 * @returns DrillTargetVars if drillable, null otherwise
 */
export function drillTarget(node: GraphNode, edges: GraphEdge[]): DrillTargetVars | null {
  const kind: NodeKind = classifyNode(node, edges);

  // Only service nodes are drillable
  if (kind !== 'service') {
    return null;
  }

  // Must have both environment and namespace
  const environment = node.environment;
  const namespace = node.namespace;

  if (!environment || !namespace) {
    return null;
  }

  return {
    environment,
    namespace,
    service: node.id,
  };
}
