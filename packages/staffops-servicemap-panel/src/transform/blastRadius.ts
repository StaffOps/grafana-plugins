/**
 * Blast-radius traversal: BFS upstream + downstream from a given node.
 * Pure function — no side effects. Designed for independent unit testing.
 */

import { GraphModel } from '../types';

/** Result of a blast-radius computation. */
export interface BlastRadiusResult {
  /** Set of node IDs in the highlighted zone (includes the origin). */
  highlighted: Set<string>;
  /** Set of edge keys (source\x00target) in the highlighted zone. */
  highlightedEdges: Set<string>;
}

/**
 * Computes the blast radius for a given node: BFS N hops upstream (callers)
 * and N hops downstream (dependencies).
 *
 * @param model - The graph model.
 * @param nodeId - The origin node ID.
 * @param hops - Number of hops (default 1). Must be >= 1.
 * @returns Set of highlighted node IDs and edge keys.
 */
export function computeBlastRadius(
  model: GraphModel,
  nodeId: string,
  hops: number = 1
): BlastRadiusResult {
  const highlighted = new Set<string>();
  const highlightedEdges = new Set<string>();

  if (!model || !nodeId || hops < 1) {
    return { highlighted, highlightedEdges };
  }

  // Check node exists
  const nodeExists = model.nodes.some((n) => n.id === nodeId);
  if (!nodeExists) {
    return { highlighted, highlightedEdges };
  }

  highlighted.add(nodeId);

  // Build adjacency: downstream (source→targets) and upstream (target→sources)
  const downstream = new Map<string, Array<{ target: string; edgeKey: string }>>();
  const upstream = new Map<string, Array<{ source: string; edgeKey: string }>>();

  for (const edge of model.edges) {
    const ek = `${edge.source}\x00${edge.target}`;

    if (!downstream.has(edge.source)) {
      downstream.set(edge.source, []);
    }
    downstream.get(edge.source)!.push({ target: edge.target, edgeKey: ek });

    if (!upstream.has(edge.target)) {
      upstream.set(edge.target, []);
    }
    upstream.get(edge.target)!.push({ source: edge.source, edgeKey: ek });
  }

  // BFS downstream
  let frontier = new Set<string>([nodeId]);
  for (let hop = 0; hop < hops; hop++) {
    const nextFrontier = new Set<string>();
    for (const current of frontier) {
      const neighbors = downstream.get(current) ?? [];
      for (const { target, edgeKey } of neighbors) {
        highlightedEdges.add(edgeKey);
        if (!highlighted.has(target)) {
          highlighted.add(target);
          nextFrontier.add(target);
        }
      }
    }
    frontier = nextFrontier;
    if (frontier.size === 0) {
      break;
    }
  }

  // BFS upstream
  frontier = new Set<string>([nodeId]);
  for (let hop = 0; hop < hops; hop++) {
    const nextFrontier = new Set<string>();
    for (const current of frontier) {
      const neighbors = upstream.get(current) ?? [];
      for (const { source, edgeKey } of neighbors) {
        highlightedEdges.add(edgeKey);
        if (!highlighted.has(source)) {
          highlighted.add(source);
          nextFrontier.add(source);
        }
      }
    }
    frontier = nextFrontier;
    if (frontier.size === 0) {
      break;
    }
  }

  return { highlighted, highlightedEdges };
}
