/**
 * Pure function: computes the full reachable dependency subgraph for a node.
 *
 * BFS upstream (callers, transitively) + downstream (dependencies, transitively)
 * up to a configurable maximum hop depth. Used for client-side drill isolation.
 *
 * Handles cycles, disconnected components, and depth limits.
 * No side effects — designed for independent unit testing.
 */

import { GraphModel } from '../types';

/**
 * Computes the set of node IDs reachable from a given node via BFS
 * in both upstream (callers) and downstream (dependencies) directions.
 *
 * @param model - The graph model containing nodes and edges.
 * @param nodeId - The origin node ID to start traversal from.
 * @param maxHops - Maximum BFS depth in each direction. 0 = origin only.
 *                  Infinity or very large number = full reachable component.
 *                  Default: Infinity (full reachable subgraph).
 * @returns Set of node IDs in the reachable subgraph (always includes nodeId if it exists).
 */
export function reachableSubgraph(
  model: GraphModel,
  nodeId: string,
  maxHops = Infinity
): Set<string> {
  const result = new Set<string>();

  // Guard: empty/null model or missing nodeId
  if (!model || !model.nodes || !model.edges || !nodeId) {
    return result;
  }

  // Guard: node must exist in the model
  const nodeExists = model.nodes.some((n) => n.id === nodeId);
  if (!nodeExists) {
    return result;
  }

  // Origin is always included
  result.add(nodeId);

  // Depth 0 means origin only
  if (maxHops <= 0) {
    return result;
  }

  // Build adjacency maps
  const downstream = new Map<string, string[]>(); // source -> targets
  const upstream = new Map<string, string[]>(); // target -> sources

  for (const edge of model.edges) {
    if (!downstream.has(edge.source)) {
      downstream.set(edge.source, []);
    }
    downstream.get(edge.source)!.push(edge.target);

    if (!upstream.has(edge.target)) {
      upstream.set(edge.target, []);
    }
    upstream.get(edge.target)!.push(edge.source);
  }

  // BFS downstream (dependencies)
  let frontier = new Set<string>([nodeId]);
  for (let hop = 0; hop < maxHops; hop++) {
    const nextFrontier = new Set<string>();
    for (const current of frontier) {
      const neighbors = downstream.get(current) ?? [];
      for (const neighbor of neighbors) {
        if (!result.has(neighbor)) {
          result.add(neighbor);
          nextFrontier.add(neighbor);
        }
      }
    }
    frontier = nextFrontier;
    if (frontier.size === 0) {
      break;
    }
  }

  // BFS upstream (callers)
  frontier = new Set<string>([nodeId]);
  for (let hop = 0; hop < maxHops; hop++) {
    const nextFrontier = new Set<string>();
    for (const current of frontier) {
      const neighbors = upstream.get(current) ?? [];
      for (const neighbor of neighbors) {
        if (!result.has(neighbor)) {
          result.add(neighbor);
          nextFrontier.add(neighbor);
        }
      }
    }
    frontier = nextFrontier;
    if (frontier.size === 0) {
      break;
    }
  }

  return result;
}
