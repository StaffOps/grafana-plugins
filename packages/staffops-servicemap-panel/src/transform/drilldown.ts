/**
 * Drill-down URL builders for node interactions.
 * Pure functions that produce Grafana Explore/dashboard URLs.
 */

import { GraphNode } from '../types';

/** Encodes a string for use in a URL query parameter. */
function encodeForUrl(str: string): string {
  return encodeURIComponent(str);
}

/** Escapes a label value for safe use inside a TraceQL string literal. */
function escapeTraceQLValue(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Escapes a label value for safe use inside a LogQL selector. */
function escapeLogQLValue(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// ─────────────────────────────────────────────────────────────────────────────
// Trace drill (existing behavior, unchanged)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a Grafana Explore URL for traces scoped to a service (node).
 */
export function buildTracesDrillUrl(
  node: GraphNode,
  traceDatasourceUid: string
): string | null {
  if (!traceDatasourceUid || !node.id) {
    return null;
  }

  const serviceName = node.serviceName || node.id;
  const traceQL = `{ resource.service.name = "${escapeTraceQLValue(serviceName)}" }`;

  const left = JSON.stringify({
    datasource: traceDatasourceUid,
    queries: [{ refId: 'A', queryType: 'traceql', query: traceQL }],
    range: { from: 'now-1h', to: 'now' },
  });

  return `/explore?left=${encodeForUrl(left)}`;
}

/**
 * Builds a Grafana Explore URL for traces to a DB node, targeting
 * the CLIENT spans filtered by db.system (no server span exists).
 */
export function buildDbClientDrillUrl(
  node: GraphNode,
  traceDatasourceUid: string
): string | null {
  if (!traceDatasourceUid || !node.id) {
    return null;
  }

  // For DB nodes, search for client spans that call this database
  // The db.system attribute identifies the type (e.g. postgresql, redis)
  const dbName = escapeTraceQLValue(node.id);
  const traceQL = `{ span.db.system != "" && resource.service.name != "${dbName}" }`;

  const left = JSON.stringify({
    datasource: traceDatasourceUid,
    queries: [{ refId: 'A', queryType: 'traceql', query: traceQL }],
    range: { from: 'now-1h', to: 'now' },
  });

  return `/explore?left=${encodeForUrl(left)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Loki logs drill
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a Grafana Explore URL for Loki logs scoped by namespace + workload.
 * Falls back to `app` label if workload is unresolved.
 */
export function buildLogsDrillUrl(
  node: GraphNode,
  logsDatasourceUid: string
): string | null {
  if (!logsDatasourceUid || !node.id) {
    return null;
  }

  const namespace = node.namespace || '';
  const workload = node.id;

  // Build LogQL selector: namespace + workload (with app fallback)
  let selector: string;
  if (namespace) {
    if (node.unresolvedWorkload) {
      // Fallback: use app label with service_name
      const app = node.serviceName || workload;
      selector = `{namespace="${escapeLogQLValue(namespace)}", app="${escapeLogQLValue(app)}"}`;
    } else {
      selector = `{namespace="${escapeLogQLValue(namespace)}", pod=~"${escapeLogQLValue(workload)}.*"}`;
    }
  } else {
    // No namespace — best effort with just the workload/app
    if (node.unresolvedWorkload && node.serviceName) {
      selector = `{app="${escapeLogQLValue(node.serviceName)}"}`;
    } else {
      selector = `{pod=~"${escapeLogQLValue(workload)}.*"}`;
    }
  }

  const left = JSON.stringify({
    datasource: logsDatasourceUid,
    queries: [{ refId: 'A', expr: selector }],
    range: { from: 'now-1h', to: 'now' },
  });

  return `/explore?left=${encodeForUrl(left)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service dashboard drill
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a dashboard URL from a template, substituting workload/namespace/serviceName.
 * Template placeholders: ${workload}, ${namespace}, ${serviceName}
 */
export function buildDashboardUrl(
  node: GraphNode,
  template: string
): string | null {
  if (!template || !node.id) {
    return null;
  }

  const workload = encodeForUrl(node.id);
  const namespace = encodeForUrl(node.namespace || '');
  const serviceName = encodeForUrl(node.serviceName || node.id);

  return template
    .replace(/\$\{workload\}/g, workload)
    .replace(/\$\{namespace\}/g, namespace)
    .replace(/\$\{serviceName\}/g, serviceName);
}
