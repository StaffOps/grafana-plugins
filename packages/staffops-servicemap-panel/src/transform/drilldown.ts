/**
 * Drill-down URL builders for node interactions.
 * Pure functions that produce Grafana Explore/dashboard URLs.
 *
 * Uses the modern Grafana Explore URL schema (10.1+):
 *   /explore?schemaVersion=1&orgId=1&panes=<urlencoded JSON>
 * where panes is an object keyed by an arbitrary pane id.
 */

import { GraphNode } from '../types';

/** Encodes a string for use in a URL query parameter. */
function encodeForUrl(str: string): string {
  return encodeURIComponent(str);
}

/** Escapes a label value for safe use inside a TraceQL string literal. */
export function escapeTraceQLValue(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\0/g, '');
}

/** Escapes a label value for safe use inside a LogQL selector. */
function escapeLogQLValue(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\0/g, '');
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared Explore URL builder (modern panes schema)
// ─────────────────────────────────────────────────────────────────────────────

export interface ExploreQuery {
  refId: string;
  queryType?: string;
  query?: string;
  expr?: string;
  datasource: { type: string; uid: string };
}

/**
 * Builds a Grafana Explore URL using the modern panes schema
 * (schemaVersion=1, Grafana 10.1+).
 */
export function buildExploreUrl(
  datasourceUid: string,
  datasourceType: string,
  queries: ExploreQuery[],
  range: { from: string; to: string } = { from: 'now-1h', to: 'now' }
): string {
  const panes = {
    svc: {
      datasource: datasourceUid,
      queries,
      range,
    },
  };
  return `/explore?schemaVersion=1&orgId=1&panes=${encodeForUrl(JSON.stringify(panes))}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Trace drill
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

  return buildExploreUrl(traceDatasourceUid, 'tempo', [
    {
      refId: 'A',
      queryType: 'traceql',
      query: traceQL,
      datasource: { type: 'tempo', uid: traceDatasourceUid },
    },
  ]);
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

  const dbName = escapeTraceQLValue(node.id);
  const traceQL = `{ span.db.system != "" && resource.service.name != "${dbName}" }`;

  return buildExploreUrl(traceDatasourceUid, 'tempo', [
    {
      refId: 'A',
      queryType: 'traceql',
      query: traceQL,
      datasource: { type: 'tempo', uid: traceDatasourceUid },
    },
  ]);
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
      const app = node.serviceName || workload;
      selector = `{namespace="${escapeLogQLValue(namespace)}", app="${escapeLogQLValue(app)}"}`;
    } else {
      selector = `{namespace="${escapeLogQLValue(namespace)}", pod=~"${escapeLogQLValue(workload)}.*"}`;
    }
  } else {
    if (node.unresolvedWorkload && node.serviceName) {
      selector = `{app="${escapeLogQLValue(node.serviceName)}"}`;
    } else {
      selector = `{pod=~"${escapeLogQLValue(workload)}.*"}`;
    }
  }

  return buildExploreUrl(logsDatasourceUid, 'loki', [
    {
      refId: 'A',
      expr: selector,
      datasource: { type: 'loki', uid: logsDatasourceUid },
    },
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Edge trace drill (used by ServiceMapPanel handleEdgeClick)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds an Explore URL for an edge (client→server) trace query.
 */
export function buildEdgeTracesDrillUrl(
  source: string,
  target: string,
  traceDatasourceUid: string
): string | null {
  if (!traceDatasourceUid) {
    return null;
  }

  const server = escapeTraceQLValue(target);
  const client = escapeTraceQLValue(source);
  const traceQL = `{ resource.service.name = "${server}" && span.client = "${client}" }`;

  return buildExploreUrl(traceDatasourceUid, 'tempo', [
    {
      refId: 'A',
      queryType: 'traceql',
      query: traceQL,
      datasource: { type: 'tempo', uid: traceDatasourceUid },
    },
  ]);
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
