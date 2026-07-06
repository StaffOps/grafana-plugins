/**
 * Node-kind classification — pure function that derives a node's
 * infrastructure kind from edges where it appears as the TARGET (server).
 *
 * Channel separation invariant:
 *   - fill/glyph = kind (this module)
 *   - ring = health
 *   - size = traffic
 *   - edge color = health
 *   - edge style = cross-boundary
 */

import { GraphNode, GraphEdge } from '../types';

/** Discrete node kind for visual classification. */
export type NodeKind = 'service' | 'database' | 'queue' | 'external';

/**
 * Classifies a node's kind based on the edges where it is the TARGET (server).
 *
 * Precedence when mixed: database > queue > external > service.
 *
 * @param node - The node to classify.
 * @param edges - All edges in the graph.
 * @returns The node's kind.
 */
export function classifyNode(node: GraphNode, edges: GraphEdge[]): NodeKind {
  let hasDatabase = false;
  let hasQueue = false;
  let hasExternal = false;

  for (const edge of edges) {
    // Only consider edges where this node is the target (server side)
    if (edge.target !== node.id) {
      continue;
    }

    const ct = edge.connectionType ?? '';

    if (ct === 'database') {
      hasDatabase = true;
      // database is highest precedence — can short-circuit
      break;
    }

    if (ct === 'messaging_system') {
      hasQueue = true;
    }

    // external: virtual_node=server on the edge (uninstrumented external dep)
    if (edge.virtualNode === 'server' || ct === 'virtual_node') {
      hasExternal = true;
    }
  }

  // Precedence: database > queue > external > service
  if (hasDatabase) {
    return 'database';
  }
  if (hasQueue) {
    return 'queue';
  }
  if (hasExternal) {
    return 'external';
  }
  return 'service';
}

/**
 * Theme-aware fill colors per kind.
 * These MUST avoid green/amber/red (reserved for health ring).
 *
 * Uses static hex values that work well in both light and dark Grafana themes.
 * The component passes the theme for the 'service' fallback (neutral bg).
 */
export const NODE_KIND_COLORS: Record<NodeKind, string> = {
  service: '', // Filled at render time from theme.colors.background.secondary
  database: '#8b5cf6', // Violet — distinct from health palette
  queue: '#06b6d4', // Cyan/teal — distinct from health palette
  external: '#64748b', // Slate/gray-blue — distinct from health palette
};

/** Display labels for legend entries. */
export const NODE_KIND_LABELS: Record<NodeKind, string> = {
  service: 'Service',
  database: 'Database',
  queue: 'Queue',
  external: 'External',
};
