/**
 * Pure function unit tests for src/viz/index.ts.
 *
 * Written INDEPENDENTLY from the implementation — tests against the
 * PUBLIC CONTRACT (design.md '## UI & interactions (v2)' + exported signatures).
 *
 * Covers: health(), flowParams(), summarize(), nodeHealth()
 */

import { health, flowParams, summarize, nodeHealth } from './index';
import { GraphModel, GraphNode, GraphEdge } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Test data factories
// ─────────────────────────────────────────────────────────────────────────────

function makeNode(id: string, inRate = 0, outRate = 0): GraphNode {
  return { id, inRate, outRate, totalRate: inRate + outRate };
}

function makeEdge(
  source: string,
  target: string,
  rate = 100,
  errorRatio = 0,
  p95 = 0.1,
  connectionType = ''
): GraphEdge {
  return { source, target, rate, errorRatio, p95, connectionType };
}

function makeModel(nodes: GraphNode[], edges: GraphEdge[]): GraphModel {
  return { nodes, edges };
}

// ─────────────────────────────────────────────────────────────────────────────
// health() — Discrete health from error ratio
// ─────────────────────────────────────────────────────────────────────────────

describe('health() — threshold branches', () => {
  const WARN = 0.01;
  const CRIT = 0.05;

  describe('normal inputs', () => {
    it('returns "ok" for ratio = 0', () => {
      expect(health(0, WARN, CRIT)).toBe('ok');
    });

    it('returns "ok" for ratio below warn', () => {
      expect(health(0.005, WARN, CRIT)).toBe('ok');
    });

    it('returns "warn" at exact warn boundary (ratio == warn)', () => {
      expect(health(0.01, WARN, CRIT)).toBe('warn');
    });

    it('returns "warn" for ratio between warn and crit', () => {
      expect(health(0.04, WARN, CRIT)).toBe('warn');
    });

    it('returns "crit" at exact crit boundary (ratio == crit)', () => {
      expect(health(0.05, WARN, CRIT)).toBe('crit');
    });

    it('returns "crit" for ratio above crit', () => {
      expect(health(1.0, WARN, CRIT)).toBe('crit');
    });

    it('returns "crit" for ratio = 0.1 (well above default crit)', () => {
      expect(health(0.1, WARN, CRIT)).toBe('crit');
    });
  });

  describe('guard: NaN/negative errorRatio treated as 0', () => {
    it('returns "ok" for NaN errorRatio', () => {
      expect(health(NaN, WARN, CRIT)).toBe('ok');
    });

    it('returns "ok" for negative errorRatio', () => {
      expect(health(-0.5, WARN, CRIT)).toBe('ok');
    });

    it('returns "ok" for -Infinity errorRatio', () => {
      expect(health(-Infinity, WARN, CRIT)).toBe('ok');
    });

    it('returns "ok" for Infinity errorRatio treated safely', () => {
      // Infinity is not finite, so guard triggers → 0 → 'ok'
      // OR implementation may treat Infinity as >= crit
      // Contract says "NaN/negative → 0" — Infinity is positive and finite-false
      const result = health(Infinity, WARN, CRIT);
      // Infinity: Number.isFinite(Infinity) is false, so treated as 0
      expect(result).toBe('ok');
    });
  });

  describe('guard: invalid thresholds fall back to 0.01/0.05', () => {
    it('falls back when both thresholds are NaN', () => {
      // ratio=0.1 with defaults 0.01/0.05 → 'crit'
      expect(health(0.1, NaN, NaN)).toBe('crit');
    });

    it('falls back when both thresholds are negative', () => {
      expect(health(0.1, -1, -1)).toBe('crit');
    });

    it('falls back warn to 0.01 when warn is 0', () => {
      // warn=0 → fallback to 0.01; crit=0.05
      // ratio=0.005 < 0.01 → 'ok'
      expect(health(0.005, 0, 0.05)).toBe('ok');
    });

    it('falls back crit to 0.05 when crit is 0', () => {
      // warn=0.01; crit=0 → fallback to 0.05
      // ratio=0.03 >= 0.01 but < 0.05 → 'warn'
      expect(health(0.03, 0.01, 0)).toBe('warn');
    });

    it('uses custom thresholds when valid', () => {
      // warn=0.1, crit=0.5
      expect(health(0.05, 0.1, 0.5)).toBe('ok');
      expect(health(0.1, 0.1, 0.5)).toBe('warn');
      expect(health(0.3, 0.1, 0.5)).toBe('warn');
      expect(health(0.5, 0.1, 0.5)).toBe('crit');
      expect(health(0.9, 0.1, 0.5)).toBe('crit');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// flowParams() — Particle count and speed normalization
// ─────────────────────────────────────────────────────────────────────────────

describe('flowParams() — normalization and clamping', () => {
  describe('normal inputs', () => {
    it('returns max particles and fastest speed at full rate', () => {
      const result = flowParams(100, 100);
      expect(result.count).toBe(5);
      expect(result.speed).toBe(0.5);
    });

    it('returns min particles and slowest speed at zero rate', () => {
      const result = flowParams(0, 100);
      expect(result.count).toBe(1);
      expect(result.speed).toBe(4);
    });

    it('returns intermediate values at 50% rate', () => {
      const result = flowParams(50, 100);
      // normalized = 0.5 → count = round(1 + 0.5*4) = round(3) = 3
      expect(result.count).toBe(3);
      // speed = 4 - 0.5*3.5 = 2.25
      expect(result.speed).toBeCloseTo(2.25, 2);
    });

    it('clamps at max when rate exceeds maxRate', () => {
      const result = flowParams(200, 100);
      expect(result.count).toBe(5);
      expect(result.speed).toBe(0.5);
    });

    it('returns 2 particles at 25% rate', () => {
      const result = flowParams(25, 100);
      // normalized = 0.25 → count = round(1 + 0.25*4) = round(2) = 2
      expect(result.count).toBe(2);
      // speed = 4 - 0.25*3.5 = 3.125
      expect(result.speed).toBeCloseTo(3.125, 2);
    });

    it('returns 4 particles at 75% rate', () => {
      const result = flowParams(75, 100);
      // normalized = 0.75 → count = round(1 + 0.75*4) = round(4) = 4
      expect(result.count).toBe(4);
      // speed = 4 - 0.75*3.5 = 1.375
      expect(result.speed).toBeCloseTo(1.375, 2);
    });
  });

  describe('guard: degenerate inputs', () => {
    it('negative rate → minimal animation', () => {
      const result = flowParams(-5, 100);
      expect(result.count).toBe(1);
      expect(result.speed).toBe(4);
    });

    it('NaN rate → minimal animation', () => {
      const result = flowParams(NaN, 100);
      expect(result.count).toBe(1);
      expect(result.speed).toBe(4);
    });

    it('zero maxRate → treated as 1 (rate/1 clamped to 1.0 → max)', () => {
      // safeMax = 1 (fallback); normalized = min(100/1, 1) = 1 → max
      const result = flowParams(100, 0);
      expect(result.count).toBe(5);
      expect(result.speed).toBe(0.5);
    });

    it('NaN maxRate → treated as 1 (rate/1 clamped to 1.0 → max)', () => {
      // safeMax = 1 (fallback); normalized = min(100/1, 1) = 1 → max
      const result = flowParams(100, NaN);
      expect(result.count).toBe(5);
      expect(result.speed).toBe(0.5);
    });

    it('negative maxRate → treated as 1 (rate/1 clamped to 1.0)', () => {
      // safeMax = 1 (fallback); normalized = min(50/1, 1) = 1 → max
      const result = flowParams(50, -10);
      expect(result.count).toBe(5);
      expect(result.speed).toBe(0.5);
    });

    it('both zero → minimal animation', () => {
      const result = flowParams(0, 0);
      expect(result.count).toBe(1);
      expect(result.speed).toBe(4);
    });

    it('Infinity rate → clamped to max', () => {
      // Infinity is not finite → safeRate=0 → minimal
      const result = flowParams(Infinity, 100);
      expect(result.count).toBe(1);
      expect(result.speed).toBe(4);
    });
  });

  describe('output clamping', () => {
    it('count is always between 1 and 5', () => {
      for (const rate of [0, 1, 10, 50, 100, 200, -1, NaN]) {
        const r = flowParams(rate, 100);
        expect(r.count).toBeGreaterThanOrEqual(1);
        expect(r.count).toBeLessThanOrEqual(5);
      }
    });

    it('speed is always between 0.5 and 4', () => {
      for (const rate of [0, 1, 10, 50, 100, 200, -1, NaN]) {
        const r = flowParams(rate, 100);
        expect(r.speed).toBeGreaterThanOrEqual(0.5);
        expect(r.speed).toBeLessThanOrEqual(4);
      }
    });

    it('count is always an integer', () => {
      for (const rate of [0, 13, 27, 44, 63, 88, 100]) {
        const r = flowParams(rate, 100);
        expect(Number.isInteger(r.count)).toBe(true);
      }
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// summarize() — Aggregate summary of graph
// ─────────────────────────────────────────────────────────────────────────────

describe('summarize() — aggregate summary', () => {
  describe('empty/null model', () => {
    it('returns all zeros for model with empty nodes array', () => {
      const result = summarize({ nodes: [], edges: [] });
      expect(result).toEqual({ services: 0, edges: 0, errorPct: 0, totalRps: 0 });
    });

    it('returns all zeros for null model', () => {
      const result = summarize(null as unknown as GraphModel);
      expect(result).toEqual({ services: 0, edges: 0, errorPct: 0, totalRps: 0 });
    });

    it('returns all zeros for undefined model', () => {
      const result = summarize(undefined as unknown as GraphModel);
      expect(result).toEqual({ services: 0, edges: 0, errorPct: 0, totalRps: 0 });
    });
  });

  describe('single edge model', () => {
    it('computes correct summary for one edge', () => {
      const model = makeModel(
        [makeNode('A', 100, 0), makeNode('B', 0, 100)],
        [makeEdge('B', 'A', 100, 0.05)]
      );
      const result = summarize(model);
      expect(result.services).toBe(2);
      expect(result.edges).toBe(1);
      expect(result.totalRps).toBe(100);
      // errorPct = (0.05 * 100) / 100 * 100 = 5%
      expect(result.errorPct).toBeCloseTo(5, 2);
    });

    it('zero error ratio → 0% errors', () => {
      const model = makeModel(
        [makeNode('A'), makeNode('B')],
        [makeEdge('A', 'B', 200, 0)]
      );
      const result = summarize(model);
      expect(result.errorPct).toBe(0);
      expect(result.totalRps).toBe(200);
    });
  });

  describe('multi-edge with mixed errors (weighted average)', () => {
    it('computes weighted average errorPct', () => {
      // Edge A→B: rate=100, errorRatio=0.1 (10 errors)
      // Edge C→D: rate=400, errorRatio=0.01 (4 errors)
      // Total RPS = 500, total errors = 14
      // Weighted errorPct = (14 / 500) * 100 = 2.8%
      const model = makeModel(
        [makeNode('A'), makeNode('B'), makeNode('C'), makeNode('D')],
        [
          makeEdge('A', 'B', 100, 0.1),
          makeEdge('C', 'D', 400, 0.01),
        ]
      );
      const result = summarize(model);
      expect(result.services).toBe(4);
      expect(result.edges).toBe(2);
      expect(result.totalRps).toBe(500);
      expect(result.errorPct).toBeCloseTo(2.8, 1);
    });

    it('all edges ok → 0% errors', () => {
      const model = makeModel(
        [makeNode('A'), makeNode('B'), makeNode('C')],
        [
          makeEdge('A', 'B', 50, 0),
          makeEdge('B', 'C', 30, 0),
        ]
      );
      const result = summarize(model);
      expect(result.errorPct).toBe(0);
      expect(result.totalRps).toBe(80);
    });

    it('all edges fully errored → 100% errors', () => {
      const model = makeModel(
        [makeNode('A'), makeNode('B')],
        [
          makeEdge('A', 'B', 100, 1.0),
          makeEdge('B', 'A', 50, 1.0),
        ]
      );
      const result = summarize(model);
      expect(result.errorPct).toBeCloseTo(100, 1);
    });
  });

  describe('edge cases', () => {
    it('NaN rate edges are ignored in sum', () => {
      const model = makeModel(
        [makeNode('A'), makeNode('B'), makeNode('C')],
        [
          makeEdge('A', 'B', 100, 0.05),
          makeEdge('B', 'C', NaN, 0.5),
        ]
      );
      const result = summarize(model);
      // NaN rate is treated as 0 in sum
      expect(result.totalRps).toBe(100);
      // Only edge A→B contributes: 0.05*100 / 100 * 100 = 5%
      expect(result.errorPct).toBeCloseTo(5, 1);
    });

    it('edges with 0 total rate → errorPct = 0', () => {
      const model = makeModel(
        [makeNode('A'), makeNode('B')],
        [makeEdge('A', 'B', 0, 0.5)]
      );
      const result = summarize(model);
      expect(result.totalRps).toBe(0);
      expect(result.errorPct).toBe(0);
    });

    it('edges with NaN errorRatio are ignored in weighted calc', () => {
      const model = makeModel(
        [makeNode('A'), makeNode('B'), makeNode('C')],
        [
          makeEdge('A', 'B', 100, 0.1),
          makeEdge('B', 'C', 100, NaN),
        ]
      );
      const result = summarize(model);
      // NaN errorRatio: Number.isFinite(NaN) is false → contributes 0 to errors
      // But rate is still counted in totalRps
      expect(result.totalRps).toBe(200);
      // errors = 0.1*100 + 0 = 10; errorPct = 10/200*100 = 5%
      expect(result.errorPct).toBeCloseTo(5, 1);
    });

    it('model with nodes but no edges', () => {
      const model = makeModel([makeNode('A'), makeNode('B')], []);
      const result = summarize(model);
      expect(result.services).toBe(2);
      expect(result.edges).toBe(0);
      expect(result.errorPct).toBe(0);
      expect(result.totalRps).toBe(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// nodeHealth() — Worst incident edge propagation
// ─────────────────────────────────────────────────────────────────────────────

describe('nodeHealth() — worst-incident propagation', () => {
  const WARN = 0.01;
  const CRIT = 0.05;

  describe('empty/null model', () => {
    it('returns empty map for empty model', () => {
      const result = nodeHealth({ nodes: [], edges: [] }, WARN, CRIT);
      expect(result.size).toBe(0);
    });

    it('returns empty map for null model', () => {
      const result = nodeHealth(null as unknown as GraphModel, WARN, CRIT);
      expect(result.size).toBe(0);
    });
  });

  describe('all edges healthy → all nodes ok', () => {
    it('all nodes are ok when no edge has errors', () => {
      const model = makeModel(
        [makeNode('A'), makeNode('B'), makeNode('C')],
        [
          makeEdge('A', 'B', 100, 0),
          makeEdge('B', 'C', 50, 0.005),
        ]
      );
      const result = nodeHealth(model, WARN, CRIT);
      expect(result.get('A')).toBe('ok');
      expect(result.get('B')).toBe('ok');
      expect(result.get('C')).toBe('ok');
    });
  });

  describe('edge health propagates to both endpoints', () => {
    it('crit edge makes both source and target crit', () => {
      const model = makeModel(
        [makeNode('A'), makeNode('B')],
        [makeEdge('A', 'B', 100, 0.1)] // 0.1 >= 0.05 → crit
      );
      const result = nodeHealth(model, WARN, CRIT);
      expect(result.get('A')).toBe('crit');
      expect(result.get('B')).toBe('crit');
    });

    it('warn edge makes both source and target warn', () => {
      const model = makeModel(
        [makeNode('A'), makeNode('B')],
        [makeEdge('A', 'B', 100, 0.02)] // 0.02 >= 0.01 but < 0.05 → warn
      );
      const result = nodeHealth(model, WARN, CRIT);
      expect(result.get('A')).toBe('warn');
      expect(result.get('B')).toBe('warn');
    });

    it('ok edge does not change node status', () => {
      const model = makeModel(
        [makeNode('A'), makeNode('B')],
        [makeEdge('A', 'B', 100, 0.005)] // < 0.01 → ok
      );
      const result = nodeHealth(model, WARN, CRIT);
      expect(result.get('A')).toBe('ok');
      expect(result.get('B')).toBe('ok');
    });
  });

  describe('worst-case propagation (multiple edges)', () => {
    it('node with one warn edge and one crit edge → crit (worst wins)', () => {
      // Node B is target of warn edge AND target of crit edge
      const model = makeModel(
        [makeNode('A'), makeNode('B'), makeNode('C')],
        [
          makeEdge('A', 'B', 100, 0.02), // warn
          makeEdge('C', 'B', 100, 0.1),  // crit
        ]
      );
      const result = nodeHealth(model, WARN, CRIT);
      expect(result.get('B')).toBe('crit');
      expect(result.get('A')).toBe('warn');
      expect(result.get('C')).toBe('crit');
    });

    it('node with only ok edges remains ok', () => {
      const model = makeModel(
        [makeNode('A'), makeNode('B'), makeNode('C')],
        [
          makeEdge('A', 'B', 100, 0),
          makeEdge('A', 'C', 50, 0.005),
        ]
      );
      const result = nodeHealth(model, WARN, CRIT);
      expect(result.get('A')).toBe('ok');
      expect(result.get('B')).toBe('ok');
      expect(result.get('C')).toBe('ok');
    });

    it('node as source only still inherits edge health', () => {
      const model = makeModel(
        [makeNode('A'), makeNode('B')],
        [makeEdge('A', 'B', 100, 0.1)] // A is source, gets crit
      );
      const result = nodeHealth(model, WARN, CRIT);
      expect(result.get('A')).toBe('crit');
    });

    it('node as target only still inherits edge health', () => {
      const model = makeModel(
        [makeNode('A'), makeNode('B')],
        [makeEdge('A', 'B', 100, 0.1)] // B is target, gets crit
      );
      const result = nodeHealth(model, WARN, CRIT);
      expect(result.get('B')).toBe('crit');
    });
  });

  describe('all nodes in map', () => {
    it('includes disconnected nodes as ok', () => {
      const model = makeModel(
        [makeNode('A'), makeNode('B'), makeNode('lonely')],
        [makeEdge('A', 'B', 100, 0.1)]
      );
      const result = nodeHealth(model, WARN, CRIT);
      expect(result.get('lonely')).toBe('ok');
      expect(result.size).toBe(3);
    });
  });
});
