/**
 * Pure visualization functions for the service map panel (v2).
 *
 * All functions are side-effect-free and deterministic — designed for
 * independent unit testing at ≥90% coverage.
 */

import { GraphModel } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Health status
// ─────────────────────────────────────────────────────────────────────────────

/** Discrete health status for edges and nodes. */
export type HealthStatus = 'ok' | 'warn' | 'crit';

/**
 * Determines edge health from error ratio and thresholds.
 *
 * @param errorRatio - Error ratio (0–1). NaN/negative treated as 0.
 * @param warn - Warn threshold (0–1). Default 0.01.
 * @param crit - Critical threshold (0–1). Default 0.05.
 * @returns Discrete health status.
 */
export function health(errorRatio: number, warn: number, crit: number): HealthStatus {
  const ratio = Number.isFinite(errorRatio) && errorRatio > 0 ? errorRatio : 0;
  const w = Number.isFinite(warn) && warn > 0 ? warn : 0.01;
  const c = Number.isFinite(crit) && crit > 0 ? crit : 0.05;

  if (ratio >= c) {
    return 'crit';
  }
  if (ratio >= w) {
    return 'warn';
  }
  return 'ok';
}

// ─────────────────────────────────────────────────────────────────────────────
// Flow (animated traffic) parameters
// ─────────────────────────────────────────────────────────────────────────────

/** Parameters controlling particle animation for a single edge. */
export interface FlowParams {
  /** Number of particles to render (1–5). */
  count: number;
  /** Animation duration in seconds (lower = faster). Clamped 0.5–4. */
  speed: number;
}

/**
 * Computes particle count and speed for an edge based on its rate.
 *
 * Normalizes rate against maxRate; guards against 0, negative, and NaN.
 * Returns neutral/minimal animation for degenerate inputs.
 *
 * @param rate - Request rate for this edge (req/s).
 * @param maxRate - Maximum rate among all edges (for normalization).
 * @returns FlowParams with clamped count/speed.
 */
export function flowParams(rate: number, maxRate: number): FlowParams {
  // Guard degenerate inputs
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 0;
  const safeMax = Number.isFinite(maxRate) && maxRate > 0 ? maxRate : 1;

  const normalized = Math.min(safeRate / safeMax, 1);

  // count: 1 (min) to 5 (max), linearly scaled
  const count = Math.max(1, Math.min(5, Math.round(1 + normalized * 4)));

  // speed (duration): 4s (slowest/lowest traffic) to 0.5s (fastest/highest traffic)
  const speed = Math.max(0.5, Math.min(4, 4 - normalized * 3.5));

  return { count, speed };
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

/** Aggregated summary of the visible graph. */
export interface GraphSummary {
  /** Number of unique services (nodes). */
  services: number;
  /** Number of edges. */
  edges: number;
  /** Aggregate error percentage (0–100). */
  errorPct: number;
  /** Total request rate across all edges (req/s). */
  totalRps: number;
}

/**
 * Computes a summary line for the graph model.
 *
 * @param model - The graph model (nodes + edges).
 * @returns Aggregate summary. Returns zeros for empty model.
 */
export function summarize(model: GraphModel): GraphSummary {
  if (!model || model.nodes.length === 0) {
    return { services: 0, edges: 0, errorPct: 0, totalRps: 0 };
  }

  const totalRps = model.edges.reduce((sum, e) => sum + (Number.isFinite(e.rate) ? e.rate : 0), 0);
  const totalErrors = model.edges.reduce(
    (sum, e) => sum + (Number.isFinite(e.errorRatio) && Number.isFinite(e.rate) ? e.errorRatio * e.rate : 0),
    0
  );

  const errorPct = totalRps > 0 ? (totalErrors / totalRps) * 100 : 0;

  return {
    services: model.nodes.length,
    edges: model.edges.length,
    errorPct: Number.isFinite(errorPct) ? errorPct : 0,
    totalRps: Number.isFinite(totalRps) ? totalRps : 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Node health (worst incident edge)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes health status for each node based on the worst-case incident edge.
 *
 * A node's health is the most severe health status among all edges where the
 * node appears as either source or target.
 *
 * @param model - The graph model.
 * @param warn - Warn threshold (passed to health()).
 * @param crit - Critical threshold (passed to health()).
 * @returns Map from node id to its health status.
 */
export function nodeHealth(
  model: GraphModel,
  warn: number,
  crit: number
): Map<string, HealthStatus> {
  const result = new Map<string, HealthStatus>();

  if (!model || model.nodes.length === 0) {
    return result;
  }

  // Initialize all nodes as 'ok'
  for (const node of model.nodes) {
    result.set(node.id, 'ok');
  }

  // Propagate worst edge status to incident nodes
  for (const edge of model.edges) {
    const edgeStatus = health(edge.errorRatio, warn, crit);

    if (edgeStatus !== 'ok') {
      const sourceStatus = result.get(edge.source) ?? 'ok';
      const targetStatus = result.get(edge.target) ?? 'ok';

      if (isWorse(edgeStatus, sourceStatus)) {
        result.set(edge.source, edgeStatus);
      }
      if (isWorse(edgeStatus, targetStatus)) {
        result.set(edge.target, edgeStatus);
      }
    }
  }

  return result;
}

/** Severity ordering: crit > warn > ok. */
function isWorse(a: HealthStatus, b: HealthStatus): boolean {
  const order: Record<HealthStatus, number> = { ok: 0, warn: 1, crit: 2 };
  return order[a] > order[b];
}
