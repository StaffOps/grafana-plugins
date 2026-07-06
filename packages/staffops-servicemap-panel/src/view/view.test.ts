/**
 * Unit tests for pure view-transform helpers.
 *
 * Tests are written against the PUBLIC CONTRACT (types, constants, signatures),
 * not the implementation details. Each helper is tested for correctness,
 * edge cases, and boundary conditions.
 */

import {
  ViewState,
  Point,
  Bounds,
  zoomAtPoint,
  panBy,
  fitView,
  computeNodeBounds,
  dragNode,
  isDragMovement,
  nodeRadius,
  MIN_SCALE,
  MAX_SCALE,
  MIN_FIT_SCALE,
  NODE_RADIUS_MIN,
  NODE_RADIUS_MAX,
  DRAG_THRESHOLD,
} from './index';

// ─────────────────────────────────────────────────────────────────────────────
// fitView
// ─────────────────────────────────────────────────────────────────────────────

describe('fitView — fit all content within padded viewport', () => {
  it('fits a bounding box centered within a large viewport', () => {
    const bounds: Bounds = { minX: 100, minY: 100, maxX: 300, maxY: 200 };
    const vw = 800;
    const vh = 600;
    const padding = 40;
    const view = fitView(bounds, vw, vh, padding);

    // After transform: every point in bounds maps to within the padded viewport
    // Transformed x = point.x * k + tx
    // Transformed y = point.y * k + ty
    // All should be within [padding, vw - padding] and [padding, vh - padding]
    const topLeftX = bounds.minX * view.k + view.tx;
    const topLeftY = bounds.minY * view.k + view.ty;
    const botRightX = bounds.maxX * view.k + view.tx;
    const botRightY = bounds.maxY * view.k + view.ty;

    expect(topLeftX).toBeGreaterThanOrEqual(padding - 0.01);
    expect(topLeftY).toBeGreaterThanOrEqual(padding - 0.01);
    expect(botRightX).toBeLessThanOrEqual(vw - padding + 0.01);
    expect(botRightY).toBeLessThanOrEqual(vh - padding + 0.01);
  });

  it('centers the content within the viewport', () => {
    const bounds: Bounds = { minX: 0, minY: 0, maxX: 200, maxY: 100 };
    const vw = 800;
    const vh = 600;
    const view = fitView(bounds, vw, vh, 40);

    // Center of content in screen coords should be close to center of viewport
    const contentCenterX = ((bounds.minX + bounds.maxX) / 2) * view.k + view.tx;
    const contentCenterY = ((bounds.minY + bounds.maxY) / 2) * view.k + view.ty;
    expect(contentCenterX).toBeCloseTo(vw / 2, 0);
    expect(contentCenterY).toBeCloseTo(vh / 2, 0);
  });

  it('scale is clamped to [MIN_SCALE, MAX_SCALE]', () => {
    // Very small content in huge viewport → would be very large scale without clamping
    const bounds: Bounds = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    const view = fitView(bounds, 10000, 10000, 40);
    expect(view.k).toBeLessThanOrEqual(MAX_SCALE);
    expect(view.k).toBeGreaterThanOrEqual(MIN_SCALE);
  });

  it('handles single-node edge case (zero-range bounds)', () => {
    // All min == max → point degenerate
    const bounds: Bounds = { minX: 50, minY: 50, maxX: 50, maxY: 50 };
    const vw = 400;
    const vh = 300;
    const view = fitView(bounds, vw, vh);

    // With degenerate bounds: scale=1, node centered
    expect(view.k).toBe(1);
    const screenX = bounds.minX * view.k + view.tx;
    const screenY = bounds.minY * view.k + view.ty;
    // Node should appear at viewport center
    expect(screenX).toBeCloseTo(vw / 2, 0);
    expect(screenY).toBeCloseTo(vh / 2, 0);
  });

  it('handles zero-width but nonzero-height bounds', () => {
    // Vertical line of nodes (minX == maxX but minY != maxY)
    const bounds: Bounds = { minX: 200, minY: 0, maxX: 200, maxY: 400 };
    const vw = 800;
    const vh = 600;
    const view = fitView(bounds, vw, vh, 40);

    // Should scale based on height since width is zero
    expect(view.k).toBeGreaterThan(0);
    expect(view.k).toBeLessThanOrEqual(MAX_SCALE);
    // Content should still be within padded area vertically
    const topY = bounds.minY * view.k + view.ty;
    const botY = bounds.maxY * view.k + view.ty;
    expect(topY).toBeGreaterThanOrEqual(40 - 0.01);
    expect(botY).toBeLessThanOrEqual(vh - 40 + 0.01);
  });

  it('handles zero-height but nonzero-width bounds', () => {
    // Horizontal line of nodes
    const bounds: Bounds = { minX: 0, minY: 100, maxX: 400, maxY: 100 };
    const vw = 800;
    const vh = 600;
    const view = fitView(bounds, vw, vh, 40);

    // Should not produce Infinity or NaN
    expect(Number.isFinite(view.k)).toBe(true);
    expect(Number.isFinite(view.tx)).toBe(true);
    expect(Number.isFinite(view.ty)).toBe(true);
  });

  it('uses default padding of 40 when not provided', () => {
    const bounds: Bounds = { minX: 0, minY: 0, maxX: 400, maxY: 300 };
    const vw = 800;
    const vh = 600;
    const viewDefault = fitView(bounds, vw, vh);
    const viewExplicit = fitView(bounds, vw, vh, 40);
    expect(viewDefault.k).toBeCloseTo(viewExplicit.k, 5);
    expect(viewDefault.tx).toBeCloseTo(viewExplicit.tx, 5);
    expect(viewDefault.ty).toBeCloseTo(viewExplicit.ty, 5);
  });

  it('custom padding is respected', () => {
    const bounds: Bounds = { minX: 0, minY: 0, maxX: 200, maxY: 200 };
    const vw = 400;
    const vh = 400;
    const viewSmallPad = fitView(bounds, vw, vh, 10);
    const viewLargePad = fitView(bounds, vw, vh, 100);
    // Larger padding → smaller scale (more room consumed by padding)
    expect(viewLargePad.k).toBeLessThan(viewSmallPad.k);
  });

  it('very large content scales down to fit', () => {
    const bounds: Bounds = { minX: 0, minY: 0, maxX: 10000, maxY: 10000 };
    const vw = 400;
    const vh = 400;
    const view = fitView(bounds, vw, vh, 20);
    expect(view.k).toBeLessThan(1);
    expect(view.k).toBeGreaterThanOrEqual(MIN_SCALE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// zoomAtPoint
// ─────────────────────────────────────────────────────────────────────────────

describe('zoomAtPoint — cursor-centered zoom with clamping', () => {
  it('zooming in increases scale', () => {
    const view: ViewState = { tx: 0, ty: 0, k: 1 };
    const cursor: Point = { x: 400, y: 300 };
    const result = zoomAtPoint(view, cursor, 0.5);
    expect(result.k).toBeGreaterThan(view.k);
  });

  it('zooming out decreases scale', () => {
    const view: ViewState = { tx: 0, ty: 0, k: 2 };
    const cursor: Point = { x: 400, y: 300 };
    const result = zoomAtPoint(view, cursor, -0.5);
    expect(result.k).toBeLessThan(view.k);
  });

  it('scale is clamped to MIN_SCALE (0.1) on zoom out', () => {
    const view: ViewState = { tx: 0, ty: 0, k: 0.2 };
    const cursor: Point = { x: 100, y: 100 };
    const result = zoomAtPoint(view, cursor, -10); // extreme zoom out
    expect(result.k).toBe(MIN_SCALE);
  });

  it('scale is clamped to MAX_SCALE (4) on zoom in', () => {
    const view: ViewState = { tx: 0, ty: 0, k: 3.5 };
    const cursor: Point = { x: 100, y: 100 };
    const result = zoomAtPoint(view, cursor, 10); // extreme zoom in
    expect(result.k).toBe(MAX_SCALE);
  });

  it('cursor point stays fixed in screen-space after zoom (invariant)', () => {
    const view: ViewState = { tx: 50, ty: 30, k: 1.5 };
    const cursor: Point = { x: 200, y: 150 };

    // World coordinate under cursor BEFORE zoom:
    // screen = world * k + tx  →  world = (screen - tx) / k
    const worldXBefore = (cursor.x - view.tx) / view.k;
    const worldYBefore = (cursor.y - view.ty) / view.k;

    const result = zoomAtPoint(view, cursor, 0.3);

    // Same world coordinate mapped back to screen with NEW transform
    const screenXAfter = worldXBefore * result.k + result.tx;
    const screenYAfter = worldYBefore * result.k + result.ty;

    expect(screenXAfter).toBeCloseTo(cursor.x, 5);
    expect(screenYAfter).toBeCloseTo(cursor.y, 5);
  });

  it('cursor at origin (0,0) keeps origin fixed', () => {
    const view: ViewState = { tx: 0, ty: 0, k: 1 };
    const cursor: Point = { x: 0, y: 0 };
    const result = zoomAtPoint(view, cursor, 0.5);
    // With cursor at origin and initial tx/ty=0, translation stays 0
    expect(result.tx).toBeCloseTo(0, 5);
    expect(result.ty).toBeCloseTo(0, 5);
  });

  it('zoom with zero deltaScale returns unchanged view', () => {
    const view: ViewState = { tx: 100, ty: 200, k: 2 };
    const cursor: Point = { x: 300, y: 300 };
    const result = zoomAtPoint(view, cursor, 0);
    expect(result.k).toBeCloseTo(view.k, 5);
    expect(result.tx).toBeCloseTo(view.tx, 5);
    expect(result.ty).toBeCloseTo(view.ty, 5);
  });

  it('multiple zooms at same point preserve the invariant', () => {
    let view: ViewState = { tx: 0, ty: 0, k: 1 };
    const cursor: Point = { x: 250, y: 175 };

    for (let i = 0; i < 10; i++) {
      view = zoomAtPoint(view, cursor, 0.2);
    }

    // World point under cursor should still map to cursor
    const worldX = (cursor.x - view.tx) / view.k;
    const worldY = (cursor.y - view.ty) / view.k;
    const backX = worldX * view.k + view.tx;
    const backY = worldY * view.k + view.ty;
    expect(backX).toBeCloseTo(cursor.x, 3);
    expect(backY).toBeCloseTo(cursor.y, 3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// panBy
// ─────────────────────────────────────────────────────────────────────────────

describe('panBy — translate view by delta', () => {
  it('adds dx/dy to existing translation', () => {
    const view: ViewState = { tx: 10, ty: 20, k: 1 };
    const result = panBy(view, 5, -3);
    expect(result.tx).toBe(15);
    expect(result.ty).toBe(17);
  });

  it('preserves scale unchanged', () => {
    const view: ViewState = { tx: 0, ty: 0, k: 2.5 };
    const result = panBy(view, 100, 200);
    expect(result.k).toBe(2.5);
  });

  it('pan by zero is identity', () => {
    const view: ViewState = { tx: 42, ty: 99, k: 1.2 };
    const result = panBy(view, 0, 0);
    expect(result.tx).toBe(42);
    expect(result.ty).toBe(99);
    expect(result.k).toBe(1.2);
  });

  it('negative deltas pan left/up', () => {
    const view: ViewState = { tx: 50, ty: 50, k: 1 };
    const result = panBy(view, -30, -20);
    expect(result.tx).toBe(20);
    expect(result.ty).toBe(30);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeNodeBounds
// ─────────────────────────────────────────────────────────────────────────────

describe('computeNodeBounds — AABB of positioned nodes', () => {
  it('computes bounds encompassing all nodes with radii', () => {
    const nodes = [
      { x: 100, y: 100 },
      { x: 300, y: 200 },
    ];
    const radiusFn = () => 20;
    const bounds = computeNodeBounds(nodes, radiusFn);
    expect(bounds.minX).toBe(80);  // 100 - 20
    expect(bounds.minY).toBe(80);  // 100 - 20
    expect(bounds.maxX).toBe(320); // 300 + 20
    // maxY includes +20 for label space: 200 + 20 + 20 = 240
    expect(bounds.maxY).toBe(240);
  });

  it('returns zero bounds for empty node array', () => {
    const bounds = computeNodeBounds([], () => 10);
    expect(bounds.minX).toBe(0);
    expect(bounds.minY).toBe(0);
    expect(bounds.maxX).toBe(0);
    expect(bounds.maxY).toBe(0);
  });

  it('handles single node correctly', () => {
    const nodes = [{ x: 50, y: 50 }];
    const radiusFn = () => 15;
    const bounds = computeNodeBounds(nodes, radiusFn);
    expect(bounds.minX).toBe(35);  // 50 - 15
    expect(bounds.minY).toBe(35);  // 50 - 15
    expect(bounds.maxX).toBe(65);  // 50 + 15
    expect(bounds.maxY).toBe(85);  // 50 + 15 + 20 (label)
  });

  it('uses per-node radius from radiusFn', () => {
    const nodes = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    // First node has large radius, second has small
    const radiusFn = (node: { x: number; y: number }) => node.x === 0 ? 30 : 5;
    const bounds = computeNodeBounds(nodes, radiusFn);
    expect(bounds.minX).toBe(-30); // 0 - 30
    expect(bounds.maxX).toBe(105); // 100 + 5
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// dragNode
// ─────────────────────────────────────────────────────────────────────────────

describe('dragNode — screen delta to world-space position update', () => {
  it('at scale=1 screen delta equals world delta', () => {
    const pos: Point = { x: 100, y: 200 };
    const result = dragNode(pos, 10, -5, 1);
    expect(result.x).toBe(110);
    expect(result.y).toBe(195);
  });

  it('at scale=2 screen delta is halved in world space', () => {
    const pos: Point = { x: 50, y: 50 };
    const result = dragNode(pos, 20, 40, 2);
    expect(result.x).toBe(60);  // 50 + 20/2
    expect(result.y).toBe(70);  // 50 + 40/2
  });

  it('at scale=0.5 screen delta is doubled in world space', () => {
    const pos: Point = { x: 0, y: 0 };
    const result = dragNode(pos, 10, 10, 0.5);
    expect(result.x).toBe(20); // 0 + 10/0.5
    expect(result.y).toBe(20);
  });

  it('zero delta produces same position', () => {
    const pos: Point = { x: 42, y: 99 };
    const result = dragNode(pos, 0, 0, 1.5);
    expect(result.x).toBe(42);
    expect(result.y).toBe(99);
  });

  it('negative deltas move node left/up in world space', () => {
    const pos: Point = { x: 100, y: 100 };
    const result = dragNode(pos, -30, -20, 1);
    expect(result.x).toBe(70);
    expect(result.y).toBe(80);
  });

  it('handles scale <= 0 gracefully (fallback to 1)', () => {
    const pos: Point = { x: 10, y: 10 };
    const result = dragNode(pos, 5, 5, 0);
    // With scale=0 fallback to 1, delta should be applied 1:1
    expect(result.x).toBe(15);
    expect(result.y).toBe(15);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isDragMovement
// ─────────────────────────────────────────────────────────────────────────────

describe('isDragMovement — threshold check for click vs drag', () => {
  it('below threshold (4px) returns false (click)', () => {
    expect(isDragMovement(2, 1)).toBe(false); // |2|+|1| = 3 < 4
  });

  it('at threshold returns false (not strictly greater)', () => {
    expect(isDragMovement(2, 2)).toBe(false); // |2|+|2| = 4, not > 4
  });

  it('above threshold returns true (drag)', () => {
    expect(isDragMovement(3, 2)).toBe(true); // |3|+|2| = 5 > 4
  });

  it('negative deltas are handled (absolute value)', () => {
    expect(isDragMovement(-3, -2)).toBe(true); // |-3|+|-2| = 5 > 4
  });

  it('zero movement is a click', () => {
    expect(isDragMovement(0, 0)).toBe(false);
  });

  it('tiny movement (1px total) is a click', () => {
    expect(isDragMovement(0.5, 0.3)).toBe(false);
  });

  it('large movement is always a drag', () => {
    expect(isDragMovement(100, 200)).toBe(true);
  });

  it('DRAG_THRESHOLD constant is 4', () => {
    expect(DRAG_THRESHOLD).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

describe('view constants', () => {
  it('MIN_SCALE is 0.1', () => {
    expect(MIN_SCALE).toBe(0.1);
  });

  it('MAX_SCALE is 4', () => {
    expect(MAX_SCALE).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// fitView — MIN_FIT_SCALE cap
// ─────────────────────────────────────────────────────────────────────────────

describe('fitView — MIN_FIT_SCALE cap prevents microscopic labels', () => {
  it('caps scale at MIN_FIT_SCALE when content is very large', () => {
    // Content 5000×5000 in a 400×400 viewport: natural fit = 320/5000 = 0.064
    // MIN_FIT_SCALE = 0.45, so it should be capped up
    const bounds: Bounds = { minX: 0, minY: 0, maxX: 5000, maxY: 5000 };
    const view = fitView(bounds, 400, 400, 40);
    expect(view.k).toBe(MIN_FIT_SCALE);
  });

  it('does not cap when content fits naturally above MIN_FIT_SCALE', () => {
    // Content 200×200 in 800×600 viewport: natural fit ≈ 720/200 = 3.6
    const bounds: Bounds = { minX: 0, minY: 0, maxX: 200, maxY: 200 };
    const view = fitView(bounds, 800, 600, 40);
    expect(view.k).toBeGreaterThan(MIN_FIT_SCALE);
  });

  it('MIN_FIT_SCALE constant value is 0.45', () => {
    expect(MIN_FIT_SCALE).toBe(0.45);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// nodeRadius — clamped sqrt-scale node sizing
// ─────────────────────────────────────────────────────────────────────────────

describe('nodeRadius — clamped sqrt-scale radius', () => {
  it('returns NODE_RADIUS_MIN for zero traffic', () => {
    const r = nodeRadius(0, 100);
    expect(r).toBe(NODE_RADIUS_MIN);
  });

  it('returns NODE_RADIUS_MAX for max traffic', () => {
    const r = nodeRadius(100, 100);
    expect(r).toBe(NODE_RADIUS_MAX);
  });

  it('returns midpoint radius for rate/maxRate = 0.25 (sqrt ≈ 0.5)', () => {
    const r = nodeRadius(25, 100);
    // sqrt(0.25) = 0.5 → min + 0.5 * (max - min) = 8 + 0.5*18 = 17
    expect(r).toBeCloseTo(17, 1);
  });

  it('radius is within [NODE_RADIUS_MIN, NODE_RADIUS_MAX] for any valid input', () => {
    const rates = [0, 1, 10, 50, 99, 100, 200];
    for (const rate of rates) {
      const r = nodeRadius(rate, 100);
      expect(r).toBeGreaterThanOrEqual(NODE_RADIUS_MIN);
      expect(r).toBeLessThanOrEqual(NODE_RADIUS_MAX);
    }
  });

  it('returns mid-range when maxTotalRate is 0', () => {
    const r = nodeRadius(50, 0);
    expect(r).toBeCloseTo((NODE_RADIUS_MIN + NODE_RADIUS_MAX) / 2, 1);
  });

  it('NODE_RADIUS_MIN is 8', () => {
    expect(NODE_RADIUS_MIN).toBe(8);
  });

  it('NODE_RADIUS_MAX is 26', () => {
    expect(NODE_RADIUS_MAX).toBe(26);
  });

  it('sqrt scale produces gentler difference than linear', () => {
    // At rate=10 with max=100: linear would give 0.1 range, sqrt gives sqrt(0.1) ≈ 0.316
    const r = nodeRadius(10, 100);
    const linearR = NODE_RADIUS_MIN + (10 / 100) * (NODE_RADIUS_MAX - NODE_RADIUS_MIN);
    expect(r).toBeGreaterThan(linearR);
  });
});
