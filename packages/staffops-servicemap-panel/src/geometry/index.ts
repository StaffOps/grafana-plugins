/**
 * Geometry helpers for edge paths and particle animation.
 *
 * Pure functions — no side effects, no DOM coupling. Designed for
 * independent unit testing.
 */

/**
 * Generates an SVG path `d` attribute for a straight edge between two points.
 *
 * Used as the `path` attribute on `<animateMotion>` so particles travel
 * from source to target in the correct coordinate space.
 *
 * The path is always a simple `M x1 y1 L x2 y2` line segment. Both ends
 * should already account for node radii / arrowhead offsets.
 *
 * @param x1 - Source point x (after node-radius offset).
 * @param y1 - Source point y (after node-radius offset).
 * @param x2 - Target point x (before arrowhead offset).
 * @param y2 - Target point y (before arrowhead offset).
 * @returns SVG path data string suitable for animateMotion `path` attribute.
 *
 * @example
 * ```ts
 * edgePath(100, 50, 300, 200)
 * // => "M 100 50 L 300 200"
 * ```
 */
export function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  return `M ${x1} ${y1} L ${x2} ${y2}`;
}

/**
 * Computes the position along a straight edge at a given progress (0–1).
 *
 * Useful for testing that particles would be at the expected location
 * at a given time fraction.
 *
 * @param x1 - Source x.
 * @param y1 - Source y.
 * @param x2 - Target x.
 * @param y2 - Target y.
 * @param t  - Progress (0 = source, 1 = target). Clamped to [0, 1].
 * @returns [x, y] interpolated position.
 */
export function positionOnEdge(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  t: number
): [number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  return [
    x1 + (x2 - x1) * clamped,
    y1 + (y2 - y1) * clamped,
  ];
}

/**
 * Computes the length of a straight edge.
 *
 * @returns Euclidean distance between (x1,y1) and (x2,y2).
 */
export function edgeLength(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}
