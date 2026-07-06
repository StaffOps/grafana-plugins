/**
 * Tests for blast-radius BFS traversal.
 */
import { computeBlastRadius } from './blastRadius';
import { GraphModel } from '../types';

function makeLinearGraph(): GraphModel {
  // A → B → C → D
  return {
    nodes: [
      { id: 'A', inRate: 0, outRate: 100, totalRate: 100 },
      { id: 'B', inRate: 100, outRate: 80, totalRate: 180 },
      { id: 'C', inRate: 80, outRate: 50, totalRate: 130 },
      { id: 'D', inRate: 50, outRate: 0, totalRate: 50 },
    ],
    edges: [
      { source: 'A', target: 'B', rate: 100, errorRatio: 0, p95: 0.01, connectionType: '' },
      { source: 'B', target: 'C', rate: 80, errorRatio: 0, p95: 0.02, connectionType: '' },
      { source: 'C', target: 'D', rate: 50, errorRatio: 0, p95: 0.03, connectionType: '' },
    ],
  };
}

function makeFanGraph(): GraphModel {
  // A → X ← B; X → Y; X → Z
  return {
    nodes: [
      { id: 'A', inRate: 0, outRate: 50, totalRate: 50 },
      { id: 'B', inRate: 0, outRate: 30, totalRate: 30 },
      { id: 'X', inRate: 80, outRate: 60, totalRate: 140 },
      { id: 'Y', inRate: 40, outRate: 0, totalRate: 40 },
      { id: 'Z', inRate: 20, outRate: 0, totalRate: 20 },
    ],
    edges: [
      { source: 'A', target: 'X', rate: 50, errorRatio: 0, p95: 0.01, connectionType: '' },
      { source: 'B', target: 'X', rate: 30, errorRatio: 0, p95: 0.01, connectionType: '' },
      { source: 'X', target: 'Y', rate: 40, errorRatio: 0, p95: 0.02, connectionType: '' },
      { source: 'X', target: 'Z', rate: 20, errorRatio: 0, p95: 0.02, connectionType: '' },
    ],
  };
}

describe('computeBlastRadius', () => {
  it('returns empty for null model', () => {
    const result = computeBlastRadius(null as any, 'A', 1);
    expect(result.highlighted.size).toBe(0);
  });

  it('returns empty for non-existent node', () => {
    const result = computeBlastRadius(makeLinearGraph(), 'UNKNOWN', 1);
    expect(result.highlighted.size).toBe(0);
  });

  it('returns empty for hops < 1', () => {
    const result = computeBlastRadius(makeLinearGraph(), 'B', 0);
    expect(result.highlighted.size).toBe(0);
  });

  describe('linear graph (A → B → C → D)', () => {
    it('1 hop from B includes A, B, C', () => {
      const result = computeBlastRadius(makeLinearGraph(), 'B', 1);
      expect(result.highlighted).toEqual(new Set(['A', 'B', 'C']));
      expect(result.highlightedEdges.size).toBe(2);
    });

    it('1 hop from A includes A, B (only downstream)', () => {
      const result = computeBlastRadius(makeLinearGraph(), 'A', 1);
      expect(result.highlighted).toEqual(new Set(['A', 'B']));
    });

    it('1 hop from D includes C, D (only upstream)', () => {
      const result = computeBlastRadius(makeLinearGraph(), 'D', 1);
      expect(result.highlighted).toEqual(new Set(['C', 'D']));
    });

    it('2 hops from B includes A, B, C, D', () => {
      const result = computeBlastRadius(makeLinearGraph(), 'B', 2);
      expect(result.highlighted).toEqual(new Set(['A', 'B', 'C', 'D']));
      expect(result.highlightedEdges.size).toBe(3);
    });

    it('10 hops from B covers entire graph (clamps at graph bounds)', () => {
      const result = computeBlastRadius(makeLinearGraph(), 'B', 10);
      expect(result.highlighted).toEqual(new Set(['A', 'B', 'C', 'D']));
    });
  });

  describe('fan graph (A→X←B, X→Y, X→Z)', () => {
    it('1 hop from X includes all direct neighbors', () => {
      const result = computeBlastRadius(makeFanGraph(), 'X', 1);
      expect(result.highlighted).toEqual(new Set(['A', 'B', 'X', 'Y', 'Z']));
      expect(result.highlightedEdges.size).toBe(4);
    });

    it('1 hop from Y includes X and Y only', () => {
      const result = computeBlastRadius(makeFanGraph(), 'Y', 1);
      expect(result.highlighted).toEqual(new Set(['X', 'Y']));
    });

    it('2 hops from Y includes X + X upstream (A,B) but not Z (downstream of X, not Y)', () => {
      const result = computeBlastRadius(makeFanGraph(), 'Y', 2);
      expect(result.highlighted).toEqual(new Set(['A', 'B', 'X', 'Y']));
    });
  });

  it('handles cycles gracefully (no infinite loop)', () => {
    const cyclic: GraphModel = {
      nodes: [
        { id: 'A', inRate: 50, outRate: 50, totalRate: 100 },
        { id: 'B', inRate: 50, outRate: 50, totalRate: 100 },
      ],
      edges: [
        { source: 'A', target: 'B', rate: 50, errorRatio: 0, p95: 0.01, connectionType: '' },
        { source: 'B', target: 'A', rate: 50, errorRatio: 0, p95: 0.01, connectionType: '' },
      ],
    };
    const result = computeBlastRadius(cyclic, 'A', 5);
    expect(result.highlighted).toEqual(new Set(['A', 'B']));
    expect(result.highlightedEdges.size).toBe(2);
  });
});
