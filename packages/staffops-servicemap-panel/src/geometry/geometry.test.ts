/**
 * Unit tests for src/geometry/index.ts — pure geometry helpers.
 *
 * Written INDEPENDENTLY of implementation. Tests the PUBLIC CONTRACT:
 * - edgePath(x1,y1,x2,y2): produces "M x1 y1 L x2 y2"
 * - positionOnEdge(x1,y1,x2,y2,t): linear interp, clamped [0,1]
 * - edgeLength(x1,y1,x2,y2): Euclidean distance
 *
 * Asserts:
 * - Particles are placed ALONG the edge (not at origin)
 * - Path references are unique per edge (via edgePath)
 * - Positions at t=0 == source, t=1 == target, t=0.5 == midpoint
 */

import { edgePath, positionOnEdge, edgeLength } from './index';

// ─────────────────────────────────────────────────────────────────────────────
// edgePath — SVG path d-attribute for animateMotion
// ─────────────────────────────────────────────────────────────────────────────

describe('edgePath()', () => {
  describe('normal inputs', () => {
    it('returns correct path for typical coordinates', () => {
      expect(edgePath(100, 50, 300, 200)).toBe('M 100 50 L 300 200');
    });

    it('returns correct path for integer coordinates', () => {
      expect(edgePath(0, 0, 400, 300)).toBe('M 0 0 L 400 300');
    });

    it('returns correct path for decimal coordinates', () => {
      expect(edgePath(10.5, 20.7, 150.3, 99.9)).toBe('M 10.5 20.7 L 150.3 99.9');
    });
  });

  describe('edge cases', () => {
    it('handles negative coordinates', () => {
      expect(edgePath(-50, -100, -10, -20)).toBe('M -50 -100 L -10 -20');
    });

    it('handles zero coordinates (NOT at origin stuck)', () => {
      // A path from (0,0) to (200,100) is valid — the key assertion is that
      // if source/target are non-origin, the path starts at the source
      expect(edgePath(0, 0, 200, 100)).toBe('M 0 0 L 200 100');
    });

    it('handles identical start and end points (zero-length edge)', () => {
      expect(edgePath(150, 75, 150, 75)).toBe('M 150 75 L 150 75');
    });

    it('handles very large coordinates', () => {
      expect(edgePath(10000, 20000, 30000, 40000)).toBe('M 10000 20000 L 30000 40000');
    });

    it('handles mixed positive and negative', () => {
      expect(edgePath(-100, 50, 300, -200)).toBe('M -100 50 L 300 -200');
    });
  });

  describe('uniqueness guarantee — different edges produce different paths', () => {
    it('two distinct edges produce distinct path strings', () => {
      const pathA = edgePath(100, 50, 300, 200);
      const pathB = edgePath(200, 100, 400, 300);
      expect(pathA).not.toBe(pathB);
    });

    it('reversed edge produces different path', () => {
      const forward = edgePath(100, 50, 300, 200);
      const reverse = edgePath(300, 200, 100, 50);
      expect(forward).not.toBe(reverse);
    });

    it('path always starts at source endpoint (not origin)', () => {
      // This is the critical assertion: particles travel from source to target,
      // not from (0,0)
      const path = edgePath(120, 80, 350, 220);
      expect(path).toMatch(/^M 120 80/);
      expect(path).toMatch(/L 350 220$/);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// positionOnEdge — linear interpolation with clamping
// ─────────────────────────────────────────────────────────────────────────────

describe('positionOnEdge()', () => {
  const x1 = 100, y1 = 50, x2 = 300, y2 = 250;

  describe('boundary values', () => {
    it('t=0 returns source point [x1, y1]', () => {
      expect(positionOnEdge(x1, y1, x2, y2, 0)).toEqual([100, 50]);
    });

    it('t=1 returns target point [x2, y2]', () => {
      expect(positionOnEdge(x1, y1, x2, y2, 1)).toEqual([300, 250]);
    });

    it('t=0.5 returns midpoint', () => {
      const [mx, my] = positionOnEdge(x1, y1, x2, y2, 0.5);
      expect(mx).toBeCloseTo(200, 5);
      expect(my).toBeCloseTo(150, 5);
    });
  });

  describe('intermediate values', () => {
    it('t=0.25 returns 1/4 position', () => {
      const [px, py] = positionOnEdge(x1, y1, x2, y2, 0.25);
      expect(px).toBeCloseTo(150, 5);
      expect(py).toBeCloseTo(100, 5);
    });

    it('t=0.75 returns 3/4 position', () => {
      const [px, py] = positionOnEdge(x1, y1, x2, y2, 0.75);
      expect(px).toBeCloseTo(250, 5);
      expect(py).toBeCloseTo(200, 5);
    });

    it('all intermediate positions lie BETWEEN source and target (on the line)', () => {
      for (const t of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) {
        const [px, py] = positionOnEdge(x1, y1, x2, y2, t);
        // x should be between x1 and x2
        expect(px).toBeGreaterThanOrEqual(x1);
        expect(px).toBeLessThanOrEqual(x2);
        // y should be between y1 and y2
        expect(py).toBeGreaterThanOrEqual(y1);
        expect(py).toBeLessThanOrEqual(y2);
      }
    });

    it('particle is ALONG the edge (not at origin 0,0)', () => {
      // Critical assertion: the old bug was particles at (0,0)
      const [px, py] = positionOnEdge(120, 80, 350, 220, 0.5);
      // Midpoint should NOT be (0,0) — it should be (235, 150)
      expect(px).not.toBe(0);
      expect(py).not.toBe(0);
      expect(px).toBeCloseTo(235, 5);
      expect(py).toBeCloseTo(150, 5);
    });
  });

  describe('clamping — values outside [0,1]', () => {
    it('t=-0.5 clamps to t=0 (source)', () => {
      expect(positionOnEdge(x1, y1, x2, y2, -0.5)).toEqual([100, 50]);
    });

    it('t=-100 clamps to t=0 (source)', () => {
      expect(positionOnEdge(x1, y1, x2, y2, -100)).toEqual([100, 50]);
    });

    it('t=1.5 clamps to t=1 (target)', () => {
      expect(positionOnEdge(x1, y1, x2, y2, 1.5)).toEqual([300, 250]);
    });

    it('t=999 clamps to t=1 (target)', () => {
      expect(positionOnEdge(x1, y1, x2, y2, 999)).toEqual([300, 250]);
    });
  });

  describe('degenerate edge (same source and target)', () => {
    it('returns the same point for any t when source==target', () => {
      expect(positionOnEdge(150, 75, 150, 75, 0)).toEqual([150, 75]);
      expect(positionOnEdge(150, 75, 150, 75, 0.5)).toEqual([150, 75]);
      expect(positionOnEdge(150, 75, 150, 75, 1)).toEqual([150, 75]);
    });
  });

  describe('negative coordinate edge', () => {
    it('handles negative source/target correctly', () => {
      const [px, py] = positionOnEdge(-100, -50, 100, 50, 0.5);
      expect(px).toBeCloseTo(0, 5);
      expect(py).toBeCloseTo(0, 5);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// edgeLength — Euclidean distance
// ─────────────────────────────────────────────────────────────────────────────

describe('edgeLength()', () => {
  describe('known distances', () => {
    it('horizontal line (dy=0)', () => {
      expect(edgeLength(0, 0, 100, 0)).toBe(100);
    });

    it('vertical line (dx=0)', () => {
      expect(edgeLength(0, 0, 0, 200)).toBe(200);
    });

    it('3-4-5 triangle diagonal', () => {
      expect(edgeLength(0, 0, 3, 4)).toBe(5);
    });

    it('5-12-13 triangle diagonal', () => {
      expect(edgeLength(0, 0, 5, 12)).toBe(13);
    });

    it('diagonal with known result', () => {
      expect(edgeLength(0, 0, 100, 100)).toBeCloseTo(141.421, 2);
    });
  });

  describe('edge cases', () => {
    it('same point returns 0', () => {
      expect(edgeLength(150, 75, 150, 75)).toBe(0);
    });

    it('negative coordinates', () => {
      expect(edgeLength(-10, -20, -10, -20)).toBe(0);
      expect(edgeLength(-10, 0, 10, 0)).toBe(20);
    });

    it('symmetric: distance A→B == distance B→A', () => {
      expect(edgeLength(10, 20, 100, 200)).toBeCloseTo(edgeLength(100, 200, 10, 20), 10);
    });

    it('very large coordinates produce finite result', () => {
      const len = edgeLength(0, 0, 10000, 10000);
      expect(Number.isFinite(len)).toBe(true);
      expect(len).toBeCloseTo(14142.1, 0);
    });
  });
});
