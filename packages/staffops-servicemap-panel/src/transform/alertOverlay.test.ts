/**
 * Tests for alert overlay matching.
 */
import { DataFrame, FieldType } from '@grafana/data';
import { matchAlerts } from './alertOverlay';
import { GraphNode } from '../types';

const nodes: GraphNode[] = [
  { id: 'dpm-people-api', inRate: 100, outRate: 50, totalRate: 150, serviceName: 'PeopleService' },
  { id: 'dpm-order-api', inRate: 80, outRate: 40, totalRate: 120, serviceName: 'OrderService' },
  { id: 'redis', inRate: 60, outRate: 0, totalRate: 60, isDatabase: true },
];

function makeAlertFrame(refId: string, opts: {
  alertnames: string[];
  workloads?: string[];
  serviceNames?: string[];
  severities?: string[];
}): DataFrame {
  const fields: any[] = [
    { name: 'alertname', type: FieldType.string, values: opts.alertnames, config: {} },
  ];
  if (opts.workloads) {
    fields.push({ name: 'service_workload', type: FieldType.string, values: opts.workloads, config: {} });
  }
  if (opts.serviceNames) {
    fields.push({ name: 'service_name', type: FieldType.string, values: opts.serviceNames, config: {} });
  }
  if (opts.severities) {
    fields.push({ name: 'severity', type: FieldType.string, values: opts.severities, config: {} });
  }
  return { refId, fields, length: opts.alertnames.length };
}

describe('matchAlerts', () => {
  it('returns empty map when alertsRefId is undefined', () => {
    const result = matchAlerts([], undefined, nodes);
    expect(result.size).toBe(0);
  });

  it('returns empty map when alertsRefId is empty', () => {
    const result = matchAlerts([], '', nodes);
    expect(result.size).toBe(0);
  });

  it('returns empty map when no frame matches the refId', () => {
    const frame = makeAlertFrame('X', { alertnames: ['HighError'], workloads: ['dpm-people-api'] });
    const result = matchAlerts([frame], 'D', nodes);
    expect(result.size).toBe(0);
  });

  it('matches by service_workload', () => {
    const frame = makeAlertFrame('D', {
      alertnames: ['HighErrorRate', 'HighLatency'],
      workloads: ['dpm-people-api', 'dpm-order-api'],
      severities: ['critical', 'warning'],
    });
    const result = matchAlerts([frame], 'D', nodes);
    expect(result.size).toBe(2);
    expect(result.get('dpm-people-api')).toEqual([{ alertname: 'HighErrorRate', severity: 'critical' }]);
    expect(result.get('dpm-order-api')).toEqual([{ alertname: 'HighLatency', severity: 'warning' }]);
  });

  it('matches by service_name (reverse lookup)', () => {
    const frame = makeAlertFrame('D', {
      alertnames: ['PodOOMKill'],
      serviceNames: ['PeopleService'],
    });
    const result = matchAlerts([frame], 'D', nodes);
    expect(result.size).toBe(1);
    expect(result.get('dpm-people-api')).toEqual([{ alertname: 'PodOOMKill', severity: undefined }]);
  });

  it('matches workload over service_name (priority)', () => {
    const frame = makeAlertFrame('D', {
      alertnames: ['Alert1'],
      workloads: ['redis'],
      serviceNames: ['PeopleService'],  // would match dpm-people-api but workload wins
    });
    const result = matchAlerts([frame], 'D', nodes);
    expect(result.size).toBe(1);
    expect(result.has('redis')).toBe(true);
  });

  it('gracefully ignores unmatched alerts', () => {
    const frame = makeAlertFrame('D', {
      alertnames: ['OrphanAlert'],
      workloads: ['nonexistent-workload'],
    });
    const result = matchAlerts([frame], 'D', nodes);
    expect(result.size).toBe(0);
  });

  it('accumulates multiple alerts for same node', () => {
    const frame = makeAlertFrame('D', {
      alertnames: ['Alert1', 'Alert2', 'Alert3'],
      workloads: ['redis', 'redis', 'redis'],
      severities: ['critical', 'warning', 'info'],
    });
    const result = matchAlerts([frame], 'D', nodes);
    expect(result.get('redis')).toHaveLength(3);
  });

  it('handles empty nodes gracefully', () => {
    const frame = makeAlertFrame('D', { alertnames: ['X'], workloads: ['y'] });
    const result = matchAlerts([frame], 'D', []);
    expect(result.size).toBe(0);
  });

  it('handles frame with no alertname field', () => {
    const frame: DataFrame = {
      refId: 'D',
      fields: [{ name: 'severity', type: FieldType.string, values: ['critical'], config: {} }],
      length: 1,
    };
    const result = matchAlerts([frame], 'D', nodes);
    expect(result.size).toBe(0);
  });
});
