/**
 * Tests for drill-down URL builders (modern Grafana panes schema).
 */
import { buildTracesDrillUrl, buildDbClientDrillUrl, buildLogsDrillUrl, buildDashboardUrl, buildExploreUrl, buildEdgeTracesDrillUrl } from './drilldown';
import { GraphNode } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: parse a modern explore URL into its panes object
// ─────────────────────────────────────────────────────────────────────────────

function parsePanesUrl(url: string): { schemaVersion: string; orgId: string; panes: any } {
  const qIndex = url.indexOf('?');
  const params = new URLSearchParams(url.substring(qIndex + 1));
  return {
    schemaVersion: params.get('schemaVersion')!,
    orgId: params.get('orgId')!,
    panes: JSON.parse(decodeURIComponent(params.get('panes')!)),
  };
}

describe('buildExploreUrl (shared helper)', () => {
  it('produces schemaVersion=1 and orgId=1 params', () => {
    const url = buildExploreUrl('uid-1', 'tempo', [
      { refId: 'A', queryType: 'traceql', query: '{}', datasource: { type: 'tempo', uid: 'uid-1' } },
    ]);
    expect(url).toContain('schemaVersion=1');
    expect(url).toContain('orgId=1');
    expect(url).toContain('panes=');
    expect(url).not.toContain('left=');
  });

  it('panes object contains datasource uid at pane level', () => {
    const url = buildExploreUrl('ds-uid', 'tempo', [
      { refId: 'A', queryType: 'traceql', query: '{}', datasource: { type: 'tempo', uid: 'ds-uid' } },
    ]);
    const { panes } = parsePanesUrl(url);
    expect(panes.svc.datasource).toBe('ds-uid');
  });

  it('each query carries nested datasource {type, uid}', () => {
    const url = buildExploreUrl('ds-uid', 'tempo', [
      { refId: 'A', queryType: 'traceql', query: '{}', datasource: { type: 'tempo', uid: 'ds-uid' } },
    ]);
    const { panes } = parsePanesUrl(url);
    expect(panes.svc.queries[0].datasource).toEqual({ type: 'tempo', uid: 'ds-uid' });
  });

  it('includes range in the pane', () => {
    const url = buildExploreUrl('uid', 'tempo', [
      { refId: 'A', datasource: { type: 'tempo', uid: 'uid' } },
    ], { from: 'now-6h', to: 'now' });
    const { panes } = parsePanesUrl(url);
    expect(panes.svc.range).toEqual({ from: 'now-6h', to: 'now' });
  });
});

describe('buildTracesDrillUrl', () => {
  const node: GraphNode = { id: 'dpm-api', inRate: 100, outRate: 50, totalRate: 150, serviceName: 'PeopleService', namespace: 'ns-api' };

  it('returns null when no datasource uid', () => {
    expect(buildTracesDrillUrl(node, '')).toBeNull();
  });

  it('returns null when no node id', () => {
    expect(buildTracesDrillUrl({ ...node, id: '' }, 'tempo-uid')).toBeNull();
  });

  it('builds explore URL with schemaVersion=1 and panes param', () => {
    const url = buildTracesDrillUrl(node, 'tempo-uid')!;
    expect(url).toContain('schemaVersion=1');
    expect(url).toContain('orgId=1');
    expect(url).toContain('panes=');
    expect(url).not.toContain('left=');
  });

  it('pane contains service name in TraceQL query', () => {
    const url = buildTracesDrillUrl(node, 'tempo-uid')!;
    const { panes } = parsePanesUrl(url);
    expect(panes.svc.queries[0].query).toContain('PeopleService');
    expect(panes.svc.queries[0].queryType).toBe('traceql');
  });

  it('pane has top-level datasource uid + nested datasource {type,uid}', () => {
    const url = buildTracesDrillUrl(node, 'tempo-uid')!;
    const { panes } = parsePanesUrl(url);
    expect(panes.svc.datasource).toBe('tempo-uid');
    expect(panes.svc.queries[0].datasource).toEqual({ type: 'tempo', uid: 'tempo-uid' });
  });

  it('falls back to node.id if serviceName absent', () => {
    const n: GraphNode = { id: 'worker', inRate: 0, outRate: 10, totalRate: 10 };
    const url = buildTracesDrillUrl(n, 'tempo-uid')!;
    const { panes } = parsePanesUrl(url);
    expect(panes.svc.queries[0].query).toContain('worker');
  });

  it('escapes special characters in TraceQL', () => {
    const n: GraphNode = { id: 'svc-"quoted"', inRate: 0, outRate: 10, totalRate: 10 };
    const url = buildTracesDrillUrl(n, 'uid')!;
    const { panes } = parsePanesUrl(url);
    expect(panes.svc.queries[0].query).toContain('svc-\\"quoted\\"');
  });
});

describe('buildDbClientDrillUrl', () => {
  const node: GraphNode = { id: 'postgres', inRate: 80, outRate: 0, totalRate: 80, isDatabase: true };

  it('returns null when no datasource uid', () => {
    expect(buildDbClientDrillUrl(node, '')).toBeNull();
  });

  it('builds explore URL with panes schema targeting db.system', () => {
    const url = buildDbClientDrillUrl(node, 'tempo-uid')!;
    expect(url).toContain('schemaVersion=1');
    expect(url).toContain('panes=');
    const { panes } = parsePanesUrl(url);
    expect(panes.svc.queries[0].query).toContain('db.system');
    expect(panes.svc.queries[0].query).toContain('postgres');
    expect(panes.svc.queries[0].datasource).toEqual({ type: 'tempo', uid: 'tempo-uid' });
  });
});

describe('buildEdgeTracesDrillUrl', () => {
  it('returns null when no datasource uid', () => {
    expect(buildEdgeTracesDrillUrl('src', 'tgt', '')).toBeNull();
  });

  it('produces correct panes URL with source/target in TraceQL', () => {
    const url = buildEdgeTracesDrillUrl('frontend', 'api-gw', 'tempo-uid')!;
    expect(url).toContain('schemaVersion=1');
    const { panes } = parsePanesUrl(url);
    const query = panes.svc.queries[0].query;
    expect(query).toContain('resource.service.name = "api-gw"');
    expect(query).toContain('span.client = "frontend"');
    expect(panes.svc.queries[0].datasource).toEqual({ type: 'tempo', uid: 'tempo-uid' });
  });

  it('escapes quotes in source/target', () => {
    const url = buildEdgeTracesDrillUrl('svc"a', 'svc"b', 'uid')!;
    const { panes } = parsePanesUrl(url);
    const query = panes.svc.queries[0].query;
    expect(query).toContain('svc\\"a');
    expect(query).toContain('svc\\"b');
  });
});

describe('buildLogsDrillUrl', () => {
  it('returns null when no datasource uid', () => {
    const node: GraphNode = { id: 'api', inRate: 0, outRate: 10, totalRate: 10, namespace: 'ns-x' };
    expect(buildLogsDrillUrl(node, '')).toBeNull();
  });

  it('builds URL with panes schema (loki datasource type)', () => {
    const node: GraphNode = { id: 'dpm-api', inRate: 50, outRate: 50, totalRate: 100, namespace: 'ns-api' };
    const url = buildLogsDrillUrl(node, 'loki-uid')!;
    expect(url).toContain('schemaVersion=1');
    expect(url).toContain('panes=');
    const { panes } = parsePanesUrl(url);
    expect(panes.svc.datasource).toBe('loki-uid');
    expect(panes.svc.queries[0].datasource).toEqual({ type: 'loki', uid: 'loki-uid' });
    expect(panes.svc.queries[0].expr).toContain('ns-api');
    expect(panes.svc.queries[0].expr).toContain('dpm-api');
  });

  it('uses app fallback when workload is unresolved', () => {
    const node: GraphNode = { id: 'app', inRate: 50, outRate: 0, totalRate: 50, namespace: 'ns-api', serviceName: 'MyService', unresolvedWorkload: true };
    const url = buildLogsDrillUrl(node, 'loki-uid')!;
    const { panes } = parsePanesUrl(url);
    expect(panes.svc.queries[0].expr).toContain('app=');
    expect(panes.svc.queries[0].expr).toContain('MyService');
  });

  it('works without namespace', () => {
    const node: GraphNode = { id: 'worker', inRate: 0, outRate: 10, totalRate: 10 };
    const url = buildLogsDrillUrl(node, 'loki-uid')!;
    const { panes } = parsePanesUrl(url);
    expect(panes.svc.queries[0].expr).toContain('worker');
  });

  it('uses serviceName when unresolved and no namespace', () => {
    const node: GraphNode = { id: 'app', inRate: 0, outRate: 10, totalRate: 10, serviceName: 'SvcFoo', unresolvedWorkload: true };
    const url = buildLogsDrillUrl(node, 'loki-uid')!;
    const { panes } = parsePanesUrl(url);
    expect(panes.svc.queries[0].expr).toContain('SvcFoo');
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

describe('escape hardening — control chars in node id (S-1)', () => {
  it('escapes quote, newline and CR so they cannot break out of the TraceQL literal', () => {
    const malicious: GraphNode = {
      id: 'svc"\n\rinjected',
      inRate: 0,
      outRate: 0,
      totalRate: 0,
    };
    const url = buildTracesDrillUrl(malicious, 'tempo-uid')!;
    const { panes } = parsePanesUrl(url);
    const q: string = panes.svc.queries[0].query;
    expect(q).toContain('\\"'); // double-quote escaped
    expect(q).toContain('\\n'); // newline escaped to literal backslash-n
    expect(q).toContain('\\r'); // CR escaped
    expect(q).not.toMatch(/\n/); // no raw newline survives
    expect(q).not.toMatch(/\r/); // no raw CR survives
  });
});
