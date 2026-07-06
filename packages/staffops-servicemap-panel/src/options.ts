/**
 * Panel options definitions for the service map plugin.
 * Used by module.ts to register panel options UI.
 */

import { PanelOptionsEditorBuilder } from '@grafana/data';
import { ServiceMapOptions } from './types';

/**
 * Configures the panel options editor (error threshold,
 * trace datasource, query role mapping, M2 options).
 */
export function buildPanelOptions(builder: PanelOptionsEditorBuilder<ServiceMapOptions>): PanelOptionsEditorBuilder<ServiceMapOptions> {
  return builder
    .addNumberInput({
      path: 'warnThreshold',
      name: 'Warning threshold',
      description: 'Error ratio (0–1) above which edges are marked warning',
      defaultValue: 0.01,
      settings: {
        min: 0,
        max: 1,
        step: 0.005,
      },
    })
    .addNumberInput({
      path: 'errorThreshold',
      name: 'Critical threshold',
      description: 'Error ratio (0–1) above which edges are marked critical',
      defaultValue: 0.05,
      settings: {
        min: 0,
        max: 1,
        step: 0.01,
      },
    })
    .addBooleanSwitch({
      path: 'animate',
      name: 'Animate traffic',
      description: 'Show animated particles along edges representing request flow',
      defaultValue: true,
    })
    .addBooleanSwitch({
      path: 'showEdgeLabels',
      name: 'Show edge labels',
      description: 'Display RPS, error %, and p95 on edges',
      defaultValue: false,
    })
    .addTextInput({
      path: 'traceDatasourceUid',
      name: 'Trace datasource UID',
      description: 'UID of the Tempo (or compatible) datasource for drill-down',
      defaultValue: '',
    })
    .addTextInput({
      path: 'queryMapping.rateRefId',
      name: 'Rate query refId',
      description: 'refId of the query returning edge request rate',
      defaultValue: 'A',
    })
    .addTextInput({
      path: 'queryMapping.errorRefId',
      name: 'Error query refId',
      description: 'refId of the query returning edge error rate',
      defaultValue: 'B',
    })
    .addTextInput({
      path: 'queryMapping.latencyRefId',
      name: 'Latency query refId',
      description: 'refId of the query returning edge p95 latency',
      defaultValue: 'C',
    })
    // ─── Milestone 2 options ─────────────────────────────────────────────────
    .addSelect({
      path: 'connectionTypeFilter',
      name: 'Connection type filter',
      description: 'Filter edges by connection type',
      defaultValue: 'all',
      settings: {
        options: [
          { value: 'all', label: 'All' },
          { value: 'services', label: 'Services only' },
          { value: 'database', label: 'Databases only' },
          { value: 'messaging_system', label: 'Messaging only' },
        ],
      },
    })
    .addBooleanSwitch({
      path: 'showVirtualClients',
      name: 'Show virtual clients',
      description: 'Show external callers (virtual_node=client). Hidden by default.',
      defaultValue: false,
    })
    .addBooleanSwitch({
      path: 'showVirtualServers',
      name: 'Show virtual servers',
      description: 'Show external dependencies (virtual_node=server). Shown by default.',
      defaultValue: true,
    })
    .addNumberInput({
      path: 'blastRadiusHops',
      name: 'Blast radius hops',
      description: 'Number of hops for blast-radius highlight on node click',
      defaultValue: 1,
      settings: {
        min: 1,
        max: 10,
        step: 1,
        integer: true,
      },
    })
    .addTextInput({
      path: 'logsDatasourceUid',
      name: 'Logs datasource UID',
      description: 'UID of the Loki datasource for log drill-down from nodes',
      defaultValue: '',
    })
    .addTextInput({
      path: 'dashboardUrlTemplate',
      name: 'Dashboard URL template',
      description: 'URL template for service dashboard. Use ${workload}, ${namespace}, ${serviceName}.',
      defaultValue: '',
    })
    .addTextInput({
      path: 'alertsRefId',
      name: 'Alerts query refId',
      description: 'refId of the optional alerts query for overlay badges (e.g. "D")',
      defaultValue: '',
    });
}
