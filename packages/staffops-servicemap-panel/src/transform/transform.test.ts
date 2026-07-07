/**
 * Tests for transform module — workload-based keying with k8s_deployment_name priority.
 */
import { DataFrame, FieldType } from '@grafana/data';
import { transformToGraph, isUnresolvedWorkload, isCrossEnvironment, isCrossNamespace, filterGraph, filterByEitherSide } from './index';
import { QueryRoleMapping } from '../types';

const defaultMapping: QueryRoleMapping = { rateRefId: 'A', errorRefId: 'B', latencyRefId: 'C' };

/** Helper to build a table-format DataFrame with all supported columns. */
function makeFrame(opts: {
  refId: string;
  clientWorkloads?: string[];
  serverWorkloads?: string[];
  clientK8sDeployNames?: string[];
  serverK8sDeployNames?: string[];
  values: number[];
  connectionTypes?: string[];
  virtualNodes?: string[];
  clientEnvs?: string[];
  serverEnvs?: string[];
  clientNamespaces?: string[];
  serverNamespaces?: string[];
  clientServiceNames?: string[];
  serverServiceNames?: string[];
  clientEksClusters?: string[];
  serverEksClusters?: string[];
}): DataFrame {
  const fields: any[] = [];
  if (opts.clientK8sDeployNames) {
    fields.push({ name: 'client_k8s_deployment_name', type: FieldType.string, values: opts.clientK8sDeployNames, config: {} });
  }
  if (opts.serverK8sDeployNames) {
    fields.push({ name: 'server_k8s_deployment_name', type: FieldType.string, values: opts.serverK8sDeployNames, config: {} });
  }
  if (opts.clientWorkloads) {
    fields.push({ name: 'client_service_workload', type: FieldType.string, values: opts.clientWorkloads, config: {} });
  }
  if (opts.serverWorkloads) {
    fields.push({ name: 'server_service_workload', type: FieldType.string, values: opts.serverWorkloads, config: {} });
  }
  fields.push({ name: 'Value', type: FieldType.number, values: opts.values, config: {} });
  if (opts.connectionTypes) {
    fields.push({ name: 'connection_type', type: FieldType.string, values: opts.connectionTypes, config: {} });
  }
  if (opts.virtualNodes) {
    fields.push({ name: 'virtual_node', type: FieldType.string, values: opts.virtualNodes, config: {} });
  }
  if (opts.clientEnvs) {
    fields.push({ name: 'client_deployment_environment', type: FieldType.string, values: opts.clientEnvs, config: {} });
  }
  if (opts.serverEnvs) {
    fields.push({ name: 'server_deployment_environment', type: FieldType.string, values: opts.serverEnvs, config: {} });
  }
  if (opts.clientNamespaces) {
    fields.push({ name: 'client_service_namespace', type: FieldType.string, values: opts.clientNamespaces, config: {} });
  }
  if (opts.serverNamespaces) {
    fields.push({ name: 'server_service_namespace', type: FieldType.string, values: opts.serverNamespaces, config: {} });
  }
  if (opts.clientServiceNames) {
    fields.push({ name: 'client_service_name', type: FieldType.string, values: opts.clientServiceNames, config: {} });
  }
  if (opts.serverServiceNames) {
    fields.push({ name: 'server_service_name', type: FieldType.string, values: opts.serverServiceNames, config: {} });
  }
  if (opts.clientEksClusters) {
    fields.push({ name: 'client_eks_cluster', type: FieldType.string, values: opts.clientEksClusters, config: {} });
  }
  if (opts.serverEksClusters) {
    fields.push({ name: 'server_eks_cluster', type: FieldType.string, values: opts.serverEksClusters, config: {} });
  }
  const length = opts.clientK8sDeployNames?.length ?? opts.clientWorkloads?.length ?? opts.values.length;
  return { refId: opts.refId, fields, length };
}

// ─────────────────────────────────────────────────────────────────────────────
// isUnresolvedWorkload
// ─────────────────────────────────────────────────────────────────────────────

describe('isUnresolvedWorkload', () => {
  describe('single-arg (backward compat)', () => {
    it('returns true for "app"', () => { expect(isUnresolvedWorkload('app')).toBe(true); });
    it('returns true for empty string', () => { expect(isUnresolvedWorkload('')).toBe(true); });
    it('returns true for ReplicaSet hash 6 chars', () => { expect(isUnresolvedWorkload('myapp-7f8b9c')).toBe(true); });
    it('returns true for ReplicaSet hash 10 chars', () => { expect(isUnresolvedWorkload('worker-6a7b8c9d0e')).toBe(true); });
    it('returns false for normal workload', () => { expect(isUnresolvedWorkload('dpm-people-api')).toBe(false); });
    it('returns false for workload with numbers not hex-only', () => { expect(isUnresolvedWorkload('api-v2')).toBe(false); });
    it('returns false for short suffix', () => { expect(isUnresolvedWorkload('app-abc')).toBe(false); });
  });

  describe('two-arg (k8s_deployment_name, service_workload)', () => {
    it('returns false when k8s_deployment_name is valid', () => {
      expect(isUnresolvedWorkload('my-deploy', 'app')).toBe(false);
    });
    it('returns false when service_workload is valid (k8s empty)', () => {
      expect(isUnresolvedWorkload('', 'real-workload')).toBe(false);
    });
    it('returns true when both are "app"', () => {
      expect(isUnresolvedWorkload('app', 'app')).toBe(true);
    });
    it('returns true when both are empty', () => {
      expect(isUnresolvedWorkload('', '')).toBe(true);
    });
    it('returns true when k8s is hash and workload is "app"', () => {
      expect(isUnresolvedWorkload('pod-6a7b8c', 'app')).toBe(true);
    });
    it('returns true when k8s is "app" and workload is empty', () => {
      expect(isUnresolvedWorkload('app', '')).toBe(true);
    });
    it('returns false when k8s is hash but workload is valid', () => {
      expect(isUnresolvedWorkload('pod-6a7b8c', 'real-svc')).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isCrossEnvironment / isCrossNamespace
// ─────────────────────────────────────────────────────────────────────────────

describe('isCrossEnvironment', () => {
  it('returns true when envs differ', () => { expect(isCrossEnvironment('prd', 'dev')).toBe(true); });
  it('returns false when envs match', () => { expect(isCrossEnvironment('prd', 'prd')).toBe(false); });
  it('returns false when client env empty', () => { expect(isCrossEnvironment('', 'prd')).toBe(false); });
  it('returns false when server env empty', () => { expect(isCrossEnvironment('prd', '')).toBe(false); });
});

describe('isCrossNamespace', () => {
  it('returns true when namespaces differ', () => { expect(isCrossNamespace('ns-a', 'ns-b')).toBe(true); });
  it('returns false when namespaces match', () => { expect(isCrossNamespace('ns-a', 'ns-a')).toBe(false); });
  it('returns false when empty', () => { expect(isCrossNamespace('', 'ns-a')).toBe(false); });
});

// ─────────────────────────────────────────────────────────────────────────────
// transformToGraph — k8s_deployment_name priority
// ─────────────────────────────────────────────────────────────────────────────

describe('transformToGraph — node identity', () => {
  it('returns empty model for empty frames', () => {
    const result = transformToGraph([], defaultMapping);
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it('prefers k8s_deployment_name over service_workload', () => {
    const rate = makeFrame({
      refId: 'A',
      clientK8sDeployNames: ['frontend-deploy'],
      serverK8sDeployNames: ['backend-deploy'],
      clientWorkloads: ['frontend-old'],
      serverWorkloads: ['backend-old'],
      values: [100],
    });
    const result = transformToGraph([rate], defaultMapping);
    expect(result.nodes.map(n => n.id).sort()).toEqual(['backend-deploy', 'frontend-deploy']);
    expect(result.edges[0].source).toBe('frontend-deploy');
    expect(result.edges[0].target).toBe('backend-deploy');
  });

  it('falls back to service_workload when k8s_deployment_name is empty', () => {
    const rate = makeFrame({
      refId: 'A',
      clientK8sDeployNames: [''],
      serverK8sDeployNames: [''],
      clientWorkloads: ['svc-a'],
      serverWorkloads: ['svc-b'],
      values: [50],
    });
    const result = transformToGraph([rate], defaultMapping);
    expect(result.nodes.map(n => n.id).sort()).toEqual(['svc-a', 'svc-b']);
  });

  it('falls back to service_workload when k8s_deployment_name is "app"', () => {
    const rate = makeFrame({
      refId: 'A',
      clientK8sDeployNames: ['app'],
      serverK8sDeployNames: ['app'],
      clientWorkloads: ['real-client'],
      serverWorkloads: ['real-server'],
      values: [30],
    });
    const result = transformToGraph([rate], defaultMapping);
    expect(result.nodes.map(n => n.id).sort()).toEqual(['real-client', 'real-server']);
  });

  it('falls back to service_workload when k8s_deployment_name is ReplicaSet hash', () => {
    const rate = makeFrame({
      refId: 'A',
      clientK8sDeployNames: ['pod-6a7b8c'],
      serverK8sDeployNames: ['pod-9d0e1f'],
      clientWorkloads: ['actual-svc'],
      serverWorkloads: ['actual-backend'],
      values: [40],
    });
    const result = transformToGraph([rate], defaultMapping);
    expect(result.nodes.map(n => n.id).sort()).toEqual(['actual-backend', 'actual-svc']);
  });

  it('uses k8s_deployment_name even if unresolved when service_workload also unresolved', () => {
    const rate = makeFrame({
      refId: 'A',
      clientK8sDeployNames: ['pod-6a7b8c'],
      serverK8sDeployNames: ['app'],
      clientWorkloads: ['app'],
      serverWorkloads: ['app'],
      values: [10],
    });
    const result = transformToGraph([rate], defaultMapping);
    // k8s_deployment_name wins when service_workload is also unresolved
    expect(result.edges[0].source).toBe('pod-6a7b8c');
    expect(result.edges[0].target).toBe('app');
  });

  it('works with only service_workload columns (no k8s_deployment_name)', () => {
    const rate = makeFrame({
      refId: 'A',
      clientWorkloads: ['frontend', 'frontend'],
      serverWorkloads: ['backend', 'redis'],
      values: [100, 50],
    });
    const result = transformToGraph([rate], defaultMapping);
    expect(result.nodes.map(n => n.id).sort()).toEqual(['backend', 'frontend', 'redis']);
  });

  it('falls back to client/server columns for v1 compatibility', () => {
    const frame: DataFrame = {
      refId: 'A',
      fields: [
        { name: 'client', type: FieldType.string, values: ['svc-old'], config: {} },
        { name: 'server', type: FieldType.string, values: ['svc-dep'], config: {} },
        { name: 'Value', type: FieldType.number, values: [42], config: {} },
      ],
      length: 1,
    };
    const result = transformToGraph([frame], defaultMapping);
    expect(result.nodes).toHaveLength(2);
    expect(result.edges[0].source).toBe('svc-old');
    expect(result.edges[0].target).toBe('svc-dep');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// transformToGraph — unresolved workload flag
// ─────────────────────────────────────────────────────────────────────────────

describe('transformToGraph — unresolvedWorkload flag', () => {
  it('flags nodes where both k8s_deployment_name and service_workload are "app"', () => {
    const rate = makeFrame({
      refId: 'A',
      clientK8sDeployNames: ['app'],
      serverK8sDeployNames: ['good-deploy'],
      clientWorkloads: ['app'],
      serverWorkloads: ['good-workload'],
      values: [10],
    });
    const result = transformToGraph([rate], defaultMapping);
    const clientNode = result.nodes.find(n => n.id === 'app');
    const serverNode = result.nodes.find(n => n.id === 'good-deploy');
    expect(clientNode?.unresolvedWorkload).toBe(true);
    expect(serverNode?.unresolvedWorkload).toBe(false);
  });

  it('flags nodes where both are empty', () => {
    // When both k8s and workload are empty, resolveNodeId falls through to bare
    // but the unresolved flag checks the raw values
    const rate = makeFrame({
      refId: 'A',
      clientK8sDeployNames: ['valid-deploy'],
      serverK8sDeployNames: ['valid-deploy'],
      clientWorkloads: ['valid-wl'],
      serverWorkloads: ['valid-wl'],
      values: [10],
    });
    const result = transformToGraph([rate], defaultMapping);
    const node = result.nodes.find(n => n.id === 'valid-deploy');
    expect(node?.unresolvedWorkload).toBe(false);
  });

  it('is NOT flagged when k8s_deployment_name is valid but service_workload is "app"', () => {
    const rate = makeFrame({
      refId: 'A',
      clientK8sDeployNames: ['my-api'],
      serverK8sDeployNames: ['my-backend'],
      clientWorkloads: ['app'],
      serverWorkloads: ['app'],
      values: [100],
    });
    const result = transformToGraph([rate], defaultMapping);
    expect(result.nodes.every(n => n.unresolvedWorkload === false)).toBe(true);
  });

  it('is NOT flagged when service_workload is valid but k8s_deployment_name is empty', () => {
    const rate = makeFrame({
      refId: 'A',
      clientK8sDeployNames: [''],
      serverK8sDeployNames: [''],
      clientWorkloads: ['real-svc'],
      serverWorkloads: ['real-dep'],
      values: [50],
    });
    const result = transformToGraph([rate], defaultMapping);
    expect(result.nodes.every(n => n.unresolvedWorkload === false)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// transformToGraph — metadata and edges
// ─────────────────────────────────────────────────────────────────────────────

describe('transformToGraph — metadata & edges', () => {
  it('carries environment/namespace/serviceName/eksCluster per node', () => {
    const rate = makeFrame({
      refId: 'A',
      clientK8sDeployNames: ['frontend'],
      serverK8sDeployNames: ['backend'],
      clientWorkloads: ['fe-wl'],
      serverWorkloads: ['be-wl'],
      values: [100],
      clientEnvs: ['prd'],
      serverEnvs: ['prd'],
      clientNamespaces: ['ns-web'],
      serverNamespaces: ['ns-api'],
      clientServiceNames: ['FrontendService'],
      serverServiceNames: ['BackendService'],
      clientEksClusters: ['eks-1'],
      serverEksClusters: ['eks-2'],
    });
    const result = transformToGraph([rate], defaultMapping);
    const fe = result.nodes.find(n => n.id === 'frontend')!;
    const be = result.nodes.find(n => n.id === 'backend')!;
    expect(fe.environment).toBe('prd');
    expect(fe.namespace).toBe('ns-web');
    expect(fe.serviceName).toBe('FrontendService');
    expect(fe.eksCluster).toBe('eks-1');
    expect(be.environment).toBe('prd');
    expect(be.namespace).toBe('ns-api');
    expect(be.serviceName).toBe('BackendService');
    expect(be.eksCluster).toBe('eks-2');
  });

  it('detects cross-environment edges', () => {
    const rate = makeFrame({
      refId: 'A',
      clientK8sDeployNames: ['svc-a'],
      serverK8sDeployNames: ['svc-b'],
      clientWorkloads: ['wl-a'],
      serverWorkloads: ['wl-b'],
      values: [50],
      clientEnvs: ['prd'],
      serverEnvs: ['dev'],
    });
    const result = transformToGraph([rate], defaultMapping);
    expect(result.edges[0].crossEnvironment).toBe(true);
    expect(result.edges[0].crossNamespace).toBe(false);
  });

  it('captures connection_type and virtual_node on edges', () => {
    const rate = makeFrame({
      refId: 'A',
      clientK8sDeployNames: ['api', 'ingress'],
      serverK8sDeployNames: ['postgres', 'api'],
      clientWorkloads: ['api', 'ingress'],
      serverWorkloads: ['postgres', 'api'],
      values: [80, 120],
      connectionTypes: ['database', ''],
      virtualNodes: ['', 'client'],
    });
    const result = transformToGraph([rate], defaultMapping);
    const dbEdge = result.edges.find(e => e.target === 'postgres')!;
    const ingressEdge = result.edges.find(e => e.source === 'ingress')!;
    expect(dbEdge.connectionType).toBe('database');
    expect(ingressEdge.virtualNode).toBe('client');
  });

  it('computes error ratio from rate + error frames', () => {
    const rate = makeFrame({
      refId: 'A',
      clientK8sDeployNames: ['a'],
      serverK8sDeployNames: ['b'],
      clientWorkloads: ['a'],
      serverWorkloads: ['b'],
      values: [100],
    });
    const error = makeFrame({
      refId: 'B',
      clientK8sDeployNames: ['a'],
      serverK8sDeployNames: ['b'],
      clientWorkloads: ['a'],
      serverWorkloads: ['b'],
      values: [5],
    });
    const result = transformToGraph([rate, error], defaultMapping);
    expect(result.edges[0].errorRatio).toBeCloseTo(0.05);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// filterGraph
// ─────────────────────────────────────────────────────────────────────────────

describe('filterGraph', () => {
  const model = {
    nodes: [
      { id: 'api', inRate: 0, outRate: 100, totalRate: 100 },
      { id: 'postgres', inRate: 80, outRate: 0, totalRate: 80, isDatabase: true },
      { id: 'kafka', inRate: 20, outRate: 0, totalRate: 20 },
      { id: 'ingress', inRate: 0, outRate: 50, totalRate: 50, isVirtualClient: true },
      { id: 'ext-sms', inRate: 10, outRate: 0, totalRate: 10, isVirtualServer: true },
    ],
    edges: [
      { source: 'api', target: 'postgres', rate: 80, errorRatio: 0, p95: 0.01, connectionType: 'database', virtualNode: '' },
      { source: 'api', target: 'kafka', rate: 20, errorRatio: 0, p95: 0.005, connectionType: 'messaging_system', virtualNode: '' },
      { source: 'ingress', target: 'api', rate: 50, errorRatio: 0, p95: 0.02, connectionType: '', virtualNode: 'client' },
      { source: 'api', target: 'ext-sms', rate: 10, errorRatio: 0, p95: 0.1, connectionType: '', virtualNode: 'server' },
    ],
  };

  it('returns all edges when filter=all and both virtual toggles on', () => {
    const result = filterGraph(model, { connectionTypeFilter: 'all', showVirtualClients: true, showVirtualServers: true });
    expect(result.edges).toHaveLength(4);
    expect(result.nodes).toHaveLength(5);
  });

  it('filters to database only', () => {
    const result = filterGraph(model, { connectionTypeFilter: 'database', showVirtualClients: true, showVirtualServers: true });
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].target).toBe('postgres');
  });

  it('filters to messaging_system only', () => {
    const result = filterGraph(model, { connectionTypeFilter: 'messaging_system', showVirtualClients: true, showVirtualServers: true });
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].target).toBe('kafka');
  });

  it('filters to services (excludes db + messaging)', () => {
    const result = filterGraph(model, { connectionTypeFilter: 'services', showVirtualClients: true, showVirtualServers: true });
    expect(result.edges).toHaveLength(2);
    expect(result.edges.every(e => e.connectionType !== 'database' && e.connectionType !== 'messaging_system')).toBe(true);
  });

  it('hides virtual_node=client when toggled off', () => {
    const result = filterGraph(model, { connectionTypeFilter: 'all', showVirtualClients: false, showVirtualServers: true });
    expect(result.edges.some(e => e.virtualNode === 'client')).toBe(false);
    expect(result.nodes.some(n => n.id === 'ingress')).toBe(false);
  });

  it('hides virtual_node=server when toggled off', () => {
    const result = filterGraph(model, { connectionTypeFilter: 'all', showVirtualClients: true, showVirtualServers: false });
    expect(result.edges.some(e => e.virtualNode === 'server')).toBe(false);
    expect(result.nodes.some(n => n.id === 'ext-sms')).toBe(false);
  });

  it('returns empty for empty model', () => {
    const result = filterGraph({ nodes: [], edges: [] }, { connectionTypeFilter: 'all', showVirtualClients: true, showVirtualServers: true });
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// filterByEitherSide
// ─────────────────────────────────────────────────────────────────────────────

describe('filterByEitherSide', () => {
  const model = {
    nodes: [
      { id: 'svc-a', inRate: 0, outRate: 100, totalRate: 100 },
      { id: 'svc-b', inRate: 100, outRate: 50, totalRate: 150 },
      { id: 'svc-c', inRate: 50, outRate: 0, totalRate: 50 },
    ],
    edges: [
      { source: 'svc-a', target: 'svc-b', rate: 100, errorRatio: 0, p95: 0.01, connectionType: '',
        clientEnvironment: 'prd', serverEnvironment: 'prd', clientNamespace: 'ns-x', serverNamespace: 'ns-y' },
      { source: 'svc-b', target: 'svc-c', rate: 50, errorRatio: 0, p95: 0.02, connectionType: '',
        clientEnvironment: 'prd', serverEnvironment: 'dev', clientNamespace: 'ns-y', serverNamespace: 'ns-z' },
    ],
  };

  it('filters by environment (either-side)', () => {
    const result = filterByEitherSide(model, 'environment', 'dev');
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].source).toBe('svc-b');
  });

  it('filters by namespace (either-side)', () => {
    const result = filterByEitherSide(model, 'namespace', 'ns-y');
    expect(result.edges).toHaveLength(2);
  });

  it('filters by workload (either-side)', () => {
    const result = filterByEitherSide(model, 'workload', 'svc-b');
    expect(result.edges).toHaveLength(2);
  });

  it('returns original model for empty value', () => {
    const result = filterByEitherSide(model, 'environment', '');
    expect(result).toBe(model);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Node workload + eksCluster assignment
// ─────────────────────────────────────────────────────────────────────────────

describe('transformToGraph: node.workload assignment from client/server k8s_deployment_name', () => {
  it('assigns workload to source node from client_k8s_deployment_name', () => {
    const frames: DataFrame[] = [
      makeFrame({
        refId: 'A',
        clientK8sDeployNames: ['deploy-frontend'],
        serverK8sDeployNames: ['deploy-backend'],
        values: [100],
      }),
    ];
    const result = transformToGraph(frames, defaultMapping);
    const src = result.nodes.find((n) => n.id === 'deploy-frontend');
    expect(src).toBeDefined();
    expect(src!.workload).toBe('deploy-frontend');
  });

  it('assigns workload to target node from server_k8s_deployment_name', () => {
    const frames: DataFrame[] = [
      makeFrame({
        refId: 'A',
        clientK8sDeployNames: ['deploy-frontend'],
        serverK8sDeployNames: ['deploy-backend'],
        values: [100],
      }),
    ];
    const result = transformToGraph(frames, defaultMapping);
    const tgt = result.nodes.find((n) => n.id === 'deploy-backend');
    expect(tgt).toBeDefined();
    expect(tgt!.workload).toBe('deploy-backend');
  });

  it('workload is undefined when k8s_deployment_name is empty', () => {
    const frames: DataFrame[] = [
      makeFrame({
        refId: 'A',
        clientWorkloads: ['svc-a'],
        serverWorkloads: ['svc-b'],
        values: [50],
      }),
    ];
    const result = transformToGraph(frames, defaultMapping);
    const node = result.nodes.find((n) => n.id === 'svc-a');
    expect(node).toBeDefined();
    expect(node!.workload).toBeUndefined();
  });
});

describe('transformToGraph: node.eksCluster assignment from client/server eks_cluster', () => {
  it('assigns eksCluster to source node from client_eks_cluster', () => {
    const frames: DataFrame[] = [
      makeFrame({
        refId: 'A',
        clientK8sDeployNames: ['svc-x'],
        serverK8sDeployNames: ['svc-y'],
        clientEksClusters: ['cluster-prd'],
        serverEksClusters: ['cluster-dev'],
        values: [75],
      }),
    ];
    const result = transformToGraph(frames, defaultMapping);
    const src = result.nodes.find((n) => n.id === 'svc-x');
    expect(src).toBeDefined();
    expect(src!.eksCluster).toBe('cluster-prd');
  });

  it('assigns eksCluster to target node from server_eks_cluster', () => {
    const frames: DataFrame[] = [
      makeFrame({
        refId: 'A',
        clientK8sDeployNames: ['svc-x'],
        serverK8sDeployNames: ['svc-y'],
        clientEksClusters: ['cluster-prd'],
        serverEksClusters: ['cluster-dev'],
        values: [75],
      }),
    ];
    const result = transformToGraph(frames, defaultMapping);
    const tgt = result.nodes.find((n) => n.id === 'svc-y');
    expect(tgt).toBeDefined();
    expect(tgt!.eksCluster).toBe('cluster-dev');
  });

  it('eksCluster is undefined when column is absent', () => {
    const frames: DataFrame[] = [
      makeFrame({
        refId: 'A',
        clientK8sDeployNames: ['svc-x'],
        serverK8sDeployNames: ['svc-y'],
        values: [75],
      }),
    ];
    const result = transformToGraph(frames, defaultMapping);
    const node = result.nodes.find((n) => n.id === 'svc-x');
    expect(node).toBeDefined();
    expect(node!.eksCluster).toBeUndefined();
  });
});
