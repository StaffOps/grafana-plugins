/**
 * Tests for drill-down URL builders.
 */
import { buildTracesDrillUrl, buildDbClientDrillUrl, buildLogsDrillUrl, buildDashboardUrl } from './drilldown';
import { GraphNode } from '../types';

describe('buildTracesDrillUrl', () => {
  const node: GraphNode = { id: 'dpm-api', inRate: 100, outRate: 50, totalRate: 150, serviceName: 'PeopleService', namespace: 'ns-api' };

  it('returns null when no datasource uid', () => {
    expect(buildTracesDrillUrl(node, '')).toBeNull();
  });

  it('returns null when no node id', () => {
    expect(buildTracesDrillUrl({ ...node, id: '' }, 'tempo-uid')).toBeNull();
  });

  it('builds explore URL with service_name', () => {
    const url = buildTracesDrillUrl(node, 'tempo-uid')!;
    expect(url).toContain('/explore?left=');
    expect(url).toContain('PeopleService');
    expect(url).toContain('tempo-uid');
  });

  it('falls back to node.id if serviceName absent', () => {
    const n: GraphNode = { id: 'worker', inRate: 0, outRate: 10, totalRate: 10 };
    const url = buildTracesDrillUrl(n, 'tempo-uid')!;
    expect(url).toContain('worker');
  });

  it('escapes special characters in TraceQL', () => {
    const n: GraphNode = { id: 'svc-"quoted"', inRate: 0, outRate: 10, totalRate: 10 };
    const url = buildTracesDrillUrl(n, 'uid')!;
    // URL-decode and check the JSON inside contains properly escaped quotes
    const decoded = decodeURIComponent(url.replace('/explore?left=', ''));
    const parsed = JSON.parse(decoded);
    expect(parsed.queries[0].query).toContain('svc-\\"quoted\\"');
  });
});

describe('buildDbClientDrillUrl', () => {
  const node: GraphNode = { id: 'postgres', inRate: 80, outRate: 0, totalRate: 80, isDatabase: true };

  it('returns null when no datasource uid', () => {
    expect(buildDbClientDrillUrl(node, '')).toBeNull();
  });

  it('builds explore URL targeting client spans with db.system', () => {
    const url = buildDbClientDrillUrl(node, 'tempo-uid')!;
    expect(url).toContain('/explore?left=');
    expect(url).toContain('db.system');
    expect(url).toContain('postgres');
  });
});

describe('buildLogsDrillUrl', () => {
  it('returns null when no datasource uid', () => {
    const node: GraphNode = { id: 'api', inRate: 0, outRate: 10, totalRate: 10, namespace: 'ns-x' };
    expect(buildLogsDrillUrl(node, '')).toBeNull();
  });

  it('builds URL with namespace + workload pod filter', () => {
    const node: GraphNode = { id: 'dpm-api', inRate: 50, outRate: 50, totalRate: 100, namespace: 'ns-api' };
    const url = buildLogsDrillUrl(node, 'loki-uid')!;
    expect(url).toContain('/explore?left=');
    expect(url).toContain('ns-api');
    expect(url).toContain('dpm-api');
    expect(url).toContain('loki-uid');
  });

  it('uses app fallback when workload is unresolved', () => {
    const node: GraphNode = { id: 'app', inRate: 50, outRate: 0, totalRate: 50, namespace: 'ns-api', serviceName: 'MyService', unresolvedWorkload: true };
    const url = buildLogsDrillUrl(node, 'loki-uid')!;
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain('app=');
    expect(decoded).toContain('MyService');
  });

  it('works without namespace', () => {
    const node: GraphNode = { id: 'worker', inRate: 0, outRate: 10, totalRate: 10 };
    const url = buildLogsDrillUrl(node, 'loki-uid')!;
    expect(url).toContain('worker');
  });

  it('uses serviceName when unresolved and no namespace', () => {
    const node: GraphNode = { id: 'app', inRate: 0, outRate: 10, totalRate: 10, serviceName: 'SvcFoo', unresolvedWorkload: true };
    const url = buildLogsDrillUrl(node, 'loki-uid')!;
    expect(url).toContain('SvcFoo');
  });
});

describe('buildDashboardUrl', () => {
  const node: GraphNode = { id: 'dpm-api', inRate: 50, outRate: 50, totalRate: 100, namespace: 'ns-api', serviceName: 'PeopleService' };

  it('returns null when no template', () => {
    expect(buildDashboardUrl(node, '')).toBeNull();
  });

  it('returns null when no node id', () => {
    expect(buildDashboardUrl({ ...node, id: '' }, '/d/abc')).toBeNull();
  });

  it('substitutes ${workload}', () => {
    const url = buildDashboardUrl(node, '/d/svc-overview?var-workload=${workload}')!;
    expect(url).toContain('var-workload=dpm-api');
  });

  it('substitutes ${namespace}', () => {
    const url = buildDashboardUrl(node, '/d/x?var-ns=${namespace}')!;
    expect(url).toContain('var-ns=ns-api');
  });

  it('substitutes ${serviceName}', () => {
    const url = buildDashboardUrl(node, '/d/x?var-svc=${serviceName}')!;
    expect(url).toContain('var-svc=PeopleService');
  });

  it('URL-encodes values', () => {
    const n: GraphNode = { id: 'svc with spaces', inRate: 0, outRate: 10, totalRate: 10, namespace: 'ns/special' };
    const url = buildDashboardUrl(n, '/d/x?w=${workload}&ns=${namespace}')!;
    expect(url).toContain('svc%20with%20spaces');
    expect(url).toContain('ns%2Fspecial');
  });
});
