/**
 * Layout module: positions graph nodes using the DAG algorithm.
 *
 * All layout functions are pure and deterministic (deterministic initial
 * conditions / ordering). No Grafana runtime coupling.
 */

import { GraphModel, PositionedGraph, PositionedNode } from '../types';

/** Minimal positioned-node accumulator used by the layout algorithms. */
interface LayoutNode {
  id: string;
  x?: number;
  y?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Compact spacing constants
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum gap (px) between nodes within the same layer. */
export const MIN_INTRA_LAYER_GAP = 90;

/** Gap (px) between layers in the DAG direction (vertical). */
export const INTER_LAYER_GAP = 120;

/**
 * Lays out the graph using the DAG (layered / hierarchical) algorithm.
 *
 * @param model - The graph model with nodes and edges.
 * @param width - Available viewport width in pixels (unused for spacing — compact layout).
 * @param height - Available viewport height in pixels (unused for spacing — compact layout).
 * @returns PositionedGraph with node coordinates in compact absolute positions.
 */
export function layoutGraph(
  model: GraphModel,
  width: number,
  height: number
): PositionedGraph {
  if (model.nodes.length === 0) {
    return { nodes: [], edges: model.edges };
  }

  return dagLayout(model, width, height);
}

// ─────────────────────────────────────────────────────────────────────────────
// DAG layout (layered by client→server direction, cycles broken)
// ─────────────────────────────────────────────────────────────────────────────

function dagLayout(model: GraphModel, _width: number, _height: number): PositionedGraph {
  // Topological layering with cycle breaking (Kahn's algorithm variant)
  const inDegree = new Map<string, number>();
  const outEdges = new Map<string, string[]>();

  for (const node of model.nodes) {
    inDegree.set(node.id, 0);
    outEdges.set(node.id, []);
  }

  for (const edge of model.edges) {
    if (inDegree.has(edge.source) && inDegree.has(edge.target)) {
      outEdges.get(edge.source)!.push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    }
  }

  // Assign layers using modified Kahn's algorithm
  const layers = new Map<string, number>();
  const queue: string[] = [];

  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) {
      queue.push(id);
      layers.set(id, 0);
    }
  }

  const visited = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    const currentLayer = layers.get(current) ?? 0;

    for (const target of outEdges.get(current) ?? []) {
      const newLayer = currentLayer + 1;
      const existing = layers.get(target);
      if (existing === undefined || newLayer > existing) {
        layers.set(target, newLayer);
      }
      inDegree.set(target, (inDegree.get(target) ?? 1) - 1);
      if ((inDegree.get(target) ?? 0) <= 0) {
        queue.push(target);
      }
    }
  }

  // Handle cycle remnants: nodes not visited get max layer + 1
  const maxLayer = Math.max(...layers.values(), 0);
  for (const node of model.nodes) {
    if (!layers.has(node.id)) {
      layers.set(node.id, maxLayer + 1);
    }
  }

  // Group nodes by layer
  const layerGroups = new Map<number, string[]>();
  for (const [id, layer] of layers.entries()) {
    if (!layerGroups.has(layer)) {
      layerGroups.set(layer, []);
    }
    layerGroups.get(layer)!.push(id);
  }

  // Compact spacing: fixed gaps between nodes, not stretched to fill panel
  const gap = MIN_INTRA_LAYER_GAP;
  const layerGap = INTER_LAYER_GAP;

  const simNodes: LayoutNode[] = [];

  for (const [layer, nodeIds] of layerGroups.entries()) {
    nodeIds.sort(); // deterministic
    const layerWidth = (nodeIds.length - 1) * gap;
    const startX = -layerWidth / 2;
    const y = layer * layerGap;
    nodeIds.forEach((id, i) => {
      simNodes.push({ id, x: startX + i * gap, y });
    });
  }

  // Build a lookup from model nodes for rates
  const nodeDataMap = new Map(model.nodes.map((n) => [n.id, n]));

  const positioned: PositionedNode[] = simNodes.map((sn) => {
    const nd = nodeDataMap.get(sn.id);
    return {
      ...nd,
      id: sn.id,
      inRate: nd?.inRate ?? 0,
      outRate: nd?.outRate ?? 0,
      totalRate: nd?.totalRate ?? 0,
      x: sn.x ?? 0,
      y: sn.y ?? 0,
    };
  });

  return { nodes: positioned, edges: model.edges };
}
