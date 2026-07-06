/**
 * Unit tests for reachableSubgraph — client-side multi-hop traversal.
 * Covers: upstream+downstream, cycles, depth limit, isolated node,
 * non-existent node, empty model, degenerate inputs.
 */

import { reachableSubgraph } from './reachableSubgraph';
import { GraphModel, GraphNode, GraphEdge } from '../types';

function node(id: string): GraphNode {
  return { id, inRate: 1, outRate: 1, totalRate: 2 };
}

function edge(source: string, target: string): GraphEdge {
  return {
    source,
    target,
    rate: 10,
    errorRatio: 0,
    p95: 0.05,
    connectionType: '',
  };
}

describe('reachableSubgraph', () => {
  describe('basic traversal', () => {
    // A -> B -> C -> D
    const model: GraphModel = {
      nodes: [node('A'), node('B'), node('C'), node('D')],
      edges: [edge('A', 'B'), edge('B', 'C'), edge('C', 'D')],
    };

    it('returns full downstream from A (no depth limit)', () => {
      const result = reachableSubgraph(model, 'A');
      expect(result).toEqual(new Set(['A', 'B', 'C', 'D']));
    });

    it('returns full upstream from D', () => {
      const result = reachableSubgraph(model, 'D');
      expect(result).toEqual(new Set(['A', 'B', 'C', 'D']));
    });

    it('returns both directions from B (middle node)', () => {
      const result = reachableSubgraph(model, 'B');
      expect(result).toEqual(new Set(['A', 'B', 'C', 'D']));
    });
  });

  describe('depth limiting (maxHops)', () => {
    // A -> B -> C -> D -> E
    const model: GraphModel = {
      nodes: [node('A'), node('B'), node('C'), node('D'), node('E')],
      edges: [edge('A', 'B'), edge('B', 'C'), edge('C', 'D'), edge('D', 'E')],
    };

    it('maxHops=1 from C gives B, C, D (1 hop each direction)', () => {
      const result = reachableSubgraph(model, 'C', 1);
      expect(result).toEqual(new Set(['B', 'C', 'D']));
    });

    it('maxHops=2 from C gives A, B, C, D, E', () => {
      const result = reachableSubgraph(model, 'C', 2);
      expect(result).toEqual(new Set(['A', 'B', 'C', 'D', 'E']));
    });

    it('maxHops=0 returns only the origin', () => {
      const result = reachableSubgraph(model, 'C', 0);
      expect(result).toEqual(new Set(['C']));
    });

    it('maxHops=1 from A gives A, B only (no upstream)', () => {
      const result = reachableSubgraph(model, 'A', 1);
      expect(result).toEqual(new Set(['A', 'B']));
    });

    it('maxHops=1 from E gives D, E only (no downstream)', () => {
      const result = reachableSubgraph(model, 'E', 1);
      expect(result).toEqual(new Set(['D', 'E']));
    });
  });

  describe('cycles', () => {
    // A -> B -> C -> A (cycle) + C -> D
    const model: GraphModel = {
      nodes: [node('A'), node('B'), node('C'), node('D')],
      edges: [edge('A', 'B'), edge('B', 'C'), edge('C', 'A'), edge('C', 'D')],
    };

    it('handles cycle without infinite loop (full reachable from A)', () => {
      const result = reachableSubgraph(model, 'A');
      expect(result).toEqual(new Set(['A', 'B', 'C', 'D']));
    });

    it('handles cycle with depth limit (maxHops=1 from A)', () => {
      // downstream: A->B (1 hop); upstream: C->A so C is upstream
      const result = reachableSubgraph(model, 'A', 1);
      expect(result).toEqual(new Set(['A', 'B', 'C']));
    });

    it('handles self-loop', () => {
      const selfLoop: GraphModel = {
        nodes: [node('X'), node('Y')],
        edges: [edge('X', 'X'), edge('X', 'Y')],
      };
      const result = reachableSubgraph(selfLoop, 'X');
      expect(result).toEqual(new Set(['X', 'Y']));
    });
  });

  describe('isolated node', () => {
    const model: GraphModel = {
      nodes: [node('A'), node('B'), node('isolated')],
      edges: [edge('A', 'B')],
    };

    it('isolated node returns only itself', () => {
      const result = reachableSubgraph(model, 'isolated');
      expect(result).toEqual(new Set(['isolated']));
    });
  });

  describe('branching graph (fan-out and fan-in)', () => {
    //    A -> B -> D
    //    A -> C -> D
    //         C -> E
    const model: GraphModel = {
      nodes: [node('A'), node('B'), node('C'), node('D'), node('E')],
      edges: [edge('A', 'B'), edge('A', 'C'), edge('B', 'D'), edge('C', 'D'), edge('C', 'E')],
    };

    it('from A, reaches all nodes', () => {
      const result = reachableSubgraph(model, 'A');
      expect(result).toEqual(new Set(['A', 'B', 'C', 'D', 'E']));
    });

    it('from D, upstream reaches A, B, C; no downstream', () => {
      const result = reachableSubgraph(model, 'D');
      expect(result).toEqual(new Set(['A', 'B', 'C', 'D']));
    });

    it('from D maxHops=1, gets B and C (direct upstream)', () => {
      const result = reachableSubgraph(model, 'D', 1);
      expect(result).toEqual(new Set(['B', 'C', 'D']));
    });
  });

  describe('disconnected components', () => {
    // Component 1: A -> B; Component 2: X -> Y
    const model: GraphModel = {
      nodes: [node('A'), node('B'), node('X'), node('Y')],
      edges: [edge('A', 'B'), edge('X', 'Y')],
    };

    it('from A, only reaches A and B (not X, Y)', () => {
      const result = reachableSubgraph(model, 'A');
      expect(result).toEqual(new Set(['A', 'B']));
    });

    it('from X, only reaches X and Y (not A, B)', () => {
      const result = reachableSubgraph(model, 'X');
      expect(result).toEqual(new Set(['X', 'Y']));
    });
  });

  describe('edge cases and guards', () => {
    it('returns empty set for null model', () => {
      const result = reachableSubgraph(null as any, 'A');
      expect(result).toEqual(new Set());
    });

    it('returns empty set for undefined model', () => {
      const result = reachableSubgraph(undefined as any, 'A');
      expect(result).toEqual(new Set());
    });

    it('returns empty set for empty nodeId', () => {
      const model: GraphModel = { nodes: [node('A')], edges: [] };
      const result = reachableSubgraph(model, '');
      expect(result).toEqual(new Set());
    });

    it('returns empty set for non-existent node', () => {
      const model: GraphModel = { nodes: [node('A')], edges: [] };
      const result = reachableSubgraph(model, 'NONEXISTENT');
      expect(result).toEqual(new Set());
    });

    it('returns empty set for model with no nodes', () => {
      const model: GraphModel = { nodes: [], edges: [] };
      const result = reachableSubgraph(model, 'A');
      expect(result).toEqual(new Set());
    });

    it('handles negative maxHops like 0 (origin only)', () => {
      const model: GraphModel = {
        nodes: [node('A'), node('B')],
        edges: [edge('A', 'B')],
      };
      const result = reachableSubgraph(model, 'A', -1);
      expect(result).toEqual(new Set(['A']));
    });

    it('handles model with edges referencing non-existent nodes', () => {
      const model: GraphModel = {
        nodes: [node('A'), node('B')],
        edges: [edge('A', 'B'), edge('B', 'GHOST')],
      };
      const result = reachableSubgraph(model, 'A');
      // GHOST is in edge targets, traversal includes it even though node list doesn't
      expect(result.has('A')).toBe(true);
      expect(result.has('B')).toBe(true);
      expect(result.has('GHOST')).toBe(true);
    });

    it('Infinity maxHops traverses full component', () => {
      const model: GraphModel = {
        nodes: [node('A'), node('B'), node('C')],
        edges: [edge('A', 'B'), edge('B', 'C')],
      };
      const result = reachableSubgraph(model, 'A', Infinity);
      expect(result).toEqual(new Set(['A', 'B', 'C']));
    });
  });

  describe('large depth traversal', () => {
    it('traverses a long chain of 100 nodes', () => {
      const nodes: GraphNode[] = [];
      const edges: GraphEdge[] = [];
      for (let i = 0; i < 100; i++) {
        nodes.push(node(`N${i}`));
        if (i > 0) {
          edges.push(edge(`N${i - 1}`, `N${i}`));
        }
      }
      const model: GraphModel = { nodes, edges };
      const result = reachableSubgraph(model, 'N50');
      expect(result.size).toBe(100);
    });

    it('maxHops=4 from middle of chain gives 9 nodes', () => {
      const nodes: GraphNode[] = [];
      const edges: GraphEdge[] = [];
      for (let i = 0; i < 20; i++) {
        nodes.push(node(`N${i}`));
        if (i > 0) {
          edges.push(edge(`N${i - 1}`, `N${i}`));
        }
      }
      const model: GraphModel = { nodes, edges };
      // From N10: upstream 4 hops = N6..N9, downstream 4 hops = N11..N14, plus N10
      const result = reachableSubgraph(model, 'N10', 4);
      expect(result.size).toBe(9); // N6, N7, N8, N9, N10, N11, N12, N13, N14
      expect(result.has('N6')).toBe(true);
      expect(result.has('N14')).toBe(true);
      expect(result.has('N5')).toBe(false);
      expect(result.has('N15')).toBe(false);
    });
  });
});
