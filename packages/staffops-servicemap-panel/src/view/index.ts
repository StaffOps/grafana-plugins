/**
 * Pure view-transform helpers for SVG zoom, pan, fit-to-view, and drag.
 *
 * All functions are side-effect-free and deterministic — designed for
 * independent unit testing. No DOM or React dependency.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Affine view state: translation (tx, ty) + uniform scale (k). */
export interface ViewState {
  tx: number;
  ty: number;
  k: number;
}

/** A 2D point in screen coordinates. */
export interface Point {
  x: number;
  y: number;
}

/** Axis-aligned bounding box. */
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum allowed zoom scale. */
export const MIN_SCALE = 0.1;

/** Maximum allowed zoom scale. */
export const MAX_SCALE = 4;

/**
 * Minimum scale for the fit-to-view operation — prevents labels from
 * rendering too small to read on initial load.
 */
export const MIN_FIT_SCALE = 0.45;

/** Zoom sensitivity per wheel delta unit. */
export const ZOOM_FACTOR = 0.002;

/** Movement threshold (px) to distinguish drag from click. */
export const DRAG_THRESHOLD = 4;

// ─────────────────────────────────────────────────────────────────────────────
// Zoom
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes a new view state after zooming centered on a cursor position.
 *
 * The zoom keeps the point under the cursor fixed in screen space by
 * adjusting translation alongside scale.
 *
 * @param view - Current view state.
 * @param cursor - Cursor position in SVG viewport coordinates (relative to SVG top-left).
 * @param deltaScale - Signed scale delta (positive = zoom in, negative = zoom out).
 * @returns New ViewState with clamped scale and adjusted translation.
 */
export function zoomAtPoint(view: ViewState, cursor: Point, deltaScale: number): ViewState {
  const newK = clampScale(view.k + deltaScale);
  const ratio = newK / view.k;

  // Keep cursor point fixed: adjust translation so the same world-point
  // remains under the cursor after scaling.
  const tx = cursor.x - ratio * (cursor.x - view.tx);
  const ty = cursor.y - ratio * (cursor.y - view.ty);

  return { tx, ty, k: newK };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pan
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Applies a pan (translation delta) to the view.
 *
 * @param view - Current view state.
 * @param dx - Horizontal delta in screen pixels.
 * @param dy - Vertical delta in screen pixels.
 * @returns New ViewState with updated translation.
 */
export function panBy(view: ViewState, dx: number, dy: number): ViewState {
  return { tx: view.tx + dx, ty: view.ty + dy, k: view.k };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fit to view
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes the view transform that fits given content bounds within the viewport.
 *
 * If fitting would require shrinking below MIN_FIT_SCALE, the scale is capped at
 * MIN_FIT_SCALE and the content is centered at that scale (overflow handled by
 * user pan/zoom). This keeps labels readable on initial load.
 *
 * @param nodeBounds - Bounding box of all graph content in world coordinates.
 * @param viewportWidth - Available viewport width in pixels.
 * @param viewportHeight - Available viewport height in pixels.
 * @param padding - Padding in pixels around the fitted content.
 * @returns ViewState that fits and centers the content.
 */
export function fitView(
  nodeBounds: Bounds,
  viewportWidth: number,
  viewportHeight: number,
  padding = 40
): ViewState {
  const contentW = nodeBounds.maxX - nodeBounds.minX;
  const contentH = nodeBounds.maxY - nodeBounds.minY;

  // Degenerate: single point or empty
  if (contentW <= 0 && contentH <= 0) {
    const k = 1;
    const tx = viewportWidth / 2 - nodeBounds.minX;
    const ty = viewportHeight / 2 - nodeBounds.minY;
    return { tx, ty, k };
  }

  const availW = viewportWidth - padding * 2;
  const availH = viewportHeight - padding * 2;

  // Natural scale to fit all content, clamped to valid range
  const naturalK = Math.min(
    availW / Math.max(contentW, 1),
    availH / Math.max(contentH, 1)
  );

  // Cap at MIN_FIT_SCALE so labels stay readable
  const k = clampScale(Math.max(naturalK, MIN_FIT_SCALE));

  // Center the scaled content within the viewport
  const scaledW = contentW * k;
  const scaledH = contentH * k;
  const tx = (viewportWidth - scaledW) / 2 - nodeBounds.minX * k;
  const ty = (viewportHeight - scaledH) / 2 - nodeBounds.minY * k;

  return { tx, ty, k };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bounds
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes the bounding box of a set of positioned nodes (accounting for radius).
 *
 * @param nodes - Array of objects with x, y coordinates.
 * @param radiusFn - Function returning the radius for a node (for padding the bounds).
 * @returns Bounds encompassing all nodes including their radii.
 */
export function computeNodeBounds(
  nodes: ReadonlyArray<{ x: number; y: number }>,
  radiusFn: (node: { x: number; y: number }) => number
): Bounds {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    const r = radiusFn(node);
    const left = node.x - r;
    const right = node.x + r;
    const top = node.y - r;
    const bottom = node.y + r + 20; // extra for label below node
    if (left < minX) { minX = left; }
    if (right > maxX) { maxX = right; }
    if (top < minY) { minY = top; }
    if (bottom > maxY) { maxY = bottom; }
  }

  return { minX, minY, maxX, maxY };
}

// ─────────────────────────────────────────────────────────────────────────────
// Node drag
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes the new world-space position of a dragged node given the
 * screen-space movement delta and the current view transform.
 *
 * @param currentPos - Current node position in world coordinates.
 * @param screenDx - Mouse movement delta X in screen pixels.
 * @param screenDy - Mouse movement delta Y in screen pixels.
 * @param scale - Current view scale factor (k).
 * @returns New node position in world coordinates.
 */
export function dragNode(
  currentPos: Point,
  screenDx: number,
  screenDy: number,
  scale: number
): Point {
  // Convert screen-space delta to world-space delta
  const s = scale > 0 ? scale : 1;
  return {
    x: currentPos.x + screenDx / s,
    y: currentPos.y + screenDy / s,
  };
}

/**
 * Determines whether accumulated movement exceeds the drag threshold.
 *
 * @param totalDx - Total accumulated horizontal movement (px).
 * @param totalDy - Total accumulated vertical movement (px).
 * @returns True if the movement constitutes a drag (not a click).
 */
export function isDragMovement(totalDx: number, totalDy: number): boolean {
  return Math.abs(totalDx) + Math.abs(totalDy) > DRAG_THRESHOLD;
}

// ─────────────────────────────────────────────────────────────────────────────
// Node radius
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum node radius (px). */
export const NODE_RADIUS_MIN = 8;

/** Maximum node radius (px). */
export const NODE_RADIUS_MAX = 26;

/**
 * Computes a clamped node radius using a sqrt scale.
 *
 * The sqrt mapping ensures hubs are distinguishable from leaves without
 * extreme size differences.
 *
 * @param totalRate - Traffic rate for this node.
 * @param maxTotalRate - Maximum traffic rate across all nodes (>0).
 * @returns Radius in pixels within [NODE_RADIUS_MIN, NODE_RADIUS_MAX].
 */
export function nodeRadius(totalRate: number, maxTotalRate: number): number {
  if (maxTotalRate <= 0) {
    return (NODE_RADIUS_MIN + NODE_RADIUS_MAX) / 2;
  }
  const ratio = Math.max(0, Math.min(1, totalRate / maxTotalRate));
  const t = Math.sqrt(ratio);
  return NODE_RADIUS_MIN + t * (NODE_RADIUS_MAX - NODE_RADIUS_MIN);
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal
// ─────────────────────────────────────────────────────────────────────────────

/** Clamps scale to the valid range [MIN_SCALE, MAX_SCALE]. */
function clampScale(k: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, k));
}
