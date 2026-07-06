/**
 * Alert overlay: matches an optional alerts series to graph nodes.
 * Pure function — degrades gracefully when the alerts series is absent.
 */

import { DataFrame, Field } from '@grafana/data';
import { GraphNode } from '../types';

/** An active alert matched to a node. */
export interface NodeAlert {
  /** Alert name (alertname label). */
  alertname: string;
  /** Severity (if present). */
  severity?: string;
}

/**
 * Matches alerts from an optional query series to graph nodes.
 * Matching is done by workload name or service_name.
 *
 * The alert series is expected to have fields like:
 * - alertname, severity, service_workload or service_name
 *
 * @param frames - All data frames from the panel query runner.
 * @param alertsRefId - refId of the alerts query (configured in panel options).
 * @param nodes - Current graph nodes.
 * @returns Map from node id to array of matched alerts. Empty map if no alerts series found.
 */
export function matchAlerts(
  frames: DataFrame[],
  alertsRefId: string | undefined,
  nodes: GraphNode[]
): Map<string, NodeAlert[]> {
  const result = new Map<string, NodeAlert[]>();

  if (!frames || !alertsRefId || !nodes || nodes.length === 0) {
    return result;
  }

  // Find the alerts frame
  const alertFrame = frames.find((f) => (f.refId ?? '').trim() === alertsRefId);
  if (!alertFrame || !alertFrame.fields || alertFrame.length === 0) {
    return result;
  }

  // Build a set of node ids and service names for fast lookup
  const nodeIdSet = new Set<string>(nodes.map((n) => n.id));
  const serviceNameToNodeId = new Map<string, string>();
  for (const node of nodes) {
    if (node.serviceName) {
      serviceNameToNodeId.set(node.serviceName, node.id);
    }
  }

  // Find relevant fields in the alert frame
  const findAlertField = (name: string): Field | undefined => {
    const lower = name.toLowerCase();
    return alertFrame.fields.find((f) => f.name.toLowerCase() === lower);
  };

  const alertnameField = findAlertField('alertname');
  const severityField = findAlertField('severity');
  const workloadField = findAlertField('service_workload') ?? findAlertField('workload');
  const serviceNameField = findAlertField('service_name') ?? findAlertField('service');

  if (!alertnameField) {
    return result;
  }

  for (let i = 0; i < alertFrame.length; i++) {
    const alertname = getString(alertnameField, i);
    if (!alertname) {
      continue;
    }

    const severity = severityField ? getString(severityField, i) : undefined;
    const alert: NodeAlert = { alertname, severity };

    // Try to match by workload first, then by service_name
    let matchedNodeId: string | undefined;

    if (workloadField) {
      const workload = getString(workloadField, i);
      if (workload && nodeIdSet.has(workload)) {
        matchedNodeId = workload;
      }
    }

    if (!matchedNodeId && serviceNameField) {
      const svcName = getString(serviceNameField, i);
      if (svcName) {
        // Direct match (node id = service_name for some cases)
        if (nodeIdSet.has(svcName)) {
          matchedNodeId = svcName;
        } else {
          // Try reverse lookup via serviceName property
          matchedNodeId = serviceNameToNodeId.get(svcName);
        }
      }
    }

    if (matchedNodeId) {
      if (!result.has(matchedNodeId)) {
        result.set(matchedNodeId, []);
      }
      result.get(matchedNodeId)!.push(alert);
    }
  }

  return result;
}

function getString(field: Field, index: number): string {
  const val = field.values[index];
  return val != null ? String(val).trim() : '';
}
