/**
 * Tests for layoutGraph — the pure layout function.
 *
 * NEW CONTRACT (compact spacing):
 * - Input: GraphModel + width + height (width/height unused for spacing)
 * - Output: PositionedGraph with compact absolute coordinates using fixed gaps
 * - Deterministic (deterministic ordering / initial conditions)
 * - Uses DAG layout (layered by client→server direction, cycles broken)
 * - All nodes must appear in output (node count preserved)
 * - Intra-layer gap = MIN_INTRA_LAYER_GAP (90px)
 * - Inter-layer gap = INTER_LAYER_GAP (120px)
 */

import { layoutGraph, MIN_INTRA_LAYER_GAP, INTER_LAYER_GAP } from './index';
import { GraphModel, GraphNode, GraphEdge } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeModel(nodeIds: string[], edgePairs: [string, string, number?][]): GraphModel {
  const nodeRates = new Map<string, { inRate: number; outRate: number }>();
  for (const id of nodeIds) {
    nodeRates.set(id, { inRate: 0, outRate: 0 });
  }
  const edges: GraphEdge[] = edgePairs.map(([src, tgt, rate = 10]) => {
    if (!nodeRates.has(src)) {
      nodeRates.set(src, { inRate: 0, outRate: 0 });
    }
    if (!nodeRates.has(tgt)) {
      nodeRates.set(tgt, { inRate: 0, outRate: 0 });
    }
    nodeRates.get(src)!.outRate += rate;
    nodeRates.get(tgt)!.inRate += rate;
    return { source: src, target: tgt, rate, errorRatio: 0, p95: 0, connectionType: '' };
  });
  const nodes: GraphNode[] = [...nodeRates.entries()]
    .map(([id, r]) => ({ id, inRate: r.inRate, outRate: r.outRate, totalRate: r.inRate + r.outRate }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return { nodes, edges };
}

const WIDTH = 800;
const HEIGHT = 600;

// ─────────────────────────────────────────────────────────────────────────────
// Empty graph
// ─────────────────────────────────────────────────────────────────────────────

describe('layoutGraph — empty graph', () => {
  it('returns empty nodes array for empty model', () => {
    const model: GraphModel = { nodes: [], edges: [] };
    const result = layoutGraph(model, WIDTH, HEIGHT);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it('preserves edges reference for empty nodes', () => {
    const model: GraphModel = { nodes: [], edges: [] };
    const result = layoutGraph(model, WIDTH, HEIGHT);
    expect(result.edges).toBe(model.edges);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Node count preserved
// ─────────────────────────────────────────────────────────────────────────────

describe('layoutGraph — node count preserved', () => {
  it('all nodes in output for linear chain', () => {
    const model = makeModel(['a', 'b', 'c', 'd'], [['a', 'b'], ['b', 'c'], ['c', 'd']]);
    const result = layoutGraph(model, WIDTH, HEIGHT);
    expect(result.nodes).toHaveLength(4);
    const ids = result.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(['a', 'b', 'c', 'd']);
  });

  it('all nodes in output for disconnected graph', () => {
    const model = makeModel(['a', 'b', 'c', 'd'], [['a', 'b']]);
    const result = layoutGraph(model, WIDTH, HEIGHT);
    expect(result.nodes).toHaveLength(4);
  });

  it('single node graph preserves node', () => {
    const model: GraphModel = {
      nodes: [{ id: 'solo', inRate: 0, outRate: 0, totalRate: 0 }],
      edges: [],
    };
    const result = layoutGraph(model, WIDTH, HEIGHT);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe('solo');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Determinism
// ─────────────────────────────────────────────────────────────────────────────

describe('layoutGraph — determinism', () => {
  it('same input produces identical output on multiple calls', () => {
    const model = makeModel(['a', 'b', 'c'], [['a', 'b', 50], ['b', 'c', 30], ['a', 'c', 20]]);
    const r1 = layoutGraph(model, WIDTH, HEIGHT);
    const r2 = layoutGraph(model, WIDTH, HEIGHT);
    expect(r1.nodes).toEqual(r2.nodes);
  });

  it('output is deterministic with 10 nodes', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `svc-${i}`);
    const edges: [string, string, number][] = ids.slice(0, 9).map((id, i) => [id, ids[i + 1], (i + 1) * 5]);
    const model = makeModel(ids, edges);
    const r1 = layoutGraph(model, WIDTH, HEIGHT);
    const r2 = layoutGraph(model, WIDTH, HEIGHT);
    for (let i = 0; i < r1.nodes.length; i++) {
      expect(r1.nodes[i].x).toBe(r2.nodes[i].x);
      expect(r1.nodes[i].y).toBe(r2.nodes[i].y);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Compact spacing: fixed min gap
// ─────────────────────────────────────────────────────────────────────────────

describe('layoutGraph — compact spacing', () => {
  it('intra-layer gap between nodes equals MIN_INTRA_LAYER_GAP', () => {
    // a -> b, a -> c → a in layer 0, b and c in layer 1
    const model = makeModel(['a', 'b', 'c'], [['a', 'b'], ['a', 'c']]);
    const result = layoutGraph(model, WIDTH, HEIGHT);
    // b and c are in the same layer (layer 1), sorted alphabetically
    const layer1 = result.nodes.filter((n) => n.id === 'b' || n.id === 'c').sort((a, b) => a.id.localeCompare(b.id));
    expect(layer1).toHaveLength(2);
    const gap = Math.abs(layer1[1].x - layer1[0].x);
    expect(gap).toBeCloseTo(MIN_INTRA_LAYER_GAP, 1);
  });

  it('inter-layer gap between layers equals INTER_LAYER_GAP', () => {
    // a -> b: a in layer 0, b in layer 1
    const model = makeModel(['a', 'b'], [['a', 'b']]);
    const result = layoutGraph(model, WIDTH, HEIGHT);
    const nodeA = result.nodes.find((n) => n.id === 'a')!;
    const nodeB = result.nodes.find((n) => n.id === 'b')!;
    expect(nodeB.y - nodeA.y).toBeCloseTo(INTER_LAYER_GAP, 1);
  });

  it('spacing is independent of viewport dimensions', () => {
    const model = makeModel(['a', 'b', 'c'], [['a', 'b'], ['a', 'c']]);
    const r1 = layoutGraph(model, 400, 300);
    const r2 = layoutGraph(model, 1920, 1080);
    // Exact same positions regardless of viewport
    for (let i = 0; i < r1.nodes.length; i++) {
      expect(r1.nodes[i].x).toBe(r2.nodes[i].x);
      expect(r1.nodes[i].y).toBe(r2.nodes[i].y);
    }
  });

  it('single node in layer is centered at x=0', () => {
    const model = makeModel(['a', 'b'], [['a', 'b']]);
    const result = layoutGraph(model, WIDTH, HEIGHT);
    const nodeA = result.nodes.find((n) => n.id === 'a')!;
    const nodeB = result.nodes.find((n) => n.id === 'b')!;
    // Each is the only node in its layer → layerWidth = 0 → startX = 0 → x = 0
    expect(nodeA.x).toBe(0);
    expect(nodeB.x).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DAG-specific: cycle handling
// ─────────────────────────────────────────────────────────────────────────────

describe('layoutGraph — dag cycle handling', () => {
  it('does not crash on a simple cycle (A→B→C→A)', () => {
    const model = makeModel(['a', 'b', 'c'], [['a', 'b'], ['b', 'c'], ['c', 'a']]);
    expect(() => layoutGraph(model, WIDTH, HEIGHT)).not.toThrow();
  });

  it('produces all nodes even with multiple cycles', () => {
    const model = makeModel(
      ['a', 'b', 'c', 'd'],
      [['a', 'b'], ['b', 'c'], ['c', 'a'], ['c', 'd'], ['d', 'b']]
    );
    const result = layoutGraph(model, WIDTH, HEIGHT);
    expect(result.nodes).toHaveLength(4);
  });

  it('handles self-loop in dag mode', () => {
    const model = makeModel(['a', 'b'], [['a', 'b'], ['b', 'b']]);
    expect(() => layoutGraph(model, WIDTH, HEIGHT)).not.toThrow();
    const result = layoutGraph(model, WIDTH, HEIGHT);
    expect(result.nodes).toHaveLength(2);
  });

  it('handles fully-connected cycle (all nodes cycle)', () => {
    const model = makeModel(
      ['a', 'b', 'c', 'd'],
      [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a']]
    );
    const result = layoutGraph(model, WIDTH, HEIGHT);
    expect(result.nodes).toHaveLength(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge preservation
// ─────────────────────────────────────────────────────────────────────────────

describe('layoutGraph — edge preservation', () => {
  it('edges array is passed through unchanged', () => {
    const model = makeModel(['a', 'b'], [['a', 'b', 42]]);
    const result = layoutGraph(model, WIDTH, HEIGHT);
    expect(result.edges).toBe(model.edges);
    expect(result.edges[0].rate).toBe(42);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Large graph (stress)
// ─────────────────────────────────────────────────────────────────────────────

describe('layoutGraph — large graph', () => {
  it('handles 50-node graph without crashing', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `node-${i}`);
    const edgePairs: [string, string, number][] = [];
    for (let i = 0; i < 49; i++) {
      edgePairs.push([ids[i], ids[i + 1], i + 1]);
    }
    edgePairs.push([ids[0], ids[25], 10]);
    edgePairs.push([ids[49], ids[0], 5]);
    const model = makeModel(ids, edgePairs);
    const result = layoutGraph(model, WIDTH, HEIGHT);
    expect(result.nodes).toHaveLength(50);
  });
});
