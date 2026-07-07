/**
 * Pure helpers for DAG node label rendering.
 * No side effects — designed for independent unit testing.
 */

/** Default max characters before truncation with ellipsis. */
export const DEFAULT_LABEL_MAX_CHARS = 16;

/**
 * Truncates a label to maxChars and appends '…' if it exceeds that length.
 * Returns the original string if it fits within the limit.
 *
 * @param label - The full label string.
 * @param maxChars - Maximum characters before truncation. Defaults to 16.
 * @returns Truncated label with ellipsis, or the original if short enough.
 */
export function truncateLabel(label: string, maxChars: number = DEFAULT_LABEL_MAX_CHARS): string {
  if (label.length <= maxChars) {
    return label;
  }
  return label.slice(0, maxChars) + '…';
}

/**
 * Computes the vertical y-offset for a node label within its DAG layer
 * to stagger adjacent labels and reduce horizontal overlap.
 *
 * Odd-indexed nodes within a layer get a larger downward offset.
 *
 * @param indexInLayer - Zero-based index of the node within its layer.
 * @param baseOffset - Base y-offset below the node circle (px). Default 14.
 * @param staggerAmount - Additional offset for odd-indexed nodes (px). Default 12.
 * @returns The y-offset (px) to apply below the node center.
 */
export function labelYOffset(
  indexInLayer: number,
  baseOffset = 14,
  staggerAmount = 12
): number {
  return baseOffset + (indexInLayer % 2 === 1 ? staggerAmount : 0);
}
