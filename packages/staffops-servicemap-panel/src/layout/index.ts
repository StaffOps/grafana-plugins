/**
 * Layout module: positions graph nodes using the DAG algorithm.
 *
 * All layout functions are pure and deterministic (deterministic initial
 * conditions / ordering). No Grafana runtime coupling.
 */

import { GraphModel, PositionedGraph, PositionedNode, LayoutDirection } from '../types';

/** Minimal positioned-node accumulator used by the layout algorithms. */
interface LayoutNode {
  id: string;
  x?: number;
  y?: number;
  layerIndex?: number;
  layer?: number;
  wrapped?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Compact spacing constants
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum gap (px) between nodes within the same layer. */
export const MIN_INTRA_LAYER_GAP = 90;

/** Gap (px) between layers in the DAG direction (vertical). */
export const INTER_LAYER_GAP = 120;

/** Max node radius (px) — mirror of view NODE_RADIUS_MAX, used for tight packing. */
const MAX_NODE_RADIUS = 38;

/** Comfortable default gap between siblings in a layer (compact). */
const COMFORTABLE_NODE_GAP = 64;

/** Tightest gap between siblings (centers) when a stack is dense. */
const TIGHT_SIBLING_GAP = 42;

/** Max nodes per sub-column before wrapping into a balanced grid. */
const MAX_PER_STACK = 15;

/** Maximum number of columns/layers rendered (deeper layers collapse into the last). */
const MAX_COLUMNS = 3;

/** Minimum gap between columns/rows (advancing direction). */
const MIN_LAYER_GAP = 150;

/** Maximum gap between columns/rows — used when a column overflows. */
const MAX_LAYER_GAP = 340;

/** Padding (px) reserved inside the viewport when computing spacing. */
const PADDING = 60;

/**
 * Lays out the graph using the DAG (layered / hierarchical) algorithm.
 *
 * @param model - The graph model with nodes and edges.
 * @param width - Available viewport width in pixels (used to scale node positions).
 * @param height - Available viewport height in pixels (used to scale node positions).
 * @param direction - Layout direction: 'top-down' or 'left-right'. Default 'top-down'.
 * @returns PositionedGraph with node coordinates scaled to fit the viewport.
 */
export function layoutGraph(
  model: GraphModel,
  width: number,
  height: number,
  direction: LayoutDirection = 'top-down'
): PositionedGraph {
  if (model.nodes.length === 0) {
    return { nodes: [], edges: model.edges };
  }

  return dagLayout(model, width, height, direction);
}

// ─────────────────────────────────────────────────────────────────────────────
// DAG layout (layered by client→server direction, cycles broken)
// ─────────────────────────────────────────────────────────────────────────────

function dagLayout(model: GraphModel, width: number, height: number, direction: LayoutDirection): PositionedGraph {
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

  // Cap at MAX_COLUMNS: collapse every deeper layer into the last column so
  // the graph always renders as at most N columns (sources | center | rest).
  const maxColumnIndex = MAX_COLUMNS - 1;
  for (const [id, layer] of layers.entries()) {
    if (layer > maxColumnIndex) {
      layers.set(id, maxColumnIndex);
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

  // ── Adaptive spacing with grid-wrapping ───────────────────────────────────
  // A layer with too many nodes to fit the node-axis is wrapped into a grid
  // block (multiple sub-columns) instead of one overflowing line. Layers then
  // advance by a cumulative offset that accounts for each block's thickness.
  const numLayers = Math.max(layerGroups.size, 1);
  const isHorizontal = direction === 'left-right';

  // Which viewport dimension maps to each axis.
  const nodeAxisSize = isHorizontal ? height : width;   // siblings stack here
  const layerAxisSize = isHorizontal ? width : height;  // columns/rows advance here

  const availNodeAxis = Math.max(nodeAxisSize - PADDING * 2, 1);
  const availLayerAxis = Math.max(layerAxisSize - PADDING * 2, 1);

  // Tighter sibling gap: uses a typical (not max) radius so small nodes pack
  // close; big hubs are rare. Centers ~TIGHT_SIBLING_GAP apart.
  const tightGap = TIGHT_SIBLING_GAP;

  // Max nodes per sub-column: capped so a stack never gets unwieldy; beyond
  // this the layer wraps into balanced sub-columns.
  const perStackFit = Math.max(1, Math.floor(availNodeAxis / tightGap) + 1);
  const perStackCap = Math.min(perStackFit, MAX_PER_STACK);

  // Sibling gap: comfortable when few, tighten toward tightGap when many.
  const maxNodesInLayer = Math.max(
    ...Array.from(layerGroups.values()).map((ids) => ids.length),
    1
  );
  const stackCount = Math.min(maxNodesInLayer, perStackCap);
  const idealNodeGap = stackCount > 1 ? availNodeAxis / (stackCount - 1) : COMFORTABLE_NODE_GAP;
  const nodeGap = Math.max(tightGap, Math.min(COMFORTABLE_NODE_GAP, idealNodeGap));

  // Gap between sub-columns within a wrapped block: wide enough for the node
  // plus its right-side label (computed per layer from the longest name).
  const CHAR_WIDTH = 8.5; // px per char at 15px bold
  const subColBaseWidth = 2 * MAX_NODE_RADIUS + 24;

  // Does any layer wrap (i.e., need more than one sub-column)?
  const anyWrapped = maxNodesInLayer > perStackCap;

  // Base gap between one layer's block and the next. Wider when wrapping so
  // blocks stay visually separated.
  const idealLayerGap = numLayers > 1 ? availLayerAxis / (numLayers - 1) : MIN_LAYER_GAP;
  const baseLayerGap = anyWrapped
    ? MAX_LAYER_GAP
    : Math.max(MIN_LAYER_GAP, Math.min(MAX_LAYER_GAP, idealLayerGap));

  const simNodes: LayoutNode[] = [];

  // Sort layers ascending so cursor advances left→right / top→down.
  const sortedLayers = Array.from(layerGroups.keys()).sort((a, b) => a - b);
  let cursor = 0; // running position along the layer axis

  sortedLayers.forEach((layer, layerOrdinal) => {
    const nodeIds = layerGroups.get(layer)!.slice().sort();
    const n = nodeIds.length;

    // Balanced wrap: split evenly across sub-columns (e.g. 20 → 10+10, not 15+5).
    const subCols = Math.ceil(n / perStackCap);
    const perColumn = Math.ceil(n / subCols);
    const rowsInBlock = Math.min(n, perColumn);
    const wrapped = subCols > 1;

    // Sub-column spacing: wrapped blocks reserve room for right-side labels.
    const longestLabel = nodeIds.reduce((m, id) => Math.max(m, id.length), 0);
    const subColGap = subColBaseWidth + longestLabel * CHAR_WIDTH;

    // Alternate layers are staggered by half a gap so their nodes sit at the
    // MIDPOINTS of the neighbouring column's intervals — lets columns sit
    // closer with angled edges instead of head-on alignment.
    const stagger = (layerOrdinal % 2 === 1) ? nodeGap / 2 : 0;

    // Center the block on the node-axis.
    const blockNodeExtent = (rowsInBlock - 1) * nodeGap;
    const startNodeAxis = -blockNodeExtent / 2 + stagger;

    nodeIds.forEach((id, idx) => {
      const col = Math.floor(idx / perColumn);
      const row = idx % perColumn;
      const nodePos = startNodeAxis + row * nodeGap;
      const layerPos = cursor + col * subColGap;
      if (isHorizontal) {
        simNodes.push({ id, x: layerPos, y: nodePos, layerIndex: row, layer, wrapped });
      } else {
        simNodes.push({ id, x: nodePos, y: layerPos, layerIndex: row, layer, wrapped });
      }
    });

    // Advance cursor past this block's thickness + the layer gap.
    const blockThickness = (subCols - 1) * subColGap;
    cursor += blockThickness + baseLayerGap;
  });

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
      layerIndex: sn.layerIndex ?? 0,
      layer: sn.layer ?? 0,
      totalLayers: numLayers,
      wrapped: sn.wrapped ?? false,
    };
  });

  return { nodes: positioned, edges: model.edges };
}
